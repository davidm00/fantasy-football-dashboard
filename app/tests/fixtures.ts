import { readFileSync } from "node:fs";
import type { ComponentType } from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import type { SeasonLoaderData, MatchupDetailLoaderData } from "../src/routes/loader";
import type { BoxScore, Bracket, Draft, Matchup, Settings, Standing, Team, Transaction } from "../src/models/models";
import { reportsList } from "../src/data/reportsList";
import { calculateSeasonMetrics, calculateSeasonMatchupWeeks, calculateWeekMetrics, getOptimalLineup } from "../src/utils/metrics";

export function readSeasonFile<T>(year: number, name: string): T {
  return JSON.parse(readFileSync(new URL(`../src/data/${year}/${name}.json`, import.meta.url), "utf8"));
}

export function loadSeason(year: number): SeasonLoaderData {
  const files = {
    settings: readSeasonFile<Settings>(year, "settings"),
    teams: readSeasonFile<Team[]>(year, "teams"),
    matchups: readSeasonFile<Matchup[]>(year, "matchups"),
    box_scores: readSeasonFile<BoxScore[]>(year, "box_scores"),
    standings: readSeasonFile<Standing[]>(year, "standings"),
    bracket: readSeasonFile<Bracket>(year, "bracket"),
    draft: readSeasonFile<Draft>(year, "draft"),
    transactions: readSeasonFile<Transaction[]>(year, "transactions"),
  };
  return {
    ...files,
    year,
    reports: reportsList.filter((report) => report.season === year),
    metrics: calculateSeasonMetrics({ year, ...files }),
    matchupWeeks: calculateSeasonMatchupWeeks(files.matchups, files.teams, files.settings.regular_season_length),
  };
}

export function loadMatchup(season: SeasonLoaderData, week: number, homeTeamId: number, awayTeamId: number): MatchupDetailLoaderData {
  const matchupWeek = season.matchupWeeks.find((item) => item.week === week);
  const matchupIndex = matchupWeek?.matchups.findIndex(
    (game) => game.home_team_id === homeTeamId && game.away_team_id === awayTeamId,
  ) ?? -1;
  const matchup = matchupWeek?.matchups[matchupIndex];
  const boxScore = season.box_scores.find(
    (game) => game.week === week && game.home_team_id === homeTeamId && game.away_team_id === awayTeamId,
  );
  if (!matchupWeek || !matchup || !boxScore) throw new Error("Missing matchup fixture");
  const metrics = calculateWeekMetrics(season, week);
  return {
    season, week, matchupIndex, matchup, boxScore,
    status: matchupWeek.status,
    records: matchupWeek.records,
    recordsThroughWeek: matchupWeek.recordsThroughWeek,
    homeOptimalLineup: matchupWeek.status === "final"
      ? getOptimalLineup(boxScore.home_lineup, season.settings).players
      : [],
    awayOptimalLineup: matchupWeek.status === "final"
      ? getOptimalLineup(boxScore.away_lineup, season.settings).players
      : [],
    homePerformance: metrics.performances.find(({ teamId }) => teamId === homeTeamId),
    awayPerformance: metrics.performances.find(({ teamId }) => teamId === awayTeamId),
    matchupInsight: null, closestGame: false, report: null,
  };
}

export function renderRoute(Component: ComponentType, data?: unknown, route = "/") {
  const router = createMemoryRouter(
    [{ id: "test", path: "*", Component, loader: () => data }],
    { initialEntries: [route], hydrationData: { loaderData: { test: data } } },
  );
  const markup = renderToStaticMarkup(createElement(RouterProvider, { router }));
  router.dispose();
  return markup;
}
