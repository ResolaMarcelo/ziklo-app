const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function formatPrecio(num) {
  return '$' + Math.round(num).toLocaleString('es-AR');
}

async function enviarConfirmacionSuscripcion({ email, nombre, planNombre, monto, storeName }) {
  const precioFormateado = formatPrecio(monto);
  const fromName = storeName || 'Tu tienda';
  const from = `"${fromName}" <${process.env.SMTP_USER}>`;

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

              <p style="font-size:13px;color:#6d7175;margin:0;">
                Mercado Pago realizará el cobro automáticamente cada mes. Si tenés alguna pregunta, respondé este email.
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

  await transporter.sendMail({
    from,
    to: email,
    subject: `✅ Tu suscripción mensual está activa — ${fromName}`,
    html,
  });
}

module.exports = { enviarConfirmacionSuscripcion };
