const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// ── Webhooks de privacidad requeridos por Tiendanube ────────────────────────
// Estos endpoints son obligatorios para publicar la app

// POST /api/tiendanube/webhooks/store-redact
// Eliminar todos los datos de una tienda que desinstaló la app
router.post('/store-redact', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const storeId = String(body.store_id || body.id || '');

    if (!storeId) {
      console.warn('[tiendanube/webhook] store-redact sin store_id');
      return res.status(200).json({ ok: true });
    }

    console.log(`[tiendanube/webhook] store-redact para store ${storeId}`);

    // Buscar tienda por tiendanubeStoreId
    const shop = await prisma.shop.findFirst({
      where: { tiendanubeStoreId: storeId },
    });

    if (shop) {
      // Eliminar en orden por dependencias FK
      await prisma.cancelReason.deleteMany({ where: { subscription: { shopDomain: shop.domain } } });
      await prisma.pago.deleteMany({ where: { subscription: { shopDomain: shop.domain } } });
      await prisma.subscription.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.plan.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.productSubscription.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.productRecommendation.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.magicToken.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.auditLog.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.userShop.deleteMany({ where: { shopDomain: shop.domain } });
      await prisma.shop.delete({ where: { domain: shop.domain } });

      console.log(`[tiendanube/webhook] Datos eliminados para store ${storeId} (${shop.domain})`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[tiendanube/webhook] Error en store-redact:', err.message);
    // Responder 200 para evitar reintentos
    res.status(200).json({ ok: true });
  }
});

// POST /api/tiendanube/webhooks/customers-redact
// Anonimizar datos de un cliente específico
router.post('/customers-redact', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const storeId = String(body.store_id || '');
    const customerEmail = body.customer?.email || body.email || '';

    if (!storeId || !customerEmail) {
      console.warn('[tiendanube/webhook] customers-redact sin store_id o email');
      return res.status(200).json({ ok: true });
    }

    console.log(`[tiendanube/webhook] customers-redact para ${customerEmail} en store ${storeId}`);

    const shop = await prisma.shop.findFirst({
      where: { tiendanubeStoreId: storeId },
    });

    if (shop) {
      // Anonimizar suscripciones de este cliente
      await prisma.subscription.updateMany({
        where: {
          shopDomain: shop.domain,
          shopifyCustomerEmail: customerEmail,
        },
        data: {
          shopifyCustomerEmail: 'redacted@removed.invalid',
          shopifyCustomerId: 'redacted',
          datosEnvio: null,
        },
      });

      // Eliminar magic tokens de este email
      await prisma.magicToken.deleteMany({
        where: { email: customerEmail, shopDomain: shop.domain },
      });

      console.log(`[tiendanube/webhook] Cliente ${customerEmail} anonimizado en store ${storeId}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[tiendanube/webhook] Error en customers-redact:', err.message);
    res.status(200).json({ ok: true });
  }
});

// POST /api/tiendanube/webhooks/customers-data-request
// Devolver datos almacenados de un cliente
router.post('/customers-data-request', async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const storeId = String(body.store_id || '');
    const customerEmail = body.customer?.email || body.email || '';

    if (!storeId || !customerEmail) {
      return res.status(200).json({ ok: true, data: [] });
    }

    console.log(`[tiendanube/webhook] customers-data-request para ${customerEmail} en store ${storeId}`);

    const shop = await prisma.shop.findFirst({
      where: { tiendanubeStoreId: storeId },
    });

    if (!shop) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const subscriptions = await prisma.subscription.findMany({
      where: {
        shopDomain: shop.domain,
        shopifyCustomerEmail: customerEmail,
      },
      include: { pagos: true, plan: true },
    });

    const customerData = subscriptions.map(sub => ({
      subscriptionId: sub.id,
      plan: sub.plan?.nombre,
      status: sub.status,
      email: sub.shopifyCustomerEmail,
      payments: sub.pagos.map(p => ({
        amount: p.monto,
        status: p.status,
        date: p.createdAt,
      })),
    }));

    console.log(`[tiendanube/webhook] ${customerData.length} suscripciones encontradas para ${customerEmail}`);

    res.status(200).json({ ok: true, data: customerData });
  } catch (err) {
    console.error('[tiendanube/webhook] Error en customers-data-request:', err.message);
    res.status(200).json({ ok: true, data: [] });
  }
});

module.exports = router;
