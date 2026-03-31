const crypto = require('crypto');

const SHOPIFY_SECRET = 'test_webhook_secret_123';

// Reproduce the HMAC verification logic used in webhooks.js
function verifyHmac(body, hmacHeader, secret) {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
  const digestBuf = Buffer.from(digest);
  const headerBuf = Buffer.from(hmacHeader || '');
  if (digestBuf.length !== headerBuf.length) return false;
  return crypto.timingSafeEqual(digestBuf, headerBuf);
}

describe('Shopify webhook HMAC verification', () => {
  const body = JSON.stringify({ id: 123, topic: 'app/uninstalled' });

  function computeHmac(payload, secret) {
    return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
  }

  test('valid HMAC passes verification', () => {
    const hmac = computeHmac(body, SHOPIFY_SECRET);
    expect(verifyHmac(body, hmac, SHOPIFY_SECRET)).toBe(true);
  });

  test('invalid HMAC fails verification', () => {
    expect(verifyHmac(body, 'totally_wrong_hmac_value_here!!!', SHOPIFY_SECRET)).toBe(false);
  });

  test('tampered body fails verification', () => {
    const hmac = computeHmac(body, SHOPIFY_SECRET);
    const tampered = JSON.stringify({ id: 999, topic: 'app/uninstalled' });
    expect(verifyHmac(tampered, hmac, SHOPIFY_SECRET)).toBe(false);
  });

  test('empty HMAC header fails', () => {
    expect(verifyHmac(body, '', SHOPIFY_SECRET)).toBe(false);
  });

  test('wrong secret fails', () => {
    const hmac = computeHmac(body, SHOPIFY_SECRET);
    expect(verifyHmac(body, hmac, 'wrong_secret')).toBe(false);
  });
});
