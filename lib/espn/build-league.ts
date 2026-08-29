import { buildManagerIndex, type OwnersConfig } from "./owners";
import { normalizeSeason } from "./normalize";
import type { LeagueData, Season } from "@/lib/types";

export interface SeasonPayload {
  season: number;
  payload: unknown;
}

export function buildLeagueData({
  leagueId,
  payloads,
  owners,
  generatedAt = new Date().toISOString(),
}: {
  leagueId: string;
  payloads: SeasonPayload[];
  owners: OwnersConfig;
  generatedAt?: string;
}): LeagueData {
  const index = buildManagerIndex(
    payloads.map((p) => p.payload),
    owners,
  );

  const seasons: Season[] = payloads
    .map(({ season, payload }) => normalizeSeason(payload, season, index))
    .sort((a, b) => a.id - b.id);

  return {
    leagueId,
    leagueName: seasons.at(-1)?.leagueName ?? "League History",
    generatedAt,
    managers: index.managers,
    seasons,
  };
}
