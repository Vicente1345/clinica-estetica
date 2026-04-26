import { useState, useEffect } from "react";
import { sb } from "./supabase";

// ── PALETA inspirada en Barcelona Clinic Instagram ─────────────
const C = {
  lila:        "#9B8EC4",
  lilaClaro:   "#C4B8E3",
  lilaPale:    "#EDE8F7",
  rosa:        "#E8B4C0",
  rosaPale:    "#FAEEF1",
  beige:       "#F5EFE6",
  beigeOscuro: "#E8DDD0",
  cafe:        "#3D2B1F",
  cafeClaro:   "#6B4C3B",
  blanco:      "#FFFFFF",
  gris:        "#888888",
  dorado:      "#C9A96E",
};

// ── BOX ESTÉTICO ────────────────────────────────────────────────
const EST_BASE = [
  { titulo:"1 hora",                precio:10000, detalle:"Tarifa base · mínimo 1 hora" },
  { titulo:"2 horas consecutivas",  precio:18000, detalle:"Bloque continuo de 2 horas", popular:true },
  { titulo:"Jornada completa (5h)", precio:45000, detalle:"Sin compromiso · horario flexible" },
];
const EST_MENSUAL = [
  { titulo:"1 jornada/semana",  precio:170000, detalle:"Mismo horario reservado cada semana" },
  { titulo:"2 jornadas/semana", precio:330000, detalle:"Mismo horario reservado cada semana" },
  { titulo:"3 jornadas/semana", precio:480000, detalle:"Mismo horario reservado cada semana" },
];

// ── BOX DENTAL – PLAN FLEX (sin asistente) ───────────────────────
const FLEX_BASE = [
  { titulo:"Por hora",              precio:15000, detalle:"Mínimo 2 horas consecutivas" },
  { titulo:"Jornada suelta (5h)",   precio:45000, detalle:"Sin compromiso · sin asistente" },
];
const FLEX_MENSUAL = [
  { titulo:"1 jornada/sem · Mensual",    precio:170000, detalle:"Mismo horario cada semana" },
  { titulo:"1 jornada/sem · Semestral",  precio:160000, detalle:"6 meses · horario fijo" },
  { titulo:"1 jornada/sem · Anual ⭐",   precio:150000, detalle:"12 meses · mejor precio" },
  { titulo:"2 jornadas/sem · Mensual",   precio:340000, detalle:"Mismo horario cada semana" },
  { titulo:"2 jornadas/sem · Semestral", precio:320000, detalle:"6 meses · horario fijo" },
  { titulo:"2 jornadas/sem · Anual ⭐",  precio:300000, detalle:"12 meses · mejor precio" },
];

// ── BOX DENTAL – PLAN PRO (con asistente) ───────────────────────
const PRO_BASE = [
  { titulo:"Por hora Pro",          precio:18000, detalle:"Mínimo 2 horas · con asistente" },
  { titulo:"Jornada suelta Pro",    precio:65000, detalle:"Con asistente incluido" },
];
const PRO_MENSUAL = [
  { titulo:"1 jornada/sem · Mensual",    precio:250000, detalle:"Con asistente · horario fijo" },
  { titulo:"1 jornada/sem · Semestral",  precio:240000, detalle:"6 meses · con asistente" },
  { titulo:"1 jornada/sem · Anual ⭐",   precio:230000, detalle:"12 meses · con asistente" },
  { titulo:"2 jornadas/sem · Mensual",   precio:500000, detalle:"Con asistente · horario fijo" },
  { titulo:"2 jornadas/sem · Semestral", precio:480000, detalle:"6 meses · con asistente" },
  { titulo:"2 jornadas/sem · Anual ⭐",  precio:450000, detalle:"12 meses · con asistente" },
  { titulo:"Plan Exclusivo ⭐",          precio:1350000,detalle:"5 jornadas semanales fijas" },
];

const PLANES_MEDICO = [
  { titulo:"Hora suelta",            precio:12000,  detalle:"Mínimo 2 horas consecutivas", suelta:true },
  { titulo:"Jornada (5 horas)",      precio:55000,  detalle:"Sin compromiso",               suelta:true },
  { titulo:"1 jornada/semana",       precio:215000, detalle:"Plan mensual · horario fijo" },
  { titulo:"2 jornadas/semana",      precio:420000, detalle:"Plan mensual · horario fijo" },
  { titulo:"3 jornadas/semana",      precio:645000, detalle:"Plan mensual · horario fijo" },
  { titulo:"5 jornadas/semana ⭐",   precio:1050000,detalle:"Plan mensual · lunes a viernes" },
];

const fmt = n => n.toLocaleString("es-CL", { style:"currency", currency:"CLP", maximumFractionDigits:0 });

export default function Landing({ onLogin }) {
  const [modalLogin, setModalLogin] = useState(false);
  const [email, setEmail]           = useState("");
  const [pass, setPass]             = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [boxActivo, setBoxActivo]   = useState("estetico");
  const [dentalCat, setDentalCat]   = useState("flex");
  const [estOpen,   setEstOpen]     = useState(false);
  const [denOpen,   setDenOpen]     = useState(false);
  const [denFreq,   setDenFreq]     = useState(null); // "1j" | "2j" | null — qué frecuencia está expandida en el acordeón progresivo
  const [dispBoxes, setDispBoxes]         = useState([]);
  const [dispArriendos, setDispArriendos] = useState([]);
  const [dispBoxSel, setDispBoxSel]       = useState(null);
  const [dispSemana, setDispSemana]       = useState(0);

  useEffect(() => {
    sb.from("boxes").select("id,nombre,tipo").eq("activo",true).order("nombre")
      .then(({data})=>{ if(data){ setDispBoxes(data); setDispBoxSel(data[0]); }});
    sb.from("arriendos").select("box_id,fecha,hora_inicio,hora_fin,estado")
      .in("estado",["confirmado","pendiente"]).order("fecha")
      .then(({data})=>{ if(data) setDispArriendos(data); });
  }, []);

  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true); setError("");
    const { data } = await sb.from("usuarios")
      .select("*").eq("email", email.trim().toLowerCase())
      .eq("password_hash", pass).eq("activo", true).single();
    setLoading(false);
    if (data) { onLogin(data); setModalLogin(false); }
    else setError("Email o contraseña incorrectos");
  };

  return (
    <div style={{ fontFamily:"'Georgia',serif", background:C.beige, color:C.cafe, minHeight:"100vh" }}>

      {/* ── TOPBAR ── */}
      <div style={{ background:C.lila, color:C.blanco, padding:"8px 40px", display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, letterSpacing:".1em", flexWrap:"wrap", gap:10 }}>
        <span>+56 9 8628 4965 · San Ignacio 1263, Puerto Varas</span>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <a href="/barcelona-clinic.html" style={{ background:C.blanco, border:"none", color:C.lila, padding:"5px 16px", borderRadius:20, cursor:"pointer", fontSize:11, letterSpacing:".1em", fontWeight:700, textDecoration:"none" }}>
            ✨ SOY PACIENTE
          </a>
          <button onClick={()=>setModalLogin(true)} style={{ background:"none", border:`1px solid rgba(255,255,255,0.6)`, color:C.blanco, padding:"4px 16px", borderRadius:20, cursor:"pointer", fontSize:11, letterSpacing:".1em" }}>
            ACCESO EQUIPO
          </button>
        </div>
      </div>

      {/* ── NAVBAR ── */}
      <nav style={{ background:C.blanco, borderBottom:`1px solid ${C.beigeOscuro}`, padding:"14px 40px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100, boxShadow:"0 2px 12px rgba(155,142,196,0.08)" }}>
        <img src="/logo.png" alt="Cowork Salud" style={{ height:90, objectFit:"contain", display:"block" }}/>
        <div style={{ display:"flex", gap:28, fontSize:12, letterSpacing:".1em", textTransform:"uppercase" }}>
          {[["#como-funciona","Cómo funciona"],["#boxes","Boxes"],["#planes","Planes"],["#terminos","Términos"],["#disponibilidad","Disponibilidad"],["#contacto","Contacto"]].map(([href,label])=>(
            <a key={href} href={href} style={{ textDecoration:"none", color:C.cafeClaro, transition:"color .2s" }}>{label}</a>
          ))}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background:`linear-gradient(135deg, ${C.lilaPale} 0%, ${C.rosaPale} 50%, ${C.beige} 100%)`, padding:"90px 40px", textAlign:"center", position:"relative", overflow:"hidden" }}>
        {/* Círculos decorativos */}
        <div style={{ position:"absolute", top:-80, right:-80, width:300, height:300, borderRadius:"50%", background:`radial-gradient(circle, ${C.lilaClaro}33, transparent 70%)`, pointerEvents:"none" }}/>
        <div style={{ position:"absolute", bottom:-60, left:-60, width:250, height:250, borderRadius:"50%", background:`radial-gradient(circle, ${C.rosa}33, transparent 70%)`, pointerEvents:"none" }}/>
        <div style={{ position:"relative", maxWidth:680, margin:"0 auto" }}>
          <div style={{ fontSize:11, letterSpacing:".3em", color:C.lila, textTransform:"uppercase", marginBottom:16 }}>Espacio odontológico y estético compartido</div>
          <h1 style={{ fontSize:46, fontWeight:400, lineHeight:1.2, margin:"0 0 20px", color:C.cafe, fontStyle:"italic" }}>
            Llega solo con tu paciente<br/>y tu talento
          </h1>
          <p style={{ fontSize:15, color:C.cafeClaro, lineHeight:1.8, marginBottom:36, fontFamily:"system-ui" }}>
            Infraestructura lista · Documentación al día · Sin inversión inicial · Flexibilidad real
          </p>
          <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
            <a href="#planes" style={{ background:C.lila, color:C.blanco, padding:"13px 32px", textDecoration:"none", fontSize:12, fontWeight:600, letterSpacing:".12em", textTransform:"uppercase", borderRadius:30, boxShadow:"0 4px 16px rgba(155,142,196,0.4)" }}>
              VER PLANES Y PRECIOS
            </a>
            <a href="#contacto" style={{ border:`1px solid ${C.lila}`, color:C.lila, padding:"13px 32px", textDecoration:"none", fontSize:12, letterSpacing:".12em", textTransform:"uppercase", borderRadius:30 }}>
              CONSULTAR DISPONIBILIDAD
            </a>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background:C.lila, padding:"28px 40px" }}>
        <div style={{ maxWidth:800, margin:"0 auto", display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20, textAlign:"center" }}>
          {[["3","Boxes equipados"],["100%","Documentación al día"],["Flex","Horarios a tu medida"]].map(([n,t])=>(
            <div key={t}>
              <div style={{ fontSize:30, fontWeight:700, color:C.blanco }}>{n}</div>
              <div style={{ fontSize:11, letterSpacing:".15em", textTransform:"uppercase", color:C.lilaPale, marginTop:4 }}>{t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section id="como-funciona" style={{ padding:"80px 40px", background:C.blanco }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <div style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:C.lila, marginBottom:12 }}>Simple y sin complicaciones</div>
            <h2 style={{ fontSize:32, fontWeight:400, margin:0, color:C.cafe }}>¿Cómo funciona el arriendo?</h2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:32 }}>
            {[
              ["01","Elige tu plan","Selecciona el box y el bloque de horas o plan mensual que más te acomoda."],
              ["02","Transfiere","Realiza la transferencia y adjunta el comprobante en la plataforma."],
              ["03","Confirmación","La administración verifica el pago y confirma tu reserva."],
              ["04","¡A trabajar!","El box estará listo. Solo trae a tu paciente."],
            ].map(([n,t,d])=>(
              <div key={n} style={{ borderTop:`3px solid ${C.lilaClaro}`, paddingTop:20 }}>
                <div style={{ fontSize:36, fontWeight:700, color:C.lilaPale, lineHeight:1 }}>{n}</div>
                <div style={{ fontSize:15, fontWeight:600, margin:"10px 0 8px", color:C.cafe }}>{t}</div>
                <div style={{ fontSize:13, color:C.cafeClaro, lineHeight:1.7, fontFamily:"system-ui" }}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOXES ── */}
      <section id="boxes" style={{ padding:"80px 40px", background:C.lilaPale }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <div style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:C.lila, marginBottom:12 }}>Instalaciones</div>
            <h2 style={{ fontSize:32, fontWeight:400, margin:0, color:C.cafe }}>Nuestros boxes</h2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:24 }}>
            {[
              { icon:"✨", color:C.lila, bg:C.lilaPale, nombre:"Box 1 · Estético", desc:"Equipado para medicina estética, cosmetología y tratamientos faciales y corporales.", items:["Camilla profesional","Iluminación especializada","WiFi y climatización","Insumos básicos disponibles"] },
              { icon:"🦷", color:C.rosa, bg:C.rosaPale, nombre:"Box 2 · Dental", desc:"Unidad dental completa con todos los equipos necesarios, con o sin asistente.", items:["Sillón dental completo","Equipamiento diagnóstico","Opción con asistente","Esterilización disponible"] },
              { icon:"🏥", color:C.dorado, bg:C.beige, nombre:"Box 3 · Médico", desc:"Espacio clínico para médicos y profesionales de la salud. Ideal para consultas, procedimientos y atención ambulatoria.", items:["Camilla","Escritorio y lavamanos","EPP incluido","Esterilización de instrumental simple","Eliminación de residuos básicos y cortopunzantes"] },
            ].map(b=>(
              <div key={b.nombre} style={{ background:C.blanco, borderRadius:16, overflow:"hidden", boxShadow:"0 4px 24px rgba(155,142,196,0.12)" }}>
                <div style={{ background:`linear-gradient(135deg, ${b.color}, ${b.color}bb)`, padding:"36px 28px", textAlign:"center" }}>
                  <div style={{ fontSize:48 }}>{b.icon}</div>
                  <div style={{ fontSize:18, fontWeight:600, color:C.blanco, marginTop:10, letterSpacing:".05em" }}>{b.nombre}</div>
                </div>
                <div style={{ padding:"24px 28px" }}>
                  <p style={{ fontSize:13, lineHeight:1.8, color:C.cafeClaro, fontFamily:"system-ui", marginBottom:16 }}>{b.desc}</p>
                  <ul style={{ listStyle:"none", padding:0, margin:0 }}>
                    {b.items.map(item=>(
                      <li key={item} style={{ fontSize:12, color:C.cafe, padding:"5px 0", borderBottom:`1px solid ${C.beigeOscuro}`, fontFamily:"system-ui", display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ color:b.color, fontWeight:700 }}>—</span> {item}
                      </li>
                    ))}
                  </ul>
                  <a href="#planes" style={{ display:"block", marginTop:20, background:b.color, color:C.blanco, textAlign:"center", padding:"11px", textDecoration:"none", fontSize:11, letterSpacing:".12em", textTransform:"uppercase", borderRadius:8, fontWeight:600 }}>
                    VER PLANES
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section id="planes" style={{ padding:"80px 40px", background:C.blanco }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:C.lila, marginBottom:12 }}>Transparencia total</div>
            <h2 style={{ fontSize:32, fontWeight:400, margin:0, color:C.cafe }}>Planes y precios</h2>
            <p style={{ fontSize:13, color:C.gris, marginTop:10, fontFamily:"system-ui" }}>Todos los planes incluyen el espacio listo para trabajar.</p>
          </div>
          {/* Tab selector boxes */}
          <div style={{ display:"flex", gap:0, marginBottom:32, borderRadius:30, overflow:"hidden", border:`2px solid ${C.lila}`, width:"fit-content", margin:"0 auto 32px" }}>
            {[["estetico","✨ Estético"],["dental","🦷 Dental"],["medico","🏥 Médico"]].map(([k,l])=>(
              <button key={k} onClick={()=>setBoxActivo(k)} style={{ padding:"11px 24px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:boxActivo===k?C.lila:C.blanco, color:boxActivo===k?C.blanco:C.lila, letterSpacing:".05em", transition:"all .2s" }}>
                {l}
              </button>
            ))}
          </div>

          {/* ─── BOX ESTÉTICO ─── */}
          {boxActivo==="estetico" && (
            <div>
              {/* Precios base — tarjetas */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:16 }}>
                {EST_BASE.map((p,i)=>(
                  <div key={i} style={{ position:"relative", background:p.popular?C.lila:C.lilaPale, borderRadius:14, padding:"22px 18px", border:`2px solid ${p.popular?C.lila:C.lilaClaro}`, boxShadow:p.popular?"0 4px 18px rgba(155,142,196,0.3)":"none" }}>
                    {p.popular && <div style={{ position:"absolute", top:-10, right:12, background:C.dorado, color:C.blanco, fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:20, letterSpacing:".08em" }}>MÁS ELEGIDO</div>}
                    <div style={{ fontSize:24, fontWeight:700, color:p.popular?C.blanco:C.lila, marginBottom:4 }}>{fmt(p.precio)}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:p.popular?C.blanco:C.cafe, marginBottom:4 }}>{p.titulo}</div>
                    <div style={{ fontSize:11, color:p.popular?C.lilaPale:C.gris, fontFamily:"system-ui", lineHeight:1.5 }}>{p.detalle}</div>
                  </div>
                ))}
              </div>

              {/* Condiciones + Incluye */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:10, marginBottom:14 }}>
                <div style={{ padding:"11px 14px", background:C.beige, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8, borderLeft:`3px solid ${C.dorado}` }}>
                  <strong style={{ color:C.cafe }}>📋 Condiciones</strong><br/>
                  Mínimo 1 hora · Horario 09:00–19:00 · No se arriendan bloques de 30 o 45 min
                </div>
                <div style={{ padding:"11px 14px", background:C.lilaPale, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8, borderLeft:`3px solid ${C.lila}` }}>
                  <strong style={{ color:C.cafe }}>✅ Incluye</strong><br/>
                  Sabanilla desechable · <span style={{ color:C.cafeClaro }}>Carpule disponible (+{fmt(2000)} adicional)</span>
                </div>
              </div>

              {/* Tip conversión */}
              <div style={{ marginBottom:16, padding:"11px 14px", background:C.rosaPale, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8, borderLeft:`3px solid ${C.rosa}` }}>
                💡 Muchos profesionales prefieren reservar <strong>2 horas consecutivas o jornadas completas</strong> — permite una mejor organización de la agenda y resulta más conveniente.
              </div>

              {/* Acordeón: planes mensuales */}
              <button onClick={()=>setEstOpen(o=>!o)}
                style={{ width:"100%", padding:"13px 18px", background:estOpen?C.lila:C.blanco, color:estOpen?C.blanco:C.lila, border:`2px solid ${C.lila}`, borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:".05em", display:"flex", justifyContent:"space-between", alignItems:"center", transition:"all .2s" }}>
                <span>📅 Planes mensuales con horario fijo</span>
                <span style={{ fontSize:11 }}>{estOpen?"▲ Cerrar":"▼ Ver planes"}</span>
              </button>
              {estOpen && (
                <div style={{ marginTop:2, border:`1px solid ${C.lilaClaro}`, borderRadius:"0 0 10px 10px", overflow:"hidden" }}>
                  <div style={{ padding:"12px 16px", background:C.lilaPale, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.7, borderBottom:`1px solid ${C.lilaClaro}` }}>
                    ✔ Estos planes <strong>aseguran el mismo horario reservado cada semana</strong> — más conveniente que el arriendo por jornada suelta.
                  </div>
                  {EST_MENSUAL.map((p,i)=>(
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px", background:i%2===0?C.blanco:C.lilaPale, borderBottom:`1px solid ${C.lilaClaro}` }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600, color:C.cafe }}>{p.titulo}</div>
                        <div style={{ fontSize:12, color:C.gris, marginTop:2, fontFamily:"system-ui" }}>{p.detalle}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:19, fontWeight:700, color:C.lila }}>{fmt(p.precio)}</div>
                        <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── BOX DENTAL ─── */}
          {boxActivo==="dental" && (
            <div>
              {/* Subtabs */}
              <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", justifyContent:"center" }}>
                {[["flex","Plan Flex (sin asistente)"],["pro","Plan PRO (con asistente)"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{ setDentalCat(k); setDenOpen(false); setDenFreq(null); }}
                    style={{ padding:"8px 22px", borderRadius:20, border:`2px solid ${dentalCat===k?C.rosa:C.beigeOscuro}`, background:dentalCat===k?C.rosa:C.blanco, color:dentalCat===k?C.blanco:C.cafeClaro, fontSize:12, fontWeight:600, cursor:"pointer", transition:"all .2s" }}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Plan Flex */}
              {dentalCat==="flex" && (
                <div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
                    {FLEX_BASE.map((p,i)=>(
                      <div key={i} style={{ background:C.rosaPale, borderRadius:14, padding:"22px 18px", border:`2px solid ${C.rosa}44` }}>
                        <div style={{ fontSize:24, fontWeight:700, color:C.rosa, marginBottom:4 }}>{fmt(p.precio)}</div>
                        <div style={{ fontSize:13, fontWeight:600, color:C.cafe, marginBottom:4 }}>{p.titulo}</div>
                        <div style={{ fontSize:11, color:C.gris, fontFamily:"system-ui", lineHeight:1.5 }}>{p.detalle}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom:14, padding:"11px 14px", background:C.lilaPale, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8, borderLeft:`3px solid ${C.lila}` }}>
                    💡 Los <strong>planes mensuales aseguran el mismo horario</strong> reservado cada semana y son más convenientes que el arriendo por jornada suelta.
                  </div>
                  <button onClick={()=>{ setDenOpen(o=>!o); setDenFreq(null); }}
                    style={{ width:"100%", padding:"13px 18px", background:denOpen?C.rosa:C.blanco, color:denOpen?C.blanco:C.rosa, border:`2px solid ${C.rosa}`, borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:".05em", display:"flex", justifyContent:"space-between", alignItems:"center", transition:"all .2s" }}>
                    <span>📅 Planes Mensuales Plan Flex</span>
                    <span style={{ fontSize:11 }}>{denOpen?"▲ Cerrar":"▼ Ver planes"}</span>
                  </button>
                  {denOpen && (
                    <div style={{ marginTop:2, border:`1px solid ${C.rosa}44`, borderRadius:"0 0 10px 10px", overflow:"hidden", background:C.blanco }}>
                      {[
                        { freq:"1j", titulo:"1 jornada/semana", mensual:170000, semestral:160000, anual:150000 },
                        { freq:"2j", titulo:"2 jornadas/semana", mensual:340000, semestral:320000, anual:300000 },
                      ].map(f => (
                        <div key={f.freq}>
                          {/* Nivel 2: frecuencia (clickable) */}
                          <button
                            onClick={()=> setDenFreq(o => o===f.freq ? null : f.freq)}
                            style={{ width:"100%", padding:"14px 18px", background: denFreq===f.freq ? C.rosaPale : C.blanco, border:"none", borderBottom:`1px solid ${C.rosa}33`, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", transition:"all .2s", textAlign:"left", fontFamily:"inherit" }}
                          >
                            <div>
                              <div style={{ fontSize:14, fontWeight:700, color:C.cafe }}>{f.titulo}</div>
                              <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui", marginTop:2 }}>📅 Plan Mensual · renueva mes a mes</div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:18, fontWeight:700, color:C.rosa }}>{fmt(f.mensual)}</div>
                                <div style={{ fontSize:9, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                              </div>
                              <span style={{ fontSize:11, color:C.rosa }}>{denFreq===f.freq ? "▲" : "▼"}</span>
                            </div>
                          </button>
                          {/* Nivel 3: 6m + 12m (expandido) */}
                          {denFreq===f.freq && (
                            <div style={{ background:C.beige, borderBottom:`1px solid ${C.rosa}33` }}>
                              <div style={{ padding:"10px 18px 6px", fontSize:10, fontWeight:700, letterSpacing:".15em", textTransform:"uppercase", color:C.rosa }}>
                                💎 Compromiso largo · mejor precio
                              </div>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:`1px solid ${C.rosa}22` }}>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:C.cafe }}>📆 6 meses · Semestral</div>
                                  <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>Compromiso 6 meses · cobro mensual</div>
                                </div>
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:17, fontWeight:700, color:C.rosa }}>{fmt(f.semestral)}</div>
                                  <div style={{ fontSize:9, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                                </div>
                              </div>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:`1px solid ${C.rosa}22` }}>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:C.cafe }}>🗓️ 12 meses · Anual ⭐</div>
                                  <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>Compromiso 12 meses · mejor precio</div>
                                </div>
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:17, fontWeight:700, color:C.rosa }}>{fmt(f.anual)}</div>
                                  <div style={{ fontSize:9, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Plan PRO */}
              {dentalCat==="pro" && (
                <div>
                  <div style={{ marginBottom:14, padding:"11px 14px", background:C.lilaPale, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8, borderLeft:`3px solid ${C.lila}` }}>
                    ⭐ <strong>Plan PRO incluye:</strong> Kit de destartraje y profilaxis · Kit de operatoria · Kit de anestesia · Carga de esterilización
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
                    {PRO_BASE.map((p,i)=>(
                      <div key={i} style={{ background:C.lilaPale, borderRadius:14, padding:"22px 18px", border:`2px solid ${C.lila}44` }}>
                        <div style={{ fontSize:24, fontWeight:700, color:C.lila, marginBottom:4 }}>{fmt(p.precio)}</div>
                        <div style={{ fontSize:13, fontWeight:600, color:C.cafe, marginBottom:4 }}>{p.titulo}</div>
                        <div style={{ fontSize:11, color:C.gris, fontFamily:"system-ui", lineHeight:1.5 }}>{p.detalle}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom:14, padding:"11px 14px", background:C.rosaPale, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8, borderLeft:`3px solid ${C.rosa}` }}>
                    💡 Los <strong>planes mensuales aseguran el mismo horario</strong> reservado cada semana y son más convenientes que el arriendo por jornada suelta.
                  </div>
                  <button onClick={()=>{ setDenOpen(o=>!o); setDenFreq(null); }}
                    style={{ width:"100%", padding:"13px 18px", background:denOpen?C.lila:C.blanco, color:denOpen?C.blanco:C.lila, border:`2px solid ${C.lila}`, borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:700, letterSpacing:".05em", display:"flex", justifyContent:"space-between", alignItems:"center", transition:"all .2s" }}>
                    <span>📅 Planes Mensuales Plan PRO</span>
                    <span style={{ fontSize:11 }}>{denOpen?"▲ Cerrar":"▼ Ver planes"}</span>
                  </button>
                  {denOpen && (
                    <div style={{ marginTop:2, border:`1px solid ${C.lilaClaro}`, borderRadius:"0 0 10px 10px", overflow:"hidden", background:C.blanco }}>
                      {[
                        { freq:"1j", titulo:"1 jornada/semana", mensual:250000, semestral:240000, anual:230000 },
                        { freq:"2j", titulo:"2 jornadas/semana", mensual:500000, semestral:480000, anual:450000 },
                      ].map(f => (
                        <div key={f.freq}>
                          {/* Nivel 2: frecuencia (clickable) */}
                          <button
                            onClick={()=> setDenFreq(o => o===f.freq ? null : f.freq)}
                            style={{ width:"100%", padding:"14px 18px", background: denFreq===f.freq ? C.lilaPale : C.blanco, border:"none", borderBottom:`1px solid ${C.lilaClaro}`, display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", transition:"all .2s", textAlign:"left", fontFamily:"inherit" }}
                          >
                            <div>
                              <div style={{ fontSize:14, fontWeight:700, color:C.cafe }}>{f.titulo}</div>
                              <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui", marginTop:2 }}>📅 Plan Mensual · con asistente · renueva mes a mes</div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:18, fontWeight:700, color:C.lila }}>{fmt(f.mensual)}</div>
                                <div style={{ fontSize:9, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                              </div>
                              <span style={{ fontSize:11, color:C.lila }}>{denFreq===f.freq ? "▲" : "▼"}</span>
                            </div>
                          </button>
                          {/* Nivel 3: 6m + 12m (expandido) */}
                          {denFreq===f.freq && (
                            <div style={{ background:C.beige, borderBottom:`1px solid ${C.lilaClaro}` }}>
                              <div style={{ padding:"10px 18px 6px", fontSize:10, fontWeight:700, letterSpacing:".15em", textTransform:"uppercase", color:C.lila }}>
                                💎 Compromiso largo · mejor precio
                              </div>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:`1px solid ${C.lilaClaro}` }}>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:C.cafe }}>📆 6 meses · Semestral</div>
                                  <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>Compromiso 6 meses · con asistente</div>
                                </div>
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:17, fontWeight:700, color:C.lila }}>{fmt(f.semestral)}</div>
                                  <div style={{ fontSize:9, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                                </div>
                              </div>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:`1px solid ${C.lilaClaro}` }}>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:C.cafe }}>🗓️ 12 meses · Anual ⭐</div>
                                  <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>Compromiso 12 meses · mejor precio</div>
                                </div>
                                <div style={{ textAlign:"right" }}>
                                  <div style={{ fontSize:17, fontWeight:700, color:C.lila }}>{fmt(f.anual)}</div>
                                  <div style={{ fontSize:9, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Plan Exclusivo destacado al final */}
                      {PRO_MENSUAL.filter(p=>p.precio===1350000).map((p,i)=>(
                        <div key={`excl-${i}`} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 18px", background:C.lila, borderTop:`2px solid ${C.dorado}` }}>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:C.blanco }}>⭐ {p.titulo.replace(" ⭐","")}</div>
                            <div style={{ fontSize:12, color:C.lilaPale, marginTop:2, fontFamily:"system-ui" }}>{p.detalle}</div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:19, fontWeight:700, color:C.blanco }}>{fmt(p.precio)}</div>
                            <div style={{ fontSize:10, color:C.lilaPale, fontFamily:"system-ui" }}>/mes</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── BOX MÉDICO ─── */}
          {boxActivo==="medico" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:16, marginBottom:20 }}>
                {/* Columna sin compromiso */}
                <div style={{ background:C.beige, borderRadius:12, padding:"18px 20px", border:`1px solid ${C.beigeOscuro}` }}>
                  <div style={{ fontSize:11, letterSpacing:".2em", textTransform:"uppercase", color:C.dorado, fontWeight:700, marginBottom:12 }}>Sin compromiso</div>
                  {PLANES_MEDICO.filter(p=>p.suelta).map((p,i)=>(
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.beigeOscuro}` }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:C.cafe }}>{p.titulo}</div>
                        <div style={{ fontSize:11, color:C.gris, fontFamily:"system-ui" }}>{p.detalle}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:17, fontWeight:700, color:C.dorado }}>{fmt(p.precio)}</div>
                        <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>/ vez</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Columna planes mensuales */}
                <div style={{ background:C.lilaPale, borderRadius:12, padding:"18px 20px", border:`1px solid ${C.lilaClaro}` }}>
                  <div style={{ fontSize:11, letterSpacing:".2em", textTransform:"uppercase", color:C.lila, fontWeight:700, marginBottom:12 }}>Planes mensuales</div>
                  {PLANES_MEDICO.filter(p=>!p.suelta).map((p,i)=>{
                    const star=p.titulo.includes("⭐");
                    return (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.lilaClaro}` }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600, color:C.cafe }}>{p.titulo}</div>
                          <div style={{ fontSize:11, color:C.gris, fontFamily:"system-ui" }}>{p.detalle}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div style={{ fontSize:17, fontWeight:700, color:star?C.lila:C.lila }}>{fmt(p.precio)}</div>
                          <div style={{ fontSize:10, color:C.gris, fontFamily:"system-ui" }}>/mes</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Incluye + condiciones */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:12 }}>
                <div style={{ padding:"14px 18px", background:C.blanco, borderRadius:10, border:`1px solid ${C.beigeOscuro}`, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.9 }}>
                  <strong style={{ display:"block", marginBottom:6, color:C.cafe }}>✅ Incluye</strong>
                  Camilla · Escritorio · Lavamanos · EPP · Esterilización de instrumental simple · Eliminación de residuos básicos y cortopunzantes
                </div>
                <div style={{ padding:"14px 18px", background:C.blanco, borderRadius:10, border:`1px solid ${C.beigeOscuro}`, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.9 }}>
                  <strong style={{ display:"block", marginBottom:6, color:C.cafe }}>📋 Condiciones</strong>
                  Arriendo por hora: mínimo 2 horas consecutivas
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop:20, padding:"14px 18px", background:C.lilaPale, borderRadius:10, fontSize:12, color:C.cafeClaro, fontFamily:"system-ui", lineHeight:1.8 }}>
            💳 <strong>Forma de pago:</strong> Transferencia bancaria únicamente. Adjunta el comprobante en la plataforma para confirmar tu reserva.
          </div>
        </div>
      </section>

      {/* ── TÉRMINOS Y CONDICIONES ── */}
      <section id="terminos" style={{ padding:"80px 40px", background:C.lilaPale }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:52 }}>
            <div style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:C.lila, marginBottom:12 }}>Todo lo que necesitas saber</div>
            <h2 style={{ fontSize:32, fontWeight:400, margin:0, color:C.cafe }}>Términos y condiciones de arriendo</h2>
            <p style={{ fontSize:13, color:C.gris, marginTop:10, fontFamily:"system-ui" }}>Condiciones generales para el arriendo de boxes en Cowork Salud.</p>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(360px,1fr))", gap:16 }}>
            {[
              {
                icon:"💳", titulo:"Forma de pago", acento:C.lila,
                items:[
                  "El arriendo debe pagarse por adelantado para confirmar la reserva.",
                  "En caso de profesionales con varias jornadas mensuales, el pago puede realizarse a fin de mes, previo acuerdo."
                ]
              },
              {
                icon:"🕐", titulo:"Horario de funcionamiento", acento:C.rosa,
                items:[
                  "Las jornadas y reservas se realizan entre las 09:00 y 19:00 hrs.",
                  "Este horario debe respetarse estrictamente.",
                  "Las reservas son por hora completa.",
                  "NO se permiten reservas de 30 o 45 minutos."
                ]
              },
              {
                icon:"📋", titulo:"Política de cancelación", acento:C.dorado,
                items:[
                  "Las reservas pueden cancelarse con un mínimo de 48 horas hábiles de anticipación.",
                  "En ese caso, se devolverá el abono realizado.",
                  "Cancelaciones fuera de este plazo implican el cobro completo de la reserva."
                ]
              },
              {
                icon:"⏱", titulo:"Extensión de horario", acento:C.lila,
                items:[
                  "Se permite una tolerancia máxima de 15 minutos sobre la hora o jornada reservada.",
                  "Si se supera este tiempo, se cobrará una hora adicional o extensión de jornada, según corresponda."
                ]
              },
              {
                icon:"🏥", titulo:"Arriendo por hora", acento:C.rosa,
                items:[
                  "El valor por hora aplica hasta un máximo de 2 horas.",
                  "A partir de ese tiempo, el arriendo se considera como jornada completa."
                ]
              },
            ].map(t => (
              <div key={t.titulo} style={{ background:C.blanco, borderRadius:14, padding:"24px 26px", border:`1px solid ${C.beigeOscuro}`, borderTop:`4px solid ${t.acento}`, boxShadow:"0 2px 12px rgba(155,142,196,0.07)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                  <span style={{ fontSize:22 }}>{t.icon}</span>
                  <span style={{ fontSize:15, fontWeight:700, color:C.cafe, letterSpacing:".02em" }}>{t.titulo}</span>
                </div>
                <ul style={{ listStyle:"none", padding:0, margin:0 }}>
                  {t.items.map((item,i) => (
                    <li key={i} style={{ fontSize:13, color:C.cafeClaro, padding:"7px 0", borderBottom:i<t.items.length-1?`1px solid ${C.beigeOscuro}`:"none", fontFamily:"system-ui", lineHeight:1.7, display:"flex", gap:10, alignItems:"flex-start" }}>
                      <span style={{ color:t.acento, fontWeight:700, flexShrink:0, marginTop:1 }}>✔</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DISPONIBILIDAD PÚBLICA ── */}
      <section id="disponibilidad" style={{ padding:"80px 40px", background:C.blanco }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:C.lila, marginBottom:12 }}>Agenda en tiempo real</div>
            <h2 style={{ fontSize:32, fontWeight:400, margin:0, color:C.cafe }}>Disponibilidad de boxes</h2>
            <p style={{ fontSize:13, color:C.gris, marginTop:10, fontFamily:"system-ui" }}>Vista general — para reservar, accede con tu cuenta.</p>
          </div>
          <div style={{ display:"flex", gap:8, marginBottom:16, justifyContent:"center", flexWrap:"wrap" }}>
            {dispBoxes.map(b=>(
              <button key={b.id} onClick={()=>setDispBoxSel(b)}
                style={{ padding:"7px 18px", borderRadius:20, border:`1px solid ${dispBoxSel?.id===b.id?C.lila:C.beigeOscuro}`, background:dispBoxSel?.id===b.id?C.lila:C.blanco, color:dispBoxSel?.id===b.id?C.blanco:C.cafeClaro, cursor:"pointer", fontSize:13, fontWeight:600 }}>
                {b.nombre}
              </button>
            ))}
          </div>
          {(() => {
            const getLunesP = (off=0) => {
              const d=new Date(); const day=d.getDay();
              const diff=d.getDate()-day+(day===0?-6:1)+off*7;
              return new Date(new Date().setDate(diff));
            };
            const lunes = getLunesP(dispSemana);
            const dias = ["Lun","Mar","Mié","Jue","Vie","Sáb"].map((l,i)=>{
              const f=new Date(lunes); f.setDate(lunes.getDate()+i);
              return { label:l, fecha:f.toISOString().split("T")[0] };
            });
            const horas = ["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
            const ocupado = (fecha,hora) => dispArriendos.some(a=>a.box_id===dispBoxSel?.id&&a.fecha===fecha&&hora>=a.hora_inicio&&hora<a.hora_fin);
            const pasado  = (fecha,hora) => new Date(`${fecha}T${hora}:00`) < new Date();
            return (
              <div style={{ background:C.blanco, borderRadius:16, padding:20, boxShadow:"0 4px 24px rgba(155,142,196,0.1)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <button onClick={()=>setDispSemana(s=>s-1)} disabled={dispSemana===0}
                    style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${C.beigeOscuro}`, background:dispSemana===0?"#f5f5f5":C.blanco, cursor:dispSemana===0?"default":"pointer", fontSize:12, color:C.cafeClaro }}>
                    ← Anterior
                  </button>
                  <span style={{ fontSize:13, fontWeight:600, color:C.cafe }}>{dias[0].fecha.slice(5)} — {dias[5].fecha.slice(5)}</span>
                  <button onClick={()=>setDispSemana(s=>s+1)}
                    style={{ padding:"6px 14px", borderRadius:20, border:`1px solid ${C.beigeOscuro}`, background:C.blanco, cursor:"pointer", fontSize:12, color:C.cafeClaro }}>
                    Siguiente →
                  </button>
                </div>
                <div style={{ display:"flex", gap:12, fontSize:11, marginBottom:10 }}>
                  {[["#D4EDDA","#155724","Disponible"],["#F8D7DA","#721C24","Ocupado"]].map(([bg,c,l])=>(
                    <span key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ width:12, height:12, background:bg, border:`1px solid ${c}`, borderRadius:3, display:"inline-block" }}/>
                      <span style={{ color:C.gris, fontFamily:"system-ui" }}>{l}</span>
                    </span>
                  ))}
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11 }}>
                    <thead>
                      <tr>
                        <th style={{ padding:"5px 8px", textAlign:"left", color:C.gris, fontWeight:400, width:45 }}>Hora</th>
                        {dias.map(d=>(
                          <th key={d.fecha} style={{ padding:"5px 4px", textAlign:"center", fontWeight:400, color:C.cafeClaro, minWidth:70 }}>
                            {d.label}<br/><span style={{ fontSize:10 }}>{d.fecha.slice(5)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {horas.map(hora=>(
                        <tr key={hora}>
                          <td style={{ padding:"2px 8px", color:C.gris, fontSize:10 }}>{hora}</td>
                          {dias.map(d=>{
                            const ocp=ocupado(d.fecha,hora); const pas=pasado(d.fecha,hora);
                            let bg="#D4EDDA",color="#155724",label="✓";
                            if(pas){bg="#f5f5f5";color="#bbb";label="–";}
                            if(ocp){bg="#F8D7DA";color="#721C24";label="✗";}
                            return (
                              <td key={d.fecha} style={{ padding:"2px 3px", textAlign:"center" }}>
                                <div style={{ background:bg, color, borderRadius:4, padding:"3px 2px", fontSize:11, fontWeight:600 }}>{label}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ textAlign:"center", marginTop:20 }}>
                  <p style={{ fontSize:12, color:C.gris, fontFamily:"system-ui", marginBottom:12 }}>¿Quieres reservar? Accede con tu cuenta.</p>
                  <button onClick={()=>setModalLogin(true)}
                    style={{ background:C.lila, color:C.blanco, border:"none", padding:"12px 28px", cursor:"pointer", fontSize:12, fontWeight:700, letterSpacing:".1em", borderRadius:30, boxShadow:"0 4px 16px rgba(155,142,196,0.4)" }}>
                    INGRESAR A MI CUENTA
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── CONTACTO ── */}
      <section id="contacto" style={{ padding:"80px 40px", background:C.blanco }}>
        <div style={{ maxWidth:600, margin:"0 auto", textAlign:"center" }}>
          <div style={{ fontSize:10, letterSpacing:".3em", textTransform:"uppercase", color:C.lila, marginBottom:12 }}>¿Lista para empezar?</div>
          <h2 style={{ fontSize:32, fontWeight:400, margin:"0 0 14px", color:C.cafe }}>Consulta disponibilidad</h2>
          <p style={{ fontSize:13, color:C.cafeClaro, lineHeight:1.8, marginBottom:32, fontFamily:"system-ui" }}>
            Escríbenos por WhatsApp y te respondemos a la brevedad.
          </p>
          <a href="https://wa.me/56986284965?text=Hola! Me interesa arrendar un box en Cowork Salud. ¿Podrían darme más información?" target="_blank" rel="noreferrer"
            style={{ display:"inline-block", background:"#25D366", color:C.blanco, padding:"15px 36px", textDecoration:"none", fontSize:13, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", borderRadius:30, marginBottom:32, boxShadow:"0 4px 16px rgba(37,211,102,0.3)" }}>
            💬 ESCRIBIR POR WHATSAPP
          </a>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[["📍","Dirección","San Ignacio 1263, Puerto Varas"],["📞","Teléfono","+56 9 8628 4965"],["📱","Instagram","@barcelonaclinic.pv"],["🕐","Horario","Lun–Vie 9:00–19:00"]].map(([icon,t,v])=>(
              <div key={t} style={{ background:C.lilaPale, padding:"16px 18px", borderRadius:12, textAlign:"left" }}>
                <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
                <div style={{ fontSize:10, letterSpacing:".15em", textTransform:"uppercase", color:C.lila, marginBottom:4 }}>{t}</div>
                <div style={{ fontSize:13, color:C.cafe, fontFamily:"system-ui" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background:C.lila, color:C.blanco, padding:"32px 40px", textAlign:"center" }}>
        <img src="/logo.png" alt="Cowork Salud" style={{ height:55, objectFit:"contain", display:"block", margin:"0 auto 12px", filter:"brightness(0) invert(1)" }}/>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", marginBottom:12, fontFamily:"system-ui" }}>San Ignacio 1263, Puerto Varas · @barcelonaclinic.pv</div>
        <button onClick={()=>setModalLogin(true)} style={{ background:"none", border:"1px solid rgba(255,255,255,0.5)", color:C.blanco, padding:"7px 22px", cursor:"pointer", fontSize:11, letterSpacing:".1em", borderRadius:20 }}>
          ACCESO EQUIPO
        </button>
      </footer>

      {/* ── MODAL LOGIN ── */}
      {modalLogin && (
        <div style={{ position:"fixed", inset:0, background:"rgba(61,43,31,.5)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
          <div style={{ background:C.blanco, borderRadius:20, padding:"40px 36px", width:"min(400px,94vw)", position:"relative", boxShadow:"0 20px 60px rgba(155,142,196,0.3)" }}>
            <button onClick={()=>{setModalLogin(false);setError("");}} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", fontSize:22, cursor:"pointer", color:C.gris }}>×</button>
            <div style={{ textAlign:"center", marginBottom:28 }}>
              <img src="/logo.png" alt="Cowork Salud" style={{ height:70, objectFit:"contain", marginBottom:12 }}/>
              <div style={{ width:40, height:2, background:C.lilaClaro, margin:"0 auto 12px" }}/>
              <div style={{ fontSize:12, color:C.gris, fontFamily:"system-ui" }}>Acceso al sistema de gestión</div>
            </div>
            <form onSubmit={handleLogin}>
              <label style={{ display:"block", fontSize:10, letterSpacing:".15em", textTransform:"uppercase", color:C.cafe, marginBottom:6 }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                style={{ width:"100%", padding:"10px 12px", border:`1px solid ${C.beigeOscuro}`, borderRadius:10, fontSize:14, background:C.beige, color:C.cafe, boxSizing:"border-box", marginBottom:14, fontFamily:"system-ui" }}/>
              <label style={{ display:"block", fontSize:10, letterSpacing:".15em", textTransform:"uppercase", color:C.cafe, marginBottom:6 }}>Contraseña</label>
              <input type="password" value={pass} onChange={e=>setPass(e.target.value)} required
                style={{ width:"100%", padding:"10px 12px", border:`1px solid ${C.beigeOscuro}`, borderRadius:10, fontSize:14, background:C.beige, color:C.cafe, boxSizing:"border-box", marginBottom:18, fontFamily:"system-ui" }}/>
              {error && <div style={{ background:"#FCEBEB", color:"#A32D2D", padding:"8px 12px", borderRadius:8, fontSize:12, marginBottom:14, fontFamily:"system-ui" }}>{error}</div>}
              <button type="submit" disabled={loading}
                style={{ width:"100%", padding:"13px", background:C.lila, color:C.blanco, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, letterSpacing:".15em", textTransform:"uppercase", borderRadius:10, boxShadow:"0 4px 16px rgba(155,142,196,0.4)" }}>
                {loading?"Verificando…":"INGRESAR"}
              </button>
            </form>
            <div style={{ textAlign:"center", marginTop:14, fontSize:11, color:C.gris, fontFamily:"system-ui" }}>Acceso exclusivo · Equipo Cowork Salud</div>
          </div>
        </div>
      )}

      {/* Bot público movido a /barcelona-clinic.html (página de pacientes) */}
    </div>
  );
}