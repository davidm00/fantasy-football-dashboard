import type { Matchup } from "../models/models";

export const getStanding = (
  matchups: Matchup[],
  targetWeek: number,
  maxWeeks: number,
) => {
  let records = {} as Record<
    number,
    { wins: number; losses: number; ties: number }
  >;

  matchups
    .slice(0, Math.min(targetWeek, maxWeeks))
    .filter((m) => m.status === "final")
    .map((m: Matchup) => {
      return m.matchups.map((gm) => {
        if (!records[gm.home_team_id]) {
          records[gm.home_team_id] = {
            wins: 0,
            losses: 0,
            ties: 0,
          };
        }
        if (!records[gm.away_team_id]) {
          records[gm.away_team_id] = {
            wins: 0,
            losses: 0,
            ties: 0,
          };
        }

        if (gm.home_score > gm.away_score) {
          records[gm.home_team_id] = {
            ...records[gm.home_team_id],
            wins: records[gm.home_team_id].wins + 1,
          };
          records[gm.away_team_id] = {
            ...records[gm.away_team_id],
            losses: records[gm.away_team_id].losses + 1,
          };
        } else if (gm.home_score < gm.away_score) {
          records[gm.away_team_id] = {
            ...records[gm.away_team_id],
            wins: records[gm.away_team_id].wins + 1,
          };
          records[gm.home_team_id] = {
            ...records[gm.home_team_id],
            losses: records[gm.home_team_id].losses + 1,
          };
        } else {
          records[gm.away_team_id] = {
            ...records[gm.away_team_id],
            ties: records[gm.away_team_id].ties + 1,
          };
          records[gm.home_team_id] = {
            ...records[gm.home_team_id],
            ties: records[gm.home_team_id].ties + 1,
          };
        }
        return gm;
      });
    });

  return records;
};
