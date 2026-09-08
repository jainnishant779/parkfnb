# Parkfnb

Urban parking ka operating layer — do mobile apps, ek backend, aur barrier firmware.
Yeh folder ek **workspace** hai, monorepo nahi: teen alag git repos hain jo yahan saath rakhe gaye hain.

```
parkfnb/
├─ apps/
│  ├─ consumer/     React Native · driver app        → github.com/AIBInnovations/bnbconsumerapp
│  ├─ owner/        React Native · space-owner app   → github.com/AIBInnovations/bnbownerapp
│  └─ admin/        (abhi khaali — banana baaki hai)
├─ services/
│  ├─ backend/          Express 5 + MongoDB          → github.com/AIBInnovations/bnbbackend
│  └─ space-optimizer/  Flask + shapely layout engine (prototype)
├─ firmware/
│  └─ parkbnb_esp32/    ESP32 barrier controller
└─ docs/
   ├─ deck/             investor deck (+ archive/ mein purane versions)
   ├─ research/         PRDs, mechanism concepts, module datasheets
   ├─ system-design.md
   └─ api-contract.md
```

`services/space-optimizer`, `firmware/` aur `docs/` git repos **nahi** hain — plain folders hain.

> **Dhyan do:** `apps/consumer`, `apps/owner` aur `services/backend` apne-apne git repos hain.
> Commit/push unke andar se karo. Is workspace folder ko `git init` mat karna.

---

## Teeno kaise judte hain

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Consumer app │   │  Owner app   │   │ Admin panel  │
│   (driver)   │   │   (supply)   │   │  (banana hai)│
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       └──────────────────┼──────────────────┘
                REST + JWT (Bearer)
                          │
                ┌─────────▼─────────┐
                │      backend      │  20 models · 144 endpoints
                │  Express + Mongo  │
                └─────────┬─────────┘
                          │ MQTT (aage jaake)
                ┌─────────▼─────────┐
                │   ESP32 barrier   │
                └───────────────────┘
```

Dono apps **ek hi backend aur ek hi User collection** use karte hain. Farq sirf `user_type`
field ka hai (`user` / `owner` / `admin`) — `roleCheck.js` middleware usi se decide karta hai
kaun kya kar sakta hai.

### Data hierarchy

```
User (user_type: 'owner')
  └─ Owner              KYC, payout account, earnings
      └─ Property       ek address / plot (lat, lng, city)
          └─ ParkingSpace     ek actual bay (dimensions, ₹/hr)
              └─ SpaceAvailability    din-wise hours
                     ↓
                  Booking   User + Space + Vehicle + time window
                     └─ Payment / Refund / Review
```

Ek owner **ek property** banata hai, uske andar **kai spaces**. Isliye owner app mein do
alag wizards hain — `PropertyWizardStack` aur `SpaceWizardStack`.

### Booking lifecycle

```
pending ──owner approve──▶ confirmed ──checkin──▶ active ──checkout──▶ completed
   │                           │
   └──reject──▶ cancelled      └──window miss──▶ no_show
```

**Check-in owner karta hai, driver nahi.** Window tight hai — start time se 1 ghanta pehle
se 1 ghanta baad tak; miss hua to booking khud `no_show` ho jaati hai.

---

## Chalane ke liye

### Backend

```bash
cd services/backend
npm install
cp .env.example .env      # MONGODB_URI aur JWT_SECRET bharo
npm run dev               # nodemon, port 5000
```

Health check: `http://localhost:5000/health`

### Apps

```bash
cd apps/consumer          # ya apps/owner
npm install
npm start                 # Metro bundler
npm run android           # dusre terminal mein
```

**Dono apps abhi hardcoded deployed backend par point karte hain:**

| App | File | Value |
|---|---|---|
| consumer | `user/utils/constants.js` | `API_BASE_URL = 'https://parkingbnbbackend.onrender.com'` |
| owner | `src/config/api.ts` | wahi |

Local backend ke against chalane ke liye ise apni machine ke **LAN IP** par badlo
(`http://192.168.x.x:5000`) — `localhost` physical device par kaam nahi karega.

### Firmware

Arduino IDE → Boards Manager → **esp32** (Espressif).
Libraries: **PubSubClient**, **ArduinoJson v6**.
`firmware/parkbnb_esp32/config.h` bharo, flash karo, Serial Monitor 115200 par kholo.
Test karne ke liye `firmware/test_controller.html` browser mein double-click karo.

Detail: [`firmware/README.md`](firmware/README.md)

---

## Abhi kahan khade hain

| Component | Haal |
|---|---|
| Backend | 144 endpoints, 20 models. Payment gateway abhi **stub** hai (koi Razorpay/Stripe SDK nahi) |
| Consumer app | 32 screens bane, **13 navigation se jude**. Search/Payment/Reviews orphan hain |
| Owner app | 85 screens bane, **73 jude**. Promotions abhi AsyncStorage par, backend par nahi |
| Firmware | Motorised prototype chalta hai — WiFi + MQTT. BLE fast path abhi nahi |
| Space optimizer | **Kaam karta hai** — 794-line shapely engine + Flask UI. NBC 2016 / BIS SP 73 rule packs |
| Video analytics | Koi code nahi mila |
| Admin panel | Exist nahi karta |

### Teen cheezein jo abhi flow todti hain

1. **Payment booking ko gate nahi karta** — `checkIn` sirf `status === 'confirmed'` dekhta hai,
   `payment_status` nahi. Matlab bina paise diye approve hokar park kiya ja sakta hai.
2. **Abandoned booking slot ko hamesha ke liye block karta hai** — `hasBookingConflict`
   `pending` ko conflict maanta hai, aur koi TTL/expiry nahi hai.
3. **Commission ka koi field nahi** — `Booking` mein `base_price`/`discount_amount`/`total_amount`
   hain, par platform fee ya commission nahi. `getOwnerEarnings` `sum(total_amount)` deta hai,
   yaani owner ko **100% GBV** dikhta hai. Deck ka 70/30 split laagu hi nahi ho sakta.

### Space optimizer chalane ke liye

```bash
cd services/space-optimizer
pip install flask shapely numpy pyproj
python app.py                 # phir browser mein kholo
```

Poora system design aur roadmap: [`docs/system-design.md`](docs/system-design.md)
API contract aur gaps: [`docs/api-contract.md`](docs/api-contract.md)
