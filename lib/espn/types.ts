/**
 * A typed subset of ESPN's Fantasy v3 league response — only the fields the
 * ingest actually reads. Everything is optional because ESPN's payload shape
 * drifted across the years this league has existed; `normalize.ts` is
 * responsible for coping with what's missing.
 */

export interface EspnMember {
  id?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

export interface EspnRecordSplit {
  wins?: number;
  losses?: number;
  ties?: number;
  pointsFor?: number;
  pointsAgainst?: number;
}

export interface EspnPlayer {
  id?: number;
  fullName?: string;
  /**
   * ESPN's numeric position id (historically 1=QB, 2=RB, 3=WR, 4=TE, 5=K,
   * 16=D/ST). UNVERIFIED against this league's real payload — no live ESPN
   * access was available when this was written. normalize.ts must degrade
   * gracefully for an id that isn't recognized.
   */
  defaultPositionId?: number;
}

export interface EspnPlayerPoolEntry {
  player?: EspnPlayer;
  /** Season-total fantasy points under the league's scoring, as of ingest time. */
  appliedStatTotal?: number;
}

export interface EspnRosterEntry {
  playerId?: number;
  playerPoolEntry?: EspnPlayerPoolEntry;
}

export interface EspnRoster {
  entries?: EspnRosterEntry[];
}

export interface EspnTeam {
  id?: number;
  abbrev?: string;
  /** Newer seasons. */
  name?: string;
  /** Older seasons split the team name across these two. */
  location?: string;
  nickname?: string;
  logo?: string;
  owners?: string[];
  primaryOwner?: string;
  playoffSeed?: number;
  rankCalculatedFinal?: number;
  record?: { overall?: EspnRecordSplit };
  roster?: EspnRoster;
}

export interface EspnMatchupSide {
  teamId?: number;
  totalPoints?: number;
}

/**
 * Known values: NONE, WINNERS_BRACKET, WINNERS_CONSOLATION_LADDER,
 * LOSERS_CONSOLATION_LADDER. Typed as a plain string because this is external
 * JSON and ESPN has added tiers before without warning.
 */
export type EspnPlayoffTier = string;

export interface EspnMatchup {
  id?: number;
  matchupPeriodId?: number;
  playoffTierType?: EspnPlayoffTier;
  /** Absent when a team has a playoff bye. */
  home?: EspnMatchupSide;
  away?: EspnMatchupSide;
  /** Known values: HOME, AWAY, TIE, UNDECIDED. */
  winner?: string;
}

export interface EspnLeague {
  id?: number;
  seasonId?: number;
  members?: EspnMember[];
  teams?: EspnTeam[];
  schedule?: EspnMatchup[];
  status?: {
    currentMatchupPeriod?: number;
    finalScoringPeriod?: number;
    latestScoringPeriod?: number;
    isActive?: boolean;
  };
  settings?: {
    name?: string;
    playoffTeamCount?: number;
    scheduleSettings?: {
      matchupPeriodCount?: number;
      playoffTeamCount?: number;
      playoffMatchupPeriodLength?: number;
    };
  };
}
