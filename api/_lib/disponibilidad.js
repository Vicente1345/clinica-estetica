// Espejo CommonJS de src/logic/disponibilidad.js para las funciones
// serverless de Vercel. Mantener AMBOS archivos sincronizados — el test
// de paridad en src/logic/disponibilidad.test.js compara los dos.
// (Los archivos api/_* no se exponen como endpoints en Vercel.)

const RECURSO_DENTAL_ESTETICO = "dental_estetico";
const RECURSO_MEDICO          = "medico";

const MIN_HORAS = { estetico: 1, dental: 1, medico: 2 };

const normHora = h => (h || "").slice(0, 5);

function normTipoBox(box) {
  const t = ((box?.tipo || box?.nombre) || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (t.includes("dental")) return "dental";
  if (t.includes("medic"))  return "medico";
  return "estetico";
}

const recursoDeTipo = tipo =>
  tipo === "medico" ? RECURSO_MEDICO : RECURSO_DENTAL_ESTETICO;

const recursoDeBox = box => recursoDeTipo(normTipoBox(box));

const tiposDelRecurso = recurso =>
  recurso === RECURSO_MEDICO ? ["medico"] : ["dental", "estetico"];

function boxIdsDelRecurso(boxes, box) {
  const recurso = recursoDeBox(box);
  return (boxes || []).filter(b => recursoDeBox(b) === recurso).map(b => b.id);
}

const minHorasDeBox = box => MIN_HORAS[normTipoBox(box)] || 1;

function seSolapan(ini1, fin1, ini2, fin2) {
  return normHora(ini1) < normHora(fin2) && normHora(ini2) < normHora(fin1);
}

const ESTADOS_OCUPAN = ["pendiente", "confirmado"];
const ESTADOS_CITA_OCUPAN = ["agendada", "agendado", "contactado", "confirmada"];

function conflictosArriendo({ boxes, arriendos, box, fecha, horaInicio, horaFin, ignorarId = null }) {
  const ids = boxIdsDelRecurso(boxes, box);
  return (arriendos || []).filter(a =>
    a.id !== ignorarId &&
    ids.includes(a.box_id) &&
    a.fecha === fecha &&
    ESTADOS_OCUPAN.includes(a.estado) &&
    seSolapan(horaInicio, horaFin, a.hora_inicio, a.hora_fin)
  );
}

function conflictosCita({ solicitudes, box, fecha, horaInicio, horaFin }) {
  const tipos = tiposDelRecurso(recursoDeBox(box));
  return (solicitudes || []).filter(s =>
    tipos.includes(s.box_tipo) &&
    s.fecha_solicitada === fecha &&
    ESTADOS_CITA_OCUPAN.includes(s.estado) &&
    s.hora_inicio && s.hora_fin &&
    seSolapan(horaInicio, horaFin, s.hora_inicio, s.hora_fin)
  );
}

function validarDuracionMinima(box, horas) {
  const minimo = minHorasDeBox(box);
  return { valido: horas >= minimo, minimo };
}

function calcularPrecio(tipoBox, horas) {
  const tipo = normTipoBox({ tipo: tipoBox });
  if (tipo === "dental") {
    if (horas < 1)   return { monto: 0,           label: "Mínimo 1 hora",                 valido: false };
    if (horas < 5)   return { monto: horas * 9000, label: `${horas} hora${horas > 1 ? "s" : ""} · $9.000/hr`, valido: true };
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

function ganaCarrera(mio, otro) {
  const tMio = mio.created_at || "", tOtro = otro.created_at || "";
  if (tMio !== tOtro) return tMio < tOtro;
  return String(mio.id) < String(otro.id);
}

module.exports = {
  RECURSO_DENTAL_ESTETICO, RECURSO_MEDICO, MIN_HORAS,
  normHora, normTipoBox, recursoDeTipo, recursoDeBox, tiposDelRecurso,
  boxIdsDelRecurso, minHorasDeBox, seSolapan,
  ESTADOS_OCUPAN, ESTADOS_CITA_OCUPAN,
  conflictosArriendo, conflictosCita, validarDuracionMinima,
  calcularPrecio, ganaCarrera,
};
