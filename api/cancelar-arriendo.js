// api/cancelar-arriendo.js — Cancelación de arriendos desde el servidor.
// Reemplaza el `update` directo a `arriendos` que hacía el navegador en
// ModificarReserva.js (S8 del saneamiento, spec v4 §1.3): toda escritura de
// arriendos pasa por el servidor, con autenticación y la política de 48 horas
// aplicada aquí (en hora de Chile continental, no en el reloj del cliente).
//
// POST + Authorization: Bearer <token de /api/login, rol admin>
//   { id, motivo }
// → { ok:true, arriendo } | { ok:false, error }

const { getSbAdmin, requiereRol, rateLimitOk, ipDeReq, ventanaModificacion, ahoraChileTexto, registrarHistorialArriendo } = require('./_lib/seguridad');
const { normHora } = require('./_lib/disponibilidad');

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

  const sb = await getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  const { data: arr, error } = await sb.from('arriendos')
    .select('id,fecha,hora_inicio,hora_fin,estado,box_id,box_nombre,profesional_nombre,horas,monto')
    .eq('id', id).maybeSingle();
  if (error) return res.status(500).json({ ok: false, error: 'No se pudo leer el arriendo: ' + error.message });
  if (!arr) return res.status(404).json({ ok: false, error: 'Arriendo no encontrado' });
  if (arr.estado === 'cancelado') return res.status(400).json({ ok: false, error: 'El arriendo ya está cancelado' });

  // Ventana de 48 h: la admin la omite (hasta que la reserva termine)
  const ventana = ventanaModificacion(auth.usuario.rol, arr.fecha, normHora(arr.hora_inicio), normHora(arr.hora_fin));
  if (!ventana.ok) return res.status(400).json({ ok: false, error: 'No se puede cancelar: ' + ventana.error });

  const traza = `Cancelado por ${auth.usuario.nombre} (${auth.usuario.rol}) el ${ahoraChileTexto()}${ventana.excepcionAdmin ? ' [con menos de 48 h]' : ''}: ${motivo}`;
  const { data, error: eUpd } = await sb.from('arriendos')
    .update({ estado: 'cancelado', obs_modificacion: traza.slice(0, 1000) })
    .eq('id', id).select().single();
  if (eUpd) return res.status(500).json({ ok: false, error: 'No se pudo cancelar: ' + eUpd.message });

  await registrarHistorialArriendo(sb, {
    arriendo_id: arr.id, accion: 'cancelar',
    antes: { fecha: arr.fecha, hora_inicio: normHora(arr.hora_inicio), hora_fin: normHora(arr.hora_fin), box_id: arr.box_id, box_nombre: arr.box_nombre, estado: arr.estado },
    despues: { estado: 'cancelado' },
    motivo, dentro_48h: ventana.dentro48h,
    usuario_id: String(auth.usuario.uid || ''), usuario_nombre: auth.usuario.nombre, usuario_rol: auth.usuario.rol,
  });

  // Si la jornada pertenece a un plan especial, su total se mantiene al día
  if (data && data.plan_profesional_id) {
    const { count } = await sb.from('arriendos').select('id', { count: 'exact', head: true })
      .eq('plan_profesional_id', data.plan_profesional_id).in('estado', ['pendiente', 'confirmado']);
    await sb.from('planes_profesional').update({ jornadas_totales: count || 0 })
      .eq('id', data.plan_profesional_id).eq('es_especial', true);
  }

  console.log(`[cancelar-arriendo] ${id} por ${auth.usuario.nombre}: ${motivo}`);
  return res.status(200).json({ ok: true, arriendo: data });
};
