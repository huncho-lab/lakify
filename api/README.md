# lakify-api

REST API for **Lakify**, a swipe-style rental listings app for Budapest. It is the demonstration
application for the thesis **"Design and Implementation of CI/CD Pipelines for Cloud-Native
Applications"**.

The Lakify frontend (`../lakify.html`, `lakify.js`, `lakify.css`) currently keeps its data in the
browser's localStorage. This API takes over the listings data so the app has a real backend that
the pipeline can build, test, containerise and deploy. It is written the way a cloud-native service
should be: health and readiness probes for Kubernetes, build metadata injected by CI, graceful
shutdown on `SIGTERM`, JSON-only errors, and automated tests with an enforced coverage threshold.

Data is held in memory for now. `src/store/listingStore.js` is the single place to swap for
Supabase later.

## Requirements

- Node.js 20+ (22 recommended, see `.nvmrc`)

## Getting started

```bash
cd api
npm install
npm run dev        # http://localhost:3000/health
```

## Scripts

| Script                  | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `npm start`             | Run the server                                |
| `npm run dev`           | Run with auto-reload (`node --watch`)         |
| `npm test`              | Run the Jest + Supertest test suite           |
| `npm run test:coverage` | Tests with coverage report (fails under 80 %) |
| `npm run lint`          | ESLint check                                  |
| `npm run lint:fix`      | ESLint with auto-fix                          |

## Configuration

| Variable      | Default   | Purpose                                         |
| ------------- | --------- | ----------------------------------------------- |
| `PORT`        | `3000`    | Port to listen on                               |
| `CORS_ORIGIN` | `*`       | Origin allowed to call the API (the frontend)   |
| `APP_VERSION` | `dev`     | Version reported by `/version` (set by CI)      |
| `GIT_SHA`     | `unknown` | Commit reported by `/version` (set by CI)       |

## API

### Operational endpoints

| Method | Path       | Description                               |
| ------ | ---------- | ----------------------------------------- |
| GET    | `/health`  | Liveness probe → `{ "status": "ok" }`     |
| GET    | `/ready`   | Readiness probe → `{ "status": "ready" }` |
| GET    | `/version` | Build version and commit SHA              |

### Listings

| Method | Path                 | Description                                        | Success |
| ------ | -------------------- | -------------------------------------------------- | ------- |
| GET    | `/api/listings`      | Summaries, newest first. Filters: `district`, `maxRent`, `minRooms` | 200 |
| GET    | `/api/listings/:id`  | Full listing, including photos and proof           | 200     |
| POST   | `/api/listings`      | Create a listing                                   | 201     |
| PATCH  | `/api/listings/:id`  | Update some fields                                 | 200     |
| DELETE | `/api/listings/:id`  | Delete a listing                                   | 204     |

A listing has the same shape the frontend already uses:

| Field         | Type                    | Rules                                  |
| ------------- | ----------------------- | -------------------------------------- |
| `title`       | string                  | required, max 120 chars                |
| `address`     | string                  | required, max 200 chars                |
| `district`    | string                  | required, `I` … `XXIII`                |
| `rent`        | integer                 | required, Ft per month, > 0            |
| `size`        | number                  | required, m², > 0                      |
| `rooms`       | integer                 | required, ≥ 1                          |
| `description` | string                  | optional, max 2000 chars               |
| `photos`      | string[]                | required, 1–10 URLs or data URLs       |
| `proof`       | `{ name, data }` / null | optional proof of ownership (tulajdoni lap) |

The list endpoint returns summaries (`coverPhoto`, `photoCount`, `hasProof`) instead of every
photo, because data URLs are large. Request bodies may be up to 5 MB.

Errors are always JSON: `{ "error": "...", "details"?: [...] }` with status 400, 404, 413 or 500.

### Example

```bash
curl -X POST localhost:3000/api/listings \
  -H 'Content-Type: application/json' \
  -d '{"title":"Bright flat near Deák tér","address":"Király utca 20","district":"VI",
       "rent":250000,"size":45,"rooms":2,"photos":["https://example.com/flat.jpg"]}'

curl 'localhost:3000/api/listings?district=VI&maxRent=300000'
```

## Project structure

```
src/
  app.js                 # builds the Express app (no listen, so it is easy to test)
  server.js              # starts the server, handles graceful shutdown
  validation.js          # listing and filter validation
  routes/listings.js     # /api/listings routes
  store/listingStore.js  # in-memory store (swap for Supabase later)
  middleware/cors.js     # lets the frontend call the API
  middleware/errors.js   # 404 + central error handler
tests/                   # Jest + Supertest tests
```

## Role in the thesis pipeline

1. **Application: Lakify frontend + this API** ← you are here
2. Containerisation (Docker)
3. CI with GitHub Actions (lint, test, coverage)
4. Image build and push to a registry
5. Kubernetes manifests
6. Deployment to Kind inside GitHub Actions + smoke tests
7. Quality and security gates
8. Measurement and evaluation
