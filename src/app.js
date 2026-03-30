require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');

// ── Rate limiters ────────────────────────────────────────────────────────────

// Magic link: 5 solicitudes cada 15 min por IP (evita spam de emails)
const limiterMagicLink = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 15 minutos antes de volver a intentar.' },
});

// Verificación de token: 10 intentos cada 15 min por IP (evita fuerza bruta)
const limiterVerificar = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 15 minutos.' },
});

// API pública general: 100 requests por minuto por IP (evita scraping)
const limiterAPI = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.' },
});

const planesRoutes = require('./routes/planes');
const productsRoutes = require('./routes/products');
const subscripcionesRoutes = require('./routes/subscripciones');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const clienteRoutes = require('./routes/cliente');
const authRoutes = require('./routes/auth');
const userAuthRoutes = require('./routes/userAuth');
const klaviyoAuthRoutes = require('./routes/klaviyoAuth');
const clienteAuthRoutes = require('./routes/clienteAuth');
const adminAuth        = require('./middleware/adminAuth');
const shopContext       = require('./middleware/shopContext');
const recordatoriosJob = require('./jobs/recordatorios');

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
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días (admin + cliente)
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

// Klaviyo OAuth — protegido por adminAuth (sólo merchants logueados)
app.use('/auth/klaviyo', adminAuth, klaviyoAuthRoutes);

// Auth del portal cliente (magic link) — pública, con rate limiting
app.post('/api/cliente/solicitar', limiterMagicLink);
app.post('/api/cliente/verificar', limiterVerificar);
app.use('/api/cliente', clienteAuthRoutes);

// API pública — rate limiting general
app.use('/api/planes', limiterAPI);
app.use('/api/products', limiterAPI);

// Rutas de UI — admin protegido con auth
app.use('/admin', adminAuth, adminRoutes);
app.use('/cliente', clienteRoutes);

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 App corriendo en http://localhost:${PORT}`);
  console.log(`📦 Panel admin: http://localhost:${PORT}/admin`);
  console.log(`👤 Portal cliente: http://localhost:${PORT}/cliente\n`);

  // Iniciar job de recordatorios de cobro (48h antes)
  recordatoriosJob.iniciarJob();
});
