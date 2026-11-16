# ParkFNB owner dashboard

The web dashboard for parking owners: sign in with a phone number, see your own cameras (live bays, plates, violations, reports) and
manage what the owner app manages (properties and spaces, bookings, earnings, barriers). React 18 + Vite + TypeScript, plain CSS.

**Its look is the operator console's** (`ai/anpr/static/css/parkfnb.css` + `console.html`): `src/styles/parkfnb.css` is a copy of that
file, and the components write the console's own class names. Keep it that way: no Tailwind, no chart or UI library, no colours or radii
of its own (use the tokens). If the console's stylesheet changes, change both (a `diff` of the two must be empty).

```bash
npm install
npm run dev        # http://localhost:5175
npm run build      # type-check + production build to dist/
```

`VITE_API_BASE_URL` (see `.env.example`) is the backend; it defaults to `https://parkfnb.onrender.com`.

## How it works

```
owner-web (browser) ── phone OTP ──▶ backend (Render)           /api/auth/*, /api/owners, /api/properties, /api/bookings, ...
        │                                  │
        │   POST /api/cameras/access-grant │  the owner's active cameras → a signed 15-minute pass per ANPR server
        ▼                                  ▼
owner-web ── Authorization: Bearer <pass> ──▶ ANPR service (EC2)   /owner/api/cameras/{id}/...
```

- **Sign-in** is the owner app's phone OTP (`src/pages/Login.tsx`). A new number becomes an owner and goes through onboarding (profile, then
  KYC) before the dashboard opens. The test code `123456` is refused in production.
- **Cameras** come straight from the ANPR service with a pass the backend signs (`src/lib/anpr.ts`). Nothing goes through the backend, so a
  sleeping free-tier API never holds up a live picture. Pictures are fetched with the pass in a header and shown from object URLs: never a
  token in a URL. The pass is renewed after 10 minutes; unlinking a camera takes effect within 15.
- **An owner sees only their own cameras**, and only what was recorded since the camera was linked to them (the pass carries that moment per
  camera). Number plates are shown to the camera's owner; see `ai/anpr/HANDOVER.md` section 7 and `ai/anpr/docs/production-readiness.md`
  section 5 (privacy notice and signage at the lot before a real owner is let in).
- **Linking a camera**: a ParkFNB admin assigns it to an owner's property in the admin panel (Cameras), or makes a one-time pairing code that
  the owner enters under Cameras here.

## Layout

| | |
|---|---|
| `src/routes.tsx` | every page, its title and where it sits in the menu |
| `src/components/AppShell.tsx` | the console's frame: menu panel, glass top bar, camera picker, phone tab bar |
| `src/components/ui.tsx`, `charts.tsx` | the console's building blocks as components (Card, Tile, Tag, Seg, TodoList, Bays, CamWell, Drawer, LineChart ...) |
| `src/lib/api.ts` | the backend client (camelCase ⇄ snake_case, envelope, token refresh, upload) |
| `src/lib/anpr.ts` | the access grant and the calls to the ANPR service |
| `src/lib/lot.ts` | what the ANPR service says about a lot, and the console's words and colours for it |
| `src/context/` | `AuthContext` (session, onboarding gate), `CameraContext` (the owner's cameras, the picked one, the violations badge) |
| `src/pages/` | one file per page (default export) |

Console rules the pages keep: server text (plates, notes, names) only as React children, never `dangerouslySetInnerHTML`; every page stops
its pollers when it goes (`usePoll`); a repaint never wipes what someone is typing; times are the lot's (`src/lib/format.ts`), not the
browser's; the colours always mean the same (blue = a car in its bay, amber = near a line or unclear, red = over a line, green = free).

## Trying it end to end on a laptop

1. MongoDB, then the backend with `ANPR_GRANT_SECRET` (32+ characters), `ANPR_DEFAULT_BASE_URL=http://localhost:8008`,
   `ALLOW_DEV_OTP=true` and `FRONTEND_URL` including `http://localhost:5175`. `node scripts/seed-demo.js --reset` for data,
   `node scripts/make-admin.js` for an admin.
2. The ANPR service with the same `ANPR_GRANT_SECRET` and `ANPR_OWNER_ORIGINS=http://localhost:5175`, and a camera sending frames
   (`/live/camera?camera_id=cam-a&key=...` in a browser).
3. In the admin panel (Cameras) register `cam-a` and assign it to the owner's property, or make a pairing code and enter it here.
4. `npm run dev` here, sign in with the owner's phone (the dev code is shown on the sign-in page when the backend allows it).

## Deploy

`render.yaml` is a Render static site. Both the API and the ANPR service must allow this site's address (CORS), and share
`ANPR_GRANT_SECRET`; the checklist is at the top of that file.
