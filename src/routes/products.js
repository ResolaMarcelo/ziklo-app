const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');

// GET /api/products/check — endpoint PÚBLICO
// Verifica si un producto tiene suscripciones activadas para un shop
// Query params: ?shop=domain.myshopify.com&productId=1234567890
router.get('/check', async (req, res) => {
  // Permitir CORS desde cualquier origen (necesario para el widget en la tienda Shopify)
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const { shop, productId } = req.query;

    if (!shop || !productId) {
      return res.json({ enabled: false });
    }

    const record = await prisma.productSubscription.findUnique({
      where: {
        shopDomain_productId: {
          shopDomain: shop,
          productId:  String(productId),
        },
      },
    });

    res.json({ enabled: record?.enabled ?? false });
  } catch (err) {
    // En caso de error, no bloquear el widget — devolver enabled: false
    console.error('products/check error:', err.message);
    res.json({ enabled: false });
  }
});

module.exports = router;
