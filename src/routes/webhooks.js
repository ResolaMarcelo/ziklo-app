const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const prisma  = require('../lib/prisma');
const mp      = require('../services/mercadopago');
const shopify = require('../services/shopify');
const email   = require('../services/email');
const klaviyo = require('../services/klaviyo');
const { registrarCobro } = require('../lib/billing');

// ─────────────────────────────────────────────────────────────────────────────
// Verificación HMAC de webhooks de Mercado Pago
//
// MP envía en el header "x-signature":  ts=<timestamp>,v1=<hash>
// y en "x-request-id": un UUID de la request.
//
// El mensaje a firmar es:  "id:<data.id>;request-id:<x-request-id>;ts:<ts>"
// firmado con HMAC-SHA256 usando el "Secret key" del webhook configurado en
// https://www.mercadopago.com.ar/developers → Tus integraciones → Webhooks
// ─────────────────────────────────────────────────────────────────────────────
function verificarHMACMercadoPago(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;

  // Si no hay secret configurado, logueamos advertencia pero dejamos pasar
  // (para no romper en desarrollo donde no está configurado)
  if (!secret || secret === 'mi_clave_secreta_webhooks_123') {
    console.warn('[webhook/mp] MP_WEBHOOK_SECRET no configurado — omitiendo verificación HMAC');
    return true;
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  if (!xSignature) {
    console.warn('[webhook/mp] Header x-signature ausente');
    return false;
  }

  // Parsear "ts=...,v1=..."
  const parts = {};
  xSignature.split(',').forEach(part => {
    const [k, v] = part.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  });

  const { ts, v1 } = parts;
  if (!ts || !v1) {
    console.warn('[webhook/mp] x-signature mal formado:', xSignature);
    return false;
  }

  // Obtener data.id del body
  let dataId = '';
  try {
    const body = req.body instanceof Buffer ? JSON.parse(req.body.toString()) : req.body;
    dataId = body?.data?.id || '';
  } catch { /* ignorar */ }

  // Construir el mensaje a firmar
  const manifest = `id:${dataId};request-id:${xRequestId || ''};ts:${ts}`;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(v1)
  );

  if (!valid) {
    console.warn('[webhook/mp] HMAC inválido — posible request falsa rechazada');
    console.warn('  manifest:', manifest);
  }

  return valid;
}

// POST /webhooks/mp - recibir notificaciones de Mercado Pago
router.post('/mp', async (req, res) => {
  // Verificar firma HMAC antes de procesar cualquier cosa
  if (!verificarHMACMercadoPago(req)) {
    return res.sendStatus(401);
  }

  // Responder 200 inmediatamente para que MP no reintente
  res.sendStatus(200);

  try {
    let body;
    try {
      body = JSON.parse(req.body.toString());
    } catch {
      body = req.body;
    }

    const { type, data } = body;
    console.log('Webhook MP recibido:', type, data?.id);

    // Helper: carga el shop de una suscripción para obtener sus tokens
    async function getShopForSub(sub) {
      if (!sub?.shopDomain) return null;
      return prisma.shop.findUnique({ where: { domain: sub.shopDomain } });
    }

    // Notificación de pago
    if (type === 'payment' && data?.id) {
      // Primero buscamos la sub para saber de qué shop es y usar su token de MP
      // Como no sabemos el preapproval aún, usamos el token de env como fallback inicial
      const pago = await mp.getPago(data.id);
      console.log('Pago ID:', pago.id, '| Status:', pago.status, '| Preapproval:', pago.preapproval_id);

      if (pago.preapproval_id) {
        const sub = await prisma.subscription.findUnique({
          where: { mpPreapprovalId: pago.preapproval_id },
          include: { plan: true },
        });

        if (!sub) {
          console.log('Suscripción no encontrada para preapproval:', pago.preapproval_id);
          return;
        }

        // Cargar el shop para usar sus tokens propios
        const shop = await getShopForSub(sub);

        // Registrar el pago en BD
        await prisma.pago.upsert({
          where:  { mpPaymentId: String(pago.id) },
          update: { status: pago.status },
          create: {
            mpPaymentId:    String(pago.id),
            monto:          pago.transaction_amount,
            status:         pago.status,
            subscriptionId: sub.id,
          },
        });

        // ── Pago aprobado ─────────────────────────────────────────────────────
        if (pago.status === 'approved') {
          const shopifyToken = shop?.accessToken  || process.env.SHOPIFY_ACCESS_TOKEN;
          const shopDomain   = shop?.domain       || process.env.SHOPIFY_SHOP_DOMAIN;

          // Registrar cobro en contador de billing (fire and forget)
          if (shopDomain) registrarCobro(prisma, shopDomain).catch(() => {});

          // Marcar suscripción como activa y guardar fecha próximo cobro
          try {
            const mpToken = shop?.mpAccessToken || null;
            const preapproval = await mp.getPreapproval(sub.mpPreapprovalId, mpToken);
            await prisma.subscription.update({
              where: { id: sub.id },
              data: {
                status: 'authorized',
                nextChargeDate: preapproval?.next_payment_date
                  ? new Date(preapproval.next_payment_date)
                  : null,
              },
            });
          } catch {
            // Si falla la consulta a MP, igual marcamos authorized
            await prisma.subscription.update({
              where: { id: sub.id },
              data:  { status: 'authorized' },
            });
          }

          // Klaviyo: evento de pago aprobado
          klaviyo.subscriptionRenewed(shop, sub, {
            monto: pago.transaction_amount,
            mpPaymentId: String(pago.id),
          }).catch(() => {});

          // Crear orden en Shopify usando el token del shop correcto
          if (sub.variantId) {
            try {
              const envio = sub.datosEnvio ? JSON.parse(sub.datosEnvio) : null;
              const orden = await shopify.shopifyRequestForShop(
                shopDomain, shopifyToken, '/orders.json', 'POST',
                {
                  order: {
                    customer:   { id: sub.shopifyCustomerId },
                    email:      sub.shopifyCustomerEmail,
                    line_items: [{ variant_id: sub.variantId, quantity: sub.qty || 1 }],
                    financial_status: 'paid',
                    note: `Pago automático suscripción ${sub.plan.nombre} - MP ID: ${pago.id}`,
                    tags: 'suscripcion,mp-auto',
                    ...(envio ? { shipping_address: {
                      first_name: envio.nombre, last_name: envio.apellido,
                      address1: envio.direccion, city: envio.ciudad,
                      province: envio.provincia, zip: envio.cp, country: 'AR',
                      phone: envio.telefono,
                    }} : {}),
                  },
                }
              );
              console.log('Orden Shopify creada:', orden?.order?.id);
            } catch (err) {
              console.error('Error al crear orden Shopify:', err.message);
            }
          }
        }

        // ── Pago rechazado / cancelado ────────────────────────────────────────
        if (pago.status === 'rejected' || pago.status === 'cancelled') {
          // Marcar suscripción como pago fallido
          await prisma.subscription.update({
            where: { id: sub.id },
            data:  { status: 'payment_failed' },
          });

          // Obtener nombre de la tienda para los emails
          const shopDomain = shop?.domain || process.env.SHOPIFY_SHOP_DOMAIN;
          const shopToken  = shop?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
          const shopData   = await shopify.shopifyRequestForShop(shopDomain, shopToken, '/shop.json').catch(() => null);
          const storeName  = shopData?.shop?.name || process.env.STORE_NAME || shopDomain;

          // Email al cliente
          try {
            const nombre = sub.datosEnvio ? JSON.parse(sub.datosEnvio).nombre : null;
            await email.enviarPagoFallido({
              email:      sub.shopifyCustomerEmail,
              nombre,
              planNombre: sub.plan.nombre,
              monto:      sub.plan.monto,
              storeName,
            });
            console.log('Email pago fallido enviado al cliente:', sub.shopifyCustomerEmail);
          } catch (err) {
            console.error('Error enviando email pago fallido al cliente:', err.message);
          }

          // Email al merchant
          const merchantEmail = shop?.email || process.env.MERCHANT_EMAIL;
          if (merchantEmail) {
            try {
              await email.enviarPagoFallidoMerchant({
                merchantEmail,
                clientEmail: sub.shopifyCustomerEmail,
                planNombre:  sub.plan.nombre,
                monto:       sub.plan.monto,
                storeName,
              });
              console.log('Email pago fallido enviado al merchant:', merchantEmail);
            } catch (err) {
              console.error('Error enviando email pago fallido al merchant:', err.message);
            }
          }
        }
      }
    }

    // Notificación de cambio en preapproval (suscripción)
    if (type === 'subscription_preapproval' && data?.id) {
      const subs = await prisma.subscription.findMany({
        where:   { mpPreapprovalId: data.id },
        include: { plan: true },
      });

      // Obtener el preapproval usando el token del shop si está disponible
      const shop = subs.length > 0 ? await getShopForSub(subs[0]) : null;
      const mpToken = shop?.mpAccessToken || null;
      const preapproval = await mp.getPreapproval(data.id, mpToken);
      console.log('Preapproval actualizado:', preapproval.id, '| Status:', preapproval.status);

      await prisma.subscription.updateMany({
        where: { mpPreapprovalId: data.id },
        data:  { status: preapproval.status },
      });

      // Klaviyo: suscripción creada/activada
      if (preapproval.status === 'authorized' && subs.length > 0) {
        klaviyo.subscriptionCreated(shop, { ...subs[0], plan: subs[0].plan }).catch(() => {});
      }

      // Email de confirmación cuando se activa
      if (preapproval.status === 'authorized' && subs.length > 0) {
        const sub = subs[0];
        try {
          const shopDomain = shop?.domain || process.env.SHOPIFY_SHOP_DOMAIN;
          const shopToken  = shop?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
          const shopData   = await shopify.shopifyRequestForShop(shopDomain, shopToken, '/shop.json').catch(() => null);
          const storeName  = shopData?.shop?.name || process.env.STORE_NAME || shopDomain;
          await email.enviarConfirmacionSuscripcion({
            email:      sub.shopifyCustomerEmail,
            nombre:     sub.datosEnvio ? JSON.parse(sub.datosEnvio).nombre : null,
            planNombre: sub.plan.nombre,
            monto:      sub.plan.monto,
            storeName,
            shopDomain,
          });
          console.log('Email de confirmación enviado a:', sub.shopifyCustomerEmail);
        } catch (err) {
          console.error('Error enviando email de confirmación:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error procesando webhook:', err.message);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GDPR WEBHOOKS — obligatorios para Shopify App Store
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Verifica que el webhook venga realmente de Shopify usando HMAC-SHA256.
 * Shopify firma el body con el Client Secret y lo manda en X-Shopify-Hmac-Sha256.
 */
function verificarHMACShopify(req) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) return false;

  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!hmacHeader) return false;

  // El body debe llegar como raw Buffer (ya configurado con express.raw en app.js)
  const body = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
  const computed = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmacHeader));
}

// POST /webhooks/gdpr/customers-data — cliente pide ver sus datos
router.post('/gdpr/customers-data', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verificarHMACShopify(req)) {
    console.warn('GDPR customers/data_request: HMAC inválido');
    return res.status(401).send('Unauthorized');
  }

  res.sendStatus(200);

  try {
    const body = JSON.parse(req.body.toString());
    const { shop_domain, customer } = body;
    console.log(`GDPR data_request — shop: ${shop_domain} | customer: ${customer?.email}`);

    // Registrar la solicitud en los logs (en producción enviarías un email con los datos)
    // Por ahora solo logueamos; en una app completa deberías enviar los datos por email
  } catch (err) {
    console.error('Error GDPR customers-data:', err.message);
  }
});

// POST /webhooks/gdpr/customers-redact — borrar datos de un cliente
router.post('/gdpr/customers-redact', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verificarHMACShopify(req)) {
    console.warn('GDPR customers/redact: HMAC inválido');
    return res.status(401).send('Unauthorized');
  }

  res.sendStatus(200);

  try {
    const body = JSON.parse(req.body.toString());
    const { shop_domain, customer } = body;
    console.log(`GDPR customers/redact — shop: ${shop_domain} | customer: ${customer?.email}`);

    if (!customer?.email) return;

    // Anonimizar suscripciones del cliente (no borramos para mantener integridad financiera)
    await prisma.subscription.updateMany({
      where: { shopDomain: shop_domain, shopifyCustomerEmail: customer.email },
      data: {
        shopifyCustomerEmail: 'redacted@gdpr.ziklo',
        shopifyCustomerId:    'redacted',
        datosEnvio:           null,
      },
    });

    console.log(`GDPR: datos de ${customer.email} anonimizados en ${shop_domain}`);
  } catch (err) {
    console.error('Error GDPR customers-redact:', err.message);
  }
});

// POST /webhooks/gdpr/shop-redact — borrar todos los datos de una tienda
router.post('/gdpr/shop-redact', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verificarHMACShopify(req)) {
    console.warn('GDPR shop/redact: HMAC inválido');
    return res.status(401).send('Unauthorized');
  }

  res.sendStatus(200);

  try {
    const body = JSON.parse(req.body.toString());
    const { shop_domain } = body;
    console.log(`GDPR shop/redact — shop: ${shop_domain}`);

    // Borrar en orden para respetar foreign keys
    // 1. Pagos de las suscripciones del shop
    const subs = await prisma.subscription.findMany({
      where:  { shopDomain: shop_domain },
      select: { id: true },
    });
    const subIds = subs.map(s => s.id);

    if (subIds.length > 0) {
      await prisma.pago.deleteMany({ where: { subscriptionId: { in: subIds } } });
    }

    // 2. Suscripciones
    await prisma.subscription.deleteMany({ where: { shopDomain: shop_domain } });

    // 3. Planes del shop
    await prisma.plan.deleteMany({ where: { shopDomain: shop_domain } });

    // 4. Registro del shop
    await prisma.shop.deleteMany({ where: { domain: shop_domain } });

    console.log(`GDPR: todos los datos de ${shop_domain} eliminados`);
  } catch (err) {
    console.error('Error GDPR shop-redact:', err.message);
  }
});

module.exports = router;
