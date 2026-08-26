// api/reservar.js — Validación final del lado del servidor para crear y
// modificar arriendos.
//
// Todo arriendo (suelto o jornadas de plan) se crea a través de este endpoint,
// nunca con insert directo desde el cliente. Reglas que aplica:
//   1. El box debe existir y estar activo; horas en formato HH:MM válido.
//   2. hora_fin > hora_inicio y mínimo de horas por modalidad
//      (Box Médico: 2 horas consecutivas obligatorias).
//   3. Sin solapamiento interno entre las filas del propio payload (bulk).
//   4. Sin solapamiento con OTROS arriendos activos del mismo RECURSO FÍSICO
//      (Dental y Estético comparten calendario; Médico es independiente).
//   5. Sin solapamiento con citas de pacientes del mismo recurso.
//   6. Anti-carrera: tras insertar se re-verifica (arriendos Y citas); si otra
//      reserva simultánea ganó (desempate determinístico por created_at/id),
//      se elimina la propia y se responde 409. Si la BD ya tiene el constraint
//      de exclusión (docs/migracion-recurso.sql), el insert perdedor falla
//      además con 23P01 — esa es la garantía atómica definitiva.
//
// Body: { arriendo: {...} } ó { arriendos: [{...}] } (bulk de plan)
//       ó { modificar: { id, fecha, hora_inicio, hora_fin, box_id, ... } }.
// Respuesta: { ok:true, arriendos:[...] } ó { ok:false, error, conflictos? }.

const { createClient } = require('@supabase/supabase-js');
const {
  boxIdsDelRecurso, tiposDelRecurso, recursoDeBox, minHorasDeBox,
  seSolapan, normHora, ESTADOS_OCUPAN, ESTADOS_CITA_OCUPAN, ganaCarrera,
} = require('./_lib/disponibilidad');

function getSb() {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, key);
}

const HORA_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const horasDe = (ini, fin) => {
  if (!HORA_RE.test(ini || '') || !HORA_RE.test(fin || '')) return NaN;
  const [h1, m1] = normHora(ini).split(':').map(Number);
  const [h2, m2] = normHora(fin).split(':').map(Number);
  return ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
};

const espera = ms => new Promise(r => setTimeout(r, ms));

// Busca conflictos de un conjunto de filas contra arriendos y citas ya leídos
function buscarConflictos(rows, ocupados, citas, ignorarIds = new Set()) {
  const conflictos = [];
  for (const r of rows) {
    for (const a of (ocupados || [])) {
      if (ignorarIds.has(a.id)) continue;
      if (a.fecha === r.fecha && seSolapan(r.hora_inicio, r.hora_fin, a.hora_inicio, a.hora_fin))
        conflictos.push({ fecha: r.fecha, hora_inicio: normHora(a.hora_inicio), hora_fin: normHora(a.hora_fin), origen: `arriendo en ${a.box_nombre || 'box compartido'}` });
    }
    for (const s of (citas || [])) {
      if (s.fecha_solicitada === r.fecha && s.hora_inicio && s.hora_fin && seSolapan(r.hora_inicio, r.hora_fin, s.hora_inicio, s.hora_fin))
        conflictos.push({ fecha: r.fecha, hora_inicio: normHora(s.hora_inicio), hora_fin: normHora(s.hora_fin), origen: `cita de paciente (${s.box_tipo})` });
    }
  }
  return conflictos;
}

async function leerOcupacion(sb, idsRecurso, tipos, fechas, ignorarArriendoId = null) {
  let qArr = sb.from('arriendos')
    .select('id,box_id,box_nombre,fecha,hora_inicio,hora_fin,estado,created_at')
    .in('box_id', idsRecurso).in('fecha', fechas).in('estado', ESTADOS_OCUPAN);
  if (ignorarArriendoId) qArr = qArr.neq('id', ignorarArriendoId);
  const [rArr, rCitas] = await Promise.all([
    qArr,
    sb.from('solicitudes_paciente')
      .select('id,box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado')
      .in('box_tipo', tipos).in('fecha_solicitada', fechas).in('estado', ESTADOS_CITA_OCUPAN),
  ]);
  if (rArr.error)   throw new Error('No se pudo leer arriendos: ' + rArr.error.message);
  if (rCitas.error) throw new Error('No se pudieron leer citas: ' + rCitas.error.message);
  return { ocupados: rArr.data || [], citas: rCitas.data || [] };
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const esModificacion = !!body.modificar;
    const rows = esModificacion
      ? [body.modificar]
      : (body.arriendos || (body.arriendo ? [body.arriendo] : []));
    if (!rows.length) return res.status(400).json({ ok: false, error: 'Sin datos de arriendo' });
    if (esModificacion && !rows[0].id)
      return res.status(400).json({ ok: false, error: 'Modificación sin id de arriendo' });

    const sb = getSb();

    // ── Box y recurso físico ──
    const { data: boxes, error: eBoxes } = await sb.from('boxes').select('id,nombre,tipo,activo');
    if (eBoxes || !boxes) return res.status(500).json({ ok: false, error: 'No se pudieron leer los boxes' });

    const boxId = rows[0].box_id;
    const box = boxes.find(b => b.id === boxId);
    if (!box)        return res.status(400).json({ ok: false, error: 'Box inexistente' });
    if (!box.activo) return res.status(400).json({ ok: false, error: 'Box inactivo' });
    if (rows.some(r => r.box_id !== boxId))
      return res.status(400).json({ ok: false, error: 'Todas las jornadas deben ser del mismo box' });

    // ── Formato, duración y mínimo por modalidad (médico: 2h consecutivas) ──
    const minHoras = minHorasDeBox(box);
    // La reserva debe pertenecer a una profesional existente: un id vacio
    // llegaba a Postgres como uuid invalido y devolvia un error cripitico.
    if (!esModificacion && rows.some(r => !UUID_RE.test(r.profesional_id || '')))
      return res.status(400).json({ ok: false, error: 'La reserva no tiene una profesional valida asociada. Verifica que la cuenta este vinculada en Configuracion > Profesionales.' });

    for (const r of rows) {
      if (!r.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha))
        return res.status(400).json({ ok: false, error: `Fecha inválida: ${r.fecha || '(vacía)'}` });
      const horas = horasDe(r.hora_inicio, r.hora_fin);
      if (!Number.isFinite(horas))
        return res.status(400).json({ ok: false, error: `Horario inválido (${r.fecha}): se requiere HH:MM` });
      if (horas <= 0)
        return res.status(400).json({ ok: false, error: `Hora fin debe ser posterior a hora inicio (${r.fecha})` });
      if (horas < minHoras)
        return res.status(400).json({
          ok: false,
          error: `La reserva del ${box.nombre} requiere un mínimo de ${minHoras} horas consecutivas (${r.fecha}: ${horas} hr)`,
        });
    }

    // ── Solapamientos internos del propio payload (bulk de plan) ──
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[i].fecha === rows[j].fecha &&
            seSolapan(rows[i].hora_inicio, rows[i].hora_fin, rows[j].hora_inicio, rows[j].hora_fin))
          return res.status(400).json({ ok: false, error: `El propio pedido contiene jornadas solapadas (${rows[i].fecha})` });
      }
    }

    // ── Disponibilidad sobre el recurso físico compartido ──
    const idsRecurso = boxIdsDelRecurso(boxes, box);
    const tipos      = tiposDelRecurso(recursoDeBox(box));
    const fechas     = [...new Set(rows.map(r => r.fecha))];
    const propioId   = esModificacion ? rows[0].id : null;

    const { ocupados, citas } = await leerOcupacion(sb, idsRecurso, tipos, fechas, propioId);
    const conflictos = buscarConflictos(rows, ocupados, citas);
    if (conflictos.length)
      return res.status(409).json({ ok: false, error: 'Horario no disponible en el recurso compartido', conflictos });

    // ── Escritura ──
    let escritos;
    let original = null; // para restaurar si una modificación pierde la carrera
    if (esModificacion) {
      const { id, ...campos } = rows[0];
      const rOrig = await sb.from('arriendos').select('*').eq('id', id).maybeSingle();
      if (rOrig.error || !rOrig.data)
        return res.status(404).json({ ok: false, error: 'Arriendo no encontrado' });
      original = rOrig.data;
      const { data, error } = await sb.from('arriendos').update(campos).eq('id', id).select();
      if (error) {
        if (error.code === '23P01')
          return res.status(409).json({ ok: false, error: 'Otra reserva tomó ese horario en este momento.' });
        return res.status(500).json({ ok: false, error: 'No se pudo modificar el arriendo: ' + error.message });
      }
      if (!data?.length) return res.status(404).json({ ok: false, error: 'Arriendo no encontrado' });
      escritos = data;
    } else {
      const { data, error } = await sb.from('arriendos').insert(rows).select();
      if (error) {
        // 23P01 = exclusion_violation (constraint de la migración): otra reserva ganó
        if (error.code === '23P01')
          return res.status(409).json({ ok: false, error: 'Otra reserva tomó ese horario en este momento. Intenta con otro bloque.' });
        return res.status(500).json({ ok: false, error: 'No se pudo crear el arriendo: ' + error.message });
      }
      escritos = data;
    }

    // ── Re-verificación anti-carrera (arriendos Y citas de pacientes) ──
    // La espera breve deja que commits concurrentes se hagan visibles antes de
    // releer. La garantía atómica total la da el constraint de la migración.
    await espera(150);
    const idsMios = new Set(escritos.map(i => i.id));
    const relectura = await leerOcupacion(sb, idsRecurso, tipos, fechas);

    const perdioContraArriendo = escritos.some(mio =>
      relectura.ocupados.some(otro =>
        !idsMios.has(otro.id) &&
        otro.fecha === mio.fecha &&
        seSolapan(mio.hora_inicio, mio.hora_fin, otro.hora_inicio, otro.hora_fin) &&
        !ganaCarrera(mio, otro)
      )
    );
    // Contra una cita de paciente no hay desempate: la cita agendada prevalece
    const chocaConCita = buscarConflictos(
      escritos.map(e => ({ fecha: e.fecha, hora_inicio: e.hora_inicio, hora_fin: e.hora_fin })),
      [], relectura.citas
    ).length > 0;

    if (perdioContraArriendo || chocaConCita) {
      let advertencia = null;
      if (esModificacion) {
        // Una modificación que pierde la carrera se REVIERTE a sus valores
        // originales (nunca se elimina la reserva existente).
        const { id, created_at, ...camposOrig } = original;
        const rev = await sb.from('arriendos').update(camposOrig).eq('id', id).select('id');
        if (rev.error || !(rev.data || []).length) {
          console.error('reservar: no se pudo revertir la modificación perdedora', rev.error);
          advertencia = 'No se pudo revertir automáticamente la modificación; la administración debe revisarla.';
        }
      } else {
        // Compensación verificada: eliminar lo propio; si el delete no surte
        // efecto, degradar a estado 'cancelado'; si tampoco, avisar en la
        // respuesta para gestión manual.
        const del = await sb.from('arriendos').delete().in('id', [...idsMios]).select('id');
        if (del.error || (del.data || []).length !== idsMios.size) {
          const upd = await sb.from('arriendos')
            .update({ estado: 'cancelado', obs_modificacion: 'Anulado automáticamente: otra reserva simultánea ganó el horario.' })
            .in('id', [...idsMios]).select('id');
          if (upd.error || (upd.data || []).length !== idsMios.size) {
            console.error('reservar: no se pudo compensar la reserva perdedora', del.error || upd.error);
            advertencia = 'No se pudo anular automáticamente la reserva perdedora; la administración debe revisarla.';
          }
        }
      }
      return res.status(409).json({
        ok: false,
        error: 'Otra reserva simultánea tomó ese horario. Intenta con otro bloque.',
        ...(advertencia ? { advertencia } : {}),
      });
    }

    return res.status(200).json({ ok: true, arriendos: escritos });
  } catch (e) {
    console.error('reservar throw:', e);
    return res.status(500).json({ ok: false, error: 'Error interno al reservar' });
  }
};
