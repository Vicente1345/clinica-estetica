// api/_lib/planesEspeciales.js — Lógica pura de los Planes Especiales.
// Vive en el servidor (no en el bundle): los planes especiales no forman
// parte del catálogo público. Sin dependencias de Supabase: todo lo que
// toca la BD está en api/gestion.js y recibe los datos ya leídos.
//
// Horario semanal acordado: [{ dia: 1..7 (ISO: 1=Lunes … 7=Domingo),
//                              hora_inicio: "HH:MM", hora_fin: "HH:MM" }]

const { seSolapan, normHora, ESTADOS_OCUPAN, ESTADOS_CITA_OCUPAN } = require('./disponibilidad');

const DIAS_CORTOS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HORA_RE = /^\d{2}:\d{2}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const APERTURA = '08:00';
const CIERRE = '20:00';
const MAX_JORNADAS = 7 * 54; // tope de seguridad (un año de 7 días)

const minutos = h => { const [a, b] = normHora(h).split(':').map(Number); return a * 60 + b; };

// Día ISO (1=Lunes … 7=Domingo) de una fecha "YYYY-MM-DD", sin zona horaria
function diaIso(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Domingo
  return dow === 0 ? 7 : dow;
}

function sumarDias(fecha, n) {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// Último día de una vigencia de `meses` meses que empieza en `fecha`
// (ej.: 2026-11-01 + 12 meses → 2027-10-31)
function finDeVigencia(fecha, meses) {
  const [y, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + meses, d));
  // Si el día no existe en el mes destino (ej. 31 de febrero), Date lo
  // desborda al mes siguiente: el aniversario pasa a ser el día 1 de ese mes,
  // así la vigencia termina el último día del mes destino
  if (t.getUTCDate() !== d) t.setUTCDate(1);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

// Valida y normaliza el horario semanal. `jornadasSemanales` es la
// frecuencia del plan (Dental 3, Estético 2): debe calzar exactamente.
function validarHorario(horario, jornadasSemanales, minHoras = 1) {
  if (!Array.isArray(horario) || !horario.length) return { ok: false, error: 'Define al menos un día con su horario' };
  const norm = [];
  const dias = new Set();
  for (const h of horario) {
    const dia = Number(h && h.dia);
    if (!Number.isInteger(dia) || dia < 1 || dia > 7) return { ok: false, error: 'Día inválido en el horario' };
    if (dias.has(dia)) return { ok: false, error: `${DIAS_CORTOS[dia]} aparece dos veces: una jornada por día` };
    dias.add(dia);
    const ini = String((h && h.hora_inicio) || ''), fin = String((h && h.hora_fin) || '');
    if (!HORA_RE.test(ini) || !HORA_RE.test(fin)) return { ok: false, error: `${DIAS_CORTOS[dia]}: horario inválido (HH:MM)` };
    if (minutos(fin) <= minutos(ini)) return { ok: false, error: `${DIAS_CORTOS[dia]}: la hora de término debe ser posterior al inicio` };
    if (ini < APERTURA || fin > CIERRE) return { ok: false, error: `${DIAS_CORTOS[dia]}: el horario de arriendo es de ${APERTURA} a ${CIERRE}` };
    if ((minutos(fin) - minutos(ini)) / 60 < minHoras) return { ok: false, error: `${DIAS_CORTOS[dia]}: este box exige un mínimo de ${minHoras} horas` };
    norm.push({ dia, hora_inicio: ini, hora_fin: fin });
  }
  if (Number.isInteger(jornadasSemanales) && dias.size !== jornadasSemanales) {
    return { ok: false, error: `Este plan es de ${jornadasSemanales} jornada${jornadasSemanales > 1 ? 's' : ''} semanal${jornadasSemanales > 1 ? 'es' : ''}: elegiste ${dias.size} día${dias.size !== 1 ? 's' : ''}` };
  }
  norm.sort((a, b) => a.dia - b.dia);
  return { ok: true, horario: norm };
}

// Valida el rango de vigencia: inicio desde `hoy`, fin posterior y dentro de
// la vigencia máxima del plan (por defecto 12 meses)
function validarVigencia(fechaInicio, fechaFin, vigenciaMeses, hoy) {
  if (!FECHA_RE.test(String(fechaInicio || ''))) return { ok: false, error: 'Fecha de inicio inválida' };
  if (!FECHA_RE.test(String(fechaFin || ''))) return { ok: false, error: 'Fecha de término inválida' };
  if (hoy && fechaInicio < hoy) return { ok: false, error: 'La fecha de inicio no puede ser anterior a hoy' };
  if (fechaFin < fechaInicio) return { ok: false, error: 'La fecha de término debe ser posterior al inicio' };
  const maximo = finDeVigencia(fechaInicio, vigenciaMeses || 12);
  if (fechaFin > maximo) return { ok: false, error: `La vigencia máxima del plan es de ${vigenciaMeses || 12} meses (hasta ${maximo})` };
  return { ok: true };
}

// Todas las jornadas concretas del período (sin las fechas excluidas a mano)
function generarJornadas(horario, fechaInicio, fechaFin, excluir = []) {
  const excl = new Set(excluir || []);
  const porDia = new Map(horario.map(h => [h.dia, h]));
  const out = [];
  for (let f = fechaInicio; f <= fechaFin; f = sumarDias(f, 1)) {
    const h = porDia.get(diaIso(f));
    if (h && !excl.has(f)) out.push({ fecha: f, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin });
    if (out.length > MAX_JORNADAS) break;
  }
  return out;
}

// Conflictos de las jornadas contra lo que ya ocupa el recurso físico
// (arriendos de cualquier modalidad del recurso y citas de pacientes).
// `ignorarPlanId`: al modificar, las reservas propias del plan no cuentan.
function detectarConflictos(jornadas, ocupados, citas, ignorarPlanId = null) {
  const porFechaArr = new Map(), porFechaCita = new Map();
  for (const a of ocupados || []) {
    if (!ESTADOS_OCUPAN.includes(a.estado)) continue;
    if (ignorarPlanId && a.plan_profesional_id === ignorarPlanId) continue;
    if (!porFechaArr.has(a.fecha)) porFechaArr.set(a.fecha, []);
    porFechaArr.get(a.fecha).push(a);
  }
  for (const c of citas || []) {
    if (!ESTADOS_CITA_OCUPAN.includes(c.estado) || !c.hora_inicio || !c.hora_fin) continue;
    if (!porFechaCita.has(c.fecha_solicitada)) porFechaCita.set(c.fecha_solicitada, []);
    porFechaCita.get(c.fecha_solicitada).push(c);
  }
  const conflictos = [];
  for (const j of jornadas) {
    for (const a of porFechaArr.get(j.fecha) || []) {
      if (seSolapan(j.hora_inicio, j.hora_fin, a.hora_inicio, a.hora_fin)) {
        conflictos.push({
          fecha: j.fecha, jornada: `${j.hora_inicio}–${j.hora_fin}`,
          ocupa: `${normHora(a.hora_inicio)}–${normHora(a.hora_fin)}`,
          origen: `Arriendo de ${a.profesional_nombre || 'otra profesional'} (${a.box_nombre || 'box compartido'}, ${a.estado})`,
        });
      }
    }
    for (const c of porFechaCita.get(j.fecha) || []) {
      if (seSolapan(j.hora_inicio, j.hora_fin, c.hora_inicio, c.hora_fin)) {
        conflictos.push({
          fecha: j.fecha, jornada: `${j.hora_inicio}–${j.hora_fin}`,
          ocupa: `${normHora(c.hora_inicio)}–${normHora(c.hora_fin)}`,
          origen: `Cita de paciente (${c.box_tipo})`,
        });
      }
    }
  }
  return conflictos;
}

const diasCortos = horario => horario.map(h => DIAS_CORTOS[h.dia]);
const describirHorario = horario => horario.map(h => `${DIAS_CORTOS[h.dia]} ${h.hora_inicio}–${h.hora_fin}`).join(' · ');

module.exports = {
  DIAS_CORTOS, diaIso, sumarDias, finDeVigencia,
  validarHorario, validarVigencia, generarJornadas, detectarConflictos,
  diasCortos, describirHorario,
};
