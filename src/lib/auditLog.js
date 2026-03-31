const prisma = require('./prisma');

/**
 * Registra una acción de admin en la tabla AuditLog.
 * Se llama de forma fire-and-forget (no bloquea la respuesta).
 */
function logAction(req, action, details = null) {
  const userId     = req.session?.userId || null;
  const shopDomain = req.session?.shopDomain || req.shop?.domain || null;
  const ip         = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

  // Fire-and-forget: no await para no ralentizar la respuesta
  prisma.auditLog.create({
    data: {
      action,
      userId,
      shopDomain,
      details: details ? JSON.stringify(details) : null,
      ip,
    },
  }).catch(err => {
    console.error('[AuditLog] Error:', err.message);
  });
}

module.exports = { logAction };
