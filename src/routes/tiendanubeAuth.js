const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fetch = require('node-fetch');
const prisma = require('../lib/prisma');
const tiendanube = require('../services/tiendanube');

const CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'https://app.zikloapp.com';

// ── State firmado (mismo patrón que Shopify) ────────────────────────────────

function crearState(extra) {
  const payload = Buffer.from(JSON.stringify({ ...extra, ts: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verificarState(state) {
  if (!state) return null;
  const dot = state.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = crypto.createHmac('sha256', CLIENT_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() - data.ts > 10 * 60 * 1000) return null; // 10 min expiry
    return data;
  } catch { return null; }
}

// ── Iniciar OAuth ───────────────────────────────────────────────────────────
// GET /auth/tiendanube — redirige al merchant a Tiendanube para autorizar
router.get('/', (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send('Faltan TIENDANUBE_CLIENT_ID y TIENDANUBE_CLIENT_SECRET.');
  }

  const state = crearState({ src: 'tiendanube' });

  const authUrl =
    `https://www.tiendanube.com/apps/${CLIENT_ID}/authorize` +
    `?state=${encodeURIComponent(state)}`;

  res.redirect(authUrl);
});

// ── Callback OAuth ──────────────────────────────────────────────────────────
// GET /auth/tiendanube/callback — Tiendanube redirige acá con el código
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // 1. Verificar state firmado
  const stateData = verificarState(state);
  if (!stateData) {
    console.error('[tiendanube/auth] State inválido o expirado');
    return res.redirect('/admin/login?error=invalid_state');
  }

  if (!code) {
    return res.redirect('/admin/login?error=missing_code');
  }

  try {
    // 2. Intercambiar código por access token
    const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const storeId = String(tokenData.user_id);

    if (!accessToken || !storeId) {
      console.error('[tiendanube/auth] Token response inválido:', tokenData);
      return res.redirect('/admin/login?error=token_failed');
    }

    // 3. Obtener info de la tienda
    const storeInfo = await tiendanube.getStoreInfo(storeId, accessToken);
    const domain = storeInfo.originalDomain || storeInfo.domain || `tn-${storeId}.tiendanube.com`;

    // 4. Guardar / actualizar la tienda en la DB
    const savedShop = await prisma.shop.upsert({
      where: { domain },
      update: {
        accessToken,
        tiendanubeStoreId: storeId,
        shopName: storeInfo.name || domain,
        email: storeInfo.email || null,
        platform: 'tiendanube',
      },
      create: {
        domain,
        accessToken,
        tiendanubeStoreId: storeId,
        shopName: storeInfo.name || domain,
        email: storeInfo.email || null,
        platform: 'tiendanube',
      },
    });

    // 5. Si hay un usuario logueado, vincularlo a esta tienda
    let linkUserId = req.session.userId || null;
    if (!linkUserId && req.session.userEmail) {
      const foundUser = await prisma.user.findUnique({
        where: { email: req.session.userEmail },
      });
      if (foundUser) {
        linkUserId = foundUser.id;
        req.session.userId = foundUser.id;
        req.session.userRole = foundUser.role;
      }
    }

    if (linkUserId) {
      await prisma.userShop.upsert({
        where: { userId_shopDomain: { userId: linkUserId, shopDomain: domain } },
        update: {},
        create: { userId: linkUserId, shopDomain: domain },
      });
    }

    // 6. Crear sesión de admin
    req.session.adminLoggedIn = true;
    req.session.shopDomain = domain;
    req.session.shopId = savedShop.id;
    req.session.shopName = savedShop.shopName;

    console.log(`✅ Tiendanube autenticado: ${domain} (store ${storeId})`);

    // 7. Widget script: se instala automáticamente via Partners Portal (auto-installed)
    // No se inyecta via API — Tiendanube lo carga con ?store={storeId}

    // 8. Redirigir al panel admin
    res.redirect('/admin/');

  } catch (err) {
    console.error('[tiendanube/auth] Error en OAuth callback:', err);
    res.redirect('/admin/login?error=server_error');
  }
});

module.exports = router;
