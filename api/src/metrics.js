const client = require('prom-client');

/**
 * Prometheus metrics for the API, exposed at GET /metrics.
 * Request count, error count (status label) and latency per route cover
 * the golden signals of traffic, errors and latency; the default process
 * metrics (CPU, memory, event-loop lag) cover saturation.
 */
function createMetrics({ defaultMetrics = process.env.NODE_ENV !== 'test' } = {}) {
  const register = new client.Registry();
  if (defaultMetrics) client.collectDefaultMetrics({ register });

  const labelNames = ['method', 'route', 'status'];
  const requests = new client.Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled, by method, route and status code',
    labelNames,
    registers: [register],
  });
  const duration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, by method, route and status code',
    labelNames,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [register],
  });

  function middleware(req, res, next) {
    const stop = duration.startTimer();
    res.on('finish', () => {
      // Use the route pattern (/api/listings/:id), not the raw URL, so each
      // listing id does not create its own time series.
      // The mount path is remembered by trackMount(), because Express resets
      // req.baseUrl when an error leaves the router.
      const base = res.locals.mountPath ?? req.baseUrl;
      const route = req.route ? base + req.route.path : 'unmatched';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      requests.inc(labels);
      stop(labels);
    });
    next();
  }

  // Placed in front of a mounted router so its routes keep their prefix.
  function trackMount(req, res, next) {
    res.locals.mountPath = req.baseUrl;
    next();
  }

  async function handler(req, res) {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  }

  return { register, middleware, trackMount, handler };
}

module.exports = createMetrics;
