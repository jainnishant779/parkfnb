# Parkfnb — developer handoff

Last updated 2026-09-20 after a full QA pass (API, consumer app, owner app) and a fix round.
It is meant to let you pick the work up cold. Everything here was either **verified during the
session** or is explicitly marked **(unverified)**. Read sections 1, 4 and 5 first.

Companion files:

| File | What it is |
|---|---|
| `docs/handoff/QA_REPORT.md` | The test matrix: every check that was run, pass/fail, and evidence. |
| `docs/handoff/adb_ui.py` | Small adb/uiautomator driver used for all on-device testing (section 7). |
| `services/backend/tests/pricing.unit.js` | Unit test for the new price rule (`node tests/pricing.unit.js`). |
| `docs/api-contract.md`, `docs/system-design.md` | Existing design docs. |
| `CLAUDE.md`, `README.md` | Existing orientation docs. **Partly stale**, see section 2. |

---

## 1. Status at a glance

| Area | State |
|---|---|
| Owner: sign-in → add property → add space (5 steps) → publish → edit price → pause/resume | Works. |
| Consumer: discover → book (cash) → owner approves/rejects → confirmed/rejected → cancel | Works. |
| Cross-app sync (listing, price edit, pause, booking, approval) | Works, verified against the live backend. |
| Consumer OTP screen, "Complete Your Profile" (Continue / Skip) | Rewritten and verified on the final build. |
| **Backend fixes in this repo (pricing, id validation)** | **Merged to `main` but NOT deployed to Render.** The live server still has the old behaviour. Section 3.3. |
| **SMS OTP (MSG91)** | **Not delivering on the live server.** MSG91 itself works. Cause not confirmed. Section 4. |
| **Security** | **The `123456` test code signs anyone in on the live server (verified).** Section 5, P0. |
| Release APKs | Signed with the **debug keystore** — testing builds only. Section 8. |
| Not tested | Online payment, check-in/QR/ANPR/barrier, extend booking, refunds, KYC approval, promo codes, reviews, messaging, staff, admin app, firmware, iOS. |

---

## 2. Repository facts (and what the existing docs get wrong)

- **One git repo**, not three. There are no nested `.git` directories. `README.md` and `CLAUDE.md` say
  otherwise ("three separate repos, never `git init` the root"); ignore that and commit from the root.
- Remotes: `origin` = `github.com/jainnishant779/parkfnb`, `soojal` = `github.com/Soojal2005/parkfnb`,
  both on `main`. Keep them in step.
- `apps/admin` exists now (the README says it is empty).
- `CLAUDE.md` says `bookings/:id/approve|reject|noshow` are missing. **They exist**
  (`services/backend/src/routes/bookingRoutes.js:62-64`) and were exercised end to end.
- `CLAUDE.md` says Render does not respond. It does: `https://parkfnb.onrender.com` (30–60 s cold start).
- Both apps hardcode that URL: `apps/consumer/user/utils/constants.js:10`, `apps/owner/src/config/api.ts:4`.
- Backend: CommonJS, Express 5 + Mongoose, snake_case fields; the apps camelCase↔snake_case through
  `caseTransform`. Responses go through `src/utils/responseHelper.js`. Keep to these conventions.
- The API layer **camel-cases keys and unwraps `data`**, so a backend `{ stats: { total_revenue } }`
  reaches an app service as `{ stats: { totalRevenue } }`. Several bugs below were shape mismatches.

---

## 3. What changed

### 3.1 Earlier commits (already on both remotes)

`e4fd473` OTP delivery failures → 502 and MSG91 credentials out of source · `ec4837b` consumer booking screen
(dimensions, end time, bottom bar inset, "Booking Requested") · `8588fe1` owner shows renter phone ·
`aaa8580` consumer Gradle x86_64 ABI · `3b2b669` first handoff.

### 3.2 This round's fixes (in `main`)

**Consumer**

| Fix | Files |
|---|---|
| OTP screen: **one** hidden input + six display cells (was six inputs passing focus, which dropped digits and flickered); countdown isolated so the screen no longer re-renders every second; fixed-height error slot; autofill hints; visible empty cells | `user/screens/auth/OTPVerification.js` |
| "Complete Your Profile": Continue is always tappable and says what is missing (name → vehicle → reg no. → Terms); Skip skips immediately (no modal) | `user/screens/onboarding/UserOnboarding.js` |
| `KeyboardAvoidingView` no longer double-adjusts on Android (`windowSoftInputMode` is already `adjustResize`) | `SignIn.js`, `SignUp.js`, `UserOnboarding.js`, owner `OwnerWelcomeAuthScreen.tsx` |
| Popups: the tint moved off the elevated overlay onto a child backdrop (elevation shadow bled through as a lighter strip); bottom sheets padded above the tab bar / nav bar; stale booking error clears when the selection changes | `ParkingDetailsPage.js`, `BookingManagementPage.js`, `ProfilePage.js` |
| Bookings tab "+" button no longer clipped by the tab bar | `BookingManagementPage.js` |
| Removed the Home bell (no handler, permanent fake "unread" dot; `NotificationCenter.js` is an **empty file**) | `HomePage.js` |

**Owner**

| Fix | Files |
|---|---|
| **Payouts screen crashed the whole app** (`Cannot read property 'totalRevenue' of undefined`) and the **Dashboard stats were stuck at zero**: the backend returns `{stats: {flat snake_case}}` but the app read `revenueStats.totalRevenue`. `getOwnerStats` now adapts the payload; Payouts null-safe | `services/earningsService.ts`, `screens/earnings/PayoutsScreen.tsx` |
| **Profile screen showed "John Doe / john.doe@example.com"** for every owner (hardcoded default, saved to storage, never read the signed-in account). Now seeded from the signed-in user and stored per account | `screens/settings/ProfileScreen.tsx` |
| More → Notifications showed a hardcoded "3" unread badge | `screens/more/MoreScreen.tsx` |
| Renter shown as `+91 <phone>` instead of "Unknown Renter" | `bookingTransform.ts`, `DashboardScreen.tsx` |

**Backend** (`services/backend`)

| Fix | Files |
|---|---|
| **Pricing:** price *dropped* as a stay got longer (24 h = ₹960 but 25 h = ₹600 on a ₹40/h, ₹300/day space); a blank daily/monthly rate turned 31+ day totals into `null`. New rule = cheapest applicable tier, rounded up per unit; 17 unit tests | `src/utils/pricing.js`, `tests/pricing.unit.js`, `bookingsController.js` |
| Malformed `space_id`/`vehicle_id` returned HTTP 500; now 400 | `bookingsController.js` (`createBooking`, `quoteBooking`) |

### 3.3 Backend deployment — action required

Nothing in 3.2 "Backend" is live until Render redeploys `main`. Until then the live API still returns
₹960 for a 24 h booking, and the consumer "Daily" chip shows ₹960 for a ₹300/day space. Confirm that Render
builds from a repo containing these commits (Render → Settings → Build & Deploy: repo, branch `main`, root
`services/backend`), redeploy, then re-run the checks in `QA_REPORT.md` §API.

---

## 4. OTP / MSG91 — full picture

### 4.1 How it works (`services/backend/src/controllers/otpController.js`)

- `POST /api/auth/otp/send` → `issueCode` → `sendCode`. The provider comes from `getOtpSmsConfig()`:
  **DB `PlatformSettings` (`sms.provider`, `sms.api_key`, `otp.test_enabled`, `otp.allow_dev_otp`) first,
  then env (`SMS_PROVIDER`, `SMS_API_KEY`, `DISABLE_TEST_OTP`, `ALLOW_DEV_OTP`), then defaults.**
  The default provider is `mock`: it only logs the code and sends nothing.
- With `msg91` the backend calls MSG91's **widget** `sendOtpMobile`; the widget owns the code and the backend
  stores the returned request id (`req_id`). On verify the backend calls the widget's `verifyOtp` with it.
- MSG91 widget codes are **4 digits** (observed). The backend accepts 4–8, but **both apps hard-require 6**
  (`OTP_LENGTH = 6`). Fix: set the widget OTP length to 6 in the MSG91 dashboard, or change the apps.
- Since `e4fd473` a real provider that fails returns **502** instead of "Code sent", and credentials come only
  from `sms.api_key`/`SMS_API_KEY` (`<widgetId>:<tokenAuth>`) or `MSG91_WIDGET_ID` + `MSG91_TOKEN_AUTH`.

### 4.2 What was proven

- MSG91 accepts the widget ID/token, sends a real SMS, and `verifyOtp` with the request id succeeds
  (tested directly against MSG91 from a developer machine).
- The live backend's `/otp/send` answers "Code sent via sms" and **no SMS arrives**.
- The live response contains no `dev_code`.
- **The test code works on live:** `POST /otp/verify {code:"123456"}` for a never-seen number returned 200,
  created the account and issued a token. (This is also how the QA accounts were created.)

### 4.3 Why no SMS arrives — two candidates, undiagnosed

1. Live provider is `mock` (the default). The DB overrides env, so if anyone saved the admin Settings page or
   used "Reset to default", `sms.provider="mock"` is stored and `SMS_PROVIDER` is ignored.
2. Provider is `msg91` but MSG91 rejected Render's request (e.g. IP whitelisting on the widget token). Old
   code hid that and said "sent".

**Check:** Render → Logs, request a code, look for `[otp] [<provider>] sms -> <number> : <code>`.
`[mock]` = candidate 1; `[msg91]` then `[otp] MSG91 rejected the send:` = candidate 2 (that log line exists
only once `e4fd473` is deployed).

### 4.4 Go-live checklist

1. Render env: `SMS_PROVIDER=msg91`, `SMS_API_KEY=<widgetId>:<tokenAuth>`. If the DB has overrides, set admin
   Settings instead (`sms.provider`, `sms.api_key`).
2. MSG91 dashboard: widget OTP length **6**; check IP whitelisting; sender/DLT template.
3. Request a code in the app; confirm the SMS and that the 6-digit code signs in.
4. **Then** lock down: `DISABLE_TEST_OTP=true` (and DB `otp.test_enabled` off), `NODE_ENV=production`,
   `ALLOW_DEV_OTP` unset.
5. **Rotate the MSG91 widget token** (P0 #1).

---

## 5. Open issues, in priority order

### P0 — security / production

1. **MSG91 widget ID + token are in git history and on GitHub.** Removed from backend source in `e4fd473`
   but still in earlier commits and hardcoded in `apps/consumer/user/services/msg91Service.js:21-22` and
   `apps/owner/src/services/msg91Service.ts:21-22` (only used for `OTPWidget.initializeWidget`; sign-in goes
   through the backend, so the apps do not need them). **Rotate** the token, keep the new one in env only.
2. **The `123456` bypass is live** (verified, §4.2). It is accepted for any number, skips the code check, and
   creates accounts. Disable it (`DISABLE_TEST_OTP=true` + DB `otp.test_enabled=false`) as soon as SMS works;
   consider making the default *off* when `NODE_ENV=production`. Note `platformSettingsController.js`
   `DEFAULT_SETTINGS` seeds `otp.test_enabled: true` and `otp.allow_dev_otp: true`.
3. **Release APKs use the debug keystore** (`signingConfig signingConfigs.debug` for `release` in both
   `android/app/build.gradle`). Create a real keystore; keep it out of the repo.
4. **Test data on the live DB** — section 9.

### P1 — functional

5. SMS not delivered on live (§4) and the **4-vs-6 digit** mismatch.
6. **Backend not redeployed** (§3.3) — pricing and id-validation fixes are not live.
7. **`booking_mode: instant` is ignored by the backend.** `createBooking` (`bookingsController.js` ~line 470)
   always writes `status:'pending'`; only `approveBooking` or a successful payment makes it `confirmed`
   (`paymentsController.js`). An "Instant" space still needs owner approval. Product decision needed.
8. **Cancellation policy is stated three different ways.** The consumer UI says "Free cancellation up to 2
   hours before"; the backend refunds by tier (>48 h 100 %, 24–48 h 50 %, <24 h 0 %) in `cancelBooking`.
9. **Owner app still shows seeded/mock data in places.** `utils/storage.ts` falls back to `seedFullListings`,
   `seedFullBookings`, `seedEarningsTransactions`, `seedOwnerProfile` when nothing is stored;
   `PayoutsScreen.tsx` imports `constants/mockPayoutsData`; Help Center tickets come from
   `INITIAL_MOCK_TICKETS`. Promotions ("Active 2 / Scheduled 1 / Expired 1") and Reviews ("5 reviews, 3.0")
   showed data for a brand-new owner — **(unverified whether they are live or seeded)**. Audit every owner
   screen for mock imports before calling the app production-ready.
10. **Owner profile edits are stored on the device only** ("Profile saved successfully" never calls the API).
11. **Commission / platform fee.** Owner Earnings shows "8% of gross"
    (`EarningsSummaryCard.tsx:73`) and `-₹0`; the backend has no commission field.
12. **Currency default is `'USD'`** on `Booking` (`models/Booking.js:64`) and `Payment` (`models/Payment.js:28`)
    while the apps show ₹ (the quote endpoint does return `INR`, so check what the created booking stores).
13. From `CLAUDE.md`, **not re-verified**: `hasBookingConflict` counts `pending` with no TTL (an abandoned
    pending booking blocks the slot); `checkIn` does not check payment. Check-in is owner/admin only and
    needs a booking within its window — not tested.

### P2 — UI / UX

14. **Same overlay pattern in other consumer screens is unpatched:** `HomePage.js`, `SearchPage.js`,
    `SubscriptionPage.js`, `HelpSupportPage.js` (and `UserOnboarding.js`'s modal) use an absolute overlay with
    `elevation: 24` and a translucent background — the same lighter-strip artifact — and bottom sheets that the
    tab bar / nav bar can cover. Apply the pattern used in `ProfilePage.js` (transparent overlay + backdrop
    child + bottom padding).
15. **Edge-to-edge.** `targetSdk 36` draws edge-to-edge on Android 15+ (the API 36 emulator); the test phone is
    Android 12. Anything anchored to the bottom needs `useSafeAreaInsets()`.
16. Consumer **Bookings** screen uses a red accent (tabs, Cancel, "+") unlike the teal used elsewhere.
17. Owner booking cards show the **end** date for overnight bookings ("10:00 PM – 12:00 AM, Sep 22" for a
    booking that starts Sep 21).
18. Consumer Profile stats show "0 Bookings / 0h / Total Spent" although bookings exist — probably counts only
    completed ones **(unverified whether intended)**.
19. Owner add-property "Next" fails silently when no map pin is placed (`StepLocationScreen.tsx`); the error
    is rendered far down the page. Typing over the prefilled address appends instead of replacing.
20. Consumer `defaultParkingData` (`ParkingDetailsPage.js`) contains invented fallbacks ("Central Parking", a
    New Jersey address, "ParkSmart LLC", 4.8 rating). Real data overrides it; remove the fiction.
21. Owner `OtpVerifyScreen.tsx` re-renders the whole screen every second (same pattern that flickered the
    consumer OTP screen). Its button says "Next".
22. `GET /api/parking-spaces/search?lat=abc` returns 200 with everything instead of 400.

### P3 — tech debt

23. **Lint is red:** `eslint` reports 15 errors in the consumer app (mostly `react-hooks/exhaustive-deps`,
    plus `useFallbackLocation` called as a hook inside callbacks in `HomePage.js`) and 168 in the owner app
    (mostly unused vars). `tsc` on the consumer reports `App.tsx(114): Property 'onboardingStep' does not
    exist on type 'never'`. No CI enforces any of it.
24. Both release APKs include `x86_64` (≈70 MB each). For phone-only distribution set
    `abiFilters "arm64-v8a"` / `reactNativeArchitectures=arm64-v8a`.
25. `README.md`/`CLAUDE.md` correctness (§2). The `tests/*.smoke.js` scripts in `services/backend/tests/`
    were not run.

---

## 6. What was tested

Full matrix in **`docs/handoff/QA_REPORT.md`**. Summary of method: install the release APK, drive it with
`adb_ui.py`, read the UI tree and screenshots, and cross-check against the live API with scripts.

Devices: Android API 36 emulator (`sdk_gphone64_x86_64`) for all UI testing; one real phone (Infinix X671,
Android 12, arm64) only for install/launch. **The fixes in §3.2 were verified on the emulator, not on a
phone.**

---

## 7. Test runbook and gotchas

```powershell
adb devices -l
$env:ANDROID_SERIAL = "<serial>"     # required when an emulator AND a phone are attached
adb install -r apps\consumer\android\app\build\outputs\apk\release\app-release.apk
adb install -r apps\owner\android\app\build\outputs\apk\release\app-release.apk
adb shell am start -n com.parkingapp/.MainActivity    # consumer
adb shell am start -n com.owners/.MainActivity        # owner
```

**Golden path** (re-run after any change): owner signs in → add property (drop a map pin; on an emulator use
`adb emu geo fix <lng> <lat>` then "Use current location") → add space (Instant) → Publish → consumer (a
different number) sees it under Nearby Parking → Book Now → duration → Cash → Terms → Book Now ("Booking
Requested") → owner Bookings → Requests → Approve → consumer Bookings shows Confirmed.

**Sign-in while SMS is broken:** enter `123456` (works on live — see P0 #2). Use throwaway numbers.

**Gotchas**
- Run adb from PowerShell (or `MSYS_NO_PATHCONV=1` in Git Bash) or `/sdcard/...` is rewritten.
- With two devices attached set `ANDROID_SERIAL` or use `-s`.
- Pressing **Back on a root screen exits the app** — a Back-driven test script silently ends up in the
  launcher or another app.
- Gboard shows "Mic permission required" on a fresh emulator; deny it.
- Hide the keyboard with Back **only while it is open**.
- `uiautomator dump` lists only nodes with text; empty inputs are invisible, the map WebView is opaque.
- A `Send code` → OTP screen transition can take >6 s (network); use `adb_ui.py wait "Enter the"`.
- Don't drive a real phone while its owner is using it.

---

## 8. Building

```powershell
$env:TEMP = "D:\somewhere"; $env:TMP = $env:TEMP     # keep Metro/Node temp off a full C: drive
cd apps\consumer\android ; .\gradlew.bat assembleRelease --console=plain
cd apps\owner\android    ; .\gradlew.bat assembleRelease --console=plain
.\gradlew.bat --stop                                  # aborting a build does not stop Gradle
```

- Output: `android\app\build\outputs\apk\release\app-release.apk`. A release build takes ≈12 minutes each.
- The JS bundle is embedded, so **any JS change needs a rebuild**.
- **Disk:** the original machine's `C:` drive fell to ~0 GB free, which made PowerShell throw
  `OutOfMemoryException` and threatened the build. `GRADLE_USER_HOME` was already on `E:`. Freeing `C:` (an npm
  cache of ~7 GB was cleared) fixed it. Watch it.
- Final APKs from this session: **consumer built 17:45 (68.6 MB, `arm64-v8a` + `x86_64`, SHA-256 `004D17D6…F52B7`), owner built 17:35 (71.3 MB, `arm64-v8a`/`armeabi-v7a`/`x86`/`x86_64`, SHA-256 `122886AC…FA633`). They sit in `D:\parkfnb-release\` on the original machine — **not in git** — and are debug-signed. The consumer APK has no 32-bit ARM code**

---

## 9. Test data left on the live database

The live DB is shared. QA created — clean up when convenient:

- Throwaway accounts with numbers `900000001x` (consumer QA users, created via the `123456` code), their
  vehicles, and bookings (mostly cancelled; a few confirmed/rejected/pending). All bookings were on the test
  property below.
- From earlier sessions: property **"Anita Residency"** (Indore) with **Space 1** (covered, hourly **₹45**
  after a test edit, ₹300/day, instant, cars + SUVs) under a test owner account, plus a cash booking
  `BK-MU9MMDTB-10RX7`. Other bookings (e.g. on a property "Nsns") belong to earlier test users.
- Accounts created by OTP sign-in for the project owner's own number.

---

## 10. Where things live

| Concern | File |
|---|---|
| OTP send/verify, provider choice, test code | `services/backend/src/controllers/otpController.js` |
| Settings that override env, and defaults | `services/backend/src/controllers/platformSettingsController.js` |
| Booking create/quote/approve/cancel/check-in | `services/backend/src/controllers/bookingsController.js` |
| Price rule | `services/backend/src/utils/pricing.js` |
| Owner stats / earnings payloads | `services/backend/src/controllers/ownersController.js` |
| Env variables | `services/backend/.env.example` |
| Consumer routing (auth → onboarding → main) | `apps/consumer/App.tsx`, `user/context/AuthContext.js` |
| Consumer OTP / onboarding | `user/screens/auth/OTPVerification.js`, `user/screens/onboarding/UserOnboarding.js` |
| Consumer booking / bookings / profile | `user/screens/parking/ParkingDetailsPage.js`, `bookings/BookingManagementPage.js`, `profile/ProfilePage.js` |
| Owner data adapters | `apps/owner/src/services/earningsService.ts`, `listingService.ts`, `utils/bookingTransform.ts` |
| Owner mock/seed data (to eliminate) | `apps/owner/src/constants/mock*.ts`, `utils/storage.ts` |
| API base URLs | `apps/consumer/user/utils/constants.js`, `apps/owner/src/config/api.ts` |

---

## 11. Suggested order of work

1. **Redeploy the backend** and re-run the API checks (`QA_REPORT.md`); verify ₹300 for a 24 h stay. (§3.3)
2. **Fix SMS** (§4) and then **turn the test-OTP bypass off**; rotate the MSG91 token. (P0)
3. Real keystore; install the final APKs on a real phone and repeat the golden path there.
4. Decide `booking_mode: instant`, the cancellation policy, and the commission line. (P1 #7, #8, #11)
5. Audit the owner app for mock/seed data and wire profile edits to the API. (P1 #9, #10)
6. Apply the overlay/inset pattern to the remaining consumer screens. (P2 #14, #15)
7. Test what was not tested (online payment, check-in, extend, refund, KYC) and clear lint.
