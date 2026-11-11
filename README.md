Lakify

A demo web app for finding rental flats in Budapest, with a Tinder-style swipe interface.

Tenants swipe through flats and save the ones they like. Landlords list their flats with photos and proof of ownership.

> This is a demo, not a production app.

## Features

**Tenants**
- Swipe right to save a flat, left to skip (drag the card or use the buttons)
- See saved flats in one list
- Upload documents: ID card or passport, and proof of income

**Landlords**
- Add a flat with title, address, district, rent, size, rooms and description
- Upload photos of the flat
- Upload proof of ownership (tulajdoni lap)
- See and delete your listed flats

Use **Switch role** at the top to test both sides. Click the **Lakify** logo to go back to the start screen.

## Project structure

| Folder | What it contains |
|---|---|
| `web/` | The front end (`lakify.html`, `lakify.css`, `lakify.js`) and the nginx image that serves it |
| `api/` | The REST API (Node.js + Express) that stores listings in PostgreSQL, with tests and its Dockerfile |
| `k8s/` | Kubernetes manifests: front end, API, PostgreSQL, Prometheus and Grafana |
| `.github/` | The CI/CD pipeline (GitHub Actions) and its deploy-and-rollback script |

## How the data is stored

- **Listings** are shared between landlords and tenants, so they are saved through the API in a **PostgreSQL** database.
- **Your role, saved and skipped flats, and your documents** stay in your own browser (`localStorage`).

## How to run

**Front end and API on your computer (VS Code)**
1. Start the API: open a terminal, run `cd api`, `npm install` (first time only) and `npm run dev`. Without a database it keeps listings in memory.
2. Install the **Live Server** extension by Ritwick Dey, right-click `web/lakify.html` and choose **Open with Live Server**. The page talks to the API on `localhost:3000`.

**The whole system on Kubernetes** (front end, API, PostgreSQL and monitoring): see [`k8s/README.md`](k8s/README.md).

## How the code is organised

`web/lakify.js` is split into numbered sections:

1. **Storage**: talking to the API, and saving personal data in the browser
2. **Data**: listings, the tenant's saved flats and documents
3. **Helpers**: small utility functions
4. **Navigation**: switching screens and tabs
5. **Start screen**: choosing tenant or landlord
6. **Tenant: Swipe**
7. **Tenant: Saved**
8. **Tenant: Documents**
9. **Landlord: My flats**
10. **Landlord: Add flat**

## CI/CD

Every change goes through the GitHub Actions pipeline in `.github/workflows/ci.yml`: linting and tests on every push and pull request, then (on `main`) container images, deployment to a temporary Kubernetes cluster, verification, and automatic rollback if the new version is unhealthy.
