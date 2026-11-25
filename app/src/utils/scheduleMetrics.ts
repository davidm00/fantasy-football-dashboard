import type { Team } from "../models/models";
import type { SeasonLoaderData } from "../routes/loader";
import { EMPTY_RECORD, getManagerName, type TeamRecord } from "./homeViewUtils";
import { getManagerGames, resultOf } from "./managerMetrics";

type GameResult = ReturnType<typeof resultOf>;

export type ScheduleStrengthRow = {
  teamId: number;
  rank: number;
  averageOpponentPoints: number;
  differenceFromLeagueAverage: number;
};

export type ScheduleStrength = {
  rows: ScheduleStrengthRow[];
  leagueAverage: number | null;
  coveredWeeks: number[];
  finalizedWeeks: number;
};

export type ScheduleComparisonWeek =
  | { week: number; available: false; reason: string }
  | {
      week: number;
      available: true;
      score: number;
      opponentId: number;
      opponentScore: number;
      actual: GameResult;
      compared: GameResult;
      headToHead: boolean;
    };

export type ScheduleComparison =
  | { available: false; reason: string }
  | {
      available: true;
      scoreTeam: Team;
      scheduleTeam: Team;
      rows: ScheduleComparisonWeek[];
      actualRecord: TeamRecord;
      comparedRecord: TeamRecord;
      coveredWeeks: number;
      changedResults: number;
      winDifference: number;
    };

function getRegularSeasonGames(season: SeasonLoaderData) {
  const weeks = season.matchups
    .filter(({ week, status }) => status === "final" && week <= season.settings.regular_season_length)
    .map(({ week }) => week).toSorted((a, b) => a - b);
  const games = new Map(season.teams.map((team) => [
    team.team_id,
    new Map(getManagerGames(season, team.team_id)
      .filter(game => !game.playoff && game.opponentId !== team.team_id &&
        Number.isFinite(game.score) && Number.isFinite(game.opponentScore))
      .map(game => [game.week, game])),
  ]));
  return { weeks, games };
}

export function getScheduleStrength(season: SeasonLoaderData): ScheduleStrength {
  const { weeks, games } = getRegularSeasonGames(season);
  const coveredWeeks = weeks.filter(week =>
    season.teams.length > 0 && season.teams.every(team => games.get(team.team_id)?.has(week)));
  if (!coveredWeeks.length) {
    return { rows: [], leagueAverage: null, coveredWeeks, finalizedWeeks: weeks.length };
  }
  const averages = season.teams.map(team => {
    const teamGames = games.get(team.team_id);
    if (!teamGames) throw new Error("A schedule-strength team has no game index.");
    const total = coveredWeeks.reduce((sum, week) => {
      const game = teamGames.get(week);
      if (!game) throw new Error("A covered schedule-strength week has no game.");
      return sum + game.opponentScore;
    }, 0);
    return { teamId: team.team_id, averageOpponentPoints: total / coveredWeeks.length };
  }).toSorted((a, b) => a.averageOpponentPoints - b.averageOpponentPoints ||
    getManagerName(season.teams.find(team => team.team_id === a.teamId))
      .localeCompare(getManagerName(season.teams.find(team => team.team_id === b.teamId))));
  const leagueAverage = averages.reduce((sum, row) => sum + row.averageOpponentPoints, 0) / averages.length;
  let rank = 1;
  const rows: ScheduleStrengthRow[] = averages.map((row, index) => {
    if (index > 0 && Math.abs(row.averageOpponentPoints - averages[index - 1].averageOpponentPoints) > 1e-9) rank = index + 1;
    const difference = row.averageOpponentPoints - leagueAverage;
    return { ...row, rank, differenceFromLeagueAverage: Math.abs(difference) < 1e-9 ? 0 : difference };
  });
  return { rows, leagueAverage, coveredWeeks, finalizedWeeks: weeks.length };
}

export function getScheduleComparison(season: SeasonLoaderData, scoreTeamId: number, scheduleTeamId: number): ScheduleComparison {
  const scoreTeam = season.teams.find(team => team.team_id === scoreTeamId);
  const scheduleTeam = season.teams.find(team => team.team_id === scheduleTeamId);
  if (!scoreTeam || !scheduleTeam) return { available: false, reason: "Choose two available managers from this season." };
  const { weeks, games } = getRegularSeasonGames(season);
  const rows: ScheduleComparisonWeek[] = weeks.map(week => {
    const actual = games.get(scoreTeamId)?.get(week);
    const schedule = games.get(scheduleTeamId)?.get(week);
    if (!actual || !schedule) return { week, available: false, reason: "Missing finalized matchup or score; not counted." };
    const headToHead = scoreTeamId !== scheduleTeamId && schedule.opponentId === scoreTeamId;
    const opponentId = headToHead ? scheduleTeamId : schedule.opponentId;
    const opponent = games.get(opponentId)?.get(week);
    if (!opponent) return { week, available: false, reason: "Missing opponent matchup or score; not counted." };
    return {
      week, available: true, score: actual.score, opponentId, opponentScore: opponent.score,
      actual: resultOf(actual.score, actual.opponentScore), compared: resultOf(actual.score, opponent.score), headToHead,
    };
  });
  const actualRecord = { ...EMPTY_RECORD };
  const comparedRecord = { ...EMPTY_RECORD };
  const recordKey = { W: "wins", L: "losses", T: "ties" } as const;
  let coveredWeeks = 0;
  let changedResults = 0;
  for (const row of rows) {
    if (!row.available) continue;
    coveredWeeks++;
    actualRecord[recordKey[row.actual]]++;
    comparedRecord[recordKey[row.compared]]++;
    if (row.actual !== row.compared) changedResults++;
  }
  return {
    available: true, scoreTeam, scheduleTeam, rows, actualRecord, comparedRecord,
    coveredWeeks, changedResults, winDifference: comparedRecord.wins - actualRecord.wins,
  };
}
