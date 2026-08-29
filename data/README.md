# data/

Production league data lives in Netlify Blobs. The scheduled
`refresh-espn` function writes `league.json` plus raw ESPN season payloads under
the `league-data` Blob store.

This directory now holds hand-maintained configuration and local/debug output.
The app does not read `data/league.json` in production.

| File | Written by | What it is |
|---|---|---|
| `raw/<year>.json` | `npm run ingest` | Local/debug untouched ESPN payload for one season |
| `league.json` | `npm run ingest` | Local/debug normalized model |
| `owners.json` | you, by hand | Team display and identity fixes |
| `ring-of-honor.json` | you, by hand | Manually-added Ring of Honor entries |

## Why the raw payloads are kept

`league.json` only holds what the current pages need. The scheduled function
also stores raw responses in the Blob store, so adding a draft-history page or a
head-to-head grid later can reuse the saved ESPN payloads.

## owners.json

Careers are keyed by ESPN member GUID, even though the site displays fantasy
team names. Team names change, so GUIDs are still the stable identity. Two
things still need a human:

```json
{
  "managers": {
    "AAAAAAAA-1111-2222-3333-444444444444": {
      "name": "Optional custom display name",
      "slug": "optional-custom-url",
      "aliases": ["BBBBBBBB-5555-6666-7777-888888888888"]
    }
  },
  "teamOverrides": {
    "2019:3": "AAAAAAAA-1111-2222-3333-444444444444"
  }
}
```

- **`aliases`** merges a manager who lost their login and re-registered under a
  new ESPN account into a single career.
- **`teamOverrides`** assigns one team-season (`"<year>:<teamId>"`) to a specific
  manager — for a team that changed hands mid-league, or a co-managed team that
  should count for one person.

The refresh logs any manager it couldn't find a name for, ready to paste in
here.

## ring-of-honor.json

Manager pages auto-suggest Ring of Honor players (the standout player on a
championship roster, and any player rostered 3+ seasons), but you can also add
one by hand. Unlike `owners.json`, this file is read directly by the Next.js
app at build time (see `lib/ring-of-honor.ts`) — editing it and redeploying is
enough, no ESPN re-sync required. Keyed by manager **slug** (the part of the
URL after `/managers/`), since you're looking at the live page while editing
this, not digging a GUID out of the network tab:

```json
{
  "some-managers-slug": [
    {
      "playerName": "Full Player Name",
      "note": "Optional context for why they're here",
      "seasonId": 2022,
      "position": "Optional, only needed if there's no roster snapshot to infer it from"
    }
  ]
}
```

If a manager's team name (and therefore their auto-generated slug) is likely
to change, pin their slug in `owners.json`'s `managers.<guid>.slug` first —
otherwise a later rename can silently orphan their Ring of Honor entries.

A manual entry whose `playerName` matches an auto-suggested player (case- and
whitespace-insensitive) merges into that same entry rather than creating a
duplicate.
