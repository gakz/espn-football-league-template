import type { EspnLeague } from "./types";

const HOST = "https://lm-api-reads.fantasy.espn.com";

/**
 * Views the ingest requests. We pull more than the all-time standings strictly
 * need (rosters, draft) because the raw payload gets committed to data/raw —
 * adding a draft-history page later should never require re-authenticating
 * against ESPN and re-fetching a decade of seasons.
 */
export const VIEWS = [
  "mTeam",
  "mSettings",
  "mStandings",
  "mSchedule",
  "mMatchupScore",
  "mDraftDetail",
  "mRoster",
] as const;

/**
 * ESPN moved leagues onto the per-season endpoint in 2018. Seasons before that
 * live behind `leagueHistory`, which — the part that trips everyone up —
 * returns an *array* of one league object rather than the object itself.
 */
export const FIRST_MODERN_SEASON = 2018;

export interface EspnCredentials {
  espnS2?: string;
  swid?: string;
}

export class EspnError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly season: number,
  ) {
    super(message);
    this.name = "EspnError";
  }
}

export function seasonUrl(leagueId: string, season: number): string {
  const views = VIEWS.map((v) => `view=${v}`).join("&");
  return season >= FIRST_MODERN_SEASON
    ? `${HOST}/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${views}`
    : `${HOST}/apis/v3/games/ffl/leagueHistory/${leagueId}?seasonId=${season}&${views}`;
}

/**
 * ESPN wants SWID *with* its curly braces. Pasting the cookie out of DevTools
 * usually keeps them, but pasting out of a terminal or a shell var often
 * doesn't, and the resulting 401 gives no hint why — so re-add them here.
 */
export function cookieHeader(creds: EspnCredentials): string | undefined {
  const parts: string[] = [];
  if (creds.espnS2) parts.push(`espn_s2=${creds.espnS2}`);
  if (creds.swid) {
    const swid = creds.swid.startsWith("{") ? creds.swid : `{${creds.swid}}`;
    parts.push(`SWID=${swid}`);
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}

/** `leagueHistory` hands back `[league]`; the modern endpoint hands back `league`. */
export function unwrapLeague(payload: unknown): EspnLeague {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      throw new Error("ESPN returned an empty leagueHistory array for this season");
    }
    return payload[0] as EspnLeague;
  }
  return payload as EspnLeague;
}

function describe(status: number, season: number): string {
  if (status === 401) {
    return `${season}: ESPN returned 401. Your espn_s2/SWID cookies are missing, expired, or belong to an account that can't see this league. Re-copy them from DevTools and try again.`;
  }
  if (status === 403) {
    return `${season}: ESPN returned 403. This usually means the account is signed in but not a member of the league.`;
  }
  if (status === 404) {
    return `${season}: ESPN returned 404 — the league has no data for this season. If this is before your league's first year, lower FIRST_SEASON.`;
  }
  return `${season}: ESPN returned ${status}.`;
}

export interface FetchOptions extends EspnCredentials {
  retries?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

export async function fetchSeason(
  leagueId: string,
  season: number,
  options: FetchOptions = {},
): Promise<unknown> {
  const { retries = 3, fetchImpl = fetch } = options;
  const cookie = cookieHeader(options);
  const url = seasonUrl(leagueId, season);

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 1s, 2s, 4s. ESPN rate-limits an ingest that walks ten seasons back to back.
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: "application/json",
          ...(cookie ? { cookie } : {}),
        },
      });
    } catch (cause) {
      lastError = new Error(`${season}: network error contacting ESPN`, { cause });
      continue;
    }

    if (response.ok) return response.json();

    // 429 and 5xx are worth another try; a 401/403/404 will never change on retry.
    if (response.status === 429 || response.status >= 500) {
      lastError = new EspnError(describe(response.status, season), response.status, season);
      continue;
    }

    throw new EspnError(describe(response.status, season), response.status, season);
  }

  throw lastError ?? new Error(`${season}: exhausted retries against ESPN`);
}
