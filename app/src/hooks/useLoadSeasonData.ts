import { useEffect, useState } from "react";
import { loadSeasonFile, SeasonFile } from "../utils/seasonDataLoader";
import type { BoxScore, Matchup, Settings, Team } from "../models/models";

type FileTypeMap = {
  teams: Team[];
  box_scores: BoxScore[];
  matchups: Matchup[];
  settings: Settings;
};

type FileData<T extends readonly SeasonFile[]> = {
  [K in T[number]]: FileTypeMap[Extract<K, keyof FileTypeMap>];
};

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };

export const useLoadSeasonData = <T extends readonly SeasonFile[]>(
  season: number,
  files: T,
) => {
  const [state, setState] = useState<LoadState<FileData<T>>>({
    status: "loading",
  });

  useEffect(() => {
    const loadData = async () => {
      setState({ status: "loading" });
      try {
        let results = await Promise.all(
          files.map((file) => {
            return loadSeasonFile(season, file);
          }),
        );

        let entries = files.map((file, ind) => {
          return [file, results[ind]];
        });

        setState({
          status: "success",
          data: Object.fromEntries(entries) as FileData<T>,
        });
      } catch (error) {
        if (error instanceof Error) {
          setState({ status: "error", error: error.message });
        } else {
          setState({
            status: "error",
            error: "There was an unknown error fetching data",
          });
        }
      }
    };
    loadData();
  }, [season, files]);

  return { state };
};
