const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/planes - listar todos los planes activos
router.get('/', async (req, res) => {
  try {
    const planes = await prisma.plan.findMany({
      where: { activo: true },
      orderBy: { monto: 'asc' },
    });
    res.json(planes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/planes/todos - incluye inactivos (para el admin)
router.get('/todos', async (req, res) => {
  try {
    const planes = await prisma.plan.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { subscriptions: true } } },
    });
    res.json(planes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/planes - crear plan
router.post('/', async (req, res) => {
  try {
    const { nombre, descripcion, monto, frecuencia, tipoFrecuencia } = req.body;

    if (!nombre || !monto) {
      return res.status(400).json({ error: 'nombre y monto son requeridos' });
    }

    const plan = await prisma.plan.create({
      data: {
        nombre,
        descripcion,
        monto: parseFloat(monto),
        frecuencia: parseInt(frecuencia) || 1,
        tipoFrecuencia: tipoFrecuencia || 'months',
      },
    });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/planes/:id - actualizar plan
router.put('/:id', async (req, res) => {
  try {
    const { nombre, descripcion, monto, frecuencia, tipoFrecuencia, activo } = req.body;
    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: {
        nombre,
        descripcion,
        monto: monto ? parseFloat(monto) : undefined,
        frecuencia: frecuencia ? parseInt(frecuencia) : undefined,
        tipoFrecuencia,
        activo,
      },
    });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/planes/:id - desactivar plan
router.delete('/:id', async (req, res) => {
  try {
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
