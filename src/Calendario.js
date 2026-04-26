import { useState, useEffect } from "react";
import { sb } from "./supabase";

const HORAS = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00"];
const DIAS  = ["Lun","Mar","Mié","Jue","Vie","Sáb"];
const fmt   = n => (n||0).toLocaleString("es-CL",{style:"currency",currency:"CLP",maximumFractionDigits:0});

function calcularPrecio(tipoBox, horas) {
  const esDental = tipoBox?.toLowerCase().includes("dental");
  if (!esDental) {
    if (horas < 1)  return { monto:0,     label:"Mínimo 1 hora",              valido:false };
    if (horas === 1) return { monto:10000, label:"1 hora · $10.000",           valido:true };
    if (horas === 2) return { monto:18000, label:"Bloque 2 horas · $18.000",   valido:true };
    if (horas < 5)  return { monto:horas*10000, label:`${horas} horas · $10.000/hr`, valido:true };
    return           { monto:45000, label:"Jornada (5h) · $45.000",            valido:true };
  } else {
    if (horas < 2)  return { monto:0,     label:"Mínimo 2 horas en box dental", valido:false };
    if (horas === 2) return { monto:18000, label:"2 horas · $9.000/hr",          valido:true };
    if (horas < 5)  return { monto:horas*9000, label:`${horas} horas · $9.000/hr`, valido:true };
    return           { monto:45000, label:"Jornada (5h) · $45.000",             valido:true };
  }
}

function getLunes(offset=0) {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day===0 ? -6 : 1) + offset*7;
  return new Date(d.setDate(diff));
}

function formatFecha(d) {
  // Usar componentes locales para evitar desfase por timezone (Chile UTC-3)
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function Calendario({ user, boxes, profesionales, arriendos: arriendosProp, solicitudes = [], onNuevoArriendo }) {
  const [semana, setSemana]       = useState(0);
  const [boxSel, setBoxSel]       = useState(null);
  const [reserva, setReserva]     = useState(null);
  const [horaFin, setHoraFin]     = useState("");
  const [profId, setProfId]       = useState("");
  const [guardando, setGuardando] = useState(false);
  const [arriendos, setArriendos] = useState(arriendosProp || []);

  useEffect(() => { if (arriendosProp) setArriendos(arriendosProp); }, [arriendosProp]);

const recargarArriendos = async () => {
  const { data } = await sb.from("arriendos").select("*").order("fecha");
  if (data) setArriendos(data);
};

useEffect(() => { recargarArriendos(); }, []);
  useEffect(() => { if (boxes?.length && !boxSel) setBoxSel(boxes[0]); }, [boxes]);
  useEffect(() => {
    if (user?.rol === "prof") {
      const p = profesionales?.find(p => p.nombre === user.nombre);
      if (p) setProfId(p.id);
    }
  }, [user, profesionales]);

  const lunes = getLunes(semana);
  const diasSemana = DIAS.map((d, i) => {
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + i);
    return { label:d, fecha:formatFecha(fecha) };
  });

  const estaOcupado = (fecha, hora) => {
  if (!boxSel) return false;
  return arriendos.some(a =>
    a.box_id === boxSel.id &&
    a.fecha === fecha &&
    (a.estado === "confirmado" || a.estado === "pendiente") &&
    hora >= a.hora_inicio &&
    hora < a.hora_fin
  );
};

// Detecta si un slot de la grilla (1 hora completa) está bloqueado por una cita de paciente
// del mismo tipo de box (ej: si el box seleccionado es "dental" y hay una cita de paciente
// dental ese día y hora, queda bloqueado para todos los profesionales)
const cellEnd = (hora) => {
  const [h] = hora.split(":").map(Number);
  return (h+1).toString().padStart(2,"0") + ":00";
};

const citaPacienteEnSlot = (fecha, hora) => {
  if (!boxSel || !solicitudes?.length) return null;
  const tipoBox = (boxSel.tipo || boxSel.nombre || "").toLowerCase();
  const tipoNorm = tipoBox.includes("dental") ? "dental"
                 : tipoBox.includes("medic")  ? "medico"
                 : "estetico";
  const cellIni = hora;
  const cellFin = cellEnd(hora);
  return solicitudes.find(s =>
    s.box_tipo === tipoNorm &&
    s.fecha_solicitada === fecha &&
    ["agendada","contactado","confirmada"].includes(s.estado) &&
    s.hora_inicio && s.hora_fin &&
    cellIni < s.hora_fin.slice(0,5) &&
    cellFin > s.hora_inicio.slice(0,5)
  ) || null;
};

  const esMiReserva = (fecha, hora) => {
  if (!boxSel || !user) return false;
  return arriendos.some(a =>
    a.box_id === boxSel.id &&
    a.fecha === fecha &&
    (a.profesional_nombre === user.nombre || a.profesional_id === profId) &&
    (a.estado === "confirmado" || a.estado === "pendiente") &&
    hora >= a.hora_inicio &&
    hora < a.hora_fin
  );
};
  const esPasado = (fecha, hora) => new Date(`${fecha}T${hora}:00`) < new Date();

  const handleClickSlot = (fecha, hora) => {
    if (!boxSel || estaOcupado(fecha,hora) || esPasado(fecha,hora) || citaPacienteEnSlot(fecha,hora)) return;
    const esDental = boxSel.nombre?.toLowerCase().includes("dental") || boxSel.tipo?.toLowerCase().includes("dental");
    const minHoras = esDental ? 2 : 1;
    const idxInicio = HORAS.indexOf(hora);
    const horaFinDef = HORAS[Math.min(idxInicio+minHoras, HORAS.length-1)];
    setHoraFin(horaFinDef);
    setReserva({ fecha, horaInicio:hora, box:boxSel });
  };

  const calcHoras = () => {
    if (!reserva || !horaFin) return 0;
    const [h1,m1] = reserva.horaInicio.split(":").map(Number);
    const [h2,m2] = horaFin.split(":").map(Number);
    return ((h2*60+m2)-(h1*60+m1))/60;
  };

  const horas   = calcHoras();
  const tipoBox = reserva?.box?.tipo || reserva?.box?.nombre || "";
  const precio  = calcularPrecio(tipoBox, horas);

  const opcionesHoraFin = () => {
    if (!reserva) return [];
    const idx = HORAS.indexOf(reserva.horaInicio);
    const esDental = tipoBox.toLowerCase().includes("dental");
    return HORAS.slice(idx + (esDental ? 2 : 1));
  };

  const confirmarReserva = async () => {
    if (!precio.valido) return;
    const pid = user?.rol === "prof"
      ? profesionales?.find(p => p.nombre === user.nombre)?.id
      : profId;
    if (!pid) return alert("Selecciona una profesional");
    const prof = profesionales?.find(p => p.id === pid);
    setGuardando(true);

    const { data } = await sb.from("arriendos").insert({
      fecha:             reserva.fecha,
      box_id:            reserva.box.id,
      box_nombre:        reserva.box.nombre,
      profesional_id:    pid,
      profesional_nombre: prof?.nombre || "",
      hora_inicio:       reserva.horaInicio,
      hora_fin:          horaFin,
      horas,
      monto:             precio.monto,
      metodo:            "Transferencia",
      pagado:            false,
      estado:            "pendiente",
      verificado:        "sin_pago",
    }).select().single();

    const tipoBoxNorm = reserva.box.tipo?.toLowerCase().includes("dental") ? "dental" : "estetico";
    const { data: planActivo } = await sb
      .from("planes_profesional")
      .select("id, jornadas_stock")
      .eq("profesional_id", pid)
      .eq("box_tipo", tipoBoxNorm)
      .eq("verificado", "aprobado")
      .gt("jornadas_stock", 0)
      .order("created_at", { ascending:false })
      .limit(1)
      .single();

    if (planActivo) {
      await sb.from("planes_profesional")
        .update({ jornadas_stock: planActivo.jornadas_stock - 1 })
        .eq("id", planActivo.id);
    }

    setGuardando(false);
    setReserva(null);
    onNuevoArriendo && onNuevoArriendo();
  };

  const hoy = formatFecha(new Date());

  return (
    <div style={{ fontFamily:"system-ui,sans-serif" }}>

      {/* Selector boxes */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {boxes?.map(b=>(
          <button key={b.id} onClick={()=>setBoxSel(b)}
            style={{ padding:"6px 16px", borderRadius:20, border:`1px solid ${boxSel?.id===b.id?"#111":"#ccc"}`, background:boxSel?.id===b.id?"#111":"#fff", color:boxSel?.id===b.id?"#fff":"#444", cursor:"pointer", fontSize:13, fontWeight:boxSel?.id===b.id?600:400 }}>
            {b.nombre}
          </button>
        ))}
      </div>

      {/* Navegación semana */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <button onClick={()=>setSemana(s=>s-1)} disabled={semana===0}
          style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #ddd", background:semana===0?"#f5f5f5":"#fff", cursor:semana===0?"default":"pointer", fontSize:13 }}>
          ← Semana anterior
        </button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontWeight:600, fontSize:14 }}>
            {diasSemana[0].fecha} — {diasSemana[5].fecha}
          </div>
          {boxSel && <div style={{ fontSize:12, color:"#888" }}>{boxSel.nombre} · {fmt(boxSel.tarifa_hora)}/hr</div>}
        </div>
        <button onClick={()=>setSemana(s=>s+1)}
          style={{ padding:"6px 14px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:13 }}>
          Semana siguiente →
        </button>
      </div>

      {/* Leyenda */}
      <div style={{ display:"flex", gap:16, fontSize:12, marginBottom:10, flexWrap:"wrap" }}>
        {[["#D4EDDA","#155724","✓ Disponible"],["#F8D7DA","#721C24","X Ocupado prof."],["#FCE4EC","#9C2960","👤 Cita paciente"],["#e8e8e8","#888","Pasado"],["#CCE5FF","#004085","Tu reserva"]].map(([bg,col,l])=>(
          <span key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <span style={{ display:"inline-block", width:14, height:14, background:bg, border:`1px solid ${col}`, borderRadius:3 }}/>
            <span style={{ color:"#555" }}>{l}</span>
          </span>
        ))}
      </div>

      {/* Grilla */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
          <thead>
            <tr>
              <th style={{ padding:"6px 8px", textAlign:"left", color:"#888", fontWeight:400, width:50 }}>Hora</th>
              {diasSemana.map(d=>(
                <th key={d.fecha} style={{ padding:"6px 4px", textAlign:"center", fontWeight:d.fecha===hoy?700:400, color:d.fecha===hoy?"#185FA5":"#333", minWidth:80 }}>
                  {d.label}<br/><span style={{ fontSize:11, fontWeight:400 }}>{d.fecha.slice(5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HORAS.slice(0,-1).map(hora=>(
              <tr key={hora}>
                <td style={{ padding:"3px 8px", color:"#888", fontSize:11 }}>{hora}</td>
                {diasSemana.map(d=>{
                  const ocupado    = estaOcupado(d.fecha, hora);
                  const cita       = citaPacienteEnSlot(d.fecha, hora);
                  const miReserva  = esMiReserva(d.fecha, hora);
                  const pasado     = esPasado(d.fecha, hora);
                  const selec      = reserva?.fecha===d.fecha && reserva?.horaInicio===hora;
                  let bg="#D4EDDA", color="#155724", label="Disponible", cursor="pointer", title="";
                  if (pasado)   { bg="#f0f0f0"; color="#aaa"; label="–"; cursor="default"; }
                  if (ocupado)  { bg="#F8D7DA"; color="#721C24"; label="Ocupado"; cursor="default"; }
                  if (cita)     {
                    bg="#FCE4EC"; color="#9C2960"; label="👤 Paciente"; cursor="not-allowed";
                    title = `Cita: ${cita.nombre}${cita.tratamiento?` · ${cita.tratamiento}`:""} (${(cita.hora_inicio||"").slice(0,5)}–${(cita.hora_fin||"").slice(0,5)}) · ${cita.estado}`;
                  }
                  if (miReserva){ bg="#CCE5FF"; color="#004085"; label="Mi reserva"; cursor="default"; title=""; }
                  if (selec)    { bg="#FFF3CD"; color="#856404"; label="Selec."; }
                  return (
                    <td key={d.fecha} onClick={()=>handleClickSlot(d.fecha,hora)} title={title}
                      style={{ padding:"3px 4px", textAlign:"center", cursor, userSelect:"none" }}>
                      <div style={{ background:bg, color, borderRadius:4, padding:"4px 2px", fontSize:11, fontWeight:500 }}>{label}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal reserva */}
      {reserva && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:14, padding:24, width:"min(420px,96vw)", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:16, fontWeight:500 }}>Reservar horario</h3>
              <button onClick={()=>setReserva(null)} style={{ background:"none", border:"none", fontSize:22, cursor:"pointer", color:"#888" }}>×</button>
            </div>
            <div style={{ background:"#f8f8f8", borderRadius:10, padding:14, marginBottom:16, fontSize:13, lineHeight:2 }}>
              <div>📅 <strong>{reserva.fecha}</strong></div>
              <div>🏠 <strong>{reserva.box.nombre}</strong> · {reserva.box.tipo}</div>
              <div>⏱ Desde: <strong>{reserva.horaInicio}</strong></div>
            </div>
            <label style={{ display:"block", fontSize:12, color:"#666", marginBottom:4 }}>Hora fin *</label>
            <select value={horaFin} onChange={e=>setHoraFin(e.target.value)}
              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, marginBottom:12, background:"#fff" }}>
              {opcionesHoraFin().map(h=><option key={h}>{h}</option>)}
            </select>
            {horas>0 && (
              <div style={{ background:precio.valido?"#EAF3DE":"#FCEBEB", border:`1px solid ${precio.valido?"#C0DD97":"#F5C2C7"}`, borderRadius:8, padding:10, marginBottom:14, fontSize:13, fontWeight:500, color:precio.valido?"#173404":"#721C24" }}>
                {precio.label} — <strong>{precio.valido?fmt(precio.monto):"—"}</strong>
              </div>
            )}
            {user?.rol !== "prof" && (
              <>
                <label style={{ display:"block", fontSize:12, color:"#666", marginBottom:4 }}>Profesional *</label>
                <select value={profId} onChange={e=>setProfId(e.target.value)}
                  style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ddd", fontSize:14, marginBottom:12, background:"#fff" }}>
                  <option value="">— Seleccionar —</option>
                  {profesionales?.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </>
            )}
            <div style={{ background:"#E6F1FB", border:"1px solid #B5D4F4", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#042C53", marginBottom:16, lineHeight:1.7 }}>
              💳 <strong>Pago por transferencia bancaria.</strong><br/>
              Al confirmar, adjunta el comprobante para validar la reserva.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={confirmarReserva} disabled={!precio.valido||guardando}
                style={{ flex:1, padding:"11px", borderRadius:8, border:"none", background:precio.valido?"#111":"#ccc", color:"#fff", cursor:precio.valido?"pointer":"default", fontSize:14, fontWeight:500 }}>
                {guardando?"Guardando…":"✓ Confirmar reserva"}
              </button>
              <button onClick={()=>setReserva(null)}
                style={{ padding:"11px 18px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:14 }}>
                Cancelar
              </button>
            </div>
            <div style={{ textAlign:"center", fontSize:11, color:"#888", marginTop:10 }}>
              La reserva queda pendiente hasta confirmar el pago con comprobante
            </div>
          </div>
        </div>
      )}
    </div>
  );
}