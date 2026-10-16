// api/_lib/seguridad.js — Utilidades de seguridad compartidas por los endpoints.
//
// Cubre cuatro necesidades del saneamiento (spec v4, §1.3 S3-S5, S8):
//   1. Cliente Supabase con service_role en el servidor (getSbAdmin). La anon
//      key queda solo como fallback mientras no exista la env var, para no
//      romper el despliegue actual; con RLS estricto el fallback deja de servir.
//   2. Hash de contraseñas con scrypt (crypto nativo de Node: sin dependencias
//      nuevas). Soporta verificación de contraseñas legacy en texto plano para
//      poder migrarlas al primer login exitoso (upgrade-on-login).
//   3. Tokens de sesión firmados (HMAC-SHA256) con expiración. El cliente ya no
//      es dueño de su rol: el servidor lo lee del token, no de sessionStorage.
//   4. Rate limiting best-effort en memoria por instancia serverless. No es una
//      garantía global (cada instancia tiene su propio contador) pero corta los
//      abusos de ráfaga; el límite duro global puede agregarse después con una
//      tabla si hace falta.
//
// Variables de entorno:
//   SUPABASE_SERVICE_ROLE_KEY  — clave service_role (Supabase → API Keys). Solo servidor.
//   SESSION_SECRET             — secreto largo aleatorio para firmar tokens.

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase admin ────────────────────────────────────────────────
// Valores de entorno con trim(): un espacio o salto de línea al pegar la
// clave en Vercel basta para que Supabase la rechace.
let _sbAdminCache = null;
async function getSbAdmin() {
  if (_sbAdminCache) return _sbAdminCache;
  const url = (process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anon = (process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!url) return null;
  const opts = { auth: { persistSession: false } };
  if (service) {
    // Se verifica la clave con una consulta mínima: si Supabase la rechaza,
    // se cae a la anon key (mientras RLS siga abierta tiene el mismo acceso
    // que el login antiguo) en vez de dejar a todo el equipo sin poder entrar.
    try {
      const c = createClient(url, service, opts);
      const { error } = await c.from('boxes').select('id').limit(1);
      if (!error) { _sbAdminCache = c; return c; }
      console.error('seguridad: Supabase RECHAZA SUPABASE_SERVICE_ROLE_KEY (' + error.message + '); usando anon key como respaldo. Corregir la variable en Vercel.');
    } catch (e) {
      console.error('seguridad: SUPABASE_SERVICE_ROLE_KEY inválida (' + e.message + '); usando anon key como respaldo. Corregir la variable en Vercel.');
    }
  } else {
    console.warn('seguridad: SUPABASE_SERVICE_ROLE_KEY no configurada; usando anon key (fallback). Con RLS estricto esto dejará de funcionar.');
  }
  // El fallback NO se cachea: si el rechazo de la service key fue transitorio
  // (timeout, hipo de red), la siguiente llamada vuelve a intentarla en vez de
  // dejar la instancia pegada en anon (que con RLS cerrada no sirve de nada).
  const fallback = createClient(url, anon, opts);
  fallback.__fallbackAnon = true;
  return fallback;
}

// ─── Contraseñas (scrypt) ──────────────────────────────────────────
const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, SCRYPT_LEN = 32;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${SCRYPT_N}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

function esHashScrypt(valor) {
  return typeof valor === 'string' && valor.startsWith('scrypt:');
}

// Compara en tiempo constante. Devuelve { ok, esLegacy } — esLegacy=true cuando
// la fila aún guarda la contraseña en texto plano y conviene re-hashearla.
function verificarPassword(password, almacenado) {
  if (!almacenado) return { ok: false, esLegacy: false };
  if (esHashScrypt(almacenado)) {
    try {
      const [, nStr, saltB64, hashB64] = almacenado.split(':');
      const salt = Buffer.from(saltB64, 'base64');
      const esperado = Buffer.from(hashB64, 'base64');
      const calculado = crypto.scryptSync(String(password), salt, esperado.length, { N: Number(nStr), r: SCRYPT_R, p: SCRYPT_P });
      return { ok: crypto.timingSafeEqual(esperado, calculado), esLegacy: false };
    } catch (e) {
      return { ok: false, esLegacy: false };
    }
  }
  // Legacy: texto plano. Comparación en tiempo constante sobre buffers.
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(almacenado));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, esLegacy: true };
}

// ─── Tokens de sesión ──────────────────────────────────────────────
const b64u = buf => Buffer.from(buf).toString('base64url');

function crearToken(payload, ttlSegundos = 12 * 3600) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const cuerpo = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSegundos }));
  const firma = crypto.createHmac('sha256', secret).update(cuerpo).digest('base64url');
  return `v1.${cuerpo}.${firma}`;
}

function verificarToken(token) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return null;
  const esperada = crypto.createHmac('sha256', secret).update(partes[1]).digest('base64url');
  const a = Buffer.from(partes[2]), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function usuarioDesdeReq(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return token ? verificarToken(token) : null;
}

// Exige un usuario autenticado con alguno de los roles dados.
// Devuelve { ok:true, usuario } o { ok:false, status, error }.
function requiereRol(req, roles) {
  if (!process.env.SESSION_SECRET) {
    return { ok: false, status: 503, error: 'Autenticación no configurada en el servidor (SESSION_SECRET).' };
  }
  const usuario = usuarioDesdeReq(req);
  if (!usuario) return { ok: false, status: 401, error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' };
  if (roles && roles.length && !roles.includes(usuario.rol)) {
    return { ok: false, status: 403, error: 'No tienes permisos para esta acción.' };
  }
  return { ok: true, usuario };
}

// ─── Rate limiting best-effort (por instancia) ─────────────────────
const _ventanas = new Map();
function rateLimitOk(clave, max, ventanaMs) {
  const ahora = Date.now();
  const v = _ventanas.get(clave);
  if (!v || ahora - v.inicio > ventanaMs) {
    _ventanas.set(clave, { inicio: ahora, n: 1 });
    if (_ventanas.size > 5000) {
      for (const [k, w] of _ventanas) if (ahora - w.inicio > ventanaMs) _ventanas.delete(k);
    }
    return true;
  }
  v.n++;
  return v.n <= max;
}

function ipDeReq(req) {
  const xf = req.headers['x-forwarded-for'];
  return (typeof xf === 'string' && xf.split(',')[0].trim()) || req.socket?.remoteAddress || 'desconocida';
}

// ─── Tiempo Chile ──────────────────────────────────────────────────
// Horas que faltan (con decimales) hasta fecha+hora interpretadas en hora de
// Chile continental, correcta en invierno y verano (America/Santiago).
function horasHastaChile(fecha, hora) {
  if (!fecha || !hora) return NaN;
  const ahoraCl = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date()); // "YYYY-MM-DD HH:MM:SS"
  const naive = s => {
    const [f, h] = s.split(/[T ]/);
    const [y, m, d] = f.split('-').map(Number);
    const [hh, mm] = h.split(':').map(Number);
    return Date.UTC(y, m - 1, d, hh, mm || 0);
  };
  return (naive(`${fecha} ${hora}`) - naive(ahoraCl)) / 3600000;
}

// ─── Política de modificación/cancelación de reservas ─────────────
// Regla general: solo con más de 48 h de anticipación. Excepción GLOBAL de la
// administración (instrucción 16-10-2026): la admin puede modificar o
// cancelar cualquier reserva hasta que termine, incluso el mismo día; cada
// uso queda registrado. Ningún otro rol tiene esta excepción.
const HORAS_ANTICIPACION = 48;
function ventanaModificacion(rol, fecha, horaInicio, horaFin) {
  const hIni = horasHastaChile(fecha, horaInicio);
  const hFin = horasHastaChile(fecha, horaFin || horaInicio);
  if (!Number.isFinite(hIni)) return { ok: false, error: 'Fecha u hora de la reserva inválida' };
  const dentro48h = hIni <= HORAS_ANTICIPACION;
  if (rol === 'admin') {
    if (!(hFin > 0)) return { ok: false, error: 'Esta reserva ya terminó: no se puede modificar ni cancelar' };
    return { ok: true, dentro48h, excepcionAdmin: dentro48h };
  }
  if (dentro48h) {
    return { ok: false, error: `Solo se puede modificar o cancelar con más de ${HORAS_ANTICIPACION} horas de anticipación (quedan ${Math.max(0, Math.round(hIni))})` };
  }
  return { ok: true, dentro48h: false, excepcionAdmin: false };
}

// "16-10-2026 14:32" en hora de Chile (trazas legibles)
function ahoraChileTexto() {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace(',', '');
}

// Registro de auditoría de una reserva. Si la tabla aún no existe (falta la
// migración), NO bloquea la operación: la traza legible igual queda en
// arriendos.obs_modificacion. Devuelve true si quedó en la tabla.
async function registrarHistorialArriendo(sb, fila) {
  try {
    const { error } = await sb.from('arriendos_historial').insert(fila);
    if (error) { console.error('historial arriendos:', error.message); return false; }
    return true;
  } catch (e) { console.error('historial arriendos:', e.message); return false; }
}

module.exports = {
  ventanaModificacion, ahoraChileTexto, registrarHistorialArriendo, HORAS_ANTICIPACION,
  getSbAdmin, hashPassword, verificarPassword, esHashScrypt,
  crearToken, verificarToken, usuarioDesdeReq, requiereRol,
  rateLimitOk, ipDeReq, horasHastaChile,
};
