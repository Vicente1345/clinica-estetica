// ─── RECURSO FÍSICO vs MODALIDAD COMERCIAL ────────────────────────
// El Box Dental y el Box Estético son DOS modalidades comerciales que
// comparten UN mismo espacio físico → comparten calendario.
// El Box Médico es un espacio físico independiente con calendario propio
// y mínimo de 2 horas consecutivas por reserva.
//
// Este módulo es la única fuente de verdad de esas reglas en el frontend.
// api/_lib/disponibilidad.js es su espejo CommonJS para las funciones
// serverless — si cambias algo aquí, cambia también allá (hay un test de
// paridad en src/logic/disponibilidad.test.js que compara ambos).

export const RECURSO_DENTAL_ESTETICO = "dental_estetico";
export const RECURSO_MEDICO          = "medico";

// Horas mínimas por modalidad. La regla de 2h del médico es obligatoria
// (frontend + backend); la del dental es condición comercial preexistente.
export const MIN_HORAS = { estetico: 1, dental: 2, medico: 2 };

// "09:00:00" (time de Postgres) → "09:00"
export const normHora = h => (h || "").slice(0, 5);

// Deriva la modalidad normalizada de un box a partir de tipo o nombre
// (sin acentos: "Médico" y "medico" se tratan igual)
export function normTipoBox(box) {
  const t = ((box?.tipo || box?.nombre) || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (t.includes("dental")) return "dental";
  if (t.includes("medic"))  return "medico";
  return "estetico";
}

export const recursoDeTipo = tipo =>
  tipo === "medico" ? RECURSO_MEDICO : RECURSO_DENTAL_ESTETICO;

export const recursoDeBox = box => recursoDeTipo(normTipoBox(box));

// Modalidades (box_tipo de solicitudes_paciente) que ocupan un recurso
export const tiposDelRecurso = recurso =>
  recurso === RECURSO_MEDICO ? ["medico"] : ["dental", "estetico"];

// Ids de todos los boxes que comparten el recurso físico del box dado
export function boxIdsDelRecurso(boxes, box) {
  const recurso = recursoDeBox(box);
  return (boxes || []).filter(b => recursoDeBox(b) === recurso).map(b => b.id);
}

export const minHorasDeBox = box => MIN_HORAS[normTipoBox(box)] || 1;

// Solapamiento de intervalos semiabiertos [ini, fin): las reservas
// consecutivas (10-11 y 11-12) NO chocan.
export function seSolapan(ini1, fin1, ini2, fin2) {
  return normHora(ini1) < normHora(fin2) && normHora(ini2) < normHora(fin1);
}

// Estados de arriendo que ocupan calendario (criterio histórico del sistema)
export const ESTADOS_OCUPAN = ["pendiente", "confirmado"];
// Estados de cita de paciente que ocupan calendario ('agendado' en masculino
// lo escribe el panel admin en App.js al marcar la solicitud como agendada)
export const ESTADOS_CITA_OCUPAN = ["agendada", "agendado", "contactado", "confirmada"];

// Arriendos que chocan con [horaInicio, horaFin) en el recurso físico del box
export function conflictosArriendo({ boxes, arriendos, box, fecha, horaInicio, horaFin, ignorarId = null }) {
  const ids = boxIdsDelRecurso(boxes, box);
  return (arriendos || []).filter(a =>
    a.id !== ignorarId &&
    ids.includes(a.box_id) &&
    a.fecha === fecha &&
    ESTADOS_OCUPAN.includes(a.estado) &&
    seSolapan(horaInicio, horaFin, a.hora_inicio, a.hora_fin)
  );
}

// Citas de paciente que chocan con [horaInicio, horaFin) en el recurso del box
export function conflictosCita({ solicitudes, box, fecha, horaInicio, horaFin }) {
  const tipos = tiposDelRecurso(recursoDeBox(box));
  return (solicitudes || []).filter(s =>
    tipos.includes(s.box_tipo) &&
    s.fecha_solicitada === fecha &&
    ESTADOS_CITA_OCUPAN.includes(s.estado) &&
    s.hora_inicio && s.hora_fin &&
    seSolapan(horaInicio, horaFin, s.hora_inicio, s.hora_fin)
  );
}

export function validarDuracionMinima(box, horas) {
  const minimo = minHorasDeBox(box);
  return { valido: horas >= minimo, minimo };
}

// Precios por modalidad (catálogo comercial vigente de la landing/planes):
//   Estético: mín 1h · $10.000/hr · bloque 2h $18.000 · jornada 5h $45.000
//   Dental:   mín 2h · $9.000/hr  · jornada 5h $45.000
//   Médico:   mín 2h · $12.000/hr · jornada 5h $55.000
export function calcularPrecio(tipoBox, horas) {
  const tipo = normTipoBox({ tipo: tipoBox });
  if (tipo === "dental") {
    if (horas < 2)   return { monto: 0,           label: "Mínimo 2 horas en box dental",  valido: false };
    if (horas === 2) return { monto: 18000,       label: "2 horas · $9.000/hr",           valido: true };
    if (horas < 5)   return { monto: horas * 9000, label: `${horas} horas · $9.000/hr`,   valido: true };
    return             { monto: 45000,            label: "Jornada (5h) · $45.000",        valido: true };
  }
  if (tipo === "medico") {
    if (horas < 2)   return { monto: 0,            label: "Mínimo 2 horas consecutivas en box médico", valido: false };
    if (horas < 5)   return { monto: horas * 12000, label: `${horas} horas · $12.000/hr`,  valido: true };
    return             { monto: 55000,             label: "Jornada (5h) · $55.000",        valido: true };
  }
  if (horas < 1)   return { monto: 0,             label: "Mínimo 1 hora",                 valido: false };
  if (horas === 1) return { monto: 10000,         label: "1 hora · $10.000",              valido: true };
  if (horas === 2) return { monto: 18000,         label: "Bloque 2 horas · $18.000",      valido: true };
  if (horas < 5)   return { monto: horas * 10000, label: `${horas} horas · $10.000/hr`,   valido: true };
  return             { monto: 45000,              label: "Jornada (5h) · $45.000",        valido: true };
}

// Desempate determinístico entre dos reservas que entraron en carrera:
// gana la más antigua por created_at y, a igualdad, la de id menor.
// Ambos lados de la carrera llegan a la misma conclusión.
export function ganaCarrera(mio, otro) {
  const tMio = mio.created_at || "", tOtro = otro.created_at || "";
  if (tMio !== tOtro) return tMio < tOtro;
  return String(mio.id) < String(otro.id);
}
