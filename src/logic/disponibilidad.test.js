// Pruebas obligatorias de disponibilidad — estructura definitiva v3:
//   - Box Dental: independiente.
//   - Box Mixto: Médico y Estético comparten UN espacio físico (agenda única).
//   - Pabellón: independiente, bloques de 1/2/4/8 horas.
// Cubre: bloqueo cruzado Médico↔Estético, independencia de Dental y Pabellón,
// mínimo 2h del médico, cancelaciones, consecutivos, solapamientos parciales,
// desempate de reservas simultáneas y precios por modalidad.

import * as esm from "./disponibilidad";
const cjs = require("../../api/_lib/disponibilidad");

const BOXES = [
  { id: "est", nombre: "Box 1 – Estético", tipo: "estetico", activo: true },
  { id: "den", nombre: "Box dental",       tipo: "dental",   activo: true },
  { id: "med", nombre: "Box 3 – Médico",   tipo: "medico",   activo: true },
  { id: "pab", nombre: "Pabellón",         tipo: "pabellon", activo: true },
];
const [EST, DEN, MED, PAB] = BOXES;

const arr = (box_id, fecha, hora_inicio, hora_fin, estado = "pendiente", extra = {}) =>
  ({ id: `${box_id}-${fecha}-${hora_inicio}`, box_id, box_nombre: box_id, fecha, hora_inicio, hora_fin, estado, ...extra });

const conflictos = (impl, { arriendos, box, fecha, horaInicio, horaFin }) =>
  impl.conflictosArriendo({ boxes: BOXES, arriendos, box, fecha, horaInicio, horaFin });

// Toda la suite corre contra el módulo del frontend (ESM) y contra el espejo
// CommonJS que usan las funciones serverless, para garantizar paridad.
describe.each([["frontend (src/logic)", esm], ["serverless (api/_lib)", cjs]])("%s", (_nombre, d) => {

  describe("Box Mixto: recurso físico compartido Médico + Estético", () => {
    test("una reserva MÉDICA bloquea el mismo horario en ESTÉTICO", () => {
      const ocupado = [arr("med", "2026-10-01", "10:00", "12:00")];
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "11:00" })).toHaveLength(1);
    });

    test("una reserva ESTÉTICA bloquea el mismo horario en MÉDICO", () => {
      const ocupado = [arr("est", "2026-10-01", "10:00", "12:00")];
      expect(conflictos(d, { arriendos: ocupado, box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });

    test("ambos boxes comparten exactamente el mismo recurso", () => {
      expect(d.recursoDeBox(EST)).toBe(d.recursoDeBox(MED));
      expect(d.recursoDeBox(EST)).toBe("medico_estetico");
      expect(d.boxIdsDelRecurso(BOXES, EST).sort()).toEqual(["est", "med"]);
    });
  });

  describe("independencia del Box Dental", () => {
    test("una reserva DENTAL no bloquea Médico/Estético", () => {
      const ocupado = [arr("den", "2026-10-01", "10:00", "12:00")];
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: ocupado, box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("una reserva Médica/Estética no bloquea el Box Dental", () => {
      const ocupado = [arr("med", "2026-10-01", "10:00", "12:00"), arr("est", "2026-10-01", "14:00", "16:00")];
      expect(conflictos(d, { arriendos: ocupado, box: DEN, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: ocupado, box: DEN, fecha: "2026-10-01", horaInicio: "14:00", horaFin: "16:00" })).toHaveLength(0);
    });

    test("el dental tiene su propio recurso", () => {
      expect(d.recursoDeBox(DEN)).toBe("dental");
      expect(d.boxIdsDelRecurso(BOXES, DEN)).toEqual(["den"]);
    });
  });

  describe("independencia del Pabellón", () => {
    test("una reserva de PABELLÓN no bloquea a ningún otro espacio", () => {
      const ocupado = [arr("pab", "2026-10-01", "10:00", "14:00")];
      for (const box of [EST, DEN, MED]) {
        expect(conflictos(d, { arriendos: ocupado, box, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      }
    });

    test("las reservas de los demás espacios no bloquean el Pabellón", () => {
      const ocupado = [
        arr("den", "2026-10-01", "10:00", "12:00"),
        arr("med", "2026-10-01", "10:00", "12:00"),
      ];
      expect(conflictos(d, { arriendos: ocupado, box: PAB, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("el pabellón tiene su propio recurso y sí choca consigo mismo", () => {
      expect(d.recursoDeBox(PAB)).toBe("pabellon");
      const ocupado = [arr("pab", "2026-10-01", "10:00", "14:00")];
      expect(conflictos(d, { arriendos: ocupado, box: PAB, fecha: "2026-10-01", horaInicio: "12:00", horaFin: "13:00" })).toHaveLength(1);
    });
  });

  describe("mínimo 2 horas del Box Médico (exclusivo de la modalidad médica)", () => {
    test("1 hora en médico es rechazada", () => {
      expect(d.validarDuracionMinima(MED, 1)).toEqual({ valido: false, minimo: 2 });
      expect(d.calcularPrecio("medico", 1).valido).toBe(false);
    });

    test("2 y 3 horas en médico son válidas", () => {
      expect(d.validarDuracionMinima(MED, 2).valido).toBe(true);
      expect(d.calcularPrecio("medico", 2)).toMatchObject({ monto: 24000, valido: true });
      expect(d.calcularPrecio("medico", 3)).toMatchObject({ monto: 36000, valido: true });
    });

    test("no afecta a Estético ni a Dental (1 hora válida en ambos)", () => {
      expect(d.validarDuracionMinima(EST, 1).valido).toBe(true);
      expect(d.validarDuracionMinima(DEN, 1).valido).toBe(true);
    });

    test("el pabellón permite bloques desde 1 hora", () => {
      expect(d.validarDuracionMinima(PAB, 1).valido).toBe(true);
    });
  });

  describe("solapamientos en el Box Mixto: consecutivos, parciales y 2-3h", () => {
    const ocupado = [arr("med", "2026-10-01", "10:00", "12:00")];

    test("reserva consecutiva (12:00 tras una que termina 12:00) NO choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "12:00", horaFin: "14:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "08:00", horaFin: "10:00" })).toHaveLength(0);
    });

    test("solapamiento parcial por el inicio y por el fin SÍ choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "11:00", horaFin: "13:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "09:00", horaFin: "11:00" })).toHaveLength(1);
    });

    test("una reserva larga que envuelve a la ocupada SÍ choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "09:00", horaFin: "13:00" })).toHaveLength(1);
    });

    test("una reserva contenida dentro de la ocupada SÍ choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "11:00" })).toHaveLength(1);
    });

    test("otro día no choca", () => {
      expect(conflictos(d, { arriendos: ocupado, box: EST, fecha: "2026-10-02", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("horas con segundos de Postgres (HH:MM:SS) se normalizan", () => {
      const conSegundos = [arr("med", "2026-10-01", "10:00:00", "12:00:00")];
      expect(conflictos(d, { arriendos: conSegundos, box: EST, fecha: "2026-10-01", horaInicio: "11:00", horaFin: "13:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: conSegundos, box: EST, fecha: "2026-10-01", horaInicio: "12:00", horaFin: "13:00" })).toHaveLength(0);
    });

    test("tramos a la media hora también chocan correctamente", () => {
      const media = [arr("est", "2026-10-01", "09:30", "10:30")];
      expect(conflictos(d, { arriendos: media, box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: media, box: MED, fecha: "2026-10-01", horaInicio: "10:30", horaFin: "12:30" })).toHaveLength(0);
    });
  });

  describe("cancelación libera el horario para ambas modalidades del Mixto", () => {
    test("una reserva médica cancelada deja libre Médico y Estético", () => {
      const cancelada = [arr("med", "2026-10-01", "10:00", "12:00", "cancelado")];
      expect(conflictos(d, { arriendos: cancelada, box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: cancelada, box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("una reserva estética cancelada deja libre Médico y Estético", () => {
      const cancelada = [arr("est", "2026-10-01", "10:00", "12:00", "cancelado")];
      expect(conflictos(d, { arriendos: cancelada, box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(conflictos(d, { arriendos: cancelada, box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
    });

    test("pendiente y confirmado sí ocupan", () => {
      expect(conflictos(d, { arriendos: [arr("med", "2026-10-01", "10:00", "12:00", "pendiente")], box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
      expect(conflictos(d, { arriendos: [arr("est", "2026-10-01", "10:00", "12:00", "confirmado")], box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });
  });

  describe("citas de pacientes sobre los recursos", () => {
    const cita = (box_tipo, extra = {}) => ({
      box_tipo, fecha_solicitada: "2026-10-01", hora_inicio: "10:00:00", hora_fin: "11:00:00", estado: "agendada", ...extra,
    });

    test("una cita médica bloquea la vista estética y viceversa", () => {
      expect(d.conflictosCita({ solicitudes: [cita("medico")], box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
      expect(d.conflictosCita({ solicitudes: [cita("estetico")], box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });

    test("una cita dental NO bloquea el Box Mixto, y sí bloquea el Dental", () => {
      expect(d.conflictosCita({ solicitudes: [cita("dental")], box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(d.conflictosCita({ solicitudes: [cita("dental")], box: MED, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(d.conflictosCita({ solicitudes: [cita("dental")], box: DEN, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });

    test("ninguna cita bloquea el Pabellón", () => {
      for (const t of ["dental", "medico", "estetico"]) {
        expect(d.conflictosCita({ solicitudes: [cita(t)], box: PAB, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      }
    });

    test("una cita cancelada o pendiente no bloquea; 'agendado' sí", () => {
      expect(d.conflictosCita({ solicitudes: [cita("medico", { estado: "cancelada" })], box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(d.conflictosCita({ solicitudes: [cita("medico", { estado: "pendiente" })], box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(0);
      expect(d.conflictosCita({ solicitudes: [cita("medico", { estado: "agendado" })], box: EST, fecha: "2026-10-01", horaInicio: "10:00", horaFin: "12:00" })).toHaveLength(1);
    });
  });

  describe("reservas simultáneas: desempate determinístico", () => {
    test("solo una de dos reservas simultáneas puede quedarse (gana la más antigua)", () => {
      const a = { id: "aaa", created_at: "2026-10-01T10:00:00.000Z" };
      const b = { id: "bbb", created_at: "2026-10-01T10:00:00.100Z" };
      expect(d.ganaCarrera(a, b)).toBe(true);
      expect(d.ganaCarrera(b, a)).toBe(false);
    });

    test("con created_at idéntico desempata por id — ambas llegan a la misma conclusión", () => {
      const a = { id: "aaa", created_at: "2026-10-01T10:00:00.000Z" };
      const b = { id: "bbb", created_at: "2026-10-01T10:00:00.000Z" };
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

    test("dental: sin mínimo · $15.000/hr (tarifa Flex) hasta 3h · más = jornada $45.000", () => {
      expect(d.calcularPrecio("dental", 1)).toMatchObject({ monto: 15000, valido: true });
      expect(d.calcularPrecio("dental", 2).monto).toBe(30000);
      expect(d.calcularPrecio("dental", 3).monto).toBe(45000);
      expect(d.calcularPrecio("dental", 5).monto).toBe(45000);
    });

    test("médico: mínimo 2h · $12.000/hr hasta 3h · más de 3h = jornada $55.000", () => {
      expect(d.calcularPrecio("medico", 1).valido).toBe(false);
      expect(d.calcularPrecio("medico", 2).monto).toBe(24000);
      expect(d.calcularPrecio("medico", 3).monto).toBe(36000);
      expect(d.calcularPrecio("medico", 4).monto).toBe(55000);
    });

    test("pabellón: SOLO bloques 1h $55.000 · 2h $100.000 · 4h $200.000 · 8h $360.000", () => {
      expect(d.calcularPrecio("pabellon", 1)).toMatchObject({ monto: 55000, valido: true });
      expect(d.calcularPrecio("pabellon", 2)).toMatchObject({ monto: 100000, valido: true });
      expect(d.calcularPrecio("pabellon", 4)).toMatchObject({ monto: 200000, valido: true });
      expect(d.calcularPrecio("pabellon", 8)).toMatchObject({ monto: 360000, valido: true });
      expect(d.calcularPrecio("pabellon", 3).valido).toBe(false);
      expect(d.calcularPrecio("pabellon", 5).valido).toBe(false);
    });

    test("funciona también con el nombre del box (fallback tipo→nombre)", () => {
      expect(d.calcularPrecio("Box 3 – Médico", 1).valido).toBe(false);
      expect(d.calcularPrecio("Pabellón", 4).monto).toBe(200000);
      expect(d.calcularPrecio("Box dental", 1).monto).toBe(15000);
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
      ["pabellon", 1], ["pabellon", 2], ["pabellon", 3], ["pabellon", 4], ["pabellon", 8],
    ];
    for (const [tipo, horas] of casos) {
      expect(esm.calcularPrecio(tipo, horas)).toEqual(cjs.calcularPrecio(tipo, horas));
    }
    for (const box of BOXES) {
      expect(esm.recursoDeBox(box)).toBe(cjs.recursoDeBox(box));
      expect(esm.minHorasDeBox(box)).toBe(cjs.minHorasDeBox(box));
      expect(esm.boxIdsDelRecurso(BOXES, box)).toEqual(cjs.boxIdsDelRecurso(BOXES, box));
      expect(esm.tiposDelRecurso(esm.recursoDeBox(box))).toEqual(cjs.tiposDelRecurso(cjs.recursoDeBox(box)));
    }
    expect(esm.MIN_HORAS).toEqual(cjs.MIN_HORAS);
    expect(esm.ESTADOS_OCUPAN).toEqual(cjs.ESTADOS_OCUPAN);
    expect(esm.ESTADOS_CITA_OCUPAN).toEqual(cjs.ESTADOS_CITA_OCUPAN);
  });
});
