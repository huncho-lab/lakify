const { randomUUID } = require('node:crypto');

/**
 * In-memory listing store, used by the automated tests and for local
 * development without a database. It has exactly the same async interface
 * as the PostgreSQL store (postgresStore.js), so the routes cannot tell
 * which one they are talking to.
 */
function createMemoryStore() {
  const listings = new Map();

  return {
    async list() {
      // Newest first, like the PostgreSQL store (ORDER BY created_at DESC).
      return Array.from(listings.values()).reverse();
    },

    async get(id) {
      return listings.get(id) || null;
    },

    async create(data) {
      const now = new Date().toISOString();
      const listing = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
      listings.set(listing.id, listing);
      return listing;
    },

    async update(id, changes) {
      const existing = listings.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      listings.set(id, updated);
      return updated;
    },

    async remove(id) {
      return listings.delete(id);
    },

    // Readiness check: an in-memory store is always reachable.
    async ping() {},

    async close() {},
  };
}

module.exports = createMemoryStore;
