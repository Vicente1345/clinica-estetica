// ─── ESTRUCTURA DE PLANES POR TIPO DE BOX ─────────────────────────

export const PLANES = {
  estetico: {
    nombre: "Box Estético",
    color: "#E6F1FB",
    colorBorde: "#378ADD",
    colorTexto: "#042C53",
    secciones: [
      {
        id: "hora",
        titulo: "Por hora / sesión suelta",
        icono: "⏱",
        descripcion: "Sin compromiso, pagas solo lo que usas",
        opciones: [
          { id: "1h",  label: "1 hora",              precio: 10000,  jornadas: null, duracion: null, asistente: false, tag: null },
          { id: "2h",  label: "2 horas consecutivas", precio: 18000,  jornadas: null, duracion: null, asistente: false, tag: "Más conveniente" },
          { id: "jornada_suelta", label: "Jornada suelta (5 hrs)", precio: 45000, jornadas: null, duracion: null, asistente: false, tag: null },
        ]
      },
      {
        id: "mensual_1j",
        titulo: "Plan 1 jornada semanal",
        icono: "📅",
        descripcion: "4 jornadas al mes · horario fijo",
        suelta_ref: "4 × $45.000 = $180.000 suelto",
        opciones: [
          { id: "m1_mensual", label: "Mensual",    precio: 170000, jornadas: 1, duracion: 1,  meses: 1,  asistente: false, tag: "Ahorra $10.000" },
          { id: "m1_6m",     label: "6 meses",     precio: 160000, jornadas: 1, duracion: 6,  meses: 6,  asistente: false, tag: "Ahorra $20.000/mes" },
          { id: "m1_12m",    label: "12 meses",    precio: 150000, jornadas: 1, duracion: 12, meses: 12, asistente: false, tag: "Mejor precio" },
        ]
      },
      {
        id: "mensual_2j",
        titulo: "Plan 2 jornadas semanales",
        icono: "📅",
        descripcion: "8 jornadas al mes · horario fijo",
        suelta_ref: "8 × $45.000 = $360.000 suelto",
        opciones: [
          { id: "m2_mensual", label: "Mensual",  precio: 340000, jornadas: 2, duracion: 1,  meses: 1,  asistente: false, tag: "Ahorra $20.000" },
          { id: "m2_6m",     label: "6 meses",   precio: 320000, jornadas: 2, duracion: 6,  meses: 6,  asistente: false, tag: "Ahorra $40.000/mes" },
          { id: "m2_12m",    label: "12 meses",  precio: 300000, jornadas: 2, duracion: 12, meses: 12, asistente: false, tag: "Mejor precio" },
        ]
      },
      {
        id: "pro_1j",
        titulo: "Plan Pro — 1 jornada semanal + asistente",
        icono: "🦷",
        descripcion: "Incluye asistente · 4 jornadas al mes",
        suelta_ref: "4 × $65.000 = $260.000 suelto",
        opciones: [
          { id: "p1_mensual", label: "Mensual",  precio: 250000, jornadas: 1, duracion: 1,  meses: 1,  asistente: true, tag: "Ahorra $10.000" },
          { id: "p1_6m",     label: "6 meses",   precio: 240000, jornadas: 1, duracion: 6,  meses: 6,  asistente: true, tag: "Ahorra $20.000/mes" },
          { id: "p1_12m",    label: "12 meses",  precio: 230000, jornadas: 1, duracion: 12, meses: 12, asistente: true, tag: "Mejor precio" },
        ]
      },
      {
        id: "pro_2j",
        titulo: "Plan Pro — 2 jornadas semanales + asistente",
        icono: "🦷",
        descripcion: "Incluye asistente · 8 jornadas al mes",
        suelta_ref: "8 × $65.000 = $520.000 suelto",
        opciones: [
          { id: "p2_mensual", label: "Mensual",  precio: 500000, jornadas: 2, duracion: 1,  meses: 1,  asistente: true, tag: "Ahorra $20.000" },
          { id: "p2_6m",     label: "6 meses",   precio: 480000, jornadas: 2, duracion: 6,  meses: 6,  asistente: true, tag: "Ahorra $40.000/mes" },
          { id: "p2_12m",    label: "12 meses",  precio: 450000, jornadas: 2, duracion: 12, meses: 12, asistente: true, tag: "Mejor precio" },
        ]
      },
      {
        id: "exclusivo",
        titulo: "Plan Exclusivo ⭐",
        icono: "⭐",
        descripcion: "5 jornadas semanales · uso prioritario",
        suelta_ref: null,
        opciones: [
          { id: "excl", label: "Mensual", precio: 1350000, jornadas: 5, duracion: 1, meses: 1, asistente: false, tag: "Plan exclusivo" },
        ]
      },
    ]
  },

  dental: {
    nombre: "Box Dental",
    color: "#E1F5EE",
    colorBorde: "#1D9E75",
    colorTexto: "#04342C",
    secciones: [
      {
        id: "jornada_suelta_d",
        titulo: "Jornada suelta",
        icono: "⏱",
        descripcion: "Sin compromiso, pagas solo lo que usas",
        opciones: [
          { id: "js_d", label: "Jornada suelta (5 hrs)", precio: 45000, jornadas: null, duracion: null, asistente: false, tag: null },
        ]
      },
      {
        id: "mensual_1j_d",
        titulo: "Plan 1 jornada semanal",
        icono: "📅",
        descripcion: "4 jornadas al mes · horario fijo",
        suelta_ref: "4 × $45.000 = $180.000 suelto",
        opciones: [
          { id: "dm1_mensual", label: "Mensual",  precio: 170000, jornadas: 1, duracion: 1,  meses: 1,  asistente: false, tag: "Ahorra $10.000" },
          { id: "dm1_6m",     label: "6 meses",   precio: 160000, jornadas: 1, duracion: 6,  meses: 6,  asistente: false, tag: "Ahorra $20.000/mes" },
          { id: "dm1_12m",    label: "12 meses",  precio: 150000, jornadas: 1, duracion: 12, meses: 12, asistente: false, tag: "Mejor precio" },
        ]
      },
      {
        id: "mensual_2j_d",
        titulo: "Plan 2 jornadas semanales",
        icono: "📅",
        descripcion: "8 jornadas al mes · horario fijo",
        suelta_ref: "8 × $45.000 = $360.000 suelto",
        opciones: [
          { id: "dm2_mensual", label: "Mensual",  precio: 340000, jornadas: 2, duracion: 1,  meses: 1,  asistente: false, tag: "Ahorra $20.000" },
          { id: "dm2_6m",     label: "6 meses",   precio: 320000, jornadas: 2, duracion: 6,  meses: 6,  asistente: false, tag: "Ahorra $40.000/mes" },
          { id: "dm2_12m",    label: "12 meses",  precio: 300000, jornadas: 2, duracion: 12, meses: 12, asistente: false, tag: "Mejor precio" },
        ]
      },
      {
        id: "pro_1j_d",
        titulo: "Plan Pro — 1 jornada + asistente",
        icono: "🦷",
        descripcion: "Incluye asistente · 4 jornadas al mes",
        suelta_ref: "4 × $65.000 = $260.000 suelto",
        opciones: [
          { id: "dp1_mensual", label: "Mensual",  precio: 250000, jornadas: 1, duracion: 1,  meses: 1,  asistente: true, tag: "Ahorra $10.000" },
          { id: "dp1_6m",     label: "6 meses",   precio: 240000, jornadas: 1, duracion: 6,  meses: 6,  asistente: true, tag: "Ahorra $20.000/mes" },
          { id: "dp1_12m",    label: "12 meses",  precio: 230000, jornadas: 1, duracion: 12, meses: 12, asistente: true, tag: "Mejor precio" },
        ]
      },
      {
        id: "pro_2j_d",
        titulo: "Plan Pro — 2 jornadas + asistente",
        icono: "🦷",
        descripcion: "Incluye asistente · 8 jornadas al mes",
        suelta_ref: "8 × $65.000 = $520.000 suelto",
        opciones: [
          { id: "dp2_mensual", label: "Mensual",  precio: 500000, jornadas: 2, duracion: 1,  meses: 1,  asistente: true, tag: "Ahorra $20.000" },
          { id: "dp2_6m",     label: "6 meses",   precio: 480000, jornadas: 2, duracion: 6,  meses: 6,  asistente: true, tag: "Ahorra $40.000/mes" },
          { id: "dp2_12m",    label: "12 meses",  precio: 450000, jornadas: 2, duracion: 12, meses: 12, asistente: true, tag: "Mejor precio" },
        ]
      },
      {
        id: "exclusivo_d",
        titulo: "Plan Exclusivo ⭐",
        icono: "⭐",
        descripcion: "5 jornadas semanales · uso prioritario",
        opciones: [
          { id: "dexcl", label: "Mensual", precio: 1350000, jornadas: 5, duracion: 1, meses: 1, asistente: false, tag: "Plan exclusivo" },
        ]
      },
    ]
  }
};

// ─── COMPONENTE SELECTOR DE PLAN ──────────────────────────────────
import { useState } from "react";

const fmt = n => (n||0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function SelectorPlan({ tipoBox, onSeleccionar }) {
  const [planSel, setPlanSel]   = useState(null); // { seccionId, opcionId }
  const [diasSel, setDiasSel]   = useState([]);
  const [horario, setHorario]   = useState({ inicio: "09:00", fin: "14:00" });
  const [fechaInicio, setFechaInicio] = useState("");

  const estructura = PLANES[tipoBox] || PLANES.estetico;
  const opcionActual = planSel
    ? estructura.secciones
        .flatMap(s => s.opciones)
        .find(o => o.id === planSel.opcionId)
    : null;

  const esPlan    = opcionActual?.duracion != null;
  const DIAS      = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

  const toggleDia = (d) => setDiasSel(ds => ds.includes(d) ? ds.filter(x=>x!==d) : [...ds, d]);

  const puedeConfirmar = () => {
    if (!opcionActual) return false;
    if (!esPlan) return true; // suelta solo necesita la opción
    return diasSel.length >= (opcionActual.jornadas || 1) && fechaInicio;
  };

  const confirmar = () => {
    if (!puedeConfirmar()) return;
    const fechaFin = esPlan && opcionActual.meses
      ? (() => {
          const d = new Date(fechaInicio);
          d.setMonth(d.getMonth() + opcionActual.meses);
          return d.toISOString().split("T")[0];
        })()
      : null;
    onSeleccionar({
      plan:         opcionActual,
      tipoBox,
      boxNombre:    estructura.nombre,
      dias:         diasSel,
      horario,
      fechaInicio,
      fechaFin,
      monto:        opcionActual.precio,
      esPlan,
    });
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* Header box */}
      <div style={{ background: estructura.color, border: `1px solid ${estructura.colorBorde}`, borderRadius: 10, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 22 }}>{tipoBox === "dental" ? "🦷" : "✨"}</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: estructura.colorTexto }}>{estructura.nombre}</div>
          <div style={{ fontSize: 11, color: "#888" }}>Selecciona el plan que mejor se adapta a tu rutina</div>
        </div>
      </div>

      {/* Secciones */}
      {estructura.secciones.map(sec => (
        <div key={sec.id} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{sec.icono}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{sec.titulo}</span>
            {sec.suelta_ref && (
              <span style={{ fontSize: 10, color: "#888", background: "#f0f0ec", padding: "1px 7px", borderRadius: 6 }}>ref: {sec.suelta_ref}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sec.opciones.map(op => {
              const sel = planSel?.opcionId === op.id;
              return (
                <div
                  key={op.id}
                  onClick={() => setPlanSel({ seccionId: sec.id, opcionId: op.id })}
                  style={{
                    border: `2px solid ${sel ? estructura.colorBorde : "#ddd"}`,
                    borderRadius: 10, padding: "10px 14px", cursor: "pointer", minWidth: 130, flex: "1 1 130px", maxWidth: 180,
                    background: sel ? estructura.color : "#fff",
                    transition: "all .15s", position: "relative",
                  }}
                >
                  {op.tag && (
                    <div style={{ position: "absolute", top: -9, right: 8, background: op.tag === "Plan exclusivo" ? "#2C2C2A" : "#1D9E75", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6 }}>
                      {op.tag}
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 600, color: sel ? estructura.colorTexto : "#333", marginBottom: 4 }}>{op.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: sel ? estructura.colorBorde : "#111" }}>{fmt(op.precio)}</div>
                  {op.duracion && op.duracion > 1 && (
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>por mes · {op.duracion} meses</div>
                  )}
                  {op.asistente && (
                    <div style={{ fontSize: 10, color: "#1D9E75", marginTop: 3 }}>✓ incluye asistente</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Detalle del plan seleccionado */}
      {opcionActual && (
        <div style={{ marginTop: 4, padding: 16, background: "#f8f8f6", borderRadius: 10, border: "1px solid #e8e8e4" }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
            {esPlan ? "Configurar plan" : "Confirmar sesión"} — {fmt(opcionActual.precio)}{esPlan ? "/mes" : ""}
          </div>

          {esPlan && (
            <>
              {/* Días */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>
                  Días de jornada ({opcionActual.jornadas} día{opcionActual.jornadas > 1 ? "s" : ""} por semana) *
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DIAS.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDia(d)}
                      style={{
                        padding: "5px 12px", borderRadius: 7, border: `1px solid ${diasSel.includes(d) ? estructura.colorBorde : "#ddd"}`,
                        background: diasSel.includes(d) ? estructura.color : "#fff",
                        color: diasSel.includes(d) ? estructura.colorTexto : "#666",
                        fontSize: 12, fontWeight: diasSel.includes(d) ? 600 : 400, cursor: "pointer",
                      }}
                    >{d}</button>
                  ))}
                </div>
                {diasSel.length > (opcionActual.jornadas || 1) && (
                  <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 4 }}>
                    Selecciona máximo {opcionActual.jornadas} día{opcionActual.jornadas > 1 ? "s" : ""}
                  </div>
                )}
              </div>

              {/* Horario */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Horario fijo *</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="time" value={horario.inicio} onChange={e => setHorario(h => ({ ...h, inicio: e.target.value }))}
                    style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13 }}/>
                  <span style={{ color: "#888", fontSize: 12 }}>a</span>
                  <input type="time" value={horario.fin} onChange={e => setHorario(h => ({ ...h, fin: e.target.value }))}
                    style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13 }}/>
                </div>
              </div>

              {/* Fecha inicio */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>Fecha de inicio del plan *</div>
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid #ddd", fontSize: 13, width: "100%", boxSizing: "border-box" }}/>
              </div>

              {/* Resumen vigencia */}
              {fechaInicio && opcionActual.meses && (
                <div style={{ background: estructura.color, border: `1px solid ${estructura.colorBorde}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: estructura.colorTexto, marginBottom: 12 }}>
                  📅 Vigencia: {fechaInicio} →{" "}
                  {(() => {
                    const d = new Date(fechaInicio);
                    d.setMonth(d.getMonth() + opcionActual.meses);
                    return d.toISOString().split("T")[0];
                  })()}
                  {opcionActual.meses > 1 && <span style={{ marginLeft: 8, fontWeight: 600 }}>· Cobro mensual: {fmt(opcionActual.precio)}</span>}
                </div>
              )}
            </>
          )}

          {/* Resumen final */}
          <div style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #e8e8e4", fontSize: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Resumen</div>
            <div style={{ color: "#555", lineHeight: 1.8 }}>
              <div>Plan: <strong>{opcionActual.label}{esPlan ? ` · ${opcionActual.duracion > 1 ? opcionActual.duracion + " meses" : "mensual"}` : ""}</strong></div>
              {opcionActual.asistente && <div style={{ color: "#1D9E75" }}>✓ Incluye asistente</div>}
              {diasSel.length > 0 && <div>Días: <strong>{diasSel.join(", ")}</strong></div>}
              {(horario.inicio && horario.fin) && <div>Horario: <strong>{horario.inicio} – {horario.fin}</strong></div>}
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: estructura.colorBorde }}>
                {esPlan ? `Cobro mensual: ${fmt(opcionActual.precio)}` : `Total a pagar: ${fmt(opcionActual.precio)}`}
              </div>
            </div>
          </div>

          <button
            disabled={!puedeConfirmar()}
            onClick={confirmar}
            style={{
              padding: "9px 24px", borderRadius: 8, border: "none",
              background: puedeConfirmar() ? "#111" : "#ccc",
              color: "#fff", fontSize: 14, fontWeight: 500,
              cursor: puedeConfirmar() ? "pointer" : "not-allowed",
            }}
          >Continuar al pago →</button>
        </div>
      )}
    </div>
  );
}
