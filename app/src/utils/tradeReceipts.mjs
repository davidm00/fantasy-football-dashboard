export const isStarter = (player) =>
  !["BE", "IR", "ER"].includes(player.slot_position);

export function getTradeReceipts(season, trade) {
  const teamIds = new Set(season.teams.map(({ team_id }) => team_id));
  return trade.team_ids.map((teamId) => {
    const players = new Set(trade.items.filter(({ to_team_id }) => to_team_id === teamId)
      .map(({ player_id }) => player_id));
    const weeks = season.matchups.filter(({ week, status }) =>
      status === "final" && week > trade.week && week <= season.settings.regular_season_length,
    ).flatMap(({ week, matchups }) => matchups.filter((game) =>
      game.home_score !== null && game.away_score !== null &&
      teamIds.has(game.home_team_id) && teamIds.has(game.away_team_id) &&
      (game.home_team_id === teamId || game.away_team_id === teamId),
    ).map(() => week));
    let points = 0;
    let covered = 0;
    for (const week of weeks) {
      const box = season.box_scores.find((box) => box.week === week &&
        (box.home_team_id === teamId || box.away_team_id === teamId));
      if (box?.status !== "final") continue;
      const lineup = box.home_team_id === teamId ? box.home_lineup : box.away_lineup;
      if (!lineup.length) continue;
      covered++;
      points += lineup.filter((player) => isStarter(player) && players.has(player.player_id))
        .reduce((sum, player) => sum + player.points, 0);
    }
    return { teamId, points: covered ? points : null, covered, weeks: weeks.length };
  });
}
