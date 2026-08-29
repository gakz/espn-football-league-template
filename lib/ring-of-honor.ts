import type { LeagueData, Season } from "./types";
import type { ManagerCareer } from "./stats";

/**
 * Hand-editable Ring of Honor entries, committed at data/ring-of-honor.json.
 *
 * Keyed by manager SLUG, not GUID — someone curating this is looking at the
 * live team page (/managers/<slug>) and typing what they see in the URL, not
 * digging a GUID out of the network tab the way data/owners.json requires.
 * The tradeoff: a manager's slug must stay stable once they have entries here.
 * If a team's display name is likely to change, pin the slug in
 * data/owners.json's `managers.<guid>.slug` first, or a later auto-generated
 * slug change will silently orphan these entries.
 */
export interface ManualRingOfHonorEntry {
  /** Human-typed — there's no ESPN playerId to key a manual entry off of. */
  playerName: string;
  note?: string;
  seasonId?: number;
  position?: string;
}

export type RingOfHonorConfig = Record<string, ManualRingOfHonorEntry[]>;

export interface RingOfHonorEntry {
  /** null for a manual-only entry with no matching roster snapshot. */
  playerId: number | null;
  playerName: string;
  position: string | null;
  /** Every season this player is known to have been on the roster, ascending. */
  seasonIds: number[];
  /** Human-readable reasons this player is in the Ring of Honor. */
  reasons: string[];
  note?: string;
  /** True if a manual config entry contributed to this player's inclusion. */
  manual: boolean;
}

/**
 * Mean seasonPoints per position across every rostered player in a season.
 * Exported so tests can compute an expected value independently rather than
 * hardcoding one — the same reason lib/stats.ts exports allPlayBySeasonTeam.
 */
export function positionAverages(season: Season): Map<string, number> {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const team of season.teams) {
    for (const entry of team.roster) {
      const bucket = totals.get(entry.position) ?? { sum: 0, count: 0 };
      bucket.sum += entry.seasonPoints;
      bucket.count += 1;
      totals.set(entry.position, bucket);
    }
  }
  return new Map([...totals].map(([position, { sum, count }]) => [position, sum / count]));
}

interface Draft {
  playerId: number | null;
  playerName: string;
  position: string | null;
  seasonIds: Set<number>;
  reasons: string[];
  note?: string;
  manual: boolean;
}

const dedupeKey = (playerName: string): string => playerName.trim().toLowerCase();

/** Creates or updates a player's draft entry, keyed by normalized name. */
function upsert(
  drafts: Map<string, Draft>,
  key: string,
  base: Omit<Draft, "seasonIds" | "reasons">,
  seasonId: number | undefined,
  reason: string,
): Draft {
  const existing = drafts.get(key);
  if (existing) {
    existing.reasons.push(reason);
    if (seasonId !== undefined) existing.seasonIds.add(seasonId);
    if (base.playerId !== null) existing.playerId = base.playerId;
    if (base.position !== null) existing.position = base.position;
    if (base.note !== undefined) existing.note = base.note;
    if (base.manual) existing.manual = true;
    return existing;
  }
  const draft: Draft = { ...base, seasonIds: new Set(seasonId !== undefined ? [seasonId] : []), reasons: [reason] };
  drafts.set(key, draft);
  return draft;
}

/**
 * A team's championship-winning roster's standout player, measured relative
 * to their position — "points above the league-wide average for that
 * position that season" — rather than raw points, since a raw-points pick
 * would almost always be a QB or RB in most scoring formats.
 *
 * Built on each season's final roster snapshot (see RosterEntry's doc
 * comment): a player added and dropped mid-season before that snapshot won't
 * be considered.
 */
function championshipStandouts(data: LeagueData, career: ManagerCareer) {
  const results: Array<{
    seasonId: number;
    playerId: number;
    playerName: string;
    position: string;
    margin: number;
  }> = [];

  for (const seasonId of career.championshipSeasons) {
    const season = data.seasons.find((s) => s.id === seasonId);
    if (!season) continue;
    const team = season.teams.find(
      (t) => t.teamId === season.championTeamId && t.managerIds.includes(career.manager.id),
    );
    if (!team || team.roster.length === 0) continue;

    const averages = positionAverages(season);
    const best = [...team.roster]
      .map((entry) => ({ ...entry, margin: entry.seasonPoints - (averages.get(entry.position) ?? 0) }))
      .sort((a, b) => b.margin - a.margin || a.playerName.localeCompare(b.playerName))[0];

    results.push({
      seasonId,
      playerId: best.playerId,
      playerName: best.playerName,
      position: best.position,
      margin: best.margin,
    });
  }

  return results;
}

/** Every player on this manager's teams across history who was rostered 3+ seasons. */
function longTenurePlayers(data: LeagueData, career: ManagerCareer) {
  const byName = new Map<
    string,
    { playerId: number; playerName: string; position: string; seasonIds: Set<number> }
  >();

  for (const season of data.seasons) {
    for (const team of season.teams) {
      if (!team.managerIds.includes(career.manager.id)) continue;
      for (const entry of team.roster) {
        const key = dedupeKey(entry.playerName);
        const existing = byName.get(key);
        if (existing) {
          existing.seasonIds.add(season.id);
          // Later seasons win for identity fields, same convention as
          // lib/espn/owners.ts's team-name resolution.
          existing.playerId = entry.playerId;
          existing.position = entry.position;
        } else {
          byName.set(key, {
            playerId: entry.playerId,
            playerName: entry.playerName,
            position: entry.position,
            seasonIds: new Set([season.id]),
          });
        }
      }
    }
  }

  return [...byName.values()]
    .filter((p) => p.seasonIds.size >= 3)
    .map((p) => ({ ...p, seasonIds: [...p.seasonIds].sort((a, b) => a - b) }));
}

export function ringOfHonorForManager(
  data: LeagueData,
  career: ManagerCareer,
  config: RingOfHonorConfig,
): RingOfHonorEntry[] {
  const drafts = new Map<string, Draft>();

  for (const standout of championshipStandouts(data, career)) {
    upsert(
      drafts,
      dedupeKey(standout.playerName),
      { playerId: standout.playerId, playerName: standout.playerName, position: standout.position, manual: false },
      standout.seasonId,
      `${standout.margin.toFixed(1)} pts above the average ${standout.position} in ${standout.seasonId}`,
    );
  }

  for (const player of longTenurePlayers(data, career)) {
    const key = dedupeKey(player.playerName);
    const reason = `On the roster for ${player.seasonIds.length} seasons (${player.seasonIds.join(", ")})`;
    const draft = upsert(
      drafts,
      key,
      { playerId: player.playerId, playerName: player.playerName, position: player.position, manual: false },
      undefined,
      reason,
    );
    // Tenure spans several seasons at once, unlike the single-season reasons
    // above, so record all of them rather than just the one `upsert` took.
    for (const seasonId of player.seasonIds) draft.seasonIds.add(seasonId);
  }

  for (const manual of config[career.manager.slug] ?? []) {
    upsert(
      drafts,
      dedupeKey(manual.playerName),
      { playerId: null, playerName: manual.playerName, position: manual.position ?? null, manual: true, note: manual.note },
      manual.seasonId,
      "Manual entry",
    );
  }

  return [...drafts.values()]
    .map(
      (draft): RingOfHonorEntry => ({
        playerId: draft.playerId,
        playerName: draft.playerName,
        position: draft.position,
        seasonIds: [...draft.seasonIds].sort((a, b) => a - b),
        reasons: draft.reasons,
        note: draft.note,
        manual: draft.manual,
      }),
    )
    .sort(
      (a, b) =>
        (a.seasonIds[0] ?? Infinity) - (b.seasonIds[0] ?? Infinity) || a.playerName.localeCompare(b.playerName),
    );
}

export function ringOfHonorByManager(
  data: LeagueData,
  careers: ManagerCareer[],
  config: RingOfHonorConfig,
): Map<string, RingOfHonorEntry[]> {
  return new Map(careers.map((career) => [career.manager.id, ringOfHonorForManager(data, career, config)]));
}
