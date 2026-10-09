import { redirect, replace, type LoaderFunctionArgs } from "react-router";
import seasonList from "../data/seasons.json";
import {
  getHomeState,
  loadSeasonFile,
  loadSeasonFiles,
  SeasonFile,
  type HomeState,
  type LoadedSeasonFiles,
} from "../utils/seasonDataLoader";
import { reportsList, type Report } from "../data/reportsList";
import {
  calculateSeasonMatchupWeeks,
  calculateSeasonMetrics,
  calculateWeekMetrics,
  getOptimalLineup,
  type OptimalLineupPlayer,
  type SeasonMatchupWeek,
  type SeasonMetrics,
  type WeekMetrics,
} from "../utils/metrics";

function assertValidSeason(season: string | undefined | null) {
  if (season == null || !seasonList.includes(Number(season))) {
    throw new Response(season ?? "unknown", {
      status: 404,
      statusText: "Season not found",
    });
  }
}

async function assertValidWeek(
  season: string | undefined,
  weekParam: string | undefined,
) {
  if (!weekParam) {
    throw new Response(weekParam ?? "unknown", {
      status: 404,
      statusText: "Week not found",
    });
  }

  const week = Number(weekParam);

  if (!Number.isInteger(week) || week < 1) {
    throw new Response(weekParam, {
      status: 404,
      statusText: "Weeks must be positive integers",
    });
  }

  const settings = await loadSeasonFile(Number(season), SeasonFile.Settings);

  if (!Object.hasOwn(settings.week_status, String(week))) {
    throw new Response(weekParam, {
      status: 404,
      statusText: "Selected week is out of bounds",
    });
  }

  return week;
}

const HOME_SEASON_FILES = [
  SeasonFile.Settings,
  SeasonFile.Teams,
  SeasonFile.Matchups,
  SeasonFile.Bracket,
  SeasonFile.BoxScores,
  SeasonFile.Standings,
] as const;

type HomeSeasonFiles = LoadedSeasonFiles<typeof HOME_SEASON_FILES>;

export type HomeSeasonData = HomeSeasonFiles & {
  year: number;
  reports: Report[];
  metrics: SeasonMetrics;
};

export type HomeLoaderState =
  | Exclude<HomeState, { kind: "preseason" }>
  | { kind: "preseason"; previousSeason: HomeSeasonData | null };

export type HomePreviewMode = "preseason" | "playoffs" | "season-over";

export type HomeLoaderData = {
  homeState: HomeLoaderState;
  preview: HomePreviewMode | null;
  season: HomeSeasonData;
};

export type WeekLoaderData = {
  season: HomeSeasonData;
  week: number;
  weekMetrics: WeekMetrics;
};

export type MatchupDetailLoaderData = {
  season: HomeSeasonData;
  week: number;
  matchupIndex: number;
  matchup: HomeSeasonData["matchups"][number]["matchups"][number];
  status: HomeSeasonData["matchups"][number]["status"];
  boxScore: HomeSeasonData["box_scores"][number];
  records: SeasonMatchupWeek["records"];
  homeOptimalLineup: OptimalLineupPlayer[];
  awayOptimalLineup: OptimalLineupPlayer[];
  homePerformance: WeekMetrics["performances"][number] | undefined;
  awayPerformance: WeekMetrics["performances"][number] | undefined;
  matchupInsight: string | null;
  closestGame: boolean;
  report: Report | null;
};

const SEASON_HUB_FILES = [
  ...HOME_SEASON_FILES,
  SeasonFile.Draft,
  SeasonFile.Transactions,
] as const;

type SeasonHubFiles = LoadedSeasonFiles<typeof SEASON_HUB_FILES>;

export type SeasonLoaderData = SeasonHubFiles & {
  year: number;
  reports: Report[];
  metrics: SeasonMetrics;
  matchupWeeks: SeasonMatchupWeek[];
};

async function loadHomeSeasonData(year: number): Promise<HomeSeasonData> {
  const files = await loadSeasonFiles(year, HOME_SEASON_FILES);

  return {
    year,
    reports: reportsList.filter((report) => report.season === year),
    ...files,
    metrics: calculateSeasonMetrics({ year, ...files }),
  };
}

async function loadPreviousSeasonData(
  currentSeason: number,
): Promise<HomeSeasonData | null> {
  const previousSeason = seasonList
    .filter((year) => year < currentSeason)
    .sort((a, b) => b - a)[0];

  return previousSeason === undefined
    ? null
    : loadHomeSeasonData(previousSeason);
}

async function loadLatestCompletedSeason(
  currentSeasonData: HomeSeasonData,
): Promise<HomeSeasonData | null> {
  const seasonsDescending = [...seasonList].sort((a, b) => b - a);

  for (const year of seasonsDescending) {
    const data =
      year === currentSeasonData.year
        ? currentSeasonData
        : await loadHomeSeasonData(year);

    if (data.bracket.champion !== null) {
      return data;
    }
  }

  return null;
}

export async function defaultLoader({ request }: LoaderFunctionArgs) {
  const searchParams = new URL(request.url).searchParams;
  const season = searchParams.get("season") ?? undefined;
  const week = searchParams.get("week") ?? undefined;
  const previewParam = searchParams.get("preview");
  const preview: HomePreviewMode | null =
    previewParam === "preseason" ||
    previewParam === "playoffs" ||
    previewParam === "season-over"
      ? previewParam
      : null;

  if (week && !season) {
    throw new Response(week, {
      status: 400,
      statusText: "Week requires a season",
    });
  }

  if (!season) {
    const currentSeason = Math.max(...seasonList);
    const currentSeasonData = await loadHomeSeasonData(currentSeason);
    const { settings, bracket } = currentSeasonData;
    const homeState = getHomeState(
      settings.week_status,
      settings.current_week,
      settings.regular_season_length,
      bracket.champion?.team_id ?? null,
    );

    if (preview === "preseason") {
      return {
        homeState: {
          kind: "preseason",
          previousSeason: await loadPreviousSeasonData(currentSeason),
        },
        preview,
        season: currentSeasonData,
      } satisfies HomeLoaderData;
    }

    if (preview === "playoffs") {
      return {
        homeState: {
          kind: "playoffs",
          week:
            settings.playoff_weeks[0] ??
            settings.regular_season_length + 1,
        },
        preview,
        season: currentSeasonData,
      } satisfies HomeLoaderData;
    }

    if (preview === "season-over") {
      const completedSeason =
        await loadLatestCompletedSeason(currentSeasonData);

      if (completedSeason?.bracket.champion) {
        return {
          homeState: {
            kind: "seasonOver",
            championId: completedSeason.bracket.champion.team_id,
          },
          preview,
          season: completedSeason,
        } satisfies HomeLoaderData;
      }
    }

    if (homeState.kind === "preseason") {
      return {
        homeState: {
          kind: "preseason",
          previousSeason: await loadPreviousSeasonData(currentSeason),
        },
        preview: null,
        season: currentSeasonData,
      } satisfies HomeLoaderData;
    }

    return {
      homeState,
      preview: null,
      season: currentSeasonData,
    } satisfies HomeLoaderData;
  }

  assertValidSeason(season);

  if (!week) {
    return replace(`/seasons/${season}`);
  }

  await assertValidWeek(season, week);

  return replace(`/seasons/${season}/weeks/${week}`);
}

export function latestSeasonLoader() {
  const latestSeason = Math.max(...seasonList);

  return redirect(`/seasons/${latestSeason}`);
}

export function seasonLoader({ params }: LoaderFunctionArgs) {
  assertValidSeason(params.season);
  return null;
}

export async function seasonHubLoader({ params }: LoaderFunctionArgs) {
  assertValidSeason(params.season);
  const year = Number(params.season);
  const files = await loadSeasonFiles(year, SEASON_HUB_FILES);

  return {
    year,
    reports: reportsList.filter((report) => report.season === year),
    ...files,
    metrics: calculateSeasonMetrics({ year, ...files }),
    matchupWeeks: calculateSeasonMatchupWeeks(
      files.matchups,
      files.teams,
    ),
  } satisfies SeasonLoaderData;
}

export async function weekLoader({ params }: LoaderFunctionArgs) {
  assertValidSeason(params.season);

  const week = await assertValidWeek(params.season, params.week);

  const season = await loadHomeSeasonData(Number(params.season));
  const otherSeasonBoxScores = await Promise.all(
    seasonList
      .filter((year) => year !== season.year)
      .map((year) => loadSeasonFile(year, SeasonFile.BoxScores)),
  );
  const historicalScores = [
    season.box_scores,
    ...otherSeasonBoxScores,
  ].flatMap((boxScores) =>
    boxScores
      .filter(
        (boxScore) => boxScore.status === "final" && !boxScore.is_playoff,
      )
      .flatMap((boxScore) => [
        boxScore.home_score,
        boxScore.away_score,
      ]),
  );

  return {
    season,
    week,
    weekMetrics: calculateWeekMetrics(season, week, historicalScores),
  } satisfies WeekLoaderData;
}

export async function matchupDetailLoader({
  params,
}: LoaderFunctionArgs) {
  assertValidSeason(params.season);
  const week = await assertValidWeek(params.season, params.week);
  const homeTeamId = Number(params.homeTeamId);
  const awayTeamId = Number(params.awayTeamId);

  if (
    !Number.isInteger(homeTeamId) ||
    !Number.isInteger(awayTeamId) ||
    homeTeamId <= 0 ||
    awayTeamId <= 0
  ) {
    throw new Response("invalid matchup", {
      status: 404,
      statusText: "Matchup not found",
    });
  }

  const season = await loadHomeSeasonData(Number(params.season));
  const matchupWeek = season.matchups.find((item) => item.week === week);
  const matchupIndex = matchupWeek?.matchups.findIndex(
    (item) =>
      item.home_team_id === homeTeamId &&
      item.away_team_id === awayTeamId,
  ) ?? -1;
  const matchup = matchupWeek?.matchups[matchupIndex];
  const boxScore = season.box_scores.find(
    (item) =>
      item.week === week &&
      item.home_team_id === homeTeamId &&
      item.away_team_id === awayTeamId,
  );

  if (!matchupWeek || !matchup || !boxScore) {
    throw new Response(`${homeTeamId} vs ${awayTeamId}`, {
      status: 404,
      statusText: "Matchup not found",
    });
  }

  const weekMetrics = calculateWeekMetrics(season, week);
  const seasonMetrics = calculateSeasonMetrics(season, week);
  const records = calculateSeasonMatchupWeeks(
    season.matchups,
    season.teams,
  ).find((item) => item.week === week)?.records ?? {};
  const closest = seasonMetrics.awards.closestGame;

  return {
    season,
    week,
    matchupIndex,
    matchup,
    status: matchupWeek.status,
    boxScore,
    records,
    homeOptimalLineup: getOptimalLineup(
      boxScore.home_lineup,
      season.settings,
    ).players,
    awayOptimalLineup: getOptimalLineup(
      boxScore.away_lineup,
      season.settings,
    ).players,
    homePerformance: weekMetrics.performances.find(
      ({ teamId }) => teamId === homeTeamId,
    ),
    awayPerformance: weekMetrics.performances.find(
      ({ teamId }) => teamId === awayTeamId,
    ),
    matchupInsight:
      weekMetrics.matchupInsights.find(
        (insight) =>
          insight.homeTeamId === homeTeamId &&
          insight.awayTeamId === awayTeamId,
      )?.text ?? null,
    closestGame:
      closest?.week === week &&
      closest.winnerTeamId ===
        (boxScore.home_score >= boxScore.away_score
          ? homeTeamId
          : awayTeamId) &&
      closest.loserTeamId ===
        (boxScore.home_score >= boxScore.away_score
          ? awayTeamId
          : homeTeamId),
    report:
      season.reports.find(({ week: reportWeek }) => reportWeek === week) ??
      null,
  } satisfies MatchupDetailLoaderData;
}
