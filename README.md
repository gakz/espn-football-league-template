# ESPN Fantasy Football League Template

A reusable league history site for ESPN fantasy football leagues: all-time
standings, career records for every manager, a league record book, and manager
Ring of Honor pages.

Built with Next.js, Tailwind and shadcn/ui, deployed on Netlify.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/gakz/espn-football-league-template#LEAGUE_ID=&FIRST_SEASON=&ESPN_S2=&SWID=)

## How it works

ESPN's Fantasy API is only reachable with your own signed-in cookies. A Netlify
scheduled function uses those cookies from Netlify environment variables, pulls
ESPN, writes the league snapshot to Netlify Blobs, and the Next.js pages read
that Blob at request time.

```
ESPN v3 API  --(Netlify scheduled function)-->  Netlify Blobs  --(Next runtime)-->  pages
```

Three things fall out of that:

- **Your ESPN credentials live only in Netlify environment variables.** They are
  not exposed to the browser.
- **Pages do not call ESPN.** They read the most recent `league.json` snapshot
  from Netlify Blobs.
- **Updates happen on Netlify's schedule.** The function backfills all seasons
  when the Blob is empty, then refreshes only the current season on later runs.

## Setup

```bash
npm install
cp .env.example .env.local
```

### Get ESPN values

- `LEAGUE_ID` — from the URL when you're viewing your league:
  `fantasy.espn.com/football/league?leagueId=XXXXXXX`
- `FIRST_SEASON` — the four-digit year your league started
- `ESPN_S2` and `SWID` — from a browser signed in to ESPN:
  1. Open your ESPN fantasy football league in the browser.
  2. Open DevTools.
  3. Go to Application → Cookies → `https://www.espn.com`.
  4. Copy the `espn_s2` cookie value into `ESPN_S2`.
  5. Copy the `SWID` cookie value into `SWID`. Keep the surrounding curly
     braces, for example `{AAAA-BBBB-...}`.
- Optional `LAST_SEASON` — override the newest season to fetch.
- Optional `ESPN_REFRESH_MODE=full` — force every scheduled run to re-fetch all
  seasons. Leave unset for normal current-season refreshes.

For local checks, put those values in `.env.local`, then run:

```bash
npm run espn:check
```

It probes every season with and without cookies and prints a table, so you know
up front which years are reachable.

### Set Netlify environment variables

If you use the deploy button, Netlify will clone this repo, create a new site,
and ask for the required environment variables during setup. Set:

| Variable | Required | Value |
|---|---:|---|
| `LEAGUE_ID` | Yes | ESPN fantasy football league ID |
| `FIRST_SEASON` | Yes | First season year to ingest |
| `ESPN_S2` | Yes for private leagues | ESPN `espn_s2` cookie |
| `SWID` | Yes for private leagues | ESPN `SWID` cookie, including braces |
| `LAST_SEASON` | No | Newest season to fetch, when you want to override the default |
| `ESPN_REFRESH_MODE` | No | Set to `full` only when you want every scheduled run to re-fetch every season |

You can also set or update them after deploy in Netlify: Project configuration
→ Environment variables. After changing environment variables, trigger a new
deploy so the site and scheduled function use the new values.

With the Netlify CLI:

```bash
netlify login
netlify link
netlify env:set LEAGUE_ID "123456"
netlify env:set FIRST_SEASON "2015"
netlify env:set ESPN_S2 "your-espn-s2-cookie" --secret
netlify env:set SWID "{your-swid-cookie}" --secret
```

Deploy the site, then open Netlify's Functions UI and run the
`refresh-espn` scheduled function once to seed the Blob. After that it runs
weekly on Tuesday at 13:00 UTC.

For local development against Netlify Blobs:

```bash
netlify dev
```

### Example seed data

[`data/example-league.json`](data/example-league.json) is a checked-in,
sanitized `LeagueData` snapshot with fake IDs and teams. Use it as a schema
reference when wiring up a new league.

`npm run seed:fixtures` writes a fuller local sample to `data/league.json` with
the fixed non-production league ID `fixture`. Real local ingest output
(`data/league.json` and `data/raw/`) is gitignored so a real ESPN league ID or
manager GUIDs do not accidentally get committed.

### Fixing up display names

Careers are displayed by latest ESPN team name but keyed by ESPN member GUID,
since team names change every year. The refresh logs anyone it couldn't label,
and `data/owners.json` is where you customize display names, merge a manager's
second ESPN account into one career, or reassign a team that changed hands. See
[`data/README.md`](data/README.md).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server; use `netlify dev` when testing Blob reads |
| `npm run build` | Production build |
| `npm run test` | Unit tests for the normalizer and the record book |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run ingest` | Local/debug pull into `data/`; production uses Netlify Blobs |
| `npm run ingest -- --season 2026` | Local/debug pull for one season |
| `npm run ingest -- --force` | Re-fetch seasons already cached on disk locally |
| `npm run espn:check` | Report which seasons ESPN will serve you |
| `npm run seed:fixtures` | Write a local/debug sample `data/league.json` with fake league data |

Finished seasons are never re-fetched unless you pass `--force`; the current
season always refreshes.

## Layout

```
app/                    Pages: all-time standings, record book, manager profiles
components/             UI, including the vendored shadcn primitives in ui/
lib/espn/               ESPN client, response types, normalizer, identity mapping
lib/league-store.ts     Netlify Blobs read/write wrapper
lib/stats.ts            All-time aggregates - pure functions, fully unit-tested
netlify/functions/      Scheduled ESPN refresh function
scripts/ingest.ts       The ingest
scripts/check.ts        The reachability doctor
fixtures/               Synthetic ESPN payloads used by the tests
data/                   Owners config and local/debug output (see data/README.md)
```

## How the stats are counted

Records are derived from the schedule rather than from ESPN's `record.overall`,
because that field's treatment of playoff games isn't consistent across seasons.

- **Ties count as half a win** in every win percentage.
- **Consolation-bracket games are excluded** everywhere. They don't decide
  anything, and counting them would inflate the totals of whoever missed the
  playoffs most often.
- **A playoff appearance requires having played a bracket game.** Mid-season,
  ESPN's `playoffSeed` is a projection, so it isn't counted.
- **Streaks run across seasons**, so an all-time streak can carry through an
  offseason.
- **All-play** is a team's record against every other team every week — the
  same schedule-luck-free measure a lot of leagues compute by hand.
- **Co-managed teams count for both managers.** The alternative silently drops
  someone from their own league's history.

## Notes on the ESPN API

Two endpoint shapes, and the older one is the awkward one:

| Seasons | Endpoint | Returns |
|---|---|---|
| 2018+ | `/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{id}` | a league object |
| pre-2018 | `/apis/v3/games/ffl/leagueHistory/{id}?seasonId={year}` | an **array** of one league object |

Payloads drift too: older seasons split a team name into `location` +
`nickname`, newer ones use a single `name`; `rankCalculatedFinal` is often
missing from the archive, so the champion is recovered from the bracket
instead. All of that is handled in `lib/espn/normalize.ts` and covered by tests.
