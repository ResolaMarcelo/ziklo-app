const fetch = require('node-fetch');

const API_VERSION = '2025-04';

// ── GraphQL wrapper ──────────────────────────────────────────────────────────

async function graphqlRequest(domain, token, query, variables = {}) {
  if (!domain || !token) throw new Error('Shop domain o access token no disponibles');

  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL error ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.errors?.length) {
    const msg = json.errors.map(e => e.message).join('; ');
    throw new Error(`Shopify GraphQL: ${msg}`);
  }

  return json.data;
}

// ── Helper: extraer ID numérico de un GID ────────────────────────────────────
function numericId(gid) {
  if (!gid) return null;
  return gid.split('/').pop();
}

// ── Shop info ────────────────────────────────────────────────────────────────

async function getShopInfo(domain, token) {
  const data = await graphqlRequest(domain, token, `{
    shop {
      name
      email
      myshopifyDomain
    }
  }`);
  return {
    name:   data.shop.name,
    email:  data.shop.email,
    domain: data.shop.myshopifyDomain,
  };
}

// ── Products ─────────────────────────────────────────────────────────────────

async function getProducts(domain, token) {
  const data = await graphqlRequest(domain, token, `{
    products(first: 250) {
      edges {
        node {
          id
          title
          featuredImage {
            url
          }
          variants(first: 1) {
            edges {
              node {
                id
                price
              }
            }
          }
        }
      }
    }
  }`);
  return data.products.edges.map(({ node }) => {
    const firstVariant = node.variants?.edges?.[0]?.node || null;
    return {
      id:        numericId(node.id),
      title:     node.title,
      image:     node.featuredImage?.url || null,
      price:     firstVariant ? parseFloat(firstVariant.price) : null,
      variantId: firstVariant ? numericId(firstVariant.id) : null,
    };
  });
}

// ── Create order ─────────────────────────────────────────────────────────────

async function createOrder(domain, token, { customerId, email, lineItems, note, tags, shippingAddress }) {
  // Construir input para draftOrderCreate + draftOrderComplete
  // Usamos draftOrder porque orderCreate requiere scope write_orders y es más flexible
  const lineItemsInput = lineItems.map(li => ({
    variantId: `gid://shopify/ProductVariant/${li.variant_id}`,
    quantity:  li.quantity || 1,
  }));

  const input = {
    email,
    note,
    tags: Array.isArray(tags) ? tags : (tags || '').split(',').map(t => t.trim()),
    lineItems: lineItemsInput,
  };

  if (customerId && customerId !== 'desconocido') {
    input.customerId = `gid://shopify/Customer/${customerId}`;
  }

  if (shippingAddress) {
    input.shippingAddress = {
      firstName:  shippingAddress.first_name || '',
      lastName:   shippingAddress.last_name || '',
      address1:   shippingAddress.address1 || '',
      city:       shippingAddress.city || '',
      province:   shippingAddress.province || '',
      zip:        shippingAddress.zip || '',
      country:    shippingAddress.country || 'AR',
      phone:      shippingAddress.phone || '',
    };
  }

  // Paso 1: Crear draft order
  const draftData = await graphqlRequest(domain, token, `
    mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { input });

  const draftResult = draftData.draftOrderCreate;
  if (draftResult.userErrors?.length) {
    throw new Error(`Shopify draftOrderCreate: ${draftResult.userErrors.map(e => e.message).join('; ')}`);
  }

  const draftOrderId = draftResult.draftOrder.id;

  // Paso 2: Completar el draft order (lo convierte en orden real marcada como paid)
  const completeData = await graphqlRequest(domain, token, `
    mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
      draftOrderComplete(id: $id, paymentPending: $paymentPending) {
        draftOrder {
          order {
            id
            name
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `, { id: draftOrderId, paymentPending: false });

  const completeResult = completeData.draftOrderComplete;
  if (completeResult.userErrors?.length) {
    throw new Error(`Shopify draftOrderComplete: ${completeResult.userErrors.map(e => e.message).join('; ')}`);
  }

  const order = completeResult.draftOrder.order;
  return {
    id:          numericId(order.id),
    orderNumber: parseInt(order.name.replace('#', ''), 10) || null,
  };
}

// ── Webhook subscription ─────────────────────────────────────────────────────

// Mapeo de topics REST → GraphQL enum
const TOPIC_MAP = {
  'app/uninstalled':       'APP_UNINSTALLED',
  'customers/data_request': 'CUSTOMERS_DATA_REQUEST',
  'customers/redact':      'CUSTOMERS_REDACT',
  'shop/redact':           'SHOP_REDACT',
};

async function createWebhookSubscription(domain, token, topic, callbackUrl) {
  const gqlTopic = TOPIC_MAP[topic] || topic;

  const data = await graphqlRequest(domain, token, `
    mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `, {
    topic: gqlTopic,
    webhookSubscription: {
      callbackUrl,
      format: 'JSON',
    },
  });

  const result = data.webhookSubscriptionCreate;
  if (result.userErrors?.length) {
    // "already exists" no es un error real
    const msgs = result.userErrors.map(e => e.message).join('; ');
    if (msgs.toLowerCase().includes('already') || msgs.toLowerCase().includes('exists')) {
      return { ok: true, alreadyExists: true };
    }
    throw new Error(`Shopify webhookSubscriptionCreate: ${msgs}`);
  }

  return { ok: true };
}

module.exports = {
  graphqlRequest,
  getShopInfo,
  getProducts,
  createOrder,
  createWebhookSubscription,
};
