const express = require('express');
const { validateListing, parseFilters } = require('../validation');
const { HttpError } = require('../middleware/errors');

// The list view only needs the first photo; full photos and proof data
// can be large (data URLs), so they are only returned for a single listing.
function summary(listing) {
  const { photos, proof, ...rest } = listing;
  return { ...rest, coverPhoto: photos[0], photoCount: photos.length, hasProof: proof !== null };
}

// Every store method is async (the PostgreSQL store talks to a database).
// Express 5 passes a rejected promise from a handler to the error handler.
function createListingsRouter(store) {
  const router = express.Router();

  router.param('id', async (req, res, next, id) => {
    try {
      const listing = await store.get(id);
      if (!listing) return next(new HttpError(404, `listing ${id} not found`));
      req.listing = listing;
      return next();
    } catch (err) {
      return next(err);
    }
  });

  // GET /api/listings?district=VII&maxRent=300000&minRooms=2
  router.get('/', async (req, res) => {
    const { errors, filters } = parseFilters(req.query);
    if (errors.length) throw new HttpError(400, 'invalid filters', errors);

    const listings = (await store.list()).filter((l) => (
      (!filters.district || l.district === filters.district)
      && (!filters.maxRent || l.rent <= filters.maxRent)
      && (!filters.minRooms || l.rooms >= filters.minRooms)
    ));
    res.json(listings.map(summary));
  });

  router.get('/:id', (req, res) => {
    res.json(req.listing);
  });

  router.post('/', async (req, res) => {
    const { errors, value } = validateListing(req.body);
    if (errors.length) throw new HttpError(400, 'validation failed', errors);
    const listing = await store.create(value);
    res.status(201).location(`/api/listings/${listing.id}`).json(listing);
  });

  router.patch('/:id', async (req, res) => {
    const { errors, value } = validateListing(req.body, { partial: true });
    if (errors.length) throw new HttpError(400, 'validation failed', errors);
    res.json(await store.update(req.listing.id, value));
  });

  router.delete('/:id', async (req, res) => {
    await store.remove(req.listing.id);
    res.status(204).end();
  });

  return router;
}

module.exports = createListingsRouter;
