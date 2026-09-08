# Parkfnb workspace

Yeh **workspace** hai, monorepo nahi. `apps/consumer`, `apps/owner` aur `services/backend`
teen alag git repos hain (remotes: `github.com/AIBInnovations/bnb{consumerapp,ownerapp,backend}`).
`services/space-optimizer`, `firmware/` aur `docs/` plain folders hain (git repos nahi).
**Is root folder ko `git init` mat karna.**

Orientation: [`README.md`](README.md) · design: [`docs/system-design.md`](docs/system-design.md)
· endpoints + gaps: [`docs/api-contract.md`](docs/api-contract.md)

## Chalane ke commands

```bash
# backend
cd services/backend && npm install && npm run dev      # port 5000, .env chahiye

# apps
cd apps/consumer && npm install && npm start           # phir: npm run android
cd apps/owner    && npm install && npm start

# space optimizer (Python)
cd services/space-optimizer && pip install flask shapely numpy pyproj && python app.py
```

Apps ka backend URL **hardcoded** hai — `apps/consumer/user/utils/constants.js` aur
`apps/owner/src/config/api.ts`. Local backend ke against test karne ke liye LAN IP daalo,
`localhost` physical device par nahi chalega.

## Codebase conventions

- Backend **CommonJS** hai (`require`), ESM nahi. Express 5 + Mongoose.
- Response shape: `{ success, data }` ya `{ success: false, error: { code, http, message, traceId } }`
  — `src/utils/responseHelper.js` aur `src/utils/errorCodes.js` use karo, raw `res.json` nahi.
- DB fields **snake_case** hain. Dono apps request par camelCase→snake_case aur response par
  ulta transform karte hain (`caseTransform`). Naya field jodte waqt yeh dhyan rakho.
- Consumer app **JavaScript** hai (`user/`), owner app **TypeScript** (`src/`). Dono NativeWind.
- Owner app ke specialty modules `ENABLE_TYPE_SPECIFIC_UI` flag ke peeche shelved hain
  (`src/constants/featureFlags.ts`) — unhe bina backend support ke mat kholo.

## Jo cheezein aasani se galat ho jaati hain

- **`ParkingSpace` mein price ke do set hain** — `price_per_hour` (search isi par filter karta
  hai) aur `hourly_rate` (booking price isi se banti hai). Sync **haath se** hota hai teen
  jagah: `createSpace`, `updateSpace`, `updatePricing`. Naya write path likho to dono set karo.
- **Currency default `'USD'`** hai `Booking` aur `Payment` dono mein, jabki apps INR dikhate hain.
- **Commission/platform fee ka koi field nahi hai.** `getOwnerEarnings` `sum(total_amount)`
  lautata hai — owner ko 100% GBV dikhta hai.
- **`checkIn` payment check nahi karta** — sirf `status === 'confirmed'` dekhta hai.
- **`hasBookingConflict` `pending` ko conflict maanta hai** aur koi TTL nahi hai — abandoned
  booking slot ko hamesha ke liye block kar deti hai.
- **Apps aise endpoints call karte hain jo is backend repo mein nahi hain** —
  `bookings/:id/approve|reject|noshow` abhi bhi missing hain.
  (`auth/otp/*`, `onboarding-status`, `users/me/profile` aur `owners/me/profile|kyc|kyc/draft`
  ab ban chuke hain.) `docs/api-contract.md` mein poori list.
- **Dono apps ka backend URL dev ke liye `localhost:5000` par hai** (uncommitted) —
  `adb reverse tcp:5000 tcp:5000` chahiye. Render deployment (`parkingbnbbackend.onrender.com`)
  respond nahi kar raha, aur naye endpoints wahan deploy bhi nahi hue hain.
- **Dono apps saath chalane ke liye alag Metro ports chahiye** — consumer 8081, owner 8082.
  Owner app ko 8082 par bhejne ke liye uske `shared_prefs/com.owners_preferences.xml` mein
  `debug_http_host` = `localhost:8082` set karo, aur `adb reverse tcp:8082 tcp:8082` bhi.
- **User model mein `email` aur `phone` dono optional hain** (sparse unique) — OTP sign-up sirf
  phone se hota hai. `password_hash` bhi optional hai; `comparePassword` OTP-only account par
  hamesha false deta hai.

## Kaam karne ka tareeka

- Teen repos alag hain — commit unke andar se karo, root se nahi.
- Kuch bhi naya API banao to pehle `docs/api-contract.md` dekho: ho sakta hai woh endpoint
  deployed backend par already ho.
