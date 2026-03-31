const express = require('express');
const router  = express.Router();
const prisma  = require('../lib/prisma');
const email   = require('../services/email');
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

module.exports = router;
