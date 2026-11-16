# Backend gaps found while building the owner dashboard

Seven bugs in `software/services/backend` that were **found and not fixed** during the owner web dashboard work (15 Nov 2026). They are
real behaviour of the current code, not guesses: each one was re-read against the source on 16 Nov 2026 and the line numbers below are
from that read. Where a statement is an inference rather than something run, it says so.

Paths are relative to `software/services/backend/src/`. "Web" says what `software/apps/owner-web` already does about it, so that a fix
here knows what else to change.

| # | Bug | Where | Kind |
|---|---|---|---|
| 1 | An owner cannot cancel a booking (always 403) | `controllers/bookingsController.js:803-809` | functional |
| 2 | Booking detail leaves the vehicle's make and model blank | `controllers/bookingsController.js:240`, `:681` | cosmetic |
| 3 | The device `secret_token` is sent to the browser; any unregistered device ID can be claimed | `controllers/deviceController.js:156-175`, `:201-213`; `models/Device.js:39-43` | security |
| 4 | Earnings are cut by when a booking was **created**, not when it happened | `controllers/ownersController.js:276-298` | money figures |
| 5 | Deleting a property leaves its spaces bookable; `available_spaces` is always 0 | `controllers/propertiesController.js:231-244`, `:77-80`, `:355-358` | data integrity |
| 6 | Deleted spaces still come back in a property's space list | `controllers/parkingSpacesController.js:118-154`, `:369-372` | correctness |
| 7 | A verified owner can replace their bank account through the KYC draft endpoint, with no re-verification | `controllers/ownersController.js:597-616`, `:623-645` | security / fraud |

A sensible order: 3 and 7 first (security), then 5 and 6 (data), then 4 and 1 (money and a missing action), then 2.

---

## 1. Owner cancel-booking always returns 403

`cancelBooking` (`bookingsController.js:791`) decides who may cancel at lines 803-809:

```js
const ownerUserId = booking.owner_id ? booking.owner_id.toString() : null;
if (booking.user_id.toString() !== req.user._id.toString() && req.user.user_type !== 'admin' &&
    ownerUserId !== req.user._id.toString()) { return error(res, ..., 403, 'Not authorized to cancel this booking'); }
```

`Booking.owner_id` is the **Owner** document's `_id`; `req.user._id` is a **User** `_id`. They are never equal, so the owner clause can never
be true and only the renter or an admin can cancel. (`loadForOwner`, used by approve / reject / no-show around line 641, does it correctly: it
populates `owner_id` and compares `owner_id.user_id`.)

- **Impact:** an owner's Cancel button gets `403 Not authorized to cancel this booking`.
- **Fix:** populate `owner_id` with `user_id` and compare `booking.owner_id.user_id`, as `loadForOwner` does. Add a case to
  `tests/booking-actions.smoke.js` (owner cancels: 200; another owner: 403).
- **Decide at the same time:** the refund that follows (lines 820-835) depends only on hours until the start (over 48 h: 100 %, 24-48 h: 50 %,
  under 24 h: 0 %), whoever cancels. An owner cancelling probably should not cost the renter their refund.
- **Web:** there is no Cancel button on the web booking pages, because it could only fail.

## 2. Booking detail leaves the vehicle's make and model blank

`getBookingById` (`bookingsController.js:240`) and `populatedBooking` (`:681`, the answer to approve / reject / check-in) select only
`vehicle_make vehicle_model vehicle_year license_plate` from the vehicle. The other nine `populate('vehicle_id', ...)` calls in the file select
`vehicle_make vehicle_model make model license_plate vehicle_type`.

`UserVehicle` (`models/UserVehicle.js:34-52`) has **required** `make` and `model`, and **optional** compatibility aliases `vehicle_make` and
`vehicle_model`. The aliases are filled only when a vehicle is created through `userVehiclesController` (`:174-175`). A vehicle created any other
way (seed scripts, direct writes) has only `make` / `model`, so these two endpoints return it with no name.

- **Impact:** the vehicle shows as "–" on booking detail for such vehicles. `license_plate` is returned either way.
- **Fix:** add `make model vehicle_type` to both selects, or use one shared constant for all eleven.
- **Correction to the first report:** the fields *do* exist (as optional aliases); the endpoints just ask for the wrong pair.
- **Web:** shows the plate, and the name when there is one.

## 3. The device `secret_token` reaches the browser, and unregistered device IDs can be claimed

- `getMyDevices` (`deviceController.js:201-213`) returns whole `Device` documents, and `pairDevice` (`:187-190`) returns the new one. `secret_token` has
  no `select: false` (`models/Device.js:39-43`), so it is in both answers.
- It defaults to a constant, `'change-me-to-a-long-random-string'` (also at `deviceController.js:169`), so every device paired without its own token
  shares one publicly known secret.
- The token is what authorises a command: `mqttService.js:171-180` puts it in every payload `{cmd, token, n}` published to `parkbnb/<id>/cmd`. On
  the default public broker (`broker.hivemq.com` when `MQTT_HOST` is unset; `render.yaml` already warns "anyone who knows a device id can drive it")
  any subscriber sees it in clear. So fixing the API alone does not make it a secret: the broker needs credentials too.
- **Pairing proves nothing about the hardware** (`:156-175`): if the device ID is not registered yet, the caller creates it and owns it. A 409 is
  returned only when another owner got there first. IDs such as `pb-001` are guessable, so IDs ParkFNB intends to ship can be squatted.
- **Not checked here:** whether the firmware (`hardware/`) rejects a wrong token.
- **Fix:** register devices ahead of time (admin creates the record, with a per-device claim code printed on the unit), generate a random per-device
  secret on the server, mark `secret_token` `select: false` and never return it, and give the broker authentication and TLS.
- **Web:** the Barriers page never renders the token (it is not referenced anywhere in `owner-web`), but it still arrives in the browser's network tab.

## 4. Earnings are filtered by booking creation date

`getEarnings` (`ownersController.js:259`) applies `start_date` / `end_date` to `Booking.created_at` (line 292) and selects and sorts by it too.

- **Impact:** a booking made on 1 Nov for a stay on 20 Nov counts as 1 Nov earnings, and a booking made last month for a stay this month falls
  outside this month's range. Today / week / month figures are therefore wrong for anyone who books ahead.
- Also in this function: `pending_earnings` (`:307-314`) ignores the date range, and only `payment_status: 'paid'` is counted, so a
  `partially_refunded` booking drops out entirely instead of being netted. (Payments are stubs today, so this is a question for later.)
- **Fix:** filter on `start_time` (when the stay happens), or add a `paid_at` and filter on that. Decide which one "earned" means to the business first.
- **Web:** the Earnings page works out each range from the bookings list itself (see the comment at the top of `src/services/earningsService.ts`) and
  does not rely on this endpoint for range figures. Fixing the endpoint lets it be simplified.

## 5. Deleting a property leaves its spaces bookable, and `available_spaces` is always 0

`deleteProperty` (`propertiesController.js:231-240`) refuses to delete a property that has active spaces, by counting
`ParkingSpace` documents with `availability_status: 'available'`. **`ParkingSpace` has no such field** (`models/ParkingSpace.js:80-85` has `status`:
`active | inactive | maintenance | unavailable`, and a boolean `is_available`). Mongoose 8 does not strip unknown paths from a query
(`strictQuery` is off), so the filter reaches MongoDB and matches nothing.

1. The guard ("Cannot delete property with N active parking spaces") can never fire.
2. The delete then sets only `property.is_active = false` (`:242-244`). The spaces keep `status: 'active'`, and `createBooking` checks only the
   **space's** `status` (`bookingsController.js:406`), so they can still be booked.
3. The same field feeds `available_spaces` in the property detail (`:77-80`) and in the nearby search (`:355-358`). By the same reasoning those are
   always 0. **This third point is inferred from the code, not run.**
- **Fix:** query `{ is_available: true, status: 'active' }` in all three places. In `deleteProperty`, either block when live spaces exist (as the
  message promises) or soft-delete them in the same step. Make `createBooking` refuse a space whose property is inactive.
- **Web:** the Properties page refuses to delete a property until its spaces are deleted (`src/pages/Properties.tsx:71`) and counts live spaces itself.

## 6. Deleted spaces still come back in a property's space list

`deleteSpace` (`parkingSpacesController.js:340`) is a soft delete: `is_available = false` and `status = 'unavailable'` (`:369-372`). But
`getSpacesByProperty` (`:118-154`) filters only on the optional `?is_available=` query, so deleted spaces are returned, and are indistinguishable
from merely paused ones (`is_available = false`, `status = 'active'`) unless the client checks `status`. The owner's property list also counts them
in `total_spaces`.

- **Fix:** exclude `status: 'unavailable'` by default (an opt-in `?include_deleted=true` for admin), and count only live spaces in `total_spaces`.
- **Web:** filters with `liveSpaces()` (`src/services/listingService.ts:12`) and tags a deleted space "Deleted".

## 7. A verified owner can replace their bank account through the KYC draft endpoint

`PUT /api/owners/me/kyc/draft` (`saveMyKycDraft`, `ownersController.js:623`) calls `applyKycBlocks` (`:597-616`) with the request body whatever the
owner's `kyc_status` is. That writes `kyc_personal`, `kyc_identity`, `kyc_address` and `kyc_bank`, and copies `kyc_bank.account_number` into
`payout_bank_account` (`:611-613`). Only the status flip is guarded ("a draft never walks back a decision", `:633-636`). `submitMyKyc` refuses once
KYC is submitted or verified (`:660-663`); the draft endpoint does not.

- **Impact:** after an admin has verified an owner, the owner (or anyone holding their session) can change the bank account, identity and address,
  and `kyc_status` stays `verified`, so the admin's approval no longer describes what is stored. No payouts exist yet, so no money moves today;
  once payouts use `kyc_bank` / `payout_bank_account` this is a way to redirect them.
- **Fix:** once KYC is submitted or verified, refuse identity, personal and address changes (409) and send a bank change through re-verification
  (for example `kyc_status` back to `submitted`, or a pending-change record an admin approves), and log who changed what.
- **Web:** the Profile page edits the bank details through this endpoint exactly as the owner app does, so it has the same gap.
