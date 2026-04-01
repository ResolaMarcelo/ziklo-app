const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const mp      = require('../services/mercadopago');

// Resuelve shopDomain: sesión (admin logueado) o query param (widget público)
const getShopDomain = (req) =>
  req.shop?.domain || req.session?.shopDomain || null;

// GET /api/planes — activos (widget público, pasa ?shop=dominio)
router.get('/', async (req, res) => {
  try {
    const shopDomain = req.shop?.domain || null;
    const planes = await prisma.plan.findMany({
      where: { activo: true, shopDomain },
      orderBy: { monto: 'asc' },
    });
    res.json(planes);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /api/planes/todos — incluye inactivos (admin)
router.get('/todos', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const planes = await prisma.plan.findMany({
      where: { shopDomain },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { subscriptions: true } } },
    });
    res.json(planes);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// POST /api/planes — crear plan
router.post('/', async (req, res) => {
  if (!req.session?.adminLoggedIn) return res.status(401).json({ error: 'No autorizado' });
  try {
    const { nombre, descripcion, monto, frecuencia, tipoFrecuencia, beneficios } = req.body;
    if (!nombre || !monto) {
      return res.status(400).json({ error: 'nombre y monto son requeridos' });
    }
    const shopDomain = getShopDomain(req);
    const plan = await prisma.plan.create({
      data: {
        nombre,
        descripcion,
        monto:          parseFloat(monto),
        frecuencia:     parseInt(frecuencia) || 1,
        tipoFrecuencia: tipoFrecuencia || 'months',
        shopDomain,
        beneficios:     Array.isArray(beneficios) ? JSON.stringify(beneficios) : (beneficios || null),
      },
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// PUT /api/planes/:id — actualizar plan
router.put('/:id', async (req, res) => {
  if (!req.session?.adminLoggedIn) return res.status(401).json({ error: 'No autorizado' });
  try {
    const shopDomain = getShopDomain(req);
    const existing = await prisma.plan.findFirst({
      where: { id: req.params.id, shopDomain },
    });
    if (!existing) return res.status(404).json({ error: 'Plan no encontrado' });

    const { nombre, descripcion, monto, frecuencia, tipoFrecuencia, activo, beneficios } = req.body;
    const nuevoMonto = monto ? parseFloat(monto) : undefined;
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: {
        nombre,
        descripcion,
        monto:          nuevoMonto,
        frecuencia:     frecuencia ? parseInt(frecuencia, 10) : undefined,
        tipoFrecuencia: tipoFrecuencia || undefined,
        activo,
        beneficios:     beneficios !== undefined
          ? (Array.isArray(beneficios) ? JSON.stringify(beneficios) : beneficios)
          : undefined,
      },
    });

    // Si cambió el monto, actualizar el precio en MP para todas las suscripciones activas
    let mpUpdated = 0;
    let mpErrors  = 0;
    if (nuevoMonto && nuevoMonto !== existing.monto) {
      const mpToken = req.shop?.mpAccessToken || null;
      if (mpToken) {
        const subs = await prisma.subscription.findMany({
          where: { planId: plan.id, status: { in: ['authorized', 'pending'] } },
          select: { id: true, mpPreapprovalId: true },
        });
        for (const sub of subs) {
          try {
            await mp.actualizarMontoPreapproval(sub.mpPreapprovalId, nuevoMonto, mpToken);
            mpUpdated++;
          } catch (err) {
            mpErrors++;
            console.error(`[planes] Error actualizando monto MP para sub ${sub.id}:`, err.message);
          }
        }
      }
    }

    res.json({ ...plan, mpUpdated, mpErrors });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// DELETE /api/planes/:id — desactivar plan
router.delete('/:id', async (req, res) => {
  if (!req.session?.adminLoggedIn) return res.status(401).json({ error: 'No autorizado' });
  try {
    const shopDomain = getShopDomain(req);
    const existing = await prisma.plan.findFirst({
      where: { id: req.params.id, shopDomain },
    });
    if (!existing) return res.status(404).json({ error: 'Plan no encontrado' });

    await prisma.plan.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

module.exports = router;
