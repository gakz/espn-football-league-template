import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { OwnersConfig } from "@/lib/espn/owners";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export const DATA_DIR = path.join(process.cwd(), "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const LEAGUE_FILE = path.join(DATA_DIR, "league.json");
export const OWNERS_FILE = path.join(DATA_DIR, "owners.json");

export interface IngestConfig {
  leagueId: string;
  firstSeason: number;
  lastSeason: number;
  espnS2?: string;
  swid?: string;
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function readInteger(name: string, fallback?: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    if (fallback === undefined) fail(`${name} is not set.`);
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value)) fail(`${name} must be an integer.`);
  return value;
}

function defaultLastSeason(): number {
  // ESPN fantasy football seasons are named for the calendar year they start.
  // Before roughly August, the newest season that exists is last year's.
  const now = new Date();
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function readConfig(): IngestConfig {
  const leagueId = process.env.LEAGUE_ID?.trim();
  if (!leagueId) {
    fail(
      "LEAGUE_ID is not set.\n" +
        "Copy .env.example to .env.local and fill it in. Your league ID is in the\n" +
        "URL when you view your league: fantasy.espn.com/football/league?leagueId=XXXXXXX",
    );
  }

  const firstSeason = readInteger("FIRST_SEASON");
  if (firstSeason < 2000) {
    fail("FIRST_SEASON must be the four-digit year your league started, e.g. 2015.");
  }

  const lastSeason = process.env.LAST_SEASON?.trim()
    ? readInteger("LAST_SEASON")
    : defaultLastSeason();

  if (lastSeason < firstSeason) {
    fail(`FIRST_SEASON (${firstSeason}) is in the future; nothing to ingest.`);
  }

  return {
    leagueId,
    firstSeason,
    lastSeason,
    espnS2: process.env.ESPN_S2?.trim() || undefined,
    swid: process.env.SWID?.trim() || undefined,
  };
}

export function seasonRange(config: IngestConfig, only?: number): number[] {
  if (only) return [only];
  const years: number[] = [];
  for (let y = config.firstSeason; y <= config.lastSeason; y++) years.push(y);
  return years;
}

export function readOwnersConfig(): OwnersConfig {
  if (!fs.existsSync(OWNERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(OWNERS_FILE, "utf8")) as OwnersConfig;
}

export function rawPath(season: number): string {
  return path.join(RAW_DIR, `${season}.json`);
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
