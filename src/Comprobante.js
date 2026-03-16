import { useState, useRef } from 'react';
import { sb } from './supabase';

const S = {
  btn: (v='primary',sm) => ({ padding:sm?'5px 14px':'9px 22px', borderRadius:8, border:'none', cursor:'pointer', fontSize:sm?12:14, fontWeight:500, background:v==='primary'?'#111':v==='danger'?'#E24B4A':v==='success'?'#1D9E75':'#e8e8e8', color:v==='secondary'?'#111':'#fff' }),
};

// ── Subir comprobante ─────────────────────────────────────────
export function SubirComprobante({ tabla, registroId, onSubido }) {
  const [drag, setDrag]       = useState(false);
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const ref = useRef();

  const MAX_MB = 5;

  const seleccionar = f => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`El archivo supera los ${MAX_MB}MB`); return; }
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type)) {
      setErr('Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF'); return;
    }
    setErr(''); setFile(f);
    if (f.type.startsWith('image/')) {
      const r = new FileReader(); r.onload = e => setPreview(e.target.result); r.readAsDataURL(f);
    } else { setPreview(null); }
  };

  const subir = async () => {
    if (!file || !registroId) return;
    setLoading(true); setErr('');
    const ext  = file.name.split('.').pop();
    const path = `${tabla}/${registroId}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('comprobantes').upload(path, file, { upsert:true });
    if (upErr) { setErr('Error al subir: ' + upErr.message); setLoading(false); return; }
    await sb.from(tabla).update({ comprobante_url:path, comprobante_nombre:file.name, verificado:'pendiente' }).eq('id', registroId);
    setLoading(false);
    onSubido && onSubido();
  };

  return (
    <div>
      <div
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);seleccionar(e.dataTransfer.files[0]);}}
        onClick={()=>ref.current?.click()}
        style={{border:`2px dashed ${drag?'#111':'#ccc'}`,borderRadius:10,padding:'20px 12px',textAlign:'center',cursor:'pointer',background:drag?'#f8f8f8':'#fff',marginBottom:10}}
      >
        {preview
          ? <img src={preview} alt="preview" style={{maxHeight:140,maxWidth:'100%',borderRadius:6}}/>
          : <div>
              <div style={{fontSize:28,marginBottom:6}}>📎</div>
              <div style={{fontSize:13,color:'#555'}}>{file ? file.name : 'Arrastra o haz clic para adjuntar comprobante'}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:4}}>JPG, PNG, WEBP o PDF · máx {MAX_MB}MB</div>
            </div>
        }
        <input ref={ref} type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>seleccionar(e.target.files[0])}/>
      </div>
      {err && <div style={{color:'#A32D2D',fontSize:12,marginBottom:8}}>{err}</div>}
      {file && (
        <div style={{fontSize:12,color:'#666',marginBottom:8}}>
          Archivo: <strong>{file.name}</strong> ({(file.size/1024/1024).toFixed(2)} MB)
        </div>
      )}
      {file && (
        <button onClick={subir} disabled={loading} style={{...S.btn('success'),width:'100%'}}>
          {loading ? 'Subiendo…' : '✓ Confirmar pago con comprobante'}
        </button>
      )}
    </div>
  );
}

// ── Badge de verificación ─────────────────────────────────────
export function BadgeVerificado({ estado }) {
  const m = {
    sin_pago:  ['#f0f0f0','#666','Sin pago'],
    pendiente: ['#FAEEDA','#854F0B','⏳ Pendiente'],
    aprobado:  ['#EAF3DE','#3B6D11','✓ Aprobado'],
    rechazado: ['#FCEBEB','#A32D2D','✗ Rechazado'],
  };
  const [bg,col,label] = m[estado] || m.sin_pago;
  return <span style={{fontSize:11,padding:'2px 10px',borderRadius:10,fontWeight:600,background:bg,color:col}}>{label}</span>;
}

// ── Ver comprobante ───────────────────────────────────────────
export function VerComprobante({ path, nombre }) {
  if (!path) return null;
  const abrir = async () => {
    const { data } = await sb.storage.from('comprobantes').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };
  return (
    <button onClick={abrir} style={{...S.btn('secondary',true),fontSize:11}}>
      📎 {nombre || 'Ver comprobante'}
    </button>
  );
}

// ── Panel de verificación ─────────────────────────────────────
export function PanelVerificacion({ tabla, items, onActualizar }) {
  const [procesando, setProcesando] = useState(null);

  const accion = async (item, nuevoEstado) => {
    setProcesando(item.id);
    const updates = { verificado: nuevoEstado };
    if (nuevoEstado === 'aprobado') {
      updates.pagado  = true;
      updates.estado  = 'confirmado';
    }
    if (nuevoEstado === 'rechazado') {
      updates.pagado = false;
      updates.estado = 'pendiente';
    }
    await sb.from(tabla).update(updates).eq('id', item.id);
    setProcesando(null);
    onActualizar && onActualizar();
  };

  if (!items?.length) {
    return <div style={{fontSize:13,color:'#888',padding:'8px 0'}}>Sin comprobantes pendientes.</div>;
  }

  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={{background:'#fff',borderRadius:10,border:'1px solid #eee',padding:'12px 16px',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{fontWeight:600,fontSize:14}}>{item.box_nombre || item.insumo_nombre}</div>
            <div style={{fontSize:12,color:'#666',marginTop:2}}>
              {item.profesional_nombre} · {item.fecha}
              {item.hora_inicio && ` · ${item.hora_inicio}–${item.hora_fin}`}
            </div>
            {item.monto>0 && (
              <div style={{fontSize:12,color:'#185FA5',fontWeight:600,marginTop:2}}>
                ${(item.monto||0).toLocaleString('es-CL')}
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            {item.comprobante_url && (
              <VerComprobante path={item.comprobante_url} nombre={item.comprobante_nombre}/>
            )}
            <button
              onClick={()=>accion(item,'aprobado')}
              disabled={procesando===item.id}
              style={S.btn('success',true)}>
              {procesando===item.id ? '…' : '✓ Aprobar'}
            </button>
            <button
              onClick={()=>accion(item,'rechazado')}
              disabled={procesando===item.id}
              style={S.btn('danger',true)}>
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}