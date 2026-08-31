// api/usuarios.js — Gestión de usuarios SOLO desde el servidor (rol admin).
// Reemplaza los insert/update directos a `usuarios` desde App.js, que además
// guardaban la contraseña en texto plano. Con esto, la tabla puede blindarse
// por RLS (etapa 1 de docs/migracion-seguridad.sql) sin romper el panel.
//
// POST + Authorization: Bearer <token de /api/login, rol admin>
//   { accion:'crear',      usuario:{nombre,email,password,rol} }
//   { accion:'actualizar', id, cambios:{nombre?,email?,rol?,password?} }
//   { accion:'activo',     id, activo:true|false }
// → { ok:true, usuario? } | { ok:false, error }
// Las contraseñas siempre se guardan hasheadas (scrypt). Nunca se devuelven.

const { getSbAdmin, hashPassword, requiereRol, rateLimitOk, ipDeReq } = require('./_lib/seguridad');

const ROLES = ['admin', 'recep', 'prof'];
const sinHash = u => { if (u) delete u.password_hash; return u; };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const auth = requiereRol(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (!rateLimitOk(`usuarios:${ipDeReq(req)}`, 30, 60000)) {
    return res.status(429).json({ ok: false, error: 'Demasiadas operaciones. Espera un minuto.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const sb = getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  try {
    if (body.accion === 'listar') {
      const { data, error } = await sb.from('usuarios')
        .select('id,nombre,email,rol,activo').order('nombre');
      if (error) return res.status(500).json({ ok: false, error: 'No se pudo listar: ' + error.message });
      return res.status(200).json({ ok: true, usuarios: data || [] });
    }

    if (body.accion === 'crear') {
      const u = body.usuario || {};
      const nombre = String(u.nombre || '').trim();
      const email = String(u.email || '').trim().toLowerCase();
      const password = String(u.password || '');
      const rol = ROLES.includes(u.rol) ? u.rol : null;
      if (!nombre || !email || !password || !rol)
        return res.status(400).json({ ok: false, error: 'Nombre, email, contraseña y rol son requeridos' });
      const { data, error } = await sb.from('usuarios')
        .insert({ nombre, email, rol, activo: true, password_hash: hashPassword(password) })
        .select('id,nombre,email,rol,activo').single();
      if (error) return res.status(500).json({ ok: false, error: 'No se pudo crear: ' + error.message });
      return res.status(200).json({ ok: true, usuario: sinHash(data) });
    }

    if (body.accion === 'actualizar') {
      if (!body.id) return res.status(400).json({ ok: false, error: 'Falta id' });
      const c = body.cambios || {};
      const upd = {};
      if (c.nombre) upd.nombre = String(c.nombre).trim();
      if (c.email) upd.email = String(c.email).trim().toLowerCase();
      if (c.rol) {
        if (!ROLES.includes(c.rol)) return res.status(400).json({ ok: false, error: 'Rol inválido' });
        upd.rol = c.rol;
      }
      if (c.password) upd.password_hash = hashPassword(String(c.password));
      if (!Object.keys(upd).length) return res.status(400).json({ ok: false, error: 'Sin cambios' });
      const { data, error } = await sb.from('usuarios').update(upd).eq('id', body.id)
        .select('id,nombre,email,rol,activo').single();
      if (error) return res.status(500).json({ ok: false, error: 'No se pudo actualizar: ' + error.message });
      return res.status(200).json({ ok: true, usuario: sinHash(data) });
    }

    if (body.accion === 'activo') {
      if (!body.id) return res.status(400).json({ ok: false, error: 'Falta id' });
      if (body.id === auth.usuario.uid && body.activo === false)
        return res.status(400).json({ ok: false, error: 'No puedes desactivar tu propia cuenta' });
      const { data, error } = await sb.from('usuarios').update({ activo: !!body.activo }).eq('id', body.id)
        .select('id,nombre,email,rol,activo').single();
      if (error) return res.status(500).json({ ok: false, error: 'No se pudo cambiar el estado: ' + error.message });
      return res.status(200).json({ ok: true, usuario: sinHash(data) });
    }

    return res.status(400).json({ ok: false, error: 'Acción desconocida' });
  } catch (e) {
    console.error('usuarios throw:', e);
    return res.status(500).json({ ok: false, error: 'Error interno' });
  }
};
