import type {
  MetricGame,
  SeasonMetricSource,
  SeasonMetrics,
} from "./seasonMetrics";
import { calculateSeasonMetrics } from "./seasonMetrics";

export type LeagueGameRecord = MetricGame & {
  season: number;
  teamName: string;
};

export type LeagueMetrics = {
  seasons: Record<number, SeasonMetrics>;
  highestGame: LeagueGameRecord | null;
  lowestGame: LeagueGameRecord | null;
  titlesByOwner: Record<string, number>;
};

export function calculateLeagueMetrics(
  sources: SeasonMetricSource[],
): LeagueMetrics {
  const seasons = Object.fromEntries(
    sources.map((source) => [
      source.year,
      calculateSeasonMetrics(source),
    ]),
  );
  let highestGame: LeagueGameRecord | null = null;
  let lowestGame: LeagueGameRecord | null = null;
  const titlesByOwner: Record<string, number> = {};

  for (const source of sources) {
    const metrics = seasons[source.year];

    if (metrics.highestGame) {
      const record = {
        ...metrics.highestGame,
        season: source.year,
        teamName:
          source.teams.find(
            (team) => team.team_id === metrics.highestGame?.teamId,
          )?.team_name ?? "Unknown team",
      };

      if (!highestGame || record.score > highestGame.score) {
        highestGame = record;
      }
    }

    if (metrics.lowestGame) {
      const record = {
        ...metrics.lowestGame,
        season: source.year,
        teamName:
          source.teams.find(
            (team) => team.team_id === metrics.lowestGame?.teamId,
          )?.team_name ?? "Unknown team",
      };

      if (!lowestGame || record.score < lowestGame.score) {
        lowestGame = record;
      }
    }

    const championStanding = source.standings.find(
      ({ final_standing }) => final_standing === 1,
    );
    const champion = source.teams.find(
      ({ team_id }) => team_id === championStanding?.team_id,
    );

    for (const owner of champion?.owners ?? []) {
      titlesByOwner[owner.id] = (titlesByOwner[owner.id] ?? 0) + 1;
    }
  }

  return { seasons, highestGame, lowestGame, titlesByOwner };
}
