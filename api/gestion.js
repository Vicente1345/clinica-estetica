// api/gestion.js — Escrituras de la app logueada SOLO desde el servidor.
// Reemplaza los insert/update/delete directos del navegador (anon key) para
// poder blindar las tablas con RLS. Cada operación tiene una whitelist de
// campos y una matriz de roles; la identidad de la profesional SIEMPRE se
// deriva del token (una prof no puede operar a nombre de otra).
//
// POST + Authorization: Bearer <token de /api/login>
//   { op: '<operación>', datos: {...} }  → { ok, ... } | { ok:false, error }

const { getSbAdmin, requiereRol, rateLimitOk, ipDeReq } = require('./_lib/seguridad');

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
  solicitud_estado:     ['admin', 'recep'],
  plan_registrar:       ['admin', 'recep', 'prof'],
  plan_verificar:       ['admin', 'recep'],
  jornada_descuento:    ['admin', 'recep', 'prof'],
  comprobante_vincular: ['admin', 'recep', 'prof'],
  verificar_pago:       ['admin', 'recep'],
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
      // Una profesional solo puede vincular comprobantes a SUS registros
      if (usuario.rol === 'prof') {
        // movimientos no tiene profesional_id; solo nombre
        const cols = d.tabla === 'movimientos' ? 'id,profesional_nombre' : 'id,profesional_id,profesional_nombre';
        const { data: fila } = await sb.from(d.tabla).select(cols).eq('id', d.id).single();
        if (!fila) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
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

    return res.status(400).json({ ok: false, error: 'Operación desconocida' });
  } catch (e) {
    console.error('gestion:', op, e && (e.message || e));
    return res.status(500).json({ ok: false, error: 'Error del servidor al aplicar la operación' });
  }
};
