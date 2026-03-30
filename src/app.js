require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieSession = require('cookie-session');

const planesRoutes = require('./routes/planes');
const productsRoutes = require('./routes/products');
const subscripcionesRoutes = require('./routes/subscripciones');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const clienteRoutes = require('./routes/cliente');
const authRoutes = require('./routes/auth');
const userAuthRoutes = require('./routes/userAuth');
const adminAuth  = require('./middleware/adminAuth');
const shopContext = require('./middleware/shopContext');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway termina SSL en su proxy — necesario para que req.secure sea true
// y para que las cookies con secure:true se setteen correctamente
app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Sesión encriptada para el admin
app.use(cookieSession({
  name: 'ziklo_admin',
  keys: [process.env.SESSION_SECRET || 'ziklo-secret-dev-key-change-in-prod'],
  maxAge: 8 * 60 * 60 * 1000, // 8 horas
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
}));

app.use(express.static(path.join(__dirname, '../public')));

// Webhooks de MP necesitan el body raw
app.use('/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Adjunta req.shop a todos los requests (usa sesión o ?shop= query param)
app.use(shopContext);

// Rutas API
app.use('/api/planes', planesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/subscripciones', subscripcionesRoutes);
app.use('/webhooks', webhooksRoutes);

// OAuth Shopify (para obtener el access token)
app.use('/auth', authRoutes);

// Auth de usuarios (email/pass + Google OAuth) — montado en /auth para compartir prefijo
app.use('/auth', userAuthRoutes);

// Rutas de UI — admin protegido con auth
app.use('/admin', adminAuth, adminRoutes);
app.use('/cliente', clienteRoutes);

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── SETUP TEMPORAL — crear primer superadmin ──────────────────────────────────
// Eliminar este bloque después de crear el usuario
if (process.env.SETUP_SECRET) {
  const bcrypt = require('bcryptjs');
  const prisma = require('./lib/prisma');
  app.get('/setup/init', async (req, res) => {
    if (req.query.secret !== process.env.SETUP_SECRET) {
      return res.status(403).send('Forbidden');
    }
    try {
      const count = await prisma.user.count();
      if (count > 0) return res.send('Ya existen usuarios. Endpoint deshabilitado.');
      const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
      const accessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';
      // Asegurar que el Shop exista antes de vincularlo
      if (shopDomain) {
        await prisma.shop.upsert({
          where:  { domain: shopDomain },
          update: {},
          create: { domain: shopDomain, accessToken, shopName: shopDomain },
        });
      }
      const hash = await bcrypt.hash(req.query.password || 'Ziklo2024!', 10);
      const user = await prisma.user.create({
        data: {
          email:        req.query.email || 'admin@ziklo.app',
          passwordHash: hash,
          name:         'Marcelo',
          role:         'superadmin',
          shops:        shopDomain ? { create: { shopDomain } } : undefined,
        },
      });
      res.send(`Usuario creado: ${user.email} — Shop: ${shopDomain || 'ninguno'}<br>Ya podés loguearte en /admin/login`);
    } catch (e) {
      res.status(500).send('Error: ' + e.message);
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 App corriendo en http://localhost:${PORT}`);
  console.log(`📦 Panel admin: http://localhost:${PORT}/admin`);
  console.log(`👤 Portal cliente: http://localhost:${PORT}/cliente\n`);
});
