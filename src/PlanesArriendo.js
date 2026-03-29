import { useState } from "react";

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
            id: "est_1h",
            label: "1 hora",
            detalle: "Uso libre del box por 1 hora",
            precio: 10000,
            jornadas: null, meses: null, asistente: false,
            tag: null,
          },
          {
            id: "est_2h",
            label: "2 horas consecutivas",
            detalle: "Bloque de 2 horas seguidas",
            precio: 18000,
            jornadas: null, meses: null, asistente: false,
            tag: "Más conveniente",
            tagColor: "#1D9E75",
          },
          {
            id: "est_jornada",
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
          {
            id: "est_1j_3m",
            label: "Trimestral",
            detalle: "3 meses · cobro mensual",
            precio: 165000,
            jornadas: 1, meses: 3, asistente: false,
            tag: "Ahorra $15.000/mes",
            tagColor: "#1D9E75",
          },
          {
            id: "est_1j_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual",
            precio: 160000,
            jornadas: 1, meses: 6, asistente: false,
            tag: "Ahorra $20.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "est_1j_12m",
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
          {
            id: "est_2j_3m",
            label: "Trimestral",
            detalle: "3 meses · cobro mensual",
            precio: 330000,
            jornadas: 2, meses: 3, asistente: false,
            tag: "Ahorra $30.000/mes",
            tagColor: "#1D9E75",
          },
          {
            id: "est_2j_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual",
            precio: 320000,
            jornadas: 2, meses: 6, asistente: false,
            tag: "Ahorra $40.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "est_2j_12m",
            label: "Anual",
            detalle: "12 meses · cobro mensual",
            precio: 300000,
            jornadas: 2, meses: 12, asistente: false,
            tag: "Mejor precio ⭐",
            tagColor: "#854F0B",
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
          {
            id: "est_3j_3m",
            label: "Trimestral",
            detalle: "3 meses · cobro mensual",
            precio: 460000,
            jornadas: 3, meses: 3, asistente: false,
            tag: "Ahorra $80.000/mes",
            tagColor: "#1D9E75",
          },
          {
            id: "est_3j_6m",
            label: "Semestral",
            detalle: "6 meses · cobro mensual",
            precio: 440000,
            jornadas: 3, meses: 6, asistente: false,
            tag: "Ahorra $100.000/mes",
            tagColor: "#185FA5",
          },
          {
            id: "est_3j_12m",
            label: "Anual",
            detalle: "12 meses · cobro mensual",
            precio: 420000,
            jornadas: 3, meses: 12, asistente: false,
            tag: "Mejor precio ⭐",
            tagColor: "#854F0B",
          },
        ]
      },
      {
        id: "est_exclusivo",
        titulo: "Plan Exclusivo ⭐ — 5 jornadas semanales",
        icono: "⭐",
        tipo: "plan",
        descripcion: "Uso prioritario · lunes a viernes · horario fijo",
        ref: null,
        opciones: [
          {
            id: "est_excl",
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
            id: "den_hora_flex",
            label: "Por hora (Plan Flex)",
            detalle: "Mínimo 2 horas consecutivas · sin asistente",
            precio: 15000,
            jornadas: null, meses: null, asistente: false,
            tag: "Mín. 2h",
            tagColor: "#1D9E75",
          },
          {
            id: "den_js",
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
            id: "den_hora_pro",
            label: "Por hora Pro",
            detalle: "Mínimo 2 horas consecutivas · con asistente",
            precio: 18000,
            jornadas: null, meses: null, asistente: true,
            tag: "Con asistente",
            tagColor: "#533AB7",
          },
          {
            id: "den_pro_js",
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
            id: "med_hora",
            label: "Hora suelta",
            detalle: "Mínimo 2 horas consecutivas",
            precio: 12000,
            jornadas: null, meses: null, asistente: false,
            tag: null,
          },
          {
            id: "med_jornada",
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
export function SelectorPlan({ tipoBox, onSeleccionar }) {
  const [planSel,     setPlanSel]     = useState(null);
  const [diasSel,     setDiasSel]     = useState([]);
  const [horario,     setHorario]     = useState({ inicio: "09:00", fin: "14:00" });
  const [fechaInicio, setFechaInicio] = useState("");
  const [seccionOpen, setSeccionOpen] = useState(null);

  const estructura  = PLANES[tipoBox] || PLANES.estetico;
  const opcionActual = planSel
    ? estructura.secciones.flatMap(s => s.opciones).find(o => o.id === planSel)
    : null;
  const seccionActual = planSel
    ? estructura.secciones.find(s => s.opciones.some(o => o.id === planSel))
    : null;
  const esPlan = opcionActual?.meses != null;

  const toggleDia = d => setDiasSel(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d]);

  const puedeConfirmar = () => {
    if (!opcionActual) return false;
    if (!esPlan) return true;
    return diasSel.length >= (opcionActual.jornadas || 1) && fechaInicio;
  };

  const confirmar = () => {
    if (!puedeConfirmar()) return;
    const fechaFin = esPlan && opcionActual.meses
      ? (() => { const d = new Date(fechaInicio); d.setMonth(d.getMonth() + opcionActual.meses); return d.toISOString().split("T")[0]; })()
      : null;
    onSeleccionar({ plan: opcionActual, tipoBox, boxNombre: estructura.nombre, dias: diasSel, horario, fechaInicio, fechaFin, monto: opcionActual.precio, esPlan });
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
                    onClick={() => { setPlanSel(op.id); setDiasSel([]); }}
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
            {esPlan ? "Configurar plan" : "Confirmar sesión"} — {fmt(opcionActual.precio)}{esPlan ? "/mes" : ""}
          </div>

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
                <label style={S.label}>Horario fijo *</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="time" value={horario.inicio} onChange={e => setHorario(h => ({ ...h, inicio: e.target.value }))} style={{ ...S.input, width: "auto" }} />
                  <span style={{ color: "#888" }}>a</span>
                  <input type="time" value={horario.fin} onChange={e => setHorario(h => ({ ...h, fin: e.target.value }))} style={{ ...S.input, width: "auto" }} />
                </div>
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
              {esPlan && <div>Horario: <strong>{horario.inicio} – {horario.fin}</strong></div>}
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: estructura.borde }}>
                {esPlan ? `Cobro mensual: ${fmt(opcionActual.precio)}` : `Total a pagar: ${fmt(opcionActual.precio)}`}
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