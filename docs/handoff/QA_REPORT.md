# QA report — 2026-09-20

Scope: live backend (`https://parkfnb.onrender.com`), consumer app (`com.parkingapp`), owner app
(`com.owners`). Method and caveats are in `HANDOFF.md` §6–§7. **Build A** = the release APKs built from
the source at the start of the pass (consumer 16:41, owner 16:53). **Build B** = the APKs built after
the fixes below (consumer 17:26, owner 17:35). **Build C** = the consumer APK rebuilt at 17:45 to fix one
sheet that Build B still got wrong (B21). Both final APKs are Build B owner + Build C consumer. "Verified on B"
was filled in only for checks that were actually re-run; everything else says "not re-run on B".

Legend: **PASS** works as intended · **FAIL** defect (id → §D) · **INFO** observation, not a defect.

---

## A. Backend / API (live server, old code)

Script-driven with a throwaway consumer account (created through the `123456` code). 24 checks first run.

| # | Check | Result |
|---|---|---|
| A1 | Sign in with the test code `123456` for a never-seen number | **PASS** (works — this *is* a security defect, D1) |
| A2 | `GET /api/bookings/users/:id` without a token → 401 | PASS |
| A3 | Own bookings with token → 200 | PASS |
| A4 | Another user's bookings → 403 | PASS |
| A5 | Consumer `POST /api/properties` → 403 (owners only) | PASS |
| A6 | Garbage bearer token → 401 | PASS |
| A7 | Create vehicle → 201 | PASS |
| A8 | Quote 2 h = ₹80 | PASS |
| A9 | Quote 24 h on a ₹40/h, ₹300/day space | **FAIL** ₹960 (D2) |
| A10 | Quote 25 h / 48 h | INFO ₹600 / ₹600 — cheaper than 24 h (D2) |
| A11 | Quote 31 days on a space with no monthly rate | **FAIL** `null` total (D2) |
| A12 | Booking without required fields → 400 | PASS |
| A13 | End before start → 400 | PASS |
| A14 | Start in the past → 400 | PASS |
| A15 | Unknown space id → 404 | PASS |
| A16 | Malformed space id → 400 | **FAIL** 500 (D3) |
| A17 | Unknown vehicle id → 404 | PASS |
| A18 | Create cash booking → 201, `pending`, ₹80 | PASS |
| A19 | Identical slot again → 409 | PASS |
| A20 | Overlapping slot → 409 | PASS |
| A21 | Back-to-back slot (starts when the other ends) → 201 | PASS |
| A22 | Consumer approves own booking → 403 | PASS |
| A23 | Consumer checks in → 403 | PASS (check-in is owner/admin only; my first expectation of 400 was wrong) |
| A24 | Cancel → 200; cancel again → 400 | PASS |
| A25 | Re-book the cancelled slot | PASS after correcting the test (the first run failed because the script recomputed `Date.now()` and overlapped a neighbouring booking by seconds — not a server bug) |
| A26 | Owner approve → `confirmed`; owner reject → `rejected` (via the owner app, confirmed through the API) | PASS |
| A27 | Paused space disappears from public search; resumed space returns | PASS |
| A28 | Owner price edit updates **both** `price_per_hour` and `hourly_rate` | PASS |
| A29 | `search?lat=abc` | INFO 200 with all spaces (D18) |
| A30 | Error shape (`{success:false, error:{code,http,message,traceId}}`) and 404 for unknown routes | PASS |
| A31 | Endpoints used by the apps exist (`users/me/profile`, `auth/me`, `owners/me/profile`, `onboarding-status`, `otp/verify`) | PASS |

Unit test (no server): `node services/backend/tests/pricing.unit.js` — **17/17 pass**, including "price never
decreases from 1 h to 65 days". These fixes are **not deployed** (HANDOFF §3.3).

---

## B. Consumer app

| # | Check | Build A | Verified on B |
|---|---|---|---|
| B1 | Welcome slides → Skip → Sign in | PASS | PASS |
| B2 | OTP screen: six cells visible, keyboard opens, six digits typed in one burst are all accepted | PASS | PASS |
| B3 | OTP screen no longer flickers / no lost digits | PASS (the old six-input version dropped digits) | PASS |
| B4 | Onboarding: Continue on an empty form shows "Enter your full name." | PASS | PASS |
| B5 | Hints follow form order: vehicle → registration → Terms | PASS | PASS |
| B6 | Complete the form → home, avatar initial shows | PASS | PASS |
| B7 | **Skip for now** goes straight into the app | PASS | PASS |
| B8 | Session survives a force-stop | PASS | PASS |
| B9 | Logout (confirmation) → welcome | PASS | PASS |
| B10 | Home shows the nearby space with the live price; owner's price edit (₹40→₹45) appears | PASS | PASS (₹45 shown) |
| B11 | Vehicle filter: Bus hides a car/SUV space, All restores it | PASS | not re-run on B |
| B12 | Details: dimensions read the owner's values (2.5 m × 5 m, Height "—") | PASS | PASS |
| B13 | Booking screen defaults: End Time = Start + 1 h; Book Now disabled until payment + Terms | PASS | not re-run on B |
| B14 | Bottom "Book Now" bar fully visible above the nav bar | PASS | PASS |
| B15 | Daily duration price | **FAIL** ₹960 for a ₹300/day space (backend, D2) | n/a — needs backend deploy |
| B16 | Booking an overlapping slot → conflict message above the bar | PASS | PASS |
| B17 | Conflict banner clears when the date/time changes | **FAIL** stays (D5) | PASS |
| B18 | Cash booking → popup "Booking Requested" + "owner will confirm" | PASS | PASS |
| B19 | Booking popup dims the screen evenly and clears the nav bar | **FAIL** lighter strip (D6) | PASS (even dim, clears nav bar) |
| B20 | Booking with no vehicle → inline "Add a Vehicle" sheet → "Save & Book" creates both | PASS | sheet PASS on C; the follow-on booking hit a legitimate slot conflict, so the create step was not re-run |
| B21 | "Save & Book" button fully visible above the nav bar | **FAIL** half hidden on API 36 (D7) | **PASS on C** (failed on B: the sheet is absolutely positioned, fixed in C) |
| B22 | Bookings tab: Upcoming/Active/Past counts, status chips | PASS | PASS |
| B23 | Cancel dialog: Keep Booking retains; Yes, Cancel moves it to Past and shows the empty state | PASS | not re-run on B |
| B24 | Bookings "+" button visible | **FAIL** clipped by the tab bar (D8) | PASS |
| B25 | Owner-approved booking shows **Confirmed** (after a refetch/restart) | PASS | not re-run on B |
| B26 | Profile tab: name, phone, default vehicle from onboarding | PASS | not re-run on B |
| B27 | Profile → Add Vehicle sheet: buttons visible and tappable | **FAIL** hidden behind the tab bar (D7) | PASS |
| B28 | Home bell | **FAIL** does nothing, permanent red dot (D9) | PASS (bell gone) |
| B29 | Crash check (`logcat -b crash`) during the above | none | PASS (no entries in `logcat -b crash` after installing C) |

---

## C. Owner app

| # | Check | Build A | Verified on B |
|---|---|---|---|
| C1 | Dashboard renders; greeting uses the real owner name | PASS | PASS |
| C2 | Dashboard tiles/banner/list agree (Requests 1, "1 booking request", list row) | PASS | PASS |
| C3 | Dashboard "Active", "Occupancy", "This Month" | **FAIL** always 0 (D10) | inconclusive — the values are legitimately 0 for this data (no paid or checked-in bookings); only the adapter was type-checked |
| C4 | Bookings → Requests shows renter, plate, ₹, Approve/Reject | PASS | PASS (renter shows `+91 <phone>` when unnamed) |
| C5 | Approve (dialog) → moves to Upcoming; API `confirmed` | PASS | not re-run on B |
| C6 | Reject (dialog) → moves to Past; API `rejected` | PASS | not re-run on B |
| C7 | Listings → property → space menu (View details / Edit / Pause) | PASS | not re-run on B |
| C8 | Pause → "Paused" and gone from public search; Resume → back | PASS | not re-run on B |
| C9 | Edit space opens prefilled (5 steps); price edit saved and synced to both price fields | PASS | not re-run on B |
| C10 | More → Profile shows the signed-in owner | **FAIL** "John Doe / john.doe@example.com" (D11) | PASS ("Anita Sharma") |
| C11 | More → Notifications badge | **FAIL** hardcoded "3" (D12) | PASS (no badge) |
| C12 | More → Notifications preferences opens | PASS | not re-run on B |
| C13 | More → Earnings opens | PASS | not re-run on B |
| C14 | **More → Payouts** | **FAIL** app crash `TypeError: Cannot read property 'totalRevenue' of undefined` (D10) | PASS (opens; upcoming payout ₹160 = two confirmed ₹80 bookings) |
| C15 | More → Promotions / Reviews / Help Center open | PASS (data may be seeded, D13) | not re-run on B |
| C16 | Add property → add space wizards (earlier in the session, live backend) | PASS (needs a map pin) | n/a |

---

## D. Defects found

| ID | Sev | Defect | Status |
|---|---|---|---|
| D1 | **Critical** | `123456` signs anyone in on the live server and creates accounts | **OPEN** — config (HANDOFF §4, P0 #2) |
| D2 | High | Pricing not monotonic: 24 h ₹960 > 25 h ₹600; 20 h ₹800 > day rate ₹300; 31+ days with no monthly rate → `null` | Fixed in source (`utils/pricing.js`, 17 unit tests). **Needs backend deploy** |
| D3 | Medium | Malformed `space_id`/`vehicle_id` → HTTP 500 | Fixed in source. Needs backend deploy |
| D4 | High | SMS OTP not delivered on live; widget sends 4 digits, apps need 6 | **OPEN** — config (HANDOFF §4) |
| D5 | Low | Booking error banner not cleared when selection changes | Fixed; **verified on B** |
| D6 | Medium | Popup overlay: lighter vertical strip; nav bar uncovered | Fixed for booking/bookings/profile screens, **verified on B** (booking popup, Add Vehicle sheet); other screens **OPEN** (HANDOFF P2 #14) |
| D7 | High (API 36) | Bottom sheets ("Save & Book", Add Vehicle) covered by tab/nav bar so the buttons can't be seen | Fixed for booking + profile screens, **verified on B/C**; other screens **OPEN** |
| D8 | Low | Bookings "+" button clipped by tab bar | Fixed; **verified on B** |
| D9 | Low | Home bell dead + permanent fake unread dot; no consumer notifications screen (`NotificationCenter.js` is empty) | Bell removed (**verified on B**); notifications feature **OPEN** |
| D10 | **High** | Owner: `getOwnerStats` shape mismatch → **Payouts crashes the app**, Dashboard stats always 0 | Fixed. **Payouts verified on B**; Dashboard values inconclusive (C3) |
| D11 | High | Owner Profile shows a hardcoded fake identity for every account | Fixed; **verified on B** |
| D12 | Low | Hardcoded "3" unread badge on Notifications | Fixed; **verified on B** |
| D13 | Medium | Owner app falls back to seeded/mock data (storage getters, Payouts, Help Center tickets); Promotions/Reviews unverified | **OPEN** (HANDOFF P1 #9) |
| D14 | Medium | Owner profile edits never reach the backend | **OPEN** (P1 #10) |
| D15 | Low | Cancellation policy text (2 h) ≠ backend refund tiers (48 h/24 h) | **OPEN** (P1 #8) |
| D16 | Low | Owner booking card shows end date for overnight bookings | **OPEN** |
| D17 | Low | Bookings screen red accent vs app teal | **OPEN** |
| D18 | Low | `search?lat=abc` returns 200 with everything | **OPEN** |

## E. Not tested

Online payment · check-in / QR / ANPR / barrier · extend booking · refunds · KYC approval · promo-code
application · creating/answering reviews · messaging · staff · disputes · admin app · firmware · iOS ·
the SMS delivery itself · anything on a real phone beyond install + launch (storage on the test phone was
~99 % full).
