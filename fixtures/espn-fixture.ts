/**
 * Deterministic stand-ins for ESPN league payloads.
 *
 * ESPN is unreachable from CI (and from the sandbox this was built in), so the
 * normalizer and the record book are tested against these instead. They're
 * built to reproduce the awkward parts of the real archive rather than a clean
 * happy path: pre-2018 seasons arrive array-wrapped with `location`/`nickname`
 * and no `playoffTierType`, modern seasons arrive as an object with `name` and
 * a full bracket, and an in-progress season has UNDECIDED weeks.
 */

export const GUIDS = {
  alice: "{AAAAAAAA-0000-0000-0000-000000000001}",
  bob: "{BBBBBBBB-0000-0000-0000-000000000002}",
  carol: "{CCCCCCCC-0000-0000-0000-000000000003}",
  dave: "{DDDDDDDD-0000-0000-0000-000000000004}",
  erin: "{EEEEEEEE-0000-0000-0000-000000000005}",
  frank: "{FFFFFFFF-0000-0000-0000-000000000006}",
  /** Dave lost his login and re-registered in 2021 — merged via an alias. */
  daveSecondAccount: "{DDDDDDDD-0000-0000-0000-00000000DD02}",
} as const;

/** Small deterministic PRNG so fixture scores never shift between runs. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export interface FixtureTeam {
  id: number;
  location: string;
  nickname: string;
  abbrev: string;
  owner: string;
  strength: number;
}

export interface SeasonFixtureOptions {
  season: number;
  teams: FixtureTeam[];
  regularSeasonWeeks?: number;
  playoffTeamCount?: number;
  /** Leaves the playoffs unplayed and the last regular weeks UNDECIDED. */
  inProgress?: boolean;
  /** Modern payloads set rankCalculatedFinal; the pre-2018 archive usually doesn't. */
  includeFinalRanks?: boolean;
  leagueName?: string;
}

const FIRST_MODERN_SEASON = 2018;

export function makeSeason(options: SeasonFixtureOptions): unknown {
  const {
    season,
    teams,
    regularSeasonWeeks = 6,
    playoffTeamCount = 4,
    inProgress = false,
    includeFinalRanks = season >= FIRST_MODERN_SEASON,
    leagueName = "League of Doom",
  } = options;

  const modern = season >= FIRST_MODERN_SEASON;
  const random = rng(season * 7919);
  const score = (team: FixtureTeam) => Math.round((70 + team.strength * 12 + random() * 55) * 100) / 100;

  const schedule: Record<string, unknown>[] = [];
  const totals = new Map<number, { w: number; l: number; t: number; pf: number; pa: number }>();
  for (const team of teams) totals.set(team.id, { w: 0, l: 0, t: 0, pf: 0, pa: 0 });

  const playedRegularWeeks = inProgress ? regularSeasonWeeks - 2 : regularSeasonWeeks;

  // Round-robin-ish rotation so every pairing shows up across the season.
  for (let week = 1; week <= regularSeasonWeeks; week++) {
    const rotated = [teams[0], ...teams.slice(1).map((_, i) => teams[1 + ((i + week) % (teams.length - 1))])];
    for (let i = 0; i < rotated.length / 2; i++) {
      const home = rotated[i];
      const away = rotated[rotated.length - 1 - i];
      if (!home || !away || home.id === away.id) continue;

      if (week > playedRegularWeeks) {
        schedule.push({
          id: schedule.length + 1,
          matchupPeriodId: week,
          ...(modern ? { playoffTierType: "NONE" } : {}),
          home: { teamId: home.id, totalPoints: 0 },
          away: { teamId: away.id, totalPoints: 0 },
          winner: "UNDECIDED",
        });
        continue;
      }

      // Week 3 of 2016 is forced to a tie: ties are rare enough in real data to
      // go untested by accident, and they're where win-percentage math breaks.
      const tie = season === 2016 && week === 3 && i === 0;
      const homeScore = score(home);
      const awayScore = tie ? homeScore : score(away);
      const winner = tie ? "TIE" : homeScore > awayScore ? "HOME" : "AWAY";

      const ht = totals.get(home.id)!;
      const at = totals.get(away.id)!;
      ht.pf += homeScore;
      ht.pa += awayScore;
      at.pf += awayScore;
      at.pa += homeScore;
      if (winner === "TIE") {
        ht.t++;
        at.t++;
      } else if (winner === "HOME") {
        ht.w++;
        at.l++;
      } else {
        at.w++;
        ht.l++;
      }

      schedule.push({
        id: schedule.length + 1,
        matchupPeriodId: week,
        ...(modern ? { playoffTierType: "NONE" } : {}),
        home: { teamId: home.id, totalPoints: homeScore },
        away: { teamId: away.id, totalPoints: awayScore },
        winner,
      });
    }
  }

  const standings = [...teams].sort((a, b) => {
    const at = totals.get(a.id)!;
    const bt = totals.get(b.id)!;
    return bt.w - at.w || bt.pf - at.pf;
  });

  const seeds = new Map(standings.map((t, i) => [t.id, i + 1]));
  let finalOrder: FixtureTeam[] = standings;

  if (!inProgress) {
    const bracket = standings.slice(0, playoffTeamCount);

    // Semifinal week: the 1 seed gets a bye in a 3-team bracket, which is how
    // a matchup with no `away` side shows up in the real payload.
    if (bracket.length === 3) {
      schedule.push({
        id: schedule.length + 1,
        matchupPeriodId: regularSeasonWeeks + 1,
        playoffTierType: "WINNERS_BRACKET",
        home: { teamId: bracket[0].id, totalPoints: 0 },
        winner: "UNDECIDED",
      });
    }

    const semiPairs =
      bracket.length >= 4
        ? [
            [bracket[0], bracket[3]],
            [bracket[1], bracket[2]],
          ]
        : [[bracket[1], bracket[2]]];

    const semiWinners: FixtureTeam[] = bracket.length === 3 ? [bracket[0]] : [];
    const semiLosers: FixtureTeam[] = [];

    for (const [home, away] of semiPairs) {
      const homeScore = score(home);
      const awayScore = score(away);
      const homeWins = homeScore >= awayScore;
      semiWinners.push(homeWins ? home : away);
      semiLosers.push(homeWins ? away : home);
      schedule.push({
        id: schedule.length + 1,
        matchupPeriodId: regularSeasonWeeks + 1,
        ...(modern ? { playoffTierType: "WINNERS_BRACKET" } : {}),
        home: { teamId: home.id, totalPoints: homeScore },
        away: { teamId: away.id, totalPoints: awayScore },
        winner: homeWins ? "HOME" : "AWAY",
      });
    }

    // Consolation bracket for the teams that missed out. These must never show
    // up in anyone's win/loss record.
    const missed = standings.slice(playoffTeamCount);
    for (let i = 0; i + 1 < missed.length; i += 2) {
      const home = missed[i];
      const away = missed[i + 1];
      const homeScore = score(home);
      const awayScore = score(away);
      schedule.push({
        id: schedule.length + 1,
        matchupPeriodId: regularSeasonWeeks + 1,
        playoffTierType: "LOSERS_CONSOLATION_LADDER",
        home: { teamId: home.id, totalPoints: homeScore },
        away: { teamId: away.id, totalPoints: awayScore },
        winner: homeScore >= awayScore ? "HOME" : "AWAY",
      });
    }

    // Championship. Scored high so `titleGame`'s combined-score heuristic picks
    // it over the third-place game in the same week.
    const [a, b] = semiWinners;
    const champHome = score(a) + 40;
    const champAway = score(b) + 40;
    const championWins = champHome >= champAway;
    schedule.push({
      id: schedule.length + 1,
      matchupPeriodId: regularSeasonWeeks + 2,
      ...(modern ? { playoffTierType: "WINNERS_BRACKET" } : {}),
      home: { teamId: a.id, totalPoints: champHome },
      away: { teamId: b.id, totalPoints: champAway },
      winner: championWins ? "HOME" : "AWAY",
    });

    if (semiLosers.length === 2) {
      const thirdHome = score(semiLosers[0]);
      const thirdAway = score(semiLosers[1]);
      schedule.push({
        id: schedule.length + 1,
        matchupPeriodId: regularSeasonWeeks + 2,
        ...(modern ? { playoffTierType: "WINNERS_BRACKET" } : {}),
        home: { teamId: semiLosers[0].id, totalPoints: thirdHome },
        away: { teamId: semiLosers[1].id, totalPoints: thirdAway },
        winner: thirdHome >= thirdAway ? "HOME" : "AWAY",
      });
    }

    const champion = championWins ? a : b;
    const runnerUp = championWins ? b : a;
    finalOrder = [champion, runnerUp, ...standings.filter((t) => t !== champion && t !== runnerUp)];
  }

  const finalRanks = new Map(finalOrder.map((t, i) => [t.id, i + 1]));

  const league = {
    id: 999999,
    seasonId: season,
    status: {
      currentMatchupPeriod: inProgress ? playedRegularWeeks + 1 : regularSeasonWeeks + 2,
      finalScoringPeriod: regularSeasonWeeks + 2,
      isActive: inProgress,
    },
    settings: {
      name: leagueName,
      scheduleSettings: {
        matchupPeriodCount: regularSeasonWeeks,
        playoffTeamCount,
        playoffMatchupPeriodLength: 1,
      },
    },
    members: teams.map((team) => ({
      id: team.owner,
      displayName: displayNameFor(team.owner),
      firstName: displayNameFor(team.owner),
      lastName: "",
    })),
    teams: teams.map((team) => {
      const t = totals.get(team.id)!;
      return {
        id: team.id,
        abbrev: team.abbrev,
        // The shape difference that breaks naive normalizers.
        ...(modern
          ? { name: `${team.location} ${team.nickname}` }
          : { location: team.location, nickname: team.nickname }),
        logo: null,
        owners: [team.owner],
        primaryOwner: team.owner,
        playoffSeed: seeds.get(team.id) ?? 0,
        ...(includeFinalRanks && !inProgress
          ? { rankCalculatedFinal: finalRanks.get(team.id) ?? 0 }
          : {}),
        record: {
          overall: {
            wins: t.w,
            losses: t.l,
            ties: t.t,
            pointsFor: Math.round(t.pf * 100) / 100,
            pointsAgainst: Math.round(t.pa * 100) / 100,
          },
        },
      };
    }),
    schedule,
  };

  // Pre-2018 comes back from `leagueHistory` as an array of one league.
  return modern ? league : [league];
}

function displayNameFor(guid: string): string {
  switch (guid) {
    case GUIDS.alice:
      return "Alice Nakamura";
    case GUIDS.bob:
      return "Bob Osei";
    case GUIDS.carol:
      return "Carol Whitfield";
    case GUIDS.erin:
      return "Erin Vasquez";
    case GUIDS.frank:
      return "Frank Boateng";
    case GUIDS.dave:
    case GUIDS.daveSecondAccount:
      return "Dave Lindqvist";
    default:
      return "Unknown manager";
  }
}

const base: Omit<FixtureTeam, "owner">[] = [
  { id: 1, location: "Gridiron", nickname: "Gremlins", abbrev: "GRE", strength: 3 },
  { id: 2, location: "Turnpike", nickname: "Titans", abbrev: "TRN", strength: 2 },
  { id: 3, location: "Bayside", nickname: "Bandits", abbrev: "BAY", strength: 1 },
  { id: 4, location: "Ninth Street", nickname: "Nighthawks", abbrev: "NIN", strength: 0 },
  { id: 5, location: "Harbor", nickname: "Hooligans", abbrev: "HAR", strength: 2 },
  { id: 6, location: "Cascade", nickname: "Chaos", abbrev: "CAS", strength: 1 },
];

function teamsFor(season: number): FixtureTeam[] {
  const owners = [
    GUIDS.alice,
    GUIDS.bob,
    GUIDS.carol,
    season >= 2021 ? GUIDS.daveSecondAccount : GUIDS.dave,
    GUIDS.erin,
    GUIDS.frank,
  ];
  return base.map((team, i) => ({
    ...team,
    owner: owners[i],
    // Carol renames her team every year; the normalizer must still key her by GUID.
    ...(team.id === 3 ? { nickname: season >= 2021 ? "Buccaneers" : "Bandits" } : {}),
  }));
}

/** The full fixture league: two archive seasons, two modern, one in progress. */
export function makeLeagueFixture(): Array<{ season: number; payload: unknown }> {
  return [
    { season: 2016, payload: makeSeason({ season: 2016, teams: teamsFor(2016) }) },
    { season: 2017, payload: makeSeason({ season: 2017, teams: teamsFor(2017) }) },
    { season: 2021, payload: makeSeason({ season: 2021, teams: teamsFor(2021) }) },
    { season: 2024, payload: makeSeason({ season: 2024, teams: teamsFor(2024) }) },
    {
      season: 2025,
      payload: makeSeason({ season: 2025, teams: teamsFor(2025), inProgress: true }),
    },
  ];
}

export const fixtureOwnersConfig = {
  managers: {
    [GUIDS.dave]: {
      name: "Dave Lindqvist",
      aliases: [GUIDS.daveSecondAccount],
    },
  },
};
