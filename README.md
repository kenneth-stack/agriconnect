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
farmer, investor, buyer (public sign-up) and admin. The first admin comes from ADMIN_EMAIL/ADMIN_PASSWORD; after that,
admins add other admins in Admin portal > Admins.

## KYC
Farmers, investors and buyers must submit a KYC profile (including BVN) before they can order, list produce, invest,
request assistance or book equipment. BVN and ID numbers are stored encrypted (KYC_ENCRYPTION_KEY). Admins review profiles
in Admin > KYC. The BVN is only checked for format (11 digits); it is NOT checked against NIBSS. To verify BVNs
automatically, connect a licensed provider (e.g. Paystack, Dojah, Youverify) and call it in routes/kyc.js.

## Assistance / Funding
Farmers request items (manure, seedlings, land, ...) with a quantity and description. Admins approve or reject in Admin > Assistance.

## Investment plans
Investors can explore plans (12, 18, 24, 36, 48, 60 months) and see their expected return, but **payment is switched off**:
the Invest button shows "Payment coming soon" and nothing is created (PAYMENTS_ENABLED=false, the default).
When you connect Stripe, replace the body of POST /plans/:id/invest (backend/src/routes/plans.js) with the Stripe checkout
and confirm the investment from Stripe's webhook, then set PAYMENTS_ENABLED=true.
(With PAYMENTS_ENABLED=true and no Stripe, the app runs a manual flow: the investment starts "pending", an admin clicks
Confirm payment in Admin > Investments to start the countdown, then Mark paid after payout.)
The starting rates are PLACEHOLDERS: set real ones in Admin > Plans. Offering fixed returns to the public is regulated in
Nigeria; get legal advice (SEC/CBN) first.

## Emails
All email goes through one function, sendMail() in backend/src/mailer.js (Resend by default: RESEND_API_KEY + MAIL_FROM).
Sent today: welcome email after sign-up, and password-reset links. If email is not set up yet, nothing breaks: registration
still works and the skipped email is noted in the API log. To use another provider later, change only sendMail().
Accounts created by an admin do not get an email (they receive their login details from the admin).

## Forgot password
Needs email to be set up (see Emails above). Without them, reset links are printed in the
API's log, and admins can set a temporary password for a user in Admin > Farmers & users.

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
