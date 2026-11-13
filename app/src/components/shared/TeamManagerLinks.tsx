import { Link } from "react-router";
import type { SeasonLoaderData } from "../../routes/loader";
import { getManagerName } from "../../utils/homeViewUtils";

export default function TeamManagerLinks({ season, teamId }: { season: SeasonLoaderData; teamId: number }) {
  const team = season.teams.find(({ team_id }) => team_id === teamId);
  return team?.owners.length ? <>{team.owners.map((owner, index) => (
    <span key={owner.id}>{index > 0 && " & "}
      <Link to={`/managers/${owner.id}?season=${season.year}`}>{owner.name}</Link>
    </span>
  ))}</> : <span>{getManagerName(team)}</span>;
}
