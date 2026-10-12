import type { BracketGame, Team } from "../../models/models";
import { Link } from "react-router";
import type { HomeSeasonData } from "../../routes/loader";
import { getTeam } from "../../utils/homeViewUtils";
import { getPlayoffRounds } from "../../utils/playoffRounds";

type BracketSeason = Pick<
  HomeSeasonData,
  "year" | "bracket" | "settings" | "teams" | "box_scores"
>;

function PlayoffBracket({
  season,
  seeds,
}: {
  season: BracketSeason;
  seeds: Team[];
}) {
  const rounds = getPlayoffRounds(season.settings, season.bracket);
  return (
    <>
      <div className="home-bracket-grid">
        {rounds.map(({ week, label }, roundIndex) => (
          <BracketRoundColumn
            key={week}
            roundIndex={roundIndex}
            roundCount={rounds.length}
            week={week}
            label={label}
            season={season}
            seeds={seeds}
          />
        ))}
      </div>
      <p className="home-panel-note">
        Round 1 includes the opening games and byes. Later rounds show the
        teams already known or the matchup each winner advances into.
      </p>
    </>
  );
}

function BracketRoundColumn({
  roundIndex,
  roundCount,
  week,
  label,
  season,
  seeds,
}: {
  roundIndex: number;
  roundCount: number;
  week: number;
  label: string;
  season: BracketSeason;
  seeds: Team[];
}) {
  const round = season.bracket.rounds.find((item) => item.week === week);
  const games = round?.games.filter(
    (game) => game.tier === "WINNERS_BRACKET",
  );
  const getDetailPath = (game: BracketGame) => {
    if (game.is_bye) return undefined;
    const boxScore = season.box_scores.find(
      (boxScore) =>
        boxScore.week === week &&
        ((boxScore.home_team_id === game.home_team_id &&
          boxScore.away_team_id === game.away_team_id) ||
         (boxScore.home_team_id === game.away_team_id &&
          boxScore.away_team_id === game.home_team_id)),
    );
    return boxScore
      ? `/seasons/${season.year}/weeks/${week}/matchups/${boxScore.home_team_id}/${boxScore.away_team_id}`
      : undefined;
  };

  return (
    <div className="home-bracket-round">
      <h3>{label}</h3>
      <span>Week {week}</span>
      <div>
        {games?.length
          ? games.map((game, index) => (
              <BracketGameCard
                key={`${week}-${game.home_team_id}-${game.away_team_id}-${index}`}
                game={game}
                teams={season.teams}
                detailTo={getDetailPath(game)}
              />
            ))
          : getPlaceholderBracketGames(roundIndex, roundCount, seeds).map(
              (game, index) => (
                <article
                  className="home-bracket-game"
                  key={`${roundIndex}-${index}`}
                >
                  <span className="home-status">{game.status}</span>
                  <strong>{game.home}</strong>
                  <strong>{game.away}</strong>
                  <small>{game.note}</small>
                </article>
              ),
            )}
      </div>
    </div>
  );
}

function BracketGameCard({
  game,
  teams,
  detailTo,
}: {
  game: BracketGame;
  teams: Team[];
  detailTo?: string;
}) {
  const home = game.home_team_id
    ? getTeam(teams, game.home_team_id)
    : undefined;
  const away = game.away_team_id
    ? getTeam(teams, game.away_team_id)
    : undefined;

  return (
    <article className="home-bracket-game">
      <span className="home-status">
        {game.is_bye ? "Bye" : game.winner ? "Final" : "Waiting"}
      </span>
      <strong>
        {home?.team_name ?? "TBD"} <b>{game.home_score ?? "—"}</b>
      </strong>
      {!game.is_bye && (
        <strong>
          {away?.team_name ?? "TBD"} <b>{game.away_score ?? "—"}</b>
        </strong>
      )}
      <small>{game.is_bye ? "Advances automatically" : "Playoff game"}</small>
      {detailTo && <Link to={detailTo}>See the box score</Link>}
      {!game.is_bye && !detailTo && (
        <small>Box score not available for this pairing.</small>
      )}
    </article>
  );
}

function getPlaceholderBracketGames(roundIndex: number, roundCount: number, seeds: Team[]) {
  const seed = (index: number) =>
    seeds[index]
      ? `[${index + 1}] ${seeds[index].team_name}`
      : `Seed ${index + 1}`;

  if (roundCount === 1 || roundIndex === roundCount - 1) {
    return [
      {
        status: "Waiting",
        home: roundCount === 1 ? seed(0) : "Semifinal 1 winner",
        away: roundCount === 1 ? seed(1) : "Semifinal 2 winner",
        note: "Championship game",
      },
    ];
  }

  if (roundCount === 2) {
    return [
      { status: "Not started", home: seed(0), away: seed(3), note: "Semifinal 1" },
      { status: "Not started", home: seed(1), away: seed(2), note: "Semifinal 2" },
    ];
  }

  if (roundCount === 3 && roundIndex === 0) {
    return [
      {
        status: "Bye",
        home: seed(0),
        away: "",
        note: "Advances to the semifinal",
      },
      {
        status: "Not started",
        home: seed(3),
        away: seed(4),
        note: "Winner plays Seed 1",
      },
      {
        status: "Not started",
        home: seed(2),
        away: seed(5),
        note: "Winner plays Seed 2",
      },
      {
        status: "Bye",
        home: seed(1),
        away: "",
        note: "Advances to the semifinal",
      },
    ];
  }

  if (roundCount === 3 && roundIndex === 1) {
    return [
      {
        status: "Waiting",
        home: seed(0),
        away: "Winner of 4 vs 5",
        note: "Semifinal 1",
      },
      {
        status: "Waiting",
        home: seed(1),
        away: "Winner of 3 vs 6",
        note: "Semifinal 2",
      },
    ];
  }

  return [
    { status: "Waiting", home: "TBD", away: "TBD", note: "Pairings not set" },
  ];
}

export default PlayoffBracket;
