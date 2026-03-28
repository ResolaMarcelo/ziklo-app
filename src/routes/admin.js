const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const shopify = require('../services/shopify');
const prisma  = require('../lib/prisma');

// ── Rutas públicas (sin auth) ──────────────────────────────────────────────

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin/');
  }
  res.sendFile(path.join(__dirname, '../../public/admin/login.html'));
});

// POST /admin/api/login — usuario + contraseña desde env vars
router.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'ziklo2024';

  // Buffers de igual tamaño para timingSafeEqual
  const uBuf = Buffer.alloc(64); Buffer.from(username || '').copy(uBuf);
  const vBuf = Buffer.alloc(64); Buffer.from(validUser).copy(vBuf);
  const pBuf = Buffer.alloc(64); Buffer.from(password || '').copy(pBuf);
  const qBuf = Buffer.alloc(64); Buffer.from(validPass).copy(qBuf);

  const userOk = crypto.timingSafeEqual(uBuf, vBuf);
  const passOk = crypto.timingSafeEqual(pBuf, qBuf);

  if (userOk && passOk) {
    req.session.adminLoggedIn = true;
    req.session.adminUser     = validUser;
    // Para el flujo single-store, shopDomain viene del env var
    req.session.shopDomain    = process.env.SHOPIFY_SHOP_DOMAIN || null;
    return res.json({ ok: true });
  }

  return res.status(401).json({ error: 'Credenciales incorrectas' });
});

// GET /admin/api/login-status
router.get('/api/login-status', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.json({ loggedIn: true, shopName: req.session.shopName || null });
  }
  res.json({ loggedIn: false });
});

// ── Rutas protegidas (requieren sesión — middleware en app.js) ─────────────

// POST /admin/api/logout
router.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// GET /admin/api/me — info de la sesión actual
router.get('/api/me', (req, res) => {
  res.json({
    shopDomain: req.session.shopDomain || null,
    shopName:   req.session.shopName   || null,
    shopId:     req.session.shopId     || null,
  });
});

// GET /admin/api/shop — nombre e info de la tienda (desde Shopify API)
router.get('/api/shop', async (req, res) => {
  try {
    // Usar el token del shop en sesión si está disponible
    const token = req.session.shopToken || null;
    const domain = req.session.shopDomain || null;
    const data = await shopify.shopifyRequestForShop(domain, token, '/shop.json');
    res.json({ name: data.shop.name, domain: data.shop.domain, email: data.shop.email });
  } catch (err) {
    // Fallback: usar credenciales de env vars
    try {
      const data = await shopify.shopifyRequest('/shop.json');
      res.json({ name: data.shop.name, domain: data.shop.domain, email: data.shop.email });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
});

// GET /admin/api/status — integraciones del shop logueado
router.get('/api/status', async (req, res) => {
  // Si el shop está en DB, usar sus tokens; si no, fallback a env vars
  const shop = req.shop;
  res.json({
    shopify:     !!(shop?.accessToken || (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_SHOP_DOMAIN)),
    mercadopago: !!(shop?.mpAccessToken || process.env.MP_ACCESS_TOKEN),
    email:       !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

// POST /admin/api/mp-token — guardar token de Mercado Pago del shop
router.post('/api/mp-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token requerido' });

    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    // Upsert: crea el registro Shop si no existe aún
    await prisma.shop.upsert({
      where:  { domain: shopDomain },
      update: { mpAccessToken: token },
      create: {
        domain:       shopDomain,
        accessToken:  process.env.SHOPIFY_ACCESS_TOKEN || '',
        mpAccessToken: token,
        shopName:     shopDomain,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/api/mp-token — verificar si hay token de MP guardado
router.get('/api/mp-token', async (req, res) => {
  const shop = req.shop;
  res.json({
    configured: !!(shop?.mpAccessToken || process.env.MP_ACCESS_TOKEN),
    // Nunca exponemos el token completo, solo los últimos 4 chars como hint
    hint: shop?.mpAccessToken
      ? `****${shop.mpAccessToken.slice(-4)}`
      : process.env.MP_ACCESS_TOKEN
        ? `****${process.env.MP_ACCESS_TOKEN.slice(-4)}`
        : null,
  });
});

// GET /admin/api/widget-code — contenido actual del widget
router.get('/api/widget-code', (req, res) => {
  const filePath = path.join(__dirname, '../../public/widget-shopify.html');
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

// Sirve el panel admin (HTML estático que consume la API)
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/index.html'));
});

module.exports = router;
