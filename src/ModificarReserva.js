import { useState } from "react";
import { sb } from "./supabase";

const METODOS = ["Efectivo","Tarjeta débito","Tarjeta crédito","Transferencia","Webpay"];
const fmt = n => (n||0).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0});

// ── Calcula horas entre dos strings "HH:MM" ───────────────────────
function calcHoras(ini, fin) {
  const [h1,m1] = ini.split(":").map(Number);
  const [h2,m2] = fin.split(":").map(Number);
  const d = (h2*60+m2)-(h1*60+m1);
  return d > 0 ? +(d/60).toFixed(1) : 0;
}

// ── MODAL MODIFICAR RESERVA ───────────────────────────────────────
export default function ModificarReserva({ reserva, boxes, arriendos, onGuardado, onCerrar }) {
  const [fecha,      setFecha]      = useState(reserva.fecha);
  const [horaInicio, setHoraInicio] = useState(reserva.hora_inicio);
  const [horaFin,    setHoraFin]    = useState(reserva.hora_fin);
  const [boxId,      setBoxId]      = useState(reserva.box_id);
  const [motivo,     setMotivo]     = useState("");
  const [notifProf,  setNotifProf]  = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const box      = boxes.find(b => b.id === boxId);
  const horas    = calcHoras(horaInicio, horaFin);
  const tarifa   = box?.tarifa_hora || reserva.monto / reserva.horas || 0;
  const nuevoMonto = +(tarifa * horas).toFixed(0);
  const diferencia = nuevoMonto - reserva.monto;

  // Verificar conflictos (excluyendo la reserva actual)
  const hayConflicto = arriendos.some(a =>
    a.id !== reserva.id &&
    a.box_id === boxId &&
    a.fecha === fecha &&
    a.estado === "confirmado" &&
    !(horaFin <= a.hora_inicio || horaInicio >= a.hora_fin)
  );

  const guardar = async () => {
    setError("");
    if (horas <= 0)      return setError("La hora fin debe ser posterior a la hora inicio.");
    if (hayConflicto)    return setError("Ese horario ya está ocupado en el box seleccionado.");
    if (!motivo.trim())  return setError("Ingresa el motivo del cambio.");

    setLoading(true);

    // Guardar en historial de cambios dentro de la misma fila (campo obs)
    const obsNueva = [
      reserva.obs || "",
      `[Modificado ${new Date().toLocaleDateString("es-CL")}] ${motivo} | Antes: ${reserva.fecha} ${reserva.hora_inicio}-${reserva.hora_fin} ${reserva.box_nombre}`
    ].filter(Boolean).join(" · ");

    const { error: err } = await sb.from("arriendos").update({
      fecha,
      hora_inicio:  horaInicio,
      hora_fin:     horaFin,
      horas,
      box_id:       boxId,
      box_nombre:   box?.nombre || reserva.box_nombre,
      monto:        nuevoMonto,
      obs:          obsNueva,
    }).eq("id", reserva.id);

    setLoading(false);
    if (err) return setError("Error al guardar: " + err.message);
    onGuardado?.();
  };

  const cancelarReserva = async () => {
    if (!motivo.trim()) return setError("Ingresa el motivo de la cancelación.");
    if (!window.confirm(`¿Confirmas cancelar la reserva de ${reserva.profesional_nombre}?`)) return;
    setLoading(true);
    await sb.from("arriendos").update({
      estado: "cancelado",
      obs: `[Cancelado ${new Date().toLocaleDateString("es-CL")}] ${motivo}`,
    }).eq("id", reserva.id);
    setLoading(false);
    onGuardado?.();
  };

  const S = {
    input:  { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, color:"#111", background:"#fff", boxSizing:"border-box" },
    label:  { display:"block", fontSize:12, color:"#666", marginBottom:4, marginTop:12 },
    btn:    (v) => ({ padding:"9px 22px", borderRadius:8, border:"none", cursor:"pointer", fontSize:14, fontWeight:500, background:v==="primary"?"#111":v==="danger"?"#E24B4A":"#e8e8e8", color:v==="secondary"?"#111":"#fff" }),
    row2:   { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
    info:   (c) => ({ background:c+"22", border:`1px solid ${c}55`, borderRadius:8, padding:"9px 12px", fontSize:13, color:c==="ok"?"#173404":c }),
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:14, padding:24, width:"min(560px,96vw)", maxHeight:"94vh", overflowY:"auto" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <h3 style={{ margin:"0 0 2px", fontSize:16, fontWeight:600 }}>Modificar reserva</h3>
            <p style={{ margin:0, fontSize:12, color:"#888" }}>{reserva.profesional_nombre} · {reserva.box_nombre}</p>
          </div>
          <button style={{ background:"none", border:"none", cursor:"pointer", fontSize:22, color:"#888" }} onClick={onCerrar}>×</button>
        </div>

        {/* Info original */}
        <div style={{ background:"#f8f8f6", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#666", marginBottom:16, lineHeight:1.8 }}>
          <strong>Reserva original:</strong><br/>
          📅 {reserva.fecha} · ⏱ {reserva.hora_inicio}–{reserva.hora_fin} · 🏠 {reserva.box_nombre} · 💰 {fmt(reserva.monto)}
        </div>

        {/* Box */}
        <label style={S.label}>Box *</label>
        <select style={S.input} value={boxId} onChange={e => setBoxId(e.target.value)}>
          {boxes.filter(b => b.activo).map(b => (
            <option key={b.id} value={b.id}>{b.nombre} · {b.tipo} · {fmt(b.tarifa_hora)}/hr</option>
          ))}
        </select>

        {/* Fecha y horario */}
        <div style={S.row2}>
          <div>
            <label style={S.label}>Nueva fecha *</label>
            <input type="date" style={S.input} value={fecha} onChange={e => setFecha(e.target.value)}/>
          </div>
          <div/>
        </div>
        <div style={S.row2}>
          <div>
            <label style={S.label}>Hora inicio *</label>
            <input type="time" style={S.input} value={horaInicio} onChange={e => setHoraInicio(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Hora fin *</label>
            <input type="time" style={S.input} value={horaFin} onChange={e => setHoraFin(e.target.value)}/>
          </div>
        </div>

        {/* Alerta conflicto */}
        {hayConflicto && (
          <div style={{ background:"#FCEBEB", border:"1px solid #F09595", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#A32D2D", marginTop:10 }}>
            ✗ Ese horario ya está ocupado en {box?.nombre}. Elige otro horario o box.
          </div>
        )}

        {/* Resumen nuevo monto */}
        {horas > 0 && !hayConflicto && (
          <div style={{ background: diferencia === 0 ? "#f8f8f6" : diferencia > 0 ? "#FAEEDA" : "#EAF3DE", border:"1px solid #e8e8e4", borderRadius:8, padding:"10px 14px", fontSize:13, marginTop:10, lineHeight:1.8 }}>
            <div>{horas} hora{horas!==1?"s":""} × {fmt(tarifa)}/hr = <strong>{fmt(nuevoMonto)}</strong></div>
            {diferencia !== 0 && (
              <div style={{ color: diferencia > 0 ? "#854F0B" : "#3B6D11", fontWeight:500 }}>
                {diferencia > 0 ? `↑ Diferencia a cobrar: ${fmt(diferencia)}` : `↓ Diferencia a devolver: ${fmt(Math.abs(diferencia))}`}
              </div>
            )}
          </div>
        )}

        {/* Motivo */}
        <label style={S.label}>Motivo del cambio * <span style={{ fontWeight:400, color:"#aaa" }}>(queda registrado)</span></label>
        <input style={S.input} placeholder="Ej: Solicitud de la profesional, cambio de disponibilidad…" value={motivo} onChange={e => setMotivo(e.target.value)}/>

        {/* Notificar */}
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, marginTop:12, cursor:"pointer" }}>
          <input type="checkbox" checked={notifProf} onChange={e => setNotifProf(e.target.checked)}/>
          Dejar nota visible para la profesional
        </label>

        {/* Error */}
        {error && (
          <div style={{ background:"#FCEBEB", border:"1px solid #F09595", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#A32D2D", marginTop:12 }}>
            {error}
          </div>
        )}

        {/* Botones */}
        <div style={{ display:"flex", gap:10, marginTop:20, flexWrap:"wrap" }}>
          <button style={S.btn("primary")} onClick={guardar} disabled={loading || hayConflicto}>
            {loading ? "Guardando…" : "✓ Guardar cambios"}
          </button>
          <button style={{ ...S.btn("danger") }} onClick={cancelarReserva} disabled={loading}>
            ✗ Cancelar reserva
          </button>
          <button style={S.btn("secondary")} onClick={onCerrar}>Volver</button>
        </div>

      </div>
    </div>
  );
}
