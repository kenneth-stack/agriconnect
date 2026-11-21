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
New accounts land on the dashboard with a bar at the top ("Proceed to complete your KYC to have full access") and the dashboard stays locked until KYC is submitted. Farmers must also list their farms (several are allowed) with the farm address and, if possible, GPS coordinates captured from the phone. Exact GPS is visible only to the farmer and admins. Everyone (farmers, investors and buyers) must also upload a photo of their ID card. ID cards are private: they are kept in the database (never in a public bucket), are never served by the public image route, and only the owner and admins can open them (admin views are logged). Farmers, investors and buyers must submit a KYC profile (including BVN) before they can order, list produce, invest,
request assistance or book equipment. BVN and ID numbers are stored encrypted (KYC_ENCRYPTION_KEY). Admins review profiles
in Admin > KYC. The BVN is only checked for format (11 digits); it is NOT checked against NIBSS. To verify BVNs
automatically, connect a licensed provider (e.g. Paystack, Dojah, Youverify) and call it in routes/kyc.js.

## Assistance / Funding
Farmers request items (manure, seedlings, land, ...) with a quantity and description. Admins approve or reject in Admin > Assistance.

## Wallets and account numbers (Paystack)
Every investor and buyer gets a personal bank account number (a Paystack dedicated virtual account) once their KYC is in.
Money transferred to it lands in their AgriConnect wallet automatically. Setup:
1. Put your Paystack **secret key** in PAYSTACK_SECRET_KEY. With a test key set PAYSTACK_DVA_BANK=test-bank; live: wema-bank or titan-paystack.
2. Ask Paystack to enable **Dedicated Accounts** on your business (they must approve it).
3. In Paystack > Settings > API Keys & Webhooks, set the webhook URL to `https://YOUR-API.onrender.com/api/paystack/webhook`.
Only bank transfers to a personal account number are credited; card payments and unknown accounts are ignored (and logged).
Admins can correct or top up a wallet by hand in Admin > Wallets (every change needs a reason and is logged).
Withdrawals from wallets are not built yet.

## Withdrawals
Buyers and investors can withdraw unspent wallet money to their bank account (smallest: ₦1,000). The money leaves the wallet at once; an admin sends it from
Admin > Withdrawals and clicks **Mark paid**, or **Reject** (the money goes back to the wallet). The user can cancel a pending withdrawal. Money inside active
investment plans is not in the wallet: it shows under My investments with a countdown, and returns to the wallet after payout. Money spent on produce leaves the
wallet and the order is tracked (Placed > Confirmed > Delivered) on the buyer's dashboard and History. Withdrawals are paid by hand for now; Paystack Transfers could automate this later.

## Dashboards
Every role has its own dashboard: buyer (wallet, orders with delivery status), investor (wallet, plans with countdowns, wallet activity),
farmer (orders to confirm/deliver, earnings and payouts, assistance, farms), admin (items needing attention with links to the right tab). The layout is
wide on laptops and single-column on phones.

## Paying for produce
Buyers choose **Pay now** (from the wallet; the money is held until delivery) or **Pay on delivery**, and **Delivery** or **Pickup**.
A delivery fee is added to the produce price (same state / other state, set in Admin > Fees). If a prepaid order is cancelled the buyer is refunded.
When a prepaid order is completed the farmer is owed the produce price, and an admin pays the farmer's bank account (Admin > Payouts, using the
payout account the farmer saved on their profile). Delivery fees stay with AgriConnect.

## Investment plans
Investors invest from their wallet into a plan (12, 18, 24, 36, 48 or 60 months). The countdown starts at once and is shown on their dashboard.
After maturity an admin pays out principal + return into the wallet (Admin > Investments). The starting rates are PLACEHOLDERS: set real ones in
Admin > Plans. Offering fixed returns to the public is regulated in Nigeria; get legal advice (SEC/CBN) first.

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

## Deleting
Farmers and admins can delete produce (with its photos; produce that has open orders cannot be deleted) and farm photos. Admins can also delete equipment
and whole user accounts (Admin > Farmers & users): personal data, photos, KYC, farms and payout details are erased and the account is anonymised so other
people's trade and wallet records stay correct. An account with wallet money, open orders, active investments or an unpaid payout cannot be deleted yet.
