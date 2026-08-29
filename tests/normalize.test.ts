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

  it("uses latest team names as default display names", () => {
    expect(index.managers.find((m) => m.id === normalizeGuid(GUIDS.alice))?.name).toBe(
      "Gridiron Gremlins",
    );
    expect(index.managers.find((m) => m.id === normalizeGuid(GUIDS.carol))?.name).toBe(
      "Bayside Buccaneers",
    );
  });

  it("collapses duplicate team display names into one career identity", () => {
    const local = buildManagerIndex([
      {
        seasonId: 2024,
        teams: [{ id: 1, name: "Downtown Plowtown", owners: [GUIDS.alice] }],
      },
      {
        seasonId: 2025,
        teams: [{ id: 1, name: "Downtown Plowtown", owners: [GUIDS.bob] }],
      },
    ]);

    expect(local.managers).toHaveLength(1);
    expect(local.managers[0].name).toBe("Downtown Plowtown");
    expect(local.resolve(GUIDS.alice)).toBe(local.resolve(GUIDS.bob));
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

  it("marks exactly one playoff game per finished season as the championship", () => {
    for (const season of seasons.filter((s) => s.complete)) {
      const championshipGames = season.games.filter((g) => g.isChampionship);
      expect(championshipGames).toHaveLength(1);
      expect(championshipGames[0].kind).toBe("PLAYOFF");
    }
  });

  it("credits the championship record to only the two teams in the title game", () => {
    const season = bySeason.get(2024)!;
    const final = season.games.find((g) => g.isChampionship)!;
    for (const team of season.teams) {
      const played = gamesPlayed(team.championship);
      if (team.teamId === final.homeTeamId || team.teamId === final.awayTeamId) {
        expect(played).toBe(1);
      } else {
        expect(played).toBe(0);
      }
    }
    const champion = season.teams.find((t) => t.teamId === season.championTeamId)!;
    const runnerUp = season.teams.find((t) => t.teamId === season.runnerUpTeamId)!;
    expect(champion.championship.wins).toBe(1);
    expect(runnerUp.championship.losses).toBe(1);
  });

  it("keeps the championship record a subset of the playoff record", () => {
    for (const season of seasons.filter((s) => s.complete)) {
      for (const team of season.teams) {
        expect(gamesPlayed(team.championship)).toBeLessThanOrEqual(gamesPlayed(team.playoff));
        expect(team.championship.wins).toBeLessThanOrEqual(team.playoff.wins);
      }
    }
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

describe("roster", () => {
  it("includes the fixture's roster with position and season points", () => {
    // Team 1 (Gridiron Gremlins, strength 3): Star (RB) and Rookie (TE) are the
    // only slots rostered in 2024 — Depth only appears in 2016/2017/2021.
    const team = bySeason.get(2024)!.teams.find((t) => t.teamId === 1)!;
    const byName = new Map(team.roster.map((r) => [r.playerName, r]));
    expect([...byName.keys()].sort()).toEqual(["GRE Rookie", "GRE Star"]);
    expect(byName.get("GRE Star")).toMatchObject({ position: "RB", seasonPoints: 150 + 20 * 3 });
    expect(byName.get("GRE Rookie")).toMatchObject({ position: "TE", seasonPoints: 30 + 5 * 3 });
  });

  it("only rosters Depth in the seasons it was kept", () => {
    const team1 = (seasonId: number) => bySeason.get(seasonId)!.teams.find((t) => t.teamId === 1)!;
    expect(team1(2016).roster.some((r) => r.playerName === "GRE Depth")).toBe(true);
    expect(team1(2017).roster.some((r) => r.playerName === "GRE Depth")).toBe(true);
    expect(team1(2021).roster.some((r) => r.playerName === "GRE Depth")).toBe(true);
    expect(team1(2024).roster.some((r) => r.playerName === "GRE Depth")).toBe(false);
  });

  it("falls back to UNKNOWN for a position id it doesn't recognize", () => {
    const payload = {
      seasonId: 2024,
      settings: { name: "L", scheduleSettings: { matchupPeriodCount: 1, playoffTeamCount: 2 } },
      members: [{ id: GUIDS.alice, displayName: "Alice" }, { id: GUIDS.bob, displayName: "Bob" }],
      teams: [
        {
          id: 1,
          name: "A",
          owners: [GUIDS.alice],
          primaryOwner: GUIDS.alice,
          roster: {
            entries: [
              {
                playerId: 501,
                playerPoolEntry: {
                  player: { id: 501, fullName: "Mystery Player", defaultPositionId: 999 },
                  appliedStatTotal: 42,
                },
              },
            ],
          },
        },
        { id: 2, name: "B", owners: [GUIDS.bob], primaryOwner: GUIDS.bob },
      ],
      schedule: [],
    };
    const season = normalizeSeason(payload, 2024, buildManagerIndex([payload]));
    const team = season.teams.find((t) => t.teamId === 1)!;
    expect(team.roster).toEqual([
      { playerId: 501, playerName: "Mystery Player", position: "UNKNOWN", seasonPoints: 42 },
    ]);
  });

  it("defaults to an empty roster when ESPN's payload has no roster key at all", () => {
    const payload = {
      seasonId: 2024,
      settings: { name: "L", scheduleSettings: { matchupPeriodCount: 1, playoffTeamCount: 2 } },
      members: [{ id: GUIDS.alice, displayName: "Alice" }, { id: GUIDS.bob, displayName: "Bob" }],
      teams: [
        { id: 1, name: "A", owners: [GUIDS.alice], primaryOwner: GUIDS.alice },
        { id: 2, name: "B", owners: [GUIDS.bob], primaryOwner: GUIDS.bob },
      ],
      schedule: [],
    };
    const season = normalizeSeason(payload, 2024, buildManagerIndex([payload]));
    expect(season.teams.every((t) => t.roster.length === 0)).toBe(true);
  });
});
