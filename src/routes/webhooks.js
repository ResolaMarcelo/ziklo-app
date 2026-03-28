const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const mp = require('../services/mercadopago');
const shopify = require('../services/shopify');
const email = require('../services/email');

// POST /webhooks/mp - recibir notificaciones de Mercado Pago
router.post('/mp', async (req, res) => {
  // Responder 200 inmediatamente para que MP no reintente
  res.sendStatus(200);

  try {
    let body;
    try {
      body = JSON.parse(req.body.toString());
    } catch {
      body = req.body;
    }

    const { type, data } = body;
    console.log('Webhook MP recibido:', type, data?.id);

    // Notificación de pago
    if (type === 'payment' && data?.id) {
      const pago = await mp.getPago(data.id);
      console.log('Pago ID:', pago.id, '| Status:', pago.status, '| Preapproval:', pago.preapproval_id);

      if (pago.status === 'approved' && pago.preapproval_id) {
        const sub = await prisma.subscription.findUnique({
          where: { mpPreapprovalId: pago.preapproval_id },
          include: { plan: true },
        });

        if (!sub) {
          console.log('Suscripción no encontrada para preapproval:', pago.preapproval_id);
          return;
        }

        // Registrar el pago en BD
        await prisma.pago.upsert({
          where: { mpPaymentId: String(pago.id) },
          update: { status: pago.status },
          create: {
            mpPaymentId: String(pago.id),
            monto: pago.transaction_amount,
            status: pago.status,
            subscriptionId: sub.id,
          },
        });

        // Crear orden en Shopify
        if (sub.variantId) {
          try {
            const envio = sub.datosEnvio ? JSON.parse(sub.datosEnvio) : null;
            const orden = await shopify.crearOrden({
              customerId: sub.shopifyCustomerId,
              email: sub.shopifyCustomerEmail,
              lineItems: [{ variant_id: sub.variantId, quantity: sub.qty || 1 }],
              nota: `Pago automático suscripción ${sub.plan.nombre} - MP ID: ${pago.id}`,
              envio,
            });
            console.log('Orden Shopify creada:', orden.id);
          } catch (err) {
            console.error('Error al crear orden Shopify:', err.message);
          }
        }
      }
    }

    // Notificación de cambio en preapproval (suscripción)
    if (type === 'subscription_preapproval' && data?.id) {
      const preapproval = await mp.getPreapproval(data.id);
      console.log('Preapproval actualizado:', preapproval.id, '| Status:', preapproval.status);

      const subs = await prisma.subscription.findMany({
        where: { mpPreapprovalId: data.id },
        include: { plan: true },
      });

      await prisma.subscription.updateMany({
        where: { mpPreapprovalId: data.id },
        data: { status: preapproval.status },
      });

      // Enviar email de confirmación cuando se activa
      if (preapproval.status === 'authorized' && subs.length > 0) {
        const sub = subs[0];
        try {
          const storeName = await shopify.getShopName().catch(() => process.env.STORE_NAME);
          await email.enviarConfirmacionSuscripcion({
            email: sub.shopifyCustomerEmail,
            nombre: sub.datosEnvio ? JSON.parse(sub.datosEnvio).nombre : null,
            planNombre: sub.plan.nombre,
            monto: sub.plan.monto,
            storeName,
          });
          console.log('Email de confirmación enviado a:', sub.shopifyCustomerEmail);
        } catch (err) {
          console.error('Error enviando email de confirmación:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('Error procesando webhook:', err.message);
  }
});

module.exports = router;
