import seasonsList from "../data/seasons.json";

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
} as const;

export type SeasonFile = (typeof SeasonFile)[keyof typeof SeasonFile];

export async function loadSeasonFile(season: number, filename: SeasonFile) {
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
