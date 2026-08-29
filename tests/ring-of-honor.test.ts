import { describe, expect, it } from "vitest";
import { buildManagerIndex } from "@/lib/espn/owners";
import { normalizeSeason } from "@/lib/espn/normalize";
import { managerCareers, type ManagerCareer } from "@/lib/stats";
import {
  positionAverages,
  ringOfHonorByManager,
  ringOfHonorForManager,
  type RingOfHonorConfig,
} from "@/lib/ring-of-honor";
import { emptyRecord, type LeagueData, type Season } from "@/lib/types";
import { fixtureOwnersConfig, makeLeagueFixture } from "@/fixtures/espn-fixture";

const fixture = makeLeagueFixture();
const index = buildManagerIndex(
  fixture.map((f) => f.payload),
  fixtureOwnersConfig,
);
const data: LeagueData = {
  leagueId: "999999",
  leagueName: "League of Doom",
  generatedAt: "2026-01-01T00:00:00.000Z",
  managers: index.managers,
  seasons: fixture.map((f) => normalizeSeason(f.payload, f.season, index)),
};

const careers = managerCareers(data);

describe("positionAverages", () => {
  it("matches a manually computed mean per position", () => {
    const season = data.seasons.find((s) => s.id === 2024)!;
    const averages = positionAverages(season);

    const byPosition = new Map<string, number[]>();
    for (const team of season.teams) {
      for (const entry of team.roster) {
        byPosition.set(entry.position, [...(byPosition.get(entry.position) ?? []), entry.seasonPoints]);
      }
    }

    expect(byPosition.size).toBeGreaterThan(0);
    for (const [position, values] of byPosition) {
      const expected = values.reduce((a, b) => a + b, 0) / values.length;
      expect(averages.get(position)).toBeCloseTo(expected, 6);
    }
  });
});

describe("ringOfHonorForManager — championship standout", () => {
  it("picks the champion roster's highest points-above-position-average entry, for every title", () => {
    let checked = 0;
    for (const career of careers) {
      for (const seasonId of career.championshipSeasons) {
        const season = data.seasons.find((s) => s.id === seasonId)!;
        const team = season.teams.find(
          (t) => t.teamId === season.championTeamId && t.managerIds.includes(career.manager.id),
        )!;
        if (team.roster.length === 0) continue;

        const averages = positionAverages(season);
        const expected = [...team.roster]
          .map((entry) => ({ ...entry, margin: entry.seasonPoints - (averages.get(entry.position) ?? 0) }))
          .sort((a, b) => b.margin - a.margin || a.playerName.localeCompare(b.playerName))[0];

        const entries = ringOfHonorForManager(data, career, {});
        const entry = entries.find((e) => e.playerId === expected.playerId);
        expect(entry, `${career.manager.name} ${seasonId}`).toBeDefined();
        expect(entry!.reasons.some((r) => r.includes(`in ${seasonId}`))).toBe(true);
        checked++;
      }
    }
    // Sanity: the fixture actually awards championships, so this loop isn't a no-op.
    expect(checked).toBeGreaterThan(0);
  });
});

describe("ringOfHonorForManager — long tenure", () => {
  it("credits every manager's Star with all 5 seasons", () => {
    for (const career of careers) {
      const entries = ringOfHonorForManager(data, career, {});
      const star = entries.find((e) => e.playerName.endsWith(" Star"));
      expect(star, career.manager.name).toBeDefined();
      expect(star!.seasonIds).toEqual([2016, 2017, 2021, 2024, 2025]);
      expect(star!.reasons.some((r) => r.includes("5 seasons"))).toBe(true);
    }
  });

  it("credits every manager's Depth with 3 non-consecutive seasons", () => {
    for (const career of careers) {
      const entries = ringOfHonorForManager(data, career, {});
      const depth = entries.find((e) => e.playerName.endsWith(" Depth"));
      expect(depth, career.manager.name).toBeDefined();
      expect(depth!.seasonIds).toEqual([2016, 2017, 2021]);
      expect(depth!.reasons.some((r) => r.includes("3 seasons"))).toBe(true);
    }
  });

  it("excludes Rookie, who was only rostered 2 seasons", () => {
    for (const career of careers) {
      const entries = ringOfHonorForManager(data, career, {});
      expect(entries.some((e) => e.playerName.endsWith(" Rookie"))).toBe(false);
    }
  });
});

describe("ringOfHonorForManager — manual entries", () => {
  it("adds a manual-only entry with no auto-suggested match", () => {
    const career = careers[0];
    const config: RingOfHonorConfig = {
      [career.manager.slug]: [
        { playerName: "Local Legend", note: "Broke the league's heart in the 2015 offseason." },
      ],
    };
    const entries = ringOfHonorForManager(data, career, config);
    const entry = entries.find((e) => e.playerName === "Local Legend");
    expect(entry).toBeDefined();
    expect(entry!.manual).toBe(true);
    expect(entry!.playerId).toBeNull();
    expect(entry!.note).toBe("Broke the league's heart in the 2015 offseason.");
  });

  it("merges a manual entry that matches an auto-suggested player by name", () => {
    const career = careers[0];
    const autoEntries = ringOfHonorForManager(data, career, {});
    const star = autoEntries.find((e) => e.playerName.endsWith(" Star"))!;

    const config: RingOfHonorConfig = {
      [career.manager.slug]: [{ playerName: `  ${star.playerName.toUpperCase()}  `, note: "Still the GOAT." }],
    };
    const merged = ringOfHonorForManager(data, career, config);
    const matches = merged.filter((e) => e.playerName === star.playerName);

    expect(matches).toHaveLength(1);
    expect(matches[0].manual).toBe(true);
    expect(matches[0].note).toBe("Still the GOAT.");
    expect(matches[0].reasons).toContain("Manual entry");
    expect(matches[0].reasons.length).toBeGreaterThan(1);
  });

  it("returns nothing for a manager with no roster history and no manual entries", () => {
    const fabricated: ManagerCareer = {
      ...careers[0],
      manager: { id: "NOBODY", slug: "nobody", name: "Nobody" },
      championshipSeasons: [],
    };
    expect(ringOfHonorForManager(data, fabricated, {})).toEqual([]);
  });
});

describe("ringOfHonorForManager — divergence from raw high score", () => {
  it("picks the position-relative standout, not just the highest raw scorer", () => {
    const manager = { id: "M1", slug: "champ", name: "Champ Manager" };
    const season: Season = {
      id: 2030,
      leagueName: "Test League",
      complete: true,
      regularSeasonWeeks: 1,
      playoffTeamCount: 0,
      championTeamId: 1,
      runnerUpTeamId: 2,
      games: [],
      teams: [
        {
          seasonId: 2030,
          teamId: 1,
          teamName: "Champs",
          abbrev: "CHA",
          logo: null,
          managerIds: [manager.id],
          regular: emptyRecord(),
          playoff: emptyRecord(),
          championship: emptyRecord(),
          finalRank: 1,
          playoffSeed: 1,
          madePlayoffs: true,
          roster: [
            // Highest raw score in the league, but the RB average is high too.
            { playerId: 1, playerName: "Champ RB", position: "RB", seasonPoints: 300 },
            // Far below the RB in raw points, but the K average is weak.
            { playerId: 2, playerName: "Champ K", position: "K", seasonPoints: 120 },
          ],
        },
        {
          seasonId: 2030,
          teamId: 2,
          teamName: "Runners",
          abbrev: "RUN",
          logo: null,
          managerIds: ["M2"],
          regular: emptyRecord(),
          playoff: emptyRecord(),
          championship: emptyRecord(),
          finalRank: 2,
          playoffSeed: 2,
          madePlayoffs: true,
          roster: [
            { playerId: 3, playerName: "Other RB", position: "RB", seasonPoints: 280 },
            { playerId: 4, playerName: "Other K", position: "K", seasonPoints: 40 },
          ],
        },
      ],
    };
    const divergenceData: LeagueData = {
      leagueId: "test",
      leagueName: "Test League",
      generatedAt: "2030-01-01T00:00:00.000Z",
      managers: [manager],
      seasons: [season],
    };
    const career: ManagerCareer = {
      manager,
      seasons: [],
      seasonsPlayed: 1,
      regular: emptyRecord(),
      playoff: emptyRecord(),
      championship: emptyRecord(),
      combined: emptyRecord(),
      allPlay: emptyRecord(),
      winPct: 0,
      allPlayWinPct: 0,
      pointsPerGame: 0,
      championships: 1,
      runnerUps: 0,
      playoffAppearances: 1,
      championshipAppearances: 1,
      bestSeason: null,
      worstSeason: null,
      highestWeek: null,
      lowestWeek: null,
      longestWinStreak: { length: 0, from: null, to: null },
      longestLoseStreak: { length: 0, from: null, to: null },
      championshipSeasons: [2030],
    };

    // RB margin: 300 - avg(300,280)=290 -> 10. K margin: 120 - avg(120,40)=80 -> 40.
    // The raw-score leader (RB) would win a naive "highest points" pick; the
    // relative-to-position metric should pick the K instead.
    const entries = ringOfHonorForManager(divergenceData, career, {});
    const standout = entries.find((e) => e.reasons.some((r) => r.includes("in 2030")));
    expect(standout?.playerName).toBe("Champ K");
  });
});

describe("ringOfHonorByManager", () => {
  it("keys the result by manager id and matches per-manager output", () => {
    const byManager = ringOfHonorByManager(data, careers, {});
    for (const career of careers) {
      expect(byManager.get(career.manager.id)).toEqual(ringOfHonorForManager(data, career, {}));
    }
  });
});
