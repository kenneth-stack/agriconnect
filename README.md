# AgriConnect Africa: Phase 1 starter

## Run it
    cd backend && cp .env.example .env     # set JWT_SECRET
    npm install && npm run dev             # API on :4000
    cd ../frontend && npm install && npm run dev   # site on :5173

## Included
Role-based auth, farm profiles, produce marketplace, investment projects with funding progress,
equipment booking with clash detection, Easy/Smart mode.

## Before real users or money
Payment escrow (Paystack/Flutterwave), KYC (BVN/NIN), SEC/CBN compliance for investment features
(get legal advice), NDPA data-protection consent, PostgreSQL, tests, HTTPS, admin dashboard.

## Not built yet (later phases)
Satellite monitoring, crop-disease image recognition, credit scoring, insurance, logistics,
cooperatives, native mobile apps.

## AI assistant
Shows a 'coming soon' page until ANTHROPIC_API_KEY is set on the API service; then it switches on automatically (no code change).
