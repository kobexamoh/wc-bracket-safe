# ⚽ World Cup Bracket Pool — Work-Safe Edition

A small, deliberately secure web app where coworkers sign in with their email, rank the twelve groups of the 2026 World Cup, and save a bracket nobody else can tamper with.

> The following is a README — a word which here means *"the true and only slightly dramatized account of how a thing got built, accompanied by instructions so that Future Me is not betrayed by Past Me."* If you are looking for a quiet, sensible README that simply lists commands, I am sorry to report you have come to the wrong file. The commands are here. They are just keeping unusual company.

---

## What It Actually Is

A single-page app for a friendly office World Cup pool:

- **Sign in with an email magic link.** No passwords to forget, no accounts to manage.
- **Rank each group by clicking.** First click crowns 1st, the next 2nd, and so on through 4th. Click a team again to dethrone it; the rest politely shuffle up. The top two in every group are marked **Advances**.
- **Save your bracket.** It lands in a database row that is yours and yours alone — enforced by the server, not by good manners.
- **Come back later.** Your picks are waiting, exactly where you left them.

That's the whole job. It does that job and then stops, which is more than can be said for most software.

---

## I. In Which a View-Source Rip Becomes a Problem

It began, as these things do, with a bracket simulator someone else had built and left lying around the internet with its engine running and its doors unlocked. I admired it. I right-clicked it. I selected **View Source**, and — reader — I took the whole thing home in my pockets: roughly nine thousand lines of HTML with the Supabase keys sitting right there in the open, like a spare house key under a mat labeled SPARE HOUSE KEY.

It worked. It was also a small security incident waiting politely for someone to notice it.

## II. In Which an IDE and I Stop Seeing Eye to Eye

The plan was sensible: feed the giant file to an editor, ask it to make the thing *modular* and *safe*, and redeploy. The plan produced a Supabase project, a Vercel URL, and a folder full of half-finished good intentions. It did not produce a working app. (It also, at one memorable juncture, suggested I go set up Google Cloud OAuth at midnight. I did not.)

## III. In Which the Whole Thing Gets Rebuilt Before Kickoff

So it was rebuilt — properly this time — in the small hours before the tournament's opening match. The hardcoded keys were marched into environment variables. The nine-thousand-line monolith was broken into files a human can actually read. The bracket learned to be *clicked*. And the database was taught, firmly, that everyone may keep a bracket but no one may read anyone else's.

It shipped. The opener was at 1pm. We made it with hours to spare, which in software terms is roughly a decade.

---

## The Stack

- **Frontend:** plain JavaScript + [Vite](https://vitejs.dev/). No framework, because the job didn't need one.
- **Auth + database:** [Supabase](https://supabase.com/) — email magic-link sign-in and a single Postgres table guarded by Row-Level Security.
- **Auth emails:** a custom SMTP provider ([Resend](https://resend.com/)) on a subdomain you control, because Supabase's built-in mailer is rate-limited and will tap out the moment a dozen coworkers log in at once.
- **Hosting:** [Vercel](https://vercel.com/), redeploying on every push.
- **Tests:** Node's built-in test runner. No dependencies, no ceremony.

```
wc-bracket-safe/
├── index.html              # markup + the SVG soccer-ball favicon
├── src/
│   ├── config/supabase.js  # reads keys from env vars (never hardcoded)
│   ├── js/
│   │   ├── app.js          # auth flow + interactive bracket wiring
│   │   ├── authUtils.js    # the "stop spamming the login button" cooldown
│   │   ├── bracketData.js  # the 48 teams, 12 groups, and the renderer
│   │   ├── bracketStore.js # load / save / validate picks
│   │   └── sanitize.js     # input scrubbing + email redaction
│   └── styles/styles.css   # U of A green + gold
└── test/                   # unit tests for the bits worth trusting
```

---

## A Word on Security (the Genuinely Serious Bit)

The personality stops here, briefly, because this part matters.

- **No secrets in the repo.** Keys live in `.env.local` (gitignored) and in Vercel's environment settings. The git history was scanned to confirm nothing leaked during the chaos.
- **The anon key is *meant* to be public.** It ships in the browser bundle no matter what you do. The thing actually protecting people's brackets is **Row-Level Security** — database policies that let each signed-in user read and write only their own row.
- **Inputs are sanitized** and dynamic values are rendered with `textContent`, not `innerHTML`, so a cheeky team name can't become a script tag.
- **Saved picks are validated server-side-shaped:** unknown teams, duplicates, and oversized payloads are stripped before anything touches the database.

In short: even if someone grabs the public key (they can), the worst they can do is see their own empty bracket.

---

## Running It Yourself

> A word which here means *"on your own machine, where it can do no harm."*

**Prerequisites:** Node 18+, a Supabase project, and an SMTP provider for the auth emails.

```bash
# 1. install
npm install

# 2. give it your Supabase keys
cp .env.example .env.local
#    then edit .env.local:
#    VITE_SUPABASE_URL=https://your-project.supabase.co
#    VITE_SUPABASE_ANON_KEY=your-anon-key

# 3. run
npm run dev      # http://localhost:3000
npm test         # the unit tests
npm run build    # production build into dist/
```

### Wiring Up Supabase

Run this once in the SQL editor. It creates the table, locks it down with RLS, and — crucially — grants the API role permission to use it (the missing GRANT is a rite of passage; everyone meets the "permission denied for table" error exactly once):

```sql
create table if not exists public.brackets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  picks jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.brackets enable row level security;
create policy "own_bracket_select" on public.brackets for select to authenticated using (auth.uid() = user_id);
create policy "own_bracket_insert" on public.brackets for insert to authenticated with check (auth.uid() = user_id);
create policy "own_bracket_update" on public.brackets for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.brackets to authenticated;
notify pgrst, 'reload schema';
```

Then, in the Supabase dashboard:
1. **Authentication → Providers:** enable Email.
2. **Authentication → Emails → SMTP Settings:** point it at your SMTP provider (verify a sending subdomain first, or the emails go nowhere interesting).
3. **Authentication → URL Configuration:** add your local and deployed URLs as redirect targets.
4. **Authentication → Rate Limits:** raise the emails-per-hour cap so a crowd signing in at once doesn't get throttled.

### Deploying

Push to GitHub, import the repo into Vercel, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables, and deploy. Every subsequent `git push` redeploys on its own.

---

## The Roadmap (or: What Survived the Cutting-Room Floor)

The launch did exactly one thing well and saved the rest for daylight:

- **Phase 1.5** — export your finished bracket as an image; autosave so an accidental refresh can't eat your picks.
- **Phase 2** — the knockout rounds, and a quiet notification when someone submits a bracket.
- **Phase 3** — a scoring engine and a leaderboard, so the per-round prizes have something to measure. *(This is the part I promised coworkers out loud before building it, which is the traditional order of operations.)*

---

## Credits

- **Original bracket concept:** an unnamed stranger whose view-source I will always be grateful for.
- **Rebuilt, secured, and rewritten by:** Kobe Amoh — in one night, fueled by a non-alcoholic grapefruit beer.
- **Colours:** University of Alberta green + gold.

If you're reading this because you're in the work pool: good luck, pick with your heart, and remember that the eight best third-placed teams also advance — a rule designed by FIFA specifically to ruin friendships.
