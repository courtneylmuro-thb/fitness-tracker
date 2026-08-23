# Fitness Tracker

Personal fitness/nutrition PWA. Install it to your iPhone home screen and it behaves like an app.

## What's automatic vs. manual

| Source | How it gets in | Automatic? |
|---|---|---|
| Apple Watch / Apple Health (steps, active/resting calories, sleep, weight, workouts) | "Health Auto Export" iOS app posts to `/api/health-import` | Yes, on a schedule you set in that app |
| Calendar workouts (LuxFit classes, bike rides, etc.) + vacation days | A separate Claude scheduled task reads your Google Calendar daily and writes into Supabase directly | Yes, runs automatically |
| Food | Talk, type, or photo in the **Log Food** tab -> Claude estimates calories/macros | Semi -- takes 5 seconds |
| InBody body composition | Photo of the printout in the **Body Scan** tab -> Claude reads the numbers off the sheet | Manual, whenever you scan (not daily) |

## One-time setup

### 1. Database (already done)
Tables live in a `fitness` schema inside your existing `haute-bohemian-admin` Supabase project (id `thrnmduriiyrzauydmpo`), fully separate from your blog tables. Row Level Security is on with no policies, so only the service role key (server-side only) can read/write it.

Get your service role key: Supabase dashboard -> haute-bohemian-admin project -> Project Settings -> API -> `service_role` secret key. **Never put this in client-side code or commit it to git** -- it bypasses all security.

### 2. Deploy to Vercel
1. Push this folder to a new GitHub repo.
2. Import the repo in Vercel.
3. In Vercel project settings -> Environment Variables, add everything from `.env.example`:
   - `SUPABASE_URL` — already filled in above
   - `SUPABASE_SERVICE_ROLE_KEY` — from step 1
   - `ANTHROPIC_API_KEY` — from console.anthropic.com (this is what estimates food/reads InBody photos, billed per use, very cheap for this volume)
   - `HEALTH_EXPORT_SECRET` — make up any long random string, you'll reuse it in step 3
4. Deploy. Open the Vercel URL on your iPhone, tap Share -> Add to Home Screen.

### 3. Connect Apple Health
1. Install **Health Auto Export - JSON+CSV** from the App Store.
2. Add a "REST API" automation, pointed at `https://<your-vercel-domain>/api/health-import`.
3. Set header `Authorization: Bearer <HEALTH_EXPORT_SECRET>` (same value as step 2).
4. Pick the metrics: Step Count, Active Energy, Resting/Basal Energy, Weight, Sleep Analysis, and Workouts.
5. Set it to auto-export daily (or more often).

### 4. Calendar + vacation sync
This is handled by a Claude scheduled task (`fitness-calendar-sync`), not the web app itself -- Google Calendar auth is much simpler through Claude's existing connection than wiring up your own OAuth app. It reads your calendar daily and writes workouts (LuxFit, Pilates, bike rides, etc.) and vacation/travel days straight into the same Supabase tables the app reads from. Nothing to configure here.

## Local development
```
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

## Notes
- Calorie/macro estimates are deliberately rough single-guess estimates, not lab-precision -- the idea is they average out over time rather than being individually precise.
- The daily calorie budget defaults to 2000; change it directly in Supabase (`fitness.settings` table, key `daily_calorie_budget`) until there's a settings screen.
