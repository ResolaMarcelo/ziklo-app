require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieSession = require('cookie-session');

const planesRoutes = require('./routes/planes');
const subscripcionesRoutes = require('./routes/subscripciones');
const webhooksRoutes = require('./routes/webhooks');
const adminRoutes = require('./routes/admin');
const clienteRoutes = require('./routes/cliente');
const authRoutes = require('./routes/auth');
const adminAuth = require('./middleware/adminAuth');

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

// Rutas API
app.use('/api/planes', planesRoutes);
app.use('/api/subscripciones', subscripcionesRoutes);
app.use('/webhooks', webhooksRoutes);

// OAuth Shopify (para obtener el access token)
app.use('/auth', authRoutes);

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
});
