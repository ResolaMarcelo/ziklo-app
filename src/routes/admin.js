const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const shopify = require('../services/shopify');

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

// Sirve el panel admin (HTML estático que consume la API)
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/index.html'));
});

module.exports = router;
