const request = require('supertest');
const createApp = require('../src/app');
const createMemoryStore = require('../src/store/memoryStore');

const PHOTO = 'data:image/jpeg;base64,AAAA';

const validListing = (overrides = {}) => ({
  title: 'Bright two-room flat near Deák tér',
  address: 'Király utca 20',
  district: 'VI',
  rent: 250000,
  size: 45,
  rooms: 2,
  description: 'Quiet courtyard flat.',
  photos: [PHOTO],
  ...overrides,
});

// Each test gets its own app + store so tests never depend on each other.
let app;
beforeEach(() => {
  app = createApp({ store: createMemoryStore() });
});

const createListing = (body) => request(app).post('/api/listings').send(body);

describe('POST /api/listings', () => {
  test('creates a listing with defaults', async () => {
    const res = await createListing(validListing({ description: undefined }));
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/listings/${res.body.id}`);
    expect(res.body).toMatchObject({ title: 'Bright two-room flat near Deák tér', district: 'VI', description: '', proof: null });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.createdAt).toBeDefined();
  });

  test('trims text and keeps proof of ownership', async () => {
    const res = await createListing(validListing({
      title: '  Sunny flat  ',
      proof: { name: ' tulajdoni-lap.pdf ', data: 'data:application/pdf;base64,AAAA' },
    }));
    expect(res.body.title).toBe('Sunny flat');
    expect(res.body.proof).toEqual({ name: 'tulajdoni-lap.pdf', data: 'data:application/pdf;base64,AAAA' });
  });

  test('ignores unknown fields', async () => {
    const res = await createListing(validListing({ id: 'hacked', owner: 'admin' }));
    expect(res.body.id).not.toBe('hacked');
    expect(res.body).not.toHaveProperty('owner');
  });

  test.each([
    [{ title: undefined }, 'title is required'],
    [{ title: '   ' }, 'title must be a non-empty string'],
    [{ title: 'a'.repeat(121) }, 'title must be at most 120 characters'],
    [{ address: 7 }, 'address must be a non-empty string'],
    [{ address: 'a'.repeat(201) }, 'address must be at most 200 characters'],
    [{ district: 'XXIV' }, 'district must be a Budapest district from I to XXIII'],
    [{ rent: 0 }, 'rent must be a positive whole number (Ft per month)'],
    [{ rent: '250000' }, 'rent must be a positive whole number (Ft per month)'],
    [{ size: -5 }, 'size must be a positive number (m²)'],
    [{ rooms: 1.5 }, 'rooms must be a whole number of at least 1'],
    [{ description: 5 }, 'description must be a string'],
    [{ description: 'a'.repeat(2001) }, 'description must be at most 2000 characters'],
    [{ photos: [] }, 'photos must be a non-empty array'],
    [{ photos: Array(11).fill(PHOTO) }, 'photos can contain at most 10 items'],
    [{ photos: [PHOTO, ''] }, 'each photo must be a non-empty string (URL or data URL)'],
    [{ proof: { name: 'x' } }, 'proof must be null or { name, data } with non-empty strings'],
  ])('rejects %j', async (overrides, message) => {
    const res = await createListing(validListing(overrides));
    expect(res.status).toBe(400);
    expect(res.body.details).toContain(message);
  });

  test('reports every invalid field at once', async () => {
    const res = await createListing({});
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveLength(7);
  });

  test('rejects a non-object body', async () => {
    const res = await createListing([]);
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('body must be a JSON object');
  });

  test('rejects a missing body', async () => {
    const res = await request(app).post('/api/listings');
    expect(res.status).toBe(400);
  });

  test('rejects malformed JSON', async () => {
    const res = await request(app)
      .post('/api/listings')
      .set('Content-Type', 'application/json')
      .send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid JSON body');
  });

  test('rejects bodies over 5 MB', async () => {
    const res = await createListing(validListing({ photos: ['x'.repeat(6 * 1024 * 1024)] }));
    expect(res.status).toBe(413);
  });
});

describe('GET /api/listings', () => {
  test('returns an empty list initially', async () => {
    const res = await request(app).get('/api/listings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns summaries newest first without heavy fields', async () => {
    await createListing(validListing({ title: 'first' }));
    await createListing(validListing({
      title: 'second',
      photos: [PHOTO, PHOTO],
      proof: { name: 'p.pdf', data: 'data:application/pdf;base64,AAAA' },
    }));

    const res = await request(app).get('/api/listings');
    expect(res.body.map((l) => l.title)).toEqual(['second', 'first']);
    expect(res.body[0]).toMatchObject({ coverPhoto: PHOTO, photoCount: 2, hasProof: true });
    expect(res.body[1].hasProof).toBe(false);
    expect(res.body[0]).not.toHaveProperty('photos');
    expect(res.body[0]).not.toHaveProperty('proof');
  });

  test('filters by district, maxRent and minRooms', async () => {
    await createListing(validListing({ title: 'cheap VII', district: 'VII', rent: 180000, rooms: 1 }));
    await createListing(validListing({ title: 'big VII', district: 'VII', rent: 400000, rooms: 3 }));
    await createListing(validListing({ title: 'XI', district: 'XI', rent: 200000, rooms: 2 }));

    const titles = async (query) => (await request(app).get(`/api/listings?${query}`)).body.map((l) => l.title);

    expect(await titles('district=VII')).toEqual(['big VII', 'cheap VII']);
    expect(await titles('maxRent=200000')).toEqual(['XI', 'cheap VII']);
    expect(await titles('minRooms=2')).toEqual(['XI', 'big VII']);
    expect(await titles('district=VII&minRooms=2')).toEqual(['big VII']);
  });

  test.each(['district=XXX', 'maxRent=abc', 'maxRent=0', 'minRooms=-1'])('rejects bad filter %s', async (query) => {
    const res = await request(app).get(`/api/listings?${query}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/listings/:id', () => {
  test('returns the full listing', async () => {
    const created = await createListing(validListing());
    const res = await request(app).get(`/api/listings/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.photos).toEqual([PHOTO]);
  });

  test('404s for a missing listing', async () => {
    const res = await request(app).get('/api/listings/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/listings/:id', () => {
  test('updates only the given fields', async () => {
    const created = await createListing(validListing());
    const res = await request(app).patch(`/api/listings/${created.body.id}`).send({ rent: 230000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rent: 230000, title: created.body.title, description: 'Quiet courtyard flat.' });
  });

  test('can remove proof of ownership', async () => {
    const created = await createListing(validListing({ proof: { name: 'p.pdf', data: 'x' } }));
    const res = await request(app).patch(`/api/listings/${created.body.id}`).send({ proof: null });
    expect(res.body.proof).toBeNull();
  });

  test('rejects an empty update', async () => {
    const created = await createListing(validListing());
    const res = await request(app).patch(`/api/listings/${created.body.id}`).send({});
    expect(res.status).toBe(400);
  });

  test('rejects invalid fields', async () => {
    const created = await createListing(validListing());
    const res = await request(app).patch(`/api/listings/${created.body.id}`).send({ district: 'Z' });
    expect(res.status).toBe(400);
  });

  test('404s for a missing listing', async () => {
    const res = await request(app).patch('/api/listings/nope').send({ rent: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/listings/:id', () => {
  test('deletes a listing', async () => {
    const created = await createListing(validListing());
    const del = await request(app).delete(`/api/listings/${created.body.id}`);
    expect(del.status).toBe(204);
    const get = await request(app).get(`/api/listings/${created.body.id}`);
    expect(get.status).toBe(404);
  });

  test('404s for a missing listing', async () => {
    const res = await request(app).delete('/api/listings/nope');
    expect(res.status).toBe(404);
  });
});

describe('CORS', () => {
  test('allows the frontend origin', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('answers preflight requests', async () => {
    const res = await request(app).options('/api/listings');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
  });

  test('can be locked to one origin', async () => {
    const locked = createApp({ corsOrigin: 'http://127.0.0.1:5501' });
    const res = await request(locked).get('/health');
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5501');
  });
});
