const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const email   = require('../services/email');
const adminAuth = require('../middleware/adminAuth');

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e));

// POST /api/waitlist — solicitud pública de acceso beta
router.post('/', async (req, res) => {
  try {
    const { nombre, email: emailAddr, tienda, mensaje } = req.body;
    if (!nombre || !emailAddr) {
      return res.status(400).json({ error: 'nombre y email son requeridos' });
    }
    if (!isValidEmail(emailAddr)) {
      return res.status(400).json({ error: 'El email no es válido' });
    }

    // Verificar si ya existe
    const existing = await prisma.waitlistEntry.findUnique({
      where: { email: emailAddr.toLowerCase().trim() },
    });
    if (existing) {
      // Si ya fue aprobado, indicarlo
      if (existing.status === 'approved') {
        return res.status(400).json({ error: 'Este email ya tiene acceso aprobado. Revisá tu bandeja de entrada.' });
      }
      return res.status(400).json({ error: 'Este email ya está en la lista de espera. Te avisaremos pronto.' });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        nombre:  nombre.trim(),
        email:   emailAddr.toLowerCase().trim(),
        tienda:  tienda?.trim() || null,
        mensaje: mensaje?.trim() || null,
        status:  'pending',
      },
    });

    // Notificar al admin de Ziklo (fire and forget)
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.RESEND_FROM_EMAIL || 'hola@zikloapp.com';
    email.enviarEmail({
      to:      adminEmail,
      subject: `🎉 Nueva solicitud beta: ${nombre} (${emailAddr})`,
      html: `
        <h2>Nueva solicitud de acceso beta</h2>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Email:</strong> ${emailAddr}</p>
        ${tienda ? `<p><strong>Tienda:</strong> ${tienda}</p>` : ''}
        ${mensaje ? `<p><strong>Mensaje:</strong> ${mensaje}</p>` : ''}
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-AR')}</p>
        <br>
        <a href="${process.env.APP_URL}/admin/waitlist" style="background:#009ee3;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;">
          Ver lista de espera →
        </a>
      `,
    }).catch(() => {});

    // Email de confirmación al usuario
    email.enviarEmail({
      to:      entry.email,
      subject: '✅ Recibimos tu solicitud — Ziklo Beta',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
          <h2 style="color:#202223;">¡Hola ${nombre}!</h2>
          <p style="color:#444;">Recibimos tu solicitud de acceso a la beta de Ziklo.</p>
          <p style="color:#444;">Te avisaremos por este email cuando tu acceso esté listo. Mientras tanto, si tenés alguna pregunta podés escribirnos a <a href="mailto:hola@zikloapp.com">hola@zikloapp.com</a>.</p>
          <br>
          <p style="color:#888;font-size:14px;">— El equipo de Ziklo</p>
        </div>
      `,
    }).catch(() => {});

    res.json({ ok: true, id: entry.id });
  } catch (err) {
    console.error('Error waitlist:', err);
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// GET /admin/api/waitlist — listar solicitudes (protegido)
router.get('/admin/api/waitlist', adminAuth, async (req, res) => {
  try {
    const entries = await prisma.waitlistEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(entries);
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// POST /admin/api/waitlist/:id/aprobar — aprobar y enviar link de registro (protegido)
router.post('/admin/api/waitlist/:id/aprobar', adminAuth, async (req, res) => {
  try {
    const entry = await prisma.waitlistEntry.findUnique({ where: { id: req.params.id } });
    if (!entry) return res.status(404).json({ error: 'No encontrado' });

    await prisma.waitlistEntry.update({
      where: { id: req.params.id },
      data:  { status: 'approved' },
    });

    const registerUrl = `${process.env.APP_URL}/admin/login?tab=register`;

    await email.enviarEmail({
      to:      entry.email,
      subject: '🚀 Tu acceso a Ziklo Beta está listo',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
          <h2 style="color:#202223;">¡Hola ${entry.nombre}!</h2>
          <p style="color:#444;">Tu solicitud de acceso a la beta de Ziklo fue aprobada. Ya podés crear tu cuenta:</p>
          <br>
          <a href="${registerUrl}" style="background:#009ee3;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
            Crear mi cuenta →
          </a>
          <br><br>
          <p style="color:#888;font-size:14px;">Si el botón no funciona, copiá este link: ${registerUrl}</p>
          <p style="color:#888;font-size:14px;">— El equipo de Ziklo</p>
        </div>
      `,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

// POST /admin/api/waitlist/:id/rechazar — rechazar solicitud (protegido)
router.post('/admin/api/waitlist/:id/rechazar', adminAuth, async (req, res) => {
  try {
    await prisma.waitlistEntry.update({
      where: { id: req.params.id },
      data:  { status: 'rejected' },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: 'Error interno. Intentá de nuevo.' });
  }
});

module.exports = router;
