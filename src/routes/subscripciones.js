const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const mp      = require('../services/mercadopago');

// Helpers
const getShopDomain = (req) => req.shop?.domain || req.session?.shopDomain || null;
const getMpToken    = (req) => req.shop?.mpAccessToken || null;

// GET /api/subscripciones — listar (filtrado por shop)
router.get('/', async (req, res) => {
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

// GET /api/subscripciones/cliente/:email
router.get('/cliente/:email', async (req, res) => {
  try {
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
    const sub = await prisma.subscription.findUnique({
      where: { mpPreapprovalId: req.params.preapprovalId },
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
    res.status(500).json({ error: err.message });
  }
});

// Helper: busca sub y verifica que pertenece al shop logueado
async function findSubForShop(id, shopDomain) {
  const sub = await prisma.subscription.findFirst({
    where: { id, shopDomain },
  });
  return sub;
}

// POST /api/subscripciones/:id/cancelar
router.post('/:id/cancelar', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const sub = await findSubForShop(req.params.id, shopDomain);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const mpToken = req.shop?.mpAccessToken || null;
    await mp.cancelarPreapproval(sub.mpPreapprovalId, mpToken);
    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'cancelled' } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/pausar
router.post('/:id/pausar', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const sub = await findSubForShop(req.params.id, shopDomain);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const mpToken = req.shop?.mpAccessToken || null;
    await mp.pausarPreapproval(sub.mpPreapprovalId, mpToken);
    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'paused' } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/reanudar
router.post('/:id/reanudar', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const sub = await findSubForShop(req.params.id, shopDomain);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const mpToken = req.shop?.mpAccessToken || null;
    await mp.reanudarPreapproval(sub.mpPreapprovalId, mpToken);
    await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'authorized' } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
