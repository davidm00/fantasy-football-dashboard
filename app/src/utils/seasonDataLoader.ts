import seasonsList from "../data/seasons.json";
import type {
  BoxScore,
  Bracket,
  Draft,
  Matchup,
  Settings,
  Standing,
  Team,
  Transaction,
  WeekStatus,
} from "../models/models";

const seasonFileLoaders = import.meta.glob<{ default: unknown }>(
  "../data/*/*.json",
);

export const SeasonFile = {
  BoxScores: "box_scores",
  Draft: "draft",
  Matchups: "matchups",
  Settings: "settings",
  Standings: "standings",
  Teams: "teams",
  Transactions: "transactions",
  Bracket: "bracket",
} as const;

export type SeasonFile = (typeof SeasonFile)[keyof typeof SeasonFile];

export type SeasonFileDataMap = {
  [SeasonFile.BoxScores]: BoxScore[];
  [SeasonFile.Bracket]: Bracket;
  [SeasonFile.Draft]: Draft;
  [SeasonFile.Matchups]: Matchup[];
  [SeasonFile.Settings]: Settings;
  [SeasonFile.Standings]: Standing[];
  [SeasonFile.Teams]: Team[];
  [SeasonFile.Transactions]: Transaction[];
};

export type LoadableSeasonFile = keyof SeasonFileDataMap;

export type LoadedSeasonFiles<T extends readonly LoadableSeasonFile[]> = {
  [K in T[number]]: SeasonFileDataMap[K];
};

export function loadSeasonFile<T extends LoadableSeasonFile>(
  season: number,
  filename: T,
): Promise<SeasonFileDataMap[T]>;
export function loadSeasonFile(
  season: number,
  filename: SeasonFile,
): Promise<unknown>;
export async function loadSeasonFile(
  season: number,
  filename: SeasonFile,
): Promise<unknown> {
  if (!seasonsList.includes(season)) {
    throw new Error(`${season} is not a valid season.`);
  }
  const path = `../data/${season}/${filename}.json`;
  const loadFile = seasonFileLoaders[path];

  if (!loadFile) {
    throw new Error(`${season} is not a valid season.`);
  }

  const module = await loadFile();
  return module.default;
}

export async function loadSeasonFiles<
  T extends readonly LoadableSeasonFile[],
>(season: number, files: T): Promise<LoadedSeasonFiles<T>> {
  const results = await Promise.all(
    files.map((file) => loadSeasonFile(season, file)),
  );
  const entries = files.map((file, index) => [file, results[index]]);

  return Object.fromEntries(entries) as LoadedSeasonFiles<T>;
}

export type HomeState =
  | { kind: "preseason" }
  | { kind: "seasonOver"; championId: number }
  | { kind: "playoffs"; week: number }
  | { kind: "betweenWeeks"; upcomingWeek: number };

export const getHomeState = (
  weekStatus: Record<string, WeekStatus>,
  currentWeek: number,
  regSeasonLength: number,
  championId: number | null,
): HomeState => {
  if (championId !== null) {
    return { kind: "seasonOver", championId: championId };
  }
  if (currentWeek > regSeasonLength) {
    return { kind: "playoffs", week: currentWeek };
  }

  if (Object.values(weekStatus).every((w) => w === "not_started")) {
    return { kind: "preseason" };
  }

  const weekEntries = Object.entries(weekStatus).map(
    ([week, status]) => [Number(week), status] as const,
  );
  const inProgressWeek = weekEntries.reduce(
    (latest, [week, status]) =>
      status === "in_progress" ? Math.max(latest, week) : latest,
    0,
  );

  if (inProgressWeek > 0) {
    return { kind: "betweenWeeks", upcomingWeek: inProgressWeek };
  }

  if (weekEntries.every(([, status]) => status === "final")) {
    const latestFinalWeek = Math.max(...weekEntries.map(([week]) => week));
    return { kind: "betweenWeeks", upcomingWeek: latestFinalWeek };
  }

  return { kind: "betweenWeeks", upcomingWeek: currentWeek };
};
