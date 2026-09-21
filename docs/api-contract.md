# API contract aur gaps

Backend `services/backend` mein **144 endpoints** hain, 19 route files mein.
Base URL deployed: `https://parkfnb.onrender.com` · local: `http://localhost:5057`

## Auth

Har request par `Authorization: Bearer <jwt>`.
Dono apps request bhejte waqt **camelCase → snake_case** aur response par
**snake_case → camelCase** transform karte hain (`caseTransform.js` / `.ts`).
401 + `AUTH_TOKEN_EXPIRED` par client chupchap `refresh-token` karke ek baar retry karta hai.

---

## ⚠️ Apps aise endpoints call karte hain jo is repo mein nahi hain

Yeh sabse zaroori baat hai. Apps ke commits **May 2026** ke hain, backend ka aakhri commit
**Oct 2025 "Initialization"** hai. Deployed backend clearly is repo se aage hai.

| App jo call karta hai | Is repo mein | Kiska |
|---|---|---|
| `POST /api/auth/otp/send` | ✅ **ban gaya** | dono apps |
| `POST /api/auth/otp/verify` | ✅ **ban gaya** | dono apps |
| `POST /api/auth/otp/resend` | ✅ **ban gaya** | dono apps |
| `GET  /api/auth/onboarding-status` | ✅ **ban gaya** | owner |
| `PUT  /api/bookings/:id/approve` | ❌ | owner |
| `PUT  /api/bookings/:id/reject` | ❌ | owner |
| `PUT  /api/bookings/:id/noshow` | ❌ | owner |
| `PUT  /api/owners/me/profile` | ✅ **ban gaya** | owner |
| `PUT  /api/owners/me/kyc` | ✅ **ban gaya** | owner |
| `PUT  /api/owners/me/kyc/draft` | ✅ **ban gaya** | owner |

### OTP auth ka contract (ab live)

```
POST /api/auth/otp/send     { identifier, channel? }
  → { message, channel, expiresIn, devCode? }     devCode sirf non-production mein

POST /api/auth/otp/resend   { identifier, channel? }   purana code turant burn hota hai

POST /api/auth/otp/verify   { identifier, code, role? | ownerType?, termsAccepted? }
  → { user, owner, token, isNewUser }
  ownerType bheja to Owner record bhi banta hai aur userType 'owner' ho jaata hai

GET  /api/auth/onboarding-status   (protected)
  → { onboardingStep, kycStatus, isOnboardingComplete, nextScreen }

GET  /api/auth/me   (protected)  → ab { user, owner } lautata hai (pehle sirf user)
```

Guards: code 5 min valid · 5 galat attempts par burn · 30 sec resend cooldown ·
15 min mein max 5 code. Code plain text mein store nahi hota, bcrypt hash hota hai,
aur TTL index se apne aap delete ho jaata hai.

SMS abhi bheja nahi jaata — `otpController.js` ke `sendCode()` mein provider daalna hai.
Tab tak code server console par print hota hai aur non-production response mein
`devCode` aata hai. Test: `npm run test:auth`

Is repo mein iski jagah **email + password** auth hai (`register` / `login` /
`verify/:token` / `forgot-password` / `reset-password`).

**Karna kya hai:** deployed backend ka source dhoondho (koi aur branch/repo?) aur is repo se
merge karo — ya yeh endpoints yahan implement karo. Do sources of truth rakhna sabse mehnga
padega.

---

## Route groups

| Prefix | Endpoints | Kya karta hai |
|---|---|---|
| `/api/auth` | 10 | register, login, verify, refresh, me, change-password |
| `/api/users` | 7 | profile, nearby, stats, location |
| `/api/vehicles` | 6 | user ki gaadiyan, set-default |
| `/api/payment-methods` | 6 | saved cards |
| `/api/owners` | 8 | register, KYC submit/verify, earnings, stats |
| `/api/properties` | 8 | CRUD, nearby search, images |
| `/api/parking-spaces` | 9 | **search**, CRUD, availability, pricing |
| `/api/availability` | 6 | din-wise schedule, bulk, conflict check |
| `/api/bookings` | 10 | create, cancel, checkin, checkout, extend |
| `/api/payments` | 8 | create, webhook, verify |
| `/api/refunds` | 7 | request, approve, reject, process |
| `/api/reviews` | 9 | space/user reviews, rating, owner response |
| `/api/conversations` · `/api/messages` | 12 | in-app chat |
| `/api/notifications` | 7 | list, read, clear |
| `/api/promo-codes` | 8 | validate, apply, usage |
| `/api/support-tickets` | 10 | tickets + thread messages |
| `/api/admins` | 7 | admin CRUD, permissions, activity |
| `/api/settings` | 7 | platform key/value settings |

---

## Consumer app kaunse endpoints use karta hai

```
/api/auth/otp/send · /verify · /resend        ⚠️ backend mein nahi
/api/auth/me
/api/users/me/profile
/api/vehicles/users/:userId/vehicles
/api/vehicles/:id · /:id/set-default
/api/parking-spaces/search
/api/parking-spaces/:id · /:id/availability
/api/bookings                                  POST
/api/bookings/users/:userId/bookings
/api/bookings/:id/cancel · /:id/extend
```

### Owner onboarding ka contract (ab live)

```
PUT /api/owners/me/profile
  { legalName, dateOfBirth, email?, addressLine1, addressLine2?, city, state,
    pincode, country?, locationLat?, locationLng?, ownerType,
    businessName?, roleDesignation?, registrationId?,   // business/property_manager
    landLabel?, landmark? }
  -> { user, owner }
  User par person, Owner par business/land. onboarding_step 'profile_setup' par
  rukta hai -- owner ka KYC abhi baaki hai.

PUT /api/owners/me/kyc/draft
  { kycPersonal?, kycIdentity?, kycBank?, kycAddress? }   // koi bhi subset
  -> { owner, message }
  Validation nahi. kyc_status 'draft' ho jaata hai (submitted/verified ko chhedta nahi).

PUT /api/owners/me/kyc
  { kycPersonal, kycIdentity, kycBank, kycAddressSameAsProfile?, kycAddress }
  -> { owner, message }
  fullName, documentType, documentNumber, frontImageUrl, accountNumber aur
  ifscCode zaroori hain. kycAddressSameAsProfile true ho to address User se
  copy hota hai (proofDocumentUrl client se aata hai). Dobara submit -> 409.
  onboarding_step 'kyc_submitted' ho jaata hai.
```

**Approval abhi manual hai** -- `kyc_status` `submitted` par rukta hai. Verify
karne ka rasta `PUT /api/owners/:id/verify/kyc` (admin) hai; app `verified`
handle karta hai, to admin panel se ya seed se set kar sakte ho.

## Owner app kaunse endpoints use karta hai

```
/api/auth/otp/*  ·  /me  ·  /onboarding-status ⚠️ kuch backend mein nahi
/api/auth/refresh-token
/api/owners/me/profile · /me/kyc · /me/kyc/draft   ✅ ban gaye
/api/owners/:ownerId/stats · /:ownerId/earnings
/api/properties · /properties/:id
/api/parking-spaces/:id · /:id/pricing
/api/availability/:id
/api/bookings/owners/:ownerId/bookings
/api/bookings/:id · /approve · /reject · /cancel   ⚠️ approve/reject nahi hain
/api/bookings/:id/checkin · /checkout · /noshow    ⚠️ noshow nahi hai
```

---

## Model mein nazuk jagah

**`ParkingSpace` mein price ke do set hain:**
`price_per_hour` / `price_per_day` / `price_per_month` **aur**
`hourly_rate` / `daily_rate` / `monthly_rate` (comment mein "aliases for bookings controller
compatibility" likha hai).

- Search `price_per_hour` par filter karta hai
- `calculateBookingPrice()` `hourly_rate` par calculate karta hai
- Sync **haath se** hota hai — `createSpace`, `updateSpace` aur `updatePricing` teeno mein

Abhi kaam karta hai, par ek naya write path bhoola to prices chupchap galat ho jaayenge.
**Ise ek field par le aao, alias hata do.**

**Currency:** `Booking.currency` aur `Payment.currency` dono ka default **`'USD'`** hai,
jabki dono apps `formatCurrency(amount, 'INR')` use karte hain. Pilot se pehle `'INR'` karo.

**Payment gateway stub hai:** `paymentsController.js` mein koi Stripe/Razorpay SDK nahi,
sirf `payment_provider = 'stripe'` string hai. Webhook mein comment hai —
*"In real app, verify webhook signature… For now, we'll just process the webhook"*.
Matlab abhi koi bhi webhook post karke booking ko paid mark kar sakta hai.
