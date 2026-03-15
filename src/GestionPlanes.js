import { useState, useEffect } from "react";
import { sb } from "./supabase";
import { SubirComprobante, BadgeVerificado, VerComprobante } from "./Comprobante";

const fmt = n => (n||0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const METODOS = ["Efectivo","Tarjeta débito","Tarjeta crédito","Transferencia","Webpay"];

function diasRestantes(fecha) {
  if (!fecha) return null;
  const diff = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}

function AlertaVencimiento({ dias }) {
  if (dias === null) return null;
  if (dias < 0)  return <span style={{ background: "#FCEBEB", color: "#A32D2D", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600 }}>Vencido hace {Math.abs(dias)} días</span>;
  if (dias <= 5) return <span style={{ background: "#FAEEDA", color: "#854F0B", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600 }}>⚠ Vence en {dias} días</span>;
  return <span style={{ background: "#EAF3DE", color: "#3B6D11", padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600 }}>Próximo cobro en {dias} días</span>;
}

export default function GestionPlanes({ userRol }) {
  const [planes,    setPlanes]    = useState([]);
  const [pagos,     setPagos]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [pagoModal, setPagoModal] = useState(null); // { pagoId, monto }
  const [metodo,    setMetodo]    = useState("Transferencia");
  const [toast,     setToast]     = useState(null);

  const showToast = (msg, tipo = "ok") => { setToast({ msg, tipo }); setTimeout(() => setToast(null), 3000); };

  const fetchData = async () => {
    setLoading(true);
    const [{ data: pl }, { data: pg }] = await Promise.all([
      sb.from("arriendos")
        .select("*")
        .eq("tipo_arriendo", "plan")
        .order("fecha_inicio_plan", { ascending: false }),
      sb.from("pagos_plan")
        .select("*")
        .order("mes_numero"),
    ]);
    setPlanes(pl || []);
    setPagos(pg || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const pagosDePlan = (planId) => pagos.filter(p => p.arriendo_id === planId);

  const registrarPago = async (pago) => {
    await sb.from("pagos_plan").update({
      pagado: true,
      fecha_pago: new Date().toISOString().split("T")[0],
      metodo,
      verificado: "aprobado",
    }).eq("id", pago.id);
    await fetchData();
    setPagoModal(null);
    showToast("Pago registrado");
  };

  const aprobarPago = async (pagoId) => {
    await sb.from("pagos_plan").update({ verificado: "aprobado", pagado: true }).eq("id", pagoId);
    await fetchData();
    showToast("Pago aprobado");
  };

  const rechazarPago = async (pagoId) => {
    await sb.from("pagos_plan").update({ verificado: "rechazado", pagado: false }).eq("id", pagoId);
    await fetchData();
    showToast("Pago rechazado", "err");
  };

  if (loading) return <div style={{ padding: 20, color: "#888", fontSize: 13 }}>Cargando planes…</div>;

  const planesActivos   = planes.filter(p => p.fecha_fin_plan >= new Date().toISOString().split("T")[0]);
  const planesVencidos  = planes.filter(p => p.fecha_fin_plan <  new Date().toISOString().split("T")[0]);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>

      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, padding: "10px 18px", borderRadius: 10, fontWeight: 500, fontSize: 13, background: toast.tipo === "err" ? "#E24B4A" : "#1D9E75", color: "#fff" }}>
          {toast.msg}
        </div>
      )}

      {/* Modal registro pago */}
      {pagoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: "min(480px,96vw)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 500 }}>Registrar pago mes {pagoModal.mes}</h3>
            <div style={{ background: "#E6F1FB", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16, color: "#042C53" }}>
              Monto: <strong>{fmt(pagoModal.monto)}</strong>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Método de pago</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>
                {METODOS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>Adjuntar comprobante</div>
              <SubirComprobante
                tabla="pagos_plan"
                registroId={pagoModal.id}
                onSubido={async () => { await fetchData(); setPagoModal(null); showToast("Comprobante enviado"); }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#1D9E75", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                onClick={() => registrarPago(pagoModal)}
              >Registrar pago en efectivo</button>
              <button
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", fontSize: 14, cursor: "pointer" }}
                onClick={() => setPagoModal(null)}
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
        {[
          ["Planes activos", planesActivos.length, "#185FA5"],
          ["Planes vencidos", planesVencidos.length, "#888"],
          ["Recaudado total", fmt(pagos.filter(p => p.pagado).reduce((s, p) => s + p.monto, 0)), "#1D9E75"],
          ["Pagos pendientes", pagos.filter(p => !p.pagado && p.verificado !== "rechazado").length, "#854F0B"],
        ].map(([t, v, c]) => (
          <div key={t} style={{ background: "#f8f8f8", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Planes activos */}
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Planes activos</h3>
      {planesActivos.length === 0 && <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Sin planes activos</div>}

      {planesActivos.map(plan => {
        const pgs      = pagosDePlan(plan.id);
        const pagados  = pgs.filter(p => p.pagado).length;
        const pendiente = pgs.find(p => !p.pagado && p.verificado !== "rechazado");
        const diasProx  = pendiente ? diasRestantes(pendiente.fecha_cobro) : null;
        const isOpen    = expanded === plan.id;

        return (
          <div key={plan.id} style={{ background: "#f8f8f8", borderRadius: 12, marginBottom: 10, overflow: "hidden", border: "1px solid #e8e8e4" }}>

            {/* Header plan */}
            <div
              style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}
              onClick={() => setExpanded(isOpen ? null : plan.id)}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{plan.profesional_nombre}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {plan.box_nombre} · {plan.plan_label}
                  {plan.plan_asistente && <span style={{ marginLeft: 6, color: "#1D9E75", fontWeight: 500 }}>· con asistente</span>}
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  {plan.dias_jornada?.join(", ")} · {plan.hora_inicio_fija}–{plan.hora_fin_fija} · {plan.fecha_inicio_plan} → {plan.fecha_fin_plan}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#185FA5" }}>{fmt(plan.monto)}/mes</span>
                <span style={{ fontSize: 11, color: "#888" }}>{pagados}/{pgs.length} pagos</span>
                {diasProx !== null && <AlertaVencimiento dias={diasProx} />}
                <span style={{ fontSize: 16, color: "#888" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Progreso */}
            <div style={{ padding: "0 16px 12px" }}>
              <div style={{ height: 4, background: "#e0e0e0", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pgs.length ? (pagados / pgs.length) * 100 : 0}%`, background: "#1D9E75", borderRadius: 2, transition: "width .4s" }} />
              </div>
            </div>

            {/* Detalle pagos */}
            {isOpen && (
              <div style={{ borderTop: "1px solid #e8e8e4", padding: "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "#333" }}>Historial de pagos mensuales</div>
                {pgs.map(pg => (
                  <div key={pg.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#fff", borderRadius: 8, marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>Mes {pg.mes_numero}</span>
                      <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>{pg.fecha_cobro}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(pg.monto)}</span>
                      <BadgeVerificado estado={pg.verificado} />
                      {pg.comprobante_url && <VerComprobante path={pg.comprobante_url} nombre={pg.comprobante_nombre} />}
                      {pg.verificado === "pendiente" && userRol !== "prof" && (
                        <>
                          <button onClick={() => aprobarPago(pg.id)}
                            style={{ padding: "3px 10px", borderRadius: 6, border: "none", background: "#1D9E75", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Aprobar</button>
                          <button onClick={() => rechazarPago(pg.id)}
                            style={{ padding: "3px 10px", borderRadius: 6, border: "none", background: "#E24B4A", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✗ Rechazar</button>
                        </>
                      )}
                      {!pg.pagado && pg.verificado !== "pendiente" && userRol !== "prof" && (
                        <button onClick={() => setPagoModal({ ...pg })}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", fontSize: 11, cursor: "pointer" }}>Registrar pago</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Planes vencidos */}
      {planesVencidos.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, marginTop: 24, color: "#888" }}>Planes vencidos</h3>
          {planesVencidos.map(plan => (
            <div key={plan.id} style={{ background: "#f8f8f8", borderRadius: 10, padding: "10px 14px", marginBottom: 8, opacity: .7, border: "1px solid #e8e8e4" }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{plan.profesional_nombre} · {plan.box_nombre}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{plan.plan_label} · venció {plan.fecha_fin_plan}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
