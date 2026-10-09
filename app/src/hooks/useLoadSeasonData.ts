import { useEffect, useState } from "react";
import {
  loadSeasonFiles,
  type LoadableSeasonFile,
  type LoadedSeasonFiles,
} from "../utils/seasonDataLoader";

type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };

type InitialSeasonData<T extends readonly LoadableSeasonFile[]> = {
  year: number;
} & LoadedSeasonFiles<T>;

type LoadedSeasonState<T> = {
  season: number;
  state:
    | { status: "error"; error: string }
    | { status: "success"; data: T };
};

export const useLoadSeasonData = <T extends readonly LoadableSeasonFile[]>(
  season: number,
  files: T,
  initialData?: InitialSeasonData<T>,
) => {
  const [loadedState, setLoadedState] = useState<
    LoadedSeasonState<LoadedSeasonFiles<T>> | undefined
  >();

  const state: LoadState<LoadedSeasonFiles<T>> =
    initialData?.year === season
      ? { status: "success", data: initialData }
      : loadedState?.season === season
        ? loadedState.state
        : { status: "loading" };

  useEffect(() => {
    if (initialData?.year === season) {
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        const data = await loadSeasonFiles(season, files);
        if (!cancelled) {
          setLoadedState({
            season,
            state: { status: "success", data },
          });
        }
      } catch (error) {
        if (cancelled) return;

        if (error instanceof Error) {
          setLoadedState({
            season,
            state: { status: "error", error: error.message },
          });
        } else {
          setLoadedState({
            season,
            state: {
              status: "error",
              error: "There was an unknown error fetching data",
            },
          });
        }
      }
    };
    void loadData();

    return () => {
      cancelled = true;
    };
  }, [season, files, initialData]);

  return { state };
};
