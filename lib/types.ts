/**
 * The site-facing model. Everything under `app/` reads these types, never ESPN's
 * raw payloads — so a change in ESPN's API surface stays contained to
 * `lib/espn/normalize.ts`.
 */

export interface Manager {
  /** ESPN member GUID, uppercased with braces stripped. Stable across seasons. */
  id: string;
  slug: string;
  name: string;
}

export interface Record {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/** How a game counts toward the record book. */
export type GameKind = "REGULAR" | "PLAYOFF" | "CONSOLATION";

export interface Game {
  seasonId: number;
  /** ESPN's matchupPeriodId. Not always equal to the NFL week in playoff rounds. */
  week: number;
  kind: GameKind;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  winner: "HOME" | "AWAY" | "TIE";
}

export interface TeamSeason {
  seasonId: number;
  teamId: number;
  teamName: string;
  abbrev: string;
  logo: string | null;
  /** Resolved managers for this team-season. Usually one; co-managed teams have more. */
  managerIds: string[];
  regular: Record;
  playoff: Record;
  finalRank: number | null;
  playoffSeed: number | null;
  madePlayoffs: boolean;
}

export interface Season {
  id: number;
  leagueName: string;
  /** False for a season still in progress — its rows are excluded from "best/worst season" records. */
  complete: boolean;
  regularSeasonWeeks: number;
  playoffTeamCount: number;
  teams: TeamSeason[];
  games: Game[];
  championTeamId: number | null;
  runnerUpTeamId: number | null;
}

export interface LeagueData {
  leagueId: string;
  leagueName: string;
  generatedAt: string;
  managers: Manager[];
  seasons: Season[];
}

export const emptyRecord = (): Record => ({
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
});

export function addRecord(target: Record, source: Record): Record {
  return {
    wins: target.wins + source.wins,
    losses: target.losses + source.losses,
    ties: target.ties + source.ties,
    pointsFor: target.pointsFor + source.pointsFor,
    pointsAgainst: target.pointsAgainst + source.pointsAgainst,
  };
}

export const gamesPlayed = (r: Record) => r.wins + r.losses + r.ties;

/** Ties count as half a win, the standard fantasy convention. */
export function winPct(r: Record): number {
  const total = gamesPlayed(r);
  return total === 0 ? 0 : (r.wins + r.ties * 0.5) / total;
}
