import type { Matchup, Team } from "../../models/models";
import type { TeamRecord } from "../homeViewUtils";

export type SeasonMatchupWeek = Matchup & {
  records: Record<number, TeamRecord>;
};

const createRecord = (): TeamRecord => ({ wins: 0, losses: 0, ties: 0 });

export function calculateSeasonMatchupWeeks(
  matchups: Matchup[],
  teams: Team[],
): SeasonMatchupWeek[] {
  const records = new Map(
    teams.map(({ team_id: teamId }) => [teamId, createRecord()]),
  );

  return [...matchups]
    .sort((left, right) => left.week - right.week)
    .map((week) => {
      if (week.status === "final") {
        for (const matchup of week.matchups) {
          const home = records.get(matchup.home_team_id);
          const away = records.get(matchup.away_team_id);

          if (
            !home ||
            !away ||
            matchup.home_score === null ||
            matchup.away_score === null
          ) {
            continue;
          }

          if (matchup.home_score > matchup.away_score) {
            home.wins += 1;
            away.losses += 1;
          } else if (matchup.away_score > matchup.home_score) {
            away.wins += 1;
            home.losses += 1;
          } else {
            home.ties += 1;
            away.ties += 1;
          }
        }
      }

      return {
        ...week,
        records: Object.fromEntries(
          [...records].map(([teamId, record]) => [
            teamId,
            { ...record },
          ]),
        ),
      };
    });
}
