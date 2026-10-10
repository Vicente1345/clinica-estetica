// api/diag-seguridad.js — Diagnóstico de configuración (solo admin).
// Confirma que la SUPABASE_SERVICE_ROLE_KEY de Vercel es realmente una
// service_role válida ANTES de ejecutar el SQL que blinda las tablas:
// si la key está mala, cerrar RLS dejaría la plataforma caída.
// No devuelve ningún secreto, solo estados.
//
// GET + Authorization: Bearer <token admin> → { ok, checks: {...} }

const { createClient } = require('@supabase/supabase-js');
const { requiereRol } = require('./_lib/seguridad');

// Claim `role` del JWT sin verificar firma (solo para diagnóstico)
function rolDeKey(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || '(sin claim role)';
  } catch { return '(no parsea como JWT)'; }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });
  const auth = requiereRol(req, ['admin']);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const url = (process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  const checks = {
    supabase_url: !!url,
    session_secret: !!process.env.SESSION_SECRET,
    allowed_origins: !!process.env.ALLOWED_ORIGINS,
    resend_api_key: !!process.env.RESEND_API_KEY,
    recordatorio_secret: !!process.env.RECORDATORIO_SECRET,
    service_key_presente: !!service,
    service_key_rol: service ? (service.startsWith('sb_secret_') ? 'service_role (formato sb_secret)' : rolDeKey(service)) : null,
    service_key_consulta: null,                            // debe decir 'ok'
  };

  // Prueba REAL con un cliente fresco (sin el caché de getSbAdmin): si esta
  // consulta pasa Y el rol del claim es service_role, la key sirve para RLS.
  if (url && service) {
    try {
      const sbTest = createClient(url, service, { auth: { persistSession: false } });
      const { error } = await sbTest.from('usuarios').select('id', { count: 'exact', head: true });
      checks.service_key_consulta = error ? `error: ${error.message}` : 'ok';
    } catch (e) {
      checks.service_key_consulta = `excepción: ${e.message}`;
    }
  }

  const rolOk = checks.service_key_rol === 'service_role' || checks.service_key_rol === 'service_role (formato sb_secret)';
  const listaParaRLS = checks.supabase_url && checks.session_secret &&
    checks.service_key_presente && rolOk &&
    checks.service_key_consulta === 'ok';

  return res.status(200).json({ ok: true, checks, lista_para_rls: listaParaRLS });
};
