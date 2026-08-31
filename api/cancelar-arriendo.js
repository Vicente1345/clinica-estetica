// api/cancelar-arriendo.js — Cancelación de arriendos desde el servidor.
// Reemplaza el `update` directo a `arriendos` que hacía el navegador en
// ModificarReserva.js (S8 del saneamiento, spec v4 §1.3): toda escritura de
// arriendos pasa por el servidor, con autenticación y la política de 48 horas
// aplicada aquí (en hora de Chile continental, no en el reloj del cliente).
//
// POST + Authorization: Bearer <token de /api/login, rol admin>
//   { id, motivo }
// → { ok:true, arriendo } | { ok:false, error }

const { getSbAdmin, requiereRol, rateLimitOk, ipDeReq, horasHastaChile } = require('./_lib/seguridad');
const { normHora } = require('./_lib/disponibilidad');

const HORAS_MINIMAS_CANCELACION = 48; // política vigente de arriendos

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const auth = requiereRol(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (!rateLimitOk(`cancelar:${ipDeReq(req)}`, 20, 60000)) {
    return res.status(429).json({ ok: false, error: 'Demasiadas operaciones. Espera un minuto.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { id } = body;
  const motivo = String(body.motivo || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'Falta id del arriendo' });
  if (!motivo) return res.status(400).json({ ok: false, error: 'El motivo de la cancelación es requerido' });

  const sb = getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  const { data: arr, error } = await sb.from('arriendos')
    .select('id,fecha,hora_inicio,hora_fin,estado,box_nombre,profesional_nombre')
    .eq('id', id).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo leer el arriendo: ' + error.message });
  if (!arr) return res.status(404).json({ ok: false, error: 'Arriendo no encontrado' });
  if (arr.estado === 'cancelado') return res.status(400).json({ ok: false, error: 'El arriendo ya está cancelado' });

  const horas = horasHastaChile(arr.fecha, normHora(arr.hora_inicio));
  if (!Number.isFinite(horas) || horas <= HORAS_MINIMAS_CANCELACION) {
    return res.status(400).json({
      ok: false,
      error: `No se puede cancelar: se requieren más de ${HORAS_MINIMAS_CANCELACION} horas de anticipación (quedan ${Math.max(0, Math.round(horas))}).`,
    });
  }

  const { data, error: eUpd } = await sb.from('arriendos')
    .update({ estado: 'cancelado', obs_modificacion: `Cancelado por ${auth.usuario.nombre} (admin): ${motivo}` })
    .eq('id', id).select().single();
  if (eUpd) return res.status(500).json({ ok: false, error: 'No se pudo cancelar: ' + eUpd.message });

  console.log(`[cancelar-arriendo] ${id} por ${auth.usuario.nombre}: ${motivo}`);
  return res.status(200).json({ ok: true, arriendo: data });
};
