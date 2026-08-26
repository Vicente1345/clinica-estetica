import { useState } from "react";
import {
  normTipoBox, recursoDeBox, tiposDelRecurso, normHora,
  ESTADOS_OCUPAN, ESTADOS_CITA_OCUPAN, seSolapan,
} from "./logic/disponibilidad";

const fmt = n => (n||0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const METODOS = ["Efectivo","Tarjeta débito","Tarjeta crédito","Transferencia","Webpay"];

// ─── ESTRUCTURA COMPLETA DE PLANES ────────────────────────────────
export const PLANES = {

  // ══════════════════════════════════════════════
  // BOX ESTÉTICO
  // ══════════════════════════════════════════════
  estetico: {
    nombre: "Box Estético",
    emoji: "✨",
    color:  "#E6F1FB",
    borde:  "#378ADD",
    texto:  "#042C53",
    secciones: [
      {
        id: "est_hora",
        titulo: "Por hora — sin compromiso",
        icono: "⏱",
        tipo: "suelta",
        opciones: [
          {
            id: "est_hora_sel",
            label: "Por hora",
            detalle: "Elige 1, 2 o 3 horas · el bloque de 2h tiene precio rebajado",
            precio: 10000,
            horasOpciones: [1, 2, 3],
            precios: { 1: 10000, 2: 18000, 3: 27000 },
            jornadas: null, meses: null, asistente: false,
            tag: "Desde $10.000",
            tagColor: "#1D9E75",
          },
          {
            id: "est_jornada", horasFijas: 5,
            label: "Jornada suelta (5 horas)",
            detalle: "5 horas corridas · sin horario fijo",
            precio: 45000,
            jornadas: null, meses: null, asistente: false,
            ref: "4 jornadas sueltas al mes = $180.000",
            tag: null,
          },
        ]
      },
      {
        id: "est_plan_1j",
        titulo: "Plan 1 jornada semanal",
        icono: "📅",
        tipo: "plan",
        descripcion: "4 jornadas al mes · día y horario fijo · sin asistente",
        ref: "Suelto: 4 × $45.000 = $180.000/mes",
        opciones: [
          {
            id: "est_1j_mes",
            label: "Mensual",
            detalle: "Renueva cada mes · cancela cuando quieras",
            precio: 170000,
            jornadas: 1, meses: 1, asistente: false,
            tag: "Ahorra $10.000",
            tagColor: "#1D9E75",
          },
        ]
      },
      {
        id: "est_plan_2j",
        titulo: "Plan 2 jornadas semanales",
        icono: "📅",
        tipo: "plan",
        descripcion: "8 jornadas al mes · días y horario fijo · sin asistente",
        ref: "Suelto: 8 × $45.000 = $360.000/mes",
        opciones: [
          {
            id: "est_2j_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 330000,
            jornadas: 2, meses: 1, asistente: false,
            tag: "Ahorra $30.000",
            tagColor: "#1D9E75",
          },
        ]
      },
      {
        id: "est_plan_3j",
        titulo: "Plan 3 jornadas semanales",
        icono: "📅",
        tipo: "plan",
        descripcion: "12 jornadas al mes · días y horario fijo · sin asistente",
        ref: "Suelto: 12 × $45.000 = $540.000/mes",
        opciones: [
          {
            id: "est_3j_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 480000,
            jornadas: 3, meses: 1, asistente: false,
            tag: "Ahorra $60.000",
            tagColor: "#1D9E75",
          },
        ]
      },
    ]
  },

  // ══════════════════════════════════════════════
  // BOX DENTAL
  // ══════════════════════════════════════════════
  dental: {
    nombre: "Box Dental",
    emoji: "🦷",
    color:  "#E1F5EE",
    borde:  "#1D9E75",
    texto:  "#04342C",
    secciones: [
      // ── PLAN FLEX (sin asistente) ──────────────
      {
        id: "den_suelta",
        titulo: "Plan Flex — Por hora o jornada suelta",
        icono: "⏱",
        tipo: "suelta",
        opciones: [
          {
            id: "den_hora_flex", horasOpciones: [1, 2, 3],
            label: "Por hora (Plan Flex)",
            detalle: "Elige 1, 2 o 3 horas · sin asistente",
            precio: 15000,
            jornadas: null, meses: null, asistente: false,
            tag: null,
          },
          {
            id: "den_js", horasFijas: 5,
            label: "Jornada suelta (5 horas)",
            detalle: "Sin compromiso · Plan Flex",
            precio: 45000,
            jornadas: null, meses: null, asistente: false,
            ref: "4 jornadas sueltas al mes = $180.000",
            tag: null,
          },
        ]
      },
      {
        id: "den_1j_sin",
        titulo: "Plan Flex — 1 jornada semanal",
        icono: "📅",
        tipo: "plan",
        descripcion: "4 jornadas al mes · día y horario fijo · Plan Flex",
        ref: "Suelto: 4 × $45.000 = $180.000/mes",
        opciones: [
          {
            id: "den_1j_sin_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 170000,
            jornadas: 1, meses: 1, asistente: false,
            tag: "Ahorra $10.000",
            tagColor: "#1D9E75",
          },
          {
            id: "den_1j_sin_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual",
            precio: 160000,
            jornadas: 1, meses: 6, asistente: false,
            tag: "Ahorra $20.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "den_1j_sin_12m",
            label: "Anual",
            detalle: "12 meses · cobro mensual",
            precio: 150000,
            jornadas: 1, meses: 12, asistente: false,
            tag: "Mejor precio ⭐",
            tagColor: "#854F0B",
          },
        ]
      },
      {
        id: "den_2j_sin",
        titulo: "Plan Flex — 2 jornadas semanales",
        icono: "📅",
        tipo: "plan",
        descripcion: "8 jornadas al mes · días y horario fijo · Plan Flex",
        ref: "Suelto: 8 × $45.000 = $360.000/mes",
        opciones: [
          {
            id: "den_2j_sin_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 340000,
            jornadas: 2, meses: 1, asistente: false,
            tag: "Ahorra $20.000",
            tagColor: "#1D9E75",
          },
          {
            id: "den_2j_sin_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual",
            precio: 320000,
            jornadas: 2, meses: 6, asistente: false,
            tag: "Ahorra $40.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "den_2j_sin_12m",
            label: "Anual",
            detalle: "12 meses · cobro mensual",
            precio: 300000,
            jornadas: 2, meses: 12, asistente: false,
            tag: "Mejor precio ⭐",
            tagColor: "#854F0B",
          },
        ]
      },
      // ── CON ASISTENTE (PLAN PRO) ───────────────
      {
        id: "den_pro_suelta",
        titulo: "Plan Pro — Por hora o jornada suelta con asistente",
        icono: "🦷",
        tipo: "suelta",
        descripcion: "Incluye asistente durante toda la jornada",
        opciones: [
          {
            id: "den_hora_pro", horasOpciones: [1, 2, 3],
            label: "Por hora Pro",
            detalle: "Elige 1, 2 o 3 horas · con asistente",
            precio: 18000,
            jornadas: null, meses: null, asistente: true,
            tag: "Con asistente",
            tagColor: "#533AB7",
          },
          {
            id: "den_pro_js", horasFijas: 5,
            label: "Jornada suelta Pro",
            detalle: "5 horas · incluye asistente",
            precio: 65000,
            jornadas: null, meses: null, asistente: true,
            ref: "4 jornadas sueltas Pro = $260.000/mes",
            tag: "Con asistente",
            tagColor: "#533AB7",
          },
        ]
      },
      {
        id: "den_1j_pro",
        titulo: "🦷 Plan Pro — 1 jornada semanal con asistente",
        icono: "🦷",
        tipo: "plan",
        descripcion: "4 jornadas al mes · incluye asistente · día y horario fijo",
        ref: "Suelto Pro: 4 × $65.000 = $260.000/mes",
        opciones: [
          {
            id: "den_1j_pro_mes",
            label: "Mensual",
            detalle: "Renueva cada mes · con asistente",
            precio: 250000,
            jornadas: 1, meses: 1, asistente: true,
            tag: "Ahorra $10.000",
            tagColor: "#1D9E75",
          },
          {
            id: "den_1j_pro_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual · con asistente",
            precio: 240000,
            jornadas: 1, meses: 6, asistente: true,
            tag: "Ahorra $20.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "den_1j_pro_12m",
            label: "Anual",
            detalle: "12 meses · cobro mensual · con asistente",
            precio: 230000,
            jornadas: 1, meses: 12, asistente: true,
            tag: "Mejor precio ⭐",
            tagColor: "#854F0B",
          },
        ]
      },
      {
        id: "den_2j_pro",
        titulo: "🦷 Plan Pro — 2 jornadas semanales con asistente",
        icono: "🦷",
        tipo: "plan",
        descripcion: "8 jornadas al mes · incluye asistente · días y horario fijo",
        ref: "Suelto Pro: 8 × $65.000 = $520.000/mes",
        opciones: [
          {
            id: "den_2j_pro_mes",
            label: "Mensual",
            detalle: "Renueva cada mes · con asistente",
            precio: 500000,
            jornadas: 2, meses: 1, asistente: true,
            tag: "Ahorra $20.000",
            tagColor: "#1D9E75",
          },
          {
            id: "den_2j_pro_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual · con asistente",
            precio: 480000,
            jornadas: 2, meses: 6, asistente: true,
            tag: "Ahorra $40.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "den_2j_pro_12m",
            label: "Anual",
            detalle: "12 meses · cobro mensual · con asistente",
            precio: 450000,
            jornadas: 2, meses: 12, asistente: true,
            tag: "Mejor precio ⭐",
            tagColor: "#854F0B",
          },
        ]
      },
      {
        id: "den_exclusivo",
        titulo: "Plan Exclusivo ⭐ — 5 jornadas semanales",
        icono: "⭐",
        tipo: "plan",
        descripcion: "Uso prioritario · lunes a viernes · horario fijo",
        ref: null,
        opciones: [
          {
            id: "den_excl",
            label: "Mensual",
            detalle: "Acceso exclusivo de lunes a viernes",
            precio: 1350000,
            jornadas: 5, meses: 1, asistente: false,
            tag: "Plan exclusivo",
            tagColor: "#2C2C2A",
          },
        ]
      },
    ]
  },

  // ══════════════════════════════════════════════
  // BOX MÉDICO
  // ══════════════════════════════════════════════
  medico: {
    nombre: "Box Médico",
    emoji: "🏥",
    color:  "#FEF3E2",
    borde:  "#C9A96E",
    texto:  "#3D2B1F",
    secciones: [
      {
        id: "med_suelta",
        titulo: "Sin compromiso — hora o jornada",
        icono: "⏱",
        tipo: "suelta",
        opciones: [
          {
            id: "med_hora", horasOpciones: [2, 3], minHoras: 2,
            label: "Hora suelta",
            detalle: "Mínimo 2 horas consecutivas",
            precio: 12000,
            jornadas: null, meses: null, asistente: false,
            tag: null,
          },
          {
            id: "med_jornada", horasFijas: 5,
            label: "Jornada (5 horas)",
            detalle: "5 horas corridas · sin compromiso",
            precio: 55000,
            jornadas: null, meses: null, asistente: false,
            tag: "Más conveniente",
            tagColor: "#C9A96E",
          },
        ]
      },
      {
        id: "med_plan_1j",
        titulo: "Plan 1 jornada semanal",
        icono: "📅",
        tipo: "plan",
        descripcion: "4 jornadas al mes · día y horario fijo",
        ref: "Suelto: 4 × $55.000 = $220.000/mes",
        opciones: [
          {
            id: "med_1j_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 215000,
            jornadas: 1, meses: 1, asistente: false,
            tag: "Ahorra $5.000",
            tagColor: "#1D9E75",
          },
        ]
      },
      {
        id: "med_plan_2j",
        titulo: "Plan 2 jornadas semanales",
        icono: "📅",
        tipo: "plan",
        descripcion: "8 jornadas al mes · días y horario fijo",
        ref: "Suelto: 8 × $55.000 = $440.000/mes",
        opciones: [
          {
            id: "med_2j_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 420000,
            jornadas: 2, meses: 1, asistente: false,
            tag: "Ahorra $20.000",
            tagColor: "#1D9E75",
          },
        ]
      },
      {
        id: "med_plan_3j",
        titulo: "Plan 3 jornadas semanales",
        icono: "📅",
        tipo: "plan",
        descripcion: "12 jornadas al mes · días y horario fijo",
        ref: "Suelto: 12 × $55.000 = $660.000/mes",
        opciones: [
          {
            id: "med_3j_mes",
            label: "Mensual",
            detalle: "Renueva cada mes",
            precio: 645000,
            jornadas: 3, meses: 1, asistente: false,
            tag: "Ahorra $15.000",
            tagColor: "#1D9E75",
          },
        ]
      },
      {
        id: "med_exclusivo",
        titulo: "Plan Exclusivo ⭐ — 5 jornadas semanales",
        icono: "⭐",
        tipo: "plan",
        descripcion: "Uso prioritario · lunes a viernes · horario fijo",
        ref: null,
        opciones: [
          {
            id: "med_excl",
            label: "Mensual",
            detalle: "Acceso exclusivo de lunes a viernes",
            precio: 1050000,
            jornadas: 5, meses: 1, asistente: false,
            tag: "Plan exclusivo",
            tagColor: "#2C2C2A",
          },
        ]
      },
    ]
  }
};

// ─── COMPONENTE SELECTOR DE PLAN ──────────────────────────────────
export function SelectorPlan({ tipoBox, onSeleccionar, boxes = [], arriendos = [], solicitudes = [] }) {
  const [planSel,     setPlanSel]     = useState(null);
  const [diasSel,     setDiasSel]     = useState([]);
  const [horario,     setHorario]     = useState({ inicio: "09:00", fin: "14:00" });
  const [fechaInicio, setFechaInicio] = useState("");
  const [seccionOpen, setSeccionOpen] = useState(null);
  const [cantHoras,   setCantHoras]   = useState(null); // opciones "por hora": 1-3 (médico 2-3)
  const [consecutivas, setConsecutivas] = useState(true);   // "Si" = bloque continuo
  const [horasSel,     setHorasSel]     = useState([]);      // horas sueltas elegidas (no consecutivas)

  const estructura  = PLANES[tipoBox] || PLANES.estetico;
  const opcionActual = planSel
    ? estructura.secciones.flatMap(s => s.opciones).find(o => o.id === planSel)
    : null;
  const seccionActual = planSel
    ? estructura.secciones.find(s => s.opciones.some(o => o.id === planSel))
    : null;
  const esPlan = opcionActual?.meses != null;

  const toggleDia = d => setDiasSel(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]);

  const hoyLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const sumaHoras = (hhmm, horas) => {
    const [h, m] = (hhmm || "09:00").split(":").map(Number);
    const t = h * 60 + (m || 0) + Math.round(horas * 60);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };

  // ── Disponibilidad real de la fecha elegida sobre el recurso físico ──
  // (Dental y Estético comparten espacio: una hora tomada en cualquiera de
  // las dos modalidades bloquea la otra; el Médico es independiente)
  const HORAS_GRILLA = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
  const boxDeTipo = boxes.find(b => normTipoBox(b) === tipoBox && b.activo !== false);
  const idsRecursoSel = boxDeTipo
    ? boxes.filter(b => recursoDeBox(b) === recursoDeBox(boxDeTipo)).map(b => b.id)
    : [];
  const tiposCita = tiposDelRecurso(tipoBox === "medico" ? "medico" : "dental_estetico");

  const horaOcupada = (fecha, hora) => {
    if (!fecha) return false;
    const fin = sumaHoras(hora, 1);
    return arriendos.some(a =>
      idsRecursoSel.includes(a.box_id) && a.fecha === fecha &&
      ESTADOS_OCUPAN.includes(a.estado) &&
      seSolapan(hora, fin, a.hora_inicio, a.hora_fin)
    ) || solicitudes.some(x =>
      tiposCita.includes(x.box_tipo) && x.fecha_solicitada === fecha &&
      ESTADOS_CITA_OCUPAN.includes(x.estado) && x.hora_inicio && x.hora_fin &&
      seSolapan(hora, fin, x.hora_inicio, x.hora_fin)
    );
  };
  const horaPasada = (fecha, hora) => fecha && new Date(fecha + "T" + hora + ":00") < new Date();

  // ¿Aplica el modo no-consecutivo? Solo opciones por hora de 2+ horas y
  // nunca en el Box Médico (su regla exige horas consecutivas)
  const permiteNoConsecutivas = !esPlan && opcionActual?.horasOpciones &&
    (cantHoras || 0) >= 2 && tipoBox !== "medico";
  const modoSueltas = permiteNoConsecutivas && !consecutivas;

  // Duración de una opción suelta: bloque fijo (jornada 5h) o cantidad de
  // horas elegida por la profesional (1-3; el Box Médico parte en 2)
  const horasSuelta = !esPlan && opcionActual
    ? (opcionActual.horasFijas || cantHoras || 0)
    : 0;
  const finEfectivo = !esPlan && opcionActual
    ? sumaHoras(horario.inicio, horasSuelta)
    : horario.fin;

  // Horas del horario elegido (0 si inválido)
  const horasHorario = (() => {
    const [h1, m1] = (horario.inicio || "0:0").split(":").map(Number);
    const [h2, m2] = (finEfectivo || "0:0").split(":").map(Number);
    const d = (h2 * 60 + m2) - (h1 * 60 + m1);
    return d > 0 ? d / 60 : 0;
  })();

  // Monto real de una opción suelta: tabla de precios por cantidad (estético),
  // precio/hora × horas (dental/médico) o precio fijo del bloque (jornadas)
  const montoSuelto = !esPlan && opcionActual
    ? (opcionActual.horasOpciones
        ? (opcionActual.precios ? (opcionActual.precios[horasSuelta] || 0) : opcionActual.precio * horasSuelta)
        : opcionActual.precio)
    : 0;

  // El Box Médico exige mínimo 2 horas consecutivas (regla obligatoria,
  // también validada en el servidor). Dental/Estético no tienen mínimo.
  const minHorasBox = tipoBox === "medico" ? 2 : 0;
  const errorHorario = !opcionActual ? null
    : esPlan
      ? (horasHorario <= 0 ? "La hora de término debe ser posterior a la de inicio"
        : horasHorario < minHorasBox ? `El Box Médico requiere un mínimo de ${minHorasBox} horas consecutivas`
        : null)
      : (!fechaInicio ? "Elige la fecha de tu reserva"
        : fechaInicio < hoyLocal() ? "La fecha no puede ser pasada"
        : opcionActual.horasOpciones && !cantHoras ? "Elige cuántas horas quieres arrendar"
        : modoSueltas
          ? (horasSel.length !== cantHoras ? `Selecciona ${cantHoras} horas en la grilla (llevas ${horasSel.length})`
            : horasSel.some(h => horaOcupada(fechaInicio, h)) ? "Una de las horas elegidas acaba de ocuparse: elige otra"
            : null)
          : (horasHorario <= 0 ? "La hora de término debe ser posterior a la de inicio"
            : HORAS_GRILLA.filter(h => h >= horario.inicio && h < finEfectivo).some(h => horaOcupada(fechaInicio, h)) ? "El bloque elegido choca con un horario ya ocupado"
            : null));

  const puedeConfirmar = () => {
    if (!opcionActual) return false;
    if (!esPlan) return !errorHorario;
    return diasSel.length >= (opcionActual.jornadas || 1) && fechaInicio && !errorHorario;
  };

  const confirmar = () => {
    if (!puedeConfirmar()) return;
    const fechaFin = esPlan && opcionActual.meses
      ? (() => { const d = new Date(fechaInicio); d.setMonth(d.getMonth() + opcionActual.meses); return d.toISOString().split("T")[0]; })()
      : null;
    // En modo no consecutivo cada hora elegida es un tramo independiente
    const tramos = modoSueltas
      ? [...horasSel].sort().map(h => ({ inicio: h, fin: sumaHoras(h, 1) }))
      : [{ inicio: horario.inicio, fin: finEfectivo }];
    onSeleccionar({
      plan: opcionActual, tipoBox, boxNombre: estructura.nombre, dias: diasSel,
      horario: tramos[0],
      tramos,
      fechaInicio, fechaFin,
      monto: esPlan ? opcionActual.precio : montoSuelto,
      esPlan,
    });
  };

  const S = {
    input:  { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, color: "#111", background: "#fff", boxSizing: "border-box" },
    label:  { display: "block", fontSize: 12, color: "#666", marginBottom: 4, marginTop: 10 },
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* HEADER BOX */}
      <div style={{ background: estructura.color, border: `1px solid ${estructura.borde}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 28 }}>{estructura.emoji}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: estructura.texto }}>{estructura.nombre}</div>
          <div style={{ fontSize: 11, color: "#888" }}>Selecciona el plan que mejor se adapta a tu rutina</div>
        </div>
      </div>

      {/* SECCIONES */}
      {estructura.secciones.map(sec => (
        <div key={sec.id} style={{ marginBottom: 14, border: "1px solid #e8e8e4", borderRadius: 10, overflow: "hidden" }}>

          {/* CABECERA SECCIÓN */}
          <div
            onClick={() => setSeccionOpen(seccionOpen === sec.id ? null : sec.id)}
            style={{ padding: "11px 14px", background: seccionOpen === sec.id ? estructura.color : "#f8f8f6", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <span style={{ fontSize: 14, marginRight: 8 }}>{sec.icono}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{sec.titulo}</span>
              {sec.descripcion && <div style={{ fontSize: 11, color: "#888", marginTop: 2, marginLeft: 22 }}>{sec.descripcion}</div>}
              {sec.ref && <div style={{ fontSize: 10, color: "#888", marginTop: 2, marginLeft: 22, background: "#f0f0ec", display: "inline-block", padding: "1px 8px", borderRadius: 5 }}>ref: {sec.ref}</div>}
            </div>
            <span style={{ fontSize: 12, color: "#888" }}>{seccionOpen === sec.id ? "▲" : "▼"}</span>
          </div>

          {/* OPCIONES */}
          {seccionOpen === sec.id && (
            <div style={{ padding: "12px 14px", background: "#fff", display: "flex", gap: 10, flexWrap: "wrap" }}>
              {sec.opciones.map(op => {
                const sel = planSel === op.id;
                return (
                  <div
                    key={op.id}
                    onClick={() => { setPlanSel(op.id); setDiasSel([]); setCantHoras(op.horasOpciones ? op.horasOpciones[0] : null); }}
                    style={{ flex: "1 1 130px", maxWidth: 180, border: `2px solid ${sel ? estructura.borde : "#ddd"}`, borderRadius: 10, padding: "12px 10px", cursor: "pointer", background: sel ? estructura.color : "#fff", position: "relative", transition: "all .15s" }}
                  >
                    {op.tag && (
                      <div style={{ position: "absolute", top: -9, right: 6, background: op.tagColor || "#1D9E75", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6 }}>
                        {op.tag}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 600, color: sel ? estructura.texto : "#333", marginBottom: 4 }}>{op.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: sel ? estructura.borde : "#111", marginBottom: 4 }}>{fmt(op.precio)}</div>
                    <div style={{ fontSize: 10, color: "#888", lineHeight: 1.5 }}>{op.detalle}</div>
                    {op.meses && op.meses > 1 && <div style={{ fontSize: 10, color: "#888", marginTop: 3 }}>por mes · {op.meses} meses</div>}
                    {op.asistente && <div style={{ fontSize: 10, color: "#1D9E75", fontWeight: 600, marginTop: 4 }}>✓ incluye asistente</div>}
                    {op.ref && <div style={{ fontSize: 9, color: "#aaa", marginTop: 4, borderTop: "1px solid #f0f0ec", paddingTop: 4 }}>{op.ref}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* CONFIGURACIÓN DEL PLAN SELECCIONADO */}
      {opcionActual && (
        <div style={{ marginTop: 8, padding: 16, background: "#f8f8f6", borderRadius: 10, border: "1px solid #e8e8e4" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
            {esPlan
              ? `Configurar plan — ${fmt(opcionActual.precio)}/mes`
              : `Confirmar sesión — ${opcionActual.horasOpciones && !opcionActual.precios ? `${fmt(opcionActual.precio)}/hora` : opcionActual.horasOpciones ? `desde ${fmt(opcionActual.precios[opcionActual.horasOpciones[0]])}` : fmt(opcionActual.precio)}`}
          </div>

          {!esPlan && (
            <>
              {/* FECHA Y HORARIO DE LA SESIÓN SUELTA */}
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Fecha de la reserva *</label>
                <input type="date" value={fechaInicio} min={hoyLocal()} onChange={e => setFechaInicio(e.target.value)} style={S.input} />
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  💡 Puedes revisar los horarios libres en la pestaña <strong>Disponibilidad</strong> antes de elegir.
                </div>
              </div>
              {/* CANTIDAD DE HORAS (opciones por hora) */}
              {opcionActual.horasOpciones && (
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>¿Cuántas horas quieres arrendar? *{tipoBox === "medico" ? " (mínimo 2 horas consecutivas)" : ""}</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {opcionActual.horasOpciones.map(n => {
                      const sel = cantHoras === n;
                      const precioN = opcionActual.precios ? opcionActual.precios[n] : opcionActual.precio * n;
                      return (
                        <button key={n} onClick={() => setCantHoras(n)}
                          style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${sel ? estructura.borde : "#ddd"}`, background: sel ? estructura.color : "#fff", color: sel ? estructura.texto : "#555", fontSize: 13, fontWeight: sel ? 700 : 500, cursor: "pointer", textAlign: "center", minWidth: 90 }}>
                          {n} hora{n > 1 ? "s" : ""}<br/>
                          <span style={{ fontSize: 12 }}>{fmt(precioN)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    ¿Necesitas más de {opcionActual.horasOpciones[opcionActual.horasOpciones.length - 1]} horas? Te conviene la <strong>jornada (5 horas)</strong>.
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
              {/* ¿CONSECUTIVAS O DISTRIBUIDAS? (solo por-hora de 2+ y no médico) */}
              {permiteNoConsecutivas && (
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>¿Deseas reservar las horas de forma consecutiva? *</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[[true, "Sí, en un bloque continuo"], [false, "No, distribuirlas en el día"]].map(([val, lbl]) => (
                      <button key={String(val)} onClick={() => { setConsecutivas(val); setHorasSel([]); }}
                        style={{ padding: "9px 14px", borderRadius: 10, border: `2px solid ${consecutivas === val ? estructura.borde : "#ddd"}`, background: consecutivas === val ? estructura.color : "#fff", color: consecutivas === val ? estructura.texto : "#555", fontSize: 12, fontWeight: consecutivas === val ? 700 : 500, cursor: "pointer" }}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {modoSueltas ? (
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Elige tus {cantHoras} horas del día * ({horasSel.length}/{cantHoras} seleccionadas)</label>
                  {!fechaInicio ? (
                    <div style={{ fontSize: 12, color: "#888" }}>Primero elige la fecha para ver la disponibilidad.</div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {HORAS_GRILLA.map(h => {
                        const ocupada = horaOcupada(fechaInicio, h);
                        const pasada  = horaPasada(fechaInicio, h);
                        const sel     = horasSel.includes(h);
                        const bloq    = ocupada || pasada;
                        return (
                          <button key={h} disabled={bloq}
                            onClick={() => setHorasSel(hs => sel ? hs.filter(x => x !== h) : (hs.length < cantHoras ? [...hs, h] : hs))}
                            title={ocupada ? "Ocupado" : pasada ? "Hora pasada" : ""}
                            style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, cursor: bloq ? "not-allowed" : "pointer",
                              border: `2px solid ${sel ? estructura.borde : bloq ? "#eee" : "#ddd"}`,
                              background: sel ? estructura.color : bloq ? "#f5f5f5" : "#fff",
                              color: sel ? estructura.texto : bloq ? "#bbb" : "#555",
                              fontWeight: sel ? 700 : 500, textDecoration: ocupada ? "line-through" : "none" }}>
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    Cada hora elegida se reserva como un tramo independiente ({"08:00"} a {"20:00"}). Las tachadas ya están ocupadas en el box.
                  </div>
                  {errorHorario && (
                    <div style={{ background: "#FCEBEB", border: "1px solid #F5C2C7", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#A32D2D", marginTop: 8 }}>
                      ⚠ {errorHorario}
                    </div>
                  )}
                </div>
              ) : (
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>
                  Hora de inicio *{opcionActual.horasFijas ? ` (bloque de ${opcionActual.horasFijas} horas)` : ""}
                </label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="time" step="3600" value={horario.inicio} onChange={e => setHorario(h => ({ ...h, inicio: e.target.value }))} style={{ ...S.input, width: "auto" }} />
                  <span style={{ color: "#888" }}>a</span>
                  <span style={{ ...S.input, width: "auto", background: "#f0f0ec", color: "#555" }}>{horasSuelta > 0 ? finEfectivo : "—"}</span>
                </div>
                {errorHorario && (
                  <div style={{ background: "#FCEBEB", border: "1px solid #F5C2C7", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#A32D2D", marginTop: 8 }}>
                    ⚠ {errorHorario}
                  </div>
                )}
              </div>
              )}
                )}
              </div>
            </>
          )}

          {esPlan && (
            <>
              {/* DÍAS */}
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>
                  Día{opcionActual.jornadas > 1 ? "s" : ""} de jornada — elige {opcionActual.jornadas} día{opcionActual.jornadas > 1 ? "s" : ""} por semana *
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DIAS.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDia(d)}
                      disabled={!diasSel.includes(d) && diasSel.length >= opcionActual.jornadas}
                      style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${diasSel.includes(d) ? estructura.borde : "#ddd"}`, background: diasSel.includes(d) ? estructura.color : "#fff", color: diasSel.includes(d) ? estructura.texto : "#666", fontSize: 12, fontWeight: diasSel.includes(d) ? 600 : 400, cursor: "pointer", opacity: (!diasSel.includes(d) && diasSel.length >= opcionActual.jornadas) ? .4 : 1 }}
                    >{d}</button>
                  ))}
                </div>
              </div>

              {/* HORARIO */}
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Horario fijo *{tipoBox === "medico" ? " (mínimo 2 horas consecutivas)" : ""}</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="time" value={horario.inicio} onChange={e => setHorario(h => ({ ...h, inicio: e.target.value }))} style={{ ...S.input, width: "auto" }} />
                  <span style={{ color: "#888" }}>a</span>
                  <input type="time" value={horario.fin} onChange={e => setHorario(h => ({ ...h, fin: e.target.value }))} style={{ ...S.input, width: "auto" }} />
                </div>
                {errorHorario && (
                  <div style={{ background: "#FCEBEB", border: "1px solid #F5C2C7", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#A32D2D", marginTop: 8 }}>
                    ⚠ {errorHorario}
                  </div>
                )}
              </div>

              {/* FECHA INICIO */}
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Fecha de inicio del plan *</label>
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={S.input} />
              </div>

              {/* VIGENCIA */}
              {fechaInicio && opcionActual.meses && (
                <div style={{ background: estructura.color, border: `1px solid ${estructura.borde}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color: estructura.texto, marginBottom: 12 }}>
                  📅 Vigencia: {fechaInicio} →{" "}
                  {(() => { const d = new Date(fechaInicio); d.setMonth(d.getMonth() + opcionActual.meses); return d.toISOString().split("T")[0]; })()}
                  {opcionActual.meses > 1 && <span style={{ marginLeft: 8, fontWeight: 600 }}>· Cobro mensual: {fmt(opcionActual.precio)}</span>}
                </div>
              )}
            </>
          )}

          {/* RESUMEN */}
          <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #e8e8e4", fontSize: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Resumen</div>
            <div style={{ color: "#555", lineHeight: 2 }}>
              <div>Plan: <strong>{opcionActual.label}{esPlan && opcionActual.meses > 1 ? ` · ${opcionActual.meses} meses` : esPlan ? " · mensual" : ""}</strong></div>
              <div>Box: <strong>{estructura.nombre}</strong></div>
              {opcionActual.asistente && <div style={{ color: "#1D9E75", fontWeight: 600 }}>✓ Incluye asistente</div>}
              {diasSel.length > 0 && <div>Días: <strong>{diasSel.join(", ")}</strong></div>}
              {!esPlan && fechaInicio && <div>Fecha: <strong>{fechaInicio}</strong></div>}
              <div>Horario: <strong>{modoSueltas
                ? ([...horasSel].sort().map(h => `${h}–${sumaHoras(h, 1)}`).join(" · ") || "—")
                : `${horario.inicio} – ${finEfectivo}`}</strong>{!esPlan && horasHorario > 0 && !modoSueltas ? ` (${horasHorario} hr)` : modoSueltas && horasSel.length ? ` (${horasSel.length} tramo${horasSel.length > 1 ? "s" : ""} de 1 hr)` : ""}</div>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: estructura.borde }}>
                {esPlan
                  ? `Cobro mensual: ${fmt(opcionActual.precio)}`
                  : `Total a pagar: ${errorHorario ? "—" : fmt(montoSuelto)}${opcionActual.horasOpciones && !opcionActual.precios && !errorHorario ? ` (${horasSuelta} hr × ${fmt(opcionActual.precio)})` : ""}`}
              </div>
            </div>
          </div>

          <button
            disabled={!puedeConfirmar()}
            onClick={confirmar}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: puedeConfirmar() ? "#111" : "#ccc", color: "#fff", fontSize: 14, fontWeight: 500, cursor: puedeConfirmar() ? "pointer" : "not-allowed" }}
          >
            Continuar al pago →
          </button>
        </div>
      )}
    </div>
  );
}