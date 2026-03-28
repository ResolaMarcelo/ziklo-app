const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');

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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
});

// POST /api/planes — crear plan
router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, monto, frecuencia, tipoFrecuencia } = req.body;
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
      },
    });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/planes/:id — actualizar plan
router.put('/:id', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req);
    const existing = await prisma.plan.findFirst({
      where: { id: req.params.id, shopDomain },
    });
    if (!existing) return res.status(404).json({ error: 'Plan no encontrado' });

    const { nombre, descripcion, monto, frecuencia, tipoFrecuencia, activo } = req.body;
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: {
        nombre,
        descripcion,
        monto:          monto      ? parseFloat(monto)    : undefined,
        frecuencia:     frecuencia ? parseInt(frecuencia) : undefined,
        tipoFrecuencia: tipoFrecuencia || undefined,
        activo,
      },
    });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/planes/:id — desactivar plan
router.delete('/:id', async (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
