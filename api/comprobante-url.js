// api/comprobante-url.js — URL firmada para VER un comprobante.
// Reemplaza el createSignedUrl del navegador (anon key) para poder cerrar el
// bucket 'comprobantes' a lecturas anónimas. Admin/recep ven cualquiera; una
// profesional solo los de sus propios registros.
//
// POST + Authorization: Bearer <token>
//   { tabla:'arriendos'|'movimientos'|'planes_profesional', id }
//   → { ok, url } | { ok:false, error }

const { getSbAdmin, requiereRol } = require('./_lib/seguridad');

const normalizeNombre = n => (n || '').toLowerCase().replace(/^(dr\.?|dra\.?)\s+/i, '').trim();
const TABLAS = ['arriendos', 'movimientos', 'planes_profesional'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const auth = requiereRol(req, ['admin', 'recep', 'prof']);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const { usuario } = auth;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!TABLAS.includes(body.tabla) || !body.id) return res.status(400).json({ ok: false, error: 'Datos inválidos' });

  const sb = await getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  try {
    // movimientos no tiene profesional_id; solo nombre
    const cols = body.tabla === 'movimientos'
      ? 'id,comprobante_url,profesional_nombre'
      : 'id,comprobante_url,profesional_id,profesional_nombre';
    const { data: fila } = await sb.from(body.tabla).select(cols).eq('id', body.id).single();
    if (!fila || !fila.comprobante_url) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });

    if (usuario.rol === 'prof') {
      const { data: profs } = await sb.from('profesionales').select('id,nombre');
      const yo = normalizeNombre(usuario.nombre);
      const mio = (profs || []).find(p => normalizeNombre(p.nombre) === yo);
      const esMia = (mio && fila.profesional_id === mio.id) ||
        normalizeNombre(fila.profesional_nombre) === yo;
      if (!esMia) return res.status(403).json({ ok: false, error: 'Solo puedes ver tus propios comprobantes' });
    }

    const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(fila.comprobante_url, 3600);
    if (error || !data?.signedUrl) throw error || new Error('sin signedUrl');
    return res.status(200).json({ ok: true, url: data.signedUrl });
  } catch (e) {
    console.error('comprobante-url:', e && (e.message || e));
    return res.status(500).json({ ok: false, error: 'No se pudo generar el enlace del comprobante' });
  }
};
