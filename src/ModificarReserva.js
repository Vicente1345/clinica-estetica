import { useState } from "react";
import { conflictosArriendo, conflictosCita, minHorasDeBox, normHora, calcularPrecio, normTipoBox } from "./logic/disponibilidad";
import { apiGestion } from "./api";

const HORAS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const fmt = n => (n||0).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0});

// Permiso exclusivo de la administración (16-10-2026): puede modificar o
// cancelar cualquier reserva hasta que termine, aunque falten menos de 48 h.
// El servidor aplica la misma regla (api/_lib/seguridad.js) y registra cada
// cambio; esta pantalla solo existe para el rol admin.
function terminada(fecha, horaFin) {
  if (!fecha || !horaFin) return true;
  return new Date(`${fecha}T${normHora(horaFin)}:00`) <= new Date();
}
function dentro48h(fecha, horaInicio) {
  if (!fecha || !horaInicio) return false;
  return (new Date(`${fecha}T${normHora(horaInicio)}:00`) - new Date()) / 3600000 <= 48;
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

export default function ModificarReserva({ arriendos, boxes, profesionales, solicitudes = [], userRol, onActualizar }) {
  const [selId, setSelId]             = useState(null);
  const [form, setForm]               = useState({});
  const [guardando, setGuardando]     = useState(false);
  const [toast, setToast]             = useState(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [historial, setHistorial] = useState(null); // { id, items, sinTabla }
  const verHistorial = async (id) => {
    if (historial?.id === id) { setHistorial(null); return; }
    setHistorial({ id, items: null });
    const r = await apiGestion("arriendo_historial", { arriendo_id: id });
    setHistorial({ id, items: r.ok ? (r.historial || []) : [], error: r.ok ? null : (r.error || "No se pudo cargar el historial"), sinTabla: !!r.sinTabla });
  };

  // ── Filtros combinables (solo afectan la lista; la edición no cambia) ──
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  const [fFecha, setFFecha]   = useState("");      // fecha exacta
  const [fDesde, setFDesde]   = useState(hoy);     // rango: desde (por defecto, próximas)
  const [fHasta, setFHasta]   = useState("");      // rango: hasta
  const [fMes, setFMes]       = useState("");      // mes/año (YYYY-MM)
  const [fProf, setFProf]     = useState("");      // búsqueda por nombre
  const [fTipo, setFTipo]     = useState("");      // tipo de box
  const [fEstado, setFEstado] = useState("activas");
  const [visLimit, setVisLimit] = useState(15);    // carga progresiva

  if (userRol !== "admin") return null;
  if (!arriendos || !boxes || !profesionales) {
    return <div style={{fontSize:13,color:"#888",padding:20}}>Cargando reservas…</div>;
  }

  const showToast = (msg, tipo="ok") => {
    setToast({msg,tipo});
    setTimeout(()=>setToast(null), 3500);
  };

  const setF = (setter) => (v) => { setter(v); setVisLimit(15); };
  const limpiarFiltros = () => {
    setFFecha(""); setFDesde(""); setFHasta(""); setFMes("");
    setFProf(""); setFTipo(""); setFEstado("activas"); setVisLimit(15);
  };
  const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const tipoDeArr = (a) => {
    const box = boxes.find(b => b.id === a.box_id);
    return normTipoBox(box?.tipo || box?.nombre || a.box_nombre);
  };
  // Filtros combinables sobre las reservas ya cargadas (máx. 200 recientes,
  // para no traer todo el histórico de una vez); orden cronológico
  const filtrados = arriendos
    .filter(a => a && a.fecha)
    .filter(a => fEstado === "todas" ? true : fEstado === "activas" ? a.estado !== "cancelado" : a.estado === fEstado)
    .filter(a => !fFecha || a.fecha === fFecha)
    .filter(a => !fDesde || a.fecha >= fDesde)
    .filter(a => !fHasta || a.fecha <= fHasta)
    .filter(a => !fMes   || a.fecha.startsWith(fMes))
    .filter(a => !fProf  || norm(a.profesional_nombre).includes(norm(fProf)))
    .filter(a => !fTipo  || tipoDeArr(a) === fTipo)
    .sort((a,b) => (a.fecha||"").localeCompare(b.fecha||"") || (a.hora_inicio||"").localeCompare(b.hora_inicio||""));
  const proximos = filtrados.slice(0, visLimit);
  const MESES = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"];
  const tituloMes = (f) => `${MESES[Number(f.slice(5,7))-1]} ${f.slice(0,4)}`;
  const conteoMes = filtrados.reduce((m,a)=>{ const k=a.fecha.slice(0,7); m[k]=(m[k]||0)+1; return m; },{});

  const seleccionar = (arr) => {
    setSelId(arr.id);
    setForm({ fecha:arr.fecha, horaInicio:arr.hora_inicio, horaFin:arr.hora_fin, boxId:arr.box_id, motivo:"" });
    setConfirmarCancelar(false);
  };

  const guardar = async () => {
    const arr = arriendos.find(a => a.id === selId);
    if (!arr) return;
    if (terminada(arr.fecha, arr.hora_fin)) {
      showToast("Esta reserva ya terminó: no se puede modificar.", "err"); return;
    }
    if (terminada(form.fecha, form.horaFin)) {
      showToast("El nuevo horario ya pasó: elige una fecha y hora futuras.", "err"); return;
    }
    if (!form.motivo.trim()) {
      showToast("Debes ingresar el motivo del cambio.", "err"); return;
    }
    const box = boxes.find(b => b.id === form.boxId);
    if (!box) { showToast("Selecciona un box válido", "err"); return; }

    // Conflictos sobre el RECURSO FÍSICO compartido (Médico+Estético comparten
    // el Box Mixto; Dental y Pabellón son independientes), excluyendo la propia reserva
    const [conflicto] = conflictosArriendo({
      boxes, arriendos, box,
      fecha: form.fecha, horaInicio: form.horaInicio, horaFin: form.horaFin,
      ignorarId: selId,
    });
    if (conflicto) {
      showToast(`Conflicto: ese horario está ocupado (${normHora(conflicto.hora_inicio)}–${normHora(conflicto.hora_fin)} · ${conflicto.box_nombre})`, "err"); return;
    }
    const [cita] = conflictosCita({
      solicitudes, box,
      fecha: form.fecha, horaInicio: form.horaInicio, horaFin: form.horaFin,
    });
    if (cita) {
      showToast(`Conflicto: hay una cita de paciente ${normHora(cita.hora_inicio)}–${normHora(cita.hora_fin)} en ese espacio`, "err"); return;
    }
    const [h1,m1] = form.horaInicio.split(":").map(Number);
    const [h2,m2] = form.horaFin.split(":").map(Number);
    const horas = ((h2*60+m2)-(h1*60+m1))/60;
    // Duración y monto según el catálogo comercial de cada modalidad:
    // impone el mínimo de 2h del médico, los bloques 1/2/4/8 del Pabellón
    // y unifica el reprecio con la tarifa real (antes usaba tarifa_hora plana)
    const precioCat = calcularPrecio(box.tipo || box.nombre, horas);
    if (!precioCat.valido) {
      showToast(`${box.nombre}: ${precioCat.label}`, "err"); return;
    }
    const monto = precioCat.monto;
    setGuardando(true);
    // La escritura pasa por /api/reservar (modo modificación): re-valida en el
    // servidor contra datos frescos del recurso compartido y revierte si otra
    // reserva simultánea gana el horario.
    try {
      let token = "";
      try { token = JSON.parse(sessionStorage.getItem("cli_user") || "{}")._token || ""; } catch {}
      const r = await fetch("/api/reservar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ modificar: {
          id: selId,
          fecha: form.fecha, hora_inicio: form.horaInicio, hora_fin: form.horaFin,
          box_id: form.boxId, box_nombre: box?.nombre || arr.box_nombre,
          horas, monto,
          motivo: form.motivo.trim(),
        }}),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        const det = (data.conflictos || []).slice(0, 2).map(c => `${c.hora_inicio}–${c.hora_fin} (${c.origen})`).join(", ");
        showToast(`${data.error || "No se pudo modificar"}${det ? ` · ${det}` : ""}`, "err");
        setGuardando(false);
        return;
      }
    } catch (e) {
      showToast("Error de conexión al modificar. Intenta de nuevo.", "err");
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setSelId(null);
    showToast("Reserva modificada correctamente.");
    onActualizar && onActualizar();
  };

  const cancelar = async () => {
    const arr = arriendos.find(a => a.id === selId);
    if (!arr) return;
    if (terminada(arr.fecha, arr.hora_fin)) {
      showToast("Esta reserva ya terminó: no se puede cancelar.", "err");
      setConfirmarCancelar(false); return;
    }
    if (!form.motivo.trim()) {
      showToast("Debes ingresar el motivo de la cancelación.", "err"); return;
    }
    setGuardando(true);
    // La cancelación pasa por el servidor (/api/cancelar-arriendo): exige
    // sesión de admin y re-aplica la regla de 48 h en hora de Chile.
    try {
      let token = "";
      try { token = JSON.parse(sessionStorage.getItem("cli_user") || "{}")._token || ""; } catch {}
      const r = await fetch("/api/cancelar-arriendo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: selId, motivo: form.motivo }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        showToast(data.error || "No se pudo cancelar la reserva.", "err");
        setGuardando(false);
        return;
      }
    } catch {
      showToast("Error de conexión al cancelar. Intenta de nuevo.", "err");
      setGuardando(false);
      return;
    }
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
        Como administradora puedes modificar o cancelar <strong>cualquier reserva hasta que termine</strong>, incluso con menos de 48 horas
        de anticipación o el mismo día. Los demás perfiles siguen sujetos a la regla de 48 horas. <strong>Cada cambio queda registrado</strong> (quién, cuándo, qué y por qué).
      </p>

      {/* ── Barra de filtros combinables ── */}
      <div style={{background:"#fff",border:"1px solid #eee",borderRadius:12,padding:14,marginBottom:14}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
          <div>
            <label style={S.label}>Fecha exacta</label>
            <input type="date" style={S.input} value={fFecha} onChange={e=>setF(setFFecha)(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Desde</label>
            <input type="date" style={S.input} value={fDesde} onChange={e=>setF(setFDesde)(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Hasta</label>
            <input type="date" style={S.input} value={fHasta} onChange={e=>setF(setFHasta)(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Mes / año</label>
            <input type="month" style={S.input} value={fMes} onChange={e=>setF(setFMes)(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Profesional</label>
            <input style={S.input} placeholder="Buscar por nombre…" value={fProf} onChange={e=>setF(setFProf)(e.target.value)}/>
          </div>
          <div>
            <label style={S.label}>Tipo de box</label>
            <select style={S.input} value={fTipo} onChange={e=>setF(setFTipo)(e.target.value)}>
              <option value="">Todos</option>
              <option value="dental">Dental</option>
              <option value="pabellon">Pabellón</option>
              <option value="medico">Médico</option>
              <option value="estetico">Estético</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Estado</label>
            <select style={S.input} value={fEstado} onChange={e=>setF(setFEstado)(e.target.value)}>
              <option value="activas">Activas (pend. + conf.)</option>
              <option value="pendiente">Pendiente</option>
              <option value="confirmado">Confirmado</option>
              <option value="cancelado">Cancelado</option>
              <option value="todas">Todas</option>
            </select>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,flexWrap:"wrap",gap:8}}>
          <span style={{fontSize:13,color:"#555"}}>
            <strong>{filtrados.length}</strong> reserva{filtrados.length===1?"":"s"} encontrada{filtrados.length===1?"":"s"}
            {filtrados.length>visLimit ? ` · mostrando las primeras ${visLimit}` : ""}
          </span>
          <button style={S.btn("secondary",true)} onClick={limpiarFiltros}>✕ Limpiar filtros</button>
        </div>
      </div>

      {filtrados.length === 0 && (
        <div style={{fontSize:13,color:"#888"}}>Sin reservas que coincidan con los filtros.</div>
      )}

      {proximos.map((arr, i) => {
        const fin     = terminada(arr.fecha, arr.hora_fin);
        const corto   = !fin && dentro48h(arr.fecha, arr.hora_inicio);
        const puede   = !fin && arr.estado !== "cancelado";
        const hrsRest = horasRestantes(arr.fecha, arr.hora_inicio);
        const esSelec = selId === arr.id;
        const mesKey   = (arr.fecha||"").slice(0,7);
        const nuevoMes = i === 0 || (proximos[i-1].fecha||"").slice(0,7) !== mesKey;

        return (
          <div key={arr.id}>
          {nuevoMes && (
            <div style={{fontSize:12,fontWeight:700,letterSpacing:1,color:"#888",margin:"18px 0 8px",display:"flex",alignItems:"center",gap:8}}>
              <span>{tituloMes(arr.fecha)}</span>
              <span style={{background:"#eee",borderRadius:10,padding:"1px 8px",fontWeight:600}}>{conteoMes[mesKey]}</span>
              <span style={{flex:1,height:1,background:"#eee"}}/>
            </div>
          )}
          <div style={{...S.card,
            border:`1px solid ${esSelec?"#111":corto?"#F4D58D":puede?"#ddd":"#e5e5e5"}`,
            background: esSelec?"#f0f0f0": corto?"#FFFBEB":puede?"#f8f8f8":"#fafafa"}}>

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
                  background: fin?"#f0f0f0":corto?"#FDE8B6":"#EAF3DE",
                  color: fin?"#666":corto?"#8A5A00":"#3B6D11"}}>
                  {fin ? "Terminada" : hrsRest<=0 ? "En curso" : corto ? `${hrsRest}h · permiso admin` : `${hrsRest}h ✓`}
                </span>
                {puede && !esSelec && (
                  <button style={S.btn("secondary",true)} onClick={()=>seleccionar(arr)}>Editar</button>
                )}
                <button style={{...S.btn("secondary",true),background:"transparent",border:"1px solid #ddd"}} onClick={()=>verHistorial(arr.id)}>
                  {historial?.id===arr.id ? "Ocultar historial" : "Historial"}
                </button>
              </div>
            </div>

            {historial?.id===arr.id && (
              <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #eee",fontSize:12}}>
                {historial.items === null && <div style={{color:"#888"}}>Cargando historial…</div>}
                {historial.error && <div style={{color:"#A32D2D"}}>{historial.error}</div>}
                {!historial.error && historial.items && historial.items.length === 0 && (
                  <div style={{color:"#888"}}>
                    {historial.sinTabla ? "El historial detallado se activa al ejecutar docs/migracion-historial-arriendos.sql." : "Sin cambios registrados."}
                    {arr.obs_modificacion && <div style={{marginTop:4,color:"#555"}}>Última nota: {arr.obs_modificacion}</div>}
                  </div>
                )}
                {(historial.items || []).map(h => (
                  <div key={h.id} style={{padding:"5px 0",borderBottom:"1px solid #f3f3f3"}}>
                    <strong>{new Date(h.creado_at).toLocaleString("es-CL",{timeZone:"America/Santiago",dateStyle:"short",timeStyle:"short"})}</strong>
                    {" · "}{h.accion === "cancelar" ? "Canceló" : "Modificó"} · {h.usuario_nombre}
                    {h.dentro_48h && <span style={{marginLeft:6,fontSize:10,fontWeight:700,color:"#8A5A00",background:"#FDE8B6",padding:"1px 6px",borderRadius:6}}>MENOS DE 48 H</span>}
                    <div style={{color:"#555"}}>
                      {h.accion === "modificar"
                        ? <>{h.antes?.fecha} {h.antes?.hora_inicio}–{h.antes?.hora_fin} {h.antes?.box_nombre} → {h.despues?.fecha} {h.despues?.hora_inicio}–{h.despues?.hora_fin} {h.despues?.box_nombre}</>
                        : <>{h.antes?.fecha} {h.antes?.hora_inicio}–{h.antes?.hora_fin} {h.antes?.box_nombre} → cancelada</>}
                    </div>
                    {h.motivo && <div style={{color:"#888"}}>Motivo: {h.motivo}</div>}
                  </div>
                ))}
              </div>
            )}

            {esSelec && (
              <div style={{marginTop:14,paddingTop:14,borderTop:"1px solid #ddd"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={S.label}>Nueva fecha</label>
                    <input type="date" style={S.input} min={hoy} value={form.fecha}
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

                {(corto || (form.fecha && form.horaInicio && dentro48h(form.fecha, form.horaInicio))) && (
                  <div style={{background:"#FFFBEB",border:"1px solid #F4D58D",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#8A5A00",marginTop:10}}>
                    ⚠ Cambio con menos de 48 horas de anticipación: se aplica con el <strong>permiso de administración</strong> y queda registrado.
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
          </div>
        );
      })}

      {filtrados.length > visLimit && (
        <div style={{textAlign:"center",marginTop:12}}>
          <button style={S.btn("secondary")} onClick={()=>setVisLimit(v=>v+15)}>
            Mostrar más ({filtrados.length - visLimit} restantes)
          </button>
        </div>
      )}
    </div>
  );
}