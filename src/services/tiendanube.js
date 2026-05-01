const fetch = require('node-fetch');

const API_BASE = 'https://api.tiendanube.com/v1';
const USER_AGENT = 'Ziklo - Suscripciones (contacto@zikloapp.com)';

// ── Helper: request genérico ────────────────────────────────────────────────

async function apiRequest(storeId, token, method, path, body = null) {
  if (!storeId || !token) throw new Error('Tiendanube storeId o token no disponibles');

  const url = `${API_BASE}/${storeId}${path}`;
  const headers = {
    'Authentication': `bearer ${token}`,
    'User-Agent': USER_AGENT,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tiendanube API ${method} ${path} error ${res.status}: ${text}`);
  }

  // 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ── Store info ──────────────────────────────────────────────────────────────

async function getStoreInfo(storeId, token) {
  const data = await apiRequest(storeId, token, 'GET', '/store');
  return {
    id: String(data.id),
    name: data.name?.es || data.name?.pt || Object.values(data.name || {})[0] || '',
    email: data.email || null,
    domain: data.url_with_protocol ? data.url_with_protocol.replace(/^https?:\/\//, '').replace(/\/$/, '') : null,
    originalDomain: data.original_domain || null,
  };
}

// ── Products ────────────────────────────────────────────────────────────────

async function getProducts(storeId, token) {
  // Tiendanube pagina por defecto a 30, max 200
  const data = await apiRequest(storeId, token, 'GET', '/products?per_page=200');
  return data.map(p => {
    const firstVariant = p.variants?.[0] || null;
    return {
      id: String(p.id),
      title: p.name?.es || p.name?.pt || Object.values(p.name || {})[0] || '',
      image: p.images?.[0]?.src || null,
      price: firstVariant ? parseFloat(firstVariant.price) : null,
      variantId: firstVariant ? String(firstVariant.id) : null,
    };
  });
}

// ── Create order ────────────────────────────────────────────────────────────

async function createOrder(storeId, token, { customerId, email, lineItems, note, shippingAddress }) {
  const products = lineItems.map(li => ({
    variant_id: parseInt(li.variant_id, 10),
    quantity: li.quantity || 1,
  }));

  const orderData = {
    status: 'open',
    payment_status: 'paid',
    shipping_status: 'unpacked',
    products,
    note,
    send_confirmation_email: false,
    send_fulfillment_email: false,
  };

  if (customerId && customerId !== 'desconocido') {
    orderData.customer = { id: parseInt(customerId, 10) };
  } else if (email) {
    orderData.customer = { email };
  }

  if (shippingAddress) {
    orderData.shipping_address = {
      first_name: shippingAddress.first_name || '',
      last_name: shippingAddress.last_name || '',
      address: shippingAddress.address1 || '',
      city: shippingAddress.city || '',
      province: shippingAddress.province || '',
      zipcode: shippingAddress.zip || '',
      country: shippingAddress.country || 'AR',
      phone: shippingAddress.phone || '',
    };
  }

  const order = await apiRequest(storeId, token, 'POST', '/orders', orderData);

  return {
    id: String(order.id),
    orderNumber: order.number || null,
  };
}

// ── Customers ───────────────────────────────────────────────────────────────

async function findOrCreateCustomer(storeId, token, email, name) {
  // Buscar cliente por email
  try {
    const customers = await apiRequest(storeId, token, 'GET',
      `/customers?q=${encodeURIComponent(email)}&per_page=1`);
    if (customers && customers.length > 0) {
      return String(customers[0].id);
    }
  } catch (e) {
    console.error('Error buscando cliente en Tiendanube:', e.message);
  }

  // Crear nuevo
  try {
    const customer = await apiRequest(storeId, token, 'POST', '/customers', {
      email,
      name: name || email.split('@')[0],
      send_email: false,
    });
    return String(customer.id);
  } catch (e) {
    console.error('Error creando cliente en Tiendanube:', e.message);
    return null;
  }
}

// ── Scripts (inyectar widget) ───────────────────────────────────────────────

async function injectWidgetScript(storeId, token) {
  const APP_URL = process.env.APP_URL || 'https://app.zikloapp.com';
  const scriptSrc = `${APP_URL}/widget.js?platform=tiendanube&storeId=${storeId}`;

  // Listar scripts existentes para evitar duplicados
  try {
    const scripts = await apiRequest(storeId, token, 'GET', '/scripts');
    const existing = scripts.find(s => s.src && s.src.includes('widget.js'));
    if (existing) {
      console.log(`Widget script ya existe en Tiendanube store ${storeId} (script ID: ${existing.id})`);
      return { ok: true, alreadyExists: true, scriptId: String(existing.id) };
    }
  } catch (e) {
    console.error('Error listando scripts:', e.message);
  }

  // Crear script nuevo
  const script = await apiRequest(storeId, token, 'POST', '/scripts', {
    src: scriptSrc,
    event: 'onload',
    where: 'product',
  });

  console.log(`Widget script inyectado en Tiendanube store ${storeId} (script ID: ${script.id})`);
  return { ok: true, scriptId: String(script.id) };
}

// ── Remove script ───────────────────────────────────────────────────────────

async function removeWidgetScript(storeId, token) {
  try {
    const scripts = await apiRequest(storeId, token, 'GET', '/scripts');
    const existing = scripts.find(s => s.src && s.src.includes('widget.js'));
    if (existing) {
      await apiRequest(storeId, token, 'DELETE', `/scripts/${existing.id}`);
      console.log(`Widget script eliminado de Tiendanube store ${storeId}`);
    }
  } catch (e) {
    console.error('Error eliminando script:', e.message);
  }
}

module.exports = {
  apiRequest,
  getStoreInfo,
  getProducts,
  createOrder,
  findOrCreateCustomer,
  injectWidgetScript,
  removeWidgetScript,
};
