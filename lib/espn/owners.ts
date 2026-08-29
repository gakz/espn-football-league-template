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

  const resolve = (guid: string): string => {
    const id = normalizeGuid(guid);
    return aliasToCanonical.get(id) ?? id;
  };

  const overrides = new Map<string, string>();
  for (const [key, guid] of Object.entries(config.teamOverrides ?? {})) {
    overrides.set(key, resolve(guid));
  }

  const ownersForTeam = (seasonId: number | undefined, team: EspnTeam): string[] => {
    const override =
      seasonId === undefined ? undefined : overrides.get(`${seasonId}:${team.id}`);
    if (override) return [override];

    const owners = (team.owners ?? []).map(resolve);
    // Put the primary owner first so a co-managed team has a stable ordering.
    const primary = team.primaryOwner ? resolve(team.primaryOwner) : undefined;
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
      const id = resolve(member.id);
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

  for (const id of Object.keys(config.managers ?? {})) seen.add(normalizeGuid(id));

  const usedSlugs = new Set<string>();
  const managers: Manager[] = [...seen]
    .map((id) => {
      const override = config.managers?.[id] ?? config.managers?.[`{${id}}`];
      const name = override?.name ?? teamNames.get(id) ?? accountNames.get(id) ?? "Unknown team";
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
    const owners = ownersForTeam(seasonId, team);
    if (owners.length > 0) return owners;
    return [];
  };

  return { managers, resolve, forTeam };
}
