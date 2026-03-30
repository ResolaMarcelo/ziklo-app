const fetch  = require('node-fetch');
const prisma = require('../lib/prisma');

const TOKEN_URL    = 'https://a.klaviyo.com/oauth/token';
const EVENTS_URL   = 'https://a.klaviyo.com/api/events/';
const API_REVISION = '2024-10-15';

const CLIENT_ID     = process.env.KLAVIYO_CLIENT_ID;
const CLIENT_SECRET = process.env.KLAVIYO_CLIENT_SECRET;

// ── Token refresh ─────────────────────────────────────────────────────────────

/**
 * Devuelve un access token válido para el shop.
 * Si está por expirar (< 5 min), lo renueva automáticamente.
 */
async function getValidToken(shop) {
  if (!shop?.klaviyoAccessToken) return null;

  const now     = new Date();
  const expiry  = shop.klaviyoTokenExpiry ? new Date(shop.klaviyoTokenExpiry) : null;
  const expired = !expiry || expiry.getTime() - now.getTime() < 5 * 60 * 1000;

  if (!expired) return shop.klaviyoAccessToken;

  // Refrescar
  if (!shop.klaviyoRefreshToken) return null;

  try {
    const res  = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: shop.klaviyoRefreshToken,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }).toString(),
    });

    const data = await res.json();
    if (!data.access_token) {
      console.error('Klaviyo token refresh failed:', data);
      return null;
    }

    const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await prisma.shop.update({
      where: { domain: shop.domain },
      data: {
        klaviyoAccessToken:  data.access_token,
        klaviyoRefreshToken: data.refresh_token || shop.klaviyoRefreshToken,
        klaviyoTokenExpiry:  newExpiry,
      },
    });

    console.log(`Klaviyo token renovado para: ${shop.domain}`);
    return data.access_token;
  } catch (err) {
    console.error('Error renovando token Klaviyo:', err.message);
    return null;
  }
}

// ── Trackear evento ───────────────────────────────────────────────────────────

/**
 * Envía un evento de suscripción a Klaviyo.
 * Si el shop no tiene Klaviyo conectado, no hace nada (silencioso).
 *
 * @param {object} shop       - Registro Shop de la DB (con campos klaviyo*)
 * @param {string} eventName  - Nombre del evento: "Subscription Created", etc.
 * @param {string} email      - Email del suscriptor
 * @param {object} properties - Datos adicionales del evento
 */
async function trackEvent(shop, eventName, email, properties = {}) {
  if (!shop?.klaviyoAccessToken) return;

  const token = await getValidToken(shop);
  if (!token) return;

  try {
    const body = {
      data: {
        type: 'event',
        attributes: {
          metric: {
            data: { type: 'metric', attributes: { name: eventName } },
          },
          profile: {
            data: { type: 'profile', attributes: { email } },
          },
          properties,
          time: new Date().toISOString(),
        },
      },
    };

    const res = await fetch(EVENTS_URL, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'revision':       API_REVISION,
        'Content-Type':   'application/json',
        'Accept':         'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Klaviyo trackEvent error [${eventName}]:`, err);
    } else {
      console.log(`Klaviyo: evento "${eventName}" enviado a ${email}`);
    }
  } catch (err) {
    console.error('Klaviyo trackEvent exception:', err.message);
  }
}

// ── Eventos específicos ───────────────────────────────────────────────────────

async function subscriptionCreated(shop, sub) {
  await trackEvent(shop, 'Subscription Created', sub.shopifyCustomerEmail, {
    plan:      sub.plan?.nombre     || null,
    monto:     sub.plan?.monto      || null,
    producto:  sub.productId        || null,
    shopDomain: sub.shopDomain      || null,
  });
}

async function subscriptionRenewed(shop, sub, pago) {
  await trackEvent(shop, 'Subscription Renewed', sub.shopifyCustomerEmail, {
    plan:       sub.plan?.nombre    || null,
    monto:      pago.monto          || null,
    mpPaymentId: pago.mpPaymentId   || null,
  });
}

async function subscriptionPaused(shop, sub) {
  await trackEvent(shop, 'Subscription Paused', sub.shopifyCustomerEmail, {
    plan:  sub.plan?.nombre || null,
    monto: sub.plan?.monto  || null,
  });
}

async function subscriptionResumed(shop, sub) {
  await trackEvent(shop, 'Subscription Resumed', sub.shopifyCustomerEmail, {
    plan:  sub.plan?.nombre || null,
    monto: sub.plan?.monto  || null,
  });
}

async function subscriptionCancelled(shop, sub, reason) {
  await trackEvent(shop, 'Subscription Cancelled', sub.shopifyCustomerEmail, {
    plan:   sub.plan?.nombre || null,
    monto:  sub.plan?.monto  || null,
    reason: reason           || null,
  });
}

module.exports = {
  getValidToken,
  trackEvent,
  subscriptionCreated,
  subscriptionRenewed,
  subscriptionPaused,
  subscriptionResumed,
  subscriptionCancelled,
};
