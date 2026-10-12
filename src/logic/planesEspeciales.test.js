// Pruebas de la lógica de Planes Especiales (api/_lib/planesEspeciales.js):
// generación de jornadas, validación de horario/vigencia y detección de
// conflictos sobre el recurso físico compartido. La lógica vive en el
// servidor (los planes especiales no forman parte del bundle público).

const PE = require("../../api/_lib/planesEspeciales");

describe("calendario", () => {
  test("día ISO (1=Lunes … 7=Domingo)", () => {
    expect(PE.diaIso("2026-10-12")).toBe(1); // lunes
    expect(PE.diaIso("2026-10-17")).toBe(6); // sábado
    expect(PE.diaIso("2026-10-18")).toBe(7); // domingo
  });

  test("vigencia anual termina el día anterior al aniversario", () => {
    expect(PE.finDeVigencia("2026-11-01", 12)).toBe("2027-10-31");
    expect(PE.finDeVigencia("2026-10-13", 12)).toBe("2027-10-12");
  });

  test("vigencia desde un 31 termina el último día del mes destino", () => {
    expect(PE.finDeVigencia("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("validación de horario semanal", () => {
  const h = (dia, ini = "09:00", fin = "14:00") => ({ dia, hora_inicio: ini, hora_fin: fin });

  test("Plan Especial Dental exige exactamente 3 jornadas semanales", () => {
    expect(PE.validarHorario([h(1), h(3), h(5)], 3).ok).toBe(true);
    expect(PE.validarHorario([h(1), h(3)], 3)).toMatchObject({ ok: false });
    expect(PE.validarHorario([h(1), h(2), h(3), h(4)], 3)).toMatchObject({ ok: false });
  });

  test("Plan Especial Estético: 2 días completos (08:00–20:00)", () => {
    expect(PE.validarHorario([h(2, "08:00", "20:00"), h(4, "08:00", "20:00")], 2).ok).toBe(true);
  });

  test("rechaza días repetidos, horario fuera de 08:00–20:00 o invertido", () => {
    expect(PE.validarHorario([h(1), h(1), h(3)], 3).ok).toBe(false);
    expect(PE.validarHorario([h(1, "07:00", "12:00")], 1).ok).toBe(false);
    expect(PE.validarHorario([h(1, "15:00", "21:00")], 1).ok).toBe(false);
    expect(PE.validarHorario([h(1, "14:00", "09:00")], 1).ok).toBe(false);
    expect(PE.validarHorario([], 1).ok).toBe(false);
  });

  test("respeta el mínimo de horas del box (médico 2 h)", () => {
    expect(PE.validarHorario([h(1, "09:00", "10:00")], 1, 2).ok).toBe(false);
    expect(PE.validarHorario([h(1, "09:00", "11:00")], 1, 2).ok).toBe(true);
  });

  test("normaliza el orden de los días", () => {
    expect(PE.validarHorario([h(5), h(1), h(3)], 3).horario.map(x => x.dia)).toEqual([1, 3, 5]);
  });
});

describe("vigencia", () => {
  test("no admite inicio en el pasado ni término antes del inicio", () => {
    expect(PE.validarVigencia("2026-10-01", "2027-09-30", 12, "2026-10-12").ok).toBe(false);
    expect(PE.validarVigencia("2026-10-13", "2026-10-12", 12, "2026-10-12").ok).toBe(false);
  });

  test("no supera la vigencia anual del plan", () => {
    expect(PE.validarVigencia("2026-10-13", "2027-10-12", 12, "2026-10-12").ok).toBe(true);
    expect(PE.validarVigencia("2026-10-13", "2027-10-13", 12, "2026-10-12").ok).toBe(false);
  });
});

describe("generación de jornadas", () => {
  const horario = [
    { dia: 1, hora_inicio: "09:00", hora_fin: "14:00" },
    { dia: 3, hora_inicio: "14:00", hora_fin: "19:00" },
    { dia: 5, hora_inicio: "09:00", hora_fin: "14:00" },
  ];

  test("3 jornadas semanales durante un año ≈ 156 jornadas", () => {
    const j = PE.generarJornadas(horario, "2026-10-12", PE.finDeVigencia("2026-10-12", 12));
    expect(j.length).toBeGreaterThanOrEqual(155);
    expect(j.length).toBeLessThanOrEqual(158);
    expect(j.every(x => [1, 3, 5].includes(PE.diaIso(x.fecha)))).toBe(true);
  });

  test("cada jornada usa el horario de su día", () => {
    const j = PE.generarJornadas(horario, "2026-10-12", "2026-10-18");
    expect(j).toEqual([
      { fecha: "2026-10-12", hora_inicio: "09:00", hora_fin: "14:00" },
      { fecha: "2026-10-14", hora_inicio: "14:00", hora_fin: "19:00" },
      { fecha: "2026-10-16", hora_inicio: "09:00", hora_fin: "14:00" },
    ]);
  });

  test("las fechas excluidas a mano quedan fuera", () => {
    const j = PE.generarJornadas(horario, "2026-10-12", "2026-10-18", ["2026-10-14"]);
    expect(j.map(x => x.fecha)).toEqual(["2026-10-12", "2026-10-16"]);
  });
});

describe("conflictos sobre el recurso físico", () => {
  const jornadas = [
    { fecha: "2026-10-12", hora_inicio: "09:00", hora_fin: "14:00" },
    { fecha: "2026-10-14", hora_inicio: "09:00", hora_fin: "14:00" },
  ];
  const arr = (fecha, ini, fin, extra = {}) => ({ id: fecha + ini, fecha, hora_inicio: ini, hora_fin: fin, estado: "confirmado", box_nombre: "Pabellón", profesional_nombre: "Otra", ...extra });

  test("una reserva de Pabellón solapada es conflicto (Dental y Pabellón comparten espacio)", () => {
    const c = PE.detectarConflictos(jornadas, [arr("2026-10-12", "12:00", "13:00")], []);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ fecha: "2026-10-12", ocupa: "12:00–13:00" });
  });

  test("reservas consecutivas o canceladas no son conflicto", () => {
    expect(PE.detectarConflictos(jornadas, [arr("2026-10-12", "14:00", "16:00")], [])).toHaveLength(0);
    expect(PE.detectarConflictos(jornadas, [arr("2026-10-12", "10:00", "11:00", { estado: "cancelado" })], [])).toHaveLength(0);
  });

  test("una cita de paciente agendada es conflicto; una pendiente no", () => {
    const cita = (estado) => ({ box_tipo: "dental", fecha_solicitada: "2026-10-14", hora_inicio: "10:00:00", hora_fin: "11:00:00", estado });
    expect(PE.detectarConflictos(jornadas, [], [cita("agendada")])).toHaveLength(1);
    expect(PE.detectarConflictos(jornadas, [], [cita("pendiente")])).toHaveLength(0);
  });

  test("al modificar, las jornadas propias del plan no cuentan como conflicto", () => {
    const propia = arr("2026-10-12", "09:00", "14:00", { plan_profesional_id: "PLAN-1" });
    expect(PE.detectarConflictos(jornadas, [propia], [], "PLAN-1")).toHaveLength(0);
    expect(PE.detectarConflictos(jornadas, [propia], [], "OTRO")).toHaveLength(1);
  });
});
