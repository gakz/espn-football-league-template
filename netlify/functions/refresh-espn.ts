import type { Config } from "@netlify/functions";
import ownersConfig from "../../data/owners.json";
import { fetchSeason } from "../../lib/espn/client";
import { buildLeagueData, type SeasonPayload } from "../../lib/espn/build-league";
import type { OwnersConfig } from "../../lib/espn/owners";
import type { LeagueData, Manager, Season } from "../../lib/types";
import {
  readLeagueSnapshot,
  writeLeagueSnapshot,
  writeRawSeasonSnapshot,
} from "../../lib/league-store";

type NetlifyGlobal = typeof globalThis & {
  Netlify?: { env: { get(name: string): string | undefined } };
};

interface RefreshConfig {
  leagueId: string;
  firstSeason: number;
  lastSeason: number;
  espnS2?: string;
  swid?: string;
  fullRefresh: boolean;
  refreshReason: string;
}

function hasDuplicateManagerNames(data: LeagueData | null): boolean {
  if (!data) return false;
  const names = data.managers.map((manager) => manager.name).filter(Boolean);
  return new Set(names).size !== names.length;
}

function env(name: string): string | undefined {
  return (globalThis as NetlifyGlobal).Netlify?.env.get(name)?.trim() || undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function readRefreshConfig(existing: LeagueData | null): RefreshConfig {
  const firstSeason = Number(requireEnv("FIRST_SEASON"));
  if (!Number.isInteger(firstSeason) || firstSeason < 2000) {
    throw new Error("FIRST_SEASON must be the four-digit year your league started.");
  }

  const now = new Date();
  const defaultLastSeason =
    now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const lastSeason = Number(env("LAST_SEASON") ?? defaultLastSeason);
  if (!Number.isInteger(lastSeason) || lastSeason < firstSeason) {
    throw new Error("LAST_SEASON must be greater than or equal to FIRST_SEASON.");
  }

  const mode = env("ESPN_REFRESH_MODE")?.toLowerCase();
  const emptySnapshot = existing === null || existing.seasons.length === 0;
  const duplicateNames = hasDuplicateManagerNames(existing);
  const fullRefresh = mode === "full" || emptySnapshot || duplicateNames;

  return {
    leagueId: requireEnv("LEAGUE_ID"),
    firstSeason,
    lastSeason,
    espnS2: env("ESPN_S2"),
    swid: env("SWID"),
    fullRefresh,
    refreshReason:
      mode === "full"
        ? "ESPN_REFRESH_MODE=full"
        : emptySnapshot
          ? "empty Blob snapshot"
          : duplicateNames
            ? "duplicate team display names in Blob snapshot"
            : "scheduled current-season refresh",
  };
}

function seasonRange(firstSeason: number, lastSeason: number): number[] {
  const seasons: number[] = [];
  for (let season = firstSeason; season <= lastSeason; season++) seasons.push(season);
  return seasons;
}

function mergeManagers(existing: Manager[], fresh: Manager[]): Manager[] {
  const byId = new Map(existing.map((manager) => [manager.id, manager]));

  for (const manager of fresh) {
    const previous = byId.get(manager.id);
    byId.set(
      manager.id,
      previous
        ? {
            ...manager,
            slug: previous.slug,
          }
        : manager,
    );
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function mergeSeasons(existing: Season[], fresh: Season[]): Season[] {
  const byId = new Map(existing.map((season) => [season.id, season]));
  for (const season of fresh) byId.set(season.id, season);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

async function fetchPayloads(config: RefreshConfig, seasons: number[]): Promise<SeasonPayload[]> {
  const payloads: SeasonPayload[] = [];

  for (const season of seasons) {
    const payload = await fetchSeason(config.leagueId, season, {
      espnS2: config.espnS2,
      swid: config.swid,
      retries: 1,
    });
    await writeRawSeasonSnapshot(season, payload);
    payloads.push({ season, payload });
  }

  return payloads;
}

function updateLeagueSnapshot(
  existing: LeagueData | null,
  fresh: LeagueData,
  generatedAt: string,
): LeagueData {
  if (!existing || existing.leagueId !== fresh.leagueId) return fresh;

  return {
    leagueId: fresh.leagueId,
    leagueName: fresh.leagueName || existing.leagueName,
    generatedAt,
    managers: mergeManagers(existing.managers, fresh.managers),
    seasons: mergeSeasons(existing.seasons, fresh.seasons),
  };
}

export default async (req: Request) => {
  const event = (await req.json().catch(() => ({}))) as { next_run?: string };
  const existing = await readLeagueSnapshot();
  const config = readRefreshConfig(existing);
  const seasons = config.fullRefresh
    ? seasonRange(config.firstSeason, config.lastSeason)
    : [config.lastSeason];

  console.log(
    `Refreshing ESPN league ${config.leagueId}: ${config.fullRefresh ? "full" : "current-season"} (${config.refreshReason}; ${seasons.join(", ")})`,
  );

  const payloads = await fetchPayloads(config, seasons);
  const generatedAt = new Date().toISOString();
  const fresh = buildLeagueData({
    leagueId: config.leagueId,
    payloads,
    owners: ownersConfig as OwnersConfig,
    generatedAt,
  });
  const next = updateLeagueSnapshot(existing, fresh, generatedAt);

  await writeLeagueSnapshot(next);

  console.log(
    `Wrote ${next.seasons.length} seasons and ${next.managers.length} managers to Netlify Blobs. Next run: ${event.next_run ?? "unknown"}`,
  );

  const unnamed = next.managers.filter((manager) => manager.name === "Unknown team");
  if (unnamed.length > 0) {
    console.log(
      `${unnamed.length} team(s) have no display name from ESPN. Add them to data/owners.json:\n` +
        unnamed.map((manager) => `  "${manager.id}": { "name": "..." }`).join("\n"),
    );
  }

  return Response.json({
    ok: true,
    mode: config.fullRefresh ? "full" : "current-season",
    reason: config.refreshReason,
    seasons,
    nextRun: event.next_run ?? null,
  });
};

export const config: Config = {
  schedule: "0 13 * * 2",
};
