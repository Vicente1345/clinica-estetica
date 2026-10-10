// api/datos.js — Lecturas de la app logueada SOLO desde el servidor.
// Reemplaza los select directos del navegador a Supabase (fetchAll y afines)
// para poder blindar las tablas con RLS. El filtrado por rol ocurre AQUÍ:
// el navegador de una profesional nunca recibe datos de terceros
// (nombres, montos, movimientos o citas de pacientes).
//
// GET + Authorization: Bearer <token de /api/login>
//   → { ok, insumos, movimientos, arriendos, misArriendos, profesionales,
//       boxes, solicitudes, planes, miProfId }
// GET ?resumen=1&desde=YYYY-MM-DD&hasta=YYYY-MM-DD (solo admin)
//   → { ok, arriendos } columnas agregables para el Resumen Ejecutivo

const { getSbAdmin, requiereRol } = require('./_lib/seguridad');

// Mismo vínculo usuarios.nombre ↔ profesionales.nombre que usa el frontend
const normalizeNombre = n => (n || '').toLowerCase().replace(/^(dr\.?|dra\.?)\s+/i, '').trim();

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const auth = requiereRol(req, ['admin', 'recep', 'prof']);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const { usuario } = auth;

  const sb = await getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  try {
    // ── Modo resumen ejecutivo (solo admin) ──
    if (req.query && req.query.resumen) {
      if (usuario.rol !== 'admin') return res.status(403).json({ ok: false, error: 'Solo administración' });
      const desde = String(req.query.desde || ''), hasta = String(req.query.hasta || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) {
        return res.status(400).json({ ok: false, error: 'Rango de fechas inválido' });
      }
      const { data, error } = await sb.from('arriendos')
        .select('id,box_id,box_nombre,fecha,horas,estado,monto,verificado')
        .gte('fecha', desde).lte('fecha', hasta).order('fecha');
      if (error) throw error;
      return res.status(200).json({ ok: true, arriendos: data || [] });
    }

    const esProf = usuario.rol === 'prof';

    const [ins, mov, arr, prof, bx, sol, pl] = await Promise.all([
      sb.from('insumos').select('*').eq('activo', true).order('nombre'),
      // Movimientos: la profesional solo recibe los suyos (antes el filtro era client-side)
      esProf
        ? sb.from('movimientos').select('*').eq('profesional_nombre', usuario.nombre).order('created_at', { ascending: false }).limit(200)
        : sb.from('movimientos').select('*').order('created_at', { ascending: false }).limit(200),
      // Arriendos: la profesional solo recibe columnas de ocupación (sin nombres/montos)
      sb.from('arriendos')
        .select(esProf ? 'id,box_id,box_nombre,fecha,hora_inicio,hora_fin,horas,estado' : '*')
        .order('fecha', { ascending: false }).limit(200),
      sb.from('profesionales').select(esProf ? 'id,nombre,activo' : '*').order('nombre'),
      sb.from('boxes').select('*').order('nombre'),
      // Citas de pacientes: la profesional nunca recibe PII de pacientes
      sb.from('solicitudes_paciente')
        .select(esProf ? 'id,box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado,created_at' : '*')
        .order('created_at', { ascending: false }).limit(200),
      sb.from('planes_profesional').select('*').order('created_at', { ascending: false }),
    ]);
    const conError = [ins, mov, arr, prof, bx, sol, pl].find(r => r.error);
    if (conError) throw conError.error;

    let misArriendos = [];
    let planes = pl.data || [];
    let miProfId = null;
    if (esProf) {
      const yo = normalizeNombre(usuario.nombre);
      miProfId = (prof.data || []).find(p => normalizeNombre(p.nombre) === yo)?.id || null;
      if (miProfId) {
        const { data: mios, error: e2 } = await sb.from('arriendos').select('*')
          .eq('profesional_id', miProfId).order('fecha', { ascending: false }).limit(200);
        if (e2) throw e2;
        misArriendos = mios || [];
      }
      planes = planes.filter(p => p.profesional_id === miProfId || normalizeNombre(p.profesional_nombre) === yo);
    }

    return res.status(200).json({
      ok: true,
      insumos: ins.data || [],
      movimientos: mov.data || [],
      arriendos: arr.data || [],
      misArriendos,
      profesionales: prof.data || [],
      boxes: bx.data || [],
      solicitudes: sol.data || [],
      planes,
      miProfId,
    });
  } catch (e) {
    console.error('datos:', e && (e.message || e));
    return res.status(500).json({ ok: false, error: 'Error al cargar los datos' });
  }
};
