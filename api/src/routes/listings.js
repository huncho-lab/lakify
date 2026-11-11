const express = require('express');
const { validateListing, parseFilters } = require('../validation');
const { HttpError } = require('../middleware/errors');

// The list view only needs the first photo; full photos and proof data
// can be large (data URLs), so they are only returned for a single listing.
function summary(listing) {
  const { photos, proof, ...rest } = listing;
  return { ...rest, coverPhoto: photos[0], photoCount: photos.length, hasProof: proof !== null };
}

function createListingsRouter(store) {
  const router = express.Router();

  router.param('id', (req, res, next, id) => {
    const listing = store.get(id);
    if (!listing) return next(new HttpError(404, `listing ${id} not found`));
    req.listing = listing;
    return next();
  });

  // GET /api/listings?district=VII&maxRent=300000&minRooms=2
  router.get('/', (req, res) => {
    const { errors, filters } = parseFilters(req.query);
    if (errors.length) throw new HttpError(400, 'invalid filters', errors);

    const listings = store.list().filter((l) => (
      (!filters.district || l.district === filters.district)
      && (!filters.maxRent || l.rent <= filters.maxRent)
      && (!filters.minRooms || l.rooms >= filters.minRooms)
    ));
    res.json(listings.map(summary));
  });

  router.get('/:id', (req, res) => {
    res.json(req.listing);
  });

  router.post('/', (req, res) => {
    const { errors, value } = validateListing(req.body);
    if (errors.length) throw new HttpError(400, 'validation failed', errors);
    const listing = store.create(value);
    res.status(201).location(`/api/listings/${listing.id}`).json(listing);
  });

  router.patch('/:id', (req, res) => {
    const { errors, value } = validateListing(req.body, { partial: true });
    if (errors.length) throw new HttpError(400, 'validation failed', errors);
    res.json(store.update(req.listing.id, value));
  });

  router.delete('/:id', (req, res) => {
    store.remove(req.listing.id);
    res.status(204).end();
  });

  return router;
}

module.exports = createListingsRouter;
