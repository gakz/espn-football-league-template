import type { Manager } from "@/lib/types";
import type { EspnLeague, EspnTeam } from "./types";
import { unwrapLeague } from "./client";

/**
 * Hand-editable identity map, committed at data/owners.json.
 *
 * Manager identity is the one thing the ESPN payload can't settle on its own.
 * Team names change every year, so managers are keyed by ESPN member GUID —
 * but GUIDs aren't perfect either: someone who lost their login and
 * re-registered shows up as a stranger. `aliases` merges those back together,
 * and `teamOverrides` handles the rest (a team that changed hands mid-league,
 * a co-managed team that should count for one person).
 */
export interface OwnersConfig {
  managers?: Record<string, { name?: string; slug?: string; aliases?: string[] }>;
  /** Keyed "<season>:<teamId>", value is the canonical GUID that team-season belongs to. */
  teamOverrides?: Record<string, string>;
}

/** ESPN writes GUIDs as `{ABC-123}` in some places and `ABC-123` in others. */
export function normalizeGuid(raw: string): string {
  return raw.trim().replace(/^\{|\}$/g, "").toUpperCase();
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "manager"
  );
}

export interface ManagerIndex {
  managers: Manager[];
  /** Maps any GUID (including aliases) to its canonical manager id. */
  resolve(guid: string): string;
  /** Resolves the managers responsible for a team-season, honouring overrides. */
  forTeam(seasonId: number, team: EspnTeam): string[];
}

export function buildManagerIndex(
  rawSeasons: unknown[],
  config: OwnersConfig = {},
): ManagerIndex {
  const aliasToCanonical = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(config.managers ?? {})) {
    const id = normalizeGuid(canonical);
    for (const alias of entry.aliases ?? []) {
      aliasToCanonical.set(normalizeGuid(alias), id);
    }
  }

  const teamNameToCanonical = new Map<string, string>();

  const resolveConfiguredAlias = (guid: string): string => {
    const id = normalizeGuid(guid);
    return aliasToCanonical.get(id) ?? id;
  };

  const resolve = (guid: string): string => {
    const id = resolveConfiguredAlias(guid);
    return teamNameToCanonical.get(id) ?? id;
  };

  const overrides = new Map<string, string>();
  for (const [key, guid] of Object.entries(config.teamOverrides ?? {})) {
    overrides.set(key, resolveConfiguredAlias(guid));
  }

  const ownersForTeam = (seasonId: number | undefined, team: EspnTeam): string[] => {
    const override =
      seasonId === undefined ? undefined : overrides.get(`${seasonId}:${team.id}`);
    if (override) return [override];

    const owners = (team.owners ?? []).map(resolveConfiguredAlias);
    // Put the primary owner first so a co-managed team has a stable ordering.
    const primary = team.primaryOwner ? resolveConfiguredAlias(team.primaryOwner) : undefined;
    const ordered = primary ? [primary, ...owners] : owners;
    return [...new Set(ordered)];
  };

  const teamName = (team: EspnTeam): string => {
    const combined =
      team.name?.trim() || [team.location, team.nickname].filter(Boolean).join(" ").trim();
    return combined || `Team ${team.id ?? "?"}`;
  };

  // The site displays fantasy team names, not ESPN account display names.
  // Later seasons win, so a renamed team shows its current name.
  const teamNames = new Map<string, string>();
  const accountNames = new Map<string, string>();
  const seen = new Set<string>();
  for (const raw of rawSeasons) {
    let league: EspnLeague;
    try {
      league = unwrapLeague(raw);
    } catch {
      continue;
    }
    for (const member of league.members ?? []) {
      if (!member.id) continue;
      const id = resolveConfiguredAlias(member.id);
      seen.add(id);
      const name =
        member.displayName?.trim() ||
        [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
      if (name) accountNames.set(id, name);
    }

    for (const team of league.teams ?? []) {
      for (const id of ownersForTeam(league.seasonId, team)) {
        seen.add(id);
        teamNames.set(id, teamName(team));
      }
    }
  }

  for (const id of Object.keys(config.managers ?? {})) seen.add(resolveConfiguredAlias(id));

  const displayNameFor = (id: string): string => {
    const override = config.managers?.[id] ?? config.managers?.[`{${id}}`];
    return override?.name ?? teamNames.get(id) ?? accountNames.get(id) ?? "Unknown team";
  };

  const displayGroups = new Map<string, string[]>();
  for (const id of seen) {
    const name = displayNameFor(id);
    displayGroups.set(name, [...(displayGroups.get(name) ?? []), id]);
  }

  // Once the UI is team-name based, duplicate display names should represent
  // one career. This folds co-owners and re-registered ESPN accounts that share
  // the same current team name before stats are computed.
  for (const ids of displayGroups.values()) {
    if (ids.length < 2) continue;
    const sorted = [...ids].sort();
    const configured = sorted.find((id) => config.managers?.[id] ?? config.managers?.[`{${id}}`]);
    const canonical = configured ?? sorted[0];
    for (const id of sorted) teamNameToCanonical.set(id, canonical);
  }

  const usedSlugs = new Set<string>();
  const managers: Manager[] = [...new Set([...seen].map(resolve))]
    .map((id) => {
      const name = displayNameFor(id);
      const override = config.managers?.[id] ?? config.managers?.[`{${id}}`];
      return { id, name, slug: override?.slug ?? slugify(name) };
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((manager) => {
      let slug = manager.slug;
      for (let n = 2; usedSlugs.has(slug); n++) slug = `${manager.slug}-${n}`;
      usedSlugs.add(slug);
      return { ...manager, slug };
    });

  const forTeam = (seasonId: number, team: EspnTeam): string[] => {
    const owners = ownersForTeam(seasonId, team).map(resolve);
    if (owners.length > 0) return owners;
    return [];
  };

  return { managers, resolve, forTeam };
}
