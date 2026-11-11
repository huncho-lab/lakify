const express = require('express');
const createMemoryStore = require('./store/memoryStore');
const createListingsRouter = require('./routes/listings');
const createMetrics = require('./metrics');
const { notFound, errorHandler, HttpError } = require('./middleware/errors');
const cors = require('./middleware/cors');

/**
 * Builds the Express app. The store is injected, so tests use a fresh
 * in-memory store while the server uses PostgreSQL, and the server never
 * has to be started to test it.
 *
 * faultMode deliberately breaks the app for the pipeline's failure
 * experiments (Chapter 5). It is off unless FAULT_MODE is set:
 *   unready - /ready reports 503, so the rollout never completes
 *   error   - every /api request fails with 500, so the smoke test fails
 */
function createApp({
  store = createMemoryStore(),
  metrics = createMetrics(),
  corsOrigin = process.env.CORS_ORIGIN || '*',
  faultMode = process.env.FAULT_MODE || '',
} = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(metrics.middleware);
  app.use(cors(corsOrigin));
  // Photos and proof of ownership arrive as data URLs, so allow larger bodies.
  app.use(express.json({ limit: '5mb' }));

  // Liveness probe: the process is up. Never touches the database, so a
  // database outage does not make Kubernetes restart healthy API pods.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness probe: the app can serve traffic, which needs the database.
  app.get('/ready', async (req, res) => {
    if (faultMode === 'unready') {
      return res.status(503).json({ status: 'not ready', reason: 'fault injected' });
    }
    try {
      await store.ping();
      return res.json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'not ready', reason: 'database unavailable' });
    }
  });

  // Build info, injected by the CI pipeline at image build time.
  app.get('/version', (req, res) => {
    res.json({
      version: process.env.APP_VERSION || 'dev',
      commit: process.env.GIT_SHA || 'unknown',
    });
  });

  app.get('/metrics', metrics.handler);

  if (faultMode === 'error') {
    app.use('/api', (req, res, next) => next(new HttpError(500, 'fault injected')));
  }

  app.use('/api/listings', metrics.trackMount, createListingsRouter(store));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
