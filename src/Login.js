import { useState } from 'react';
import { sb } from './supabase';

const S = {
  wrap: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5f3', fontFamily:'system-ui,sans-serif' },
  card: { background:'#fff', borderRadius:16, padding:'36px 32px', width:'min(380px,94vw)', boxShadow:'0 2px 24px rgba(0,0,0,.09)' },
  label: { display:'block', fontSize:12, color:'#666', marginBottom:4, marginTop:14 },
  input: { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #ddd', fontSize:14, boxSizing:'border-box', color:'#111', background:'#fafafa' },
  btn: { width:'100%', marginTop:22, padding:'10px', borderRadius:8, border:'none', background:'#111', color:'#fff', fontSize:15, fontWeight:500, cursor:'pointer' },
  err: { marginTop:12, padding:'9px 12px', borderRadius:8, background:'#FCEBEB', color:'#A32D2D', fontSize:13 },
};

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('');
  const [pass,  setPass]        = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { data, error: err } = await sb
      .from('usuarios')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('password_hash', pass)
      .eq('activo', true)
      .single();
    setLoading(false);
    if (err || !data) { setError('Email o contraseña incorrectos'); return; }
    onLogin(data);
  };

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:32, marginBottom:6 }}>💊</div>
          <h2 style={{ margin:0, fontSize:20, fontWeight:500 }}>Clínica Estética</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#888' }}>Sistema de gestión</p>
        </div>
        <form onSubmit={handleLogin}>
          <label style={S.label}>Email</label>
          <input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.cl" required autoFocus/>
          <label style={S.label}>Contraseña</label>
          <input style={S.input} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" required/>
          {error && <div style={S.err}>{error}</div>}
          <button style={S.btn} type="submit" disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  );
}
