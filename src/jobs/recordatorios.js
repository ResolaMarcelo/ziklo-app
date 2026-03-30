/**
 * Job diario: envía recordatorios de cobro ~48h antes de que se procese el pago.
 *
 * Busca suscripciones `authorized` con nextChargeDate entre +36h y +60h desde ahora,
 * y le manda un email al cliente avisándole que en 2 días se le cobrará.
 *
 * Se ejecuta cada 24 horas via setInterval (sin dependencias externas).
 * En producción también se ejecuta una vez al arrancar (desfasado 10 minutos).
 */

const prisma   = require('../lib/prisma');
const email    = require('../services/email');
const shopify  = require('../services/shopify');

// Cache simple de nombre de tienda para no llamar a Shopify en cada iteración
const _storeNameCache = {};

async function getStoreName(shopDomain, shopToken) {
  if (_storeNameCache[shopDomain]) return _storeNameCache[shopDomain];
  try {
    const data = await shopify.shopifyRequestForShop(shopDomain, shopToken, '/shop.json');
    const name = data?.shop?.name || shopDomain;
    _storeNameCache[shopDomain] = name;
    return name;
  } catch {
    return shopDomain;
  }
}

async function enviarRecordatorios() {
  console.log('[Recordatorios] 🔍 Revisando cobros próximos...');

  const ahora = new Date();
  // Ventana: cobros que caen entre 36h y 60h desde ahora (≈ 2 días ±12h)
  const desde = new Date(ahora.getTime() + 36 * 60 * 60 * 1000);
  const hasta = new Date(ahora.getTime() + 60 * 60 * 60 * 1000);

  let subs;
  try {
    subs = await prisma.subscription.findMany({
      where: {
        status:        'authorized',
        nextChargeDate: { gte: desde, lte: hasta },
      },
      include: { plan: true },
    });
  } catch (err) {
    console.error('[Recordatorios] Error consultando DB:', err.message);
    return;
  }

  console.log(`[Recordatorios] ${subs.length} suscripciones con cobro en ~48h`);
  if (!subs.length) return;

  for (const sub of subs) {
    try {
      // Obtener datos del shop
      const shop = sub.shopDomain
        ? await prisma.shop.findUnique({ where: { domain: sub.shopDomain } })
        : null;

      if (!shop || !shop.domain) {
        console.error(`[Recordatorios] Shop no encontrado para sub ${sub.id} (shopDomain: ${sub.shopDomain}) — saltando`);
        continue;
      }
      if (!shop.accessToken) {
        console.error(`[Recordatorios] Shop ${shop.domain} sin accessToken para sub ${sub.id} — saltando`);
        continue;
      }

      const shopDomain = shop.domain;
      const shopToken  = shop.accessToken;
      const storeName  = await getStoreName(shopDomain, shopToken);

      const nombre = sub.datosEnvio
        ? (() => { try { return JSON.parse(sub.datosEnvio).nombre; } catch { return null; } })()
        : null;

      await email.enviarRecordatorioCobro({
        email:      sub.shopifyCustomerEmail,
        nombre,
        planNombre: sub.plan?.nombre,
        monto:      sub.plan?.monto,
        storeName,
        fechaCobro: sub.nextChargeDate,
      });

      console.log(`[Recordatorios] ✅ Email enviado a ${sub.shopifyCustomerEmail} (cobro: ${sub.nextChargeDate?.toLocaleDateString('es-AR')})`);
    } catch (err) {
      console.error(`[Recordatorios] ❌ Error al enviar a ${sub.shopifyCustomerEmail}:`, err.message);
    }
  }
}

const INTERVALO_MS = 24 * 60 * 60 * 1000; // 24 horas

function iniciarJob() {
  // En producción: ejecutar la primera vez 10 minutos después de arrancar
  // (para no bloquear el startup ni spammear en reinicios frecuentes)
  if (process.env.NODE_ENV === 'production') {
    setTimeout(() => {
      enviarRecordatorios().catch(console.error);
    }, 10 * 60 * 1000);
  }

  // Luego, repetir cada 24 horas
  setInterval(() => {
    enviarRecordatorios().catch(console.error);
  }, INTERVALO_MS);

  console.log('📧 Job de recordatorios de cobro iniciado (cada 24h)');
}

module.exports = { iniciarJob, enviarRecordatorios };
