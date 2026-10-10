import { useState, useEffect, useMemo } from "react";
import { apiGet } from "./api";
import { normTipoBox, recursoDeTipo, ESTADOS_OCUPAN } from "./logic/disponibilidad";

// ─── Panel de resumen ejecutivo de arriendos (solo admin) ───────────────
// Consulta su propio rango de fechas (no depende de las 200 reservas ya
// cargadas) y calcula ocupación por ESPACIO FÍSICO para no contar dos veces
// el recinto compartido Dental/Pabellón ni el Box Mixto Médico/Estético.

const fmt = n => (n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const hoyChile = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });

const NOMBRE_TIPO = { dental: "Dental", pabellon: "Pabellón", medico: "Médico", estetico: "Estético" };
const NOMBRE_RECURSO = {
  dental_pabellon: "Box Dental / Pabellón",
  medico_estetico: "Box Mixto Médico / Estético",
};

function rangoPeriodo(periodo, desdeCustom, hastaCustom) {
  const hoy = hoyChile(); // "YYYY-MM-DD" en hora de Chile
  const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  const pad = n => String(n).padStart(2, "0");
  const finMes = (yy, mm) => new Date(yy, mm, 0).getDate();
  if (periodo === "mes") return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(finMes(y, m))}`];
  if (periodo === "mes_ant") {
    const ya = m === 1 ? y - 1 : y, ma = m === 1 ? 12 : m - 1;
    return [`${ya}-${pad(ma)}-01`, `${ya}-${pad(ma)}-${pad(finMes(ya, ma))}`];
  }
  if (periodo === "30d") {
    const d = new Date(hoy + "T12:00:00");
    d.setDate(d.getDate() - 29);
    return [d.toLocaleDateString("en-CA"), hoy];
  }
  // rango personalizado
  return [desdeCustom || hoy, hastaCustom || hoy];
}

const Sx = {
  panel: { background: "#fff", border: "1px solid #eee", borderRadius: 14, padding: 18, marginBottom: 20 },
  chip: act => ({
    padding: "5px 14px", borderRadius: 16, border: "1px solid " + (act ? "#111" : "#ddd"),
    background: act ? "#111" : "#fff", color: act ? "#fff" : "#444",
    fontSize: 12, cursor: "pointer", fontWeight: 500,
  }),
  kpi: { background: "#f8f8f8", borderRadius: 10, padding: "12px 14px", minWidth: 0 },
  kpiNum: { fontSize: 22, fontWeight: 700, lineHeight: 1.1 },
  kpiLbl: { fontSize: 11, color: "#888", marginTop: 3 },
  input: { padding: "6px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13 },
  barraFondo: { background: "#eee", borderRadius: 6, height: 10, overflow: "hidden", flex: 1 },
};

export default function ResumenEjecutivo({ boxes }) {
  const [periodo, setPeriodo] = useState("mes");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(true);

  const [d1, d2] = rangoPeriodo(periodo, desde, hasta);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    (async () => {
      setCargando(true);
      const resp = await apiGet(`/api/datos?resumen=1&desde=${d1}&hasta=${d2}`);
      if (vivo) { setDatos(resp.ok ? (resp.arriendos || []) : []); setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [d1, d2, abierto]);

  const R = useMemo(() => {
    const arr = datos || [];
    const tipoDe = a => {
      const b = boxes.find(x => x.id === a.box_id);
      return normTipoBox(b?.tipo || b?.nombre || a.box_nombre);
    };
    const activos = arr.filter(a => ESTADOS_OCUPAN.includes(a.estado));
    const horasDe = a => Number(a.horas) || 0;

    const porTipo = {};    // horas por modalidad comercial
    const porRecurso = {}; // horas por espacio físico (cada reserva cuenta UNA vez)
    for (const a of activos) {
      const t = tipoDe(a);
      porTipo[t] = (porTipo[t] || 0) + horasDe(a);
      const r = recursoDeTipo(t);
      porRecurso[r] = (porRecurso[r] || 0) + horasDe(a);
    }
    const dias = Math.max(1, Math.round((new Date(d2 + "T12:00:00") - new Date(d1 + "T12:00:00")) / 86400000) + 1);
    const horasDisp = dias * 12; // horario operativo 08:00–20:00
    const ocupacion = {};
    for (const r of Object.keys(NOMBRE_RECURSO)) {
      ocupacion[r] = {
        horas: porRecurso[r] || 0,
        pct: Math.min(100, Math.round(100 * (porRecurso[r] || 0) / horasDisp)),
      };
    }
    return {
      total: arr.length,
      confirmadas: arr.filter(a => a.estado === "confirmado").length,
      pendientes: arr.filter(a => a.estado === "pendiente").length,
      canceladas: arr.filter(a => a.estado === "cancelado").length,
      horas: activos.reduce((s, a) => s + horasDe(a), 0),
      // Ingresos SOLO con pago verificado por la administración (comprobante aprobado)
      ingresos: arr.filter(a => a.estado !== "cancelado" && a.verificado === "aprobado")
        .reduce((s, a) => s + (Number(a.monto) || 0), 0),
      porTipo, ocupacion, dias, horasDisp,
    };
  }, [datos, boxes, d1, d2]);

  const maxTipo = Math.max(1, ...Object.values(R.porTipo));

  return (
    <div style={Sx.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setAbierto(a => !a)}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>📊 Resumen ejecutivo</h3>
        <span style={{ fontSize: 12, color: "#888" }}>{abierto ? "▲ Ocultar" : "▼ Mostrar"}</span>
      </div>

      {abierto && (
        <>
          {/* Filtros de período */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "14px 0" }}>
            {[["mes", "Este mes"], ["mes_ant", "Mes anterior"], ["30d", "Últimos 30 días"], ["rango", "Rango"]].map(([k, lbl]) => (
              <button key={k} style={Sx.chip(periodo === k)} onClick={() => setPeriodo(k)}>{lbl}</button>
            ))}
            {periodo === "rango" && (
              <>
                <input type="date" style={Sx.input} value={desde} onChange={e => setDesde(e.target.value)} />
                <span style={{ fontSize: 12, color: "#888" }}>→</span>
                <input type="date" style={Sx.input} value={hasta} onChange={e => setHasta(e.target.value)} />
              </>
            )}
            <span style={{ fontSize: 11, color: "#aaa", marginLeft: "auto" }}>
              {d1} → {d2} · {R.dias} día{R.dias === 1 ? "" : "s"}{cargando ? " · cargando…" : ""}
            </span>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
            <div style={Sx.kpi}><div style={Sx.kpiNum}>{R.total}</div><div style={Sx.kpiLbl}>Reservas en el período</div></div>
            <div style={Sx.kpi}><div style={{ ...Sx.kpiNum, color: "#1D9E75" }}>{R.confirmadas}</div><div style={Sx.kpiLbl}>Confirmadas</div></div>
            <div style={Sx.kpi}><div style={{ ...Sx.kpiNum, color: "#B07D1A" }}>{R.pendientes}</div><div style={Sx.kpiLbl}>Pendientes</div></div>
            <div style={Sx.kpi}><div style={{ ...Sx.kpiNum, color: "#E24B4A" }}>{R.canceladas}</div><div style={Sx.kpiLbl}>Canceladas</div></div>
            <div style={Sx.kpi}><div style={Sx.kpiNum}>{R.horas} h</div><div style={Sx.kpiLbl}>Horas arrendadas (activas)</div></div>
            <div style={Sx.kpi}><div style={Sx.kpiNum}>{fmt(R.ingresos)}</div><div style={Sx.kpiLbl}>Ingresos con pago verificado *</div></div>
          </div>

          {/* Ocupación por espacio físico (sin doble conteo) */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 8 }}>
              Ocupación por espacio físico <span style={{ fontWeight: 400, color: "#999" }}>(horario 08:00–20:00 · {R.horasDisp} h disponibles por espacio)</span>
            </div>
            {Object.entries(NOMBRE_RECURSO).map(([r, nombre]) => (
              <div key={r} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 12, width: 210, color: "#444" }}>{nombre}</span>
                <div style={Sx.barraFondo}>
                  <div style={{ width: `${R.ocupacion[r].pct}%`, background: "#111", height: "100%" }} />
                </div>
                <span style={{ fontSize: 12, color: "#555", width: 90, textAlign: "right" }}>
                  {R.ocupacion[r].horas} h · {R.ocupacion[r].pct}%
                </span>
              </div>
            ))}
          </div>

          {/* Horas por modalidad comercial */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 8 }}>Horas por modalidad</div>
            {Object.entries(NOMBRE_TIPO).map(([t, nombre]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                <span style={{ fontSize: 12, width: 210, color: "#444" }}>{nombre}</span>
                <div style={Sx.barraFondo}>
                  <div style={{ width: `${Math.round(100 * (R.porTipo[t] || 0) / maxTipo)}%`, background: "#8a8a8a", height: "100%" }} />
                </div>
                <span style={{ fontSize: 12, color: "#555", width: 90, textAlign: "right" }}>{R.porTipo[t] || 0} h</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, color: "#999", marginTop: 12 }}>
            * Solo suma reservas no canceladas con comprobante <strong>aprobado</strong> por administración.
            Dental y Pabellón comparten recinto, igual que Médico y Estético: la ocupación se calcula una sola vez por espacio físico.
          </div>
        </>
      )}
    </div>
  );
}
