import { Link } from "react-router";
import { recordText, type getManagerRivals, type getRivalryMeetings } from "../../utils/managerMetrics";

export default function RivalryDetail({ manager, rival, meetings, scope }: {
  manager: { id: string; name: string };
  rival: ReturnType<typeof getManagerRivals>[number];
  meetings: ReturnType<typeof getRivalryMeetings>;
  scope: string;
}) {
  return <>
    <span className="rivalry-detail-eyebrow">Selected rivalry · {scope === "all" ? "All time" : `${scope} regular season`}</span>
    <h2>{manager.name} vs {rival.name}</h2>
    <div className="rivalry-detail-metrics">
      <article><span>{scope === "all" ? "All-time record" : `${scope} record`}</span><strong>{recordText(rival)}</strong>
        <small>{rival.wins > rival.losses ? `${manager.name} leads` : rival.wins < rival.losses ? `${rival.name} leads` : "Series tied"}</small></article>
      <article><span>Avg margin</span><strong>{rival.averageMargin?.toFixed(1) ?? "Unavailable"}</strong><small>{rival.games} finalized meetings</small></article>
      {scope === "all" && rival.playoffGames > 0 && <article><span>Playoff meetings</span><strong>{rival.playoffGames}</strong></article>}
      <article><span>Trades together</span><strong>{rival.trades}</strong><small>{rival.trades ? "Recorded in this scope" : "None recorded in this scope"}</small></article>
    </div>
    <h3>Every meeting</h3>
    <p className="activity-note">Results and scores from {manager.name}'s perspective.</p>
    <ol className="rivalry-meetings">{meetings.map((game) => <li key={`${game.year}-${game.week}`}>
      <Link className="rivalry-meeting-link" to={game.path}><span>{game.year} W{game.week}</span><strong className={game.result === "W" ? "rivalry-result-win" : game.result === "L" ? "rivalry-result-loss" : ""}>{game.result}</strong>
        <span>{game.score.toFixed(1)} – {game.opponentScore.toFixed(1)}</span>{game.playoff && <small>Playoffs</small>}
        <span className="rivalry-meeting-open">View matchup →</span></Link>
    </li>)}</ol>
    <Link className="section-route-link activity-cta" to={`/managers/${rival.id}?season=${scope}`}>Open {rival.name}'s profile →</Link>
  </>;
}
