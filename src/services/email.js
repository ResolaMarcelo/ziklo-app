const { Resend } = require('resend');

// Inicialización lazy — evita crash si RESEND_API_KEY no está definida en dev
let _resend = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[email] RESEND_API_KEY no configurada — los emails no se enviarán');
      return null;
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// Dirección de envío — con dominio verificado en Resend usá: "Ziklo <contacto@zikloapp.com>"
// Sin dominio verificado, Resend permite: "Ziklo <onboarding@resend.dev>"
const FROM = process.env.RESEND_FROM || 'Ziklo <onboarding@resend.dev>';

function formatPrecio(num) {
  return '$' + Math.round(num).toLocaleString('es-AR');
}

async function enviarConfirmacionSuscripcion({ email, nombre, planNombre, monto, storeName, shopDomain }) {
  const precioFormateado = formatPrecio(monto);
  const fromName  = storeName || 'Tu tienda';
  const appUrl    = process.env.APP_URL || 'https://app.zikloapp.com';
  const portalUrl = shopDomain
    ? `${appUrl}/cliente?shop=${encodeURIComponent(shopDomain)}`
    : `${appUrl}/cliente`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:#009ee3;padding:32px 40px;text-align:center;">
              <div style="font-size:40px;">✅</div>
              <h1 style="color:white;margin:12px 0 0;font-size:22px;font-weight:700;">¡Suscripción activada!</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:15px;color:#202223;margin:0 0 24px;">
                Hola${nombre ? ' ' + nombre : ''},<br><br>
                Tu suscripción fue confirmada con éxito. A partir de ahora vas a recibir tu pedido <strong>todos los meses de forma automática</strong>.
              </p>

              <!-- Detalle -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:8px;padding:0;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6d7175;text-transform:uppercase;letter-spacing:.05em;">Detalle de tu suscripción</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;">Plan</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:600;">${planNombre || 'Suscripción mensual'}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Monto mensual</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:700;border-top:1px solid #e1e3e5;">${precioFormateado}/mes</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Frecuencia</td>
                        <td style="font-size:14px;color:#202223;text-align:right;border-top:1px solid #e1e3e5;">Mensual</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Chips -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="padding:4px;">
                    <span style="display:inline-block;font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid #e1e3e5;color:#6d7175;">📦 Entrega mensual</span>
                  </td>
                  <td style="padding:4px;">
                    <span style="display:inline-block;font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid #e1e3e5;color:#6d7175;">🚚 Envío incluido</span>
                  </td>
                  <td style="padding:4px;">
                    <span style="display:inline-block;font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid #e1e3e5;color:#6d7175;">✕ Cancelá cuando quieras</span>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#6d7175;margin:0 0 28px;">
                Mercado Pago realizará el cobro automáticamente cada mes. Si tenés alguna pregunta, respondé este email.
              </p>

              <!-- CTA portal cliente -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}"
                      style="display:inline-block;background:#009ee3;color:white;font-weight:700;font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:-.1px;">
                      Ver mis suscripciones →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size:12px;color:#8c9196;text-align:center;margin:0;">
                Pausá, cancelá o gestioná tu suscripción en cualquier momento.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e1e3e5;text-align:center;">
              <p style="font-size:12px;color:#8c9196;margin:0;">${fromName} · Este es un email automático</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `✅ Tu suscripción mensual está activa — ${fromName}`,
    html,
  });
}

async function enviarVerificacionEmail({ email, code, name }) {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verificá tu cuenta de Ziklo</title>
</head>
<body style="margin:0;padding:0;background:#0A0A0F;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0F;padding:48px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#16161F;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,.08);">

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;background:rgba(0,200,122,.12);border:1px solid rgba(0,200,122,.3);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 6h14L7 18h12" stroke="#00C87A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <span style="font-size:20px;font-weight:800;color:#F8FAFC;letter-spacing:-.3px;">Ziklo<span style="color:#00C87A">.</span></span>
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 48px;">
            <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#F8FAFC;letter-spacing:-.3px;">
              Verificá tu correo${name ? ', ' + name.split(' ')[0] : ''}
            </p>
            <p style="margin:0 0 36px;font-size:14px;color:#6B7280;line-height:1.6;">
              Usá el código de abajo para confirmar tu dirección de correo y activar tu cuenta en Ziklo. El código expira en <strong style="color:#F8FAFC;">15 minutos</strong>.
            </p>

            <!-- Código -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
              <tr><td align="center">
                <div style="background:#111118;border:1px solid rgba(0,200,122,.2);border-radius:14px;padding:28px 40px;display:inline-block;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.1em;">Tu código de verificación</p>
                  <div style="letter-spacing:12px;font-size:40px;font-weight:800;color:#00C87A;font-family:'Courier New',monospace;">${code}</div>
                </div>
              </td></tr>
            </table>

            <!-- Separador -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="border-top:1px solid rgba(255,255,255,.06);"></td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#4B5563;line-height:1.7;">
              Si no creaste una cuenta en Ziklo, podés ignorar este email con seguridad.<br>
              Nadie más puede ver este código.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 48px;border-top:1px solid rgba(255,255,255,.06);text-align:center;">
            <p style="margin:0;font-size:11px;color:#374151;">
              Ziklo · Suscripciones para Shopify &nbsp;·&nbsp;
              <a href="mailto:contacto@zikloapp.com" style="color:#6B7280;text-decoration:none;">contacto@zikloapp.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `${code} es tu código de verificación de Ziklo`,
    html,
  });
}

async function enviarResetPassword({ email, resetUrl }) {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#0a0a0f;padding:28px 40px;text-align:center;">
            <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px;">Ziklo<span style="color:#00C87A">.</span></span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#202223;">Recuperá tu contraseña</h2>
            <p style="font-size:14px;color:#6d7175;margin:0 0 28px;line-height:1.6;">
              Recibimos una solicitud para restablecer la contraseña de tu cuenta Ziklo.<br>
              Hacé clic en el botón para crear una nueva contraseña. El enlace expira en <strong>1 hora</strong>.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td align="center">
                <a href="${resetUrl}" style="display:inline-block;background:#00C87A;color:#000;font-weight:700;font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none;">
                  Restablecer contraseña
                </a>
              </td></tr>
            </table>
            <p style="font-size:12px;color:#8c9196;margin:24px 0 0;line-height:1.6;">
              Si no solicitaste este cambio, ignorá este email. Tu contraseña no cambiará.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px;border-top:1px solid #e1e3e5;text-align:center;">
            <p style="font-size:11px;color:#8c9196;margin:0;">Ziklo · Este es un email automático</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Restablecé tu contraseña de Ziklo',
    html,
  });
}

async function enviarMagicLink({ email: toEmail, magicUrl, storeName }) {
  const store = storeName || 'Tu tienda';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

          <!-- Header -->
          <tr>
            <td style="background:#009ee3;padding:32px 40px;text-align:center;">
              <div style="font-size:40px;">🔑</div>
              <h1 style="color:white;margin:12px 0 0;font-size:20px;font-weight:700;">Accedé a tus suscripciones</h1>
              <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px;">${store}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:15px;color:#202223;margin:0 0 8px;font-weight:600;">Tu link de acceso está listo</p>
              <p style="font-size:14px;color:#6d7175;margin:0 0 28px;line-height:1.6;">
                Hacé clic en el botón para ver y gestionar tus suscripciones activas.<br>
                El link expira en <strong style="color:#202223;">15 minutos</strong> y es de un solo uso.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${magicUrl}"
                      style="display:inline-block;background:#009ee3;color:white;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:-.1px;">
                      Ver mis suscripciones →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Alternativa texto -->
              <div style="background:#f6f6f7;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="font-size:11px;font-weight:600;color:#6d7175;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px;">¿El botón no funciona? Copiá este link:</p>
                <p style="font-size:12px;color:#009ee3;margin:0;word-break:break-all;font-family:'Courier New',monospace;">${magicUrl}</p>
              </div>

              <p style="font-size:12px;color:#8c9196;margin:0;line-height:1.6;">
                Si no pediste acceso a tus suscripciones, podés ignorar este email con seguridad.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e1e3e5;text-align:center;">
              <p style="font-size:12px;color:#8c9196;margin:0;">${store} · Este es un email automático</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `🔑 Tu link de acceso a tus suscripciones — ${store}`,
    html,
  });
}

async function enviarPagoFallido({ email: toEmail, nombre, planNombre, monto, storeName }) {
  const precioFormateado = formatPrecio(monto);
  const fromName = storeName || 'Tu tienda';
  const mpUrl = 'https://www.mercadopago.com.ar/subscriptions';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:#d82c0d;padding:32px 40px;text-align:center;">
              <div style="font-size:40px;">⚠️</div>
              <h1 style="color:white;margin:12px 0 0;font-size:22px;font-weight:700;">Tu pago no fue procesado</h1>
              <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px;">${fromName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:15px;color:#202223;margin:0 0 20px;">
                Hola${nombre ? ' ' + nombre : ''},<br><br>
                Intentamos procesar el cobro de tu suscripción, pero el pago no pudo completarse. Tu suscripción fue pausada temporalmente.
              </p>

              <!-- Detalle -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6d7175;text-transform:uppercase;letter-spacing:.05em;">Detalle del cobro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;">Plan</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:600;">${planNombre || 'Suscripción mensual'}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Monto</td>
                        <td style="font-size:14px;color:#d82c0d;text-align:right;font-weight:700;border-top:1px solid #e1e3e5;">${precioFormateado}/mes</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Estado</td>
                        <td style="font-size:14px;text-align:right;border-top:1px solid #e1e3e5;">
                          <span style="display:inline-block;background:rgba(216,44,13,.1);color:#d82c0d;border:1px solid rgba(216,44,13,.2);border-radius:20px;font-size:12px;font-weight:600;padding:3px 10px;">Pago rechazado</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <p style="font-size:14px;color:#202223;margin:0 0 16px;font-weight:600;">¿Qué podés hacer?</p>
              <p style="font-size:14px;color:#6d7175;margin:0 0 24px;line-height:1.6;">
                Verificá que tu método de pago en Mercado Pago esté activo y tenga fondos suficientes.
                Una vez que actualices tu información de pago, Mercado Pago reintentará el cobro automáticamente.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${mpUrl}"
                      style="display:inline-block;background:#009ee3;color:white;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:-.1px;">
                      Actualizar método de pago →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px;color:#8c9196;margin:0;line-height:1.6;">
                Si crees que esto es un error o necesitás ayuda, respondé este email y te ayudamos a resolverlo.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e1e3e5;text-align:center;">
              <p style="font-size:12px;color:#8c9196;margin:0;">${fromName} · Este es un email automático</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `⚠️ Tu pago no pudo procesarse — ${fromName}`,
    html,
  });
}

async function enviarPagoFallidoMerchant({ merchantEmail, clientEmail, planNombre, monto, storeName }) {
  const precioFormateado = formatPrecio(monto);
  const fromName = storeName || 'Tu tienda';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:#0a0a0f;padding:28px 40px;text-align:center;">
              <span style="font-size:20px;font-weight:800;color:#fff;letter-spacing:-.3px;">Ziklo<span style="color:#00C87A">.</span></span>
            </td>
          </tr>
          <!-- Alert bar -->
          <tr>
            <td style="background:rgba(216,44,13,.06);border-left:4px solid #d82c0d;padding:14px 24px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#d82c0d;">⚠️ Pago fallido — acción requerida</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:15px;color:#202223;margin:0 0 24px;line-height:1.6;">
                Un cobro automático de suscripción no pudo procesarse. Te notificamos para que puedas hacer seguimiento con el cliente.
              </p>

              <!-- Detalle -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6d7175;text-transform:uppercase;letter-spacing:.05em;">Detalle del pago fallido</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#6d7175;padding:6px 0;">Cliente</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:600;">${clientEmail}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#6d7175;padding:6px 0;border-top:1px solid #e1e3e5;">Plan</td>
                        <td style="font-size:14px;color:#202223;text-align:right;border-top:1px solid #e1e3e5;">${planNombre || 'Suscripción mensual'}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#6d7175;padding:6px 0;border-top:1px solid #e1e3e5;">Monto no cobrado</td>
                        <td style="font-size:14px;color:#d82c0d;text-align:right;font-weight:700;border-top:1px solid #e1e3e5;">${precioFormateado}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#6d7175;padding:6px 0;border-top:1px solid #e1e3e5;">Tienda</td>
                        <td style="font-size:14px;color:#202223;text-align:right;border-top:1px solid #e1e3e5;">${fromName}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;color:#6d7175;margin:0;line-height:1.6;">
                Ya le enviamos un email automático al cliente para que actualice su método de pago.
                Mercado Pago reintentará el cobro automáticamente.<br><br>
                Si querés revisar el estado de la suscripción, podés hacerlo desde el panel de Ziklo.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e1e3e5;text-align:center;">
              <p style="font-size:12px;color:#8c9196;margin:0;">Ziklo · Sistema de suscripciones para ${fromName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: merchantEmail,
    subject: `⚠️ Pago fallido — ${clientEmail} · ${precioFormateado}`,
    html,
  });
}

async function enviarCancelacionConfirmacion({ email: toEmail, nombre, planNombre, monto, storeName }) {
  const precioFormateado = formatPrecio(monto);
  const fromName = storeName || 'Tu tienda';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:#6d7175;padding:32px 40px;text-align:center;">
              <div style="font-size:40px;">👋</div>
              <h1 style="color:white;margin:12px 0 0;font-size:22px;font-weight:700;">Tu suscripción fue cancelada</h1>
              <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px;">${fromName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:15px;color:#202223;margin:0 0 24px;line-height:1.6;">
                Hola${nombre ? ' ' + nombre : ''},<br><br>
                Confirmamos que tu suscripción fue cancelada exitosamente. No recibirás más cobros automáticos.
              </p>

              <!-- Detalle -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6d7175;text-transform:uppercase;letter-spacing:.05em;">Suscripción cancelada</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;">Plan</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:600;">${planNombre || 'Suscripción mensual'}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Monto</td>
                        <td style="font-size:14px;color:#6d7175;text-align:right;border-top:1px solid #e1e3e5;text-decoration:line-through;">${precioFormateado}/mes</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Estado</td>
                        <td style="font-size:14px;text-align:right;border-top:1px solid #e1e3e5;">
                          <span style="display:inline-block;background:#f6f6f7;color:#6d7175;border:1px solid #e1e3e5;border-radius:20px;font-size:12px;font-weight:600;padding:3px 10px;">Cancelada</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="font-size:14px;color:#6d7175;margin:0;line-height:1.6;">
                Si cambiás de opinión, podés volver a suscribirte cuando quieras desde la tienda.<br>
                Si tenés alguna pregunta, respondé este email y te ayudamos.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e1e3e5;text-align:center;">
              <p style="font-size:12px;color:#8c9196;margin:0;">${fromName} · Este es un email automático</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Tu suscripción en ${fromName} fue cancelada`,
    html,
  });
}

async function enviarRecordatorioCobro({ email: toEmail, nombre, planNombre, monto, storeName, fechaCobro }) {
  const precioFormateado = formatPrecio(monto);
  const fromName = storeName || 'Tu tienda';
  const fechaFormateada = new Date(fechaCobro).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const mpUrl = 'https://www.mercadopago.com.ar/subscriptions';

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="background:#009ee3;padding:32px 40px;text-align:center;">
              <div style="font-size:40px;">🔔</div>
              <h1 style="color:white;margin:12px 0 0;font-size:22px;font-weight:700;">Tu próximo cobro es en 2 días</h1>
              <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px;">${fromName}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:15px;color:#202223;margin:0 0 24px;line-height:1.6;">
                Hola${nombre ? ' ' + nombre : ''},<br><br>
                Te recordamos que Mercado Pago procesará el cobro automático de tu suscripción el <strong>${fechaFormateada}</strong>.
              </p>

              <!-- Detalle -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f7;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6d7175;text-transform:uppercase;letter-spacing:.05em;">Detalle del cobro</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;">Plan</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:600;">${planNombre || 'Suscripción mensual'}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Monto a cobrar</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:700;border-top:1px solid #e1e3e5;">${precioFormateado}</td>
                      </tr>
                      <tr>
                        <td style="font-size:14px;color:#202223;padding:6px 0;border-top:1px solid #e1e3e5;">Fecha</td>
                        <td style="font-size:14px;color:#202223;text-align:right;font-weight:600;border-top:1px solid #e1e3e5;">${fechaFormateada}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA secundario -->
              <p style="font-size:14px;color:#6d7175;margin:0 0 16px;line-height:1.6;">
                Asegurate de que tu método de pago en Mercado Pago esté activo para que el cobro se procese sin problemas.
              </p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
                <tr>
                  <td align="center">
                    <a href="${mpUrl}"
                      style="display:inline-block;background:white;color:#009ee3;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;border:1.5px solid #009ee3;">
                      Ver mi método de pago
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px;color:#8c9196;margin:0;line-height:1.6;">
                Si querés pausar o cancelar tu suscripción antes del cobro, podés hacerlo desde el portal de clientes.<br>
                Si tenés alguna duda, respondé este email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #e1e3e5;text-align:center;">
              <p style="font-size:12px;color:#8c9196;margin:0;">${fromName} · Este es un email automático</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `🔔 Tu próximo cobro de ${precioFormateado} es en 2 días — ${fromName}`,
    html,
  });
}

// ── Envío genérico (para notificaciones internas) ──────────────────────────
async function enviarEmail({ to, subject, html }) {
  const resend = getResend();
  if (!resend) return;
  await resend.emails.send({ from: FROM, to, subject, html });
}

module.exports = {
  enviarConfirmacionSuscripcion,
  enviarVerificacionEmail,
  enviarResetPassword,
  enviarMagicLink,
  enviarPagoFallido,
  enviarPagoFallidoMerchant,
  enviarCancelacionConfirmacion,
  enviarRecordatorioCobro,
  enviarEmail,
};
