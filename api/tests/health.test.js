const request = require('supertest');
const createApp = require('../src/app');

describe('operational endpoints', () => {
  const app = createApp();

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /ready returns ready', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  test('GET /version falls back to defaults', async () => {
    const res = await request(app).get('/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('commit');
  });

  test('GET /version reports values injected by the pipeline', async () => {
    process.env.APP_VERSION = '1.2.3';
    process.env.GIT_SHA = 'abc123';
    const res = await request(app).get('/version');
    expect(res.body).toEqual({ version: '1.2.3', commit: 'abc123' });
    delete process.env.APP_VERSION;
    delete process.env.GIT_SHA;
  });

  test('does not leak the x-powered-by header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/);
  });
});
