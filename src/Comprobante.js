import { useState, useRef } from 'react';
import { sb } from './supabase';

const S = {
  zone: (drag) => ({
    border: `2px dashed ${drag ? '#111' : '#ccc'}`,
    borderRadius: 10, padding: '24px 16px', textAlign: 'center',
    background: drag ? '#f5f5f3' : '#fafafa', cursor: 'pointer',
    transition: 'all .2s', marginTop: 8,
  }),
  badge: (v) => {
    const m = {
      pendiente:  ['#FAEEDA','#854F0B','⏳ Pendiente verificación'],
      aprobado:   ['#EAF3DE','#3B6D11','✓ Pago aprobado'],
      rechazado:  ['#FCEBEB','#A32D2D','✗ Pago rechazado'],
      sin_pago:   ['#f0f0ec','#666',   '— Sin comprobante'],
    };
    const [bg,col,label] = m[v]||m.sin_pago;
    return { style:{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:10,fontSize:12,fontWeight:500,background:bg,color:col}, label };
  },
};

// ── SubirComprobante ───────────────────────────────────────────────
export function SubirComprobante({ tabla, registroId, onSubido }) {
  const [drag,    setDrag]    = useState(false);
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const ref = useRef();

  const MAX_MB = 5;

  const seleccionar = (f) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`El archivo supera los ${MAX_MB}MB`); return; }
    if (!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type)) {
      setErr('Solo se aceptan imágenes (JPG, PNG, WEBP) o PDF'); return;
    }
    setErr(''); setFile(f);
    if (f.type.startsWith('image/')) {
      const r = new FileReader(); r.onload = e => setPreview(e.target.result); r.readAsDataURL(f);
    } else { setPreview('pdf'); }
  };

  const subir = async () => {
    if (!file) return;
    setLoading(true);
    const ext  = file.name.split('.').pop();
    const path = `${tabla}/${registroId}_${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('comprobantes').upload(path, file);
    if (upErr) { setErr('Error al subir: ' + upErr.message); setLoading(false); return; }
    const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(path);
    // Si el bucket es privado, usar createSignedUrl en su lugar
    const url = urlData?.publicUrl || path;
    const { error: dbErr } = await sb.from(tabla).update({
      comprobante_url: path,   // guardamos el path, no la URL pública
      comprobante_nombre: file.name,
      verificado: 'pendiente',
      pagado: true,
      pago_pagado: true,
    }).eq('id', registroId);
    if (dbErr) { setErr('Error al guardar: ' + dbErr.message); setLoading(false); return; }
    setLoading(false);
    onSubido?.();
  };

  return (
    <div>
      <div
        style={S.zone(drag)}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); seleccionar(e.dataTransfer.files[0]); }}
      >
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{display:'none'}} onChange={e=>seleccionar(e.target.files[0])}/>
        {preview === 'pdf' ? (
          <div style={{fontSize:13}}>📄 <strong>{file.name}</strong></div>
        ) : preview ? (
          <img src={preview} alt="preview" style={{maxWidth:'100%',maxHeight:180,borderRadius:8,objectFit:'contain'}}/>
        ) : (
          <div>
            <div style={{fontSize:28,marginBottom:6}}>📎</div>
            <div style={{fontSize:13,color:'#666'}}>Arrastra aquí o haz clic para adjuntar</div>
            <div style={{fontSize:11,color:'#aaa',marginTop:4}}>JPG, PNG, PDF · máx. 5MB</div>
          </div>
        )}
      </div>
      {file && !preview?.startsWith('data') && preview !== 'pdf' && null}
      {file && (
        <div style={{marginTop:8,fontSize:13,color:'#666'}}>
          Archivo: <strong>{file.name}</strong> ({(file.size/1024/1024).toFixed(2)} MB)
        </div>
      )}
      {err && <div style={{marginTop:8,fontSize:13,color:'#A32D2D',background:'#FCEBEB',padding:'6px 10px',borderRadius:6}}>{err}</div>}
      {file && (
        <button
          disabled={loading}
          style={{marginTop:12,padding:'8px 20px',borderRadius:8,border:'none',background:'#111',color:'#fff',fontSize:14,fontWeight:500,cursor:loading?'not-allowed':'pointer',opacity:loading?.7:1}}
          onClick={subir}
        >{loading ? 'Subiendo…' : '✓ Confirmar pago con comprobante'}</button>
      )}
    </div>
  );
}

// ── BadgeVerificado ────────────────────────────────────────────────
export function BadgeVerificado({ estado }) {
  const { style, label } = S.badge(estado || 'sin_pago');
  return <span style={style}>{label}</span>;
}

// ── VerComprobante ─────────────────────────────────────────────────
export function VerComprobante({ path, nombre }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const abrir = async () => {
    setLoading(true);
    const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(path, 60);
    setLoading(false);
    if (data?.signedUrl) { setUrl(data.signedUrl); window.open(data.signedUrl, '_blank'); }
  };

  return (
    <button onClick={abrir} disabled={loading}
      style={{padding:'4px 12px',borderRadius:7,border:'1px solid #ccc',background:'#fff',fontSize:12,cursor:'pointer',color:'#185FA5'}}>
      {loading ? 'Cargando…' : `📎 Ver comprobante`}
    </button>
  );
}

// ── PanelVerificacion ──────────────────────────────────────────────
export function PanelVerificacion({ items, tabla, onActualizar }) {
  const [loading, setLoading] = useState(null);

  const accion = async (id, accion) => {
    setLoading(id + accion);
    await sb.from(tabla).update({
      verificado: accion,
      ...(accion === 'rechazado' ? { pagado: false, pago_pagado: false } : {}),
    }).eq('id', id);
    setLoading(null);
    onActualizar?.();
  };

  if (items.length === 0) return (
    <div style={{fontSize:13,color:'#888',padding:'12px 0'}}>Sin comprobantes pendientes de verificación ✓</div>
  );

  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={{background:'#f8f8f8',borderRadius:12,padding:14,marginBottom:10,borderLeft:'3px solid #EF9F27'}}>
          <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6,marginBottom:8}}>
            <div>
              <strong style={{fontSize:14}}>{item.box_nombre || item.insumo_nombre}</strong>
              <div style={{fontSize:12,color:'#666',marginTop:2}}>
                {item.profesional_nombre} · {item.fecha}
                {item.hora_inicio && ` · ${item.hora_inicio}–${item.hora_fin}`}
                {item.pago_monto && ` · ${(item.pago_monto||item.monto||0).toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0})}`}
                {item.monto && !item.pago_monto && ` · ${item.monto.toLocaleString('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0})}`}
              </div>
            </div>
            <BadgeVerificado estado={item.verificado}/>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            {item.comprobante_url && (
              <VerComprobante path={item.comprobante_url} nombre={item.comprobante_nombre}/>
            )}
            {item.verificado === 'pendiente' && (
              <>
                <button
                  disabled={!!loading}
                  style={{padding:'5px 14px',borderRadius:7,border:'none',background:'#1D9E75',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}}
                  onClick={() => accion(item.id, 'aprobado')}
                >{loading===item.id+'aprobado'?'…':'✓ Aprobar'}</button>
                <button
                  disabled={!!loading}
                  style={{padding:'5px 14px',borderRadius:7,border:'none',background:'#E24B4A',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}}
                  onClick={() => accion(item.id, 'rechazado')}
                >{loading===item.id+'rechazado'?'…':'✗ Rechazar'}</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
