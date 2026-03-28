const { MercadoPagoConfig, PreApproval, Payment } = require('mercadopago');

/**
 * Devuelve clientes de MP inicializados con el token del shop.
 * Si no se pasa mpToken, usa MP_ACCESS_TOKEN del env (fallback single-store / legacy).
 */
function getClients(mpToken) {
  const token = mpToken || process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('No hay token de Mercado Pago configurado para esta tienda.');
  const config = new MercadoPagoConfig({ accessToken: token });
  return {
    preApproval: new PreApproval(config),
    payment:     new Payment(config),
  };
}

async function crearPreapproval({ plan, email, backUrl, mpToken }) {
  const { preApproval } = getClients(mpToken);
  const body = {
    reason: `Suscripción ${plan.nombre}`,
    auto_recurring: {
      frequency:          plan.frecuencia,
      frequency_type:     plan.tipoFrecuencia,
      transaction_amount: plan.monto,
      currency_id:        'ARS',
    },
    back_url: backUrl || `${process.env.APP_URL}/cliente/gracias`,
    status:   'pending',
  };
  if (email) body.payer_email = email;
  return preApproval.create({ body });
}

async function getPreapproval(preapprovalId, mpToken) {
  const { preApproval } = getClients(mpToken);
  return preApproval.get({ id: preapprovalId });
}

async function cancelarPreapproval(preapprovalId, mpToken) {
  const { preApproval } = getClients(mpToken);
  return preApproval.update({ id: preapprovalId, body: { status: 'cancelled' } });
}

async function pausarPreapproval(preapprovalId, mpToken) {
  const { preApproval } = getClients(mpToken);
  return preApproval.update({ id: preapprovalId, body: { status: 'paused' } });
}

async function reanudarPreapproval(preapprovalId, mpToken) {
  const { preApproval } = getClients(mpToken);
  return preApproval.update({ id: preapprovalId, body: { status: 'authorized' } });
}

async function getPago(paymentId, mpToken) {
  const { payment } = getClients(mpToken);
  return payment.get({ id: paymentId });
}

module.exports = {
  crearPreapproval,
  getPreapproval,
  cancelarPreapproval,
  pausarPreapproval,
  reanudarPreapproval,
  getPago,
};
