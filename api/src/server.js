const createApp = require('./app');

const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`lakify-api listening on port ${PORT}`);
});

// Kubernetes sends SIGTERM before killing a pod: stop accepting new
// connections and let in-flight requests finish.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
