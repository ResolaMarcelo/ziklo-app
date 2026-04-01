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
      return res.json({ enabled: false, benefitType: 'discount', benefitValue: '10' });
    }

    const [record, shopRecord, primerPlan] = await Promise.all([
      prisma.productSubscription.findUnique({
        where: { shopDomain_productId: { shopDomain: shop, productId: String(productId) } },
      }),
      prisma.shop.findUnique({ where: { domain: shop } }),
      prisma.plan.findFirst({
        where: { shopDomain: shop, activo: true },
        orderBy: { createdAt: 'asc' },
        select: { beneficios: true },
      }),
    ]);

    res.json({
      enabled:       record?.enabled ?? false,
      benefitType:   record?.benefitType  || shopRecord?.subBenefitType  || 'discount',
      benefitValue:  record?.benefitValue || shopRecord?.subBenefitValue || '10',
      widgetTitle:       shopRecord?.widgetTitle       || '',
      widgetChips:       shopRecord?.widgetChips       || '',
      widgetBtnText:     shopRecord?.widgetBtnText     || '',
      widgetAccentColor: shopRecord?.widgetAccentColor || '',
      widgetBgColor:     shopRecord?.widgetBgColor     || '',
      widgetTextColor:   shopRecord?.widgetTextColor   || '',
      beneficios:        primerPlan?.beneficios || null,
    });
  } catch (err) {
    // En caso de error, no bloquear el widget — devolver enabled: false
    console.error('products/check error:', err.message);
    res.json({ enabled: false });
  }
});

// GET /api/products/recommendations — recomendaciones de upsell (público)
router.get('/recommendations', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  try {
    const { shop, productId } = req.query;
    if (!shop || !productId) {
      return res.json({ recommendations: [] });
    }

    const recs = await prisma.productRecommendation.findMany({
      where: { shopDomain: shop, sourceProductId: String(productId) },
      orderBy: { position: 'asc' },
      select: {
        targetProductId: true,
        targetTitle:     true,
        targetImage:     true,
        targetPrice:     true,
        targetVariantId: true,
      },
    });

    res.json({
      recommendations: recs.map(r => ({
        productId: r.targetProductId,
        title:     r.targetTitle,
        image:     r.targetImage,
        price:     r.targetPrice,
        variantId: r.targetVariantId,
      })),
    });
  } catch (err) {
    console.error('products/recommendations error:', err.message);
    res.json({ recommendations: [] });
  }
});

// GET /api/products/enabled — cuántos productos tienen suscripciones activas (admin)
router.get('/enabled', async (req, res) => {
  try {
    const shopDomain = req.shop?.domain || req.session?.shopDomain || null;
    const count = await prisma.productSubscription.count({
      where: { shopDomain, enabled: true },
    });
    res.json({ count });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

module.exports = router;
