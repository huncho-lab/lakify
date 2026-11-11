const express = require('express');
const createListingStore = require('./store/listingStore');
const createListingsRouter = require('./routes/listings');
const { notFound, errorHandler } = require('./middleware/errors');
const cors = require('./middleware/cors');

/**
 * Builds the Express app. The store is injected so tests get a fresh,
 * isolated store and the server never has to be started to test it.
 */
function createApp({ store = createListingStore(), corsOrigin = process.env.CORS_ORIGIN || '*' } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors(corsOrigin));
  // Photos and proof of ownership arrive as data URLs, so allow larger bodies.
  app.use(express.json({ limit: '5mb' }));

  // Liveness probe: the process is up.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness probe: the app can serve traffic. When a database is added,
  // check its connection here.
  app.get('/ready', (req, res) => {
    res.json({ status: 'ready' });
  });

  // Build info, injected by the CI pipeline at image build time.
  app.get('/version', (req, res) => {
    res.json({
      version: process.env.APP_VERSION || 'dev',
      commit: process.env.GIT_SHA || 'unknown',
    });
  });

  app.use('/api/listings', createListingsRouter(store));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
