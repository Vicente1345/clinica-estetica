// api/webpay-commit.js — Recibe el callback de Transbank al terminar el pago
// Transbank hace POST con token_ws → confirmamos con PUT y redirigimos a /cowork

const { createClient } = require('@supabase/supabase-js');
const {
  boxIdsDelRecurso, tiposDelRecurso, recursoDeBox, seSolapan,
  ESTADOS_OCUPAN, ESTADOS_CITA_OCUPAN, ganaCarrera,
} = require('./_lib/disponibilidad');

const SANDBOX = {
  commerceCode: '597055555532',
  apiKey: '579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C',
  baseUrl: 'https://webpay3gint.transbank.cl',
};

function getCreds() {
  if (process.env.WEBPAY_ENV === 'production') {
    return {
      commerceCode: process.env.WEBPAY_COMMERCE_CODE,
      apiKey:       process.env.WEBPAY_API_KEY,
      baseUrl:      'https://webpay3g.transbank.cl',
    };
  }
  return SANDBOX;
}

function getSb() {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  return createClient(url, key);
}

// Vercel parsea form-urlencoded automáticamente pero por las dudas lo manejamos
function getToken(req) {
  // POST con body form-urlencoded
  if (req.body && typeof req.body === 'object' && req.body.token_ws) return req.body.token_ws;
  // POST con body string
  if (typeof req.body === 'string') {
    const params = new URLSearchParams(req.body);
    if (params.get('token_ws')) return params.get('token_ws');
  }
  // GET con query
  return req.query?.token_ws || null;
}

module.exports = async (req, res) => {
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base  = `${proto}://${host}`;

  try {
    const token = getToken(req);
    const tbkToken = req.body?.TBK_TOKEN || req.query?.TBK_TOKEN; // si user anula desde Webpay

    if (tbkToken && !token) {
      // Usuario canceló desde la pasarela Webpay
      const sb0 = getSb();
      await sb0.from('webpay_transacciones')
        .update({ estado: 'anulada', commit_at: new Date().toISOString() })
        .eq('token_ws', tbkToken);
      return res.redirect(302, `${base}/cowork?webpay=cancelada`);
    }

    if (!token) {
      return res.redirect(302, `${base}/cowork?webpay=missing`);
    }

    const creds = getCreds();

    // Confirmar transacción con PUT
    const r = await fetch(`${creds.baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`, {
      method: 'PUT',
      headers: {
        'Tbk-Api-Key-Id':     creds.commerceCode,
        'Tbk-Api-Key-Secret': creds.apiKey,
        'Content-Type':       'application/json',
      },
    });

    const result   = await r.json();
    const aprobado = result.status === 'AUTHORIZED' && result.response_code === 0;

    // Actualizar registro de transacción
    const sb = getSb();
    const { data: tx } = await sb
      .from('webpay_transacciones')
      .select('*')
      .eq('token_ws', token)
      .maybeSingle();

    await sb.from('webpay_transacciones').update({
      estado:              aprobado ? 'aprobada' : 'rechazada',
      respuesta_transbank: result,
      commit_at:           new Date().toISOString(),
    }).eq('token_ws', token);

    // Si aprobado: RE-VALIDAR disponibilidad sobre el recurso físico compartido
    // (otros arriendos Y citas de pacientes) antes de confirmar. El arriendo ya
    // ocupaba el slot como 'pendiente', así que un conflicto aquí solo puede
    // venir de una carrera extrema; en ese caso NO se confirma.
    // Si la re-lectura falla, se confirma igual (el pago fue aprobado — nunca
    // dejar el arriendo pendiente por un error de lectura nuestro).
    let huboConflicto = false;
    if (aprobado && tx?.arriendo_id) {
      let conflicto = null;
      try {
        const { data: arr } = await sb.from('arriendos').select('*').eq('id', tx.arriendo_id).maybeSingle();
        if (arr) {
          const { data: boxes } = await sb.from('boxes').select('id,nombre,tipo');
          const box = (boxes || []).find(b => b.id === arr.box_id) || { tipo: '' };
          const ids = boxes ? boxIdsDelRecurso(boxes, box) : [arr.box_id];
          const tipos = tiposDelRecurso(recursoDeBox(box));
          const [{ data: otros }, { data: citas }] = await Promise.all([
            sb.from('arriendos')
              .select('id,box_id,fecha,hora_inicio,hora_fin,estado,created_at')
              .in('box_id', ids).eq('fecha', arr.fecha).in('estado', ESTADOS_OCUPAN)
              .neq('id', arr.id),
            sb.from('solicitudes_paciente')
              .select('id,box_tipo,fecha_solicitada,hora_inicio,hora_fin,estado')
              .in('box_tipo', tipos).eq('fecha_solicitada', arr.fecha).in('estado', ESTADOS_CITA_OCUPAN),
          ]);
          conflicto = (otros || []).find(o =>
            seSolapan(arr.hora_inicio, arr.hora_fin, o.hora_inicio, o.hora_fin) &&
            !ganaCarrera(arr, o)
          ) || (citas || []).find(s =>
            s.hora_inicio && s.hora_fin &&
            seSolapan(arr.hora_inicio, arr.hora_fin, s.hora_inicio, s.hora_fin)
          ) || null;
        }
      } catch (revalErr) {
        console.error('webpay-commit revalidación falló, se confirma igual:', revalErr);
        conflicto = null;
      }

      if (conflicto) {
        huboConflicto = true;
        await sb.from('arriendos').update({
          pagado:           true,   // el cobro sí ocurrió: queda registrado para gestión/reembolso
          estado:           'cancelado',
          verificado:       'aprobado',
          metodo:           'Webpay',
          obs_modificacion: 'Pago Webpay aprobado pero el horario fue tomado por otra reserva o cita del recurso compartido. Requiere gestión de la administración (reagendar o reembolsar).',
        }).eq('id', tx.arriendo_id);
      } else {
        await sb.from('arriendos').update({
          pagado:     true,
          estado:     'confirmado',
          verificado: 'aprobado',
          metodo:     'Webpay',
        }).eq('id', tx.arriendo_id);
      }
    }

    const qs = new URLSearchParams({
      webpay:     huboConflicto ? 'conflicto' : aprobado ? 'ok' : 'fail',
      arriendoId: tx?.arriendo_id || '',
      codigo:     result.authorization_code || '',
      monto:      result.amount || '',
      ...(aprobado ? {} : { motivo: String(result.response_code ?? 'desconocido') }),
    });

    return res.redirect(302, `${base}/cowork?${qs.toString()}`);
  } catch (e) {
    console.error('webpay-commit throw:', e);
    return res.redirect(302, `${base}/cowork?webpay=error`);
  }
};
