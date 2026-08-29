import { getStore } from "@netlify/blobs";
import type { LeagueData } from "./types";

const STORE_NAME = "league-data";
const LEAGUE_KEY = "league.json";

function store() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function readLeagueSnapshot(): Promise<LeagueData | null> {
  return (await store().get(LEAGUE_KEY, { type: "json" })) as LeagueData | null;
}

export async function writeLeagueSnapshot(data: LeagueData): Promise<void> {
  await store().setJSON(LEAGUE_KEY, data);
}

export async function writeRawSeasonSnapshot(season: number, payload: unknown): Promise<void> {
  await store().setJSON(`raw/${season}.json`, payload);
}
