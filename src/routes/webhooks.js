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

  // En producción: rechazar si el secret es el default o está vacío
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'mi_clave_secreta_webhooks_123') {
      console.error('[webhook/mp] FATAL: MP_WEBHOOK_SECRET no configurado o es el valor por defecto en producción — rechazando request');
      return false;
    }
  } else {
    // En desarrollo: omitir verificación si no hay secret configurado
    if (!secret || secret === 'mi_clave_secreta_webhooks_123') {
      console.warn('[webhook/mp] MP_WEBHOOK_SECRET no configurado — omitiendo verificación HMAC');
      return true;
    }
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
      // El middleware de Prisma desencripta automáticamente los tokens
      return await prisma.shop.findUnique({ where: { domain: sub.shopDomain } });
    }

    // Notificación de pago
    if (type === 'payment' && data?.id) {
      // Necesitamos un mpAccessToken para consultar el pago. Buscamos entre los
      // shops que tienen MP conectado hasta encontrar uno cuyo token funcione.
      const shops = await prisma.shop.findMany({
        where: { mpAccessToken: { not: null } },
        select: { mpAccessToken: true },
      });

      let pago = null;
      for (const s of shops) {
        try {
          pago = await mp.getPago(data.id, s.mpAccessToken);
          break;
        } catch {
          // Token de otro shop — no tiene acceso a este pago
        }
      }
      if (!pago) {
        console.error('[webhook/mp] No se pudo consultar pago', data.id, '— ningún shop tiene acceso');
        return;
      }
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
          if (!shop || !shop.accessToken) {
            console.error('[webhook/mp] Shop no encontrado o sin accessToken para sub:', sub.id, '— no se puede procesar pago aprobado');
            return;
          }
          const shopifyToken = shop.accessToken;
          const shopDomain   = shop.domain;

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

          // Crear orden en Shopify usando GraphQL
          if (sub.variantId) {
            try {
              const envio = sub.datosEnvio ? JSON.parse(sub.datosEnvio) : null;
              const orden = await shopify.createOrder(shopDomain, shopifyToken, {
                customerId: sub.shopifyCustomerId,
                email:      sub.shopifyCustomerEmail,
                lineItems:  [{ variant_id: sub.variantId, quantity: sub.qty || 1 }],
                note: `Pago automático suscripción ${sub.plan.nombre} - MP ID: ${pago.id}`,
                tags: 'suscripcion,mp-auto',
                shippingAddress: envio ? {
                  first_name: envio.nombre, last_name: envio.apellido,
                  address1: envio.direccion, city: envio.ciudad,
                  province: envio.provincia, zip: envio.cp, country: 'AR',
                  phone: envio.telefono,
                } : null,
              });
              if (orden?.id) {
                console.log('Orden Shopify creada:', orden.id, '- #' + orden.orderNumber);
                await prisma.pago.update({
                  where: { mpPaymentId: String(pago.id) },
                  data: {
                    shopifyOrderId:     String(orden.id),
                    shopifyOrderNumber: orden.orderNumber,
                  },
                });
              } else {
                console.log('Orden Shopify creada sin ID en respuesta');
              }
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
          if (!shop || !shop.domain) {
            console.error('[webhook/mp] Shop no encontrado para sub:', sub.id, '— no se puede obtener storeName para email de pago fallido');
            return;
          }
          const shopDomain = shop.domain;
          const shopToken  = shop.accessToken || null;
          const shopInfo   = shopToken ? await shopify.getShopInfo(shopDomain, shopToken).catch(() => null) : null;
          const storeName  = shopInfo?.name || shopDomain;

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
          if (!shop || !shop.domain) {
            console.error('[webhook/mp] Shop no encontrado para sub:', sub.id, '— no se puede enviar email de confirmación');
            return;
          }
          const shopDomain = shop.domain;
          const shopToken  = shop.accessToken || null;
          const shopInfo   = shopToken ? await shopify.getShopInfo(shopDomain, shopToken).catch(() => null) : null;
          const storeName  = shopInfo?.name || shopDomain;
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

// POST /webhooks/app-uninstalled — merchant desinstala la app
router.post('/app-uninstalled', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verificarHMACShopify(req)) {
    console.warn('[app/uninstalled] HMAC inválido');
    return res.status(401).send('Unauthorized');
  }

  res.status(200).send('OK'); // Responder rápido a Shopify

  try {
    const body = JSON.parse(req.body.toString());
    const domain = body.myshopify_domain;
    if (!domain) return console.warn('[app/uninstalled] Sin myshopify_domain en body');

    console.log(`[app/uninstalled] Tienda desinstalada: ${domain}`);

    // Obtener shop para tener el mpAccessToken antes de invalidar
    const shop = await prisma.shop.findUnique({ where: { domain } });

    // Cancelar preaprobaciones activas en Mercado Pago (para que no sigan cobrando)
    if (shop?.mpAccessToken) {
      const activeSubs = await prisma.subscription.findMany({
        where: { shopDomain: domain, status: 'authorized' },
        select: { id: true, mpPreapprovalId: true, shopifyCustomerEmail: true },
      });

      for (const sub of activeSubs) {
        try {
          const resp = await fetch(`https://api.mercadopago.com/preapproval/${sub.mpPreapprovalId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${shop.mpAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'cancelled' }),
          });
          if (resp.ok) {
            console.log(`[app/uninstalled] ✅ Preaprobación ${sub.mpPreapprovalId} cancelada en MP`);
          } else {
            console.warn(`[app/uninstalled] ⚠ MP cancelar ${sub.mpPreapprovalId}: HTTP ${resp.status}`);
          }
        } catch (e) {
          console.error(`[app/uninstalled] ❌ Error cancelando MP preapproval ${sub.mpPreapprovalId}:`, e.message);
        }
      }
    } else {
      console.warn(`[app/uninstalled] ${domain}: sin mpAccessToken, no se pueden cancelar preaprobaciones en MP`);
    }

    // Invalidar access token
    await prisma.shop.update({
      where: { domain },
      data: { accessToken: null },
    });

    // Marcar suscripciones como canceladas (ya se cancelaron en MP)
    const { count } = await prisma.subscription.updateMany({
      where: { shopDomain: domain, status: 'authorized' },
      data: { status: 'cancelled' },
    });

    console.log(`[app/uninstalled] ${domain}: token invalidado, ${count} suscripciones canceladas`);
  } catch (err) {
    console.error('[app/uninstalled] Error:', err.message);
  }
});

// POST /webhooks/products-update — Shopify avisa que un producto cambió de precio
router.post('/products-update', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verificarHMACShopify(req)) {
    console.warn('[products/update] HMAC inválido');
    return res.status(401).send('Unauthorized');
  }

  res.status(200).send('OK');

  try {
    const product = JSON.parse(req.body.toString());
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const productId  = String(product.id);

    if (!shopDomain || !productId) return;

    // Buscar suscripciones activas vinculadas a este producto
    const subs = await prisma.subscription.findMany({
      where: {
        shopDomain,
        productId,
        status: { in: ['authorized', 'pending'] },
      },
      include: { plan: true },
    });

    if (subs.length === 0) return;

    // Obtener el shop para el token de MP y el beneficio configurado
    const [shop, productConfig] = await Promise.all([
      prisma.shop.findUnique({ where: { domain: shopDomain } }),
      prisma.productSubscription.findUnique({
        where: { shopDomain_productId: { shopDomain, productId } },
      }),
    ]);
    if (!shop?.mpAccessToken) return;

    // Armar mapa de variantes → precio
    const variantPrices = {};
    for (const v of (product.variants || [])) {
      variantPrices[String(v.id)] = parseFloat(v.price);
    }
    // Si no hay variantes, usar el precio del primer variant (precio base)
    const precioBase = product.variants?.[0] ? parseFloat(product.variants[0].price) : null;

    // Beneficio: config por producto > config global del shop
    const benefitType  = productConfig?.benefitType  || shop.subBenefitType  || 'discount';
    const benefitValue = parseFloat(productConfig?.benefitValue || shop.subBenefitValue) || 0;

    function aplicarDescuento(precio) {
      if (benefitType === 'discount' && benefitValue > 0) {
        return Math.round(precio * (1 - benefitValue / 100) * 100) / 100;
      }
      return precio;
    }

    let updated = 0;
    for (const sub of subs) {
      const precioVariante = sub.variantId ? variantPrices[sub.variantId] : precioBase;
      if (!precioVariante) continue;

      const qty        = sub.qty || 1;
      const nuevoMonto = aplicarDescuento(precioVariante * qty);

      // Si el monto no cambió, no hacer nada
      if (sub.plan && Math.abs(sub.plan.monto - nuevoMonto) < 0.01) continue;

      try {
        // Actualizar plan en DB
        await prisma.plan.update({
          where: { id: sub.planId },
          data:  { monto: nuevoMonto },
        });

        // Actualizar preapproval en MP
        await mp.actualizarMontoPreapproval(sub.mpPreapprovalId, nuevoMonto, shop.mpAccessToken);
        updated++;
        console.log(`[products/update] Sub ${sub.id}: $${sub.plan.monto} → $${nuevoMonto}`);
      } catch (err) {
        console.error(`[products/update] Error actualizando sub ${sub.id}:`, err.message);
      }
    }

    if (updated > 0) {
      console.log(`[products/update] ${shopDomain}: ${updated} suscripciones actualizadas para producto ${productId}`);
    }
  } catch (err) {
    console.error('[products/update] Error:', err.message);
  }
});

// POST /webhooks/gdpr/customers-data — cliente pide ver sus datos
router.post('/gdpr/customers-data', express.raw({ type: '*/*' }), async (req, res) => {
  if (!verificarHMACShopify(req)) {
    console.warn('GDPR customers/data_request: HMAC inválido');
    return res.status(401).send('Unauthorized');
  }

  res.sendStatus(200);

  try {
    const body = JSON.parse(req.body.toString());
    const { shop_domain, customer, orders_requested } = body;
    const customerEmail = customer?.email;
    console.log(`GDPR data_request — shop: ${shop_domain} | customer: ${customerEmail}`);

    if (!customerEmail || !shop_domain) return;

    // Recopilar todos los datos que tenemos del cliente
    const suscripciones = await prisma.subscription.findMany({
      where: { shopDomain: shop_domain, shopifyCustomerEmail: customerEmail },
      include: { plan: true, pagos: true, cancelReasons: true },
    });

    const datosCliente = {
      solicitud: 'customers/data_request',
      shop: shop_domain,
      customer_email: customerEmail,
      customer_id: customer?.id,
      orders_requested: orders_requested || [],
      datos_almacenados: suscripciones.map(sub => ({
        subscription_id: sub.id,
        status: sub.status,
        plan: sub.plan?.nombre,
        datos_envio: sub.datosEnvio ? JSON.parse(sub.datosEnvio) : null,
        fecha_inicio: sub.startDate,
        pagos: sub.pagos.map(p => ({
          id: p.id,
          monto: p.monto,
          status: p.status,
          fecha: p.createdAt,
        })),
        motivos_cancelacion: sub.cancelReasons.map(r => ({
          razon: r.reason,
          fecha: r.createdAt,
        })),
      })),
    };

    // Logueamos los datos recopilados — Shopify no requiere envío automático,
    // pero sí que la app pueda recopilarlos para entregarlos si se solicitan.
    console.log(`GDPR data_request: datos recopilados para ${customerEmail}:`, JSON.stringify(datosCliente, null, 2));
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

    if (!customer?.email || !shop_domain) return;

    // Anonimizar suscripciones (no borramos para mantener integridad financiera de pagos)
    const { count } = await prisma.subscription.updateMany({
      where: { shopDomain: shop_domain, shopifyCustomerEmail: customer.email },
      data: {
        shopifyCustomerEmail: 'redacted@removed.invalid',
        shopifyCustomerId:    'REDACTED',
        datosEnvio:           null,
      },
    });

    // Borrar magic tokens del cliente en esa tienda
    await prisma.magicToken.deleteMany({
      where: { email: customer.email, shopDomain: shop_domain },
    });

    console.log(`GDPR: ${count} suscripciones anonimizadas + tokens eliminados para ${customer.email} en ${shop_domain}`);
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

    if (!shop_domain) return;

    // Borrar en orden para respetar foreign keys
    const subs = await prisma.subscription.findMany({
      where:  { shopDomain: shop_domain },
      select: { id: true },
    });
    const subIds = subs.map(s => s.id);

    if (subIds.length > 0) {
      // 1. CancelReasons (FK → Subscription)
      await prisma.cancelReason.deleteMany({ where: { subscriptionId: { in: subIds } } });
      // 2. Pagos (FK → Subscription)
      await prisma.pago.deleteMany({ where: { subscriptionId: { in: subIds } } });
    }

    // 3. Suscripciones
    await prisma.subscription.deleteMany({ where: { shopDomain: shop_domain } });

    // 4. Magic tokens de esa tienda
    await prisma.magicToken.deleteMany({ where: { shopDomain: shop_domain } });

    // 5. Productos con suscripción activada
    await prisma.productSubscription.deleteMany({ where: { shopDomain: shop_domain } });

    // 6. Planes del shop
    await prisma.plan.deleteMany({ where: { shopDomain: shop_domain } });

    // 7. Relación usuario-tienda
    await prisma.userShop.deleteMany({ where: { shopDomain: shop_domain } });

    // 8. Registro del shop
    await prisma.shop.deleteMany({ where: { domain: shop_domain } });

    console.log(`GDPR: todos los datos de ${shop_domain} eliminados (subs, pagos, planes, tokens, productos, userShop, shop)`);
  } catch (err) {
    console.error('Error GDPR shop-redact:', err.message);
  }
});

module.exports = router;
