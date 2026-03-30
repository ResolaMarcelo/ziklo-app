/**
 * billing.js — Planes de pricing de Ziklo y lógica de límites
 */

const PLANES = {
  free:       { nombre: 'Gratis',      precio: 0,   limite: 10,       color: '#888' },
  starter:    { nombre: 'Starter',     precio: 25,  limite: 50,       color: '#009ee3' },
  growth:     { nombre: 'Crecimiento', precio: 49,  limite: 200,      color: '#7c3aed' },
  pro:        { nombre: 'Pro',         precio: 99,  limite: 1000,     color: '#f59e0b' },
  enterprise: { nombre: 'Enterprise',  precio: null, limite: Infinity, color: '#39e07a' },
};

/**
 * Devuelve el plan activo de una tienda con info de uso.
 */
function getPlanInfo(shop) {
  const plan = PLANES[shop.billingPlan] || PLANES.free;
  const used = shop.monthlyCharges || 0;
  const pct  = plan.limite === Infinity ? 0 : Math.round((used / plan.limite) * 100);
  const atLimit = plan.limite !== Infinity && used >= plan.limite;

  return { ...plan, slug: shop.billingPlan, used, pct, atLimit };
}

/**
 * Registra un cobro exitoso. Resetea el contador si cambió el mes.
 * Devuelve { ok, atLimit, plan }
 */
async function registrarCobro(prisma, shopDomain) {
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return { ok: false };

  const plan   = PLANES[shop.billingPlan] || PLANES.free;
  const ahora  = new Date();
  const reset  = shop.chargesResetAt;

  // Resetear si cambió el mes
  const mismoMes = reset &&
    reset.getMonth()    === ahora.getMonth() &&
    reset.getFullYear() === ahora.getFullYear();

  const currentCount = mismoMes ? (shop.monthlyCharges || 0) : 0;
  const newCount     = currentCount + 1;
  const atLimit      = plan.limite !== Infinity && newCount > plan.limite;

  await prisma.shop.update({
    where: { domain: shopDomain },
    data: {
      monthlyCharges: newCount,
      chargesResetAt: mismoMes ? undefined : ahora,
    },
  });

  return { ok: true, atLimit, count: newCount, limit: plan.limite, plan: shop.billingPlan };
}

module.exports = { PLANES, getPlanInfo, registrarCobro };
