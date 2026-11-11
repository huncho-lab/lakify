const { randomUUID } = require('node:crypto');

/**
 * In-memory listing store. It mirrors the "STORAGE" section of the Lakify
 * frontend and is the single place to swap for Supabase later: any
 * replacement only has to implement these five methods.
 */
function createListingStore() {
  const listings = new Map();

  return {
    list() {
      // Newest first, like the frontend (listings.unshift).
      return Array.from(listings.values()).reverse();
    },

    get(id) {
      return listings.get(id) || null;
    },

    create(data) {
      const now = new Date().toISOString();
      const listing = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
      listings.set(listing.id, listing);
      return listing;
    },

    update(id, changes) {
      const existing = listings.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      listings.set(id, updated);
      return updated;
    },

    remove(id) {
      return listings.delete(id);
    },
  };
}

module.exports = createListingStore;
