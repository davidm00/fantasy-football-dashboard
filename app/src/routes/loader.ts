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
  calculateSeasonMetrics,
  calculateWeekMetrics,
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

const SEASON_HUB_FILES = [
  ...HOME_SEASON_FILES,
  SeasonFile.Draft,
  SeasonFile.Transactions,
] as const;

type SeasonHubFiles = LoadedSeasonFiles<typeof SEASON_HUB_FILES>;

export type SeasonLoaderData = SeasonHubFiles & {
  year: number;
  metrics: SeasonMetrics;
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
    ...files,
    metrics: calculateSeasonMetrics({ year, ...files }),
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
