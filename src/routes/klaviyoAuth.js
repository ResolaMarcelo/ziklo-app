const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const fetch   = require('node-fetch');
const prisma  = require('../lib/prisma');

const CLIENT_ID     = process.env.KLAVIYO_CLIENT_ID;
const CLIENT_SECRET = process.env.KLAVIYO_CLIENT_SECRET;
const TOKEN_URL     = 'https://a.klaviyo.com/oauth/token';
const SCOPES        = 'events:write';

function redirectUri() {
  return `${process.env.APP_URL}/auth/klaviyo/callback`;
}

// State firmado igual que Shopify OAuth (contiene shopDomain + timestamp)
function crearState(shopDomain) {
  const payload = Buffer.from(JSON.stringify({ shopDomain, ts: Date.now() })).toString('base64url');
  const sig     = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verificarState(state, shopDomain) {
  if (!state) return false;
  const dot     = state.lastIndexOf('.');
  if (dot < 0) return false;
  const payload  = state.slice(0, dot);
  const sig      = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.shopDomain !== shopDomain) return false;
    if (Date.now() - data.ts > 10 * 60 * 1000) return false; // expira en 10 min
    return true;
  } catch { return false; }
}

// ── GET /auth/klaviyo — iniciar OAuth ─────────────────────────────────────────
router.get('/', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('Faltan KLAVIYO_CLIENT_ID y KLAVIYO_CLIENT_SECRET en las variables de entorno.');
  }

  const shopDomain = req.session?.shopDomain;
  if (!shopDomain) return res.redirect('/admin/?error=no_shop');

  const state = crearState(shopDomain);

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         SCOPES,
    state,
  });

  res.redirect('https://www.klaviyo.com/oauth/authorize?' + params.toString());
});

// ── GET /auth/klaviyo/callback — recibir código e intercambiar por token ──────
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error('Klaviyo OAuth error:', error);
    return res.redirect('/admin/integraciones?error=klaviyo_denied');
  }

  const shopDomain = req.session?.shopDomain;
  if (!shopDomain) return res.redirect('/admin/?error=no_shop');

  if (!verificarState(state, shopDomain)) {
    return res.redirect('/admin/?error=invalid_state');
  }

  if (!code) return res.redirect('/admin/?error=missing_code');

  try {
    // Intercambiar código por tokens
    const tokenRes = await fetch(TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri(),
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Klaviyo token exchange failed:', tokenData);
      return res.redirect('/admin/?error=klaviyo_token_failed');
    }

    const expiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    // Guardar tokens en el shop
    await prisma.shop.update({
      where: { domain: shopDomain },
      data: {
        klaviyoAccessToken:  tokenData.access_token,
        klaviyoRefreshToken: tokenData.refresh_token || null,
        klaviyoTokenExpiry:  expiry,
      },
    });

    console.log(`✅ Klaviyo conectado para: ${shopDomain}`);
    res.redirect('/admin/#integraciones');
  } catch (err) {
    console.error('Error en Klaviyo OAuth callback:', err);
    res.redirect('/admin/?error=klaviyo_server_error');
  }
});

// ── POST /auth/klaviyo/disconnect — desconectar Klaviyo ──────────────────────
router.post('/disconnect', async (req, res) => {
  const shopDomain = req.session?.shopDomain;
  if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

  try {
    await prisma.shop.update({
      where: { domain: shopDomain },
      data: {
        klaviyoAccessToken:  null,
        klaviyoRefreshToken: null,
        klaviyoTokenExpiry:  null,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
