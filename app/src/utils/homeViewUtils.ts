import type { Team } from "../models/models";
import type { HomeSeasonData } from "../routes/loader";
import { getStanding } from "./teamHelper";

export type TeamRecord = {
  wins: number;
  losses: number;
  ties: number;
};

export const EMPTY_RECORD: TeamRecord = { wins: 0, losses: 0, ties: 0 };

export const formatRecord = ({ wins, losses, ties }: TeamRecord) =>
  `${wins}-${losses}${ties ? `-${ties}` : ""}`;

export const getTeam = (teams: Team[], teamId: number) =>
  teams.find((team) => team.team_id === teamId);

export const getLatestReport = (season: HomeSeasonData) =>
  [...season.reports].sort((left, right) => right.week - left.week)[0];

export function getSeasonStandings(
  season: HomeSeasonData,
  throughWeek?: number,
) {
  const latestFinalWeek = season.matchups.reduce(
    (latest, matchup) =>
      matchup.status === "final" ? Math.max(latest, matchup.week) : latest,
    0,
  );
  const records = getStanding(
    season.matchups,
    throughWeek ?? latestFinalWeek,
    season.settings.regular_season_length,
  );

  return season.teams
    .map((team) => ({
      team,
      record: records[team.team_id] ?? EMPTY_RECORD,
    }))
    .sort(
      (left, right) =>
        right.record.wins - left.record.wins ||
        left.record.losses - right.record.losses ||
        left.team.team_name.localeCompare(right.team.team_name),
    );
}

export function getFinalSeasonStandings(season: HomeSeasonData) {
  return [...season.standings]
    .filter(({ final_standing }) => final_standing > 0)
    .sort((left, right) => left.final_standing - right.final_standing)
    .flatMap((standing) => {
      const team = getTeam(season.teams, standing.team_id);

      return team
        ? [
            {
              team,
              record: {
                wins: standing.wins,
                losses: standing.losses,
                ties: standing.ties,
              },
            },
          ]
        : [];
    });
}

export function getChampionshipDetails(season: HomeSeasonData) {
  const finalRound = [...season.bracket.rounds].sort(
    (left, right) => right.week - left.week,
  )[0];
  const game = finalRound?.games.find(
    (item) => item.tier === "WINNERS_BRACKET",
  );
  const championId = season.bracket.champion?.team_id;
  const runnerUpId =
    game && championId === game.home_team_id
      ? game.away_team_id
      : game?.home_team_id;
  const championIsHome =
    game !== undefined && championId === game.home_team_id;

  return {
    week: finalRound?.week,
    runnerUp:
      runnerUpId === null || runnerUpId === undefined
        ? undefined
        : getTeam(season.teams, runnerUpId),
    championScore: game
      ? championIsHome
        ? game.home_score
        : game.away_score
      : undefined,
    runnerUpScore: game
      ? championIsHome
        ? game.away_score
        : game.home_score
      : undefined,
  };
}
