// Set APP_URL before importing the middleware
process.env.APP_URL = 'https://app.zikloapp.com';

const csrfProtection = require('../src/middleware/csrfProtection');

function mockReq(method, headers = {}) {
  return { method, headers, path: '/api/logout' };
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

describe('CSRF protection middleware', () => {
  test('allows GET requests without Origin', (done) => {
    const req = mockReq('GET');
    csrfProtection(req, mockRes(), done);
  });

  test('allows POST with correct Origin', (done) => {
    const req = mockReq('POST', { origin: 'https://app.zikloapp.com' });
    csrfProtection(req, mockRes(), done);
  });

  test('allows POST with correct Referer (no Origin)', (done) => {
    const req = mockReq('POST', { referer: 'https://app.zikloapp.com/admin/dashboard' });
    csrfProtection(req, mockRes(), done);
  });

  test('blocks POST with foreign Origin', () => {
    const req = mockReq('POST', { origin: 'https://evil.com' });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('blocks POST with no Origin and no Referer', () => {
    const req = mockReq('POST', {});
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  test('blocks POST with foreign Referer', () => {
    const req = mockReq('POST', { referer: 'https://attacker.com/csrf-page' });
    const res = mockRes();
    const next = jest.fn();
    csrfProtection(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
