const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const shopify = require('../services/shopify');

// ── Rutas públicas (sin auth) ──────────────────────────────────────────────

// GET /admin/login — página de login con OAuth Shopify
router.get('/login', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin/');
  }
  res.sendFile(path.join(__dirname, '../../public/admin/login.html'));
});

// GET /admin/api/login-status — estado de sesión (público para que login.html lo chequee)
router.get('/api/login-status', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.json({
      loggedIn: true,
      shopDomain: req.session.shopDomain,
      shopName: req.session.shopName,
    });
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
