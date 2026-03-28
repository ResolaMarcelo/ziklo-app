const { MercadoPagoConfig, PreApproval, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const preApprovalClient = new PreApproval(client);
const paymentClient = new Payment(client);

async function crearPreapproval({ plan, email, backUrl }) {
  const body = {
    reason: `Suscripción ${plan.nombre}`,
    auto_recurring: {
      frequency: plan.frecuencia,
      frequency_type: plan.tipoFrecuencia,
      transaction_amount: plan.monto,
      currency_id: 'ARS',
    },
    back_url: backUrl || `${process.env.APP_URL}/cliente/gracias`,
    status: 'pending',
  };
  if (email) body.payer_email = email;

  const resultado = await preApprovalClient.create({ body });
  return resultado;
}

async function getPreapproval(preapprovalId) {
  const resultado = await preApprovalClient.get({ id: preapprovalId });
  return resultado;
}

async function cancelarPreapproval(preapprovalId) {
  const resultado = await preApprovalClient.update({
    id: preapprovalId,
    body: { status: 'cancelled' },
  });
  return resultado;
}

async function pausarPreapproval(preapprovalId) {
  const resultado = await preApprovalClient.update({
    id: preapprovalId,
    body: { status: 'paused' },
  });
  return resultado;
}

async function reanudarPreapproval(preapprovalId) {
  const resultado = await preApprovalClient.update({
    id: preapprovalId,
    body: { status: 'authorized' },
  });
  return resultado;
}

async function getPago(paymentId) {
  const resultado = await paymentClient.get({ id: paymentId });
  return resultado;
}

module.exports = {
  crearPreapproval,
  getPreapproval,
  cancelarPreapproval,
  pausarPreapproval,
  reanudarPreapproval,
  getPago,
};
