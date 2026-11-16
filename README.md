# AgriConnect Africa (v0.2)

## Run locally
    cd backend && cp .env.example .env     # set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
    npm install && npm run dev             # API on :4000 (embedded Postgres in ./.pgdata if DATABASE_URL is empty)
    cd ../frontend && npm install && npm run dev   # site on :5173
    cd ../backend && npm test              # optional: smoke test (API must be running on TEST_PORT, default 4100)

## Deploy on Render
1. Push this folder to GitHub. In Render: New > Blueprint > pick the repo (uses render.yaml: Postgres + API + site).
2. When asked, set ADMIN_EMAIL and ADMIN_PASSWORD. Leave CLIENT_ORIGIN, VITE_API_URL, ANTHROPIC_API_KEY empty for now.
3. After the first deploy: set VITE_API_URL (web service) to the API URL and CLIENT_ORIGIN (API service) to the site URL, then redeploy the web service.
4. Log in with the admin email/password. Admins add equipment, register farmers and upload produce for them.

## Roles
farmer, investor, buyer (public sign-up) and admin (created from ADMIN_EMAIL/ADMIN_PASSWORD only).

## Photos
Two storage modes, chosen automatically:
- **Postgres (default):** no setup. Fine for a pilot.
- **Cloudflare R2:** set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET on the API service.
  Photos are resized in the browser (max 4 MB each) and stored in the bucket; the database keeps only the file's key.
  Leave R2_PUBLIC_URL empty to keep the bucket private (photos stream through the API), or set it to the bucket's
  public domain so browsers load photos straight from Cloudflare (faster).
- **Move existing photos to R2:** after setting the R2 variables, run `node scripts/migrate-images-to-r2.mjs` in backend/
  (Render dashboard > API service > Shell). Each photo is only removed from Postgres after its upload succeeds.

## Before real money or users
Payment escrow (Paystack/Flutterwave), identity verification (BVN/NIN), SEC/CBN compliance for investment features
(get legal advice), NDPA data-protection consent, tests, backups, email/SMS notifications.
Replace the contact line in the footer and the write-up on the home page (frontend/src/pages/Home.jsx) with your own details.
