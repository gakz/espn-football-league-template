import fs from "node:fs";
import path from "node:path";
import type { LeagueData } from "./types";
import { leagueSummary, managerCareers, recordBook } from "./stats";

const LEAGUE_FILE = path.join(process.cwd(), "data", "league.json");

export const emptyLeague = (): LeagueData => ({
  leagueId: "",
  leagueName: "League History",
  generatedAt: "",
  managers: [],
  seasons: [],
});

/**
 * Reads the committed league snapshot.
 *
 * A fresh clone has no data/league.json — the ingest hasn't been run yet — so
 * this returns an empty league rather than throwing. The pages render a setup
 * prompt in that case, which keeps `npm run build` working for anyone who
 * clones the repo before they have ESPN credentials in hand.
 */
export function loadLeague(): LeagueData {
  if (!fs.existsSync(LEAGUE_FILE)) return emptyLeague();
  return JSON.parse(fs.readFileSync(LEAGUE_FILE, "utf8")) as LeagueData;
}

/** Everything the pages need, derived once per build. */
export function loadLeagueView() {
  const league = loadLeague();
  const careers = managerCareers(league);
  return {
    league,
    careers,
    summary: leagueSummary(league, careers),
    records: recordBook(league, careers),
    hasData: league.seasons.length > 0,
  };
}

export type LeagueView = ReturnType<typeof loadLeagueView>;
