const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const prisma  = require('../lib/prisma');

// ── POST /auth/user/login — login con email + contraseña ─────────────────────
router.post('/user/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { shops: true },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    req.session.userId        = user.id;
    req.session.userEmail     = user.email;
    req.session.userName      = user.name || null;
    req.session.userRole      = user.role;
    req.session.adminLoggedIn = true;

    const firstShop = user.shops[0];
    if (firstShop) {
      req.session.shopDomain = firstShop.shopDomain;
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /auth/google — iniciar OAuth con Google ──────────────────────────────
router.get('/google', (req, res) => {
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const appUrl      = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri = `${appUrl}/auth/google/callback`;

  if (!clientId) {
    return res.status(500).send('Google OAuth no configurado');
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });

  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// ── GET /auth/google/callback — procesar respuesta de Google ─────────────────
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/admin/login?error=google_denied');
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl       = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const redirectUri  = `${appUrl}/auth/google/callback`;

  try {
    // 1. Intercambiar code por tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('Google token error:', tokenData);
      return res.redirect('/admin/login?error=google_token');
    }

    // 2. Obtener info del usuario
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const userInfo = await userInfoRes.json();

    if (!userInfo.email) {
      return res.redirect('/admin/login?error=google_no_email');
    }

    const emailNorm = userInfo.email.toLowerCase();

    // 3. Buscar o crear usuario
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: userInfo.sub }, { email: emailNorm }] },
      include: { shops: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: emailNorm, googleId: userInfo.sub, name: userInfo.name || null },
        include: { shops: true },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data:  { googleId: userInfo.sub },
        include: { shops: true },
      });
    }

    // 4. Setear sesión
    req.session.userId        = user.id;
    req.session.userEmail     = user.email;
    req.session.userName      = user.name || null;
    req.session.userRole      = user.role;
    req.session.adminLoggedIn = true;

    const firstShop = user.shops[0];
    if (firstShop) {
      req.session.shopDomain = firstShop.shopDomain;
    }

    return res.redirect('/admin/');
  } catch (err) {
    console.error('Google callback error:', err.message);
    return res.redirect('/admin/login?error=google_error');
  }
});

// ── POST /auth/user/logout ────────────────────────────────────────────────────
router.post('/user/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// ── POST /auth/user/create — solo superadmin puede crear cuentas ──────────────
router.post('/user/create', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const requestingUser = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!requestingUser || requestingUser.role !== 'superadmin') {
      return res.status(403).json({ error: 'Solo superadmin puede crear usuarios' });
    }

    const { email, name, shopDomain, tempPassword } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const passwordToUse = tempPassword || require('crypto').randomBytes(8).toString('hex');
    const passwordHash  = await bcrypt.hash(passwordToUse, 10);

    const user = await prisma.user.create({
      data: { email: email.toLowerCase().trim(), name: name || null, passwordHash, role: 'merchant' },
    });

    if (shopDomain) {
      await prisma.shop.upsert({
        where:  { domain: shopDomain },
        update: {},
        create: { domain: shopDomain, accessToken: process.env.SHOPIFY_ACCESS_TOKEN || '', shopName: shopDomain },
      });
      await prisma.userShop.create({ data: { userId: user.id, shopDomain } });
    }

    return res.json({ ok: true, userId: user.id, tempPassword: passwordToUse });
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Ese email ya está registrado' });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
