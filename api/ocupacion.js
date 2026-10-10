// api/ocupacion.js — Disponibilidad PÚBLICA y sanitizada.
// Única lectura que queda abierta sin login: slots ocupados SIN nombres,
// montos ni datos de pacientes. La usan la portada (Landing), el widget
// estático de GitHub Pages (CORS *) y la recarga del calendario interno.
//
// GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (opcionales; por defecto ayer→+366d)
//   → { ok, boxes:[{id,nombre,tipo,activo,tarifa_hora}],
//       arriendos:[{id,box_id,fecha,hora_inicio,hora_fin,estado}],
//       citas:[{box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado}] }
// Con Authorization: Bearer de rol admin/recep, los arriendos incluyen además
// box_nombre, profesional_nombre y horas (detalle del calendario admin) —
// la restricción se aplica EN EL SERVIDOR, no en la UI.

const { getSbAdmin, usuarioDesdeReq } = require('./_lib/seguridad');

const ESTADOS_OCUPAN = ['pendiente', 'confirmado'];
const ESTADOS_CITA_OCUPAN = ['agendada', 'agendado', 'contactado', 'confirmada'];

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const masDias = (f, n) => {
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

module.exports = async (req, res) => {
  // Público: el widget vive en GitHub Pages (otro origen)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const sb = await getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  const hoy = hoyChile();
  let desde = String((req.query && req.query.desde) || masDias(hoy, -1));
  let hasta = String((req.query && req.query.hasta) || masDias(hoy, 366));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) desde = masDias(hoy, -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta)) hasta = masDias(hoy, 366);
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  if (masDias(desde, 370) < hasta) hasta = masDias(desde, 370); // tope de rango

  // Detalle extra SOLO para admin/recep con token válido (verificado aquí)
  const usuario = usuarioDesdeReq(req);
  const esStaff = !!usuario && (usuario.rol === 'admin' || usuario.rol === 'recep');
  const colsArr = esStaff
    ? 'id,box_id,box_nombre,fecha,hora_inicio,hora_fin,horas,estado,profesional_nombre'
    : 'id,box_id,fecha,hora_inicio,hora_fin,estado';

  try {
    const [bx, arr, cit] = await Promise.all([
      sb.from('boxes').select('id,nombre,tipo,activo,tarifa_hora').order('nombre'),
      sb.from('arriendos').select(colsArr)
        .in('estado', ESTADOS_OCUPAN)
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha'),
      sb.from('solicitudes_paciente')
        .select('box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado')
        .in('estado', ESTADOS_CITA_OCUPAN)
        .gte('fecha_solicitada', desde).lte('fecha_solicitada', hasta),
    ]);
    const conError = [bx, arr, cit].find(r => r.error);
    if (conError) throw conError.error;

    return res.status(200).json({
      ok: true,
      boxes: bx.data || [],
      arriendos: arr.data || [],
      citas: cit.data || [],
    });
  } catch (e) {
    console.error('ocupacion:', e && (e.message || e));
    return res.status(500).json({ ok: false, error: 'Error al cargar la disponibilidad' });
  }
};
