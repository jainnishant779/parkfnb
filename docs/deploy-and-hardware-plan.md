# Deploy + Hardware — plan

Yeh do sawaalon ka jawab hai: **kya deploy karna hai aur kahan**, aur **hardware kaise
jodna hai**. Dono ka research aur codebase ka audit karke likha gaya hai — har
finding ke saath file:line diya hai taaki verify kar sako.

Saath padho: [`system-design.md`](system-design.md) · [`api-contract.md`](api-contract.md)

---

## Sabse pehle: deploy abhi mat karo

Audit mein **teen cheezein** aisi mili jo deploy karte hi asli nuksaan karengi.
Ye "nice to have" nahi hain — inke bina live jaana ulta padega.

### 1. Payments naqli hain

`src/controllers/paymentsController.js:211`

```js
const paymentSuccess = Math.random() > 0.1; // 90% success rate for testing
```

Har payment ek **sikka uchhaal** hai. 10% asli users ko "payment failed" milega
bina kisi wajah ke, aur **paisa kabhi move nahi hota** — transaction ID bhi
line 208 par banaya jaata hai (`Math.random().toString(36)`). Refunds bhi wahi
(`refundsController.js:339-349`).

Live jaane se pehle Razorpay chahiye. Ye "baad mein" waali cheez nahi hai.

### 2. Uploads har deploy par mit jaate hain

`src/routes/uploadRoutes.js:23` local disk par likhta hai, `server.js:43` usse serve
karta hai. Render/Railway ka filesystem **ephemeral** hai — har deploy, restart, ya
crash par folder khaali.

Uska matlab: **saare owner KYC documents (Aadhaar, PAN, bank proof) aur listing
photos gayab**, par URLs Mongo mein bache rahenge. Owner ko lagega KYC submit ho
gaya, admin ko kuch dikhega nahi, aur re-upload maangne ka koi flow bhi nahi hai.

Ek aur baat: `/uploads/<name>` par **koi auth nahi** hai. KYC documents jiske paas
URL hai wo padh sakta hai.

### 3. OTP response mein aa sakta hai

`src/controllers/otpController.js:162` — `if (!isProd()) payload.dev_code = code;`

Guard sahi likha hai, par ye poori tarah `NODE_ENV === 'production'` par tika hai.
**Render/Railway hamesha `NODE_ENV=production` set nahi karte.** Agar wo missing
raha ya `staging` hua, to `POST /api/auth/otp/send` **kisi bhi anonymous caller ko
OTP laut ayega** — yaani kisi bhi phone number ka account le lo.

Ye ek env var ki galti par poora auth khul jaata hai. Isliye flag ko `NODE_ENV` se
alag, explicit opt-in banao (`ALLOW_DEV_OTP=true`), taaki default hamesha band ho.

---

## Baaki pre-deploy list

Severity ke hisaab se. Har line verify ki hui hai.

| # | Kya | Kahan | Kyun zaroori |
|---|---|---|---|
| 1 | Payments asli karo | `paymentsController.js:211` | upar dekho |
| 2 | Uploads S3/Cloudinary par | `uploadRoutes.js:23` | upar dekho |
| 3 | `dev_code` explicit flag par | `otpController.js:162` | upar dekho |
| 4 | Rate limiting **chaalu karo** | neeche | abhi zero hai |
| 5 | Boot par env validate karo | `config/db.js` | neeche |
| 6 | Boot banner theek karo | `server.js:90-93` | deploy hi crash kar sakta hai |
| 7 | Production mein errors log karo | `errorHandler.js:55` | abhi andhere mein ho |
| 8 | SIGTERM handle karo | `server.js:85` | har deploy par requests marti hain |
| 9 | Health check gehra karo | `server.js:33` | Mongo mara ho to bhi "healthy" |
| 10 | Mongo injection band karo | `validation.js:119` | neeche |
| 11 | Helmet lagao | — | `/uploads` same-origin serve hota hai |
| 12 | Currency INR karo | `Booking.js:67` | booking INR, payment USD |

### 4 — Rate limiting abhi **bilkul nahi** hai

`src/middleware/rateLimit.js` maujood hai, par:

- `express-rate-limit` **`package.json` mein hai hi nahi** aur `node_modules` mein
  bhi nahi (maine check kiya — `MISSING`)
- har call site **comment out** hai (`authRoutes.js:11,17,27,38,47`,
  `bookingRoutes.js:12,41`, `paymentRoutes.js:12,38`, `messageRoutes.js:11,28`)

File sirf isliye chal rahi hai kyunki koi use hi nahi karta. Matlab
`/otp/send`, `/login`, `/register`, `/forgot-password` aur `POST /bookings`
public host par **poori tarah unthrottled** hain.

Bina `npm i` ke comment hatane par server **boot par crash** karega. Dono saath
karo, aur `app.set('trust proxy', 1)` bhi — warna proxy ke peeche sab requests ek
hi IP lagti hain aur limiter sabko ek saath ban kar deta hai.

OTP ka apna throttle (`otpController.js:129-138`) hai lekin wo **per-identifier**
hai, per-IP nahi — attacker phone numbers badal kar nikal jaayega.

### 5 — Boot par env validate karo

Abhi `JWT_SECRET` missing ho to server **boot ho jaata hai, health check pass karta
hai**, aur har login par 500 deta hai. Sabse bura failure mode. `app.listen` se
pehle hard-fail karo.

### 6 — Boot banner deploy crash kar sakta hai

`src/server.js:93`

```js
${' '.repeat(40 - (process.env.FRONTEND_URL || 'http://localhost:5173').length)}
```

Agar asli `FRONTEND_URL` 40 characters se lamba hua (jaise
`https://parkfnb-admin.onrender.com/dashboard`), `String.repeat` ko negative
milega aur **`RangeError` throw karega — process boot par mar jayega.**
Same `NODE_ENV` (line 90) ke saath. Banner delete kar do, ya `Math.max(0, ...)`.

### 10 — Mongo operator injection

`src/middleware/validation.js:119-128` ka `sanitize` sirf **top-level string**
values chhoota hai. `{"email": {"$ne": null}}` seedha `User.findOne()` mein chala
jaata hai. Query strings to bilkul sanitize hote hi nahi —
`parkingSpacesController.js:44` `req.query.space_type` seedha filter mein daalta hai,
to `?space_type[$ne]=x` injectable hai.

`express-mongo-sanitize` lagao ya `mongoose.set('sanitizeFilter', true)`.

---

## Hosting — EC2, Firebase, ya managed?

### Firebase — nahi

Backend **Express + Mongoose** hai. Firebase ka matlab poora backend Cloud
Functions + Firestore mein dobara likhna: saari Mongoose queries, `populate`
chains, aggregations. Do-teen hafte ka kaam aur jo abhi chal raha hai wo tootega.

### EC2 — abhi nahi

Chalega, par abhi zaroorat nahi. OS patching, nginx, SSL renewal, PM2, backups —
kaam bahut, fayda abhi zero, kyunki ek bhi paying user nahi hai.

**EC2 tab lena jab:** ~500+ daily bookings, ya video analytics chalana ho (usko
alag CPU/GPU box chahiye), ya MQTT broker khud host karna ho.

### Render — yahi rakho

Pehle se configured tha (`parkingbnbbackend.onrender.com`), bas abhi **down** hai.

Free tier 15 min inactivity ke baad so jaata hai aur jaagne mein ~1 minute leta
hai — demo ke liye bekaar. **Starter $7/mo (~₹600)** se ye khatam.

Railway bhi theek hai ($5/mo Hobby, per-second billing) — variable load par
thoda sasta pad sakta hai. Render iska ek fayda ye hai ki setup pehle se hai.

### Database — MongoDB Atlas M0 (free)

512 MB storage, 500 connections, **permanently free**.

Ek zaroori nuance: **M0 par ~100 operations/sec ka limit** hai. Storage hazaaron
bookings ke liye kaafi hai, lekin traffic burst par throttle hoga. M10 ($57/mo)
tab lena jab asli traffic aaye — abhi nahi.

### Storage — Cloudinary free tier

25 monthly credits, free, card ki zaroorat nahi. Per-GB S3 se ~16x mehnga hai,
par is scale par ye bemaani hai — free tier ke andar ho, aur CDN + transforms
included hain. S3 tab jab bill dikhne lage.

### SMS — MSG91

| | per SMS | billing |
|---|---|---|
| **MSG91** | ~₹0.15–0.25 | INR |
| Twilio | ~₹1.50–2.00 | USD + forex |

MSG91 **3–5x sasta** hai India ke liye, aur owner app mein pehle se integrate tha
(maine `msg91Service` hataya tha kyunki wo backend OTP ko bypass kar raha tha —
service wapas laga sakte ho, bas `sendCode` ke andar).

**DLT registration** lagega: ₹5,900 PE + ₹5,900 header, ek baar. Ye har compliant
provider ke liye zaroori hai, MSG91 ho ya koi aur. **Isme 1–2 hafte lagte hain —
aaj hi shuru kar do**, warna deploy ready hoke bhi OTP nahi bhej paoge.

### `sendCode` badalne mein kya lagega

`src/controllers/otpController.js:105-108` abhi sirf `console.log` karta hai.

```js
const sendCode = async (identifier, channel, code) => {
  console.log(`[otp] ${channel} -> ${identifier} : ${code} ...`);
  return true;
};
```

Teen baatein:

1. **`+91` wapas lagana padega.** `normalizeIdentifier` (line 43) usse strip kar
   deta hai aur store nahi karta.
2. **Failure abhi ignore hota hai.** `sendCode` hamesha `true` deta hai aur caller
   (line 153) return value dekhta hi nahi. Provider down ho to user ko
   `200 "Code sent"` milega, code Mongo mein pada rahega, aur 30s cooldown
   (line 129) uska retry bhi rok dega. Throw karao ya result check karo.
3. **Test suite `dev_code` par tiki hai** (`tests/auth-otp.smoke.js:53`) — usse
   `sendCode` stub karna padega.

### Kitna kharcha

| | free se shuru | asli traffic par |
|---|---|---|
| Backend | ₹0 (spin-down) | ₹600/mo (Render Starter) |
| MongoDB | ₹0 (M0) | ₹4,700/mo (M10) |
| Storage | ₹0 (Cloudinary) | ~₹1,700/mo |
| SMS | ₹0.20/OTP | wahi |
| DLT | ₹11,800 ek baar | — |
| **Total** | **~₹12,000 ek baar** | **~₹7,000/mo** |

Pilot ke liye: **₹12,000 ek baar + ₹600/mo.**

---

## Hardware

### Ab kya hai

**Firmware poora likha hua hai aur kaam karta hai** —
`firmware/parkbnb_esp32/parkbnb_esp32.ino` (~330 lines):

- WiFi → TLS → MQTT (HiveMQ Cloud), PubSubClient + ArduinoJson
- Topics: `parkbnb/<id>/cmd` (in), `/state` (retained), `/evt`, `/online` (LWT)
- Commands: `open` (0°), `close` (90°), `goto`, `stop`, `status`, `clear`, `cal`
- Angle **gravity se** (MPU6050 accelerometer) — gyro drift nahi
- Soft start, approach taper, 8s timeout, **obstruction detection** (700ms mein
  1° na badle to power cut)
- Har 10s heartbeat, broker LWT se offline detection

Ye achhi engineering hai. Rewrite nahi karna.

### Backend mein kya hai

**Kuch nahi.** Maine poora `src/` grep kiya — `mqtt`, `device`, `barrier`,
`gate`, `iot`, `esp32`, `telemetry` par **ek bhi asli hit nahi**. Na `Device`
model, na koi endpoint, na `ParkingSpace` par `device_id` field.

Apps mein bhi:
- Consumer app: barrier ka **koi UI nahi**
- Owner app: `IoTIntegrationsScreen.tsx` (1350 lines) **pura mock hai** — koi
  network call nahi, sab AsyncStorage, "connecting" ek `setTimeout` hai. Owner
  aaj "Smart Barriers" toggle kar sakta hai aur kuch nahi hota.

Yaani: **hardware taiyaar hai, usko chalane wala kuch nahi hai.**

### WiFi ya SIM?

| | WiFi | 4G SIM |
|---|---|---|
| Module | ESP32 (~₹400) | ESP32 + A7670C (~₹1,200–2,400) |
| Data | ₹0/mo | **₹29/mo** (Airtel IoT M2M) |
| Kahan | ghar, society, mall | khuli parking, roadside |

**Shuru WiFi se** — pilot ghar ya society mein hoga jahan WiFi hai. Firmware
abhi WiFi-only hai.

Data itna kam lagta hai ki SIM bhi sasta hai:

- MQTT keepalive: ~2 KB/hour
- Ek open/close cycle: ~200 bytes
- 20 bookings/din + heartbeat: **~100 KB/din = 3 MB/mahina**

Airtel ka ₹29/mo M2M plan 1 MB deta hai — thoda kam pad sakta hai, to heartbeat
10s se badha kar 60s karna hoga (ya thoda bada plan). Phir bhi **₹29–50/mo per
device** — maine pehle ₹100-150 socha tha, asal mein us se sasta hai.

### Security — sabse badi baat

Firmware abhi **ek hi shared secret** use karta hai jo **har unit mein compile
hota hai** (`config.h:23`), aur `strcmp` se check hota hai. Saath mein
`netClient.setInsecure()` — **TLS bina certificate verify kiye**.

Firmware ka README khud isse "prototype-grade" kehta hai:

> a shared secret compiled into every unit means one extracted unit unlocks the
> whole fleet

Ye pilot ke liye theek hai (ek device, tumhara apna ghar). **Doosre owner ke paas
device jaane se pehle** ye badalna hoga:

1. `setInsecure()` → `setCACert()`
2. Per-device credentials, fleet-wide secret nahi
3. Broker ACLs — device sirf apne topic par publish/subscribe kar paaye
4. Aage chal kar: server-signed, booking-window tak seemit Ed25519 tokens
   (jo `system-design.md` mein already decide hai)

### Topology — Option B, sirf yahi

Firmware ke README mein do options likhe hain. `test_controller.html` Option A
karta hai (app seedha broker se). **Wo marketplace ke liye bilkul nahi chalega**
— fleet-wide token ajnabi ke phone par chala jayega.

```
App  →  Backend  →  MQTT broker  →  Device
```

Backend hi commands sign kare aur bheje. `system-design.md:112` bhi yahi kehta hai.

### Offline — ye sochna padega

Firmware mein **koi offline path nahi hai**. Na cached booking, na local
credential, na BLE fallback. Network gaya to driver **barrier khol hi nahi
payega** — uski gaadi andar phans jayegi jab tak net wapas na aaye.

Ye asli product mein chalega nahi. Do raste:

- **BLE fallback** — driver wahin khada hai, phone se seedha
- **Cached grant** — device aane wali bookings ka chhota token pehle se rakh le

Pilot ke liye ek `verification_code` + manual override kaafi hai. Scale par nahi.

### Broker — HiveMQ Cloud free tier

100 connections free, TLS included, firmware pehle se ismein configured hai.
EMQX Serverless bhi option hai (usage-based). 100 devices tak HiveMQ theek hai.

### Backend mein kya banana hoga

1. **`Device` model** — `device_id`, `space_id`, `secret`, `status`,
   `last_seen_at`, `last_state`, `fw_version`
2. **`ParkingSpace.device_id`** — abhi ye link hai hi nahi
3. **Command counter** per device, server-side, monotonic — firmware `n` se replay
   rokta hai aur NVS mein persist karta hai, to backend restart par counter na
   toote warna device sab reject karega
4. **MQTT client** — `mqtt` package, long-lived connection, wildcard subscribe
   (`parkbnb/+/state`)
5. **`POST /api/bookings/:id/access-grant`** — `system-design.md` mein ye
   abstraction pehle se decide hai. Renter ko verify karo, booking `confirmed`
   **aur paid** ho, phir `open` publish karo
6. **Audit log** — kisne kab kya khola, kis booking par. Security product ke liye
   ye optional nahi hai
7. **Ack correlation** — firmware `move_done` mein command ka `n` echo nahi karta,
   to backend pakka nahi jaan sakta ki kaunsa command complete hua. Firmware mein
   `req_id` echo add karna hoga

Saath mein `checkIn` bhi theek karna hoga: abhi wo **owner-only** hai
(`bookingsController.js:869`) aur **payment check nahi karta** — renter apna
check-in khud nahi kar sakta.

---

## Kis kram mein

### Hafta 1 — deploy blockers

Ye teen bina hue deploy ka koi matlab nahi:

1. Razorpay integrate karo (`Math.random()` hatao)
2. Uploads Cloudinary par
3. `dev_code` explicit flag par + `express-rate-limit` install + chaalu

Saath mein DLT registration **aaj file kar do** — 1-2 hafte lagte hain, parallel
chalega.

### Hafta 2 — deploy

4. Env validation, banner fix, SIGTERM, prod logging, deep health check
5. Helmet + mongo-sanitize
6. Render par deploy, Atlas M0, dono apps ka URL badlo
7. MSG91 `sendCode` mein (DLT approve hote hi)

Iske baad tum kisi ko bhi phone par app dikha sakte ho — abhi tumhara laptop
chalu hona zaroori hai.

### Hafta 3-4 — pehla device

8. `Device` model + `ParkingSpace.device_id`
9. MQTT client backend mein
10. `POST /bookings/:id/access-grant`
11. Consumer app mein "Open barrier" button
12. Ek ESP32, WiFi par, apne ghar ki parking par

**Ek device end-to-end chal jaaye — booking se barrier khulne tak — to baaki sab
copy-paste hai.**

### Uske baad

- Per-device credentials + TLS cert validation (doosre owner ko dene se pehle)
- Offline path (BLE ya cached grant)
- Owner app ka IoT mock hata kar asli pairing
- Device fleet admin panel

---

## Jo abhi bhi toota hai (deploy se alag)

Audit mein ye bhi mila, dhyan mein rakho:

- **`hourly_rate` optional hai** (`ParkingSpace.js:54-79`) jabki `price_per_hour`
  required. Koi bhi doosra path (seed script, admin insert, Atlas se seedha) space
  bana de to booking price `NaN` ho jayega
- **Search O(n) hai** — `parkingSpacesController.js:437-490` har available space
  laata hai, Node mein Haversine chalata hai, phir **per-space ek booking query**
  (N+1), phir memory mein paginate karta hai. Kuch hazaar listings par timeout
- **`Property` par geo index nahi hai** — `location_lat/lng` plain compound index
  hai, `2dsphere` nahi, isliye radius query use hi nahi kar sakti
- **`User.email` unique hai par `sparse` nahi** — bina email waala doosra user
  `email: null` par collide karega
- **`cancelBooking` ka owner check galat hai** — `owner_id` `Owner` ko point karta
  hai par code `req.user._id` se compare karta hai, to owner apni booking cancel
  nahi kar sakta
- **Commission ka field nahi hai** — owner ko 100% GBV dikhta hai
- **Payments/refunds/promo ka koi test nahi** — aur wahi teen files hain jismein
  `Math.random()`, float equality (`paymentsController.js:199`), aur promo
  discount ka logic **teen jagah duplicate** hai
