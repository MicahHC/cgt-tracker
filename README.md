# CGT Tracker

React/Vite frontend for the CGT commercialization tracker. The app deploys
from GitHub to Vercel and continues to use Supabase for live data, agent runs,
weekly scoring, ABM audience tables, and change history.

## Local Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` if you need to override the Supabase
project used by the live tracker.

## Production Deployment

The production frontend can be deployed on Vercel from this GitHub repository.

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

The app is a static frontend. Scheduled tracker updates and Supabase Edge
Functions continue to run in Supabase.
