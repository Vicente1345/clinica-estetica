// Pruebas obligatorias de disponibilidad (punto 10 de la especificación):
// bloqueo cruzado Dental↔Estético, independencia del Box Médico, mínimo 2h
// médico, cancelaciones, horarios consecutivos, solapamientos parciales,
// desempate de reservas simultáneas y cálculo de precios por modalidad.

import * as esm from "./disponibilidad";
const cjs = require("../../api/_lib/disponibilidad");

const BOXES = [
  { id: "est", nombre: "Box 1 – Estético", tipo: "estetico", activo: true },
  { id: "den", nombre: "Box 2 – Dental",   tipo: "dental",   activo: true },
  { id: "med", nombre: "Box 3 – Médico",   tipo: "medico",   activo: true },
];
const [EST, DEN, MED] = BOXES;

const arr = (box_id, fecha, hora_inicio, hora_fin, estado = "pendiente", extra = {}) =>
  ({ id: `${box_id}-${fecha}-${hora_inicio}`, box_id, box_nombre: box_id, fecha, hora_inicio, hora_fin, estado, ...extra });

const conflictos = (impl, { arriendos, box, fecha, horaInicio, horaFin }) =>
  impl.conflictosArriendo({ boxes: BOXES, arriendos, box, fecha, horaInicio, horaFin });

// Toda la suite corre contra el módulo del frontend (ESM) y contra el espejo
// CommonJS que usan las funciones serverless, para garantizar paridad.
describe.each([["frontend (src/logic)", esm], ["serverless (api/_lib)", cjs]])("%s", (_nombre, d) => {

  describe("recurso físico compartido Dental + Estético", () => {
    test("una reserva DENTAL bloquea el mismo horario en ESTÉTICO", () => {
      const ocupado = [arr("den", "2026-09-01", "10:00", "11:00")];
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "11:00" })).toHaveLength(1);
    });

    test("una reserva ESTÉTICA bloquea el mismo horario en DENTAL", () => {
      const ocupado = [arr("est", "2026-09-01", "10:00", "12:00")];
      expect(conflictos(d, { arriendos: ocupado, box: DEN, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });

    test("ambos boxes comparten exactamente el mismo recurso", () => {
      expect(d.recursoDeBox(EST)).toBe(d.recursoDeBox(DEN));
      expect(d.boxIdsDelRecurso(BOXES, EST).sort()).toEqual(["den", "est"]);
    });
  });

  describe("independencia del Box Médico", () => {
    test("una reserva MÉDICA no bloquea Dental/Estético", () => {
      const ocupado = [arr("med", "2026-09-01", "10:00", "12:00")];
      expect(conflictos(d, { arriendos: ocupado, box: DEN, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("una reserva Dental/Estética no bloquea el Box Médico", () => {
      const ocupado = [arr("den", "2026-09-01", "10:00", "12:00"), arr("est", "2026-09-01", "14:00", "16:00")];
      expect(conflictos(d, { arriendos: ocupado, box: MED, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: ocupado, box: MED, fecha: "2026-09-01", horaInicio: "14:00", horaFin: "16:00" })).toHaveLength(0);
    });

    test("el médico tiene su propio recurso", () => {
      expect(d.recursoDeBox(MED)).toBe("medico");
      expect(d.boxIdsDelRecurso(BOXES, MED)).toEqual(["med"]);
    });
  });

  describe("mínimo 2 horas del Box Médico (exclusivo de médico)", () => {
    test("1 hora en médico es rechazada", () => {
      expect(d.validarDuracionMinima(MED, 1)).toEqual({ valido: false, minimo: 2 });
      expect(d.calcularPrecio("medico", 1).valido).toBe(false);
    });

    test("2 y 3 horas en médico son válidas", () => {
      expect(d.validarDuracionMinima(MED, 2).valido).toBe(true);
      expect(d.validarDuracionMinima(MED, 3).valido).toBe(true);
      expect(d.calcularPrecio("medico", 2)).toMatchObject({ monto: 24000, valido: true });
      expect(d.calcularPrecio("medico", 3)).toMatchObject({ monto: 36000, valido: true });
    });

    test("no afecta a Estético (1 hora sigue siendo válida)", () => {
      expect(d.validarDuracionMinima(EST, 1).valido).toBe(true);
      expect(d.calcularPrecio("estetico", 1)).toMatchObject({ monto: 10000, valido: true });
    });

    test("no afecta a Dental (sin mínimo: 1 hora es válida)", () => {
      expect(d.validarDuracionMinima(DEN, 1).valido).toBe(true);
      expect(d.validarDuracionMinima(DEN, 2).valido).toBe(true);
    });
  });

  describe("solapamientos: consecutivos, parciales y duraciones 2-3h", () => {
    const ocupado = [arr("den", "2026-09-01", "10:00", "12:00")];

    test("reserva consecutiva (12:00 tras una que termina 12:00) NO choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "12:00", horaFin: "14:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "08:00", horaFin: "10:00" })).toHaveLength(0);
    });

    test("solapamiento parcial por el inicio y por el fin SÍ choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "11:00", horaFin: "13:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "09:00", horaFin: "11:00" })).toHaveLength(1);
    });

    test("una reserva larga que envuelve a la ocupada SÍ choca (3h sobre 2h)", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "09:00", horaFin: "13:00" })).toHaveLength(1);
    });

    test("una reserva contenida dentro de la ocupada SÍ choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "11:00" })).toHaveLength(1);
    });

    test("otro día u otra fecha no choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-09-02", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("horas con segundos de Postgres (HH:MM:SS) se normalizan", () => {
      const conSegundos = [arr("den", "2026-09-01", "10:00:00", "12:00:00")];
      expect(conflictos(d, { arriendos: conSegundos, box: EST, fecha: "2026-09-01", horaInicio: "11:00", horaFin: "13:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: conSegundos, box: EST, fecha: "2026-09-01", horaInicio: "12:00", horaFin: "13:00" })).toHaveLength(0);
    });
  });

  describe("cancelación libera el horario para ambas modalidades", () => {
    test("una reserva dental cancelada deja libre Dental y Estético", () => {
      const cancelada = [arr("den", "2026-09-01", "10:00", "12:00", "cancelado")];
      expect(conflictos(d, { arriendos: cancelada, box: DEN, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: cancelada, box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("una reserva estética cancelada deja libre Dental y Estético", () => {
      const cancelada = [arr("est", "2026-09-01", "10:00", "12:00", "cancelado")];
      expect(conflictos(d, { arriendos: cancelada, box: DEN, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: cancelada, box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("pendiente y confirmado sí ocupan", () => {
      expect(conflictos(d, { arriendos: [arr("den", "2026-09-01", "10:00", "12:00", "pendiente")], box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: [arr("den", "2026-09-01", "10:00", "12:00", "confirmado")], box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });
  });

  describe("citas de pacientes sobre el recurso compartido", () => {
    const cita = (box_tipo, extra = {}) => ({
      box_tipo, fecha_solicitada: "2026-09-01", hora_inicio: "10:00:00", hora_fin: "11:00:00", estado: "agendada", ...extra,
    });

    test("una cita dental bloquea la vista estética y viceversa", () => {
      expect(d.conflictosCita({ solicitudes: [cita("dental")], box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
      expect(d.conflictosCita({ solicitudes: [cita("estetico")], box: DEN, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });

    test("una cita médica NO bloquea Dental/Estético, y sí bloquea Médico", () => {
      expect(d.conflictosCita({ solicitudes: [cita("medico")], box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(d.conflictosCita({ solicitudes: [cita("medico")], box: MED, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });

    test("una cita cancelada o pendiente no bloquea", () => {
      expect(d.conflictosCita({ solicitudes: [cita("dental", { estado: "cancelada" })], box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(d.conflictosCita({ solicitudes: [cita("dental", { estado: "pendiente" })], box: EST, fecha: "2026-09-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });
  });

  describe("reservas simultáneas: desempate determinístico", () => {
    test("solo una de dos reservas simultáneas puede quedarse (gana la más antigua)", () => {
      const a = { id: "aaa", created_at: "2026-09-01T10:00:00.000Z" };
      const b = { id: "bbb", created_at: "2026-09-01T10:00:00.100Z" };
      expect(d.ganaCarrera(a, b)).toBe(true);   // a se queda
      expect(d.ganaCarrera(b, a)).toBe(false);  // b se elimina
    });

    test("con created_at idéntico desempata por id — ambas llegan a la misma conclusión", () => {
      const a = { id: "aaa", created_at: "2026-09-01T10:00:00.000Z" };
      const b = { id: "bbb", created_at: "2026-09-01T10:00:00.000Z" };
      expect(d.ganaCarrera(a, b)).toBe(true);
      expect(d.ganaCarrera(b, a)).toBe(false);
    });
  });

  describe("precios por modalidad (catálogo comercial)", () => {
    test("estético: 1h $10.000 · 2h $18.000 · 3h $27.000 · más de 3h = jornada $45.000", () => {
      expect(d.calcularPrecio("estetico", 1).monto).toBe(10000);
      expect(d.calcularPrecio("estetico", 2).monto).toBe(18000);
      expect(d.calcularPrecio("estetico", 3).monto).toBe(27000);
      expect(d.calcularPrecio("estetico", 4).monto).toBe(45000);
      expect(d.calcularPrecio("estetico", 5).monto).toBe(45000);
    });

    test("dental: sin mínimo · 1h $9.000 · 2h $18.000 · 3h $27.000 · más de 3h = jornada $45.000", () => {
      expect(d.calcularPrecio("dental", 1)).toMatchObject({ monto: 9000, valido: true });
      expect(d.calcularPrecio("dental", 2).monto).toBe(18000);
      expect(d.calcularPrecio("dental", 3).monto).toBe(27000);
      expect(d.calcularPrecio("dental", 4).monto).toBe(45000);
      expect(d.calcularPrecio("dental", 5).monto).toBe(45000);
    });

    test("médico: mínimo 2h · $12.000/hr hasta 3h · más de 3h = jornada $55.000", () => {
      expect(d.calcularPrecio("medico", 1).valido).toBe(false);
      expect(d.calcularPrecio("medico", 2).monto).toBe(24000);
      expect(d.calcularPrecio("medico", 3).monto).toBe(36000);
      expect(d.calcularPrecio("medico", 4).monto).toBe(55000);
      expect(d.calcularPrecio("medico", 5).monto).toBe(55000);
    });

    test("funciona también con el nombre del box (fallback tipo→nombre)", () => {
      expect(d.calcularPrecio("Box 3 – Médico", 1).valido).toBe(false);
      expect(d.calcularPrecio("Box 2 – Dental", 2).monto).toBe(18000);
    });
  });
});

// ── Paridad estricta entre el módulo frontend y el espejo serverless ──
describe("paridad ESM ↔ CJS", () => {
  test("exportan las mismas funciones puras con los mismos resultados", () => {
    const casos = [
      ["estetico", 1], ["estetico", 2], ["estetico", 5],
      ["dental", 1], ["dental", 2], ["dental", 5],
      ["medico", 1], ["medico", 2], ["medico", 5],
    ];
    for (const [tipo, horas] of casos) {
      expect(esm.calcularPrecio(tipo, horas)).toEqual(cjs.calcularPrecio(tipo, horas));
    }
    for (const box of BOXES) {
      expect(esm.recursoDeBox(box)).toBe(cjs.recursoDeBox(box));
      expect(esm.minHorasDeBox(box)).toBe(cjs.minHorasDeBox(box));
      expect(esm.boxIdsDelRecurso(BOXES, box)).toEqual(cjs.boxIdsDelRecurso(BOXES, box));
    }
    expect(esm.MIN_HORAS).toEqual(cjs.MIN_HORAS);
    expect(esm.ESTADOS_OCUPAN).toEqual(cjs.ESTADOS_OCUPAN);
    expect(esm.ESTADOS_CITA_OCUPAN).toEqual(cjs.ESTADOS_CITA_OCUPAN);
  });
});
