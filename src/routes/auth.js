const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fetch = require('node-fetch');

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SCOPES = 'read_customers,write_customers,read_orders,write_orders';

// GET /auth?shop=tu-tienda.myshopify.com
// Inicia el flujo OAuth — redirige a Shopify para pedir permisos
router.get('/', (req, res) => {
  const shop = req.query.shop || process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) return res.send('Falta el parámetro ?shop=tu-tienda.myshopify.com');

  const redirectUri = `${process.env.APP_URL}/auth/callback`;
  const nonce = crypto.randomBytes(16).toString('hex');

  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
  res.redirect(authUrl);
});

// GET /auth/callback — Shopify redirige acá con el código de autorización
router.get('/callback', async (req, res) => {
  const { shop, code } = req.query;

  if (!shop || !code) return res.status(400).send('Parámetros inválidos');

  try {
    // Intercambiar el código por el access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });

    const data = await tokenRes.json();
    const accessToken = data.access_token;

    if (!accessToken) {
      return res.status(500).send('No se pudo obtener el access token: ' + JSON.stringify(data));
    }

    // Mostrar el token al usuario para que lo copie al .env
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>Token obtenido</title>
      <style>
        body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; }
        .token { background: #f0f9ff; border: 2px solid #009ee3; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 14px; word-break: break-all; margin: 16px 0; }
        .steps { background: #f6f6f7; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 2; }
        h1 { color: #008060; }
        .copy-btn { background: #008060; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
      </style>
      </head>
      <body>
        <h1>✅ App instalada correctamente</h1>
        <p>Copiá este token y pegalo en tu archivo <code>.env</code>:</p>
        <div class="token" id="token">${accessToken}</div>
        <button class="copy-btn" onclick="navigator.clipboard.writeText('${accessToken}');this.textContent='¡Copiado!'">Copiar token</button>
        <div class="steps" style="margin-top:24px">
          <strong>Próximos pasos:</strong><br>
          1. Abrí el archivo <code>.env</code> en tu proyecto<br>
          2. Reemplazá <code>SHOPIFY_ACCESS_TOKEN=shpat_xxx...</code> con este token<br>
          3. También agregá: <code>SHOPIFY_SHOP_DOMAIN=${shop}</code><br>
          4. Guardá y reiniciá la app con <code>npm run dev</code>
        </div>
      </body>
      </html>
    `);

    // También loguearlo en la consola
    console.log('\n========================================');
    console.log('✅ ACCESS TOKEN OBTENIDO:');
    console.log(accessToken);
    console.log('SHOP:', shop);
    console.log('Pegalo en tu .env como SHOPIFY_ACCESS_TOKEN');
    console.log('========================================\n');

  } catch (err) {
    res.status(500).send('Error: ' + err.message);
  }
});

module.exports = router;
