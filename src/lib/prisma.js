const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('./crypto');

// Fields in the Shop model that contain sensitive tokens
const TOKEN_FIELDS = ['accessToken', 'mpAccessToken', 'klaviyoAccessToken', 'klaviyoRefreshToken'];

/** Apply encrypt() to all token fields present in a data object */
function encryptTokenFields(data) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  for (const field of TOKEN_FIELDS) {
    if (field in out && out[field] != null) {
      out[field] = encrypt(out[field]);
    }
  }
  return out;
}

/** Apply decrypt() to all token fields present in a Shop row */
function decryptTokenFields(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const field of TOKEN_FIELDS) {
    if (field in out && out[field] != null) {
      out[field] = decrypt(out[field]);
    }
  }
  return out;
}

/**
 * For results from non-Shop models that may include a nested `shop` object
 * (e.g. subscription with include: { shop: true }), decrypt its tokens too.
 */
function decryptNestedShop(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(decryptNestedShop);
  const out = { ...obj };
  if (out.shop && typeof out.shop === 'object') {
    out.shop = decryptTokenFields(out.shop);
  }
  return out;
}

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  // ── Encrypt on write ─────────────────────────────────────────────────────────
  if (params.model === 'Shop') {
    if (params.action === 'create' || params.action === 'update') {
      if (params.args.data) {
        params.args.data = encryptTokenFields(params.args.data);
      }
    }
    if (params.action === 'upsert') {
      if (params.args.create) params.args.create = encryptTokenFields(params.args.create);
      if (params.args.update) params.args.update = encryptTokenFields(params.args.update);
    }
  }

  const result = await next(params);

  if (result === null || result === undefined) return result;

  // ── Decrypt on read ───────────────────────────────────────────────────────────
  if (params.model === 'Shop') {
    if (['findUnique', 'findFirst', 'findMany',
         'findUniqueOrThrow', 'findFirstOrThrow'].includes(params.action)) {
      return Array.isArray(result)
        ? result.map(decryptTokenFields)
        : decryptTokenFields(result);
    }
  }

  // For queries on other models that include a nested Shop, decrypt its tokens
  return decryptNestedShop(result);
});

module.exports = prisma;
