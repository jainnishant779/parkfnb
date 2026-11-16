# ParkFNB common repo

Ek hi git repo, chaar hisse: `research/` (studies, deck, product, handoff), `hardware/` (ESP32 firmware),
`ai/` (ANPR, space optimizer), `software/` (apps, backend, website). Koi nested `.git` nahi hai —
commit hamesha root se karo.

Orientation: [`HANDOFF.md`](research/handoff/HANDOFF.md) (sabse taaza status, 2026-09-20) ·
[`README.md`](software/README.md) · design: [`software/docs/system-design.md`](software/docs/system-design.md)
· endpoints: [`software/docs/api-contract.md`](software/docs/api-contract.md)
· backend ke jaane-hue bugs jo abhi fix nahi hue: [`software/docs/backend-gap.md`](software/docs/backend-gap.md)

`software/README.md` aur `api-contract.md` **purane** hain — teen alag repos, top-level `apps/` `services/`,
"144 endpoints", "admin khaali", local port 5057 jaisi baatein ab galat hain. Unhe design ke liye padho,
facts ke liye code dekho.

## Chalane ke commands

```bash
# backend
cd software/services/backend && npm install && npm run dev      # port 5000, .env chahiye
npm run test:unit                                               # pricing + phone, DB nahi chahiye

# apps
cd software/apps/consumer && npm install && npm start           # phir: npm run android
cd software/apps/owner    && npm install && npm start

# admin panel (React + Vite, port 5173)
cd software/apps/admin && npm install && npm run dev            # VITE_API_BASE_URL .env.example mein

# owner web dashboard (React + Vite, port 5175) — ParkFNB console jaisa UI, owner login ke saath
cd software/apps/owner-web && npm install && npm run dev        # VITE_API_BASE_URL .env.example mein; README.md mein poora flow

# backend smoke tests (mongodb-memory-server). CPU mein AVX nahi ho to default MongoDB 8 SIGILL se mar jaata hai:
# MONGOMS_VERSION=4.4.29 lagao (aur Ubuntu 22.04+ par libssl1.1 chahiye: .deb ko `dpkg -x` karke LD_LIBRARY_PATH do)
cd software/services/backend && npm run test:auth && npm run test:cameras   # test:owner, test:bookings bhi

# space optimizer (Python)
cd ai/space-optimizer && pip install flask shapely numpy pyproj && python app.py   # port 5000

# ANPR ab operator console ke saath EC2 par chal raha hai: pehle ai/anpr/HANDOVER.md padho
# ANPR (Python, port 8008 — backend aur optimizer 5000 par hain)
cd ai/anpr && pip install ultralytics easyocr fastapi uvicorn httpx python-multipart opencv-python
uvicorn app:app --port 8008                                     # weights/best.pt chahiye, git mein nahi
```

Apps ka backend URL **hardcoded** hai aur committed code mein Render par point karta hai
(`https://parkfnb.onrender.com`) — `software/apps/consumer/user/utils/constants.js` aur
`software/apps/owner/src/config/api.ts`. Local backend ke against test karne ke liye in dono ko badlo:
LAN IP (`localhost` physical device par nahi chalega) ya emulator par `localhost:5000` +
`adb reverse tcp:5000 tcp:5000`. Commit karne se pehle wapas Render kar do.

## Codebase conventions

- Backend **CommonJS** hai (`require`), ESM nahi. Express 5 + Mongoose.
- Response shape: `{ success, data }` ya `{ success: false, error: { code, http, message, traceId } }`
  — `src/utils/responseHelper.js` aur `src/utils/errorCodes.js` use karo, raw `res.json` nahi.
- DB fields **snake_case** hain. Dono apps request par camelCase→snake_case aur response par
  ulta transform karte hain (`caseTransform`), aur response se `data` unwrap karte hain — isliye backend ka
  `{ stats: { total_revenue } }` app mein `{ stats: { totalRevenue } }` ban jaata hai. Naya field jodte
  waqt yeh dhyan rakho.
- Consumer app **JavaScript** hai (`user/`), owner app **TypeScript** (`src/`). Dono NativeWind.
  Admin panel React + Vite + Tailwind (TypeScript).
- **Owner web dashboard** (`software/apps/owner-web`) React + Vite + TypeScript hai par **Tailwind nahi** —
  `src/styles/parkfnb.css` ANPR console (`ai/anpr/static/css/parkfnb.css`) ki copy hai aur components usi ke
  class names likhte hain. UI wahi rakhna hai jo console ka hai (owner ka hukm, 15 Nov 2026); naya colour/radius
  mat banao, tokens use karo. Dono css files same rehni chahiye (`diff` khaali).
- Owner app ke specialty modules `ENABLE_TYPE_SPECIFIC_UI` flag ke peeche shelved hain
  (`src/constants/featureFlags.ts`) — unhe bina backend support ke mat kholo.
- Barrier ka raasta: app → `POST /api/bookings/:id/unlock` (`bookingAccessController.js`) → MQTT **aur**
  Firebase bridge (`firebaseBarrierService.js`) → ESP32. Camera → `POST /api/access/anpr-event`
  (`anprAccessController.js`, `x-anpr-token` header). ANPR service sirf plate padhti hai; allow/deny
  backend karta hai.
- **Owner web ka camera raasta**: browser → backend `POST /api/cameras/access-grant` (owner ke active `Camera`
  records, `Camera.owner_id` → **Owner**, `linked_at` = "since") → 15 min ka HS256 pass (`ANPR_GRANT_SECRET`,
  `JWT_SECRET` nahi) → browser seedha ANPR `/owner/api/cameras/{id}/...` (`ai/anpr/owner_api.py`,
  `grant_auth.py`) ko pass header mein bhejta hai. ANPR backend ko kabhi call nahi karta. Pass mein jo camera
  nahi uska jawab 404 hai; "since" se pehle ka sab (plates samet) chhupa rehta hai. Camera link admin panel
  ke Cameras page se (ya owner pairing code se). Details: `ai/anpr/HANDOVER.md` §7.

## Jo cheezein aasani se galat ho jaati hain

- **`ParkingSpace` mein price ke do set hain** — `price_per_hour` (search isi par filter karta
  hai) aur `hourly_rate` (booking price isi se banti hai). Sync **haath se** hota hai teen
  jagah: `createSpace`, `updateSpace`, `updatePricing`. Naya write path likho to dono set karo.
- **Commission/platform fee ka koi field nahi hai.** `Booking` mein sirf `base_price`/`discount_amount`/
  `total_amount` hain. `getOwnerEarnings` `sum(total_amount)` lautata hai — owner ko 100% GBV dikhta hai.
  `PlatformSettings` mein `platform.commission_rate` (0.15) seeded hai par kuch use nahi karta. Owner app
  mein bhi alag-alag placeholders bache hain: `EarningsSummaryCard.tsx` ab "No platform fee yet" dikhata hai,
  par `utils/storage.ts` ka mock "Fees = 8% of gross" aur `PayoutsScreen.tsx` ka "Platform Fee (0.18%)" label
  abhi hai. Split bhi do jagah ulta hai: Indore proposal landowner ko net revenue ka 30% deta hai (ParkFNB
  hardware ka kharcha uthata hai), jabki investor deck aur status docs mein owner 70% / ParkFNB 30% hai —
  in sab ka ek hi number hona chahiye.
- **Payment gateway stub hai.** `paymentsController.js` mein `Math.random() > 0.1` se payment
  success/fail hota hai, koi Razorpay/Stripe SDK nahi, webhook signature verify nahi hoti. Refunds
  (`refundsController.js`) bhi stub hain. Abhi sirf **cash** booking asli kaam karti hai.
- **`checkIn` payment check nahi karta** — sirf `status === 'confirmed'` aur window (start se 1 ghanta
  pehle se booking ke end tak; uske baad `no_show`). Barrier `unlock` alag hai: woh `confirmed|active`,
  `payment_status === 'paid'` (cash ko chhoot) aur start se ±30 min check karta hai.
- **`BARRIER_DEMO_MODE=true` sab gates hata deta hai** (status, payment, time window) aur har space ko
  ek hi barrier (`BARRIER_DEMO_DEVICE_ID`) par bhej deta hai. `software/services/backend/render.yaml` mein
  yeh abhi committed hai — pilot se pehle hatao.
- **Test OTP `123456` ab `NODE_ENV=production` par mana hai** (`otpController.isTestLoginActive`); `render.yaml`
  se `TEST_OTP`/`ALLOW_DEV_OTP` hata diye gaye. Band cloud test ke liye hi dashboard mein
  `ALLOW_TEST_OTP_IN_PRODUCTION=true`. Isse real login ke liye ab asli SMS provider chahiye (HANDOFF §4.2), warna
  kisi ka bhi login nahi hoga. Owner web par owner ko plates dikhte hain, isliye `access-grant` bhi tab tak 503
  deta hai jab tak test code chal sakta hai. `POST /auth/register` ab `user_type` sirf `user|owner` leta hai.
- **`hasBookingConflict`**: `pending` booking 2 ghante (`PENDING_HOLD_MS`) baad slot block karna band
  kar deti hai; `cancelled|completed|no_show|rejected` kabhi block nahi karte. Pehle yahan koi TTL nahi
  tha — purani baat mat dohrao.
- **Currency default `'INR'`** hai `Booking` aur `Payment` dono mein.
- **Owner app mein mock/seed data bacha hai** — `utils/storage.ts` kuch jagah `seedFullListings` /
  `seedFullBookings` / `seedEarningsTransactions` par fall back karta hai, `PayoutsScreen` mock import
  karta hai, aur profile edits sirf device par save hote hain (API call nahi). HANDOFF P1 #9–10.
- **OTP**: SMS provider DB `PlatformSettings` (`sms.provider`, `sms.api_key`) se pehle, phir env se
  chunta hai; default `mock` hai jo sirf log karta hai. MSG91 widget 4-digit code deta hai jabki dono apps
  6-digit maangte hain (`OTP_LENGTH = 6`). MSG91 token git history aur dono apps ke `msg91Service` mein hai.
- **Render deployment** (`parkfnb.onrender.com`) respond karta hai (free tier: cold start ~30 sec). Par
  HANDOFF ke baad ke fixes (pricing, id validation) wahan deploy hue ya nahi — confirm karo, maan mat lo.
  Uploads Cloudinary par tabhi jaate hain jab teeno `CLOUDINARY_*` env set hon, warna local disk par
  jaate hain jo har deploy par mit jaati hai.
- **Dono apps saath chalane ke liye alag Metro ports chahiye** — consumer 8081, owner 8082.
  Owner app ko 8082 par bhejne ke liye uske `shared_prefs/com.owners_preferences.xml` mein
  `debug_http_host` = `localhost:8082` set karo, aur `adb reverse tcp:8082 tcp:8082` bhi.
- **User model mein `email` aur `phone` dono optional hain** (sparse unique) — OTP sign-up sirf
  phone se hota hai. `password_hash` bhi optional hai; `comparePassword` OTP-only account par
  hamesha false deta hai.
- **Release APKs debug keystore se sign hote hain** (dono apps ka `android/app/build.gradle`). Sirf
  testing builds hain.

## Kaam karne ka tareeka

- Commit root se karo (ek hi repo hai). Remote `origin` = `github.com/synquiclabs/parkfnb`.
- Kuch bhi naya API banao to pehle `software/services/backend/src/routes/` mein grep karo ki woh
  already hai ya nahi — `api-contract.md` purana hai aur isne pehle bhi galat "missing" bataya hai.
- Backend ke commands (`seed-demo.js --reset`, `make-admin.js`, `link-device.js`) `scripts/` mein hain;
  demo logins aur seed ki detail `research/status/APP_DEV_TASKS.md` mein.
