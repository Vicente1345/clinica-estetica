// api/datos.js — Lecturas de la app logueada SOLO desde el servidor.
// Reemplaza los select directos del navegador a Supabase (fetchAll y afines)
// para poder blindar las tablas con RLS. El filtrado por rol ocurre AQUÍ:
// el navegador de una profesional nunca recibe datos de terceros
// (nombres, montos, movimientos o citas de pacientes).
//
// GET + Authorization: Bearer <token de /api/login>
//   → { ok, insumos, movimientos, arriendos, misArriendos, profesionales,
//       boxes, solicitudes, planes, miProfId }
// GET ?resumen=1&desde=YYYY-MM-DD&hasta=YYYY-MM-DD (solo admin)
//   → { ok, arriendos } columnas agregables para el Resumen Ejecutivo

const { createClient } = require('@supabase/supabase-js');
const { getSbAdmin, requiereRol } = require('./_lib/seguridad');

// PostgREST entrega como máximo 1000 filas por consulta: se lee por páginas
// con un orden estable (fecha + id) para no perder ni duplicar filas
async function todasLasPaginas(consulta) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta().range(i, i + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000 || out.length >= 20000) break;
  }
  return out;
}

// ── Diagnóstico de configuración (GET /api/datos?diag=1, solo admin) ──
// Vive aquí y no en su propio archivo por el límite de 12 funciones
// serverless del plan Hobby de Vercel. No devuelve secretos, solo estados.
function rolDeKey(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || '(sin claim role)';
  } catch { return '(no parsea como JWT)'; }
}

async function diagnostico(res) {
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
    service_key_consulta: null, // debe decir 'ok'
  };
  // Prueba REAL con un cliente fresco (sin el caché de getSbAdmin)
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
    checks.service_key_presente && rolOk && checks.service_key_consulta === 'ok';
  return res.status(200).json({ ok: true, checks, lista_para_rls: listaParaRLS });
}

// Mismo vínculo usuarios.nombre ↔ profesionales.nombre que usa el frontend
const normalizeNombre = n => (n || '').toLowerCase().replace(/^(dr\.?|dra\.?)\s+/i, '').trim();

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const auth = requiereRol(req, ['admin', 'recep', 'prof']);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const { usuario } = auth;

  const sb = await getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  try {
    // ── Modo diagnóstico de seguridad (solo admin) ──
    if (req.query && req.query.diag) {
      if (usuario.rol !== 'admin') return res.status(403).json({ ok: false, error: 'Solo administración' });
      return await diagnostico(res);
    }

    // ── Modo resumen ejecutivo (solo admin) ──
    if (req.query && req.query.resumen) {
      if (usuario.rol !== 'admin') return res.status(403).json({ ok: false, error: 'Solo administración' });
      const desde = String(req.query.desde || ''), hasta = String(req.query.hasta || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) {
        return res.status(400).json({ ok: false, error: 'Rango de fechas inválido' });
      }
      const { data, error } = await sb.from('arriendos')
        .select('id,box_id,box_nombre,fecha,horas,estado,monto,verificado')
        .gte('fecha', desde).lte('fecha', hasta).order('fecha');
      if (error) throw error;
      return res.status(200).json({ ok: true, arriendos: data || [] });
    }

    const esProf = usuario.rol === 'prof';
    const esRecep = usuario.rol === 'recep';
    const esAdmin = usuario.rol === 'admin';

    // Ventana de arriendos: desde 6 meses atrás y TODO lo futuro (los planes
    // anuales crean cientos de jornadas futuras; con un "limit 200" por fecha
    // descendente la semana en curso quedaba fuera de Agenda y listados)
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const d0 = new Date(hoy + 'T12:00:00'); d0.setDate(d0.getDate() - 180);
    const desdeArr = d0.toISOString().slice(0, 10);

    // Citas de pacientes por rol: la profesional nunca recibe datos del
    // paciente; recepción solo lo necesario para la Agenda (sin teléfono,
    // correo ni RUT: ya no gestiona solicitudes de pacientes)
    const colsCitas = esProf
      ? 'id,box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado,created_at'
      : esRecep
        ? 'id,box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado,created_at,nombre,tratamiento,motivo_consulta'
        : '*';

    const [ins, mov, arr, prof, bx, sol, pl] = await Promise.all([
      sb.from('insumos').select('*').eq('activo', true).order('nombre'),
      // Movimientos: la profesional solo recibe los suyos (antes el filtro era client-side)
      esProf
        ? sb.from('movimientos').select('*').eq('profesional_nombre', usuario.nombre).order('created_at', { ascending: false }).limit(200)
        : sb.from('movimientos').select('*').order('created_at', { ascending: false }).limit(200),
      // Arriendos: la profesional solo recibe columnas de ocupación (sin nombres/montos)
      todasLasPaginas(() => sb.from('arriendos')
        .select(esProf ? 'id,box_id,box_nombre,fecha,hora_inicio,hora_fin,horas,estado' : '*')
        .gte('fecha', desdeArr)
        .order('fecha', { ascending: false }).order('id'))
        .then(data => ({ data }), error => ({ error })),
      sb.from('profesionales').select(esProf ? 'id,nombre,activo' : '*').order('nombre'),
      sb.from('boxes').select('*').order('nombre'),
      // Citas de pacientes: la profesional nunca recibe PII de pacientes
      sb.from('solicitudes_paciente')
        .select(colsCitas)
        .order('created_at', { ascending: false }).limit(200),
      sb.from('planes_profesional').select('*').order('created_at', { ascending: false }),
    ]);
    const conError = [ins, mov, arr, prof, bx, sol, pl].find(r => r.error);
    if (conError) throw conError.error;

    // Fuera de la ventana: pagos por verificar y deudas abiertas (sin pago o
    // rechazados) siguen visibles para la admin, que es quien los gestiona
    let arriendosData = arr.data || [];
    if (esAdmin) {
      const antiguos = await todasLasPaginas(() => sb.from('arriendos').select('*')
        .in('verificado', ['pendiente', 'sin_pago', 'rechazado']).neq('estado', 'cancelado')
        .lt('fecha', desdeArr).order('fecha', { ascending: false }).order('id'));
      if (antiguos.length) arriendosData = [...arriendosData, ...antiguos];
    }

    let misArriendos = [];
    let planes = pl.data || [];
    let miProfId = null;
    if (esProf) {
      const yo = normalizeNombre(usuario.nombre);
      miProfId = (prof.data || []).find(p => normalizeNombre(p.nombre) === yo)?.id || null;
      if (miProfId) {
        // Todas las suyas (sin piso de fecha: sus deudas antiguas siguen visibles)
        misArriendos = await todasLasPaginas(() => sb.from('arriendos').select('*')
          .eq('profesional_id', miProfId)
          .order('fecha', { ascending: false }).order('id'));
      }
      planes = planes.filter(p => p.profesional_id === miProfId || normalizeNombre(p.profesional_nombre) === yo);
    }

    // Recepción: los planes llegan SIN valores monetarios (instrucción
    // 12-10-2026); solo nombre, box, jornadas y estado operativo
    if (esRecep) {
      planes = planes.map(({ plan_precio, comprobante_url, comprobante_nombre, ...resto }) => resto);
    }

    // Planes Especiales: definiciones y condiciones económicas SOLO para admin.
    // Tolerante a que la migración aún no se haya ejecutado.
    let planesEspeciales = null;
    if (esAdmin) {
      const { data: defs, error: eDefs } = await sb.from('planes_especiales').select('*').order('id');
      planesEspeciales = eDefs ? null : (defs || []);
    }

    return res.status(200).json({
      ok: true,
      insumos: ins.data || [],
      movimientos: mov.data || [],
      arriendos: arriendosData,
      misArriendos,
      profesionales: prof.data || [],
      boxes: bx.data || [],
      solicitudes: sol.data || [],
      planes,
      miProfId,
      ...(esAdmin ? { planesEspeciales } : {}),
    });
  } catch (e) {
    console.error('datos:', e && (e.message || e));
    return res.status(500).json({ ok: false, error: 'Error al cargar los datos' });
  }
};
