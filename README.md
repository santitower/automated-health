# NutriPlan

A meal planner that works immediately in an anonymous in-memory mode. An optional Supabase connection adds email/password sessions, Google sign-in, PostgreSQL persistence, and row-level security so each account sees only its own profile, plans, saved meals, and grocery review.

## Optional Supabase setup

The deployed app remains usable without these variables. Connect Supabase when account-based persistence is ready to be enabled.

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project settings → API**, copy the project URL and publishable key.
3. Copy `.env.example` to `.env.local` and replace the placeholder values.
4. Open the Supabase SQL editor and run `supabase/migrations/20260816000000_initial.sql`.
5. In **Authentication → URL configuration**, set the Site URL to your deployed URL (or `http://localhost:3000`) and allow `http://localhost:3000/auth/callback` for local development.

Email/password registration works immediately. To show functional Google sign-in, enable Google under **Authentication → Providers** and add the Google credentials Supabase requests. The button can remain in the UI before that provider is enabled, but Supabase will report that it is unavailable.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and complete onboarding. Without Supabase, state lasts for the current browser session. With Supabase configured, create an account and the latest profile, plan, saved meals, and grocery review are restored after sign-in.

## Database changes

`db/schema.ts` is the Drizzle model. Generate a migration with:

```bash
npm run db:generate
```

The checked-in Supabase migration is the deployable source for the initial schema and includes the required row-level-security policies.

## Deploy

Import this repository into Vercel and push the main branch to deploy the anonymous experience. To enable accounts, add the same two environment variables and update Supabase's Site URL and redirect allow-list to the production domain.

## Instacart integration

The grocery list page's "Connect Instacart agent" button talks to a local companion agent (the `instacart-agent` repo, run with `npm run serve`) on `localhost:4545`, on your own machine, next to a Chrome window you're logged into Instacart with. It's not part of this app's server and isn't deployed — it only runs while you're using the app yourself, and it never automates checkout. Override its address with `NEXT_PUBLIC_INSTACART_AGENT_URL` if you're running it on a different port.
