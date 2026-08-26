import { describe, expect, it } from "vitest";
import { buildManagerIndex, normalizeGuid, slugify } from "@/lib/espn/owners";
import { normalizeSeason } from "@/lib/espn/normalize";
import { gamesPlayed } from "@/lib/types";
import {
  GUIDS,
  fixtureOwnersConfig,
  makeLeagueFixture,
  makeSeason,
} from "@/fixtures/espn-fixture";

const fixture = makeLeagueFixture();
const payloads = fixture.map((f) => f.payload);
const index = buildManagerIndex(payloads, fixtureOwnersConfig);
const seasons = fixture.map((f) => normalizeSeason(f.payload, f.season, index));
const bySeason = new Map(seasons.map((s) => [s.id, s]));

describe("guid handling", () => {
  it("strips braces and upper-cases", () => {
    expect(normalizeGuid("{abc-123}")).toBe("ABC-123");
    expect(normalizeGuid("abc-123")).toBe("ABC-123");
  });
});

describe("slugify", () => {
  it("produces url-safe slugs", () => {
    expect(slugify("Dave Lindqvist")).toBe("dave-lindqvist");
    expect(slugify("  O'Brien-Smith  ")).toBe("o-brien-smith");
  });

  it("falls back rather than returning an empty slug", () => {
    expect(slugify("!!!")).toBe("manager");
  });
});

describe("manager index", () => {
  it("merges a manager's second ESPN account into one identity", () => {
    const canonical = normalizeGuid(GUIDS.dave);
    expect(index.resolve(GUIDS.daveSecondAccount)).toBe(canonical);
    expect(index.managers.filter((m) => m.name === "Dave Lindqvist")).toHaveLength(1);
  });

  it("gives every manager a unique slug", () => {
    const slugs = index.managers.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("finds exactly the six fixture managers", () => {
    expect(index.managers).toHaveLength(6);
  });
});

describe("normalizeSeason", () => {
  it("reads the array-wrapped pre-2018 payload", () => {
    const season = bySeason.get(2016)!;
    expect(season.id).toBe(2016);
    expect(season.teams).toHaveLength(6);
  });

  it("joins location and nickname for archive seasons and uses name for modern ones", () => {
    expect(bySeason.get(2016)!.teams.find((t) => t.teamId === 1)!.teamName).toBe(
      "Gridiron Gremlins",
    );
    expect(bySeason.get(2024)!.teams.find((t) => t.teamId === 1)!.teamName).toBe(
      "Gridiron Gremlins",
    );
  });

  it("tracks a team that was renamed between seasons, keyed by the same manager", () => {
    const carol = index.resolve(GUIDS.carol);
    const older = bySeason.get(2017)!.teams.find((t) => t.managerIds.includes(carol))!;
    const newer = bySeason.get(2024)!.teams.find((t) => t.managerIds.includes(carol))!;
    expect(older.teamName).toBe("Bayside Bandits");
    expect(newer.teamName).toBe("Bayside Buccaneers");
  });

  it("keeps consolation games out of both the regular and playoff records", () => {
    const season = bySeason.get(2024)!;
    const consolation = season.games.filter((g) => g.kind === "CONSOLATION");
    expect(consolation.length).toBeGreaterThan(0);

    for (const team of season.teams) {
      const regularWeeks = season.regularSeasonWeeks;
      expect(gamesPlayed(team.regular)).toBeLessThanOrEqual(regularWeeks);
    }

    // Every team plays each regular week, so regular-season games == weeks.
    const totalRegular = season.games.filter((g) => g.kind === "REGULAR").length;
    expect(totalRegular).toBe(season.regularSeasonWeeks * (season.teams.length / 2));
  });

  it("classifies the bracket as playoff games", () => {
    const season = bySeason.get(2024)!;
    expect(season.games.some((g) => g.kind === "PLAYOFF")).toBe(true);
  });

  it("drops UNDECIDED matchups from an in-progress season", () => {
    const season = bySeason.get(2025)!;
    expect(season.games.every((g) => g.week <= season.regularSeasonWeeks - 2)).toBe(true);
    expect(season.complete).toBe(false);
    expect(season.championTeamId).toBeNull();
  });

  it("ignores a playoff bye, which has no away side", () => {
    const payload = makeSeason({
      season: 2019,
      teams: [
        { id: 1, location: "A", nickname: "Alphas", abbrev: "A", owner: GUIDS.alice, strength: 3 },
        { id: 2, location: "B", nickname: "Betas", abbrev: "B", owner: GUIDS.bob, strength: 2 },
        { id: 3, location: "C", nickname: "Gammas", abbrev: "C", owner: GUIDS.carol, strength: 1 },
        { id: 4, location: "D", nickname: "Deltas", abbrev: "D", owner: GUIDS.dave, strength: 0 },
      ],
      playoffTeamCount: 3,
    });
    const localIndex = buildManagerIndex([payload]);
    const season = normalizeSeason(payload, 2019, localIndex);
    // The bye matchup carries no opponent, so it must not become a game.
    for (const game of season.games) {
      expect(game.awayTeamId).toBeGreaterThan(0);
      expect(game.homeTeamId).toBeGreaterThan(0);
    }
  });

  it("records a tie for both teams", () => {
    const season = bySeason.get(2016)!;
    const tie = season.games.find((g) => g.winner === "TIE");
    expect(tie).toBeDefined();
    const home = season.teams.find((t) => t.teamId === tie!.homeTeamId)!;
    const away = season.teams.find((t) => t.teamId === tie!.awayTeamId)!;
    expect(home.regular.ties).toBe(1);
    expect(away.regular.ties).toBe(1);
  });

  it("crowns a champion from the bracket when rankCalculatedFinal is absent", () => {
    const archive = bySeason.get(2016)!;
    // The pre-2018 fixture omits final ranks, matching the real archive.
    expect(archive.championTeamId).not.toBeNull();
    expect(archive.runnerUpTeamId).not.toBeNull();
    expect(archive.championTeamId).not.toBe(archive.runnerUpTeamId);
    expect(archive.complete).toBe(true);
  });

  it("prefers ESPN's final ranking when it is present", () => {
    const modern = bySeason.get(2024)!;
    const ranked = modern.teams.find((t) => t.finalRank === 1)!;
    expect(modern.championTeamId).toBe(ranked.teamId);
  });

  it("marks the playoff field as having made the playoffs", () => {
    const season = bySeason.get(2024)!;
    expect(season.teams.filter((t) => t.madePlayoffs)).toHaveLength(season.playoffTeamCount);
  });

  it("reads league settings", () => {
    const season = bySeason.get(2024)!;
    expect(season.leagueName).toBe("League of Doom");
    expect(season.regularSeasonWeeks).toBe(6);
    expect(season.playoffTeamCount).toBe(4);
  });

  it("balances points for against points against across the league", () => {
    for (const season of seasons) {
      const pf = season.teams.reduce((s, t) => s + t.regular.pointsFor + t.playoff.pointsFor, 0);
      const pa = season.teams.reduce(
        (s, t) => s + t.regular.pointsAgainst + t.playoff.pointsAgainst,
        0,
      );
      expect(pf).toBeCloseTo(pa, 6);
    }
  });

  it("balances wins against losses across the league", () => {
    for (const season of seasons) {
      const wins = season.teams.reduce((s, t) => s + t.regular.wins + t.playoff.wins, 0);
      const losses = season.teams.reduce((s, t) => s + t.regular.losses + t.playoff.losses, 0);
      expect(wins).toBe(losses);
    }
  });
});

describe("winner resolution", () => {
  const league = (winner: string, homeScore: number, awayScore: number) => ({
    seasonId: 2024,
    settings: { name: "L", scheduleSettings: { matchupPeriodCount: 1, playoffTeamCount: 2 } },
    members: [{ id: GUIDS.alice, displayName: "Alice" }, { id: GUIDS.bob, displayName: "Bob" }],
    teams: [
      { id: 1, name: "A", owners: [GUIDS.alice], primaryOwner: GUIDS.alice },
      { id: 2, name: "B", owners: [GUIDS.bob], primaryOwner: GUIDS.bob },
    ],
    schedule: [
      {
        id: 1,
        matchupPeriodId: 1,
        playoffTierType: "NONE",
        home: { teamId: 1, totalPoints: homeScore },
        away: { teamId: 2, totalPoints: awayScore },
        winner,
      },
    ],
  });

  it("trusts ESPN's winner field over the scores", () => {
    // ESPN is the authority here: a stat correction applied after the fact can
    // leave the declared winner disagreeing with the points shown.
    const payload = league("HOME", 90, 120);
    const season = normalizeSeason(payload, 2024, buildManagerIndex([payload]));
    expect(season.games[0].winner).toBe("HOME");
    expect(season.teams.find((t) => t.teamId === 1)!.regular.wins).toBe(1);
    expect(season.teams.find((t) => t.teamId === 2)!.regular.losses).toBe(1);
  });

  it("falls back to the scores when the winner field is unrecognised", () => {
    const payload = league("UNKNOWN_VALUE", 90, 120);
    const season = normalizeSeason(payload, 2024, buildManagerIndex([payload]));
    expect(season.games[0].winner).toBe("AWAY");
  });
});

describe("playoff appearances", () => {
  it("does not credit an appearance from projected seeding mid-season", () => {
    const season = bySeason.get(2025)!;
    expect(season.complete).toBe(false);
    // ESPN still publishes a playoffSeed while the season is running; it must
    // not be read as "made the playoffs".
    expect(season.teams.some((t) => t.playoffSeed !== null && t.playoffSeed > 0)).toBe(true);
    expect(season.teams.every((t) => !t.madePlayoffs)).toBe(true);
  });

  it("credits the playoff field of every finished season", () => {
    for (const season of seasons.filter((s) => s.complete)) {
      expect(season.teams.filter((t) => t.madePlayoffs)).toHaveLength(season.playoffTeamCount);
    }
  });
});
