import {
  addRecord,
  emptyRecord,
  gamesPlayed,
  winPct,
  type Game,
  type LeagueData,
  type Manager,
  type Record as WLRecord,
  type Season,
  type TeamSeason,
} from "./types";

/**
 * Derived all-time statistics. Everything here is pure — `LeagueData` in,
 * plain objects out — which is what lets the whole record book be unit-tested
 * without touching ESPN or the filesystem.
 *
 * A note on co-managed teams: when ESPN lists two owners on a team, that
 * team-season is credited to *both* of them. It was genuinely both their year,
 * and the alternative (silently dropping one) makes a manager disappear from
 * their own league's history.
 */

export interface WeeklyScore {
  seasonId: number;
  week: number;
  teamId: number;
  managerIds: string[];
  teamName: string;
  points: number;
  opponentTeamId: number;
  opponentName: string;
  opponentPoints: number;
  result: "W" | "L" | "T";
  kind: Game["kind"];
}

export interface ManagerSeasonLine {
  seasonId: number;
  teamName: string;
  regular: WLRecord;
  playoff: WLRecord;
  combined: WLRecord;
  allPlay: WLRecord;
  finalRank: number | null;
  madePlayoffs: boolean;
  isChampion: boolean;
  isRunnerUp: boolean;
  pointsPerGame: number;
}

export interface Streak {
  length: number;
  from: { seasonId: number; week: number } | null;
  to: { seasonId: number; week: number } | null;
}

export interface ManagerCareer {
  manager: Manager;
  seasons: ManagerSeasonLine[];
  seasonsPlayed: number;
  regular: WLRecord;
  playoff: WLRecord;
  combined: WLRecord;
  allPlay: WLRecord;
  winPct: number;
  allPlayWinPct: number;
  pointsPerGame: number;
  championships: number;
  runnerUps: number;
  playoffAppearances: number;
  bestSeason: ManagerSeasonLine | null;
  worstSeason: ManagerSeasonLine | null;
  highestWeek: WeeklyScore | null;
  lowestWeek: WeeklyScore | null;
  longestWinStreak: Streak;
  longestLoseStreak: Streak;
  championshipSeasons: number[];
}

const byTeam = (season: Season) => new Map(season.teams.map((t) => [t.teamId, t]));

/** Flattens every played game into one row per team, the shape most records need. */
export function weeklyScores(seasons: Season[]): WeeklyScore[] {
  const rows: WeeklyScore[] = [];
  for (const season of seasons) {
    const teams = byTeam(season);
    for (const game of season.games) {
      const home = teams.get(game.homeTeamId);
      const away = teams.get(game.awayTeamId);
      if (!home || !away) continue;

      const sides: Array<[TeamSeason, TeamSeason, number, number, "W" | "L" | "T"]> = [
        [
          home,
          away,
          game.homeScore,
          game.awayScore,
          game.winner === "TIE" ? "T" : game.winner === "HOME" ? "W" : "L",
        ],
        [
          away,
          home,
          game.awayScore,
          game.homeScore,
          game.winner === "TIE" ? "T" : game.winner === "AWAY" ? "W" : "L",
        ],
      ];

      for (const [team, opponent, points, opponentPoints, result] of sides) {
        rows.push({
          seasonId: season.id,
          week: game.week,
          teamId: team.teamId,
          managerIds: team.managerIds,
          teamName: team.teamName,
          points,
          opponentTeamId: opponent.teamId,
          opponentName: opponent.teamName,
          opponentPoints,
          result,
          kind: game.kind,
        });
      }
    }
  }
  return rows;
}

/**
 * All-play record: how each team would have done if it played every other team
 * every week. It strips out schedule luck, so it's the honest answer to "who
 * actually had the best team" — and it's usually the stat that starts an
 * argument in the group chat.
 *
 * Regular season only; the playoff field is too small for it to mean anything.
 */
export function allPlayBySeasonTeam(season: Season): Map<number, WLRecord> {
  const result = new Map<number, WLRecord>();
  const weeks = new Map<number, Array<{ teamId: number; points: number }>>();

  for (const game of season.games) {
    if (game.kind !== "REGULAR") continue;
    const bucket = weeks.get(game.week) ?? [];
    bucket.push({ teamId: game.homeTeamId, points: game.homeScore });
    bucket.push({ teamId: game.awayTeamId, points: game.awayScore });
    weeks.set(game.week, bucket);
  }

  for (const entries of weeks.values()) {
    for (const entry of entries) {
      const record = result.get(entry.teamId) ?? emptyRecord();
      for (const other of entries) {
        if (other.teamId === entry.teamId) continue;
        if (entry.points > other.points) record.wins++;
        else if (entry.points < other.points) record.losses++;
        else record.ties++;
      }
      result.set(entry.teamId, record);
    }
  }

  return result;
}

function longestStreak(
  rows: WeeklyScore[],
  target: "W" | "L",
): Streak {
  // Chronological across the whole league history, so an all-time streak can
  // run through an offseason — which is exactly the version worth bragging about.
  const ordered = [...rows].sort(
    (a, b) => a.seasonId - b.seasonId || a.week - b.week,
  );

  let best: Streak = { length: 0, from: null, to: null };
  let current = 0;
  let start: WeeklyScore | null = null;

  for (const row of ordered) {
    if (row.result === target) {
      current++;
      start ??= row;
      if (current > best.length) {
        best = {
          length: current,
          from: start ? { seasonId: start.seasonId, week: start.week } : null,
          to: { seasonId: row.seasonId, week: row.week },
        };
      }
    } else {
      current = 0;
      start = null;
    }
  }

  return best;
}

export function managerCareers(data: LeagueData): ManagerCareer[] {
  const rows = weeklyScores(data.seasons);
  const rowsByManager = new Map<string, WeeklyScore[]>();
  for (const row of rows) {
    // Consolation games don't count toward streaks or high/low weeks.
    if (row.kind === "CONSOLATION") continue;
    for (const id of row.managerIds) {
      const bucket = rowsByManager.get(id) ?? [];
      bucket.push(row);
      rowsByManager.set(id, bucket);
    }
  }

  const allPlayBySeason = new Map(
    data.seasons.map((s) => [s.id, allPlayBySeasonTeam(s)] as const),
  );

  const careers: ManagerCareer[] = [];

  for (const manager of data.managers) {
    const lines: ManagerSeasonLine[] = [];

    for (const season of data.seasons) {
      for (const team of season.teams) {
        if (!team.managerIds.includes(manager.id)) continue;

        const combined = addRecord(team.regular, team.playoff);
        // A team ESPN knows about but that never played (an abandoned slot in
        // an expansion year) shouldn't get a 0-0 row in anyone's history.
        if (gamesPlayed(combined) === 0) continue;

        lines.push({
          seasonId: season.id,
          teamName: team.teamName,
          regular: team.regular,
          playoff: team.playoff,
          combined,
          allPlay: allPlayBySeason.get(season.id)?.get(team.teamId) ?? emptyRecord(),
          finalRank: team.finalRank,
          madePlayoffs: team.madePlayoffs,
          isChampion: season.championTeamId === team.teamId,
          isRunnerUp: season.runnerUpTeamId === team.teamId,
          pointsPerGame:
            gamesPlayed(combined) === 0 ? 0 : combined.pointsFor / gamesPlayed(combined),
        });
      }
    }

    if (lines.length === 0) continue;
    lines.sort((a, b) => a.seasonId - b.seasonId);

    const regular = lines.reduce((acc, l) => addRecord(acc, l.regular), emptyRecord());
    const playoff = lines.reduce((acc, l) => addRecord(acc, l.playoff), emptyRecord());
    const allPlay = lines.reduce((acc, l) => addRecord(acc, l.allPlay), emptyRecord());
    const combined = addRecord(regular, playoff);

    const managerRows = rowsByManager.get(manager.id) ?? [];
    const sortedByPoints = [...managerRows].sort((a, b) => b.points - a.points);

    // "Best season" ranks on regular-season win rate, with points for as the
    // tiebreak — an 11-3 year beats a 10-4 year regardless of playoff luck.
    const rankable = lines.filter((l) => gamesPlayed(l.regular) > 0);
    const ranked = [...rankable].sort(
      (a, b) => winPct(b.regular) - winPct(a.regular) || b.regular.pointsFor - a.regular.pointsFor,
    );

    careers.push({
      manager,
      seasons: lines,
      seasonsPlayed: lines.length,
      regular,
      playoff,
      combined,
      allPlay,
      winPct: winPct(combined),
      allPlayWinPct: winPct(allPlay),
      pointsPerGame:
        gamesPlayed(combined) === 0 ? 0 : combined.pointsFor / gamesPlayed(combined),
      championships: lines.filter((l) => l.isChampion).length,
      runnerUps: lines.filter((l) => l.isRunnerUp).length,
      playoffAppearances: lines.filter((l) => l.madePlayoffs).length,
      bestSeason: ranked[0] ?? null,
      worstSeason: ranked.length > 0 ? ranked[ranked.length - 1] : null,
      highestWeek: sortedByPoints[0] ?? null,
      lowestWeek: sortedByPoints.length > 0 ? sortedByPoints[sortedByPoints.length - 1] : null,
      longestWinStreak: longestStreak(managerRows, "W"),
      longestLoseStreak: longestStreak(managerRows, "L"),
      championshipSeasons: lines.filter((l) => l.isChampion).map((l) => l.seasonId),
    });
  }

  // All-time standings order: titles first, then win rate, then points.
  return careers.sort(
    (a, b) =>
      b.championships - a.championships ||
      b.winPct - a.winPct ||
      b.combined.pointsFor - a.combined.pointsFor,
  );
}

export interface LeagueSummary {
  leagueName: string;
  firstSeason: number | null;
  lastSeason: number | null;
  seasonsPlayed: number;
  managerCount: number;
  gamesPlayed: number;
  totalPoints: number;
  champions: Array<{ seasonId: number; managerIds: string[]; teamName: string }>;
}

export function leagueSummary(data: LeagueData, careers: ManagerCareer[]): LeagueSummary {
  const seasons = [...data.seasons].sort((a, b) => a.id - b.id);
  const rows = weeklyScores(data.seasons);

  const champions = seasons
    .filter((s) => s.championTeamId !== null)
    .map((s) => {
      const team = s.teams.find((t) => t.teamId === s.championTeamId);
      return {
        seasonId: s.id,
        managerIds: team?.managerIds ?? [],
        teamName: team?.teamName ?? "Unknown",
      };
    })
    .sort((a, b) => b.seasonId - a.seasonId);

  return {
    leagueName: data.leagueName,
    firstSeason: seasons[0]?.id ?? null,
    lastSeason: seasons[seasons.length - 1]?.id ?? null,
    seasonsPlayed: seasons.length,
    managerCount: careers.length,
    gamesPlayed: rows.length / 2,
    totalPoints: rows.reduce((sum, r) => sum + r.points, 0),
    champions,
  };
}

export interface RecordEntry {
  label: string;
  value: string;
  detail: string;
  managerIds: string[];
  seasonId: number;
}

function nameOf(data: LeagueData, ids: string[]): string {
  const names = ids
    .map((id) => data.managers.find((m) => m.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  return names.length > 0 ? names.join(" & ") : "Unknown manager";
}

const pts = (n: number) => n.toFixed(2);

/**
 * The league record book. Single-game records consider regular season and
 * playoff games only, matching how the records are computed elsewhere.
 */
export function recordBook(data: LeagueData, careers: ManagerCareer[]): RecordEntry[] {
  const rows = weeklyScores(data.seasons).filter((r) => r.kind !== "CONSOLATION");
  if (rows.length === 0) return [];

  const entries: RecordEntry[] = [];
  const push = (
    label: string,
    row: WeeklyScore | undefined,
    value: (r: WeeklyScore) => string,
    detail: (r: WeeklyScore) => string,
  ) => {
    if (!row) return;
    entries.push({
      label,
      value: value(row),
      detail: detail(row),
      managerIds: row.managerIds,
      seasonId: row.seasonId,
    });
  };

  const context = (r: WeeklyScore) =>
    `${nameOf(data, r.managerIds)} - ${r.seasonId} week ${r.week} vs ${r.opponentName}`;

  const byPoints = [...rows].sort((a, b) => b.points - a.points);
  push("Highest score", byPoints[0], (r) => pts(r.points), context);
  push("Lowest score", byPoints[byPoints.length - 1], (r) => pts(r.points), context);

  const margins = [...rows].sort(
    (a, b) => b.points - b.opponentPoints - (a.points - a.opponentPoints),
  );
  push(
    "Biggest blowout",
    margins[0],
    (r) => pts(r.points - r.opponentPoints),
    (r) => `${nameOf(data, r.managerIds)} beat ${r.opponentName} ${pts(r.points)}-${pts(r.opponentPoints)} in ${r.seasonId}`,
  );

  const closest = rows
    .filter((r) => r.result === "W")
    .sort((a, b) => a.points - a.opponentPoints - (b.points - b.opponentPoints));
  push(
    "Closest game",
    closest[0],
    (r) => pts(r.points - r.opponentPoints),
    (r) => `${nameOf(data, r.managerIds)} edged ${r.opponentName} ${pts(r.points)}-${pts(r.opponentPoints)} in ${r.seasonId}`,
  );

  const unluckiest = rows.filter((r) => r.result === "L").sort((a, b) => b.points - a.points);
  push("Most points in a loss", unluckiest[0], (r) => pts(r.points), context);

  const luckiest = rows.filter((r) => r.result === "W").sort((a, b) => a.points - b.points);
  push("Fewest points in a win", luckiest[0], (r) => pts(r.points), context);

  const seasonLines = careers.flatMap((c) =>
    c.seasons
      .filter((s) => gamesPlayed(s.regular) > 0)
      .map((s) => ({ career: c, line: s })),
  );

  if (seasonLines.length > 0) {
    const bySeasonPct = [...seasonLines].sort(
      (a, b) =>
        winPct(b.line.regular) - winPct(a.line.regular) ||
        b.line.regular.pointsFor - a.line.regular.pointsFor,
    );
    const best = bySeasonPct[0];
    const worst = bySeasonPct[bySeasonPct.length - 1];

    entries.push({
      label: "Best regular season",
      value: `${best.line.regular.wins}-${best.line.regular.losses}${best.line.regular.ties ? `-${best.line.regular.ties}` : ""}`,
      detail: `${best.career.manager.name} in ${best.line.seasonId} (${pts(best.line.regular.pointsFor)} pts)`,
      managerIds: [best.career.manager.id],
      seasonId: best.line.seasonId,
    });
    entries.push({
      label: "Worst regular season",
      value: `${worst.line.regular.wins}-${worst.line.regular.losses}${worst.line.regular.ties ? `-${worst.line.regular.ties}` : ""}`,
      detail: `${worst.career.manager.name} in ${worst.line.seasonId} (${pts(worst.line.regular.pointsFor)} pts)`,
      managerIds: [worst.career.manager.id],
      seasonId: worst.line.seasonId,
    });

    const bySeasonPoints = [...seasonLines].sort(
      (a, b) => b.line.combined.pointsFor - a.line.combined.pointsFor,
    );
    const mostPoints = bySeasonPoints[0];
    entries.push({
      label: "Most points, one season",
      value: pts(mostPoints.line.combined.pointsFor),
      detail: `${mostPoints.career.manager.name} in ${mostPoints.line.seasonId}`,
      managerIds: [mostPoints.career.manager.id],
      seasonId: mostPoints.line.seasonId,
    });
  }

  const winStreak = [...careers].sort(
    (a, b) => b.longestWinStreak.length - a.longestWinStreak.length,
  )[0];
  if (winStreak && winStreak.longestWinStreak.length > 0) {
    const s = winStreak.longestWinStreak;
    entries.push({
      label: "Longest win streak",
      value: `${s.length} games`,
      detail: `${winStreak.manager.name}, ${s.from?.seasonId} week ${s.from?.week} to ${s.to?.seasonId} week ${s.to?.week}`,
      managerIds: [winStreak.manager.id],
      seasonId: s.from?.seasonId ?? 0,
    });
  }

  const loseStreak = [...careers].sort(
    (a, b) => b.longestLoseStreak.length - a.longestLoseStreak.length,
  )[0];
  if (loseStreak && loseStreak.longestLoseStreak.length > 0) {
    const s = loseStreak.longestLoseStreak;
    entries.push({
      label: "Longest losing streak",
      value: `${s.length} games`,
      detail: `${loseStreak.manager.name}, ${s.from?.seasonId} week ${s.from?.week} to ${s.to?.seasonId} week ${s.to?.week}`,
      managerIds: [loseStreak.manager.id],
      seasonId: s.from?.seasonId ?? 0,
    });
  }

  return entries;
}
