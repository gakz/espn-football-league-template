# League of Doom

A league history site for an ESPN fantasy football league: all-time standings,
career records for every manager, and a league record book.

Built with Next.js, Tailwind and shadcn/ui, deployed on Netlify.

## How it works

ESPN's Fantasy API is only reachable with your own signed-in cookies, so the
site doesn't call it. Instead an ingest script you run locally pulls every
season and writes JSON into `data/`, which is committed. Netlify builds from
that committed JSON.

```
ESPN v3 API  --(npm run ingest, on your machine)-->  data/*.json  --(git push)-->  Netlify
```

Three things fall out of that:

- **Your ESPN credentials never reach Netlify.** The deploy needs no secrets.
- **The site can't break when ESPN does.** A committed season is yours for good,
  which matters because ESPN restricted access to historical league data in
  August 2025 and pre-2018 seasons have been disappearing.
- **Updating during the season is a script run and a commit**, not a live fetch
  on every page view.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `LEAGUE_ID` — from the URL when you're viewing your league:
  `fantasy.espn.com/football/league?leagueId=XXXXXXX`
- `FIRST_SEASON` — the four-digit year your league started
- `ESPN_S2` and `SWID` — from a browser signed in to ESPN: DevTools →
  Application → Cookies → `espn.com`. Keep the curly braces on `SWID`.

Then check what ESPN will actually give you before committing to a full run:

```bash
npm run espn:check
```

It probes every season with and without cookies and prints a table, so you know
up front which years are reachable. Then:

```bash
npm run ingest      # writes data/raw/*.json and data/league.json
npm run dev         # http://localhost:3000
```

Commit `data/` and push. That's the deploy.

### Fixing up manager names

Managers are keyed by ESPN member GUID rather than team name, since team names
change every year. The ingest prints anyone it couldn't name, and
`data/owners.json` is where you fix names, merge a manager's second ESPN
account into one career, or reassign a team that changed hands. See
[`data/README.md`](data/README.md).

### No ESPN access handy?

```bash
npm run seed:fixtures
```

loads a sample league so you can see the site working.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build; every page is prerendered |
| `npm run test` | Unit tests for the normalizer and the record book |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run ingest` | Pull all seasons from ESPN into `data/` |
| `npm run ingest -- --season 2026` | Refresh one season |
| `npm run ingest -- --force` | Re-fetch seasons already cached on disk |
| `npm run espn:check` | Report which seasons ESPN will serve you |
| `npm run seed:fixtures` | Load the sample league |

Finished seasons are never re-fetched unless you pass `--force`; the current
season always refreshes.

## Layout

```
app/                    Pages: all-time standings, record book, manager profiles
components/             UI, including the vendored shadcn primitives in ui/
lib/espn/               ESPN client, response types, normalizer, identity mapping
lib/stats.ts            All-time aggregates - pure functions, fully unit-tested
scripts/ingest.ts       The ingest
scripts/check.ts        The reachability doctor
fixtures/               Synthetic ESPN payloads used by the tests
data/                   Committed league data (see data/README.md)
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
