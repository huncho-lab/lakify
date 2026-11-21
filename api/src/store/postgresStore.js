const { Pool } = require('pg');

// Columns a client may write. id and the timestamps are set by the database.
const COLUMNS = ['title', 'address', 'district', 'rent', 'size', 'rooms', 'description', 'photos', 'proof'];
const JSON_COLUMNS = new Set(['photos', 'proof']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// node-postgres would turn a JS array into a PostgreSQL array, so JSONB
// values are sent as JSON text instead.
const toParam = (column, value) => (JSON_COLUMNS.has(column) && value !== null ? JSON.stringify(value) : value);

function toListing(row) {
  return {
    id: row.id,
    title: row.title,
    address: row.address,
    district: row.district,
    rent: row.rent,
    size: Number(row.size), // NUMERIC comes back as a string
    rooms: row.rooms,
    description: row.description,
    photos: row.photos,
    proof: row.proof,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * PostgreSQL-backed listing store, used when the API runs in the cluster.
 * Connection settings come from the standard PG* environment variables
 * (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), which Kubernetes fills
 * from a ConfigMap and a Secret. The table is created by the database's
 * initialisation script (k8s/base/db/schema.sql).
 */
function createPostgresStore({ pool = new Pool({ max: 5, connectionTimeoutMillis: 3000 }) } = {}) {
  // An idle connection can be closed from the other side, for example when
  // the database pod restarts. node-postgres reports that as an 'error'
  // event, which would crash the process if nobody listened. The broken
  // connection is discarded and the next query opens a new one.
  pool.on('error', (err) => {
    console.error('idle database connection lost:', err.message);
  });

  return {
    async list() {
      const { rows } = await pool.query('SELECT * FROM listings ORDER BY created_at DESC');
      return rows.map(toListing);
    },

    async get(id) {
      if (!UUID.test(id)) return null; // not a valid id, so it cannot exist
      const { rows } = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
      return rows[0] ? toListing(rows[0]) : null;
    },

    async create(data) {
      const columns = COLUMNS.filter((c) => data[c] !== undefined);
      const params = columns.map((c) => toParam(c, data[c]));
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await pool.query(
        `INSERT INTO listings (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        params,
      );
      return toListing(rows[0]);
    },

    async update(id, changes) {
      if (!UUID.test(id)) return null;
      const columns = COLUMNS.filter((c) => changes[c] !== undefined);
      const sets = columns.map((c, i) => `${c} = $${i + 1}`);
      const params = columns.map((c) => toParam(c, changes[c]));
      const { rows } = await pool.query(
        `UPDATE listings SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $${columns.length + 1} RETURNING *`,
        [...params, id],
      );
      return rows[0] ? toListing(rows[0]) : null;
    },

    async remove(id) {
      if (!UUID.test(id)) return false;
      const { rowCount } = await pool.query('DELETE FROM listings WHERE id = $1', [id]);
      return rowCount > 0;
    },

    // Readiness check: fails if the database cannot be reached.
    async ping() {
      await pool.query('SELECT 1');
    },

    async close() {
      await pool.end();
    },
  };
}

module.exports = createPostgresStore;
