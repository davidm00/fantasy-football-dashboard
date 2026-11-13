import type { SeasonLoaderData } from "../routes/loader";

export type ActivitySource = { season: SeasonLoaderData; teamId?: number };

export function getDraftColumn(round: number, pick: number, teamCount: number) {
  return round % 2 === 1 ? pick : teamCount + 1 - pick;
}

export function getDraftHeat(pick: { observedWeeks: number; starterPoints: number }, minimum: number, maximum: number) {
  if (!pick.observedWeeks) return null;
  return maximum > minimum ? (pick.starterPoints - minimum) / (maximum - minimum) : 0;
}

export function getFaabLedger(sources: ActivitySource[]) {
  return sources.flatMap(({ season, teamId }) => season.settings.waiver_type !== "faab" ? [] :
    season.teams.filter((team) => teamId === undefined || team.team_id === teamId).map((team) => {
      const spent = season.transactions.filter((move) => move.status === "EXECUTED" && move.team_id === team.team_id)
        .reduce((sum, move) => sum + move.bid_amount, 0);
      const exportedBudget = season.settings.faab_budget;
      const budget = exportedBudget !== undefined && Number.isFinite(exportedBudget) && exportedBudget >= 0 ? exportedBudget : null;
      return { season, team, spent, budget, remaining: budget === null ? null : budget - spent };
    }));
}
