import type { LeagueData } from "./types";
import { leagueSummary, managerCareers, recordBook } from "./stats";
import { readLeagueSnapshot } from "./league-store";
import { ringOfHonorByManager, type RingOfHonorConfig } from "./ring-of-honor";
import exampleLeagueSnapshot from "@/data/example-league.json";
import ringOfHonorConfig from "@/data/ring-of-honor.json";

export const EXAMPLE_LEAGUE_ID = "example-football-league";

export const emptyLeague = (): LeagueData => ({
  leagueId: "",
  leagueName: "League History",
  generatedAt: "",
  managers: [],
  seasons: [],
});

export const exampleLeague = (): LeagueData => exampleLeagueSnapshot as LeagueData;

export function isExampleLeague(league: LeagueData): boolean {
  return league.leagueId === EXAMPLE_LEAGUE_ID;
}

/**
 * Reads the canonical league snapshot from Netlify Blobs. When the Blob has
 * not been seeded yet, the pages render checked-in example data so a fresh
 * template deploy has useful content before the first ESPN refresh.
 */
export async function loadLeague(): Promise<LeagueData> {
  try {
    const snapshot = await readLeagueSnapshot();
    return snapshot && snapshot.seasons.length > 0 ? snapshot : exampleLeague();
  } catch (error) {
    console.warn("Could not read league snapshot from Netlify Blobs.", error);
    return exampleLeague();
  }
}

/** Everything the pages need, derived from the current Blob snapshot. */
export async function loadLeagueView() {
  const league = await loadLeague();
  const careers = managerCareers(league);
  return {
    league,
    careers,
    summary: leagueSummary(league, careers),
    records: recordBook(league, careers),
    ringOfHonor: ringOfHonorByManager(league, careers, ringOfHonorConfig as RingOfHonorConfig),
    hasData: league.seasons.length > 0,
  };
}

export type LeagueView = Awaited<ReturnType<typeof loadLeagueView>>;
