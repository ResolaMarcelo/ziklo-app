const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const shopify     = require('../services/shopify');
const tiendanube  = require('../services/tiendanube');
const prisma  = require('../lib/prisma');
const { logAction } = require('../lib/auditLog');

// ── Rutas públicas (sin auth) ──────────────────────────────────────────────

// GET /admin/login
router.get('/login', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin/');
  }
  res.sendFile(path.join(__dirname, '../../public/admin/login.html'));
});

// POST /admin/api/login — deshabilitado (usar registro con email o Google OAuth)
router.post('/api/login', (_req, res) => {
  res.status(410).json({ error: 'Login legacy deshabilitado. Usá registro con email o Google.' });
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
  logAction(req, 'logout');
  req.session = null;
  res.json({ ok: true, redirect: '/admin/login' });
});

// GET /admin/api/me — info de la sesión actual
// También sincroniza el shopDomain desde UserShop si falta en sesión
router.get('/api/me', async (req, res) => {
  let shopDomain = req.session.shopDomain || null;
  let shopName   = req.session.shopName   || null;
  let shopId     = req.session.shopId     || null;

  // Si hay userId pero no shopDomain, intentar recuperarlo desde UserShop
  if (req.session.userId && !shopDomain) {
    try {
      const link = await prisma.userShop.findFirst({
        where: { userId: req.session.userId },
        include: { shop: true },
      });
      if (link?.shop) {
        shopDomain = link.shop.domain;
        shopName   = link.shop.shopName || link.shop.domain;
        shopId     = link.shop.id;
        req.session.shopDomain = shopDomain;
        req.session.shopName   = shopName;
        req.session.shopId     = shopId;
      }
    } catch (_) {}
  }

  res.json({
    shopDomain: shopDomain,
    shopName:   shopName,
    shopId:     shopId,
    userEmail:  req.session.userEmail  || null,
    userName:   req.session.userName   || null,
    userRole:   req.session.userRole   || null,
  });
});

// GET /admin/api/shop — nombre e info de la tienda (desde Shopify API)
router.get('/api/shop', async (req, res) => {
  const domain = req.session.shopDomain || null;

  if (!domain) {
    return res.status(400).json({ error: 'No hay tienda conectada en esta sesión' });
  }

  try {
    // Buscar el access token en la DB para este dominio específico
    const shopRecord = await prisma.shop.findUnique({ where: { domain } });
    const token = req.session.shopToken || shopRecord?.accessToken || null;

    if (!token) {
      return res.status(400).json({ error: 'Token de acceso no encontrado para esta tienda' });
    }

    const info = await shopify.getShopInfo(domain, token);
    res.json({ name: info.name, domain: info.domain, email: info.email });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /admin/api/status — integraciones del shop logueado
router.get('/api/status', async (req, res) => {
  const shop = req.shop;
  res.json({
    shopify:     !!(shop?.accessToken),
    mercadopago: !!(shop?.mpAccessToken),
    email:       !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    klaviyo:     !!(shop?.klaviyoAccessToken),
    shopDomain:  shop?.domain || null,
    platform:    shop?.platform || 'shopify',
  });
});

// POST /admin/api/disconnect-shop — desvincula la tienda actual del usuario
router.post('/api/disconnect-shop', async (req, res) => {
  const userId     = req.session?.userId;
  const shopDomain = req.session?.shopDomain;

  if (!userId || !shopDomain) {
    return res.status(400).json({ error: 'No hay tienda activa en sesión' });
  }

  try {
    await prisma.userShop.delete({
      where: { userId_shopDomain: { userId, shopDomain } },
    });

    logAction(req, 'disconnect_shop', { shopDomain });

    // Limpiar shopDomain de la sesión
    req.session.shopDomain = null;
    req.session.shopId     = null;
    req.session.shopName   = null;

    return res.json({ ok: true });
  } catch (err) {
    console.error(err); return res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// POST /admin/api/check-widget — verificar e instalar widget en Tiendanube
router.post('/api/check-widget', async (req, res) => {
  try {
    const shop = req.shop;
    if (!shop || shop.platform !== 'tiendanube') {
      return res.status(400).json({ error: 'Solo disponible para tiendas Tiendanube.' });
    }
    const storeId = shop.tiendanubeStoreId;
    const token   = shop.accessToken;
    if (!storeId || !token) {
      return res.status(400).json({ error: 'Falta storeId o token. Reconectá tu tienda.' });
    }
    // Verificar y si no existe, instalar automáticamente
    const result = await tiendanube.installWidgetScript(storeId, token);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('check-widget error:', err.message);
    return res.status(500).json({ error: err.message });
  }
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
        accessToken:  '',
        mpAccessToken: token,
        shopName:     shopDomain,
      },
    });

    logAction(req, 'update_mp_token');
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /admin/api/mp-token — verificar si hay token de MP guardado
router.get('/api/mp-token', async (req, res) => {
  const shop = req.shop;
  res.json({
    configured: !!shop?.mpAccessToken,
    // Nunca exponemos el token completo, solo los últimos 4 chars como hint
    hint: shop?.mpAccessToken
      ? `****${shop.mpAccessToken.slice(-4)}`
      : null,
  });
});

// GET /admin/api/subscription-benefit — beneficio global configurado para el shop
router.get('/api/subscription-benefit', (req, res) => {
  const shop = req.shop;
  res.json({
    benefitType:  shop?.subBenefitType  || 'discount',
    benefitValue: shop?.subBenefitValue || '10',
    widgetTitle:       shop?.widgetTitle       || '',
    widgetChips:       shop?.widgetChips       || '',
    widgetBtnText:     shop?.widgetBtnText     || '',
    widgetChipsVisible: shop?.widgetChipsVisible ?? true,
    widgetAccentColor: shop?.widgetAccentColor || '',
    widgetBgColor:     shop?.widgetBgColor     || '',
    widgetTextColor:   shop?.widgetTextColor   || '',
  });
});

// POST /admin/api/subscription-benefit — guardar beneficio global del shop
router.post('/api/subscription-benefit', async (req, res) => {
  try {
    const { benefitType, benefitValue, widgetTitle, widgetChips, widgetBtnText,
            widgetChipsVisible, widgetAccentColor, widgetBgColor, widgetTextColor } = req.body;
    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    const validTypes = ['discount', 'gift', 'free_shipping'];
    if (!validTypes.includes(benefitType)) {
      return res.status(400).json({ error: 'Tipo de beneficio inválido' });
    }

    // Validar colores hex si se proporcionan
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    const cleanColor = (v) => (v && hexRegex.test(v)) ? v : null;

    await prisma.shop.upsert({
      where:  { domain: shopDomain },
      update: {
        subBenefitType:    benefitType,
        subBenefitValue:   benefitValue  || '',
        widgetTitle:       widgetTitle   || null,
        widgetChips:       widgetChips   || null,
        widgetBtnText:     widgetBtnText || null,
        widgetChipsVisible: widgetChipsVisible !== false,
        widgetAccentColor: cleanColor(widgetAccentColor),
        widgetBgColor:     cleanColor(widgetBgColor),
        widgetTextColor:   cleanColor(widgetTextColor),
      },
      create: {
        domain:            shopDomain,
        accessToken:       '',
        subBenefitType:    benefitType,
        subBenefitValue:   benefitValue  || '',
        widgetTitle:       widgetTitle   || null,
        widgetChips:       widgetChips   || null,
        widgetBtnText:     widgetBtnText || null,
        widgetChipsVisible: widgetChipsVisible !== false,
        widgetAccentColor: cleanColor(widgetAccentColor),
        widgetBgColor:     cleanColor(widgetBgColor),
        widgetTextColor:   cleanColor(widgetTextColor),
      },
    });

    logAction(req, 'update_subscription_benefit', { benefitType, benefitValue });
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /admin/api/billing — plan y uso del mes corriente
const { getPlanInfo } = require('../lib/billing');
router.get('/api/billing', (req, res) => {
  const shop = req.shop;
  if (!shop) return res.status(400).json({ error: 'Sin tienda' });
  res.json(getPlanInfo(shop));
});

// GET /admin/api/retention-config — leer config de retención del shop
router.get('/api/retention-config', (req, res) => {
  const shop = req.shop;
  res.json({
    pauseEnabled:    shop?.retentionPauseEnabled    ?? false,
    discountEnabled: shop?.retentionDiscountEnabled ?? false,
    discountPct:     shop?.retentionDiscountPct     ?? 10,
    surveyEnabled:   shop?.retentionSurveyEnabled   ?? false,
    message:         shop?.retentionMessage         ?? '',
  });
});

// POST /admin/api/retention-config — guardar config de retención del shop
router.post('/api/retention-config', async (req, res) => {
  try {
    const { pauseEnabled, discountEnabled, discountPct, surveyEnabled, message } = req.body;
    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    await prisma.shop.upsert({
      where:  { domain: shopDomain },
      update: {
        retentionPauseEnabled:    !!pauseEnabled,
        retentionDiscountEnabled: !!discountEnabled,
        retentionDiscountPct:     discountPct ? parseInt(discountPct, 10) : null,
        retentionSurveyEnabled:   !!surveyEnabled,
        retentionMessage:         message || null,
      },
      create: {
        domain:                   shopDomain,
        accessToken:              '',
        retentionPauseEnabled:    !!pauseEnabled,
        retentionDiscountEnabled: !!discountEnabled,
        retentionDiscountPct:     discountPct ? parseInt(discountPct, 10) : null,
        retentionSurveyEnabled:   !!surveyEnabled,
        retentionMessage:         message || null,
      },
    });

    logAction(req, 'update_retention_config', { pauseEnabled, discountEnabled, surveyEnabled });
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /admin/api/widget-code — contenido actual del widget
router.get('/api/widget-code', (req, res) => {
  const filePath = path.join(__dirname, '../../public/widget-shopify.html');
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTOS — gestión de productos con suscripciones activadas
// ══════════════════════════════════════════════════════════════════════════════

// GET /admin/api/products — lista de productos (Shopify o Tiendanube) + estado de suscripción
router.get('/api/products', async (req, res) => {
  try {
    const shopDomain   = req.session?.shopDomain;
    const accessToken  = req.shop?.accessToken || null;
    const platform     = req.shop?.platform || 'shopify';

    if (!shopDomain || !accessToken) {
      return res.status(400).json({ error: 'No hay tienda en sesión' });
    }

    // Traer productos desde la plataforma correspondiente
    let platformProducts;
    try {
      if (platform === 'tiendanube') {
        const storeId = req.shop?.tiendanubeStoreId;
        if (!storeId) return res.status(400).json({ error: 'Store ID de Tiendanube no encontrado.' });
        platformProducts = await tiendanube.getProducts(storeId, accessToken);
      } else {
        platformProducts = await shopify.getProducts(shopDomain, accessToken);
      }
    } catch (apiErr) {
      if (apiErr.message && (apiErr.message.includes('403') || apiErr.message.includes('access'))) {
        const name = platform === 'tiendanube' ? 'Tiendanube' : 'Shopify';
        return res.status(400).json({ error: `El token de ${name} no tiene permiso para leer productos. Reconectá tu tienda via OAuth.` });
      }
      throw apiErr;
    }

    // Traer estados guardados en BD
    const dbRecords = await prisma.productSubscription.findMany({
      where: { shopDomain },
    });
    const dbMap = {};
    dbRecords.forEach(r => { dbMap[r.productId] = r; });

    const products = platformProducts.map(p => ({
      id:          String(p.id),
      title:       p.title,
      image:       p.image || null,
      enabled:     dbMap[String(p.id)]?.enabled ?? false,
      benefitType:  dbMap[String(p.id)]?.benefitType  || null,
      benefitValue: dbMap[String(p.id)]?.benefitValue || null,
    }));

    res.json({ products });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// POST /admin/api/products/toggle — activar/desactivar suscripciones para un producto
router.post('/api/products/toggle', async (req, res) => {
  try {
    const { productId, productTitle, productImage, enabled, benefitType, benefitValue } = req.body;
    const shopDomain = req.session?.shopDomain;

    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });
    if (!productId)  return res.status(400).json({ error: 'productId requerido' });

    await prisma.productSubscription.upsert({
      where:  { shopDomain_productId: { shopDomain, productId: String(productId) } },
      update: { enabled: !!enabled, productTitle, productImage, benefitType: benefitType || null, benefitValue: benefitValue || null },
      create: {
        shopDomain,
        productId:    String(productId),
        productTitle: productTitle || null,
        productImage: productImage || null,
        enabled:      !!enabled,
        benefitType:  benefitType  || null,
        benefitValue: benefitValue || null,
      },
    });

    logAction(req, 'toggle_product', { productId, enabled: !!enabled });
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /admin/api/pagos — historial completo de cobros con filtros
router.get('/api/pagos', async (req, res) => {
  try {
    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    const { status, desde, hasta, q } = req.query;

    const pagos = await prisma.pago.findMany({
      where: {
        // Filtro por shopDomain a nivel DB — nunca traer datos de otros merchants
        subscription: { shopDomain },
        ...(status ? { status } : {}),
        ...(desde || hasta ? {
          createdAt: {
            ...(desde ? { gte: new Date(desde) } : {}),
            ...(hasta ? { lte: new Date(hasta + 'T23:59:59Z') } : {}),
          }
        } : {}),
      },
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Filtrar por texto de búsqueda en memoria (solo si hay query)
    const resultado = q ? pagos.filter(p => {
      const email = p.subscription.shopifyCustomerEmail.toLowerCase();
      const envio = (p.subscription.datosEnvio || '').toLowerCase();
      return email.includes(q.toLowerCase()) || envio.includes(q.toLowerCase());
    }) : pagos;

    // Enriquecer con productTitle desde ProductSubscription
    const productIds = [...new Set(resultado.map(p => p.subscription.productId).filter(Boolean))];
    const prodMap = {};
    if (productIds.length) {
      const prodSubs = await prisma.productSubscription.findMany({
        where: { shopDomain, productId: { in: productIds } },
        select: { productId: true, productTitle: true },
      });
      prodSubs.forEach(ps => { prodMap[ps.productId] = ps.productTitle; });
    }

    res.json(resultado.map(p => {
      let nombre = '';
      try { const d = JSON.parse(p.subscription.datosEnvio || '{}'); nombre = `${d.nombre||''} ${d.apellido||''}`.trim(); } catch {}
      return {
        id:           p.id,
        mpPaymentId:  p.mpPaymentId,
        monto:        p.monto,
        status:       p.status,
        createdAt:    p.createdAt,
        email:        p.subscription.shopifyCustomerEmail,
        nombre,
        planNombre:   p.subscription.plan?.nombre || null,
        productId:    p.subscription.productId || null,
        productTitle: prodMap[p.subscription.productId] || null,
      };
    }));
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});


// ── Waitlist beta ─────────────────────────────────────────────────────────────
const emailSvc = require('../services/email');

router.get('/api/waitlist', async (req, res) => {
  try {
    const entries = await prisma.waitlistEntry.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(entries);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' }); }
});

router.post('/api/waitlist/:id/aprobar', async (req, res) => {
  try {
    const entry = await prisma.waitlistEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'No encontrado' });
    await prisma.waitlistEntry.update({ where: { id: req.params.id }, data: { status: 'approved' } });
    logAction(req, 'waitlist_approve', { email: entry.email });
    const registerUrl = `${process.env.APP_URL}/admin/login?tab=register`;
    await emailSvc.enviarEmail({
      to: entry.email,
      subject: '🚀 Tu acceso a Ziklo Beta está listo',
      html: `<div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
        <h2 style="color:#202223;">¡Hola ${entry.nombre}!</h2>
        <p style="color:#444;">Tu solicitud de acceso a la beta de Ziklo fue aprobada. Ya podés crear tu cuenta:</p><br>
        <a href="${registerUrl}" style="background:#009ee3;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Crear mi cuenta →</a>
        <br><br><p style="color:#888;font-size:14px;">— El equipo de Ziklo</p></div>`,
    });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' }); }
});

router.post('/api/waitlist/:id/rechazar', async (req, res) => {
  try {
    await prisma.waitlistEntry.update({ where: { id: req.params.id }, data: { status: 'rejected' } });
    logAction(req, 'waitlist_reject', { id: req.params.id });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' }); }
});

// GET /admin/api/audit-log — últimos 100 registros de auditoría del shop
router.get('/api/audit-log', async (req, res) => {
  try {
    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    const logs = await prisma.auditLog.findMany({
      where: { shopDomain },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RECOMENDACIONES — upsell/cross-sell por producto
// ══════════════════════════════════════════════════════════════════════════════

// GET /admin/api/products/:productId/recommendations
router.get('/api/products/:productId/recommendations', async (req, res) => {
  try {
    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    const recs = await prisma.productRecommendation.findMany({
      where: { shopDomain, sourceProductId: req.params.productId },
      orderBy: { position: 'asc' },
    });
    res.json(recs);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// POST /admin/api/products/:productId/recommendations — replace-all
router.post('/api/products/:productId/recommendations', async (req, res) => {
  try {
    const shopDomain = req.session?.shopDomain;
    if (!shopDomain) return res.status(400).json({ error: 'No hay tienda en sesión' });

    const { recommendations } = req.body;
    if (!Array.isArray(recommendations)) {
      return res.status(400).json({ error: 'recommendations debe ser un array' });
    }
    if (recommendations.length > 4) {
      return res.status(400).json({ error: 'Máximo 4 recomendaciones por producto' });
    }

    const sourceProductId = req.params.productId;

    // Delete existing + create new (transacción)
    await prisma.$transaction([
      prisma.productRecommendation.deleteMany({
        where: { shopDomain, sourceProductId },
      }),
      ...recommendations.map((r, i) =>
        prisma.productRecommendation.create({
          data: {
            shopDomain,
            sourceProductId,
            targetProductId: String(r.productId),
            targetTitle:     r.title || null,
            targetImage:     r.image || null,
            targetPrice:     r.price ? parseFloat(r.price) : null,
            targetVariantId: r.variantId ? String(r.variantId) : null,
            position:        i,
          },
        })
      ),
    ]);

    logAction(req, 'update_recommendations', { sourceProductId, count: recommendations.length });
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// Sirve el panel admin (HTML estático que consume la API)
router.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin/index.html'));
});

module.exports = router;
