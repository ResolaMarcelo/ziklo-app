require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieSession = require('cookie-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

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

// Login / registro: 10 intentos cada 15 min por IP (evita fuerza bruta)
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá 15 minutos antes de volver a intentar.' },
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
const mpAuthRoutes      = require('./routes/mpAuth');
const clienteAuthRoutes = require('./routes/clienteAuth');
const waitlistRoutes    = require('./routes/waitlist');
const adminAuth        = require('./middleware/adminAuth');
const csrfProtection   = require('./middleware/csrfProtection');
const shopContext       = require('./middleware/shopContext');
const recordatoriosJob = require('./jobs/recordatorios');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway termina SSL en su proxy — necesario para que req.secure sea true
// y para que las cookies con secure:true se setteen correctamente
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // desactivado: el admin usa inline scripts/styles y CDN externo (Chart.js)
  crossOriginEmbedderPolicy: false, // desactivado: el widget se carga en tiendas externas
}));

// Forzar HTTPS en producción (solo si viene del proxy externo de Railway)
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, 'https://' + req.headers.host + req.url);
    }
    next();
  });
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    // Requests sin origin (mobile, curl, server-to-server) → siempre ok
    if (!origin) return callback(null, true);
    // Dominios Ziklo explícitos
    const ziklo = ['https://zikloapp.com', 'https://app.zikloapp.com', ...ALLOWED_ORIGINS];
    if (ziklo.includes(origin)) return callback(null, true);
    // Cualquier tienda .myshopify.com (widget embebido)
    if (origin.endsWith('.myshopify.com')) return callback(null, true);
    // Desarrollo local
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    // Cualquier origen HTTPS (custom domains de merchants con el widget)
    if (origin.startsWith('https://')) return callback(null, true);
    callback(new Error('CORS: origen no permitido'));
  },
  credentials: false,
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

// API pública — rate limiting general (debe ir ANTES de registrar las rutas)
app.use('/api/planes', limiterAPI);
app.use('/api/products', limiterAPI);
app.use('/api/subscripciones', limiterAPI);
app.use('/api/waitlist', limiterAPI);

// Rutas API
app.use('/api/planes', planesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/subscripciones', subscripcionesRoutes);
app.use('/webhooks', webhooksRoutes);

// OAuth Shopify (para obtener el access token)
app.use('/auth', authRoutes);

// Auth de usuarios (email/pass + Google OAuth) — montado en /auth para compartir prefijo
app.post('/auth/user/login',    limiterAuth);
app.post('/auth/user/register', limiterAuth);
app.use('/auth', userAuthRoutes);

// Klaviyo OAuth — protegido por adminAuth (sólo merchants logueados)
app.use('/auth/klaviyo', adminAuth, klaviyoAuthRoutes);

// Mercado Pago OAuth — protegido por adminAuth
app.use('/auth/mp', adminAuth, mpAuthRoutes);

// Auth del portal cliente (magic link) — pública, con rate limiting
app.post('/api/cliente/solicitar', limiterMagicLink);
app.post('/api/cliente/verificar', limiterVerificar);
app.use('/api/cliente', clienteAuthRoutes);

// Rutas de UI — admin protegido con auth + CSRF
app.use('/admin', adminAuth, csrfProtection, adminRoutes);
app.use('/cliente', clienteRoutes);

// Waitlist beta — solo el endpoint público POST /api/waitlist
app.use('/api/waitlist', waitlistRoutes);

// Widget JS — servido con cache de 5 minutos para actualizaciones rápidas
app.get('/widget.js', (req, res) => {
  res.set({
    'Content-Type':  'application/javascript',
    'Cache-Control': 'public, max-age=300', // 5 minutos
    'X-Widget-Version': '1.1.0',
  });
  res.sendFile(path.join(__dirname, '../public/widget.js'));
});

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Error handler global — no exponer datos internos ─────────────────────
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message || err);
  const status = err.status || err.statusCode || 500;
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/auth/')) {
    return res.status(status).json({
      error: status === 401 ? 'No autorizado'
           : status === 403 ? 'Acceso denegado'
           : status === 404 ? 'No encontrado'
           : 'Ocurrió un error interno. Intentá de nuevo más tarde.',
    });
  }
  res.status(status).send('Error interno del servidor');
});

app.listen(PORT, () => {
  console.log(`\n🚀 App corriendo en http://localhost:${PORT}`);
  console.log(`📦 Panel admin: http://localhost:${PORT}/admin`);
  console.log(`👤 Portal cliente: http://localhost:${PORT}/cliente\n`);

  // Iniciar job de recordatorios de cobro (48h antes)
  recordatoriosJob.iniciarJob();
});
