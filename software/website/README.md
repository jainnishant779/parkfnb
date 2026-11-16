# Parkfnb website

Marketing site for Parkfnb: Vite + React 18 + TypeScript + React Router. Styling is plain CSS that mirrors the
consumer app's design system (`apps/consumer/user/theme` and `components/ui`): Urbanist, grey canvas, peach/blue
cards, ink pills.

```bash
npm install
npm run dev       # http://localhost:5174
npm run build     # type-check + production build to dist/
npm run preview   # serve dist/ locally
```

## Pages

`/` home · `/how-it-works` (`?for=owners` opens the owner journey) · `/features` · `/smart-gates` · `/owners`
(`#calculator`) · `/pricing` · `/about` · `/contact` (`?topic=driver-help|list-space|partnership|early-access|other`)
· `/faq` (`?q=` search) · `/download` · `/privacy` · `/terms` · anything else renders the 404 page.

## Things to set before launch

- `src/data/site.ts`: support and partner email addresses, and the App Store / Google Play links. While a store
  link is empty its button shows "Soon" and opens the early-access form instead.
- The contact form has no backend: it validates, then opens the visitor's email app with the message filled in.
- Privacy policy and terms (`src/pages/Legal.tsx`) are a starting draft and need a legal review.

## Deploy

Hosted on Vercel at https://parkfnb-website.vercel.app (project `parkfnb-website`, connected to this repo: every
push to `main` deploys to production).

`vercel.json` uses an explicit `builds` + `routes` config on purpose. Without it, current Vercel tooling detects the
project as an experimental "services" app and the deployment answers every path with 404. The routes add security
headers, cache `/assets/*` forever (the files are content-hashed), serve real files first, and send every other path
to `index.html` so deep links like `/owners` work on reload. `public/_redirects` does the same on Netlify.
