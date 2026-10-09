import type { HomeSeasonData } from "../../routes/loader";
import {
  formatRecord,
  getFinalSeasonStandings,
  getSeasonStandings,
} from "../../utils/homeViewUtils";

function StandingsPanel({
  title,
  subtitle,
  season,
  limit,
  throughWeek,
  final = false,
  showPower = false,
}: {
  title: string;
  subtitle: string;
  season: HomeSeasonData;
  limit?: number;
  throughWeek?: number;
  final?: boolean;
  showPower?: boolean;
}) {
  const standings = final
    ? getFinalSeasonStandings(season)
    : getSeasonStandings(season, throughWeek);

  return (
    <section
      className={`home-panel home-standings${showPower ? " home-standings-with-power" : ""}`}
    >
      <div className="home-section-heading">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
      <ol>
        {standings.slice(0, limit).map(({ team, record }, index) => {
          const powerRank =
            season.metrics.teams[team.team_id]?.power.rank;

          return (
            <li key={team.team_id}>
              <span className="home-standing-rank" aria-hidden="true">
                {index + 1}
              </span>
              <span className="home-standing-team">{team.team_name}</span>
              <span>{formatRecord(record)}</span>
              {showPower && (
                <span
                  className="home-standing-power"
                  aria-label={
                    powerRank === null || powerRank === undefined
                      ? "Power rank unavailable"
                      : `Power rank ${powerRank}`
                  }
                >
                  PWR {powerRank ?? "—"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default StandingsPanel;
