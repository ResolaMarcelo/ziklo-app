const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const { encrypt } = require('../services/crypto');

const CLIENT_ID     = process.env.MP_CLIENT_ID;
const CLIENT_SECRET = process.env.MP_CLIENT_SECRET;
const APP_URL       = process.env.APP_URL || 'https://app-production-338a.up.railway.app';
const REDIRECT_URI  = `${APP_URL}/auth/mp/callback`;

// GET /auth/mp — inicia el OAuth flow de Mercado Pago
router.get('/', (req, res) => {
  const shopDomain = req.session?.shopDomain;
  if (!shopDomain) return res.redirect('/admin/login');

  // Guardar shopDomain en sesión para usarlo en el callback
  req.session.mpOAuthShop = shopDomain;

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    platform_id:   'mp',
    redirect_uri:  REDIRECT_URI,
    state:         shopDomain,
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

  // shopDomain viene del state param o de la sesión
  const shopDomain = state || req.session?.mpOAuthShop || req.session?.shopDomain;
  if (!shopDomain) {
    console.error('[MP OAuth] No se encontró shopDomain');
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

    // Guardar el access token en la DB (encriptado)
    const encryptedMpToken = encrypt(tokenData.access_token);
    await prisma.shop.upsert({
      where:  { domain: shopDomain },
      update: { mpAccessToken: encryptedMpToken },
      create: {
        domain:        shopDomain,
        accessToken:   '',
        mpAccessToken: encryptedMpToken,
        shopName:      shopDomain,
      },
    });

    console.log(`[MP OAuth] Token guardado para ${shopDomain}`);

    // Limpiar sesión temporal
    delete req.session.mpOAuthShop;

    // Redirigir al admin con éxito
    res.redirect('/admin?mp_ok=1#integraciones');
  } catch (err) {
    console.error('[MP OAuth] Error en callback:', err.message);
    res.redirect('/admin?mp_error=1#integraciones');
  }
});

module.exports = router;
