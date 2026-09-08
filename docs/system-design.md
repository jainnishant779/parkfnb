# System design

Poora interactive version: **https://claude.ai/code/artifact/59a1715d-5a83-40c0-b856-d29137cd9a7f**
(diagrams, feature matrices, phasing)

Yeh file uska text summary hai taaki repo mein bhi rahe.

---

## Spine — paanch shared services, teen clients

```
Consumer app   Owner app   Admin panel
      └────────────┼────────────┘
                   │  ek hi API · ek hi token
   Identity · Inventory · Booking · Money · Access grants
                   │ publish
              Event bus
        ↙          ↓           ↘
 Notifications  Payouts   Vision + devices   ← Phase 2/3 yahan attach
```

**Rule:** agar do se zyada clients ko ek cheez chahiye, woh client mein nahi —
shared service mein banegi.

Abhi backend ek flat REST layer hai. Video analytics aur hardware jodne se **pehle** beech
mein event bus chahiye, warna har naya feature booking controller ko chhoona padega.

### Do schema badlav

1. **`user_type` → `roles: []`** — bahut saare owners khud bhi kahin park karte hain.
   Ek account, dono apps.
2. **Ek authoritative `SpaceState`** — teen source feed karein: booking (becha),
   device (physically locked), camera (dikh raha hai). Precedence rules ke saath.

### Apps merge karein?

**Nahi.** Do apps rakho, par **ek account**. Mental model alag hai, screen count alag hai
(85 vs 32). Uber aur Airbnb dono ne yahi kiya. Consumer app mein "apni jagah list karo"
ka deep link ho jo owner app kholta hai.

---

## Money model — sabse bada gap

Booking banate waqt poora breakdown **usi waqt freeze** karo:

```js
base_price          // rate × duration            (hai)
discount_amount     // promo                       (hai)
convenience_fee     // ← naya: B2C fee, ₹10–25
total_amount        // driver kitna deta hai       (hai)

commission_rate     // ← naya: SNAPSHOT, e.g. 0.30
commission_amount   // ← naya: Parkfnb ka take
owner_payout_amount // ← naya
currency            // 'INR' (abhi 'USD' default hai)
```

**Rate ka snapshot kyun?** Kal commission 30% se 25% karoge — purani bookings ka payout
chupchap badalna nahi chahiye.

`PlatformSettings` model (key/value) pehle se bana hua hai — `commission_rate`,
`convenience_fee`, `currency`, `payout_hold_hours` wahan rakho, booking par freeze karo.

## Booking state machine

```
created → awaiting_payment ──15 min TTL──▶ expired (slot turant free)
             │
      payment captured
             ▼
   instant_book? ─no─▶ awaiting_approval ─reject─▶ cancelled
             │                │
            yes         owner approve
             ▼                ▼
              confirmed → active → completed ──T+48h──▶ payout eligible
```

Do zaroori changes:
- **`awaiting_payment` ka TTL** (15 min) — isse abandoned booking wala permanent block khatam
- **`checkIn` mein `payment_status === 'paid'` check** — abhi hai hi nahi

## Payout ledger

```js
OwnerLedgerEntry  owner_id, booking_id, type, amount, available_at, status, payout_id
Payout            owner_id, period, entry_ids[], gross, commission, net, status, utr
```

Har `completed` booking → credit entry, T+48h baad `available` (dispute window).
Refund → debit entry. Payout available entries consume karta hai.

---

## Access grants — hardware-ready abstraction

Ek endpoint jo teeno phases mein same rahe:

```
POST /api/bookings/:id/access-grant
```

| Phase | Grant kya lautata hai | Zaroorat |
|---|---|---|
| 1 · abhi | 6-digit code | kuch nahi — `verification_code` pehle se hai |
| 2 | signed JWT → QR | owner app mein `AccessPassQrScreen` scaffold hai |
| 3 | BLE key / device command | `Device` model + firmware |

**Faayda:** apps ek baar likhe jaate hain. Hardware aane par sirf grant ka type badalta hai.

> `firmware/README.md` isi baat par pahunchta hai — "Option B: app backend se baat kare,
> backend broker se". Woh sahi hai; access-grant service usi ka backend side hai.

---

## Video analytics — value detection nahi, reconciliation hai

| Camera kehta hai | Booking kehti hai | System kya kare | Paisa |
|---|---|---|---|
| Bhari | koi booking nahi | unauthorized alert | enforcement fee |
| Khaali | active booking | aaya nahi — release / no-show | inventory wapas |
| Bhari + plate X | plate X | auto check-in | friction khatam |
| Bhari + plate Y | plate X | galat gaadi — alert | dispute evidence |
| Abhi bhi bhari | 20 min pehle khatam | overstay | auto-bill |

- **Edge par process karo** — sirf events cloud jaayein, video nahi. Bandwidth + cost +
  DPDP Act 2023 teeno ek saath solve.
- **ANPR ko authority mat banao** — Indian plates par realistic 85–93%. Match ho to check-in
  boost karo, na ho to QR/code par giro. Sirf ANPR par entry deny kabhi mat karo.
- Edge box ₹25–45k → **50+ bay commercial lot** par hi banta hai. Yeh **B2B SaaS** hai,
  marketplace feature nahi.

## Space optimizer — AI nahi, geometry hai

> **Prototype maujood hai:** `services/space-optimizer/` — 794-line shapely engine +
> Flask UI + SQLite project save/load. Ismein pehle se hai: **NBC 2016 (India)**,
> **BIS SP 73:2023** aur US-ITE rule packs; angle-wise aisle width tables (0/45/60/90);
> gate kisi bhi edge par; turning / single-swing entry check warnings ke saath;
> pyproj se UTM projection. Yeh neeche wale design se kaafi aage hai.

```
Plot polygon → angle sweep (90/75/60/45/parallel × rotation)
             → constraint filter (setback, aisle, turning, fire path)
             → LayoutPlan ──human review──▶ ParkingSpace[]
```

**Optimizer seedhe spaces nahi banata** — beech mein insaan ka gate hai, kyunki plot ke
beech ka ped algorithm ko nahi dikhta.

Deta hai: *feasible-max capacity estimate*, 5 minute mein.
Nahi deta: sanctioned drawing (IMC bye-laws, fire tender path, ramp gradient).
Architect ka replacement mat becho.

**Asli role:** supply acquisition ka hathiyaar. Isliye pehle **admin panel ka internal BD
tool**, customer-facing SaaS baad mein.

---

## Admin panel — nau modules

1. **Supply ops** — KYC queue, property/space approval ← *sabse pehle yahi*
2. **Booking & disputes** — search, override, refund
3. **Money** — payout runs, commission config, PSP reconciliation, GST
4. Trust & safety — suspend, review moderation, fraud signals
5. Device fleet — health, battery, firmware rollout
6. Vision ops — camera health + zone mapping tool (internal)
7. Optimizer studio — plot → plan → publish (internal)
8. Growth — promos, density map, expansion
9. Support desk — `/api/support-tickets` ka UI

Stack: React + Vite + TanStack Query. Wahi backend, wahi JWT, `admin` role.
**Naya API likhna hi nahi** — jo `authorize('admin')` endpoints hain unhi ka UI hai.

---

## Phasing

| Kab | Kya |
|---|---|
| **Ab → 3 mo** | Commission + INR · state machine + TTL · Razorpay + webhook signature · missing endpoints · 19 orphan screens · admin (KYC + bookings + payout) |
| **3 → 6 mo** | Access-grant service + Ed25519 · QR pass · pehla hardware pilot · device fleet admin · dimension matching |
| **6 → 12 mo** | 2–3 lots par vision · zone mapping · reconciliation automation · optimizer as BD tool |
| **12 → 18 mo** | Vision B2B SaaS · optimizer paid service · shelved owner modules · B2G pilot |

Yeh deck ke GTM phases (Months 1–6 / 6–12 / 12–18 / 18+) se match karti hai.

> **Deck ke liye:** traction slide ke teen claims mein se **do ab defensible hain** —
> hardware prototype (`firmware/`) aur space optimizer (`services/space-optimizer/`) dono
> asli hain. Sirf **CCTV vision** ka koi code nahi mila; agar woh kahin exist nahi karta
> to us ek line ko "next" column mein daal do.
