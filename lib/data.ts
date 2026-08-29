import type { LeagueData } from "./types";
import { leagueSummary, managerCareers, recordBook } from "./stats";
import { readLeagueSnapshot } from "./league-store";

export const emptyLeague = (): LeagueData => ({
  leagueId: "",
  leagueName: "League History",
  generatedAt: "",
  managers: [],
  seasons: [],
});

/**
 * Reads the canonical league snapshot from Netlify Blobs. When the Blob has
 * not been seeded yet, the pages render a setup prompt instead of throwing.
 */
export async function loadLeague(): Promise<LeagueData> {
  try {
    return (await readLeagueSnapshot()) ?? emptyLeague();
  } catch (error) {
    console.warn("Could not read league snapshot from Netlify Blobs.", error);
    return emptyLeague();
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
    hasData: league.seasons.length > 0,
  };
}

export type LeagueView = Awaited<ReturnType<typeof loadLeagueView>>;
