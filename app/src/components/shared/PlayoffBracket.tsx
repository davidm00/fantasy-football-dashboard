import type { BracketGame, Team } from "../../models/models";
import type { HomeSeasonData } from "../../routes/loader";
import { getTeam } from "../../utils/homeViewUtils";

type BracketSeason = Pick<
  HomeSeasonData,
  "bracket" | "settings" | "teams"
>;

function PlayoffBracket({
  season,
  seeds,
}: {
  season: BracketSeason;
  seeds: Team[];
}) {
  return (
    <>
      <div className="home-bracket-grid">
        {[0, 1, 2].map((roundIndex) => (
          <BracketRoundColumn
            key={roundIndex}
            roundIndex={roundIndex}
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
  season,
  seeds,
}: {
  roundIndex: number;
  season: BracketSeason;
  seeds: Team[];
}) {
  const labels = ["Round 1 · Quarterfinals", "Semifinals", "Championship"];
  const week = season.settings.regular_season_length + roundIndex + 1;
  const round = season.bracket.rounds.find((item) => item.week === week);
  const games = round?.games.filter(
    (game) => game.tier === "WINNERS_BRACKET",
  );

  return (
    <div className="home-bracket-round">
      <h3>{labels[roundIndex]}</h3>
      <span>Week {week}</span>
      <div>
        {games?.length
          ? games.map((game, index) => (
              <BracketGameCard
                key={`${week}-${game.home_team_id}-${game.away_team_id}-${index}`}
                game={game}
                teams={season.teams}
              />
            ))
          : getPlaceholderBracketGames(roundIndex, seeds).map(
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
}: {
  game: BracketGame;
  teams: Team[];
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
    </article>
  );
}

function getPlaceholderBracketGames(roundIndex: number, seeds: Team[]) {
  const seed = (index: number) =>
    seeds[index]
      ? `[${index + 1}] ${seeds[index].team_name}`
      : `Seed ${index + 1}`;

  if (roundIndex === 0) {
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

  if (roundIndex === 1) {
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
    {
      status: "Waiting",
      home: "Semifinal 1 winner",
      away: "Semifinal 2 winner",
      note: "Championship game",
    },
  ];
}

export default PlayoffBracket;
