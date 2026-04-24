import TabPlanes from './TabPlanes';
import { SelectorPlan, PLANES } from './PlanesArriendo';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { sb } from './supabase';
import Login from './Login';
import { SubirComprobante, BadgeVerificado, VerComprobante, PanelVerificacion } from './Comprobante';
import Calendario from './Calendario';
import ModificarReserva from './ModificarReserva';
import ChatBot from './ChatBot';

// ─── CONSTANTES ───────────────────────────────────────────────────
const CATEGORIAS = ['Inyectables','Materiales descartables','Productos tópicos','Equipos/accesorios','Otros'];
const METODOS    = ['Efectivo','Tarjeta débito','Tarjeta crédito','Transferencia'];
const fmt = n => (n||0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0});
const today = () => new Date().toISOString().split('T')[0];
const stockSt = i => i.stock===0 ? 'critico' : i.stock<=i.stock_min ? 'bajo' : 'ok';

// Permisos por rol
const CAN = {
  config:      r => r==='admin',
  insumos:     r => r==='admin' || r==='recep',
  retiro:      r => true,
  arriendos:   r => r==='admin' || r==='recep' || r==='prof',
  solicitudes: r => r==='admin' || r==='recep',
  reportes:    r => r==='admin',
};

const TABS_DEF = [
  { key:'modificar', label:'Modificar reservas', perm: r => r==='admin' },
  { key:'dashboard',   label:'Dashboard' },
  { key:'solicitudes', label:'Solicitudes pacientes', perm: r => r==='admin'||r==='recep' },
  { key:'insumos',     label:'Inventario',     perm: r => r==='admin'||r==='recep' },
  { key:'retiro',      label:'Retirar insumo' },
  { key:'arriendos',   label:'Arriendos',      perm: r => r==='admin'||r==='recep'||r==='prof' },
  { key:'disponibilidad', label:'Disponibilidad' },
  { key:'planes', label:'Planes' },
  { key:'agenda',      label:'Agenda' },
  { key:'movimientos', label:'Movimientos' },
  { key:'verificacion', label:'Verificar pagos', perm: r => r==='admin'||r==='recep' },
  { key:'config',      label:'Configuración',  perm: r => r==='admin' },
];

// ─── ESTILOS ──────────────────────────────────────────────────────
const S = {
  input: { width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #ddd', background:'#fff', color:'#111', fontSize:14, boxSizing:'border-box' },
  label: { display:'block', fontSize:12, color:'#666', marginBottom:4, marginTop:10 },
  card:  a => ({ background:'#f8f8f8', borderRadius:12, padding:16, marginBottom:12, borderLeft: a?`3px solid ${a}`:'none' }),
  btn:   (v='primary', sm) => ({ padding:sm?'5px 14px':'9px 22px', borderRadius:8, border:'none', cursor:'pointer', fontSize:sm?12:14, fontWeight:500, background:v==='primary'?'#111':v==='danger'?'#E24B4A':v==='success'?'#1D9E75':'#e8e8e8', color:v==='secondary'?'#111':'#fff' }),
  badge: c => { const m={ok:['#EAF3DE','#3B6D11'],bajo:['#FAEEDA','#854F0B'],critico:['#FCEBEB','#A32D2D'],blue:['#E6F1FB','#0C447C'],purple:['#EEEDFE','#3C3489'],teal:['#E1F5EE','#085041'],gray:['#f0f0ec','#444']}; const [bg,col]=m[c]||m.gray; return {display:'inline-block',padding:'2px 9px',borderRadius:10,fontSize:11,fontWeight:500,background:bg,color:col}; },
  g2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  g3: { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 },
};

// ─── COMPONENTES UTILS ────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:14,padding:24,width:'min(520px,96vw)',maxHeight:'92vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:500}}>{title}</h3>
          <button style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#888'}} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ t }) {
  if (!t) return null;
  return <div style={{position:'fixed',top:16,right:16,zIndex:999,padding:'10px 18px',borderRadius:10,fontWeight:500,fontSize:13,background:t.tipo==='err'?'#E24B4A':'#1D9E75',color:'#fff',boxShadow:'0 2px 16px rgba(0,0,0,.18)',maxWidth:340}}>{t.msg}</div>;
}

function Spin() { return <div style={{textAlign:'center',padding:40,color:'#888',fontSize:14}}>Cargando…</div>; }

// ─── APP ──────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]   = useState(() => { try { return JSON.parse(sessionStorage.getItem('cli_user')); } catch { return null; } });
  const [tab,  setTab]    = useState('dashboard');
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(false);

  // ── DATA ──
  const [insumos, setInsumos]           = useState([]);
  const [movimientos, setMovimientos]   = useState([]);
  const [arriendos, setArriendos]       = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [boxes, setBoxes]               = useState([]);
  const [usuarios, setUsuarios]         = useState([]);
  const [solicitudes, setSolicitudes]   = useState([]);

  const showToast = (msg, tipo='ok') => { setToast({msg,tipo}); setTimeout(()=>setToast(null),3200); };

  // ── LOGIN / LOGOUT ──
  const handleLogin = u => { sessionStorage.setItem('cli_user', JSON.stringify(u)); setUser(u); };
  const handleLogout = () => { sessionStorage.removeItem('cli_user'); setUser(null); };

  // ── FETCH DATA ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [ins, mov, arr, prof, bx, usr, sol] = await Promise.all([
      sb.from('insumos').select('*').eq('activo',true).order('nombre'),
      sb.from('movimientos').select('*').order('created_at',{ascending:false}).limit(200),
      sb.from('arriendos').select('*').order('fecha',{ascending:false}).limit(200),
      sb.from('profesionales').select('*').eq('activo',true).order('nombre'),
      sb.from('boxes').select('*').order('nombre'),
      sb.from('usuarios').select('id,nombre,email,rol,activo').order('nombre'),
      sb.from('solicitudes_paciente').select('*').order('created_at',{ascending:false}).limit(200),
    ]);
    if (ins.data)  setInsumos(ins.data);
    if (mov.data)  setMovimientos(mov.data);
    if (arr.data)  setArriendos(arr.data);
    if (prof.data) setProfesionales(prof.data);
    if (bx.data)   setBoxes(bx.data);
    if (usr.data)  setUsuarios(usr.data);
    if (sol.data)  setSolicitudes(sol.data);
    setLoading(false);
  }, []);

  useEffect(() => { if (user) fetchAll(); }, [user, fetchAll]);

  // ── FILTRO MOVIMIENTOS POR ROL ──
  const movsVisibles = useMemo(() => {
    if (user?.rol === 'prof') return movimientos.filter(m => m.profesional_nombre === user.nombre);
    return movimientos;
  }, [movimientos, user]);

  const arriendosVisibles = useMemo(() => {
    if (user?.rol === 'prof') return arriendos.filter(a => a.profesional_nombre === user.nombre);
    return arriendos;
  }, [arriendos, user]);

  // ── RETIRO STATE ──
  const emptyRet = { insumoId:'', cantidad:1, profId:'', paciente:today(), obs:'', origen:'clinica', insumoPropio:'' };
  const [ret, setRet]       = useState(emptyRet);
  const [retStep, setRetStep] = useState(0);
  const [retMetodo, setRetMetodo] = useState('Efectivo');
  const insRet = insumos.find(i => i.id === ret.insumoId);

  const handleRetNext = () => {
    if (!ret.profId && user?.rol !== 'prof') return showToast('Selecciona la profesional','err');
    if (ret.origen==='clinica' && !ret.insumoId) return showToast('Selecciona un insumo','err');
    if (ret.origen==='profesional' && !ret.insumoPropio.trim()) return showToast('Describe el insumo','err');
    if (!ret.paciente.trim()) return showToast('Ingresa paciente o destino','err');
    if (+ret.cantidad < 1) return showToast('Cantidad inválida','err');
    if (ret.origen==='clinica' && +ret.cantidad > (insRet?.stock||0)) return showToast(`Stock insuficiente (disponible: ${insRet?.stock})`,'err');
    if (insRet?.pago_previo && ret.origen==='clinica') { setRetStep(1); return; }
    confirmarRetiro(false);
  };

  const [retNuevoId, setRetNuevoId] = useState(null);

  const confirmarRetiro = async (pagado) => {
    const profNombre = user?.rol==='prof' ? user.nombre : (profesionales.find(p=>p.id===ret.profId)?.nombre||'');
    const row = {
      tipo:'retiro', insumo_id: ret.origen==='clinica' ? ret.insumoId : null,
      insumo_nombre: insRet?.nombre || ret.insumoPropio,
      cantidad:+ret.cantidad, profesional_nombre:profNombre,
      paciente:ret.paciente, obs:ret.obs, origen_insumo:ret.origen,
      pago_requerido: insRet?.pago_previo && ret.origen==='clinica',
      pago_pagado: false,
      pago_monto:  insRet?.pago_previo && ret.origen==='clinica' ? insRet.precio * +ret.cantidad : 0,
      pago_metodo: retMetodo,
      verificado: insRet?.pago_previo && ret.origen==='clinica' ? 'sin_pago' : 'aprobado',
    };
    const { data } = await sb.from('movimientos').insert(row).select().single();
    if (ret.origen==='clinica' && insRet) {
      await sb.from('insumos').update({ stock: insRet.stock - +ret.cantidad }).eq('id', insRet.id);
    }
    await fetchAll();
    setRetNuevoId(data?.id || null);
    setRet(emptyRet);
    if (insRet?.pago_previo && ret.origen==='clinica') {
      setRetStep(3); // paso comprobante
    } else {
      setRetStep(2); showToast('Retiro registrado');
      setTimeout(()=>{ setRetStep(0); setTab('insumos'); }, 2000);
    }
  };

  // ── ARRIENDO STATE ──
  const emptyArr = { boxId:'', profId:'', fecha:today(), horaInicio:'09:00', horaFin:'10:00', metodo:'Efectivo' };
  const [arrForm, setArrForm]   = useState(emptyArr);
  const [arrStep, setArrStep]   = useState(0);
  const boxArr = boxes.find(b=>b.id===arrForm.boxId);
  const horasArr = useMemo(()=>{
    const [h1,m1]=arrForm.horaInicio.split(':').map(Number);
    const [h2,m2]=arrForm.horaFin.split(':').map(Number);
    const d=(h2*60+m2)-(h1*60+m1); return d>0?+(d/60).toFixed(1):0;
  },[arrForm.horaInicio,arrForm.horaFin]);
  const montoArr = boxArr ? boxArr.tarifa_hora * horasArr : 0;

  const handleArrNext = () => {
    if (!arrForm.boxId)  return showToast('Selecciona un box','err');
    if (!arrForm.profId) return showToast('Selecciona la profesional','err');
    if (horasArr<=0)     return showToast('Hora fin debe ser posterior','err');
    const conf = arriendos.find(a=>a.box_id===arrForm.boxId&&a.fecha===arrForm.fecha&&a.estado==='confirmado'&&!(arrForm.horaFin<=a.hora_inicio||arrForm.horaInicio>=a.hora_fin));
    if (conf) return showToast(`Box ocupado ${conf.hora_inicio}–${conf.hora_fin}`,'err');
    setArrStep(1);
  };

  const [arrNuevoId, setArrNuevoId] = useState(null); // para subir comprobante tras crear

  const confirmarArriendo = async () => {
    const prof = profesionales.find(p=>p.id===arrForm.profId);
    const box  = boxes.find(b=>b.id===arrForm.boxId);
    const { data } = await sb.from('arriendos').insert({
      fecha:arrForm.fecha, box_id:arrForm.boxId, box_nombre:box.nombre,
      profesional_id:arrForm.profId, profesional_nombre:prof.nombre,
      hora_inicio:arrForm.horaInicio, hora_fin:arrForm.horaFin,
      horas:horasArr, monto:montoArr, metodo:arrForm.metodo,
      pagado:false, estado:'pendiente', verificado:'sin_pago'
    }).select().single();
    await fetchAll();
    setArrNuevoId(data?.id || null);
    setArrForm(emptyArr); setArrStep(2);
  };

  // ── INSUMO FORM ──
  const emptyIns = { nombre:'', categoria:CATEGORIAS[0], stock:0, unidad:'unidad', stock_min:0, precio:0, pago_previo:false, origen:'clinica' };
  const [insForm, setInsForm] = useState(emptyIns);

  // ── INGRESO MODAL STATE ──
  const [ingSel, setIngSel]   = useState('');
  const [ingQty, setIngQty]   = useState(1);
  const [ingResp, setIngResp] = useState('');
  const [ingObs, setIngObs]   = useState('');

  // ── USUARIO FORM ──
  const emptyUsr = { nombre:'', email:'', password_hash:'', rol:'recep', activo:true };
  const [usrForm, setUsrForm] = useState(emptyUsr);

  // ── STATS ──
  const alertas = insumos.filter(i=>stockSt(i)!=='ok');
  const totalInv = insumos.filter(i=>i.origen==='clinica').reduce((s,i)=>s+i.stock*i.precio,0);
  const recArr   = arriendos.filter(a=>a.pagado).reduce((s,a)=>s+a.monto,0);
  const recIns   = movimientos.filter(m=>m.pago_pagado).reduce((s,m)=>s+(m.pago_monto||0),0);
  const pendVerif = [...arriendos, ...movimientos].filter(x => x.verificado === 'pendiente').length;
  const pendSolic = solicitudes.filter(s => s.estado === 'pendiente').length;
  const planes    = [];
  // ─── GUARD ───────────────────────────────────────────────────────
  if (!user) return <Login onLogin={handleLogin}/>;

  const tabs = TABS_DEF.filter(t=>!t.perm||t.perm(user.rol));
  const rolLabel = { admin:'Administradora', recep:'Recepcionista', prof:'Profesional' }[user.rol];

  return (
    <div style={{padding:'16px 20px',maxWidth:900,margin:'0 auto',fontFamily:'system-ui,sans-serif',color:'#111'}}>
      <Toast t={toast}/>

      {/* MODAL INSUMO */}
      {modal?.tipo==='insumo' && (
        <Modal title={modal.id?'Editar insumo':'Nuevo insumo'} onClose={()=>setModal(null)}>
          <label style={S.label}>Nombre *</label>
          <input style={S.input} value={insForm.nombre} onChange={e=>setInsForm(f=>({...f,nombre:e.target.value}))}/>
          <label style={S.label}>Categoría</label>
          <select style={S.input} value={insForm.categoria} onChange={e=>setInsForm(f=>({...f,categoria:e.target.value}))}>
            {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
          </select>
          <div style={S.g2}>
            <div><label style={S.label}>Unidad</label><input style={S.input} value={insForm.unidad} onChange={e=>setInsForm(f=>({...f,unidad:e.target.value}))}/></div>
            <div><label style={S.label}>Origen</label>
              <select style={S.input} value={insForm.origen} onChange={e=>setInsForm(f=>({...f,origen:e.target.value}))}>
                <option value="clinica">Clínica</option><option value="profesional">Profesional</option>
              </select>
            </div>
          </div>
          <div style={S.g2}>
            <div><label style={S.label}>Stock inicial</label><input type="number" min="0" style={S.input} value={insForm.stock} onChange={e=>setInsForm(f=>({...f,stock:+e.target.value}))}/></div>
            <div><label style={S.label}>Stock mínimo</label><input type="number" min="0" style={S.input} value={insForm.stock_min} onChange={e=>setInsForm(f=>({...f,stock_min:+e.target.value}))}/></div>
          </div>
          <label style={S.label}>Precio unitario (CLP)</label>
          <input type="number" min="0" style={S.input} value={insForm.precio} onChange={e=>setInsForm(f=>({...f,precio:+e.target.value}))}/>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,marginTop:12,cursor:'pointer'}}>
            <input type="checkbox" checked={insForm.pago_previo} onChange={e=>setInsForm(f=>({...f,pago_previo:e.target.checked}))}/>
            Requiere pago previo al retiro
          </label>
          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button style={S.btn('primary')} onClick={async()=>{
              if(!insForm.nombre.trim()) return showToast('Nombre requerido','err');
              if(modal.id) await sb.from('insumos').update({...insForm}).eq('id',modal.id);
              else await sb.from('insumos').insert({...insForm});
              await fetchAll(); showToast(modal.id?'Insumo actualizado':'Insumo agregado'); setModal(null);
            }}>Guardar</button>
            <button style={S.btn('secondary')} onClick={()=>setModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* MODAL INGRESO STOCK */}
      {modal?.tipo==='ingreso' && (
        <Modal title="Ingresar / reponer stock" onClose={()=>setModal(null)}>
          <label style={S.label}>Insumo *</label>
          <select style={S.input} value={ingSel} onChange={e=>setIngSel(e.target.value)}>
            <option value="">— Seleccionar —</option>
            {insumos.map(i=><option key={i.id} value={i.id}>{i.nombre} (stock: {i.stock})</option>)}
          </select>
          <div style={S.g2}>
            <div><label style={S.label}>Cantidad</label><input type="number" min="1" style={S.input} value={ingQty} onChange={e=>setIngQty(+e.target.value)}/></div>
            <div><label style={S.label}>Responsable</label><input style={S.input} value={ingResp} onChange={e=>setIngResp(e.target.value)}/></div>
          </div>
          <label style={S.label}>Observaciones (proveedor, lote…)</label>
          <input style={S.input} value={ingObs} onChange={e=>setIngObs(e.target.value)}/>
          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button style={S.btn('primary')} onClick={async()=>{
              if(!ingSel) return showToast('Selecciona un insumo','err');
              const ins2=insumos.find(i=>i.id===ingSel);
              await sb.from('insumos').update({stock:ins2.stock+ingQty}).eq('id',ingSel);
              await sb.from('movimientos').insert({tipo:'ingreso',insumo_id:ingSel,insumo_nombre:ins2.nombre,cantidad:ingQty,profesional_nombre:ingResp||'Administración',paciente:'-',origen_insumo:'clinica',obs:ingObs});
              await fetchAll();
              setIngSel('');setIngQty(1);setIngResp('');setIngObs('');
              showToast('Stock actualizado'); setModal(null);
            }}>Registrar ingreso</button>
            <button style={S.btn('secondary')} onClick={()=>setModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* MODAL USUARIO */}
      {modal?.tipo==='usuario' && (
        <Modal title={modal.id?'Editar usuario':'Nuevo usuario'} onClose={()=>setModal(null)}>
          <div style={S.g2}>
            <div><label style={S.label}>Nombre *</label><input style={S.input} value={usrForm.nombre} onChange={e=>setUsrForm(f=>({...f,nombre:e.target.value}))}/></div>
            <div><label style={S.label}>Email *</label><input type="email" style={S.input} value={usrForm.email} onChange={e=>setUsrForm(f=>({...f,email:e.target.value}))}/></div>
          </div>
          <div style={S.g2}>
            <div><label style={S.label}>{modal.id?'Nueva contraseña (dejar vacío para no cambiar)':'Contraseña *'}</label>
              <input type="password" style={S.input} value={usrForm.password_hash} onChange={e=>setUsrForm(f=>({...f,password_hash:e.target.value}))}/></div>
            <div><label style={S.label}>Rol</label>
              <select style={S.input} value={usrForm.rol} onChange={e=>setUsrForm(f=>({...f,rol:e.target.value}))}>
                <option value="admin">Administradora</option>
                <option value="recep">Recepcionista</option>
                <option value="prof">Profesional</option>
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:20}}>
            <button style={S.btn('primary')} onClick={async()=>{
              if(!usrForm.nombre.trim()||!usrForm.email.trim()) return showToast('Nombre y email requeridos','err');
              const emailNorm = usrForm.email.trim().toLowerCase();
              const passNorm  = (usrForm.password_hash||'').trim();
              if(modal.id){
                const upd = {nombre:usrForm.nombre.trim(), email:emailNorm, rol:usrForm.rol};
                if(passNorm) upd.password_hash = passNorm;
                await sb.from('usuarios').update(upd).eq('id',modal.id);
              } else {
                if(!passNorm) return showToast('Contraseña requerida','err');
                await sb.from('usuarios').insert({
                  ...usrForm,
                  nombre: usrForm.nombre.trim(),
                  email: emailNorm,
                  password_hash: passNorm,
                  activo: true,
                });
              }
              await fetchAll(); showToast(modal.id?'Usuario actualizado':'Usuario creado'); setModal(null);
            }}>Guardar</button>
            <button style={S.btn('secondary')} onClick={()=>setModal(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* HEADER */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <div>
          <h2 style={{margin:'0 0 2px',fontSize:20,fontWeight:500}}>Clínica Estética</h2>
          <p style={{margin:0,fontSize:13,color:'#888'}}>Bienvenida, <strong>{user.nombre}</strong> · {rolLabel}</p>
        </div>
        <button style={{...S.btn('secondary',true),fontSize:13}} onClick={handleLogout}>Cerrar sesión</button>
      </div>

      {alertas.length>0 && (
        <div style={{background:'#FAEEDA',border:'1px solid #FAC775',borderRadius:10,padding:'9px 14px',marginBottom:14,fontSize:13,color:'#633806'}}>
          ⚠ Stock bajo/agotado: {alertas.map((a,i)=><span key={a.id}>{i>0&&', '}<strong>{a.nombre}</strong></span>)}
        </div>
      )}

      {/* TABS */}
      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:20}}>
        {tabs.map(t=>{
          const badge = t.key==='solicitudes' && pendSolic>0 ? pendSolic : (t.key==='verificacion' && pendVerif>0 ? pendVerif : null);
          return (
            <button key={t.key} style={{padding:'6px 14px',borderRadius:20,border:'1px solid #ccc',background:tab===t.key?'#111':'transparent',color:tab===t.key?'#fff':'#666',cursor:'pointer',fontSize:13,fontWeight:tab===t.key?500:400,position:'relative',display:'inline-flex',alignItems:'center',gap:6}} onClick={()=>setTab(t.key)}>
              {t.label}
              {badge && <span style={{background:'#E24B4A',color:'#fff',borderRadius:10,padding:'1px 7px',fontSize:10,fontWeight:700}}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {loading && <Spin/>}
      {!loading && <>

      {/* ── DASHBOARD ── */}
       {tab==='dashboard' && (
        <div>
          {user.rol === 'prof' ? (
            // ── DASHBOARD PROFESIONAL ──
            <div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>
                Bienvenida, {user.nombre} 👋
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
                <div style={{background:'#fff',borderRadius:12,padding:16,border:'1px solid #eee',textAlign:'center'}}>
                  <div style={{fontSize:11,color:'#888',marginBottom:4}}>Mis arriendos</div>
                  <div style={{fontSize:22,fontWeight:700,color:'#185FA5'}}>{arriendosVisibles.length}</div>
                </div>
                <div style={{background:'#fff',borderRadius:12,padding:16,border:'1px solid #eee',textAlign:'center'}}>
                  <div style={{fontSize:11,color:'#888',marginBottom:4}}>Mis retiros</div>
                  <div style={{fontSize:22,fontWeight:700,color:'#533AB7'}}>{movsVisibles.filter(m=>m.tipo==='retiro').length}</div>
                </div>
              </div>
              <h3 style={{fontSize:13,fontWeight:600,marginBottom:10}}>Mis últimos arriendos</h3>
              {arriendosVisibles.slice(0,5).map(a=>(
                <div key={a.id} style={{background:'#fff',borderRadius:10,padding:'10px 14px',marginBottom:8,border:'1px solid #eee',borderLeft:'3px solid #1D9E75'}}>
                  <div style={{fontWeight:600,fontSize:13}}>{a.box_nombre}</div>
                  <div style={{fontSize:12,color:'#666'}}>{a.fecha} · {a.hora_inicio}–{a.hora_fin}</div>
                  <div style={{fontSize:11,marginTop:3}}>
                    <span style={{background:a.verificado==='aprobado'?'#EAF3DE':'#FAEEDA',color:a.verificado==='aprobado'?'#3B6D11':'#854F0B',padding:'1px 8px',borderRadius:6,fontWeight:600}}>
                      {a.verificado==='aprobado'?'✓ Confirmado':'⏳ Pendiente'}
                    </span>
                  </div>
                </div>
              ))}
              {arriendosVisibles.length===0 && <div style={{fontSize:13,color:'#888'}}>Sin arriendos registrados aún</div>}
            </div>
          ) : (
            // ── DASHBOARD ADMIN / RECEP ──
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:18}}>
                {[['💰','Ingresos mes',fmt(totalInv),'#185FA5'],['🏠','Arriendos',fmt(recArr),'#1D9E75'],['💊','Insumos cobrados',fmt(recIns),'#533AB7'],['📅','Planes activos',planes?.length||0,'#854F0B'],['🔔','Por verificar',pendVerif,pendVerif>0?'#A32D2D':'#0F6E56'],['📦','Alertas stock',alertas.length,alertas.length>0?'#A32D2D':'#0F6E56']].map(([icon,t,v,c])=>(
                  <div key={t} style={{background:'#fff',borderRadius:12,padding:'14px 16px',border:'1px solid #eee',textAlign:'center'}}>
                    <div style={{fontSize:18}}>{icon}</div>
                    <div style={{fontSize:10,color:'#888',margin:'4px 0'}}>{t}</div>
                    <div style={{fontSize:18,fontWeight:700,color:c}}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                <div>
                  <h3 style={{fontSize:13,fontWeight:600,marginBottom:10}}>Últimos arriendos</h3>
                  {arriendos.slice(0,4).map(a=>(
                    <div key={a.id} style={{background:'#fff',borderRadius:10,padding:'10px 14px',marginBottom:8,border:'1px solid #eee',borderLeft:'3px solid #1D9E75'}}>
                      <div style={{fontWeight:600,fontSize:13}}>{a.profesional_nombre}</div>
                      <div style={{fontSize:12,color:'#666'}}>{a.box_nombre} · {a.fecha}</div>
                      <div style={{fontSize:12,color:'#185FA5',fontWeight:600}}>{fmt(a.monto)}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 style={{fontSize:13,fontWeight:600,marginBottom:10}}>Últimos retiros</h3>
                  {movimientos.filter(m=>m.tipo==='retiro').slice(0,4).map(m=>(
                    <div key={m.id} style={{background:'#fff',borderRadius:10,padding:'10px 14px',marginBottom:8,border:'1px solid #eee',borderLeft:'3px solid #185FA5'}}>
                      <div style={{fontWeight:600,fontSize:13}}>{m.insumo_nombre}</div>
                      <div style={{fontSize:12,color:'#666'}}>{m.profesional_nombre}</div>
                      <div style={{fontSize:12,color:m.pago_pagado?'#1D9E75':'#854F0B',fontWeight:600}}>{m.pago_requerido?(m.pago_pagado?'✓ Pagado':'⚠ Pendiente'):'Sin cobro'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INVENTARIO ── */}
      {tab==='insumos' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
            <span style={{fontSize:13,color:'#666'}}>{insumos.length} insumos</span>
            <div style={{display:'flex',gap:8}}>
              {CAN.insumos(user.rol)&&<button style={S.btn('secondary',true)} onClick={()=>{setIngSel('');setIngQty(1);setIngResp('');setIngObs('');setModal({tipo:'ingreso'});}}>↑ Ingresar stock</button>}
              {CAN.config(user.rol)&&<button style={S.btn('primary',true)} onClick={()=>{setInsForm(emptyIns);setModal({tipo:'insumo'});}}>+ Nuevo</button>}
            </div>
          </div>
          {insumos.map(ins=>{
            const st=stockSt(ins);
            return (
              <div key={ins.id} style={S.card(st==='critico'?'#E24B4A':st==='bajo'?'#EF9F27':'#1D9E75')}>
                <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                  <div><div style={{fontWeight:500,fontSize:15}}>{ins.nombre}</div><div style={{fontSize:12,color:'#666',marginTop:2}}>{ins.categoria} · {ins.unidad}</div></div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                    <span style={S.badge(st)}>{st==='critico'?'Agotado':st==='bajo'?'Stock bajo':'OK'}</span>
                    <span style={S.badge(ins.origen==='clinica'?'blue':'purple')}>{ins.origen==='clinica'?'Clínica':'Profesional'}</span>
                    {ins.pago_previo&&<span style={S.badge('teal')}>Con cobro</span>}
                  </div>
                </div>
                <div style={{display:'flex',gap:20,marginTop:10,flexWrap:'wrap',fontSize:13}}>
                  <span>Stock: <strong>{ins.stock} {ins.unidad}(s)</strong></span>
                  <span>Mínimo: {ins.stock_min}</span>
                  {ins.precio>0&&<span>Precio: {fmt(ins.precio)}</span>}
                  {ins.precio>0&&<span>Valor total: {fmt(ins.stock*ins.precio)}</span>}
                </div>
                <div style={{marginTop:10,display:'flex',gap:8}}>
                  {CAN.config(user.rol)&&<button style={S.btn('secondary',true)} onClick={()=>{setInsForm({...ins});setModal({tipo:'insumo',id:ins.id});}}>Editar</button>}
                  <button style={S.btn('primary',true)} onClick={()=>{setRet(r=>({...r,insumoId:ins.id}));setTab('retiro');}}>Retirar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── RETIRO ── */}
      {tab==='retiro' && (
        <div>
          {retStep===3?(
            <div style={S.card()}>
              <div style={{textAlign:'center',marginBottom:20}}>
                <div style={{fontSize:40,marginBottom:8}}>🧾</div>
                <div style={{fontSize:16,fontWeight:500}}>Insumo reservado — adjunta tu comprobante</div>
                <div style={{fontSize:13,color:'#666',marginTop:4}}>El retiro queda <strong>pendiente</strong> hasta que la administradora apruebe el pago.</div>
              </div>
              {retNuevoId && (
                <SubirComprobante
                  tabla="movimientos"
                  registroId={retNuevoId}
                  onSubido={async()=>{ await fetchAll(); showToast('Comprobante enviado — esperando verificación'); setRetStep(0); setTab('insumos'); setRetNuevoId(null); }}
                />
              )}
              <button style={{...S.btn('secondary'),marginTop:12,fontSize:13}} onClick={()=>{ setRetStep(0); setTab('insumos'); setRetNuevoId(null); }}>
                Subir comprobante más tarde
              </button>
            </div>
          ):retStep===2?(
            <div style={{textAlign:'center',padding:48}}>
              <div style={{fontSize:48,marginBottom:12}}>✓</div>
              <div style={{fontSize:17,fontWeight:500,color:'#1D9E75'}}>Retiro registrado exitosamente</div>
            </div>
          ):retStep===1?(
            <div style={S.card()}>
              <h3 style={{margin:'0 0 14px',fontSize:15,fontWeight:500}}>Paso 2 — Confirmar pago</h3>
              <div style={{background:'#E6F1FB',border:'1px solid #B5D4F4',borderRadius:8,padding:12,marginBottom:16,fontSize:13,color:'#042C53'}}>
                Insumo: <strong>{insRet?.nombre}</strong><br/>
                Total: <strong>{fmt((insRet?.precio||0)*+ret.cantidad)}</strong> ({ret.cantidad} × {fmt(insRet?.precio)})
              </div>
              <div style={{background:'#E6F1FB',border:'1px solid #B5D4F4',borderRadius:8,padding:12,marginBottom:16,fontSize:13,color:'#042C53',display:'flex',gap:10,alignItems:'flex-start'}}>
  <span style={{fontSize:20}}>💳</span>
  <div>
    <strong>Pago solo por transferencia bancaria</strong>
    <div style={{marginTop:4,fontFamily:'system-ui'}}>Adjunta el comprobante de transferencia en el siguiente paso para validar el pago.</div>
  </div>
</div>
              <div style={{display:'flex',gap:10,marginTop:20,flexWrap:'wrap'}}>
                <button style={S.btn('success')} onClick={()=>confirmarRetiro(true)}>✓ Confirmar pago y entregar</button>
                <button style={{...S.btn('secondary'),background:'#FAEEDA',color:'#854F0B'}} onClick={()=>confirmarRetiro(false)}>Entregar con pago pendiente</button>
                <button style={S.btn('secondary')} onClick={()=>setRetStep(0)}>← Volver</button>
              </div>
            </div>
          ):(
            <div style={S.card()}>
              <h3 style={{margin:'0 0 4px',fontSize:15,fontWeight:500}}>Paso 1 — Solicitud de retiro</h3>
              <p style={{margin:'0 0 16px',fontSize:13,color:'#666'}}>El insumo no puede ser retirado sin completar este registro.</p>
              <label style={S.label}>Origen del insumo</label>
              <div style={{display:'flex',gap:10,marginBottom:6}}>
                {[['clinica','De la clínica'],['profesional','Propio de la profesional']].map(([v,l])=>(
                  <label key={v} style={{display:'flex',alignItems:'center',gap:6,fontSize:14,cursor:'pointer',padding:'8px 14px',borderRadius:8,border:`1px solid ${ret.origen===v?'#111':'#ccc'}`,flex:1}}>
                    <input type="radio" name="origen" value={v} checked={ret.origen===v} onChange={()=>setRet(r=>({...r,origen:v,insumoId:''}))} style={{margin:0}}/>{l}
                  </label>
                ))}
              </div>
              {user.rol!=='prof'&&(
                <>
                  <label style={S.label}>Profesional *</label>
                  <select style={S.input} value={ret.profId} onChange={e=>setRet(r=>({...r,profId:e.target.value}))}>
                    <option value="">— Seleccionar —</option>
                    {profesionales.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </>
              )}
              {ret.origen==='clinica'?(
                <>
                  <label style={S.label}>Insumo *</label>
                  <select style={S.input} value={ret.insumoId} onChange={e=>setRet(r=>({...r,insumoId:e.target.value}))}>
                    <option value="">— Seleccionar —</option>
                    {insumos.filter(i=>i.origen==='clinica').map(i=><option key={i.id} value={i.id}>{i.nombre} (stock: {i.stock}) {i.pago_previo?'· con cobro':''}</option>)}
                  </select>
                  {insRet&&(
                    <div style={{background:insRet.pago_previo?'#E6F1FB':'#EAF3DE',border:`1px solid ${insRet.pago_previo?'#B5D4F4':'#C0DD97'}`,borderRadius:8,padding:10,fontSize:13,marginTop:8}}>
                      {insRet.pago_previo?`💳 Requiere pago · ${fmt(insRet.precio)} / ${insRet.unidad}`:'✓ Sin cobro'}
                      {stockSt(insRet)!=='ok'&&<span style={{marginLeft:12,color:'#854F0B'}}>⚠ Stock bajo ({insRet.stock})</span>}
                    </div>
                  )}
                </>
              ):(
                <>
                  <label style={S.label}>Nombre del insumo propio *</label>
                  <input style={S.input} placeholder="Describe el insumo" value={ret.insumoPropio} onChange={e=>setRet(r=>({...r,insumoPropio:e.target.value}))}/>
                  <div style={{background:'#EAF3DE',border:'1px solid #C0DD97',borderRadius:8,padding:10,fontSize:13,marginTop:8,color:'#1738404'}}>✓ Solo registro — sin cobro</div>
                </>
              )}
              <div style={S.g2}>
                <div><label style={S.label}>Cantidad *</label><input type="number" min="1" style={S.input} value={ret.cantidad} onChange={e=>setRet(r=>({...r,cantidad:+e.target.value}))}/></div>
                <div><label style={S.label}>Fecha de uso *</label><input type="date" style={S.input} value={ret.paciente} onChange={e=>setRet(r=>({...r,paciente:e.target.value}))} defaultValue={today()}/></div>
              </div>
              <label style={S.label}>Observaciones</label>
              <input style={S.input} value={ret.obs} onChange={e=>setRet(r=>({...r,obs:e.target.value}))}/>
              <div style={{marginTop:20}}><button style={S.btn('primary')} onClick={handleRetNext}>Continuar →</button></div>
            </div>
          )}
        </div>
      )}

      {/* ── ARRIENDOS ── */}
      {tab==='arriendos' && (
        <div>
          {arrStep===2?(
            <div style={S.card()}>
              <div style={{textAlign:'center',marginBottom:20}}>
                <div style={{fontSize:40,marginBottom:8}}>🧾</div>
                <div style={{fontSize:16,fontWeight:500}}>Reserva creada — adjunta tu comprobante</div>
                <div style={{fontSize:13,color:'#666',marginTop:4}}>La reserva queda <strong>pendiente</strong> hasta que la administradora apruebe el pago.</div>
              </div>
              {arrNuevoId && (
                <SubirComprobante
                  tabla="arriendos"
                  registroId={arrNuevoId}
                  onSubido={async()=>{ await fetchAll(); showToast('Comprobante enviado — esperando verificación'); setArrStep(0); setTab('agenda'); setArrNuevoId(null); }}
                />
              )}
              <button style={{...S.btn('secondary'),marginTop:12,fontSize:13}} onClick={()=>{ setArrStep(0); setTab('agenda'); setArrNuevoId(null); }}>
                Subir comprobante más tarde
              </button>
            </div>
          ):arrStep===1?(
            <div style={S.card()}>
              <h3 style={{margin:'0 0 14px',fontSize:15,fontWeight:500}}>Paso 2 — Confirmar pago</h3>
              <div style={{background:'#E6F1FB',border:'1px solid #B5D4F4',borderRadius:8,padding:14,marginBottom:16,fontSize:13,color:'#042C53',lineHeight:1.8}}>
                <div><strong>{boxArr?.nombre}</strong> · {arrForm.fecha}</div>
                <div>{arrForm.horaInicio} → {arrForm.horaFin} ({horasArr} hr)</div>
                <div>Profesional: <strong>{profesionales.find(p=>p.id===arrForm.profId)?.nombre}</strong></div>
                <div style={{marginTop:6,fontSize:16}}>Total: <strong>{fmt(montoArr)}</strong></div>
                <div style={{fontSize:12,color:'#185FA5',marginTop:4}}>⚠ El horario se agenda solo al confirmar el pago</div>
              </div>
              <div style={{background:'#E6F1FB',border:'1px solid #B5D4F4',borderRadius:8,padding:12,marginBottom:16,fontSize:13,color:'#042C53',display:'flex',gap:10,alignItems:'flex-start'}}>
  <span style={{fontSize:20}}>💳</span>
  <div>
    <strong>Pago solo por transferencia bancaria</strong>
    <div style={{marginTop:4,fontFamily:'system-ui'}}>Una vez confirmada la reserva, adjunta el comprobante de transferencia en el siguiente paso para validar tu pago.</div>
  </div>
</div>
              <div style={{display:'flex',gap:10,marginTop:20}}>
                <button style={S.btn('success')} onClick={confirmarArriendo}>✓ Confirmar pago y agendar</button>
                <button style={S.btn('secondary')} onClick={()=>setArrStep(0)}>← Volver</button>
              </div>
            </div>
          ):(
            <div style={S.card()}>
             <h3 style={{margin:'0 0 4px',fontSize:15,fontWeight:500}}>Paso 1 — Selecciona box y plan</h3>
              <p style={{margin:'0 0 14px',fontSize:13,color:'#666'}}>El horario se agenda solo tras confirmar el pago.</p>

              {/* Selector de profesional */}
              <div style={{marginBottom:14}}>
                <label style={S.label}>Profesional *</label>
                <select style={S.input} value={arrForm.profId} onChange={e=>setArrForm(a=>({...a,profId:e.target.value}))}>
                  <option value="">— Seleccionar profesional —</option>
                 {profesionales.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              {/* Selector de tipo de box */}
              <div style={{marginBottom:16}}>
                <label style={S.label}>Tipo de box *</label>
                <div style={{display:'flex',gap:10}}>
                  {[['estetico','✨ Box Estético'],['dental','🦷 Box Dental']].map(([tipo,label])=>(
                    <div
                      key={tipo}
                      onClick={()=>setArrForm(a=>({...a,tipoBox:tipo,planSel:null}))}
                      style={{flex:1,padding:'12px',borderRadius:10,border:`2px solid ${arrForm.tipoBox===tipo?(tipo==='dental'?'#1D9E75':'#378ADD'):'#ddd'}`,background:arrForm.tipoBox===tipo?(tipo==='dental'?'#E1F5EE':'#E6F1FB'):'#fff',cursor:'pointer',textAlign:'center'}}
                    >
                      <div style={{fontSize:14,fontWeight:600}}>{label}</div>
                      <div style={{fontSize:11,color:'#888',marginTop:3}}>{tipo==='dental'?'Con/sin asistente':'Por hora o plan fijo'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Selector de plan — aparece al elegir el tipo de box */}
              {arrForm.tipoBox && (
                <SelectorPlan
                  tipoBox={arrForm.tipoBox}
                  onSeleccionar={(seleccion)=>{
                    setArrForm(a=>({
                      ...a,
                      planSel:      seleccion,
                      boxId:        boxes.find(b=>b.tipo===(arrForm.tipoBox==='dental'?'Dental':'Estético') && b.activo)?.id || '',
                      planId:       seleccion.plan.id,
                      planLabel:    seleccion.plan.label,
                      planMeses:    seleccion.plan.meses,
                      planAsistente:seleccion.plan.asistente,
                      diasJornada:  seleccion.dias,
                      horaInicio:   seleccion.horario.inicio,
                      horaFin:      seleccion.horario.fin,
                      fecha:        seleccion.fechaInicio || arrForm.fecha,
                      monto:        seleccion.monto,
                      esPlan:       seleccion.esPlan,
                    }));
                    setArrStep(1);
                  }}
                />
              )}
            </div>
          )}
          <h3 style={{fontSize:14,fontWeight:500,margin:'24px 0 10px'}}>Arriendos registrados</h3>
          {arriendosVisibles.length===0&&<div style={{fontSize:13,color:'#888'}}>Sin arriendos aún</div>}
          {arriendosVisibles.map(a=>(
            <div key={a.id} style={S.card('#1D9E75')}>
              <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6}}>
                <strong style={{fontSize:15}}>{a.box_nombre}</strong>
                <span style={S.badge(a.pagado?'teal':'bajo')}>{a.pagado?'✓ Pagado':'Pendiente'}</span>
              </div>
              <div style={{fontSize:13,marginTop:6}}>{a.profesional_nombre} · {a.fecha} · {a.hora_inicio}–{a.hora_fin} ({a.horas}h) · {fmt(a.monto)} · {a.metodo}</div>
            </div>
          ))}
        </div>
      )}
{tab==='disponibilidad' && (
        <div>
          <h3 style={{fontSize:15,fontWeight:600,marginBottom:4}}>Disponibilidad de boxes</h3>
          <p style={{fontSize:13,color:'#888',marginBottom:16}}>
            Haz clic en cualquier horario verde para reservar.
          </p>
          <Calendario
            user={user}
            boxes={boxes}
            arriendos={arriendos}
            profesionales={profesionales}
            onNuevoArriendo={async()=>{ await fetchAll(); setTab('arriendos'); }}
          />
        </div>
      )}
     {tab==='planes' && (
        <TabPlanes
          user={user}
          profesionales={profesionales}
          boxes={boxes}
          onReservar={(plan) => {
            // Al hacer clic en "Reservar jornada", va al tab disponibilidad
            // con el box del plan preseleccionado
            setTab('disponibilidad');
          }}
        />
      )}
      {/* ── AGENDA ── */}
      {tab==='agenda' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:500}}>Agenda de boxes</h3>
            {CAN.arriendos(user.rol)&&<button style={S.btn('primary',true)} onClick={()=>{setArrStep(0);setTab('arriendos');}}>+ Nuevo arriendo</button>}
          </div>
          {boxes.map(box=>{
            const res=arriendos.filter(a=>a.box_id===box.id&&a.estado==='confirmado').sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.hora_inicio.localeCompare(b.hora_inicio));
            return (
              <div key={box.id} style={S.card()}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><strong style={{fontSize:15}}>{box.nombre}</strong> <span style={{fontSize:13,color:'#666'}}>· {box.tipo} · {fmt(box.tarifa_hora)}/hr</span></div>
                  <span style={S.badge(box.activo?'ok':'critico')}>{box.activo?'Activo':'Inactivo'}</span>
                </div>
                {res.length===0?<div style={{fontSize:13,color:'#888',marginTop:10}}>Sin reservas</div>:(
                  <div style={{marginTop:10}}>
                    {res.map(r=>(
                      <div key={r.id} style={{display:'flex',justifyContent:'space-between',padding:'7px 10px',background:'#fff',borderRadius:8,marginBottom:6,fontSize:13,flexWrap:'wrap',gap:6}}>
                        <span><strong>{r.fecha}</strong> {r.hora_inicio}–{r.hora_fin}</span>
                        <span style={{color:'#666'}}>{r.profesional_nombre}</span>
                        <span style={S.badge('teal')}>✓ {fmt(r.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MOVIMIENTOS ── */}
      {tab==='movimientos' && (
        <div>
          <div style={{marginBottom:12,fontSize:13,color:'#666'}}>{movsVisibles.length} movimientos</div>
          {movsVisibles.map(m=>(
            <div key={m.id} style={S.card(m.tipo==='ingreso'?'#1D9E75':'#185FA5')}>
              <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6}}>
                <div>
                  <span style={{...S.badge(m.tipo==='ingreso'?'ok':'blue'),marginRight:8}}>{m.tipo==='ingreso'?'↑ Ingreso':'↓ Retiro'}</span>
                  <strong style={{fontSize:14}}>{m.insumo_nombre}</strong>
                  {m.origen_insumo==='profesional'&&<span style={{...S.badge('purple'),marginLeft:8}}>Propio</span>}
                </div>
                <span style={{fontSize:12,color:'#666'}}>{m.fecha}</span>
              </div>
              <div style={{display:'flex',gap:18,marginTop:8,flexWrap:'wrap',fontSize:13}}>
                <span>Cant: <strong>{m.cantidad}</strong></span>
                <span>Prof: <strong>{m.profesional_nombre}</strong></span>
                {m.paciente&&m.paciente!=='-'&&<span>Paciente: <strong>{m.paciente}</strong></span>}
                {m.pago_requerido&&<span style={{color:m.pago_pagado?'#0F6E56':'#993C1D'}}>{m.pago_pagado?'✓ Pagado':'⚠ Pendiente'} {fmt(m.pago_monto)} · {m.pago_metodo}</span>}
              </div>
              {m.obs&&<div style={{fontSize:12,color:'#666',marginTop:4}}>{m.obs}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── SOLICITUDES DE PACIENTES ── */}
      {tab==='solicitudes' && (
        <div>
          <h3 style={{fontSize:15,fontWeight:500,margin:'0 0 6px'}}>Solicitudes de pacientes</h3>
          <p style={{margin:'0 0 16px',color:'#666',fontSize:13}}>Pacientes que pidieron hora desde el chatbot. Contáctalos por WhatsApp para confirmar.</p>

          {/* Filtros por estado */}
          <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
            {['pendiente','contactado','agendado','descartado'].map(est => {
              const cnt = solicitudes.filter(s => s.estado===est).length;
              const colors = { pendiente:'#FAEEDA', contactado:'#E6F1FB', agendado:'#EAF3DE', descartado:'#f0f0ec' };
              return (
                <span key={est} style={{padding:'4px 10px',borderRadius:14,background:colors[est],fontSize:12,color:'#444',fontWeight:500}}>
                  {est}: <strong>{cnt}</strong>
                </span>
              );
            })}
          </div>

          {solicitudes.length === 0 && (
            <div style={{padding:30,textAlign:'center',background:'#fafafa',borderRadius:10,color:'#888',fontSize:13}}>
              No hay solicitudes registradas todavía.
            </div>
          )}

          {solicitudes.map(s => {
            const wsBody = encodeURIComponent(`Hola ${s.nombre}, te contactamos desde Cowork Salud (Barcelona Clinic) por tu solicitud de hora. ¿Podemos coordinar?`);
            const wsTel = (s.telefono || '').replace(/[^0-9]/g,'');
            const wsLink = wsTel ? `https://wa.me/${wsTel.startsWith('56')?wsTel:'56'+wsTel}?text=${wsBody}` : null;
            const estadoColors = { pendiente:['#FAEEDA','#854F0B'], contactado:['#E6F1FB','#0C447C'], agendado:['#EAF3DE','#3B6D11'], descartado:['#f0f0ec','#666'] };
            const [bgEst, colorEst] = estadoColors[s.estado] || estadoColors.pendiente;

            return (
              <div key={s.id} style={{background:'#fff',borderRadius:12,border:'1px solid #eee',padding:16,marginBottom:12,borderLeft:`4px solid ${colorEst}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginBottom:8,flexWrap:'wrap'}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:'#111'}}>#{s.id} · {s.nombre}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>📞 {s.telefono} {s.email && `· ✉ ${s.email}`} {s.rut && `· 🪪 ${s.rut}`}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>Recibido: {new Date(s.created_at).toLocaleString('es-CL')}</div>
                  </div>
                  <span style={{padding:'3px 10px',borderRadius:12,fontSize:11,fontWeight:600,background:bgEst,color:colorEst}}>
                    {s.estado}
                  </span>
                </div>

                <div style={{fontSize:13,color:'#333',marginBottom:6,lineHeight:1.5}}>
                  <strong>Motivo:</strong> {s.motivo_consulta}
                </div>
                {(s.especialidad_preferida || s.profesional_preferido) && (
                  <div style={{fontSize:12,color:'#666',marginBottom:4}}>
                    {s.especialidad_preferida && <>🩺 Especialidad: <strong>{s.especialidad_preferida}</strong> </>}
                    {s.profesional_preferido && <>· 👨‍⚕ Prefiere: <strong>{s.profesional_preferido}</strong></>}
                  </div>
                )}
                {s.fecha_preferida && (
                  <div style={{fontSize:12,color:'#666',marginBottom:4}}>
                    📅 Disponibilidad: <strong>{s.fecha_preferida}</strong>
                  </div>
                )}
                {s.notas_adicionales && (
                  <div style={{fontSize:12,color:'#666',marginBottom:4,fontStyle:'italic'}}>
                    💭 {s.notas_adicionales}
                  </div>
                )}
                {s.admin_obs && (
                  <div style={{fontSize:12,background:'#FFF9E6',padding:'6px 10px',borderRadius:6,marginTop:8,color:'#664500'}}>
                    📝 Obs admin: {s.admin_obs}
                  </div>
                )}

                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:12}}>
                  {wsLink && (
                    <a href={wsLink} target="_blank" rel="noreferrer" style={{...S.btn('success',true),textDecoration:'none',background:'#25D366'}}>
                      💬 WhatsApp
                    </a>
                  )}
                  {s.estado === 'pendiente' && (
                    <button style={S.btn('primary',true)} onClick={async()=>{
                      await sb.from('solicitudes_paciente').update({estado:'contactado', contactado_por:user.nombre, contactado_at:new Date().toISOString()}).eq('id',s.id);
                      await fetchAll(); showToast('Marcado como contactado');
                    }}>Marcar contactado</button>
                  )}
                  {(s.estado === 'pendiente' || s.estado === 'contactado') && (
                    <button style={S.btn('success',true)} onClick={async()=>{
                      await sb.from('solicitudes_paciente').update({estado:'agendado'}).eq('id',s.id);
                      await fetchAll(); showToast('Marcado como agendado');
                    }}>Marcar agendado</button>
                  )}
                  {s.estado !== 'descartado' && (
                    <button style={S.btn('danger',true)} onClick={async()=>{
                      const obs = prompt('Razón del descarte (opcional):') || '';
                      await sb.from('solicitudes_paciente').update({estado:'descartado', admin_obs: obs || s.admin_obs}).eq('id',s.id);
                      await fetchAll(); showToast('Descartada');
                    }}>Descartar</button>
                  )}
                  <button style={S.btn('secondary',true)} onClick={()=>{
                    const nuevaObs = prompt('Notas internas:', s.admin_obs || '');
                    if (nuevaObs !== null) {
                      sb.from('solicitudes_paciente').update({admin_obs: nuevaObs}).eq('id',s.id).then(fetchAll).then(()=>showToast('Notas guardadas'));
                    }
                  }}>📝 Notas</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── VERIFICACIÓN DE PAGOS ── */}
      {tab==='verificacion' && (
        <div>
          <h3 style={{fontSize:15,fontWeight:500,margin:'0 0 6px'}}>Verificación de comprobantes</h3>
          <p style={{margin:'0 0 20px',fontSize:13,color:'#666'}}>Revisa y aprueba los pagos enviados por las profesionales.</p>

          <h4 style={{fontSize:13,fontWeight:500,marginBottom:8,color:'#854F0B'}}>Arriendos pendientes</h4>
          <PanelVerificacion
            tabla="arriendos"
            items={arriendos.filter(a=>a.verificado==='pendiente')}
            onActualizar={fetchAll}
          />

          <h4 style={{fontSize:13,fontWeight:500,margin:'20px 0 8px',color:'#854F0B'}}>Insumos pendientes</h4>
          <PanelVerificacion
            tabla="movimientos"
            items={movimientos.filter(m=>m.tipo==='retiro'&&m.verificado==='pendiente')}
            onActualizar={fetchAll}
          />

          <h4 style={{fontSize:13,fontWeight:500,margin:'24px 0 8px'}}>Historial de verificaciones</h4>
          {[...arriendos.filter(a=>['aprobado','rechazado'].includes(a.verificado)),
             ...movimientos.filter(m=>m.tipo==='retiro'&&['aprobado','rechazado'].includes(m.verificado))]
            .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
            .slice(0,20)
            .map(item=>(
              <div key={item.id} style={{...S.card(),padding:12,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8,alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:500,fontSize:13}}>{item.box_nombre||item.insumo_nombre}</div>
                  <div style={{fontSize:12,color:'#666'}}>{item.profesional_nombre} · {item.fecha}</div>
                </div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  {item.comprobante_url&&<VerComprobante path={item.comprobante_url} nombre={item.comprobante_nombre}/>}
                  <BadgeVerificado estado={item.verificado}/>
                </div>
              </div>
            ))
          }
        </div>
      )}
{tab==='modificar' && (
  <ModificarReserva
    arriendos={arriendos}
    boxes={boxes}
    profesionales={profesionales}
    userRol={user.rol}
    onActualizar={fetchAll}
  />
)}
      {/* ── CONFIGURACIÓN (solo admin) ── */}
      {tab==='config' && user.rol==='admin' && (
        <div>
          {/* USUARIOS */}
          <div style={{marginBottom:28}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <h3 style={{margin:0,fontSize:14,fontWeight:500}}>Usuarios del sistema</h3>
              <button style={S.btn('primary',true)} onClick={()=>{setUsrForm(emptyUsr);setModal({tipo:'usuario'});}}>+ Agregar usuario</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:10}}>
              {usuarios.map(u=>(
                <div key={u.id} style={{...S.card(),padding:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{fontWeight:500,fontSize:14}}>{u.nombre}</div>
                      <div style={{fontSize:12,color:'#666'}}>{u.email}</div>
                    </div>
                    <span style={S.badge(u.rol==='admin'?'purple':u.rol==='recep'?'blue':'teal')}>{u.rol==='admin'?'Admin':u.rol==='recep'?'Recep':'Prof'}</span>
                  </div>
                  <div style={{marginTop:8,display:'flex',gap:6}}>
                    <button style={S.btn('secondary',true)} onClick={()=>{setUsrForm({...u,password_hash:''});setModal({tipo:'usuario',id:u.id});}}>Editar</button>
                    {u.id!==user.id&&<button style={{...S.btn('secondary',true),background:'#FCEBEB',color:'#A32D2D'}} onClick={async()=>{await sb.from('usuarios').update({activo:!u.activo}).eq('id',u.id);fetchAll();showToast(u.activo?'Usuario desactivado':'Usuario activado');}}>
                      {u.activo?'Desactivar':'Activar'}
                    </button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.g2}>
            {/* PROFESIONALES */}
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <h3 style={{margin:0,fontSize:14,fontWeight:500}}>Profesionales</h3>
                <button style={S.btn('primary',true)} onClick={async()=>{
                  const nombre=prompt('Nombre:');const esp=nombre?prompt('Especialidad:'):null;
                  if(nombre&&esp){await sb.from('profesionales').insert({nombre,especialidad:esp});await fetchAll();showToast('Profesional agregada');}
                }}>+ Agregar</button>
              </div>
              {profesionales.map(p=>(
                <div key={p.id} style={{...S.card(),padding:12}}>
                  <div style={{fontWeight:500,fontSize:14}}>{p.nombre}</div>
                  <div style={{fontSize:12,color:'#666'}}>{p.especialidad}</div>
                </div>
              ))}
            </div>
            {/* BOXES */}
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <h3 style={{margin:0,fontSize:14,fontWeight:500}}>Boxes</h3>
                <button style={S.btn('primary',true)} onClick={async()=>{
                  const nombre=prompt('Nombre del box:');const tarifa=nombre?prompt('Tarifa/hora (CLP):'):null;
                  if(nombre&&tarifa){await sb.from('boxes').insert({nombre,tipo:'Estético',tarifa_hora:+tarifa,activo:true});await fetchAll();showToast('Box agregado');}
                }}>+ Agregar</button>
              </div>
              {boxes.map(b=>(
                <div key={b.id} style={{...S.card(),padding:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div><div style={{fontWeight:500,fontSize:14}}>{b.nombre} · {b.tipo}</div><div style={{fontSize:12,color:'#666'}}>{fmt(b.tarifa_hora)}/hora</div></div>
                    <button style={{...S.btn('secondary',true),background:b.activo?'#FCEBEB':'#EAF3DE',color:b.activo?'#A32D2D':'#3B6D11'}} onClick={async()=>{await sb.from('boxes').update({activo:!b.activo}).eq('id',b.id);fetchAll();}}>
                      {b.activo?'Desactivar':'Activar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </>}

      {/* ── CHATBOT ── */}
      <ChatBot variante="interno" usuario={user} />
    </div>
  );
}
