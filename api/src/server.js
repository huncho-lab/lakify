const createApp = require('./app');
const createMemoryStore = require('./store/memoryStore');

const PORT = Number(process.env.PORT) || 3000;

// Use PostgreSQL when the cluster provides connection settings; otherwise
// fall back to the in-memory store for local development.
function createStore() {
  if (process.env.PGHOST) {
    const createPostgresStore = require('./store/postgresStore');
    console.log(`using PostgreSQL at ${process.env.PGHOST}`);
    return createPostgresStore();
  }
  console.log('PGHOST not set: using the in-memory store (data is lost on restart)');
  return createMemoryStore();
}

const store = createStore();
const app = createApp({ store });

const server = app.listen(PORT, () => {
  console.log(`lakify-api listening on port ${PORT}`);
});

// Kubernetes sends SIGTERM before killing a pod: stop accepting new
// connections, let in-flight requests finish, then close the database pool.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
