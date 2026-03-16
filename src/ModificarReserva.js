import { useState } from "react";
import { sb } from "./supabase";

const HORAS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const fmt = n => (n||0).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0});

function puedeModificar(fecha, horaInicio) {
  if (!fecha || !horaInicio) return false;
  const reserva = new Date(`${fecha}T${horaInicio}:00`);
  const ahora   = new Date();
  return (reserva - ahora) / (1000 * 60 * 60) > 48;
}

function horasRestantes(fecha, horaInicio) {
  if (!fecha || !horaInicio) return 0;
  const reserva = new Date(`${fecha}T${horaInicio}:00`);
  return Math.round((reserva - new Date()) / (1000 * 60 * 60));
}

const S = {
  input: { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, boxSizing:"border-box", background:"#fff" },
  label: { display:"block", fontSize:12, color:"#666", marginBottom:4, marginTop:10 },
  btn:  (v="primary",sm) => ({ padding:sm?"5px 14px":"9px 22px", borderRadius:8, border:"none", cursor:"pointer", fontSize:sm?12:14, fontWeight:500,
    background:v==="primary"?"#111":v==="danger"?"#E24B4A":v==="success"?"#1D9E75":"#e8e8e8",
    color:v==="secondary"?"#111":"#fff" }),
  card: { background:"#f8f8f8", borderRadius:12, padding:16, marginBottom:10 },
};

export default function ModificarReserva({ arriendos, boxes, profesionales, userRol, onActualizar }) {
  const [selId, setSelId]             = useState(null);
  const [form, setForm]               = useState({});
  const [guardando, setGuardando]     = useState(false);
  const [toast, setToast]             = useState(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  if (userRol !== "admin") return null;
  if (!arriendos || !boxes || !profesionales) {
    return <div style={{fontSize:13,color:"#888",padding:20}}>Cargando reservas…</div>;
  }

  const showToast = (msg, tipo="ok") => {
    setToast({msg,tipo});
    setTimeout(()=>setToast(null), 3500);
  };

  const proximos = arriendos
    .filter(a => a && a.fecha && a.estado !== "cancelado")
    .sort((a,b) => (a.fecha||"").localeCompare(b.fecha||"") || (a.hora_inicio||"").localeCompare(b.hora_inicio||""));

  const seleccionar = (arr) => {
    setSelId(arr.id);
    setForm({ fecha:arr.fecha, horaInicio:arr.hora_inicio, horaFin:arr.hora_fin, boxId:arr.box_id, motivo:"" });
    setConfirmarCancelar(false);
  };

  const guardar = async () => {
    const arr = arriendos.find(a => a.id === selId);
    if (!arr) return;
    if (!puedeModificar(form.fecha, form.horaInicio)) {
      showToast("No se puede modificar: faltan menos de 48 horas.", "err"); return;
    }
    if (!form.motivo.trim()) {
      showToast("Debes ingresar el motivo del cambio.", "err"); return;
    }
    const conflicto = arriendos.find(a =>
      a.id !== selId && a.box_id === form.boxId && a.fecha === form.fecha &&
      a.estado !== "cancelado" &&
      !(form.horaFin <= a.hora_inicio || form.horaInicio >= a.hora_fin)
    );
    if (conflicto) {
      showToast(`Conflicto: ese horario está ocupado (${conflicto.hora_inicio}–${conflicto.hora_fin})`, "err"); return;
    }
    const box = boxes.find(b => b.id === form.boxId);
    const [h1,m1] = form.horaInicio.split(":").map(Number);
    const [h2,m2] = form.horaFin.split(":").map(Number);
    const horas = ((h2*60+m2)-(h1*60+m1))/60;
    const monto = box ? box.tarifa_hora * horas : arr.monto;
    setGuardando(true);
    await sb.from("arriendos").update({
      fecha: form.fecha, hora_inicio: form.horaInicio, hora_fin: form.horaFin,
      box_id: form.boxId, box_nombre: box?.nombre || arr.box_nombre,
      horas, monto,
      obs_modificacion: `Modificado por admin: ${form.motivo}`,
    }).eq("id", selId);
    setGuardando(false);
    setSelId(null);
    showToast("Reserva modificada correctamente.");
    onActualizar && onActualizar();
  };

  const cancelar = async () => {
    const arr = arriendos.find(a => a.id === selId);
    if (!arr) return;
    if (!puedeModificar(arr.fecha, arr.hora_inicio)) {
      showToast("No se puede cancelar: faltan menos de 48 horas.", "err");
      setConfirmarCancelar(false); return;
    }
    if (!form.motivo.trim()) {
      showToast("Debes ingresar el motivo de la cancelación.", "err"); return;
    }
    setGuardando(true);
    await sb.from("arriendos").update({
      estado: "cancelado",
      obs_modificacion: `Cancelado por admin: ${form.motivo}`,
    }).eq("id", selId);
    setGuardando(false);
    setSelId(null);
    setConfirmarCancelar(false);
    showToast("Reserva cancelada.");
    onActualizar && onActualizar();
  };

  return (
    <div>
      {toast && (
        <div style={{position:"fixed",top:16,right:16,zIndex:999,padding:"10px 18px",borderRadius:10,fontWeight:500,fontSize:13,
          background:toast.tipo==="err"?"#E24B4A":"#1D9E75",color:"#fff",boxShadow:"0 2px 16px rgba(0,0,0,.18)"}}>
          {toast.msg}
        </div>
      )}

      <h3 style={{fontSize:15,fontWeight:500,margin:"0 0 4px"}}>Modificar reservas</h3>
      <p style={{fontSize:13,color:"#666",margin:"0 0 16px"}}>
        Solo puedes modificar o cancelar reservas con <strong>más de 48 horas de anticipación</strong>.
      </p>

      {proximos.length === 0 && (
        <div style={{fontSize:13,color:"#888"}}>Sin reservas registradas.</div>
      )}

      {proximos.map(arr => {
        const puede   = puedeModificar(arr.fecha, arr.hora_inicio);
        const hrsRest = horasRestantes(arr.fecha, arr.hora_inicio);
        const esSelec = selId === arr.id;

        return (
          <div key={arr.id} style={{...S.card,
            border:`1px solid ${esSelec?"#111":puede?"#ddd":"#F5C2C7"}`,
            background: esSelec?"#f0f0f0": puede?"#f8f8f8":"#FFF5F5"}}>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{arr.profesional_nombre}</div>
                <div style={{fontSize:13,color:"#555",marginTop:2}}>
                  {arr.box_nombre} · {arr.fecha} · {arr.hora_inicio}–{arr.hora_fin}
                </div>
                <div style={{fontSize:12,color:"#888",marginTop:2}}>{fmt(arr.monto)} · {arr.estado}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:11,padding:"3px 10px",borderRadius:10,fontWeight:600,
                  background:puede?"#EAF3DE":"#FCEBEB",
                  color:puede?"#3B6D11":"#A32D2D"}}>
                  {hrsRest<=0?"Ya pasó":puede?`${hrsRest}h ✓`:`${hrsRest}h 🔒`}
                </span>
                {puede && !esSelec && (
                  <button style={S.btn("secondary",true)} onClick={()=>seleccionar(arr)}>Editar</button>
                )}
                {!puede && hrsRest>0 && (
                  <span style={{fontSize:11,color:"#A32D2D"}}>🔒 Menos de 48h</span>
                )}
              </div>
            </div>

            {esSelec && (
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #ddd"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={S.label}>Nueva fecha</label>
                    <input type="date" style={S.input} value={form.fecha}
                      onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
                  </div>
                  <div>
                    <label style={S.label}>Box</label>
                    <select style={S.input} value={form.boxId} onChange={e=>setForm(f=>({...f,boxId:e.target.value}))}>
                      {boxes.filter(b=>b.activo).map(b=><option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Hora inicio</label>
                    <select style={S.input} value={form.horaInicio} onChange={e=>setForm(f=>({...f,horaInicio:e.target.value}))}>
                      {HORAS.slice(0,-1).map(h=><option key={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Hora fin</label>
                    <select style={S.input} value={form.horaFin} onChange={e=>setForm(f=>({...f,horaFin:e.target.value}))}>
                      {HORAS.filter(h=>h>form.horaInicio).map(h=><option key={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                <label style={S.label}>Motivo del cambio * <span style={{color:"#aaa"}}>(requerido)</span></label>
                <input style={S.input} placeholder="Ej: Solicitud de la profesional, mantención del box…"
                  value={form.motivo} onChange={e=>setForm(f=>({...f,motivo:e.target.value}))}/>

                {form.fecha && form.horaInicio && !puedeModificar(form.fecha, form.horaInicio) && (
                  <div style={{background:"#FCEBEB",border:"1px solid #F5C2C7",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#A32D2D",marginTop:10}}>
                    ⚠ La nueva fecha tampoco cumple las 48 horas mínimas.
                  </div>
                )}

                <div style={{display:"flex",gap:10,marginTop:16,flexWrap:"wrap"}}>
                  <button style={S.btn("primary")} onClick={guardar} disabled={guardando}>
                    {guardando?"Guardando…":"✓ Guardar cambios"}
                  </button>
                  {!confirmarCancelar ? (
                    <button style={S.btn("danger")} onClick={()=>setConfirmarCancelar(true)}>
                      Cancelar reserva
                    </button>
                  ) : (
                    <div style={{display:"flex",gap:8,alignItems:"center",background:"#FCEBEB",borderRadius:8,padding:"6px 12px"}}>
                      <span style={{fontSize:12,color:"#A32D2D"}}>¿Confirmas la cancelación?</span>
                      <button style={S.btn("danger",true)} onClick={cancelar} disabled={guardando}>Sí, cancelar</button>
                      <button style={S.btn("secondary",true)} onClick={()=>setConfirmarCancelar(false)}>No</button>
                    </div>
                  )}
                  <button style={S.btn("secondary")} onClick={()=>{setSelId(null);setConfirmarCancelar(false);}}>
                    ← Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}