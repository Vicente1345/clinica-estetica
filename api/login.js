// api/login.js — Autenticación en el servidor (reemplaza la consulta directa a
// `usuarios` desde el navegador, que comparaba contraseñas en texto plano).
//
// POST { email, password } →
//   200 { ok:true, token, usuario:{id,nombre,email,rol} }
//   401 { ok:false, error }  (mensaje idéntico para "no existe" y "no coincide")
//   429 { ok:false, error }  (rate limit)
//   503 { ok:false, error }  (SESSION_SECRET sin configurar)
//
// Upgrade-on-login: si la fila aún guarda la contraseña en texto plano y el
// login es correcto, se re-guarda hasheada con scrypt en el acto. Así los
// usuarios existentes migran solos, sin migración big-bang.

const { getSbAdmin, verificarPassword, hashPassword, crearToken, rateLimitOk, ipDeReq } = require('./_lib/seguridad');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  if (!process.env.SESSION_SECRET) {
    return res.status(503).json({ ok: false, error: 'Autenticación no configurada (falta SESSION_SECRET en Vercel).' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });

  // Rate limit: por IP y por IP+email (frena fuerza bruta y enumeración)
  const ip = ipDeReq(req);
  if (!rateLimitOk(`login:${ip}`, 10, 60000) || !rateLimitOk(`login:${ip}:${email}`, 5, 60000)) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera un minuto.' });
  }

  const sb = getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  const { data: u, error } = await sb
    .from('usuarios')
    .select('id,nombre,email,rol,activo,password_hash')
    .eq('email', email)
    .eq('activo', true)
    .maybeSingle();

  // Verificación aunque no exista el usuario: latencia comparable en ambos
  // casos y respuesta idéntica → no se puede enumerar emails.
  const almacenado = u ? u.password_hash : 'scrypt:16384:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  const v = verificarPassword(password, almacenado);

  if (error || !u || !v.ok) {
    console.log(`[login] fallo email=${email} ip=${ip}`);
    return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos' });
  }

  // Upgrade-on-login de contraseñas legacy en texto plano
  if (v.esLegacy) {
    const { error: eUp } = await sb.from('usuarios')
      .update({ password_hash: hashPassword(password) })
      .eq('id', u.id);
    if (eUp) console.error('[login] no se pudo re-hashear la contraseña legacy:', eUp.message);
    else console.log(`[login] contraseña migrada a scrypt para ${email}`);
  }

  const token = crearToken({ uid: u.id, nombre: u.nombre, rol: u.rol });
  return res.status(200).json({
    ok: true,
    token,
    usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
  });
};
