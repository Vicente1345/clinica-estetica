// api/webpay-init.js — Inicia transacción Webpay Plus (Transbank)
// POST /api/webpay-init  body: { arriendoId, monto }
// Devuelve: { url, token } — el frontend debe hacer form POST a url con token_ws

const { createClient } = require('@supabase/supabase-js');

// Credenciales públicas de Sandbox de Transbank (Webpay Plus)
// Cuando tengas credenciales de producción, agrega en Vercel:
//   WEBPAY_ENV = production
//   WEBPAY_COMMERCE_CODE = (tu código de comercio)
//   WEBPAY_API_KEY = (tu API key)
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { arriendoId, monto } = body;

    if (!arriendoId || !monto || monto < 50) {
      return res.status(400).json({ error: 'Falta arriendoId o monto inválido (mínimo $50)' });
    }

    const creds = getCreds();
    if (!creds.commerceCode || !creds.apiKey) {
      return res.status(500).json({ error: 'Webpay no configurado en el servidor' });
    }

    // buy_order: max 26 caracteres, alfanumérico + algunos signos
    const buyOrder  = `bcn-${Date.now()}-${arriendoId}`.slice(0, 26);
    const sessionId = `s-${Date.now()}-${arriendoId}`.slice(0, 61);

    // Calcular returnUrl absoluta (Vercel preserva host original)
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const returnUrl = `${proto}://${host}/api/webpay-commit`;

    // Crear transacción en Transbank
    const r = await fetch(`${creds.baseUrl}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
      method: 'POST',
      headers: {
        'Tbk-Api-Key-Id':     creds.commerceCode,
        'Tbk-Api-Key-Secret': creds.apiKey,
        'Content-Type':       'application/json',
      },
      body: JSON.stringify({
        buy_order:  buyOrder,
        session_id: sessionId,
        amount:     Math.round(Number(monto)),
        return_url: returnUrl,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('Webpay create error:', r.status, errText);
      return res.status(500).json({ error: 'Transbank rechazó la creación de transacción', detail: errText });
    }

    const data = await r.json();   // { token, url }

    // Registrar en Supabase para el commit posterior
    const sb = getSb();
    await sb.from('webpay_transacciones').insert({
      buy_order:   buyOrder,
      token_ws:    data.token,
      arriendo_id: arriendoId,
      monto:       Math.round(Number(monto)),
      estado:      'iniciada',
    });

    return res.status(200).json({ url: data.url, token: data.token, buyOrder });
  } catch (e) {
    console.error('webpay-init throw:', e);
    return res.status(500).json({ error: 'Error interno', message: e.message });
  }
};
