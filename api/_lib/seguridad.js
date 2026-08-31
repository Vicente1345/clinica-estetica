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
function getSbAdmin() {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url) return null;
  if (!service) {
    console.warn('seguridad: SUPABASE_SERVICE_ROLE_KEY no configurada; usando anon key (fallback). Con RLS estricto esto dejará de funcionar.');
  }
  return createClient(url, service || anon, { auth: { persistSession: false } });
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

module.exports = {
  getSbAdmin, hashPassword, verificarPassword, esHashScrypt,
  crearToken, verificarToken, usuarioDesdeReq, requiereRol,
  rateLimitOk, ipDeReq, horasHastaChile,
};
