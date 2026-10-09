import type { MatchupResult, Team, WeekStatus } from "../../models/models";
import {
  EMPTY_RECORD,
  formatRecord,
  getTeam,
  type TeamRecord,
} from "../../utils/homeViewUtils";

function MatchupCard({
  matchup,
  status,
  teams,
  records,
  insight,
  detailTo,
}: {
  matchup: MatchupResult;
  status: WeekStatus;
  teams: Team[];
  records: Record<number, TeamRecord>;
  insight?: string;
  detailTo?: string;
}) {
  const home = getTeam(teams, matchup.home_team_id);
  const away = getTeam(teams, matchup.away_team_id);
  let homeWon = false;
  let awayWon = false;

  if (
    status === "final" &&
    matchup.home_score !== null &&
    matchup.away_score !== null
  ) {
    homeWon = matchup.home_score > matchup.away_score;
    awayWon = matchup.away_score > matchup.home_score;
  }

  const card = (
    <>
      <span className={`home-status home-status-${status}`}>
        {status === "in_progress"
          ? "In progress"
          : status === "final"
            ? "Final"
            : "Not started"}
      </span>
      <TeamLine
        team={home}
        score={matchup.home_score}
        record={records[matchup.home_team_id] ?? EMPTY_RECORD}
        isWinner={homeWon}
        isLoser={awayWon}
      />
      <TeamLine
        team={away}
        score={matchup.away_score}
        record={records[matchup.away_team_id] ?? EMPTY_RECORD}
        isWinner={awayWon}
        isLoser={homeWon}
      />
      {insight && <p className="matchup-insight">{insight}</p>}
    </>
  );

  return (
    <article className="home-pairing-card">
      {detailTo ? (
        <Link className="home-pairing-card-link" to={detailTo}>
          {card}
        </Link>
      ) : card}
    </article>
  );
}

function TeamLine({
  team,
  score,
  record,
  isWinner,
  isLoser,
}: {
  team: Team | undefined;
  score: number | null;
  record: TeamRecord;
  isWinner: boolean;
  isLoser: boolean;
}) {
  return (
    <div
      className={`home-team-line${isWinner ? " home-team-line-winner" : ""}${isLoser ? " home-team-line-loser" : ""}`}
    >
      <div>
        <strong>
          {team?.owners[0]?.name ?? "Unknown manager"}
          {isWinner && <span className="matchup-winner-label">Winner</span>}
        </strong>
        <span>{team?.team_name ?? "Unknown team"}</span>
      </div>
      <div className="home-team-meta">
        <strong>{score ?? "—"}</strong>
        <span>{formatRecord(record)}</span>
      </div>
    </div>
  );
}

export default MatchupCard;
import { Link } from "react-router";
