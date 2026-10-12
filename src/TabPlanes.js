import { useState, useEffect, useRef } from "react";
import { apiGet, apiGestion, abrirComprobante, subirArchivoComprobante } from "./api";
import PlanesEspeciales from "./PlanesEspeciales";

const NOMBRE_DIA = { 1:"Lun", 2:"Mar", 3:"Mié", 4:"Jue", 5:"Vie", 6:"Sáb", 7:"Dom" };
const describirHorario = h => (h || []).map(x => `${NOMBRE_DIA[x.dia]} ${x.hora_inicio}–${x.hora_fin}`).join(" · ");
const BOX_TXT = t => t === "estetico" ? "✨ Box Estético" : t === "medico" ? "🏥 Box Médico" : t === "pabellon" ? "⚕️ Pabellón" : "🦷 Box Dental";
const plural = (n, s1, sN) => `${n} ${n === 1 ? s1 : sN}`;

// ¿A cuántas jornadas SEMANALES equivale un plan contratado?
// (especial: días del horario; planes con días fijos: esos días; resto: el
// número del id del catálogo, ej. "den_2j_sin_12m" → 2; "exclusivo" → 5)
function jornadasSemanales(plan) {
  if (plan.es_especial && Array.isArray(plan.horario)) return plan.horario.length;
  if (Array.isArray(plan.dias_semana) && plan.dias_semana.length) return plan.dias_semana.length;
  const m = String(plan.plan_id || "").match(/_(\d)j/);
  if (m) return Number(m[1]);
  if (/exc/i.test(String(plan.plan_id || ""))) return 5;
  return plan.jornadas_totales ? Math.max(1, Math.round(plan.jornadas_totales / 4)) : null;
}
const jornadasTxt = n => n ? plural(n, "jornada semanal", "jornadas semanales") : "jornadas por definir";

const fmt = n => (n||0).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0});

const PLANES_DEF = {
  estetico: [
    { id:"est_1j", label:"1 jornada/semana",   precio:170000, jornadas:4,  asistente:false, detalle:"4 jornadas al mes · horario fijo" },
    { id:"est_2j", label:"2 jornadas/semana",  precio:330000, jornadas:8,  asistente:false, detalle:"8 jornadas al mes · horario fijo" },
    { id:"est_3j", label:"3 jornadas/semana",  precio:480000, jornadas:12, asistente:false, detalle:"12 jornadas al mes · horario fijo" },
  ],
  dental: [
    { id:"den_1j",  label:"1 jornada/semana",         precio:170000, jornadas:4,  asistente:false, detalle:"Sin asistente · 4 jornadas/mes" },
    { id:"den_2j",  label:"2 jornadas/semana",        precio:340000, jornadas:8,  asistente:false, detalle:"Sin asistente · 8 jornadas/mes" },
    { id:"den_1jp", label:"1 jornada/semana Pro",     precio:250000, jornadas:4,  asistente:true,  detalle:"Con asistente · 4 jornadas/mes" },
    { id:"den_2jp", label:"2 jornadas/semana Pro",    precio:500000, jornadas:8,  asistente:true,  detalle:"Con asistente · 8 jornadas/mes" },
    { id:"den_exc", label:"Plan Exclusivo ⭐",        precio:1350000,jornadas:20, asistente:false, detalle:"5 jornadas semanales" },
  ],
  medico: [
    { id:"med_1j",  label:"1 jornada/semana",        precio:215000, jornadas:4,  asistente:false, detalle:"4 jornadas al mes · horario fijo" },
    { id:"med_2j",  label:"2 jornadas/semana",        precio:420000, jornadas:8,  asistente:false, detalle:"8 jornadas al mes · horario fijo" },
    { id:"med_3j",  label:"3 jornadas/semana",        precio:645000, jornadas:12, asistente:false, detalle:"12 jornadas al mes · horario fijo" },
    { id:"med_5j",  label:"5 jornadas/semana ⭐",     precio:1050000,jornadas:20, asistente:false, detalle:"Lunes a viernes · horario fijo" },
  ],
};

const S = {
  card: { background:"#fff", borderRadius:12, border:"1px solid #eee", overflow:"hidden", marginBottom:10 },
  btn: (v="primary",sm) => ({ padding:sm?"5px 14px":"10px 22px", borderRadius:8, border:"none", cursor:"pointer", fontSize:sm?12:14, fontWeight:500, background:v==="primary"?"#111":v==="success"?"#1D9E75":v==="danger"?"#E24B4A":"#e8e8e8", color:v==="secondary"?"#111":"#fff" }),
  label: { display:"block", fontSize:12, color:"#666", marginBottom:4, marginTop:10 },
  input: { width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, boxSizing:"border-box", background:"#fff" },
};

// ── Subida de comprobante ──────────────────────────────────────
function SubirComprobantePlan({ planId, onSubido }) {
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  const handleFile = e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError("Máximo 5MB"); return; }
    setArchivo(f); setError("");
  };

  const handleSubir = async () => {
    if (!archivo) return;
    setSubiendo(true); setError("");
    const ext  = archivo.name.split(".").pop();
    const path = `planes/${planId}/${Date.now()}.${ext}`;
    const { error: upErr } = await subirArchivoComprobante(path, archivo);
    if (upErr) { setError("Error al subir: " + upErr.message); setSubiendo(false); return; }
    const resp = await apiGestion("comprobante_vincular", { tabla: "planes_profesional", id: planId, path, nombre: archivo.name });
    if (!resp.ok) { setError(resp.error || "No se pudo registrar el comprobante"); setSubiendo(false); return; }
    setSubiendo(false);
    onSubido && onSubido();
  };

  return (
    <div style={{marginTop:12}}>
      <div onClick={()=>inputRef.current?.click()}
        style={{border:"2px dashed #ddd",borderRadius:10,padding:"18px 12px",textAlign:"center",cursor:"pointer",background:"#fafafa"}}>
        <div style={{fontSize:28,marginBottom:6}}>📎</div>
        <div style={{fontSize:13,color:"#555"}}>{archivo ? archivo.name : "Haz clic para adjuntar el comprobante"}</div>
        <div style={{fontSize:11,color:"#aaa",marginTop:4}}>JPG, PNG o PDF · máx 5MB</div>
        <input ref={inputRef} type="file" accept="image/*,.pdf" style={{display:"none"}} onChange={handleFile}/>
      </div>
      {error && <div style={{color:"#A32D2D",fontSize:12,marginTop:6}}>{error}</div>}
      {archivo && (
        <button onClick={handleSubir} disabled={subiendo} style={{...S.btn("success"),marginTop:10,width:"100%"}}>
          {subiendo ? "Subiendo…" : "✓ Confirmar pago con comprobante"}
        </button>
      )}
    </div>
  );
}

// ── Panel de un plan activo ────────────────────────────────────
function PlanActivo({ plan, onReservar, onActualizar }) {
  if (plan.es_especial) return <PlanEspecialActivo plan={plan} onActualizar={onActualizar}/>;
  const pct = Math.round((plan.jornadas_stock / plan.jornadas_totales) * 100);
  const colorBarra = pct > 50 ? "#1D9E75" : pct > 20 ? "#EF9F27" : "#E24B4A";

  return (
    <div style={{...S.card, borderLeft:`4px solid ${colorBarra}`}}>
      <div style={{padding:"14px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontWeight:600,fontSize:15}}>{plan.plan_label}</div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>
              {plan.box_tipo === "estetico" ? "✨ Box Estético" : plan.box_tipo === "medico" ? "🏥 Box Médico" : "🦷 Box Dental"}
              {plan.con_asistente && " · con asistente"}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <span style={{fontSize:11,padding:"3px 10px",borderRadius:10,fontWeight:600,
              background:plan.verificado==="aprobado"?"#EAF3DE":plan.verificado==="pendiente"?"#FAEEDA":"#f0f0f0",
              color:plan.verificado==="aprobado"?"#3B6D11":plan.verificado==="pendiente"?"#854F0B":"#666"}}>
              {plan.verificado==="aprobado"?"✓ Activo":plan.verificado==="pendiente"?"⏳ Pendiente verificación":"Sin pago"}
            </span>
          </div>
        </div>

        {/* Barra de jornadas */}
        {plan.verificado === "aprobado" && (
          <div style={{marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
              <span style={{color:"#666"}}>Jornadas disponibles</span>
              <strong style={{color:colorBarra}}>{plan.jornadas_stock} / {plan.jornadas_totales}</strong>
            </div>
            <div style={{background:"#eee",borderRadius:6,height:8,overflow:"hidden"}}>
              <div style={{width:`${pct}%`,background:colorBarra,height:"100%",borderRadius:6,transition:"width .3s"}}/>
            </div>
            <div style={{fontSize:11,color:"#888",marginTop:4}}>
              Vigencia: {plan.fecha_inicio} → {plan.fecha_vencimiento || "Sin vencimiento"}
            </div>
          </div>
        )}

        {/* Comprobante pendiente */}
        {plan.verificado === "sin_pago" && (
          <SubirComprobantePlan planId={plan.id} onSubido={onActualizar}/>
        )}
        {plan.verificado === "pendiente" && (
          <div style={{marginTop:10,background:"#FAEEDA",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#854F0B"}}>
            ⏳ Comprobante enviado — esperando aprobación de la administración.
          </div>
        )}

        {/* Botón reservar */}
        {plan.verificado === "aprobado" && plan.jornadas_stock > 0 && (
          <button onClick={() => onReservar(plan)} style={{...S.btn("primary"),marginTop:12,width:"100%",fontSize:13}}>
            📅 Reservar jornada ({plan.jornadas_stock} disponibles)
          </button>
        )}
        {plan.verificado === "aprobado" && plan.jornadas_stock === 0 && (
          <div style={{marginTop:10,background:"#FCEBEB",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#A32D2D",textAlign:"center"}}>
            ⚠ Sin jornadas disponibles este mes
          </div>
        )}
      </div>
    </div>
  );
}

// ── Plan especial asignado (vista de la profesional beneficiaria) ──
// Sus jornadas ya están reservadas: no hay "reservar jornada" ni stock.
function PlanEspecialActivo({ plan, onActualizar }) {
  const finalizado = !!plan.finalizado_at;
  return (
    <div style={{...S.card, borderLeft:"4px solid #6D28D9"}}>
      <div style={{padding:"14px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontWeight:600,fontSize:15}}>⭐ {plan.plan_label}</div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>{BOX_TXT(plan.box_tipo)} · {jornadasTxt(jornadasSemanales(plan))}</div>
          </div>
          <span style={{fontSize:11,padding:"3px 10px",borderRadius:10,fontWeight:600,
            background:finalizado?"#f0f0f0":plan.verificado==="aprobado"?"#EAF3DE":plan.verificado==="pendiente"?"#FAEEDA":"#f0f0f0",
            color:finalizado?"#666":plan.verificado==="aprobado"?"#3B6D11":plan.verificado==="pendiente"?"#854F0B":"#666"}}>
            {finalizado?"Finalizado":plan.verificado==="aprobado"?"✓ Pago aprobado":plan.verificado==="pendiente"?"⏳ Pendiente verificación":"Sin pago"}
          </span>
        </div>
        <div style={{fontSize:13,color:"#444",marginTop:10,lineHeight:1.8}}>
          🗓 <strong>{describirHorario(plan.horario)}</strong><br/>
          Vigencia: {plan.fecha_inicio} → {plan.fecha_vencimiento} · {plan.jornadas_totales} jornadas reservadas
        </div>
        {!finalizado && (
          <div style={{marginTop:8,fontSize:12,color:"#6D28D9",background:"#F3F0FF",borderRadius:8,padding:"8px 12px"}}>
            Tus jornadas ya están reservadas: las ves en la <strong>Agenda</strong> y en <strong>Disponibilidad</strong>.
          </div>
        )}
        {!finalizado && (plan.verificado === "sin_pago" || plan.verificado === "rechazado") && (
          <SubirComprobantePlan planId={plan.id} onSubido={onActualizar}/>
        )}
        {!finalizado && plan.verificado === "pendiente" && (
          <div style={{marginTop:10,background:"#FAEEDA",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#854F0B"}}>
            ⏳ Comprobante enviado — esperando aprobación de la administración.
          </div>
        )}
      </div>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────
export default function TabPlanes({ user, profesionales, boxes, onReservar }) {
  const [planes, setPlanes]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [boxActivo, setBoxActivo]   = useState("estetico");
  const [planSel, setPlanSel]       = useState(null);   // plan a contratar
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split("T")[0]);
  const [creando, setCreando]       = useState(false);
  const [nuevoPlanId, setNuevoPlanId] = useState(null); // para subir comprobante
  const [planesEspeciales, setPlanesEspeciales] = useState(null); // solo admin

  const profId = user?.rol === "prof"
    ? profesionales?.find(p => p.nombre === user.nombre)?.id
    : null;

  const cargar = async () => {
    setLoading(true);
    // /api/datos ya devuelve los planes filtrados por rol (prof: solo los suyos)
    const datos = await apiGet("/api/datos");
    setPlanes(datos.ok ? (datos.planes || []) : []);
    setPlanesEspeciales(datos.ok && Array.isArray(datos.planesEspeciales) ? datos.planesEspeciales : null);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [profId]);

  const contratarPlan = async () => {
    if (!planSel) return;
    const pid = profId || "";
    const prof = profesionales?.find(p => p.id === pid);
    setCreando(true);
    const fecha = new Date(fechaInicio);
    const venc  = new Date(fecha); venc.setMonth(venc.getMonth() + 1);
    const resp = await apiGestion("plan_registrar", {
      profesional_id:    pid,
      profesional_nombre: prof?.nombre || user.nombre,
      box_tipo:          boxActivo,
      plan_id:           planSel.id,
      plan_label:        planSel.label,
      plan_precio:       planSel.precio,
      con_asistente:     planSel.asistente,
      jornadas_totales:  planSel.jornadas,
      fecha_inicio:      fechaInicio,
      fecha_vencimiento: venc.toISOString().split("T")[0],
    });
    setCreando(false);
    setNuevoPlanId(resp.ok ? resp.id : null);
    setPlanSel(null);
    cargar();
  };

  // El servidor ya entrega a la profesional SOLO sus planes (por su token)
  const misPlanes  = user?.rol === "prof" ? planes : planes.filter(p => p.profesional_id === profId);
  const todosPlanes = planes; // admin y recepción
  const esAdmin = user?.rol === "admin";
  const esRecep = user?.rol === "recep";

  return (
    <div>
      {/* ── MIS PLANES ACTIVOS ── */}
      {user?.rol === "prof" && (
        <div style={{marginBottom:28}}>
          <h3 style={{fontSize:15,fontWeight:600,margin:"0 0 4px"}}>Mis planes activos</h3>
          <p style={{fontSize:13,color:"#666",margin:"0 0 14px"}}>Aquí ves tus planes contratados y las jornadas disponibles.</p>
          {loading ? <div style={{color:"#888",fontSize:13}}>Cargando…</div> :
           misPlanes.length === 0 ? (
            <div style={{background:"#f8f8f8",borderRadius:10,padding:20,textAlign:"center",fontSize:13,color:"#888"}}>
              No tienes planes activos. Contrata uno abajo 👇
            </div>
           ) : misPlanes.map(p => (
            <PlanActivo key={p.id} plan={p} onActualizar={cargar}
              onReservar={(plan) => onReservar && onReservar(plan)}/>
           ))
          }
        </div>
      )}

      {/* ── ADMIN: Planes Especiales (privados) ── */}
      {esAdmin && !loading && (
        <PlanesEspeciales
          defs={planesEspeciales}
          asignaciones={planes.filter(p => p.es_especial)}
          profesionales={profesionales || []}
          onCambio={cargar}
        />
      )}

      {/* ── RECEPCIÓN: catálogo de referencia, sin precios ── */}
      {esRecep && (
        <div style={{marginBottom:28}}>
          <h3 style={{fontSize:15,fontWeight:600,margin:"0 0 4px"}}>Planes disponibles</h3>
          <p style={{fontSize:13,color:"#666",margin:"0 0 12px"}}>Referencia de jornadas semanales de cada plan.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
            {[["estetico","Estético"],["dental","Dental"],["medico","Médico"]].map(([k,nombre]) => (
              <div key={k} style={{...S.card,padding:"12px 14px",marginBottom:0}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:6}}>{BOX_TXT(k)}</div>
                {PLANES_DEF[k].map(pl => (
                  <div key={pl.id} style={{fontSize:13,padding:"4px 0",borderTop:"1px solid #f3f3f3"}}>
                    Plan {nombre} — <strong>{jornadasTxt(Math.max(1, Math.round(pl.jornadas / 4)))}</strong>
                    {pl.asistente && <span style={{fontSize:11,color:"#1D9E75"}}> · con asistente</span>}
                    <div style={{fontSize:11,color:"#888"}}>{pl.jornadas} jornadas incluidas al mes · horario fijo</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN Y RECEPCIÓN: planes contratados ── */}
      {user?.rol !== "prof" && (
        <div style={{marginBottom:28}}>
          <h3 style={{fontSize:15,fontWeight:600,margin:"0 0 14px"}}>Planes contratados</h3>
          {loading ? <div style={{color:"#888",fontSize:13}}>Cargando…</div> :
           todosPlanes.length === 0 ? <div style={{fontSize:13,color:"#888"}}>Sin planes registrados</div> :
           todosPlanes.map(p => (
            <div key={p.id} style={{...S.card,padding:"12px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{p.profesional_nombre}</div>
                  <div style={{fontSize:12,color:"#666"}}>
                    {p.plan_label} · {p.box_tipo==="estetico"?"✨ Estético":p.box_tipo==="medico"?"🏥 Médico":"🦷 Dental"}
                    {p.es_especial && <span style={{marginLeft:6,fontSize:10,fontWeight:700,color:"#6D28D9",background:"#F3F0FF",padding:"1px 7px",borderRadius:6}}>⭐ ESPECIAL</span>}
                  </div>
                  <div style={{fontSize:12,color:"#185FA5",marginTop:2}}>
                    {jornadasTxt(jornadasSemanales(p))}{p.es_especial && p.horario ? ` · ${describirHorario(p.horario)}` : ""}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  {esAdmin && <span style={{fontSize:13,fontWeight:600,color:"#185FA5"}}>{fmt(p.plan_precio)}/mes</span>}
                  {p.finalizado_at && <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,fontWeight:600,background:"#f0f0f0",color:"#666"}}>Finalizado</span>}
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,fontWeight:600,
                    background:p.verificado==="aprobado"?"#EAF3DE":p.verificado==="pendiente"?"#FAEEDA":"#f0f0f0",
                    color:p.verificado==="aprobado"?"#3B6D11":p.verificado==="pendiente"?"#854F0B":"#666"}}>
                    {p.verificado==="aprobado"?"✓ Aprobado":p.verificado==="pendiente"?"⏳ Pendiente":"Sin pago"}
                  </span>
                  {esAdmin && p.verificado==="pendiente" && (
                    <button onClick={async()=>{
                      await apiGestion("plan_verificar", { id: p.id, decision: "aprobado" });
                      cargar();
                    }} style={S.btn("success",true)}>Aprobar</button>
                  )}
                  {esAdmin && p.verificado==="pendiente" && (
                    <button onClick={async()=>{
                      await apiGestion("plan_verificar", { id: p.id, decision: "rechazado" });
                      cargar();
                    }} style={S.btn("danger",true)}>Rechazar</button>
                  )}
                </div>
              </div>
              <div style={{fontSize:12,color:"#888",marginTop:6}}>
                {p.es_especial
                  ? <>Jornadas reservadas: <strong>{p.jornadas_totales}</strong> · Vigencia: {p.fecha_inicio} → {p.fecha_vencimiento}</>
                  : <>Jornadas: <strong>{p.jornadas_stock}/{p.jornadas_totales}</strong> disponibles · Vigencia: {p.fecha_inicio} → {p.fecha_vencimiento}</>}
              </div>
              {esAdmin && p.comprobante_url && (
                <button onClick={()=>abrirComprobante("planes_profesional", p.id)}
                  style={{...S.btn("secondary",true),marginTop:8,fontSize:11}}>
                  📎 Ver comprobante
                </button>
              )}
            </div>
           ))
          }
        </div>
      )}

      {/* ── CONTRATAR NUEVO PLAN ── */}
      {user?.rol === "prof" && (
        <div>
          <h3 style={{fontSize:15,fontWeight:600,margin:"0 0 4px"}}>Contratar un plan</h3>
          <p style={{fontSize:13,color:"#666",margin:"0 0 16px"}}>Elige el box y el plan que más te acomoda.</p>

          {/* Selector box */}
          <div style={{display:"flex",gap:0,marginBottom:20,borderRadius:8,overflow:"hidden",border:"1px solid #ddd",width:"fit-content"}}>
            {[["estetico","✨ Box Estético"],["dental","🦷 Box Dental"],["medico","🏥 Box Médico"]].map(([k,l])=>(
              <button key={k} onClick={()=>{setBoxActivo(k);setPlanSel(null);}}
                style={{padding:"9px 24px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
                  background:boxActivo===k?"#111":"#fff",color:boxActivo===k?"#fff":"#555"}}>
                {l}
              </button>
            ))}
          </div>

          {/* Lista de planes */}
          <div style={{display:"grid",gap:8,marginBottom:16}}>
            {PLANES_DEF[boxActivo].map(p => (
              <div key={p.id} onClick={()=>setPlanSel(planSel?.id===p.id?null:p)}
                style={{padding:"14px 16px",borderRadius:10,border:`2px solid ${planSel?.id===p.id?"#111":"#eee"}`,
                  background:planSel?.id===p.id?"#f8f8f8":"#fff",cursor:"pointer",
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{p.label}</div>
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>{p.detalle}</div>
                  <div style={{fontSize:11,color:"#185FA5",marginTop:4}}>
                    {p.jornadas} jornadas incluidas · se descuenta 1 por reserva
                  </div>
                </div>
                <div style={{textAlign:"right",minWidth:90}}>
                  <div style={{fontSize:18,fontWeight:700,color:"#111"}}>{fmt(p.precio)}</div>
                  <div style={{fontSize:10,color:"#888"}}>/ mes</div>
                  {planSel?.id===p.id && <div style={{fontSize:11,color:"#1D9E75",marginTop:4}}>✓ Seleccionado</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Fecha inicio y confirmar */}
          {planSel && !nuevoPlanId && (
            <div style={{background:"#f8f8f8",borderRadius:10,padding:16,marginBottom:16}}>
              <div style={{fontWeight:600,fontSize:14,marginBottom:10}}>Confirmar plan: {planSel.label}</div>
              <label style={S.label}>Fecha de inicio</label>
              <input type="date" style={S.input} value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/>
              <div style={{background:"#E6F1FB",border:"1px solid #B5D4F4",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#042C53",margin:"12px 0",lineHeight:1.7}}>
                💳 <strong>Pago por transferencia bancaria.</strong><br/>
                Al confirmar, deberás adjuntar el comprobante para que la administración active tu plan.
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={contratarPlan} disabled={creando} style={S.btn("primary")}>
                  {creando?"Guardando…":"Contratar plan →"}
                </button>
                <button onClick={()=>setPlanSel(null)} style={S.btn("secondary")}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Subir comprobante del plan nuevo */}
          {nuevoPlanId && (
            <div style={{background:"#fff",borderRadius:10,border:"1px solid #eee",padding:20}}>
              <div style={{textAlign:"center",marginBottom:16}}>
                <div style={{fontSize:36,marginBottom:8}}>🧾</div>
                <div style={{fontSize:15,fontWeight:600}}>Plan contratado — adjunta el comprobante</div>
                <div style={{fontSize:13,color:"#666",marginTop:4}}>
                  Tu plan quedará <strong>pendiente</strong> hasta que la administración apruebe el pago.
                </div>
              </div>
              <SubirComprobantePlan planId={nuevoPlanId} onSubido={()=>{ setNuevoPlanId(null); cargar(); }}/>
              <button onClick={()=>{ setNuevoPlanId(null); cargar(); }}
                style={{...S.btn("secondary"),marginTop:10,fontSize:12,width:"100%"}}>
                Subir comprobante más tarde
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
