const request = require('supertest');
const createApp = require('../src/app');
const createMemoryStore = require('../src/store/memoryStore');
const createMetrics = require('../src/metrics');

const failingStore = () => {
  const boom = async () => { throw new Error('connection refused'); };
  return { list: boom, get: boom, create: boom, update: boom, remove: boom, ping: boom, close: async () => {} };
};

describe('GET /ready', () => {
  test('reports ready when the store is reachable', async () => {
    const res = await request(createApp()).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  test('reports 503 when the database is unreachable', async () => {
    const res = await request(createApp({ store: failingStore() })).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('database unavailable');
  });
});

describe('store failures', () => {
  test.each([
    ['get', '/api/listings'],
    ['get', '/api/listings/some-id'],
    ['post', '/api/listings'],
  ])('%s %s returns a generic 500', async (method, path) => {
    const app = createApp({ store: failingStore() });
    const res = await request(app)[method](path).send({
      title: 'a', address: 'b', district: 'V', rent: 1, size: 1, rooms: 1, photos: ['p'],
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal server error' });
  });
});

describe('GET /metrics', () => {
  test('exposes request counts and durations per route pattern', async () => {
    const app = createApp({ store: createMemoryStore() });
    await request(app).get('/api/listings');
    await request(app).get('/api/listings/does-not-exist');
    await request(app).get('/nope');

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('http_requests_total{method="GET",route="/api/listings/",status="200"} 1');
    expect(res.text).toMatch(/http_requests_total\{method="GET",route="[^"]*",status="404"\} \d+/);
    expect(res.text).toContain('route="unmatched",status="404"');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
  });

  test('can include the default Node.js process metrics', async () => {
    const metrics = createMetrics({ defaultMetrics: true });
    const res = await request(createApp({ metrics })).get('/metrics');
    expect(res.text).toContain('process_cpu_user_seconds_total');
  });
});

describe('fault injection (used only by the pipeline experiments)', () => {
  test('unready makes /ready fail but keeps /health up', async () => {
    const app = createApp({ faultMode: 'unready' });
    expect((await request(app).get('/ready')).status).toBe(503);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  test('error makes every /api request fail', async () => {
    const app = createApp({ faultMode: 'error' });
    expect((await request(app).get('/api/listings')).status).toBe(500);
    expect((await request(app).get('/health')).status).toBe(200);
  });

  test('is off by default', async () => {
    const app = createApp();
    expect((await request(app).get('/api/listings')).status).toBe(200);
  });
});
