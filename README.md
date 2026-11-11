Lakify

A demo web app for finding rental flats in Budapest, with a Tinder-style swipe interface.

Tenants swipe through flats and save the ones they like. Landlords list their flats with photos and proof of ownership.

> This is a demo, not a production app. All data is saved in your own browser.

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

## Project files

| File | What it contains |
|---|---|
| `index.html` | The page structure |
| `lakify.css` | All the styling |
| `lakify.js` | All the logic |

Keep all three files in the same folder, with exactly these names.

## How to run

**With VS Code (recommended)**
1. Open the project folder in VS Code (**File → Open Folder**).
2. Install the **Live Server** extension by Ritwick Dey.
3. Right-click `index.html` and choose **Open with Live Server**.

The app opens in your browser and reloads every time you save a file.

**Without VS Code**

Double-click `index.html` to open it in your browser.

## How the code is organised

`lakify.js` is split into numbered sections:

1. **Storage**: saving and loading data
2. **Data**: listings, the tenant's saved flats and documents
3. **Helpers**: small utility functions
4. **Navigation**: switching screens and tabs
5. **Start screen**: choosing tenant or landlord
6. **Tenant: Swipe**
7. **Tenant: Saved**
8. **Tenant: Documents**
9. **Landlord: My flats**
10. **Landlord: Add flat**

## Data storage

Everything is saved in the browser's `localStorage`:
- Data stays after a page reload, but only in that browser.
- Photos are resized before saving, and PDFs must be under 1 MB.
- To start fresh, clear the site data in your browser.

## Planned: Supabase

The app will later use [Supabase](https://supabase.com) as its database. Only **section 1 (Storage)** in `lakify.js` needs to change. Its `get` and `set` functions will be replaced with Supabase calls, and the rest of the app stays the same.

