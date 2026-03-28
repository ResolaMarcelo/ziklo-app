const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const mp = require('../services/mercadopago');

// GET /api/subscripciones - listar todas
router.get('/', async (req, res) => {
  try {
    const subs = await prisma.subscription.findMany({
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
    const subs = await prisma.subscription.findMany({
      where: { shopifyCustomerEmail: req.params.email },
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

// POST /api/subscripciones/crear - iniciar una nueva suscripción
router.post('/crear', async (req, res) => {
  try {
    const { planId, email, customerId, variantId, productId } = req.body;

    if (!planId || !email) {
      return res.status(400).json({ error: 'planId y email son requeridos' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    // Crear el preapproval en Mercado Pago
    const preapproval = await mp.crearPreapproval({
      plan,
      email,
      backUrl: `${process.env.APP_URL}/cliente/gracias`,
    });

    // Guardar suscripción en BD con estado pending
    const sub = await prisma.subscription.create({
      data: {
        shopifyCustomerId: customerId || 'desconocido',
        shopifyCustomerEmail: email,
        variantId: variantId || null,
        productId: productId || null,
        mpPreapprovalId: preapproval.id,
        status: 'pending',
        planId: plan.id,
      },
    });

    // Devolver la URL de pago de MP para redirigir al cliente
    res.json({
      subscripcionId: sub.id,
      initPoint: preapproval.init_point,
    });
  } catch (err) {
    console.error('Error al crear suscripción:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/crear-dinamico - suscripción con precio del bundle seleccionado
router.post('/crear-dinamico', async (req, res) => {
  try {
    const { email, monto, frecuencia, tipoFrecuencia, descripcion, variantId, productId } = req.body;

    if (!email || !monto) {
      return res.status(400).json({ error: 'email y monto son requeridos' });
    }

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({ error: 'monto inválido' });
    }

    // Crear un plan dinámico en BD (activo: false para que no aparezca en la lista pública)
    const plan = await prisma.plan.create({
      data: {
        nombre: descripcion || 'Suscripción',
        descripcion: descripcion || null,
        monto: montoNum,
        frecuencia: Number(frecuencia) || 1,
        tipoFrecuencia: tipoFrecuencia || 'months',
        activo: false,
      },
    });

    const preapproval = await mp.crearPreapproval({
      plan,
      email,
      backUrl: `${process.env.APP_URL}/cliente/gracias`,
    });

    const sub = await prisma.subscription.create({
      data: {
        shopifyCustomerId: 'desconocido',
        shopifyCustomerEmail: email,
        variantId: variantId || null,
        productId: productId || null,
        mpPreapprovalId: preapproval.id,
        status: 'pending',
        planId: plan.id,
      },
    });

    res.json({ subscripcionId: sub.id, initPoint: preapproval.init_point });
  } catch (err) {
    console.error('Error al crear suscripción dinámica:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/crear-con-envio - checkout intermedio con datos de envío
router.post('/crear-con-envio', async (req, res) => {
  try {
    const { email, monto, descripcion, variantId, productId, qty, envio } = req.body;

    if (!email || !monto || !envio) {
      return res.status(400).json({ error: 'email, monto y envio son requeridos' });
    }

    const montoNum = Number(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({ error: 'monto inválido' });
    }

    const plan = await prisma.plan.create({
      data: {
        nombre: descripcion || 'Suscripción mensual',
        descripcion: descripcion || null,
        monto: montoNum,
        frecuencia: 1,
        tipoFrecuencia: 'months',
        activo: false,
      },
    });

    const preapproval = await mp.crearPreapproval({
      plan,
      email,
      backUrl: `${process.env.APP_URL}/cliente/gracias`,
    });

    await prisma.subscription.create({
      data: {
        shopifyCustomerId: 'desconocido',
        shopifyCustomerEmail: email,
        variantId: variantId || null,
        productId: productId || null,
        qty: Number(qty) || 1,
        mpPreapprovalId: preapproval.id,
        status: 'pending',
        planId: plan.id,
        datosEnvio: JSON.stringify(envio),
      },
    });

    res.json({ initPoint: preapproval.init_point });
  } catch (err) {
    console.error('Error crear-con-envio:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/cancelar
router.post('/:id/cancelar', async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    await mp.cancelarPreapproval(sub.mpPreapprovalId);
    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/pausar
router.post('/:id/pausar', async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    await mp.pausarPreapproval(sub.mpPreapprovalId);
    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'paused' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subscripciones/:id/reanudar
router.post('/:id/reanudar', async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    await mp.reanudarPreapproval(sub.mpPreapprovalId);
    await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'authorized' },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
