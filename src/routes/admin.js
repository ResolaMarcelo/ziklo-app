const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const shopify = require('../services/shopify');

// ── Rutas públicas (sin auth) ──────────────────────────────────────────────

// GET /admin/login — página de login
router.get('/login', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin/');
  }
  res.sendFile(path.join(__dirname, '../../public/admin/login.html'));
});

// POST /admin/api/login — valida credenciales y abre sesión
router.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'ziklo2024';

  // Comparación segura para evitar timing attacks
  const userOk = crypto.timingSafeEqual(
    Buffer.from(username || ''),
    Buffer.from(validUser)
  );
  const passOk = crypto.timingSafeEqual(
    Buffer.from(password || ''),
    Buffer.from(validPass)
  );

  if (userOk && passOk) {
    req.session.adminLoggedIn = true;
    req.session.adminUser = validUser;
    return res.json({ ok: true });
  }

  return res.status(401).json({ error: 'Credenciales incorrectas' });
});

// ── Rutas protegidas (requieren sesión — middleware en app.js) ─────────────

// POST /admin/api/logout
router.post('/api/logout', (req, res) => {
  req.session = null; // cookie-session: vaciar la sesión
  res.json({ ok: true });
});

// GET /admin/api/shop — nombre e info de la tienda
router.get('/api/shop', async (req, res) => {
  try {
    const data = await shopify.shopifyRequest('/shop.json');
    res.json({ name: data.shop.name, domain: data.shop.domain, email: data.shop.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/api/widget-code — contenido actual del widget
router.get('/api/widget-code', (req, res) => {
  const filePath = path.join(__dirname, '../../public/widget-shopify.html');
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

// GET /admin/api/me — info de la sesión actual
router.get('/api/me', (req, res) => {
  res.json({ user: req.session.adminUser || 'admin' });
});

// Sirve el panel admin (HTML estático que consume la API)
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/index.html'));
});

module.exports = router;
