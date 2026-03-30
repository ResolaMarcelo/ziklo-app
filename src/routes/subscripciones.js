const express     = require('express');
const router      = express.Router();
const prisma      = require('../lib/prisma');
const mp          = require('../services/mercadopago');
const klaviyo     = require('../services/klaviyo');
const email       = require('../services/email');
const shopify     = require('../services/shopify');
const clienteAuth = require('../middleware/clienteAuth');

// Helpers
const getShopDomain = (req) => req.shop?.domain || req.session?.shopDomain || req.session?.clienteShop || null;
const getMpToken    = (req) => req.shop?.mpAccessToken || null;

// Helper: determina si la request viene del panel admin
const isAdmin = (req) => !!req.session?.adminLoggedIn;

// GET /api/subscripciones — listar (filtrado por shop, solo admin)
router.get('/', async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
  try {
    const shopDomain = getShopDomain(req);
    const subs = await prisma.subscription.findMany({
      where:   { shopDomain },
      include: { plan: true, pagos: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscripciones/cliente/:email — requiere auth del cliente
router.get('/cliente/:email', clienteAuth, async (req, res) => {
  try {
    // Clientes solo pueden ver sus propias suscripciones
    if (!isAdmin(req) && req.clienteEmail !== req.params.email.toLowerCase()) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const shopDomain = getShopDomain(req);
    const subs = await prisma.subscription.findMany({
      where:   { shopifyCustomerEmail: req.params.email, shopDomain },
      include: { plan: true, pagos: { orderBy: { createdAt: 'desc' } } },
    });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/subscripciones/por-preapproval/:preapprovalId
router.get('/por-preapproval/:preapprovalId', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const sub = await prisma.subscription.findFirst({
      where: {
        mpPreapprovalId: req.params.preapprovalId,
        ...(shopDomain ? { shopDomain } : {}),
      },
      include: { plan: true },
    });
    if (!sub) return res.status(404).json({ error: 'No encontrada' });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/crear — iniciar suscripción (desde widget)
router.post('/crear', async (req, res) => {
  try {
    const { planId, email, customerId, variantId, productId } = req.body;
    if (!planId || !email) {
      return res.status(400).json({ error: 'planId y email son requeridos' });
    }

    const shopDomain = getShopDomain(req);
    const mpToken    = getMpToken(req);

    const plan = await prisma.plan.findFirst({
      where: { id: planId, shopDomain },
    });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const preapproval = await mp.crearPreapproval({
      plan, email, mpToken,
      backUrl: `${process.env.APP_URL}/cliente/gracias`,
    });

    const sub = await prisma.subscription.create({
      data: {
        shopDomain,
        shopifyCustomerId:    customerId || 'desconocido',
        shopifyCustomerEmail: email,
        variantId:            variantId || null,
        productId:            productId || null,
        mpPreapprovalId:      preapproval.id,
        status:               'pending',
        planId:               plan.id,
      },
    });

    res.json({ subscripcionId: sub.id, initPoint: preapproval.init_point });
  } catch (err) {
    console.error('Error al crear suscripción:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/crear-dinamico — precio del bundle seleccionado
router.post('/crear-dinamico', async (req, res) => {
  try {
    const { email, monto, frecuencia, tipoFrecuencia, descripcion, variantId, productId } = req.body;
    if (!email || !monto) return res.status(400).json({ error: 'email y monto son requeridos' });

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ error: 'monto inválido' });

    const shopDomain = getShopDomain(req);
    const mpToken    = getMpToken(req);

    const plan = await prisma.plan.create({
      data: {
        nombre: descripcion || 'Suscripción', descripcion: descripcion || null,
        monto: montoNum, frecuencia: Number(frecuencia) || 1,
        tipoFrecuencia: tipoFrecuencia || 'months', activo: false, shopDomain,
      },
    });

    const preapproval = await mp.crearPreapproval({
      plan, email, mpToken,
      backUrl: `${process.env.APP_URL}/cliente/gracias`,
    });

    const sub = await prisma.subscription.create({
      data: {
        shopDomain,
        shopifyCustomerId: 'desconocido', shopifyCustomerEmail: email,
        variantId: variantId || null, productId: productId || null,
        mpPreapprovalId: preapproval.id, status: 'pending', planId: plan.id,
      },
    });

    res.json({ subscripcionId: sub.id, initPoint: preapproval.init_point });
  } catch (err) {
    console.error('Error al crear suscripción dinámica:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/crear-con-envio — checkout con datos de envío
router.post('/crear-con-envio', async (req, res) => {
  try {
    const { email, monto, descripcion, variantId, productId, qty, envio } = req.body;
    if (!email || !monto || !envio) {
      return res.status(400).json({ error: 'email, monto y envio son requeridos' });
    }

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ error: 'monto inválido' });

    const shopDomain = getShopDomain(req);
    const mpToken    = getMpToken(req);

    const plan = await prisma.plan.create({
      data: {
        nombre: descripcion || 'Suscripción mensual', descripcion: descripcion || null,
        monto: montoNum, frecuencia: 1, tipoFrecuencia: 'months',
        activo: false, shopDomain,
      },
    });

    const preapproval = await mp.crearPreapproval({
      plan, email, mpToken,
      backUrl: `${process.env.APP_URL}/cliente/gracias`,
    });

    await prisma.subscription.create({
      data: {
        shopDomain,
        shopifyCustomerId: 'desconocido', shopifyCustomerEmail: email,
        variantId: variantId || null, productId: productId || null,
        qty: Number(qty) || 1,
        mpPreapprovalId: preapproval.id, status: 'pending', planId: plan.id,
        datosEnvio: JSON.stringify(envio),
      },
    });

    res.json({ initPoint: preapproval.init_point });
  } catch (err) {
    console.error('Error crear-con-envio:', err);

    // Detectar si el error viene de Mercado Pago (timeout, red, API caída)
    const msg = err.message || '';
    const isMpDown =
      err.code === 'ECONNREFUSED' ||
      err.code === 'ECONNRESET' ||
      err.code === 'ETIMEDOUT' ||
      err.name === 'AbortError' ||
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('mercadopago') ||
      (err.status >= 500 && err.status < 600);

    res.status(500).json({
      error: isMpDown
        ? 'Mercado Pago no está disponible en este momento. Por favor intentá de nuevo en unos minutos.'
        : (msg || 'Ocurrió un error al procesar tu suscripción.'),
      mpDown: isMpDown,
    });
  }
});

// ── Endpoints públicos de retención ───────────────────────────────────────────

// GET /api/subscripciones/retention-config?shop=domain — config pública (sin auth)
router.get('/retention-config', async (req, res) => {
  try {
    const shop = req.shop; // ya resuelto por shopContext con ?shop=
    res.json({
      pauseEnabled:    shop?.retentionPauseEnabled    ?? false,
      discountEnabled: shop?.retentionDiscountEnabled ?? false,
      discountPct:     shop?.retentionDiscountPct     ?? 10,
      surveyEnabled:   shop?.retentionSurveyEnabled   ?? false,
      message:         shop?.retentionMessage         ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/cancelar-motivo
router.post('/:id/cancelar-motivo', clienteAuth, async (req, res) => {
  try {
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'motivo requerido' });
    // Verificar que la sub existe
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });
    await prisma.cancelReason.create({
      data: { subscriptionId: req.params.id, reason: motivo },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/aplicar-descuento
router.post('/:id/aplicar-descuento', clienteAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });
    if (sub.retentionDiscountApplied) {
      return res.status(400).json({ error: 'El descuento ya fue aplicado anteriormente' });
    }
    await prisma.subscription.update({
      where: { id: req.params.id },
      data:  { retentionDiscountApplied: true },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: busca sub y verifica que pertenece al shop + (si es cliente) al email
async function findSubForRequest(id, req) {
  const shopDomain = getShopDomain(req);
  const where = { id, shopDomain };
  // Si es cliente (no admin), agregar verificación de email
  if (!isAdmin(req) && req.clienteEmail) {
    where.shopifyCustomerEmail = req.clienteEmail;
  }
  return prisma.subscription.findFirst({ where });
}

// POST /api/subscripciones/:id/cancelar
router.post('/:id/cancelar', clienteAuth, async (req, res) => {
  try {
    const sub = await findSubForRequest(req.params.id, req);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const mpToken = req.shop?.mpAccessToken || null;
    await mp.cancelarPreapproval(sub.mpPreapprovalId, mpToken);
    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'cancelled' } });

    // Klaviyo + email de confirmación — fire and forget
    const subWithPlan = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true } });
    klaviyo.subscriptionCancelled(req.shop, subWithPlan).catch(() => {});

    // Email de confirmación de cancelación al cliente
    try {
      const shopDomain = req.shop?.domain || process.env.SHOPIFY_SHOP_DOMAIN;
      const shopToken  = req.shop?.accessToken || process.env.SHOPIFY_ACCESS_TOKEN;
      const shopData   = await shopify.shopifyRequestForShop(shopDomain, shopToken, '/shop.json').catch(() => null);
      const storeName  = shopData?.shop?.name || process.env.STORE_NAME || shopDomain;
      const nombre     = subWithPlan?.datosEnvio ? JSON.parse(subWithPlan.datosEnvio).nombre : null;
      await email.enviarCancelacionConfirmacion({
        email:      subWithPlan.shopifyCustomerEmail,
        nombre,
        planNombre: subWithPlan.plan?.nombre,
        monto:      subWithPlan.plan?.monto,
        storeName,
      });
    } catch (err) {
      console.error('Error enviando email cancelación:', err.message);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/pausar
router.post('/:id/pausar', clienteAuth, async (req, res) => {
  try {
    const sub = await findSubForRequest(req.params.id, req);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const mpToken = req.shop?.mpAccessToken || null;
    await mp.pausarPreapproval(sub.mpPreapprovalId, mpToken);
    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'paused' } });

    // Klaviyo — fire and forget
    const subWithPlan = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true } });
    klaviyo.subscriptionPaused(req.shop, subWithPlan).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/reanudar
router.post('/:id/reanudar', clienteAuth, async (req, res) => {
  try {
    const sub = await findSubForRequest(req.params.id, req);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const mpToken = req.shop?.mpAccessToken || null;
    await mp.reanudarPreapproval(sub.mpPreapprovalId, mpToken);
    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'authorized' } });

    // Klaviyo — fire and forget
    const subWithPlan = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { plan: true } });
    klaviyo.subscriptionResumed(req.shop, subWithPlan).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
