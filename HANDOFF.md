# Parkfnb — developer handoff

Written 2026-09-20 at the end of a long end-to-end test-and-fix session on the two Android apps
(`apps/consumer`, `apps/owner`) and the backend (`services/backend`). It is meant to let you pick the
work up cold. Everything here was either verified during the session or is explicitly marked
**(unverified)**. Read section 1 and section 5 first.

Companion files in this folder tree:

| File | What it is |
|---|---|
| `docs/handoff/pending-changes.patch` | Five files of fixes that exist **only as a patch**, not committed. Section 3. |
| `docs/handoff/adb_ui.py` | Small adb/uiautomator driver used for all on-device testing. Section 7. |
| `docs/api-contract.md`, `docs/system-design.md` | Existing design docs. |
| `CLAUDE.md`, `README.md` | Existing orientation docs. **Partly stale**, see section 2. |

---

## 1. Status at a glance

| Area | State |
|---|---|
| Owner app: sign-in → add property → add space (5 steps) → publish | Works against the live backend. |
| Consumer app: discover → book (cash) → owner approves → booking confirmed | Works end to end. |
| Cross-app sync (owner listing shows up in consumer search, booking shows up in owner requests) | Works. |
| Crashes | None in the `logcat -b crash` buffer, checked after the emulator flows and after launching the consumer app on the phone. Not monitored continuously. |
| **SMS OTP (MSG91)** | **Not delivering on the live server.** MSG91 itself works. Cause not yet confirmed. Section 4. |
| Security | Two open problems: MSG91 token in git history, and a default-on `123456` OTP bypass. Section 5, P0. |
| Fixes pushed to `main` | 4 commits (`e4fd473`, `ec4837b`, `8588fe1`, `aaa8580`), on both remotes. |
| Fixes NOT pushed | 5 files, in `docs/handoff/pending-changes.patch`. Not run on a device yet. |
| APKs | The APKs on the original dev machine are **stale** (built before these fixes). Rebuild. Section 8. |

---

## 2. Repository facts (and what the existing docs get wrong)

- **It is one git repo**, not three. `git rev-parse` at the root works and there are no nested `.git`
  directories. `README.md` and `CLAUDE.md` both say the opposite ("three separate repos, never `git init`
  the root"). Ignore that. Commit from the root.
- Remotes: `origin` = `github.com/jainnishant779/parkfnb`, `soojal` = `github.com/Soojal2005/parkfnb`.
  Both track `main`. `soojal/main` and `origin/main` were fast-forwarded to the same commit; keep them in step.
- `apps/admin` exists now (the README says it is empty; an admin UI landed in commit `56cad7c`).
- `CLAUDE.md` says `bookings/:id/approve|reject|noshow` are missing. **They exist**
  (`services/backend/src/routes/bookingRoutes.js:62-64`). Owner approval works.
- `CLAUDE.md` says the Render deployment does not respond. It responds:
  `https://parkfnb.onrender.com` is live, and `PUT /api/users/me/profile`, `GET /api/auth/me`,
  `PUT /api/owners/me/profile`, `GET /api/auth/onboarding-status`, `POST /api/auth/otp/verify` all exist
  (401/400 without a token). Free-tier cold start is 30–60 s on the first request.
- Both apps hardcode that URL: `apps/consumer/user/utils/constants.js:10` and `apps/owner/src/config/api.ts:4`.
- Backend is CommonJS (`require`), Express 5 + Mongoose, snake_case fields; both apps camelCase↔snake_case
  via `caseTransform`. Responses go through `src/utils/responseHelper.js` (`{success, data}` /
  `{success:false, error:{code,http,message,traceId}}`). Keep to these conventions.

---

## 3. What was changed, and the one thing that is only a patch

### 3.1 Pushed to `main`

| Commit | Change |
|---|---|
| `e4fd473` | **Backend OTP:** a real SMS provider that fails now returns HTTP 502 instead of "Code sent". MSG91 widget ID/token removed from source; read from `sms.api_key`/`SMS_API_KEY` (`<widgetId>:<tokenAuth>`) or `MSG91_WIDGET_ID` + `MSG91_TOKEN_AUTH`. `.env.example` documents `SMS_PROVIDER`/`SMS_API_KEY`. |
| `ec4837b` | **Consumer booking screen** (`ParkingDetailsPage.js`): real dimensions (was hardcoded 8.5×18×7 ft for every space); default end time = start + 1 h (was a fixed `10:00`, which sat before the start time and left "Book Now" disabled); bottom "Book Now" bar now clears the Android nav bar (safe-area inset); success popup says "Booking Requested" when status is `pending`. |
| `8588fe1` | **Owner app:** booking cards show `+91 <phone>` instead of "Unknown Renter" for OTP sign-ups with no name. |
| `aaa8580` | **Consumer Gradle:** adds `x86_64` ABI so release builds run on emulators. |

### 3.2 NOT committed — `docs/handoff/pending-changes.patch`

These were written last and are **unbuilt and unverified on a device** (they parse with the RN Babel
preset, lint with 0 errors; the owner app typechecks). Apply and test them yourself:

```bash
git apply --whitespace=nowarn docs/handoff/pending-changes.patch   # verified to apply cleanly on aaa8580
```

| File | Change | Why |
|---|---|---|
| `apps/consumer/user/screens/auth/OTPVerification.js` | Six separate `TextInput`s replaced by **one** hidden input over six display cells; resend countdown moved into a memoised `ResendRow` (was re-rendering the whole screen every second); fixed-height error slot; `keyboardDidShow` scroll instead of a `scrollToEnd` per digit; visible empty-cell contrast; `textContentType="oneTimeCode"` / `autoComplete="sms-otp"` for autofill. | User reported the Verify button/page **flickering**. Also on the emulator, typing `123456` into the six boxes dropped digits (`2` and `6`). |
| `apps/consumer/user/screens/onboarding/UserOnboarding.js` | "Continue" is always tappable and shows what is missing (name → vehicle → reg no. → **Terms checkbox**); "Skip for now" skips immediately (no `AppAlert` modal); `KeyboardAvoidingView` `undefined` on Android. | User reported Continue and Skip "not working" on a real phone. Could not reproduce on the phone; this is reasoning from code, see section 5 P1. |
| `apps/consumer/user/screens/auth/SignIn.js`, `SignUp.js` | `KeyboardAvoidingView behavior` → `undefined` on Android. | `windowSoftInputMode` is already `adjustResize`; a second `'height'` adjustment fights it. The owner app already does this. |
| `apps/owner/src/screens/auth/OwnerWelcomeAuthScreen.tsx` | Same `KeyboardAvoidingView` change. | Same. |

**First job:** apply the patch, build consumer, install on a device, and confirm the OTP screen no
longer flickers and Continue/Skip work. If they do, commit it.

---

## 4. OTP / MSG91 — full picture

### 4.1 How it works (backend `src/controllers/otpController.js`)

- `POST /api/auth/otp/send` → `issueCode` → `sendCode`. The provider is decided by `getOtpSmsConfig()`:
  **DB `PlatformSettings` (`sms.provider`, `sms.api_key`, `otp.test_enabled`, `otp.allow_dev_otp`) first,
  then env (`SMS_PROVIDER`, `SMS_API_KEY`, `DISABLE_TEST_OTP`, `ALLOW_DEV_OTP`), then defaults.**
  Default provider is `mock`, which only logs the code and sends nothing.
- With `msg91`, the backend calls MSG91's **widget** `sendOtpMobile`. The widget generates and owns the
  code; the backend stores the returned request id (`req_id`) on the `OtpCode` row. On verify, because the
  backend's own hashed code never matches the widget's code, it calls the widget's `verifyOtp` with that
  `reqId` (`otp.req_id` fallback path).
- MSG91 widget codes are **4 digits** (observed). The backend accepts 4–8 digits
  (`/^\d{4,8}$/`), but **both apps hard-require exactly 6** (`OTP_LENGTH = 6` in
  `apps/consumer/.../OTPVerification.js` and `apps/owner/src/screens/auth/OtpVerifyScreen.tsx`).
  So even with SMS working, a 4-digit code cannot be entered. Fix: set the widget OTP length to 6 in the
  MSG91 dashboard (preferred), or change the apps to accept 4–6.
- `POST /api/auth/otp/verify` also accepts a **test code** (default `123456`, any phone number) when
  `otp.test_enabled` (DB) is true or `DISABLE_TEST_OTP !== "true"` (env). See P0.

### 4.2 What was proven

- MSG91 accepts the project's widget ID/token and sends a real SMS; `verifyOtp` with that request id
  returned `type: "success"`. (Tested directly against MSG91's API, from a developer machine.)
- The live backend's `POST /api/auth/otp/send` returned "Code sent via sms" and **no SMS arrived**. The
  same code path before this session reported success even on failure.
- The live response contained no `dev_code` (good).

### 4.3 Why no SMS arrives — two candidates, undiagnosed

1. The live provider is `mock` (default; nothing selected `msg91`). Note the DB overrides env, so if
   anyone ever saved the admin Settings page or used "Reset to default", `sms.provider = "mock"` is stored
   and `SMS_PROVIDER` is ignored.
2. The provider is `msg91` but MSG91 rejected Render's request (e.g. IP whitelisting on the widget
   token — it worked from a developer's IP). The pre-`e4fd473` code swallowed that and said "sent".

**Definitive check:** Render → service → Logs, request a code from the app, look for the line
`[otp] [<provider>] sms -> <number> : <code>`. `[mock]` = candidate 1. `[msg91]` followed by
`[otp] MSG91 rejected the send:` = candidate 2 (that log line was added in `e4fd473`; it only exists once
that commit is deployed).

### 4.4 Go-live checklist

1. Confirm Render deploys from a repo containing `e4fd473` (Render → Settings → Build & Deploy: repo,
   branch `main`, root dir `services/backend`).
2. Render env: `SMS_PROVIDER=msg91`, `SMS_API_KEY=<widgetId>:<tokenAuth>` (or the split
   `MSG91_WIDGET_ID` / `MSG91_TOKEN_AUTH`). If `e4fd473` is *not* deployed yet, only `SMS_PROVIDER` is
   needed (old code falls back to the hardcoded pair), but setting both works on either version.
3. If the DB has overrides, set admin Settings instead: `sms.provider=msg91`, `sms.api_key=<id>:<token>`.
4. MSG91 dashboard → OTP widget: **length 6**; check IP whitelisting; confirm sender/DLT template.
5. Request a code in the app; verify the SMS arrives and the 6-digit code signs in.
6. Then lock down: `DISABLE_TEST_OTP=true` (and DB `otp.test_enabled` off), `NODE_ENV=production`,
   `ALLOW_DEV_OTP` unset / `otp.allow_dev_otp` off.
7. **Rotate the MSG91 widget token** (P0) and update Render.

---

## 5. Open issues, in priority order

### P0 — security / production

1. **MSG91 widget ID + token are in git history and on GitHub.** Removed from backend source in
   `e4fd473`, but still in earlier commits, and still hardcoded in
   `apps/consumer/user/services/msg91Service.js:21-22` and `apps/owner/src/services/msg91Service.ts:21-22`
   (they only call `OTPWidget.initializeWidget`; sign-in itself goes through the backend, so the apps do
   not need them — remove that init from `App.tsx` in both apps if nothing else uses the SDK).
   Anyone who can read the repo can send SMS on your MSG91 account. **Rotate**, then keep the new value in
   env only. If the repo is public, treat the old token as burned. (History rewrite is optional and
   does not undo exposure.)
2. **Test-OTP bypass defaults ON.** `123456` (or `TEST_OTP`) is accepted for **any phone number** and
   skips the code check entirely, unless `DISABLE_TEST_OTP=true` / `otp.test_enabled=false`. If live has it
   on, anyone can sign in as any user, including owners. During the session one attempt of `123456` on the
   live server was rejected ("Incorrect code. 4 attempts left") but that entry may have been mistyped
   **(unverified)** — test it properly and switch it off. Consider making the default *off* when
   `NODE_ENV=production`. Also `DEFAULT_SETTINGS` in `platformSettingsController.js` seeds
   `otp.test_enabled: true` and `otp.allow_dev_otp: true`, which a "Reset to default" writes to the DB.
3. **Release APKs are signed with the debug keystore** (`signingConfig signingConfigs.debug` for
   `release` in both `android/app/build.gradle`). Fine for testing, not shippable. Create a real
   keystore and keep it out of the repo.

### P1 — functional

4. **SMS not delivered on live** — section 4.
5. **OTP length mismatch (4 vs 6)** — section 4.1.
6. **Consumer "Complete Your Profile": Continue and Skip reported dead on a real phone** (Infinix X671,
   Android 12). Not reproduced (the phone was in use when we tried). Two facts from code: Continue was
   disabled until name (letters only) + vehicle + registration + **Terms checkbox** were all set, and the
   checkbox has no error line; Skip went through `AppAlert`, which is a React Native `<Modal>`, and a
   code comment in `ParkingDetailsPage.js` says `<Modal>` "does not present on this build". The patch
   addresses both, but **the real cause is unconfirmed** — reproduce on the phone with the patched build.
   If Skip still fails, look for a touch-blocking overlay or a stale `KeyboardAvoidingView` height after the
   keyboard closes.
7. **`booking_mode: instant` is ignored by the backend.** `createBooking`
   (`bookingsController.js:475`) always writes `status: 'pending'`; only `approveBooking` (`:670`) or a
   successful payment (`paymentsController.js:233,291,368`) makes it `confirmed`. So an "Instant" space
   still needs owner approval. Product decision: should instant + cash auto-confirm?
8. **Booking conflicts.** From `CLAUDE.md`, **not re-verified**: `hasBookingConflict` treats `pending` as a
   conflict with no TTL, so an abandoned pending booking blocks the slot forever; `checkIn` only checks
   `status === 'confirmed'`, not payment. Check-in was **not** tested (it needs a booking starting soon).
9. **Currency default is `'USD'`** on `Booking` (`models/Booking.js:64`) and `Payment`
   (`models/Payment.js:28`) while both apps show ₹. Verified still true.
10. **Commission / platform fee.** Owner Earnings shows "8% of gross"
    (`apps/owner/src/screens/earnings/components/EarningsSummaryCard.tsx:73`) but the backend has no
    commission field (`CLAUDE.md`; no `commission`/`platform_fee` in `ownersController.js`). The screen
    shows `-₹0`. Either implement the fee or remove the label.

### P2 — UI / UX

11. **Booking success popup** on the consumer booking screen dims the screen unevenly (a lighter vertical
    strip). `styles.modalOverlay` is an absolute view with `elevation: 24` and a translucent background;
    suspect the Android elevation shadow bleeding through. **Unconfirmed**; try a transparent overlay
    with the tint on a non-elevated child, or hide the sticky bar while the popup is open.
12. **Consumer Profile stats** showed "0 Bookings / 0h / Total Spent" while the account had bookings
    (pending/confirmed) — maybe it counts only completed bookings. **Unverified whether intended.**
13. **Owner dashboard "Requests 0"** while the Bookings tab showed 1 pending request — likely a stale
    dashboard fetch that only refreshes on remount. Observed once.
14. **Owner `OtpVerifyScreen.tsx` re-renders the whole screen every second** (countdown in screen state).
    Same pattern that caused the consumer flicker; the layout is simpler so it was left alone. Extract the
    timer if it flickers on a device. Its button says "Next", not "Verify".
15. **Owner add-property "Next" fails silently** when no map pin is placed
    (`StepLocationScreen.tsx` `validate()` sets `errors.locationLat`, rendered far down the scroll). Scroll to
    the error or disable with a hint.
16. **Owner add-property address prefill:** "Use my profile address" prefilled "123 MG Road"; typing over
    it appended instead of replacing. Test-data quirk, but the field could select-on-focus.
17. **Consumer `defaultParkingData`** in `ParkingDetailsPage.js` contains invented fallback data
    ("Central Parking", a New Jersey address, fake owner "ParkSmart LLC", 4.8 rating). Real data now
    overrides it, but a missing field silently shows fiction. Remove the fake defaults.
18. **Map tiles** in the owner property picker were blank grey on the emulator (Leaflet in a WebView,
    OpenStreetMap tiles) although the pin and coordinates worked — likely emulator networking, but check
    on a device.

### P3 — tech debt / housekeeping

19. Consumer release APK now includes `x86_64` (72 MB, was arm64-only). For phone-only distribution set
    `abiFilters "arm64-v8a"` and `reactNativeArchitectures=arm64-v8a` again — the test phone had only
    ~1 GB free and rejected the install at first (`INSTALL_FAILED_INSUFFICIENT_STORAGE`).
20. `README.md`/`CLAUDE.md` correctness (section 2).
21. Delete the test data listed in section 9.

---

## 6. Areas that were tested, and how

Emulator: Android API 36 (`sdk_gphone64_x86_64`, 1080×2400). Phone: Infinix X671, Android 12,
arm64, 50 GB but ~99% full. Both apps point at the live Render backend. Method: install the release APK,
drive it with `adb_ui.py`, read the UI tree and screenshots, and cross-check against the API with `curl`.

Verified:

- **Owner:** OTP sign-in, dashboard, add property (needs a map pin), add space (5 steps: details,
  photos, price, availability, rules — "Car" is preselected in vehicle types, tapping it turns it *off*),
  publish, property → spaces list, bookings tab (Requests), approve dialog + approve, Earnings tab renders,
  More tab renders.
- **Consumer:** home map + nearby list, details sheet, booking screen (date, duration, start/end time,
  price breakdown, payment method, terms), **cash** booking, Bookings tab (Pending Approval → Confirmed
  after owner approval), Profile tab (vehicle present).
- **Backend/API:** the new space appeared in `GET /api/parking-spaces/search` with
  `price_per_hour == hourly_rate` (the manual price sync from `CLAUDE.md` held).

**Not tested:** online payment (only cash), check-in / QR / ANPR / barrier, cancellation and refund, KYC
approval (needs an admin), space edit/delete, promotions, reviews, disputes, staff, the admin app, the
firmware, and iOS.

---

## 7. Test runbook and gotchas

**Set up a device**

```powershell
adb devices -l                                   # note the serial; a phone shows "unauthorized" until you accept the prompt
$env:ANDROID_SERIAL = "<serial>"                 # required when an emulator AND a phone are attached
adb install -r apps\consumer\android\app\build\outputs\apk\release\app-release.apk
adb install -r apps\owner\android\app\build\outputs\apk\release\app-release.apk
adb shell am start -n com.parkingapp/.MainActivity    # consumer  (package com.parkingapp)
adb shell am start -n com.owners/.MainActivity        # owner     (package com.owners)
```

**Golden path to re-test after any change**

1. Owner app: sign in → finish profile (Skip is available) → Listings → add property (drop a map pin;
   `adb emu geo fix <lng> <lat>` + "Use current location" on an emulator) → add space (Instant mode) → Publish.
2. Consumer app (a *different* phone number): the property appears under Nearby Parking → Book Now → pick
   a duration → **Cash** → tick Terms → Book Now → "Booking Requested". Vehicle must exist on the profile.
3. Owner app: Bookings → Requests → Approve → confirm; it moves to Upcoming.
4. Consumer app: Bookings → status is Confirmed (cold-start the app if the list looks stale).

**Sign-in while SMS is broken:** use the test code — but see P0 #2: it may be disabled on the live server.

**Adb gotchas**

- Run adb from **PowerShell**, or set `MSYS_NO_PATHCONV=1` in Git Bash, or `/sdcard/...` is rewritten.
- With two devices attached you must set `ANDROID_SERIAL` or use `-s`.
- Gboard pops "Mic permission required / Allow Gboard to record audio?" the first time the keyboard is
  used on a fresh emulator; deny it (it looks like the app froze).
- `adb shell input text` types fast. Multi-field inputs drop digits; that is one reason for the
  single-input OTP rewrite.
- Hide the keyboard with `adb shell input keyevent 4` (Back) before tapping elements under it.
- `uiautomator dump` shows only nodes that have text/content-desc: empty inputs are invisible to it, and
  the map WebView is opaque — use coordinates there.
- Don't drive a real phone while its owner is using it (the tooling shows whatever app is in front).

**Helper:** `docs/handoff/adb_ui.py` (`dump`, `tap "<text>"`, `tapxy`, `type`, `key`, `swipe`, `shot`,
`wait`). `tap` prefers an exact text/description match over a substring — early on it tapped "next" inside a
subtitle instead of the Next button.

---

## 8. Building

Release APKs (both apps), from each app's `android` folder:

```powershell
cd apps\consumer\android ; .\gradlew.bat assembleRelease --console=plain
cd apps\owner\android    ; .\gradlew.bat assembleRelease --console=plain
# output: android\app\build\outputs\apk\release\app-release.apk   (consumer ≈ 72 MB, owner ≈ 75 MB with x86_64+arm64)
.\gradlew.bat --stop     # stop daemons if you abort a build; killing only the shell leaves Gradle compiling
```

- A consumer release build takes many minutes; run it in the background.
- Free disk: `C:` was around 3.8 GB free at one point; keep Gradle caches on a roomy drive.
- The JS bundle is embedded in release builds, so **any JS change needs a rebuild** — there is no dev
  server in the loop. The repo also has OTA-update plumbing (`OtaUpdateBanner.js`, commit `56cad7c`);
  its behaviour was not investigated.
- The APKs currently on the original machine (`app-release.apk`, timestamps 14:27 consumer, 14:10 owner
  on 2026-09-20) **predate** every fix in section 3. Rebuild before judging behaviour.

---

## 9. Test data left on the live database

The live DB is shared and was used for testing. Created this session — clean up when convenient:

- A test **property "Anita Residency"** (Indore, 452001) with **Space 1** (covered, ₹40/h, ₹300/day,
  instant, cars + SUVs) under a test owner account.
- A **cash booking `BK-MU9MMDTB-10RX7`** (2 h, ₹80), approved → `confirmed`, by a test consumer account.
- Accounts created by OTP sign-in for the project owner's own number, plus the test owner/consumer users.
- Pre-existing bookings from earlier sessions (e.g. `BK-MU9LRDN4-ZEIBU` on a property named "Nsns")
  belong to other test users.

---

## 10. Where things live

| Concern | File |
|---|---|
| OTP send/verify, provider choice, test code | `services/backend/src/controllers/otpController.js` (`getOtpSmsConfig`, `resolveMsg91Credentials`, `sendCode`, `issueCode`, `verifyOtp`) |
| Settings that override env, and their defaults | `services/backend/src/controllers/platformSettingsController.js` (`DEFAULT_SETTINGS`) |
| Create/approve booking, status rules | `services/backend/src/controllers/bookingsController.js` (`createBooking` ~475, `approveBooking` 653) |
| Payment → `confirmed` | `services/backend/src/controllers/paymentsController.js` |
| Env variables | `services/backend/.env.example` |
| Consumer routing (auth → onboarding → main) | `apps/consumer/App.tsx` (`RootNavigator`), `apps/consumer/user/context/AuthContext.js` |
| Consumer OTP / sign-in / onboarding | `apps/consumer/user/screens/auth/`, `.../onboarding/UserOnboarding.js` |
| Consumer booking screen | `apps/consumer/user/screens/parking/ParkingDetailsPage.js` |
| Consumer modal alert component | `apps/consumer/user/components/AppAlert.js` |
| Owner OTP, add-property, add-space | `apps/owner/src/screens/auth/OtpVerifyScreen.tsx`, `.../listings/listingWizard/` |
| Owner booking mapping | `apps/owner/src/utils/bookingTransform.ts`, `.../dashboard/DashboardScreen.tsx` |
| API base URLs | `apps/consumer/user/utils/constants.js`, `apps/owner/src/config/api.ts` |

---

## 11. Suggested order of work

1. Apply `docs/handoff/pending-changes.patch`, build the consumer APK, install on a device, confirm the
   OTP screen no longer flickers and Continue/Skip work; commit if so. (§3.2)
2. Fix SMS delivery: Render env + widget length 6 + check the `[mock]`/`[msg91]` log line. (§4)
3. Rotate the MSG91 token; turn the test-OTP bypass off for production; sign a real keystore. (P0)
4. Decide `booking_mode: instant` behaviour and implement it in `createBooking`. (P1 #7)
5. Fix the currency default and the fake "8% platform fee". (P1 #9, #10)
6. Test the untested list in §6 — check-in, online payment, cancel/refund first.
7. Work through P2/P3, then tidy `README.md` / `CLAUDE.md`.
