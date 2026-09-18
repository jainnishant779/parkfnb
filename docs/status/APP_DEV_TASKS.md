# App development — handover

**For:** the app developer
**Date:** 18 September 2026
**Presentation:** 22 September

Five items, in the order they should be done. The first three matter for the
demo; the last two are product work that can land after.

---

## 1. Images not loading

**Priority: high — this shows in every screenshot**

### What I found when I checked

Two separate problems, and the second is the one biting right now.

**No image is stored at all.** I queried the live database: not one parking
space, property or user has an image URL set. So today the apps are not
failing to *load* an image — there is nothing to load. Whatever placeholder
or broken icon appears is the empty state.

**Uploads do not survive a deploy.** Files are written to
`services/backend/uploads/` on the server's own disk and served from
`/uploads/...`. Render's free tier wipes that disk on every deploy and every
cold start. I confirmed it: a file sitting in the local `uploads/` folder
returns **404** from the deployed server.

So even once images are uploaded, they disappear on the next restart.

### What to do

**For the demo:** put image URLs into the seed data as remote links, so
nothing depends on the server disk. Any hosted image works. This makes the
app screens look finished in the recordings, which is the actual goal this
week.

**Proper fix (after):** move uploads to object storage. Cloudinary's free
tier is enough and takes about an hour. Only the upload controller changes —
it returns a URL either way, so nothing downstream is affected.

### The resolver is fine — do not spend time there

I read `apps/consumer/user/utils/imageUri.js`. It already handles every case
correctly: absolute URLs pass through untouched, relative `/uploads/...`
paths get the API host prefixed, old localhost URLs are rewritten to the
current host, and `http://` on the Render domain is upgraded to `https://`
so Android's cleartext rules do not block it.

Nothing to fix here. The problem is upstream — there are no URLs to resolve.

---

## 2. Admin panel UI

**Priority: high — this is shown live on stage**

The panel works but the layout is uneven. Five pages are real and will be
demonstrated:

- Dashboard
- Users
- Owners → Owner detail, with the full KYC review flow
- Bookings
- Payments

Six routes are placeholders and must not be opened during the demo:
`/spaces`, `/vehicles`, `/reports`, `/support`, `/notifications`, `/settings`.
Either hide them from the navigation or leave them and simply do not click.

### What to fix

- Consistent spacing and alignment — it currently drifts between pages
- Table column widths, so text does not wrap mid-word
- Loading and empty states — right now a slow request looks like a bug
- The KYC approval flow is the part shown live; make that one clean

### Also needs doing

The panel is **not deployed**. `apps/admin/render.yaml` already describes it
as a static site, so Render can create it from the blueprint.

After it deploys, add its URL to `FRONTEND_URL` on the backend, comma
separated, or the browser will block it with a CORS error. Then **log in and
verify** rather than assuming it worked.

Login: `admin@parkfnb.com` / `Demo@1234`

---

## 3. Real OTP over SMS

**Priority: medium — the demo works without it**

### Where it stands

The whole OTP flow is built and working: send, resend, verify, rate limits,
attempt limits, expiry, bcrypt-hashed codes with a TTL index. The one thing
missing is the SMS provider.

`services/backend/src/controllers/otpController.js` has a `sendCode()`
function that currently prints the code to the server log. It is written to
be pluggable — **only that one function changes**, nothing else in the file.

Right now `123456` is accepted as a universal test code, which is what lets
the apps log in during the demo.

### What to do

Pick a provider — MSG91 or Twilio both work in India; MSG91 is cheaper and
handles DLT registration, which is mandatory here.

```js
// inside sendCode()
await fetch('https://control.msg91.com/api/v5/flow/', {
  method: 'POST',
  headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, mobiles: `91${phone}`, otp: code }),
});
```

Add `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` to `.env.example` and to Render.

### One warning

**DLT registration takes 2–5 working days in India.** No provider can send
transactional SMS to Indian numbers without it. Start the paperwork now if
this is wanted soon; it will not be ready by the 22nd.

Until then, leave `TEST_OTP=123456` set. Turn it off the day real SMS goes
live, or anyone can sign in as anyone.

---

## 4. Pairing a barrier from the app

**Priority: medium — backend is done, the app screens are not**

### What already exists

The backend has the full device API:

| Endpoint | Does |
|---|---|
| `POST /api/devices/pair` | Link a device to a parking space |
| `GET /api/devices/my-devices` | List the owner's devices |
| `GET /api/devices/:id/telemetry` | Angle, battery, signal, last seen |
| `POST /api/devices/:id/command` | Open, close, stop, calibrate |
| `DELETE /api/devices/:id/unpair` | Remove it |
| `GET /api/devices/:id/logs` | Access history for that device |

The owner app has `IoTIntegrationsScreen.tsx` and `iotService.ts` already
wired to these. The consumer side calls `POST /api/bookings/:id/unlock`.

### What to build

An owner should be able to add a barrier themselves, without anyone touching
the database:

1. **Add device** — enter the device id (printed on the unit) and pick which
   parking space it belongs to
2. **Confirm it is alive** — poll telemetry and show online/offline, so the
   owner knows whether it is actually reachable before walking away
3. **Test open / close** — a button that proves it works during installation
4. **Show its state on the space** — a barrier icon on the space card
5. **Unpair** — with a confirmation, because this silently disables access
   for anyone with a booking

### One thing to get right

Pairing currently accepts any device id. Someone could guess `pb-002` and
attach a barrier that is not theirs. The unit should ship with a short code
that must be entered alongside the id — the backend already stores a
`secret_token` per device that can serve as this.

---

## 5. Multiple barriers

**Priority: low — nothing is blocked by it today**

The data model already supports many devices. Each `Device` row points at one
`ParkingSpace`, and the unlock path looks up the device from the booking's
space, so several barriers work without a schema change.

What is single-barrier today is the **assumption in the UI**, not the data.

### What changes

- **Owner app:** a device list instead of one screen. Group by property, show
  each device's status and last-seen time.
- **Admin panel:** a fleet view — every device across all owners, with
  offline ones surfaced first. This is the `/spaces` placeholder route.
- **Backend:** `GET /api/devices/my-devices` already returns a list; check the
  app is not just reading `[0]`.
- **Firebase mapping:** the bridge maps MQTT ids to Firebase barrier ids via
  `FIREBASE_DEVICE_MAP`, formatted `pb-001:BARRIER_001,pb-002:BARRIER_002`.
  Every new physical barrier needs a line here, which is fine for a pilot and
  needs moving into the database at scale.

### What to watch for

Each physical barrier must have a **unique id and its own secret**. Right now
the firmware ships with a shared default token. Two units with the same token
means a command meant for one opens the other — which is the kind of bug that
only appears once there is a second unit.

---

## Order of work

| When | What |
|---|---|
| **Before the 22nd** | Images (1), admin UI + deploy (2) |
| **After** | OTP provider (3) — blocked on DLT anyway |
| **After** | Device pairing screens (4) |
| **Later** | Multi-barrier UI (5) |

---

## Things worth knowing

**The apps need no URL changes.** Both already point at
`https://parkfnb.onrender.com`.

**Warm the backend before testing.** Render's free tier sleeps; the first
request takes about 24 seconds and looks like a hang.

```bash
curl https://parkfnb.onrender.com/health
```

**Demo logins** (password `Demo@1234`, or OTP `123456` on the apps):

| | |
|---|---|
| `admin@parkfnb.com` | admin panel |
| `owner@parkfnb.com` | owner with a verified account |
| `newowner@parkfnb.com` | KYC pending — approved live on stage |
| `driver@parkfnb.com` | has the paid booking |

**Re-seed if the data looks stale:**

```bash
cd services/backend && node scripts/seed-demo.js --reset
```

Booking times are anchored to when the script runs, so data seeded days
earlier will have expired.
