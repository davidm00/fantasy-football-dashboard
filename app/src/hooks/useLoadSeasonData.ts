import { useEffect, useState } from "react";
import { loadSeasonFile, SeasonFile } from "../utils/seasonDataLoader";
import type { BoxScore, Matchup, Settings, Team } from "../models/models";

export const useLoadSeasonData = (season: number, files: SeasonFile[]) => {
  const [boxScores, setBoxScores] = useState<BoxScore[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [settings, setSettings] = useState<Settings>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        let results = await Promise.all(
          files.map((file) => {
            return loadSeasonFile(season, file);
          }),
        );
        results.map((r, ind) => {
          switch (files[ind]) {
            case SeasonFile.BoxScores:
              setBoxScores(r as BoxScore[]);
              break;
            case SeasonFile.Teams:
              setTeams(r as Team[]);
              break;
            case SeasonFile.Matchups:
              setMatchups((r as Matchup[]).filter((m) => m.status === "final"));
              break;
            case SeasonFile.Settings:
              setSettings(r as Settings);
              break;
            default:
              break;
          }
        });
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        }
        setError("There was an unknown error fetching data");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [season, files]);

  return { boxScores, teams, matchups, settings, error, loading };
};
