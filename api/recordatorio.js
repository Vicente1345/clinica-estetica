// api/recordatorio.js — Recordatorios automáticos 1 día antes
// Invocado diariamente por Vercel Cron (vercel.json)
// También puede llamarse manualmente: GET /api/recordatorio?token=RECORDATORIO_SECRET

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function enviarEmail(to, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'Sin RESEND_API_KEY' };
  const from = process.env.RESEND_FROM || 'Barcelona Clinic <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const body = await r.json();
    if (!r.ok) console.error('Resend error', r.status, body);
    return { ok: r.ok, status: r.status };
  } catch (e) {
    console.error('Resend throw', e);
    return { ok: false };
  }
}

// Fecha de mañana en hora de Santiago (UTC-3)
function mañanaChile() {
  const ahora = new Date();
  // Sumar 1 día en UTC y luego ajustar a CLT (UTC-3)
  const clOffset = -3 * 60; // minutos
  const localMs  = ahora.getTime() + clOffset * 60000;
  const local     = new Date(localMs);
  local.setUTCDate(local.getUTCDate() + 1);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = async (req, res) => {
  // Seguridad: solo Vercel Cron o token manual
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  const tokenEnv     = process.env.RECORDATORIO_SECRET;
  const tokenReq     = req.query.token || req.headers['authorization'];
  if (!isVercelCron && tokenEnv && tokenReq !== tokenEnv) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(500).json({ error: 'Sin conexión a BD' });

  const fecha = mañanaChile();
  console.log(`[recordatorio] Buscando citas para ${fecha}`);

  const { data: citas, error } = await sb
    .from('solicitudes_paciente')
    .select('*')
    .eq('fecha_solicitada', fecha)
    .in('estado', ['agendada', 'confirmada'])
    .order('hora_inicio');

  if (error) {
    console.error('Supabase error', error);
    return res.status(500).json({ error: error.message });
  }

  if (!citas || citas.length === 0) {
    console.log(`[recordatorio] Sin citas para ${fecha}`);
    return res.status(200).json({ ok: true, fecha, enviados: 0, msg: 'No hay citas mañana' });
  }

  console.log(`[recordatorio] ${citas.length} citas para ${fecha}`);

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'vbecerrai@udd.cl';
  const resultados = [];

  // ── Email de recordatorio a cada paciente ─────────────────────────
  for (const c of citas) {
    if (!c.email) { resultados.push({ id: c.id, nombre: c.nombre, emailPaciente: 'sin email' }); continue; }

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#6B5B8A;padding:20px 24px;border-radius:10px 10px 0 0">
          <h2 style="margin:0;color:#fff;font-size:18px">💜 Recordatorio de cita</h2>
          <p style="margin:4px 0 0;color:#E8E0F5;font-size:13px">Barcelona Clinic — Puerto Varas</p>
        </div>
        <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:24px">
          <p style="margin:0 0 16px;font-size:15px">Hola <strong>${c.nombre}</strong>,</p>
          <p style="margin:0 0 16px;font-size:14px;color:#555">Te recordamos que tienes una cita <strong>mañana</strong>:</p>
          <div style="background:#f5f0fc;border-radius:8px;padding:14px 18px;margin-bottom:18px">
            <div style="font-size:13px;color:#555;line-height:2">
              <div>📅 <strong>Fecha:</strong> ${c.fecha_solicitada}</div>
              <div>⏰ <strong>Hora:</strong> ${(c.hora_inicio||'').slice(0,5)} – ${(c.hora_fin||'').slice(0,5)}</div>
              ${c.tratamiento ? `<div>✨ <strong>Tratamiento:</strong> ${c.tratamiento}</div>` : ''}
            </div>
          </div>
          <p style="margin:0 0 8px;font-size:14px;color:#555">
            Si necesitas cancelar o modificar tu cita, escríbenos por WhatsApp:
          </p>
          <a href="https://wa.me/56988284965" style="display:inline-block;background:#25D366;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
            💬 Escribir por WhatsApp
          </a>
          <p style="margin:20px 0 0;font-size:11px;color:#aaa">
            Barcelona Clinic · Ruta 225, Tanpu, Puerto Varas · @barcelonaclinic.pv
          </p>
        </div>
      </div>
    `;

    const r = await enviarEmail(
      c.email,
      `Recordatorio: cita mañana ${c.fecha_solicitada} — Barcelona Clinic`,
      html
    );
    resultados.push({ id: c.id, nombre: c.nombre, emailPaciente: r.ok ? 'enviado' : 'error' });
  }

  // ── Email resumen al admin con links de WhatsApp ──────────────────
  const filasHtml = citas.map(c => {
    const tel   = (c.telefono || '').replace(/[^0-9]/g, '');
    const wsTel = tel.startsWith('56') ? tel : '56' + tel;
    const wsMsg = encodeURIComponent(
      `Hola ${c.nombre} 👋, te recordamos tu cita mañana *${c.fecha_solicitada}* a las *${(c.hora_inicio||'').slice(0,5)}* en Barcelona Clinic.${c.tratamiento ? ` Tratamiento: ${c.tratamiento}.` : ''} ¿Confirmas tu asistencia?`
    );
    const wsLink = wsTel ? `https://wa.me/${wsTel}?text=${wsMsg}` : null;
    const horaIni = (c.hora_inicio||'').slice(0,5);
    const horaFin = (c.hora_fin||'').slice(0,5);
    return `
      <tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:10px 12px;font-size:13px"><strong>${horaIni}</strong><br><span style="color:#888;font-size:11px">${horaFin}</span></td>
        <td style="padding:10px 12px;font-size:13px">
          <strong>${c.nombre}</strong><br>
          <span style="color:#666;font-size:11px">${c.tratamiento || c.motivo_consulta || ''}</span>
        </td>
        <td style="padding:10px 12px;font-size:12px;color:#555">${c.telefono || '—'}</td>
        <td style="padding:10px 12px;font-size:12px;color:#555">${c.email || '—'}</td>
        <td style="padding:10px 12px">
          ${wsLink
            ? `<a href="${wsLink}" style="background:#25D366;color:#fff;padding:5px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600">💬 WhatsApp</a>`
            : '<span style="color:#ccc;font-size:11px">sin tel</span>'}
        </td>
      </tr>
    `;
  }).join('');

  const adminHtml = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto">
      <div style="background:#185FA5;padding:18px 24px;border-radius:10px 10px 0 0">
        <h2 style="margin:0;color:#fff;font-size:17px">📅 Citas para mañana — ${fecha}</h2>
        <p style="margin:4px 0 0;color:#C5DCF5;font-size:12px">${citas.length} cita${citas.length > 1 ? 's' : ''} programada${citas.length > 1 ? 's' : ''}</p>
      </div>
      <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 10px 10px;padding:0">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#f8f8f8">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;font-weight:600">HORA</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;font-weight:600">PACIENTE</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;font-weight:600">TELÉFONO</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;font-weight:600">EMAIL</th>
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;font-weight:600">CONFIRMAR</th>
            </tr>
          </thead>
          <tbody>${filasHtml}</tbody>
        </table>
        <div style="padding:16px 20px;background:#FFF9E6;border-top:1px solid #eee;font-size:12px;color:#664500;border-radius:0 0 10px 10px">
          💡 Haz clic en <strong>💬 WhatsApp</strong> de cada paciente para enviarle el recordatorio con un mensaje pre-escrito.
        </div>
      </div>
    </div>
  `;

  await enviarEmail(
    adminEmail,
    `📅 ${citas.length} cita${citas.length > 1 ? 's' : ''} mañana ${fecha} — Barcelona Clinic`,
    adminHtml
  );

  console.log(`[recordatorio] Completado: ${resultados.length} procesados`);
  return res.status(200).json({ ok: true, fecha, total: citas.length, resultados });
};
