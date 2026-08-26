import {
  addRecord,
  emptyRecord,
  type Game,
  type GameKind,
  type Season,
  type TeamSeason,
} from "@/lib/types";
import { unwrapLeague } from "./client";
import type { EspnLeague, EspnMatchup, EspnTeam } from "./types";
import type { ManagerIndex } from "./owners";

function teamName(team: EspnTeam): string {
  // Newer seasons carry a single `name`; older ones split it into
  // location + nickname and leave `name` undefined.
  const combined = team.name?.trim() || [team.location, team.nickname].filter(Boolean).join(" ").trim();
  return combined || `Team ${team.id ?? "?"}`;
}

const isDecidedWinner = (value: string | undefined): value is Game["winner"] =>
  value === "HOME" || value === "AWAY" || value === "TIE";

function classify(matchup: EspnMatchup, regularSeasonWeeks: number): GameKind {
  const tier = matchup.playoffTierType;
  if (tier === "WINNERS_BRACKET") return "PLAYOFF";
  if (tier && tier !== "NONE") return "CONSOLATION";
  // Some older payloads leave playoffTierType off entirely, in which case the
  // only signal left is that the matchup falls past the regular season.
  if (!tier && (matchup.matchupPeriodId ?? 0) > regularSeasonWeeks) return "PLAYOFF";
  return "REGULAR";
}

function toGame(matchup: EspnMatchup, seasonId: number, regularSeasonWeeks: number): Game | null {
  const home = matchup.home;
  const away = matchup.away;
  // A missing side is a playoff bye, not a game.
  if (!home?.teamId || !away?.teamId) return null;
  // UNDECIDED covers both a week that hasn't been played and one still in
  // progress. Neither belongs in a record book.
  if (matchup.winner === "UNDECIDED" || !matchup.winner) return null;

  const homeScore = home.totalPoints ?? 0;
  const awayScore = away.totalPoints ?? 0;

  // ESPN's declared winner is authoritative when it's a value we recognise: a
  // stat correction applied after the fact can leave it disagreeing with the
  // points shown. Anything else falls back to the scores.
  const declared = matchup.winner;
  const winner: Game["winner"] = isDecidedWinner(declared)
    ? declared
    : homeScore > awayScore
      ? "HOME"
      : homeScore < awayScore
        ? "AWAY"
        : "TIE";

  return {
    seasonId,
    week: matchup.matchupPeriodId ?? 0,
    kind: classify(matchup, regularSeasonWeeks),
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    homeScore,
    awayScore,
    winner,
  };
}

/** Folds one game into the two teams' running records. */
function applyGame(records: Map<number, ReturnType<typeof emptyRecord>>, game: Game): void {
  const home = records.get(game.homeTeamId) ?? emptyRecord();
  const away = records.get(game.awayTeamId) ?? emptyRecord();

  home.pointsFor += game.homeScore;
  home.pointsAgainst += game.awayScore;
  away.pointsFor += game.awayScore;
  away.pointsAgainst += game.homeScore;

  if (game.winner === "HOME") {
    home.wins++;
    away.losses++;
  } else if (game.winner === "AWAY") {
    away.wins++;
    home.losses++;
  } else {
    home.ties++;
    away.ties++;
  }

  records.set(game.homeTeamId, home);
  records.set(game.awayTeamId, away);
}

/**
 * Finds the title game: the latest week in the winners' bracket. Used as a
 * fallback for seasons where ESPN never populated `rankCalculatedFinal`, which
 * is common in the pre-2018 archive.
 */
function titleGame(games: Game[]): Game | null {
  const bracket = games.filter((g) => g.kind === "PLAYOFF");
  if (bracket.length === 0) return null;
  const finalWeek = Math.max(...bracket.map((g) => g.week));
  const candidates = bracket.filter((g) => g.week === finalWeek);
  // If the last round has several games, the championship is the one between
  // the two highest scorers still alive — in practice the highest combined score.
  return (
    candidates.sort(
      (a, b) => b.homeScore + b.awayScore - (a.homeScore + a.awayScore),
    )[0] ?? null
  );
}

export function normalizeSeason(
  payload: unknown,
  seasonId: number,
  index: ManagerIndex,
): Season {
  const league: EspnLeague = unwrapLeague(payload);
  const schedule = league.schedule ?? [];
  const espnTeams = league.teams ?? [];

  const scheduleSettings = league.settings?.scheduleSettings;
  const regularSeasonWeeks =
    scheduleSettings?.matchupPeriodCount ??
    // Without the setting, infer it from the last week ESPN tagged as regular.
    Math.max(
      0,
      ...schedule
        .filter((m) => !m.playoffTierType || m.playoffTierType === "NONE")
        .map((m) => m.matchupPeriodId ?? 0),
    );

  const playoffTeamCount =
    scheduleSettings?.playoffTeamCount ?? league.settings?.playoffTeamCount ?? 0;

  const games = schedule
    .map((m) => toGame(m, seasonId, regularSeasonWeeks))
    .filter((g): g is Game => g !== null)
    .sort((a, b) => a.week - b.week);

  const regular = new Map<number, ReturnType<typeof emptyRecord>>();
  const playoff = new Map<number, ReturnType<typeof emptyRecord>>();
  for (const game of games) {
    if (game.kind === "REGULAR") applyGame(regular, game);
    else if (game.kind === "PLAYOFF") applyGame(playoff, game);
    // Consolation games are deliberately excluded from both records: they don't
    // decide anything, and folding them in would inflate the win totals of
    // whoever missed the playoffs most often.
  }

  const final = titleGame(games);
  const finalWinner = final
    ? final.winner === "HOME"
      ? final.homeTeamId
      : final.winner === "AWAY"
        ? final.awayTeamId
        : null
    : null;
  const finalLoser = final
    ? final.winner === "HOME"
      ? final.awayTeamId
      : final.winner === "AWAY"
        ? final.homeTeamId
        : null
    : null;

  const rankedFirst = espnTeams.find((t) => t.rankCalculatedFinal === 1)?.id ?? null;
  const rankedSecond = espnTeams.find((t) => t.rankCalculatedFinal === 2)?.id ?? null;

  const championTeamId = rankedFirst ?? finalWinner;
  const runnerUpTeamId = rankedSecond ?? finalLoser;

  const playoffTeamIds = new Set(
    games.filter((g) => g.kind === "PLAYOFF").flatMap((g) => [g.homeTeamId, g.awayTeamId]),
  );

  // A season counts as finished once someone has won it. That's the property
  // the record book actually cares about, and it holds for both a completed
  // archive season and the current one after the final.
  const complete = championTeamId !== null;

  const teams: TeamSeason[] = espnTeams
    .filter((t): t is EspnTeam & { id: number } => typeof t.id === "number")
    .map((team) => ({
      seasonId,
      teamId: team.id,
      teamName: teamName(team),
      abbrev: team.abbrev ?? "",
      logo: team.logo ?? null,
      managerIds: index.forTeam(seasonId, team),
      regular: regular.get(team.id) ?? emptyRecord(),
      playoff: playoff.get(team.id) ?? emptyRecord(),
      finalRank: team.rankCalculatedFinal ?? null,
      playoffSeed: team.playoffSeed ?? null,
      // Having played a bracket game is proof. Seeding is only a fallback for
      // finished seasons whose bracket ESPN no longer serves - mid-season it is
      // a projection, and projecting someone into the playoffs would quietly
      // inflate their career total.
      madePlayoffs:
        playoffTeamIds.has(team.id) ||
        (complete &&
          playoffTeamCount > 0 &&
          typeof team.playoffSeed === "number" &&
          team.playoffSeed > 0 &&
          team.playoffSeed <= playoffTeamCount),
    }))
    .sort((a, b) => a.teamId - b.teamId);

  return {
    id: seasonId,
    leagueName: league.settings?.name?.trim() || "Fantasy League",
    complete,
    regularSeasonWeeks,
    playoffTeamCount,
    teams,
    games,
    championTeamId,
    runnerUpTeamId,
  };
}

/** Convenience for tests and the ingest: total record across regular + playoff. */
export function seasonRecord(team: TeamSeason) {
  return addRecord(team.regular, team.playoff);
}
