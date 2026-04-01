const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const prisma  = require('../lib/prisma');
const email   = require('../services/email');

const TOKEN_EXPIRY_MS  = 15 * 60 * 1000;   // 15 minutos
const RATE_LIMIT_MS    =  2 * 60 * 1000;   // 1 token cada 2 minutos por email+shop

// ── GET /api/cliente/session ────────────────────────────────────────────────
// Retorna el estado de la sesión actual del cliente (sin auth requerida)
router.get('/session', (req, res) => {
  const clientEmail = req.session?.clienteEmail || null;
  const shopDomain  = req.session?.clienteShop  || null;
  const expiry      = req.session?.clienteExpiry || 0;

  if (clientEmail && shopDomain && Date.now() < expiry) {
    return res.json({ loggedIn: true, email: clientEmail, shopDomain });
  }
  res.json({ loggedIn: false });
});

// ── POST /api/cliente/solicitar-acceso ──────────────────────────────────────
// Genera token y envía magic link al email del cliente
router.post('/solicitar-acceso', async (req, res) => {
  const { email: clientEmail, shop } = req.body;

  if (!clientEmail || !shop) {
    return res.status(400).json({ error: 'email y shop son requeridos' });
  }

  // Verificar que el email tenga un formato básico
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  // Rate limit: max 1 token cada 2 minutos por email+shop
  const reciente = await prisma.magicToken.findFirst({
    where: {
      email:      clientEmail.toLowerCase(),
      shopDomain: shop,
      createdAt:  { gte: new Date(Date.now() - RATE_LIMIT_MS) },
    },
  });
  if (reciente) {
    return res.status(429).json({ error: 'Ya te enviamos un link. Esperá 2 minutos para pedir otro.' });
  }

  // Generar token seguro
  const token = crypto.randomBytes(32).toString('hex');

  await prisma.magicToken.create({
    data: {
      email:      clientEmail.toLowerCase(),
      shopDomain: shop,
      token,
      expiresAt:  new Date(Date.now() + TOKEN_EXPIRY_MS),
    },
  });

  // Obtener nombre de la tienda para el email
  let storeName = shop;
  try {
    const shopRecord = await prisma.shop.findUnique({ where: { domain: shop } });
    if (shopRecord?.shopName) storeName = shopRecord.shopName;
  } catch (_) {}

  // URL del magic link
  const magicUrl = `${process.env.APP_URL}/cliente?shop=${encodeURIComponent(shop)}&token=${token}`;

  try {
    await email.enviarMagicLink({ email: clientEmail, magicUrl, storeName });
  } catch (err) {
    console.error('Error enviando magic link:', err.message);
    return res.status(500).json({ error: 'No pudimos enviar el email. Intentá de nuevo.' });
  }

  res.json({ ok: true });
});

// ── POST /api/cliente/verificar-token ───────────────────────────────────────
// Valida el token del magic link y establece sesión
router.post('/verificar-token', async (req, res) => {
  const { token, shop } = req.body;

  if (!token || !shop) {
    return res.status(400).json({ error: 'token y shop son requeridos' });
  }

  const record = await prisma.magicToken.findUnique({ where: { token } });

  if (!record) {
    return res.status(401).json({ error: 'Link inválido o ya utilizado.' });
  }
  if (record.shopDomain !== shop) {
    return res.status(401).json({ error: 'Link inválido para esta tienda.' });
  }
  if (record.usedAt) {
    return res.status(401).json({ error: 'Este link ya fue utilizado. Pedí uno nuevo.' });
  }
  if (new Date() > record.expiresAt) {
    return res.status(401).json({ error: 'El link expiró. Pedí uno nuevo.' });
  }

  // Marcar como usado atómicamente (previene race condition con requests simultáneos)
  const { count } = await prisma.magicToken.updateMany({
    where: { id: record.id, usedAt: null },
    data:  { usedAt: new Date() },
  });
  if (count === 0) {
    return res.status(401).json({ error: 'Este link ya fue utilizado. Pedí uno nuevo.' });
  }

  // Establecer sesión del cliente (dura 24 horas)
  req.session.clienteEmail  = record.email;
  req.session.clienteShop   = record.shopDomain;
  req.session.clienteExpiry = Date.now() + 24 * 60 * 60 * 1000;

  res.json({ ok: true, email: record.email });
});

// ── POST /api/cliente/logout ─────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.clienteEmail  = null;
  req.session.clienteShop   = null;
  req.session.clienteExpiry = null;
  res.json({ ok: true });
});

module.exports = router;
