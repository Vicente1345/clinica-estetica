// api/gestion.js — Escrituras de la app logueada SOLO desde el servidor.
// Reemplaza los insert/update/delete directos del navegador (anon key) para
// poder blindar las tablas con RLS. Cada operación tiene una whitelist de
// campos y una matriz de roles; la identidad de la profesional SIEMPRE se
// deriva del token (una prof no puede operar a nombre de otra).
//
// POST + Authorization: Bearer <token de /api/login>
//   { op: '<operación>', datos: {...} }  → { ok, ... } | { ok:false, error }

const { getSbAdmin, requiereRol, rateLimitOk, ipDeReq } = require('./_lib/seguridad');
const { boxIdsDelRecurso, tiposDelRecurso, recursoDeBox, minHorasDeBox } = require('./_lib/disponibilidad');
const PE = require('./_lib/planesEspeciales');

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
const duracionHoras = (ini, fin) => { const m = h => +h.slice(0, 2) * 60 + +h.slice(3, 5); return (m(fin) - m(ini)) / 60; };

const normalizeNombre = n => (n || '').toLowerCase().replace(/^(dr\.?|dra\.?)\s+/i, '').trim();
const esTexto = (v, max = 500) => typeof v === 'string' && v.length <= max;
const esNum = v => typeof v === 'number' && Number.isFinite(v);

// Roles permitidos por operación
const ROLES_OP = {
  retiro:               ['admin', 'recep', 'prof'],
  ingreso_stock:        ['admin', 'recep'],
  insumo_guardar:       ['admin'],
  box_crear:            ['admin'],
  box_activo:           ['admin'],
  profesional_guardar:  ['admin'],
  profesional_activo:   ['admin'],
  profesional_eliminar: ['admin'],
  solicitud_estado:     ['admin'],            // recepción ya no gestiona solicitudes de pacientes
  plan_registrar:       ['admin', 'recep', 'prof'],
  plan_verificar:       ['admin'],            // solo admin verifica pagos
  jornada_descuento:    ['admin', 'recep', 'prof'],
  comprobante_vincular: ['admin', 'recep', 'prof'],
  comprobante_url:      ['admin', 'prof'],    // ver comprobantes es parte de verificar pagos
  verificar_pago:       ['admin'],            // solo admin verifica pagos
  // Planes Especiales (privados, fuera del catálogo): SOLO admin
  plan_especial_condiciones:   ['admin'],
  plan_especial_previsualizar: ['admin'],
  plan_especial_asignar:       ['admin'],
  plan_especial_modificar:     ['admin'],
  plan_especial_finalizar:     ['admin'],
  plan_especial_historial:     ['admin'],
  arriendo_historial:          ['admin'],
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const op = String(body.op || '');
  const d = body.datos || {};
  if (!ROLES_OP[op]) return res.status(400).json({ ok: false, error: 'Operación desconocida' });

  const auth = requiereRol(req, ROLES_OP[op]);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
  const { usuario } = auth;

  if (!rateLimitOk(`gestion:${ipDeReq(req)}`, 60, 60000)) {
    return res.status(429).json({ ok: false, error: 'Demasiadas operaciones. Espera un minuto.' });
  }

  const sb = await getSbAdmin();
  if (!sb) return res.status(500).json({ ok: false, error: 'Sin conexión a la base de datos' });

  // Identidad de profesional derivada del token (nunca del payload) para rol prof
  const miProfesional = async () => {
    const { data } = await sb.from('profesionales').select('id,nombre');
    const yo = normalizeNombre(usuario.nombre);
    return (data || []).find(p => normalizeNombre(p.nombre) === yo) || null;
  };

  try {
    // ── RETIRO DE INSUMO (lógica de stock y pago EN EL SERVIDOR) ──
    if (op === 'retiro') {
      const origen = d.origen === 'profesional' ? 'profesional' : 'clinica';
      const cantidad = Math.floor(+d.cantidad);
      if (!cantidad || cantidad < 1) return res.status(400).json({ ok: false, error: 'Cantidad inválida' });
      if (!esTexto(d.paciente, 200) || !d.paciente.trim()) return res.status(400).json({ ok: false, error: 'Paciente/destino requerido' });

      let profNombre;
      if (usuario.rol === 'prof') {
        profNombre = usuario.nombre; // identidad del token
      } else {
        const { data: p } = await sb.from('profesionales').select('nombre').eq('id', d.profId).single();
        if (!p) return res.status(400).json({ ok: false, error: 'Profesional inválida' });
        profNombre = p.nombre;
      }

      let insumo = null;
      if (origen === 'clinica') {
        const { data: i } = await sb.from('insumos').select('*').eq('id', d.insumoId).single();
        if (!i) return res.status(400).json({ ok: false, error: 'Insumo inválido' });
        if (cantidad > (i.stock || 0)) return res.status(409).json({ ok: false, error: `Stock insuficiente (disponible: ${i.stock})` });
        insumo = i;
      } else if (!esTexto(d.insumoPropio, 200) || !d.insumoPropio.trim()) {
        return res.status(400).json({ ok: false, error: 'Describe el insumo propio' });
      }

      const pagoRequerido = !!(insumo && insumo.pago_previo);
      const row = {
        tipo: 'retiro',
        insumo_id: insumo ? insumo.id : null,
        insumo_nombre: insumo ? insumo.nombre : d.insumoPropio.trim(),
        cantidad,
        profesional_nombre: profNombre,
        paciente: d.paciente,
        obs: esTexto(d.obs) ? d.obs : '',
        origen_insumo: origen,
        pago_requerido: pagoRequerido,
        pago_pagado: false,
        pago_monto: pagoRequerido ? (insumo.precio || 0) * cantidad : 0, // monto del catálogo, no del cliente
        pago_metodo: esTexto(d.metodo, 40) ? d.metodo : 'Efectivo',
        verificado: pagoRequerido ? 'sin_pago' : 'aprobado',
      };
      const { data: mov, error: e1 } = await sb.from('movimientos').insert(row).select().single();
      if (e1) throw e1;
      if (insumo) {
        const { error: e2 } = await sb.from('insumos').update({ stock: insumo.stock - cantidad }).eq('id', insumo.id);
        if (e2) throw e2;
      }
      return res.status(200).json({ ok: true, id: mov.id, pago_requerido: pagoRequerido });
    }

    // ── INGRESO / REPOSICIÓN DE STOCK ──
    if (op === 'ingreso_stock') {
      const cantidad = Math.floor(+d.cantidad);
      if (!cantidad || cantidad < 1) return res.status(400).json({ ok: false, error: 'Cantidad inválida' });
      const { data: i } = await sb.from('insumos').select('id,nombre,stock').eq('id', d.insumoId).single();
      if (!i) return res.status(400).json({ ok: false, error: 'Insumo inválido' });
      const { error: e1 } = await sb.from('insumos').update({ stock: (i.stock || 0) + cantidad }).eq('id', i.id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from('movimientos').insert({
        tipo: 'ingreso', insumo_id: i.id, insumo_nombre: i.nombre, cantidad,
        profesional_nombre: esTexto(d.responsable, 120) && d.responsable ? d.responsable : 'Administración',
        paciente: '-', origen_insumo: 'clinica', obs: esTexto(d.obs) ? d.obs : '',
      });
      if (e2) throw e2;
      return res.status(200).json({ ok: true });
    }

    // ── INSUMOS (crear / editar) ──
    if (op === 'insumo_guardar') {
      const campos = {};
      if (esTexto(d.nombre, 200) && d.nombre.trim()) campos.nombre = d.nombre.trim();
      if (esTexto(d.categoria, 100)) campos.categoria = d.categoria;
      if (esNum(d.stock) && d.stock >= 0) campos.stock = Math.floor(d.stock);
      if (esTexto(d.unidad, 40)) campos.unidad = d.unidad;
      if (esNum(d.stock_min) && d.stock_min >= 0) campos.stock_min = Math.floor(d.stock_min);
      if (esNum(d.precio) && d.precio >= 0) campos.precio = Math.floor(d.precio);
      if (typeof d.pago_previo === 'boolean') campos.pago_previo = d.pago_previo;
      if (esTexto(d.origen, 40)) campos.origen = d.origen;
      if (typeof d.activo === 'boolean') campos.activo = d.activo;
      if (!d.id && !campos.nombre) return res.status(400).json({ ok: false, error: 'Nombre requerido' });
      const q = d.id
        ? sb.from('insumos').update(campos).eq('id', d.id)
        : sb.from('insumos').insert({ activo: true, ...campos });
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── BOXES ──
    if (op === 'box_crear') {
      const tipo = String(d.tipo || '').toLowerCase().trim();
      if (!['estetico', 'dental', 'medico', 'pabellon'].includes(tipo)) {
        return res.status(400).json({ ok: false, error: 'Tipo inválido: usa estetico, dental, medico o pabellon' });
      }
      if (!esTexto(d.nombre, 120) || !d.nombre.trim()) return res.status(400).json({ ok: false, error: 'Nombre requerido' });
      if (!esNum(+d.tarifa_hora) || +d.tarifa_hora <= 0) return res.status(400).json({ ok: false, error: 'Tarifa inválida' });
      const recurso = (tipo === 'dental' || tipo === 'pabellon') ? 'dental_pabellon' : 'medico_estetico';
      const { error } = await sb.from('boxes').insert({ nombre: d.nombre.trim(), tipo, tarifa_hora: Math.floor(+d.tarifa_hora), activo: true, recurso });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (op === 'box_activo') {
      const { error } = await sb.from('boxes').update({ activo: !!d.activo }).eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── PROFESIONALES ──
    if (op === 'profesional_guardar') {
      const nombre = esTexto(d.nombre, 120) ? d.nombre.trim() : '';
      const especialidad = esTexto(d.especialidad, 120) ? d.especialidad.trim() : '';
      if (!nombre || !especialidad) return res.status(400).json({ ok: false, error: 'Nombre y especialidad requeridos' });
      const q = d.id
        ? sb.from('profesionales').update({ nombre, especialidad }).eq('id', d.id)
        : sb.from('profesionales').insert({ nombre, especialidad, activo: true });
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (op === 'profesional_activo') {
      const { error } = await sb.from('profesionales').update({ activo: !!d.activo }).eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (op === 'profesional_eliminar') {
      // Re-verifica historial EN EL SERVIDOR antes de borrar
      const [a, p] = await Promise.all([
        sb.from('arriendos').select('id', { count: 'exact', head: true }).eq('profesional_id', d.id),
        sb.from('planes_profesional').select('id', { count: 'exact', head: true }).eq('profesional_id', d.id),
      ]);
      const n = (a.count || 0) + (p.count || 0);
      if (n > 0) return res.status(409).json({ ok: false, error: `Tiene ${a.count || 0} arriendo(s) y ${p.count || 0} plan(es): no se puede eliminar. Usa "Desactivar".` });
      const { error } = await sb.from('profesionales').delete().eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── SOLICITUDES DE PACIENTES (cambio de estado) ──
    if (op === 'solicitud_estado') {
      const TRANSICIONES = ['contactado', 'confirmada', 'agendado', 'descartado', 'obs'];
      if (!TRANSICIONES.includes(d.accion)) return res.status(400).json({ ok: false, error: 'Acción inválida' });
      const upd = {};
      if (d.accion === 'contactado' || d.accion === 'confirmada') {
        upd.estado = d.accion;
        upd.contactado_por = usuario.nombre;
        upd.contactado_at = new Date().toISOString();
      } else if (d.accion === 'agendado') {
        upd.estado = 'agendado';
      } else if (d.accion === 'descartado') {
        upd.estado = 'descartado';
        if (esTexto(d.admin_obs, 1000)) upd.admin_obs = d.admin_obs;
      } else if (d.accion === 'obs') {
        if (!esTexto(d.admin_obs, 1000)) return res.status(400).json({ ok: false, error: 'Observación inválida' });
        upd.admin_obs = d.admin_obs;
      }
      const { error } = await sb.from('solicitudes_paciente').update(upd).eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // ── PLANES (registro tras crear jornadas, o contratación desde TabPlanes) ──
    if (op === 'plan_registrar') {
      // Los planes especiales solo se asignan por plan_especial_asignar (admin)
      if (String(d.plan_id || '').startsWith('esp_') || /especial/i.test(String(d.plan_label || ''))) {
        return res.status(403).json({ ok: false, error: 'Los planes especiales solo los asigna la administración' });
      }
      let profesional_id = d.profesional_id, profesional_nombre = d.profesional_nombre || '';
      if (usuario.rol === 'prof') {
        const mio = await miProfesional();
        if (!mio) return res.status(400).json({ ok: false, error: 'Tu cuenta no está vinculada a una profesional' });
        profesional_id = mio.id;
        profesional_nombre = mio.nombre;
      }
      if (!profesional_id) return res.status(400).json({ ok: false, error: 'Profesional requerida' });
      const jt = Math.floor(+d.jornadas_totales);
      // Un plan anual puede traer ~52 jornadas semanales (o 104 si son 2/semana)
      if (!jt || jt < 1 || jt > 370) return res.status(400).json({ ok: false, error: 'Jornadas inválidas' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha_inicio || ''))) return res.status(400).json({ ok: false, error: 'Fecha de inicio inválida' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha_vencimiento || ''))) return res.status(400).json({ ok: false, error: 'Fecha de vencimiento inválida' });
      const row = {
        profesional_id,
        profesional_nombre,
        box_tipo: esTexto(d.box_tipo, 20) ? d.box_tipo : '',
        plan_id: esTexto(d.plan_id, 60) ? d.plan_id : '',
        plan_label: esTexto(d.plan_label, 120) ? d.plan_label : '',
        plan_precio: esNum(+d.plan_precio) && +d.plan_precio >= 0 ? Math.floor(+d.plan_precio) : 0,
        con_asistente: !!d.con_asistente,
        jornadas_totales: jt,
        jornadas_stock: jt,
        fecha_inicio: d.fecha_inicio,
        fecha_vencimiento: d.fecha_vencimiento,
        estado: 'pendiente',
        verificado: 'sin_pago',
      };
      if (Array.isArray(d.dias_semana)) row.dias_semana = d.dias_semana;
      if (esTexto(d.hora_inicio, 5)) row.hora_inicio = d.hora_inicio;
      if (esTexto(d.hora_fin, 5)) row.hora_fin = d.hora_fin;
      const { data: plan, error } = await sb.from('planes_profesional').insert(row).select('id').single();
      if (error) throw error;
      return res.status(200).json({ ok: true, id: plan.id });
    }
    if (op === 'plan_verificar') {
      const decision = d.decision === 'aprobado' ? 'aprobado' : d.decision === 'rechazado' ? 'rechazado' : null;
      if (!decision) return res.status(400).json({ ok: false, error: 'Decisión inválida' });
      const upd = decision === 'aprobado'
        ? { verificado: 'aprobado', estado: 'activo' }
        : { verificado: 'rechazado', estado: 'cancelado' };
      const { error } = await sb.from('planes_profesional').update(upd).eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (op === 'jornada_descuento') {
      let profId = d.profId;
      if (usuario.rol === 'prof') {
        const mio = await miProfesional();
        if (!mio) return res.status(400).json({ ok: false, error: 'Tu cuenta no está vinculada a una profesional' });
        profId = mio.id;
      }
      if (!profId || !esTexto(d.boxTipo, 20)) return res.status(400).json({ ok: false, error: 'Datos incompletos' });
      const { data: plan } = await sb.from('planes_profesional')
        .select('id,jornadas_stock')
        .eq('profesional_id', profId).eq('box_tipo', d.boxTipo)
        .eq('verificado', 'aprobado').gt('jornadas_stock', 0)
        .order('created_at', { ascending: false }).limit(1).single();
      if (!plan) return res.status(200).json({ ok: true, descontado: false }); // sin plan activo: no es error
      const { error } = await sb.from('planes_profesional')
        .update({ jornadas_stock: plan.jornadas_stock - 1 })
        .eq('id', plan.id).eq('jornadas_stock', plan.jornadas_stock); // guard optimista
      if (error) throw error;
      return res.status(200).json({ ok: true, descontado: true });
    }

    // ── COMPROBANTES ──
    if (op === 'comprobante_vincular') {
      const TABLAS = ['arriendos', 'movimientos', 'planes_profesional'];
      if (!TABLAS.includes(d.tabla)) return res.status(400).json({ ok: false, error: 'Tabla inválida' });
      if (!esTexto(d.path, 300) || !d.path || d.path.includes('..')) return res.status(400).json({ ok: false, error: 'Ruta inválida' });
      if (!esTexto(d.nombre, 200)) return res.status(400).json({ ok: false, error: 'Nombre de archivo inválido' });
      // movimientos no tiene profesional_id; solo nombre
      const cols = d.tabla === 'movimientos' ? 'id,verificado,profesional_nombre' : 'id,verificado,profesional_id,profesional_nombre';
      const { data: fila } = await sb.from(d.tabla).select(cols).eq('id', d.id).single();
      if (!fila) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      // Adjuntar un comprobante no puede reabrir un pago ya verificado:
      // cambiar ese estado es facultad exclusiva de la administración
      if (fila.verificado === 'aprobado' && usuario.rol !== 'admin') {
        return res.status(409).json({ ok: false, error: 'Este pago ya fue aprobado por la administración' });
      }
      // Recepción carga comprobantes por cuenta de las profesionales, pero no
      // puede reabrir un pago ya revisado (rechazado) ni reemplazar uno en
      // revisión: eso cambiaría el estado de verificación
      if (usuario.rol === 'recep' && fila.verificado !== 'sin_pago') {
        return res.status(403).json({ ok: false, error: 'Solo la administración puede reabrir un pago ya revisado' });
      }
      // Una profesional solo puede vincular comprobantes a SUS registros
      if (usuario.rol === 'prof') {
        const mio = await miProfesional();
        const esMia = (mio && fila.profesional_id === mio.id) ||
          normalizeNombre(fila.profesional_nombre) === normalizeNombre(usuario.nombre);
        if (!esMia) return res.status(403).json({ ok: false, error: 'Solo puedes adjuntar comprobantes a tus propios registros' });
      }
      const { error } = await sb.from(d.tabla)
        .update({ comprobante_url: d.path, comprobante_nombre: d.nombre, verificado: 'pendiente' })
        .eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    // ── URL firmada para VER un comprobante (admin/recep: cualquiera;
    //    prof: solo los de sus propios registros) ──
    if (op === 'comprobante_url') {
      const TABLAS = ['arriendos', 'movimientos', 'planes_profesional'];
      if (!TABLAS.includes(d.tabla) || !d.id) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
      const cols = d.tabla === 'movimientos'
        ? 'id,comprobante_url,profesional_nombre'
        : 'id,comprobante_url,profesional_id,profesional_nombre';
      const { data: fila } = await sb.from(d.tabla).select(cols).eq('id', d.id).single();
      if (!fila || !fila.comprobante_url) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
      if (usuario.rol === 'prof') {
        const mio = await miProfesional();
        const esMia = (mio && fila.profesional_id === mio.id) ||
          normalizeNombre(fila.profesional_nombre) === normalizeNombre(usuario.nombre);
        if (!esMia) return res.status(403).json({ ok: false, error: 'Solo puedes ver tus propios comprobantes' });
      }
      const { data: firma, error: eFirma } = await sb.storage.from('comprobantes').createSignedUrl(fila.comprobante_url, 3600);
      if (eFirma || !firma?.signedUrl) throw eFirma || new Error('sin signedUrl');
      return res.status(200).json({ ok: true, url: firma.signedUrl });
    }

    if (op === 'verificar_pago') {
      const TABLAS = ['arriendos', 'movimientos'];
      if (!TABLAS.includes(d.tabla)) return res.status(400).json({ ok: false, error: 'Tabla inválida' });
      const decision = d.decision === 'aprobado' ? 'aprobado' : d.decision === 'rechazado' ? 'rechazado' : null;
      if (!decision) return res.status(400).json({ ok: false, error: 'Decisión inválida' });
      // Columnas correctas por tabla (el cliente viejo intentaba pagado/estado
      // en movimientos, columnas que no existen, y la verificación fallaba muda)
      const upd = d.tabla === 'arriendos'
        ? (decision === 'aprobado'
            ? { verificado: 'aprobado', pagado: true, estado: 'confirmado' }
            : { verificado: 'rechazado', pagado: false, estado: 'pendiente' })
        : (decision === 'aprobado'
            ? { verificado: 'aprobado', pago_pagado: true }
            : { verificado: 'rechazado', pago_pagado: false });
      const { error } = await sb.from(d.tabla).update(upd).eq('id', d.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    // Historial de cambios de una reserva (quién, cuándo, qué y por qué)
    if (op === 'arriendo_historial') {
      const { data, error } = await sb.from('arriendos_historial').select('*')
        .eq('arriendo_id', d.arriendo_id).order('creado_at', { ascending: false }).limit(100);
      if (error) {
        // Tabla aún no creada (falta la migración): se informa sin romper la pantalla
        if (error.code === '42P01' || error.code === 'PGRST205') return res.status(200).json({ ok: true, historial: [], sinTabla: true });
        throw error;
      }
      return res.status(200).json({ ok: true, historial: data || [] });
    }

    // ════════════ PLANES ESPECIALES (solo admin) ════════════
    if (op.startsWith('plan_especial_')) {
      const ahora = new Date().toISOString();
      const registrarHistorial = (fila) => sb.from('planes_especiales_historial').insert({
        usuario_id: String(usuario.uid || ''), usuario_nombre: usuario.nombre, ...fila,
      });

      // Historial de una asignación (o de todas, últimas 200)
      if (op === 'plan_especial_historial') {
        let q = sb.from('planes_especiales_historial').select('*').order('creado_at', { ascending: false }).limit(200);
        if (d.plan_profesional_id) q = q.eq('plan_profesional_id', d.plan_profesional_id);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json({ ok: true, historial: data || [] });
      }

      // Editar las condiciones de un plan especial (no altera asignaciones ya
      // hechas: cada asignación guarda el precio acordado al asignarla)
      if (op === 'plan_especial_condiciones') {
        const { data: def } = await sb.from('planes_especiales').select('*').eq('id', d.id).single();
        if (!def) return res.status(404).json({ ok: false, error: 'Plan especial no encontrado' });
        const cambios = {};
        if (esTexto(d.nombre, 120) && d.nombre.trim()) cambios.nombre = d.nombre.trim();
        if (Number.isInteger(d.jornadas_semanales) && d.jornadas_semanales >= 1 && d.jornadas_semanales <= 7) cambios.jornadas_semanales = d.jornadas_semanales;
        if (esNum(d.precio_mensual) && d.precio_mensual >= 0) cambios.precio_mensual = Math.floor(d.precio_mensual);
        if (Number.isInteger(d.vigencia_meses) && d.vigencia_meses >= 1 && d.vigencia_meses <= 12) cambios.vigencia_meses = d.vigencia_meses;
        if (esTexto(d.descripcion, 300)) cambios.descripcion = d.descripcion;
        if (typeof d.activo === 'boolean') cambios.activo = d.activo;
        if (!Object.keys(cambios).length) return res.status(400).json({ ok: false, error: 'Sin cambios válidos' });
        const { error } = await sb.from('planes_especiales')
          .update({ ...cambios, actualizado_por: usuario.nombre, actualizado_at: ahora }).eq('id', def.id);
        if (error) throw error;
        const antes = {}; Object.keys(cambios).forEach(k => { antes[k] = def[k]; });
        await registrarHistorial({ plan_especial_id: def.id, accion: 'editar_condiciones', detalle: { antes, despues: cambios } });
        return res.status(200).json({ ok: true });
      }

      // ── Preparación común: plan, profesional, box, horario y jornadas ──
      const preparar = async ({ planEspecialId, profesionalId, horario, fechaInicio, fechaFin, excluir, ignorarPlanId, hoyMinimo, jornadasSemanales, vigenciaMeses }) => {
        const { data: def } = await sb.from('planes_especiales').select('*').eq('id', planEspecialId).single();
        if (!def) return { error: 'Plan especial no encontrado', status: 404 };
        if (!UUID_RE.test(String(profesionalId || ''))) return { error: 'Selecciona la profesional beneficiaria', status: 400 };
        const { data: prof } = await sb.from('profesionales').select('id,nombre,activo').eq('id', profesionalId).single();
        if (!prof) return { error: 'Profesional no encontrada', status: 404 };
        const { data: boxes } = await sb.from('boxes').select('id,nombre,tipo,activo').order('nombre');
        const box = (boxes || []).find(b => b.activo && b.tipo === def.box_tipo);
        if (!box) return { error: `No hay un box activo de tipo ${def.box_tipo}`, status: 409 };
        // Al modificar una asignación existente se respeta SU frecuencia y
        // vigencia, aunque luego se hayan editado las condiciones del plan
        const vh = PE.validarHorario(horario, jornadasSemanales || def.jornadas_semanales, minHorasDeBox(box));
        if (!vh.ok) return { error: vh.error, status: 400 };
        const vv = PE.validarVigencia(fechaInicio, fechaFin, vigenciaMeses || def.vigencia_meses, hoyMinimo);
        if (!vv.ok) return { error: vv.error, status: 400 };
        const excl = Array.isArray(excluir) ? excluir.filter(f => typeof f === 'string') : [];
        const jornadas = PE.generarJornadas(vh.horario, fechaInicio, fechaFin, excl);
        if (!jornadas.length) return { error: 'El período no genera ninguna jornada', status: 400 };
        // Ocupación real del recurso físico compartido (Dental+Pabellón o
        // Médico+Estético) en el rango, incluidas citas de pacientes
        const ids = boxIdsDelRecurso(boxes, box);
        const tipos = tiposDelRecurso(recursoDeBox(box));
        const desde = jornadas[0].fecha, hasta = jornadas[jornadas.length - 1].fecha;
        // Un año de ocupación puede superar las 1000 filas de PostgREST: paginado
        const [ocupados, citas] = await Promise.all([
          todasLasPaginas(() => sb.from('arriendos').select('id,box_id,box_nombre,fecha,hora_inicio,hora_fin,estado,profesional_nombre,plan_profesional_id')
            .in('box_id', ids).gte('fecha', desde).lte('fecha', hasta).in('estado', ['pendiente', 'confirmado'])
            .order('fecha').order('id')),
          todasLasPaginas(() => sb.from('solicitudes_paciente').select('id,box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado')
            .in('box_tipo', tipos).gte('fecha_solicitada', desde).lte('fecha_solicitada', hasta)
            .order('fecha_solicitada').order('id')),
        ]);
        const conflictos = PE.detectarConflictos(jornadas, ocupados, citas, ignorarPlanId);
        return { def, prof, box, horario: vh.horario, jornadas, conflictos };
      };

      const filasArriendo = (prep, planId) => prep.jornadas.map(j => ({
        fecha: j.fecha, hora_inicio: j.hora_inicio, hora_fin: j.hora_fin,
        horas: duracionHoras(j.hora_inicio, j.hora_fin),
        box_id: prep.box.id, box_nombre: prep.box.nombre,
        profesional_id: prep.prof.id, profesional_nombre: prep.prof.nombre,
        monto: 0,                 // el valor se cobra mensualmente en el plan
        metodo: 'Plan especial',
        pagado: false,
        estado: 'confirmado',     // decisión 12-10-2026: quedan confirmadas
        verificado: 'sin_pago',
        obs: prep.def.nombre,
        plan_profesional_id: planId,
      }));

      // Contexto de una modificación: la asignación, su frecuencia original,
      // desde cuándo se reprograma y qué jornadas canceló la admin a mano
      // (esas NO se recrean al reprogramar)
      const contextoModificacion = async (planProfesionalId, hoy) => {
        const { data: asig } = await sb.from('planes_profesional').select('*').eq('id', planProfesionalId).single();
        if (!asig || !asig.es_especial) return { error: 'Asignación especial no encontrada', status: 404 };
        if (asig.finalizado_at) return { error: 'Esta asignación ya fue finalizada', status: 409 };
        const manana = PE.sumarDias(hoy, 1);
        const desde = asig.fecha_inicio > manana ? asig.fecha_inicio : manana;
        const canceladas = await todasLasPaginas(() => sb.from('arriendos').select('id,fecha,obs_modificacion')
          .eq('plan_profesional_id', asig.id).gte('fecha', desde).eq('estado', 'cancelado').order('fecha').order('id'));
        const AUTOMATICAS = ['Reprogramada por modificación del plan especial', 'Plan especial finalizado'];
        const excluidasPrevias = [...new Set(canceladas
          .filter(c => !AUTOMATICAS.some(t => String(c.obs_modificacion || '').startsWith(t)))
          .map(c => c.fecha))];
        // Término nuevo: hasta la vigencia original del plan (o su vencimiento
        // actual, si fuera posterior), nunca más de un año desde el inicio
        const tope = [asig.fecha_vencimiento, PE.finDeVigencia(asig.fecha_inicio, 12)].sort().pop();
        const validarFin = fin => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fin || ''))) return { ok: false, error: 'Fecha de término inválida' };
          if (fin < desde) return { ok: false, error: 'Para terminar antes, usa "Finalizar"' };
          if (fin > tope) return { ok: false, error: `La vigencia no puede superar ${tope}` };
          return { ok: true };
        };
        return { asig, desde, excluidasPrevias, validarFin, jornadasSemanales: (asig.horario || []).length || null };
      };

      // Vista previa: jornadas y conflictos, SIN escribir nada
      if (op === 'plan_especial_previsualizar') {
        const hoy = hoyChile();
        let prep, excluidasPrevias = [];
        if (d.plan_profesional_id) { // vista previa de una MODIFICACIÓN
          const ctx = await contextoModificacion(d.plan_profesional_id, hoy);
          if (ctx.error) return res.status(ctx.status).json({ ok: false, error: ctx.error });
          excluidasPrevias = ctx.excluidasPrevias;
          prep = await preparar({
            planEspecialId: ctx.asig.plan_especial_id, profesionalId: ctx.asig.profesional_id, horario: d.horario,
            fechaInicio: ctx.desde, fechaFin: d.fecha_fin, excluir: [...excluidasPrevias, ...(d.excluir || [])],
            ignorarPlanId: ctx.asig.id, jornadasSemanales: ctx.jornadasSemanales, vigenciaMeses: 12,
          });
          if (!prep.error) {
            const vv = ctx.validarFin(d.fecha_fin);
            if (!vv.ok) return res.status(400).json({ ok: false, error: vv.error });
          }
        } else {
          prep = await preparar({
            planEspecialId: d.plan_especial_id, profesionalId: d.profesional_id, horario: d.horario,
            fechaInicio: d.fecha_inicio, fechaFin: d.fecha_fin, excluir: d.excluir, hoyMinimo: hoy,
          });
        }
        if (prep.error) return res.status(prep.status).json({ ok: false, error: prep.error });
        return res.status(200).json({
          ok: true, jornadas: prep.jornadas.length, desde: prep.jornadas[0].fecha,
          hasta: prep.jornadas[prep.jornadas.length - 1].fecha,
          box: prep.box.nombre, conflictos: prep.conflictos,
          precio_mensual: prep.def.precio_mensual, horario: PE.describirHorario(prep.horario),
          excluidas_previas: excluidasPrevias,
        });
      }

      // Asignación individual: plan + jornadas del año, o nada
      if (op === 'plan_especial_asignar') {
        const hoy = hoyChile();
        const prep = await preparar({
          planEspecialId: d.plan_especial_id, profesionalId: d.profesional_id, horario: d.horario,
          fechaInicio: d.fecha_inicio, fechaFin: d.fecha_fin, excluir: d.excluir, hoyMinimo: hoy,
        });
        if (prep.error) return res.status(prep.status).json({ ok: false, error: prep.error });
        if (!prep.def.activo) return res.status(409).json({ ok: false, error: 'Este plan especial está desactivado' });
        if (prep.conflictos.length) {
          return res.status(409).json({ ok: false, error: `Hay ${prep.conflictos.length} conflicto(s) con reservas existentes. Ajusta días u horarios, o excluye esas fechas.`, conflictos: prep.conflictos });
        }
        // Sin duplicar: la profesional no puede tener dos asignaciones vigentes del mismo plan
        const { data: vigentes } = await sb.from('planes_profesional').select('id,fecha_inicio,fecha_vencimiento')
          .eq('profesional_id', prep.prof.id).eq('plan_especial_id', prep.def.id).is('finalizado_at', null);
        if ((vigentes || []).some(v => !(v.fecha_vencimiento < d.fecha_inicio || v.fecha_inicio > d.fecha_fin))) {
          return res.status(409).json({ ok: false, error: `${prep.prof.nombre} ya tiene este plan asignado en ese período: modifícalo en vez de asignarlo de nuevo` });
        }
        const { data: plan, error: ePlan } = await sb.from('planes_profesional').insert({
          profesional_id: prep.prof.id, profesional_nombre: prep.prof.nombre,
          box_tipo: prep.def.box_tipo, plan_id: prep.def.id, plan_label: prep.def.nombre,
          plan_precio: prep.def.precio_mensual, con_asistente: false,
          jornadas_totales: prep.jornadas.length, jornadas_stock: 0, // jornadas ya reservadas
          fecha_inicio: d.fecha_inicio, fecha_vencimiento: d.fecha_fin,
          estado: 'pendiente', verificado: 'sin_pago',
          dias_semana: PE.diasCortos(prep.horario),
          hora_inicio: prep.horario[0].hora_inicio, hora_fin: prep.horario[0].hora_fin,
          es_especial: true, plan_especial_id: prep.def.id, horario: prep.horario,
          asignado_por: usuario.nombre, asignado_at: ahora,
        }).select('id').single();
        if (ePlan) throw ePlan;
        // Todas las jornadas en UN insert: el candado de la BD (EXCLUDE) hace
        // que entren todas o ninguna
        const { error: eArr } = await sb.from('arriendos').insert(filasArriendo(prep, plan.id));
        if (eArr) {
          await sb.from('planes_profesional').delete().eq('id', plan.id); // compensación
          if (eArr.code === '23P01') return res.status(409).json({ ok: false, error: 'Otra reserva tomó uno de esos horarios en este momento. Vuelve a previsualizar.' });
          throw eArr;
        }
        await registrarHistorial({
          plan_profesional_id: plan.id, plan_especial_id: prep.def.id, accion: 'asignar',
          detalle: {
            profesional: prep.prof.nombre, box: prep.box.nombre, horario: prep.horario,
            fecha_inicio: d.fecha_inicio, fecha_fin: d.fecha_fin, jornadas: prep.jornadas.length,
            excluidas: Array.isArray(d.excluir) ? d.excluir : [], precio_mensual: prep.def.precio_mensual,
          },
        });
        return res.status(200).json({ ok: true, id: plan.id, jornadas: prep.jornadas.length });
      }

      // ── Asignación existente (modificar / finalizar) ──
      const { data: asig } = await sb.from('planes_profesional').select('*').eq('id', d.plan_profesional_id).single();
      if (!asig || !asig.es_especial) return res.status(404).json({ ok: false, error: 'Asignación especial no encontrada' });
      if (asig.finalizado_at) return res.status(409).json({ ok: false, error: 'Esta asignación ya fue finalizada' });

      if (op === 'plan_especial_modificar') {
        const hoy = hoyChile();
        const manana = PE.sumarDias(hoy, 1);
        const horarioNuevo = d.horario || asig.horario;
        const finNuevo = d.fecha_fin || asig.fecha_vencimiento;
        const cambiaAgenda = !!d.horario || (d.fecha_fin && d.fecha_fin !== asig.fecha_vencimiento);
        const upd = { modificado_por: usuario.nombre, modificado_at: ahora };
        const antes = {}, despues = {};
        if (esNum(d.precio_mensual) && d.precio_mensual >= 0 && Math.floor(d.precio_mensual) !== asig.plan_precio) {
          upd.plan_precio = Math.floor(d.precio_mensual);
          antes.precio_mensual = asig.plan_precio; despues.precio_mensual = upd.plan_precio;
        }
        if (cambiaAgenda) {
          // Solo se reprograman las jornadas PROPIAS del plan desde mañana;
          // las pasadas y las de hoy quedan intactas (historial real), y las
          // que la admin canceló a mano siguen fuera
          const ctx = await contextoModificacion(asig.id, hoy);
          if (ctx.error) return res.status(ctx.status).json({ ok: false, error: ctx.error });
          const desde = ctx.desde;
          const vf = ctx.validarFin(finNuevo);
          if (!vf.ok) return res.status(400).json({ ok: false, error: vf.error });
          const prep = await preparar({
            planEspecialId: asig.plan_especial_id, profesionalId: asig.profesional_id, horario: horarioNuevo,
            fechaInicio: desde, fechaFin: finNuevo, excluir: [...ctx.excluidasPrevias, ...(d.excluir || [])],
            ignorarPlanId: asig.id, jornadasSemanales: ctx.jornadasSemanales, vigenciaMeses: 12,
          });
          if (prep.error) return res.status(prep.status).json({ ok: false, error: prep.error });
          if (prep.conflictos.length) {
            return res.status(409).json({ ok: false, error: `Hay ${prep.conflictos.length} conflicto(s) con reservas existentes.`, conflictos: prep.conflictos });
          }
          // 1) Liberar las jornadas futuras propias (se guardan los ids para revertir)
          const { data: futuras, error: eFut } = await sb.from('arriendos')
            .update({ estado: 'cancelado', obs_modificacion: 'Reprogramada por modificación del plan especial' })
            .eq('plan_profesional_id', asig.id).gte('fecha', desde).in('estado', ['pendiente', 'confirmado'])
            .select('id,estado');
          if (eFut) throw eFut;
          // (las canceladas a mano ya tenían estado 'cancelado': no se tocan)
          // 2) Crear las nuevas jornadas en un solo insert
          const { error: eNew } = await sb.from('arriendos').insert(filasArriendo(prep, asig.id));
          if (eNew) {
            // Revertir: las jornadas liberadas vuelven a quedar confirmadas
            const idsFut = (futuras || []).map(f => f.id);
            if (idsFut.length) {
              const { error: eRev } = await sb.from('arriendos').update({ estado: 'confirmado', obs_modificacion: null }).in('id', idsFut);
              if (eRev) {
                console.error('plan_especial_modificar: NO se pudo revertir', asig.id, eRev.message);
                return res.status(500).json({ ok: false, error: `No se pudo reprogramar y tampoco restaurar ${idsFut.length} jornada(s) del plan. Revisa la Agenda de esta profesional antes de reintentar.` });
              }
            }
            if (eNew.code === '23P01') return res.status(409).json({ ok: false, error: 'Otra reserva tomó uno de esos horarios en este momento. Vuelve a intentarlo.' });
            throw eNew;
          }
          upd.horario = prep.horario;
          upd.dias_semana = PE.diasCortos(prep.horario);
          upd.hora_inicio = prep.horario[0].hora_inicio;
          upd.hora_fin = prep.horario[0].hora_fin;
          upd.fecha_vencimiento = finNuevo;
          antes.horario = asig.horario; despues.horario = prep.horario;
          antes.fecha_fin = asig.fecha_vencimiento; despues.fecha_fin = finNuevo;
          despues.jornadas_reprogramadas = prep.jornadas.length;
          if (Array.isArray(d.excluir) && d.excluir.length) despues.excluidas = d.excluir;
        }
        if (!Object.keys(despues).length) return res.status(400).json({ ok: false, error: 'No hay cambios que aplicar' });
        // Total de jornadas vigentes del plan
        const { count } = await sb.from('arriendos').select('id', { count: 'exact', head: true })
          .eq('plan_profesional_id', asig.id).in('estado', ['pendiente', 'confirmado']);
        upd.jornadas_totales = count || 0;
        const { error: eUpd } = await sb.from('planes_profesional').update(upd).eq('id', asig.id);
        if (eUpd) throw eUpd;
        await registrarHistorial({ plan_profesional_id: asig.id, plan_especial_id: asig.plan_especial_id, accion: 'modificar', detalle: { antes, despues } });
        return res.status(200).json({ ok: true });
      }

      if (op === 'plan_especial_finalizar') {
        const hoy = hoyChile();
        // Fecha estricta: un valor mal escrito NUNCA cae por defecto a "hoy"
        // (liberaría todas las jornadas futuras sin vuelta atrás)
        const raw = String(d.fecha_termino == null ? '' : d.fecha_termino).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return res.status(400).json({ ok: false, error: 'Fecha de término inválida (AAAA-MM-DD)' });
        const termino = raw;
        if (termino < hoy) return res.status(400).json({ ok: false, error: 'La fecha de término no puede ser anterior a hoy' });
        if (termino > asig.fecha_vencimiento) return res.status(400).json({ ok: false, error: `La fecha de término no puede superar el vencimiento (${asig.fecha_vencimiento})` });
        // Se liberan SOLO las jornadas propias del plan posteriores al término
        const { data: liberadas, error: eLib } = await sb.from('arriendos')
          .update({ estado: 'cancelado', obs_modificacion: 'Plan especial finalizado' })
          .eq('plan_profesional_id', asig.id).gt('fecha', termino).in('estado', ['pendiente', 'confirmado'])
          .select('id');
        if (eLib) throw eLib;
        const { count } = await sb.from('arriendos').select('id', { count: 'exact', head: true })
          .eq('plan_profesional_id', asig.id).in('estado', ['pendiente', 'confirmado']);
        // estado 'cancelado' + finalizado_at = finalizado (el CHECK de estado
        // de la tabla no admite 'finalizado'; no se toca esa regla)
        const { error: eUpd } = await sb.from('planes_profesional').update({
          estado: 'cancelado', fecha_vencimiento: termino, jornadas_totales: count || 0,
          finalizado_por: usuario.nombre, finalizado_at: ahora,
          modificado_por: usuario.nombre, modificado_at: ahora,
        }).eq('id', asig.id);
        if (eUpd) throw eUpd;
        await registrarHistorial({
          plan_profesional_id: asig.id, plan_especial_id: asig.plan_especial_id, accion: 'finalizar',
          detalle: { fecha_termino: termino, jornadas_liberadas: (liberadas || []).length, vencimiento_anterior: asig.fecha_vencimiento },
        });
        return res.status(200).json({ ok: true, liberadas: (liberadas || []).length });
      }
    }

    return res.status(400).json({ ok: false, error: 'Operación desconocida' });
  } catch (e) {
    console.error('gestion:', op, e && (e.message || e));
    return res.status(500).json({ ok: false, error: 'Error del servidor al aplicar la operación' });
  }
};
