import { describe, expect, it } from "vitest";
import { buildManagerIndex } from "@/lib/espn/owners";
import { normalizeSeason } from "@/lib/espn/normalize";
import {
  allPlayBySeasonTeam,
  leagueSummary,
  managerCareers,
  recordBook,
  weeklyScores,
} from "@/lib/stats";
import { gamesPlayed, winPct, type LeagueData } from "@/lib/types";
import { GUIDS, fixtureOwnersConfig, makeLeagueFixture } from "@/fixtures/espn-fixture";

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
const summary = leagueSummary(data, careers);

describe("weeklyScores", () => {
  it("emits two rows per game", () => {
    const games = data.seasons.reduce((n, s) => n + s.games.length, 0);
    expect(weeklyScores(data.seasons)).toHaveLength(games * 2);
  });

  it("pairs each row with its opponent's score", () => {
    for (const row of weeklyScores(data.seasons)) {
      expect(row.teamId).not.toBe(row.opponentTeamId);
      if (row.result === "W") expect(row.points).toBeGreaterThanOrEqual(row.opponentPoints);
      if (row.result === "L") expect(row.points).toBeLessThanOrEqual(row.opponentPoints);
      if (row.result === "T") expect(row.points).toBeCloseTo(row.opponentPoints, 6);
    }
  });
});

describe("allPlay", () => {
  it("gives every team the same number of all-play games", () => {
    const season = data.seasons.find((s) => s.id === 2024)!;
    const allPlay = allPlayBySeasonTeam(season);
    const counts = [...allPlay.values()].map(gamesPlayed);
    expect(new Set(counts).size).toBe(1);
    // Each team faces the other five, every regular week.
    expect(counts[0]).toBe(season.regularSeasonWeeks * (season.teams.length - 1));
  });

  it("is zero-sum across the league", () => {
    const allPlay = allPlayBySeasonTeam(data.seasons.find((s) => s.id === 2024)!);
    const wins = [...allPlay.values()].reduce((s, r) => s + r.wins, 0);
    const losses = [...allPlay.values()].reduce((s, r) => s + r.losses, 0);
    expect(wins).toBe(losses);
  });

  it("ranks the week's top scorer undefeated for that week", () => {
    const season = data.seasons.find((s) => s.id === 2024)!;
    const week1 = season.games.filter((g) => g.kind === "REGULAR" && g.week === 1);
    const scores = week1.flatMap((g) => [
      { teamId: g.homeTeamId, points: g.homeScore },
      { teamId: g.awayTeamId, points: g.awayScore },
    ]);
    const top = scores.sort((a, b) => b.points - a.points)[0];
    const single = allPlayBySeasonTeam({ ...season, games: week1 });
    expect(single.get(top.teamId)!.losses).toBe(0);
    expect(single.get(top.teamId)!.wins).toBe(scores.length - 1);
  });
});

describe("managerCareers", () => {
  it("covers every manager who played", () => {
    expect(careers).toHaveLength(6);
  });

  it("counts a re-registered manager's seasons as one career", () => {
    const dave = careers.find((c) => c.manager.name === "Dave Lindqvist")!;
    // 2016, 2017 under the original account; 2021, 2024, 2025 under the second.
    expect(dave.seasonsPlayed).toBe(5);
    expect(dave.seasons.map((s) => s.seasonId)).toEqual([2016, 2017, 2021, 2024, 2025]);
  });

  it("totals each career to the sum of its seasons", () => {
    for (const career of careers) {
      const wins = career.seasons.reduce((s, l) => s + l.regular.wins + l.playoff.wins, 0);
      expect(career.combined.wins).toBe(wins);
      const pf = career.seasons.reduce((s, l) => s + l.combined.pointsFor, 0);
      expect(career.combined.pointsFor).toBeCloseTo(pf, 6);
    }
  });

  it("balances wins and losses across all careers", () => {
    const wins = careers.reduce((s, c) => s + c.combined.wins, 0);
    const losses = careers.reduce((s, c) => s + c.combined.losses, 0);
    expect(wins).toBe(losses);
  });

  it("awards exactly one championship per completed season", () => {
    const titles = careers.reduce((s, c) => s + c.championships, 0);
    const completed = data.seasons.filter((s) => s.complete).length;
    expect(titles).toBe(completed);
    expect(completed).toBe(4);
  });

  it("computes win percentage with ties as half a win", () => {
    for (const career of careers) {
      expect(career.winPct).toBeCloseTo(winPct(career.combined), 10);
    }
  });

  it("picks the best season by regular-season win rate", () => {
    for (const career of careers) {
      if (!career.bestSeason || !career.worstSeason) continue;
      expect(winPct(career.bestSeason.regular)).toBeGreaterThanOrEqual(
        winPct(career.worstSeason.regular),
      );
      for (const line of career.seasons) {
        if (gamesPlayed(line.regular) === 0) continue;
        expect(winPct(career.bestSeason.regular)).toBeGreaterThanOrEqual(winPct(line.regular));
      }
    }
  });

  it("finds each manager's highest and lowest scoring weeks", () => {
    for (const career of careers) {
      expect(career.highestWeek).not.toBeNull();
      expect(career.highestWeek!.points).toBeGreaterThanOrEqual(career.lowestWeek!.points);
    }
  });

  it("never counts a consolation game toward a streak", () => {
    const season = data.seasons.find((s) => s.id === 2024)!;
    const consolation = season.games.filter((g) => g.kind === "CONSOLATION");
    expect(consolation.length).toBeGreaterThan(0);
    for (const career of careers) {
      const played = career.seasons.reduce((n, l) => n + gamesPlayed(l.combined), 0);
      expect(career.longestWinStreak.length).toBeLessThanOrEqual(played);
    }
  });

  it("reports a streak that is at most the games played", () => {
    for (const career of careers) {
      const played = career.combined.wins + career.combined.losses + career.combined.ties;
      expect(career.longestWinStreak.length).toBeLessThanOrEqual(played);
      expect(career.longestLoseStreak.length).toBeLessThanOrEqual(played);
      if (career.combined.wins > 0) expect(career.longestWinStreak.length).toBeGreaterThan(0);
    }
  });

  it("sorts champions to the top of the all-time table", () => {
    for (let i = 1; i < careers.length; i++) {
      expect(careers[i - 1].championships).toBeGreaterThanOrEqual(careers[i].championships);
    }
  });

  it("excludes a team that never played a game", () => {
    const withGhost: LeagueData = {
      ...data,
      seasons: data.seasons.map((s) =>
        s.id === 2024
          ? {
              ...s,
              teams: [
                ...s.teams,
                {
                  seasonId: 2024,
                  teamId: 99,
                  teamName: "Abandoned Slot",
                  abbrev: "GHO",
                  logo: null,
                  managerIds: [index.resolve(GUIDS.alice)],
                  regular: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
                  playoff: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
                  finalRank: null,
                  playoffSeed: null,
                  madePlayoffs: false,
                },
              ],
            }
          : s,
      ),
    };
    const alice = managerCareers(withGhost).find((c) => c.manager.name === "Alice Nakamura")!;
    expect(alice.seasons.some((s) => s.teamName === "Abandoned Slot")).toBe(false);
  });
});

describe("leagueSummary", () => {
  it("spans the fixture's seasons", () => {
    expect(summary.firstSeason).toBe(2016);
    expect(summary.lastSeason).toBe(2025);
    expect(summary.seasonsPlayed).toBe(5);
    expect(summary.managerCount).toBe(6);
  });

  it("lists champions newest first, one per completed season", () => {
    expect(summary.champions).toHaveLength(4);
    const years = summary.champions.map((c) => c.seasonId);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });
});

describe("recordBook", () => {
  const book = recordBook(data, careers);
  const find = (label: string) => book.find((e) => e.label === label);

  it("produces the headline records", () => {
    for (const label of [
      "Highest score",
      "Lowest score",
      "Biggest blowout",
      "Closest game",
      "Most points in a loss",
      "Fewest points in a win",
      "Best regular season",
      "Worst regular season",
      "Longest win streak",
      "Longest losing streak",
    ]) {
      expect(find(label), label).toBeDefined();
    }
  });

  it("makes the highest score the highest non-consolation score in the league", () => {
    const rows = weeklyScores(data.seasons).filter((r) => r.kind !== "CONSOLATION");
    const max = Math.max(...rows.map((r) => r.points));
    expect(Number(find("Highest score")!.value)).toBeCloseTo(max, 2);
  });

  it("makes the closest game margin no larger than the biggest blowout", () => {
    expect(Number(find("Closest game")!.value)).toBeLessThanOrEqual(
      Number(find("Biggest blowout")!.value),
    );
  });

  it("attributes every record to a real manager", () => {
    for (const entry of book) {
      expect(entry.managerIds.length).toBeGreaterThan(0);
      for (const id of entry.managerIds) {
        expect(data.managers.some((m) => m.id === id)).toBe(true);
      }
    }
  });

  it("returns nothing rather than throwing on an empty league", () => {
    const empty: LeagueData = { ...data, seasons: [] };
    expect(recordBook(empty, managerCareers(empty))).toEqual([]);
  });
});
