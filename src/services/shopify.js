const fetch = require('node-fetch');

const SHOP = process.env.SHOPIFY_SHOP_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const BASE = `https://${SHOP}/admin/api/2024-01`;

/**
 * Llamada a Shopify API usando las credenciales del .env (app de un solo shop).
 * Compatibilidad hacia atrás con el código existente.
 */
async function shopifyRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${endpoint}`, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${err}`);
  }
  return res.json();
}

/**
 * Llamada a Shopify API para un shop específico (multi-tenant).
 * Si no se proveen domain/token, cae al env var.
 */
async function shopifyRequestForShop(domain, token, endpoint, method = 'GET', body = null) {
  const d = domain || SHOP;
  const t = token || TOKEN;
  if (!d || !t) throw new Error('Shop domain o access token no disponibles');

  const base = `https://${d}/admin/api/2024-01`;
  const options = {
    method,
    headers: {
      'X-Shopify-Access-Token': t,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${base}${endpoint}`, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function getCustomer(customerId) {
  const data = await shopifyRequest(`/customers/${customerId}.json`);
  return data.customer;
}

async function getCustomers() {
  const data = await shopifyRequest('/customers.json?limit=250');
  return data.customers;
}

async function crearOrden({ customerId, lineItems, nota = '', envio = null, email = null }) {
  const order = {
    line_items: lineItems,
    financial_status: 'paid',
    note: nota || 'Orden creada automáticamente por suscripción',
    send_receipt: true,
    tags: 'suscripcion,mp-auto',
  };

  if (customerId && customerId !== 'desconocido') {
    order.customer = { id: customerId };
  } else if (email) {
    order.email = email;
  }

  if (envio) {
    order.shipping_address = {
      first_name: envio.nombre || '',
      last_name:  envio.apellido || '',
      address1:   envio.direccion || '',
      city:       envio.ciudad || '',
      province:   envio.provincia || '',
      zip:        envio.cp || '',
      country:    'Argentina',
      country_code: 'AR',
      phone:      envio.telefono || '',
    };
  }

  const data = await shopifyRequest('/orders.json', 'POST', { order });
  return data.order;
}

async function getOrdenes() {
  const data = await shopifyRequest('/orders.json?limit=50&status=any');
  return data.orders;
}

let _shopName = null;
async function getShopName() {
  if (_shopName) return _shopName;
  const data = await shopifyRequest('/shop.json');
  _shopName = data.shop.name;
  return _shopName;
}

module.exports = { getCustomer, getCustomers, crearOrden, getOrdenes, shopifyRequest, shopifyRequestForShop, getShopName };
