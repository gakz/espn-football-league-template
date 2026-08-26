# data/

Everything the site renders lives here, committed to the repo. The build reads
these files; it never calls ESPN. That's deliberate — it keeps ESPN credentials
off Netlify entirely, and it means the site still deploys on a day when ESPN is
down or has dropped an old season from its archive.

| File | Written by | What it is |
|---|---|---|
| `raw/<year>.json` | `npm run ingest` | The untouched ESPN payload for one season |
| `league.json` | `npm run ingest` | The normalized model the pages read |
| `owners.json` | you, by hand | Manager identity fixes |

## Why the raw payloads are kept

`league.json` only holds what the current pages need. Keeping the raw responses
alongside it means adding a draft-history page or a head-to-head grid later is a
pure code change — no cookies, no re-fetching a decade of seasons, and no risk
that ESPN has since stopped serving an old year.

## owners.json

Managers are keyed by their ESPN member GUID, because team names change every
season and can't identify anyone. Two things still need a human:

```json
{
  "managers": {
    "AAAAAAAA-1111-2222-3333-444444444444": {
      "name": "The name to display",
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

`npm run ingest` prints any manager it couldn't find a name for, ready to paste
in here.
