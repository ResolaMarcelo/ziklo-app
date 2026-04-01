const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const prisma  = require('../lib/prisma');

const CLIENT_ID     = process.env.MP_CLIENT_ID;
const CLIENT_SECRET = process.env.MP_CLIENT_SECRET;
const APP_URL       = process.env.APP_URL || 'https://app.zikloapp.com';
const REDIRECT_URI  = `${APP_URL}/auth/mp/callback`;

// State firmado con HMAC (mismo patrón que Shopify y Klaviyo OAuth)
function crearState(shopDomain) {
  const payload = Buffer.from(JSON.stringify({ shopDomain, ts: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verificarState(state) {
  if (!state) return null;
  const dot = state.lastIndexOf('.');
  if (dot < 0) return null;
  const payload  = state.slice(0, dot);
  const sig      = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - data.ts > 10 * 60 * 1000) return null; // expira en 10 min
    return data.shopDomain;
  } catch { return null; }
}

// GET /auth/mp — inicia el OAuth flow de Mercado Pago
router.get('/', (req, res) => {
  const shopDomain = req.session?.shopDomain;
  if (!shopDomain) return res.redirect('/admin/login');

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    platform_id:   'mp',
    redirect_uri:  REDIRECT_URI,
    state:         crearState(shopDomain),
  });

  res.redirect(`https://auth.mercadopago.com/authorization?${params}`);
});

// GET /auth/mp/callback — MP redirige acá con el código de autorización
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    console.error('[MP OAuth] Error o código ausente:', error);
    return res.redirect('/admin?mp_error=1#integraciones');
  }

  // Verificar state firmado — previene CSRF en OAuth
  const shopDomain = verificarState(state);
  if (!shopDomain) {
    console.error('[MP OAuth] State inválido o expirado');
    return res.redirect('/admin?mp_error=1#integraciones');
  }

  try {
    // Intercambiar código por access token
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('[MP OAuth] Error al obtener token:', tokenData);
      return res.redirect('/admin?mp_error=1#integraciones');
    }

    // Guardar el access token en la DB (el middleware de Prisma encripta automáticamente)
    await prisma.shop.upsert({
      where:  { domain: shopDomain },
      update: { mpAccessToken: tokenData.access_token },
      create: {
        domain:        shopDomain,
        accessToken:   '',
        mpAccessToken: tokenData.access_token,
        shopName:      shopDomain,
      },
    });

    console.log(`[MP OAuth] Token guardado para ${shopDomain}`);

    // Redirigir al admin con éxito
    res.redirect('/admin?mp_ok=1#integraciones');
  } catch (err) {
    console.error('[MP OAuth] Error en callback:', err.message);
    res.redirect('/admin?mp_error=1#integraciones');
  }
});

module.exports = router;
