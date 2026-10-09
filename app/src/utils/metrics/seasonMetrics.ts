import type {
  BoxScore,
  Draft,
  Matchup,
  Settings,
  Standing,
  Team,
  Transaction,
} from "../../models/models";

export type MetricRecord = {
  wins: number;
  losses: number;
  ties: number;
};

export type MetricGame = {
  teamId: number;
  score: number;
  week: number;
};

export type TeamSeasonMetrics = {
  teamId: number;
  record: MetricRecord;
  pointsFor: number;
  pointsAgainst: number;
  weeklyHighs: number;
  weeklyLows: number;
  topHalfFinishes: number;
  weeksPlayed: number;
  allPlayRecord: MetricRecord;
  expectedWins: number;
  luck: number;
  unluckyLosses: number[];
  luckyWins: number[];
  closeGameRecord: MetricRecord;
  lineupEfficiency: number | null;
  pointsLeftOnBench: number;
  selfInflictedLosses: number[];
  longestWinStreak: number;
  longestLossStreak: number;
  weeklyRanks: WeeklyRank[];
};

export type WeeklyRank = {
  week: number;
  rank: number;
  score: number;
};

export type ClosestGameMetric = {
  week: number;
  winnerTeamId: number;
  loserTeamId: number;
  winnerScore: number;
  loserScore: number;
  margin: number;
};

export type BenchBlunderMetric = {
  week: number;
  teamId: number;
  benchedPlayer: string;
  benchPoints: number;
  startedPlayer: string;
  starterPoints: number;
  lost: boolean;
};

export type BestPickupMetric = {
  teamId: number;
  playerName: string;
  startedPoints: number;
  bidAmount: number;
};

export type DraftStealMetric = {
  teamId: number;
  playerName: string;
  round: number;
  roundPick: number;
  startedPoints: number;
};

export type SeasonSuperlative = {
  label: string;
  value: string;
  note: string;
  explanation?: string;
  presentation?: MetricPresentation;
};

export type MetricPresentation = "direct" | "comparative" | "narrative";

export type SeasonMetrics = {
  throughWeek: number;
  teams: Record<number, TeamSeasonMetrics>;
  highestGame: MetricGame | null;
  lowestGame: MetricGame | null;
  awards: {
    closestGame: ClosestGameMetric | null;
    benchBlunder: BenchBlunderMetric | null;
    bestPickup: BestPickupMetric | null;
    draftSteal: DraftStealMetric | null;
  };
  superlatives: {
    topScore: SeasonSuperlative;
    lowestScore: SeasonSuperlative;
    mostPoints: SeasonSuperlative;
    weeklyHighs: SeasonSuperlative;
    topHalf: SeasonSuperlative;
    allPlay: SeasonSuperlative;
    luckiest: SeasonSuperlative;
    unluckiest: SeasonSuperlative;
    lineupEfficiency: SeasonSuperlative;
    benchPoints: SeasonSuperlative;
    selfInflicted: SeasonSuperlative;
  };
};

export type SeasonMetricSource = {
  year: number;
  teams: Team[];
  settings: Settings;
  matchups: Matchup[];
  box_scores: BoxScore[];
  standings: Standing[];
  draft?: Draft;
  transactions?: Transaction[];
};

type MutableTeamMetrics = TeamSeasonMetrics & {
  lineupActualPoints: number;
  lineupOptimalPoints: number;
  currentWinStreak: number;
  currentLossStreak: number;
};

const EMPTY_SUPERLATIVE: SeasonSuperlative = {
  label: "Not available",
  value: "No completed games",
  note: "Check back after Week 1",
};

const round = (value: number, digits = 1) => Number(value.toFixed(digits));

const formatRecord = ({ wins, losses, ties }: MetricRecord) =>
  `${wins}-${losses}${ties ? `-${ties}` : ""}`;

const getManagerName = (teams: Team[], teamId: number) => {
  const team = teams.find((item) => item.team_id === teamId);
  return team?.owners.map(({ name }) => name).join(" & ") || team?.team_name ||
    "Unknown manager";
};

const formatManagers = (teams: Team[], metrics: TeamSeasonMetrics[]) =>
  metrics.map(({ teamId }) => getManagerName(teams, teamId)).join(" & ");

const createTeamMetrics = (teamId: number): MutableTeamMetrics => ({
  teamId,
  record: { wins: 0, losses: 0, ties: 0 },
  pointsFor: 0,
  pointsAgainst: 0,
  weeklyHighs: 0,
  weeklyLows: 0,
  topHalfFinishes: 0,
  weeksPlayed: 0,
  allPlayRecord: { wins: 0, losses: 0, ties: 0 },
  expectedWins: 0,
  luck: 0,
  unluckyLosses: [],
  luckyWins: [],
  closeGameRecord: { wins: 0, losses: 0, ties: 0 },
  lineupEfficiency: null,
  pointsLeftOnBench: 0,
  selfInflictedLosses: [],
  longestWinStreak: 0,
  longestLossStreak: 0,
  weeklyRanks: [],
  lineupActualPoints: 0,
  lineupOptimalPoints: 0,
  currentWinStreak: 0,
  currentLossStreak: 0,
});

function recordResult(
  record: MetricRecord,
  score: number,
  opponentScore: number,
) {
  if (score > opponentScore) record.wins += 1;
  else if (score < opponentScore) record.losses += 1;
  else record.ties += 1;
}

const FLEX_POSITIONS: Record<string, string[]> = {
  "RB/WR": ["RB", "WR"],
  "WR/TE": ["WR", "TE"],
  "RB/WR/TE": ["RB", "WR", "TE"],
  OP: ["QB", "RB", "WR", "TE"],
};

const OFFENSIVE_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "P"]);

function playerCanFillSlot(position: string, slot: string) {
  if (position === slot) return true;
  if (FLEX_POSITIONS[slot]?.includes(position)) return true;

  return (
    slot === "DP" &&
    !OFFENSIVE_POSITIONS.has(position) &&
    position !== "D/ST"
  );
}

function getStarterSlots(settings: Settings) {
  return Object.entries(settings.roster_slots).flatMap(([slot, count]) => {
    if (count <= 0 || slot === "BE" || slot === "IR" || slot === "ER") {
      return [];
    }

    return Array.from({ length: count }, () => slot);
  });
}

export function getOptimalLineupPoints(
  lineup: BoxScore["home_lineup"],
  settings: Settings,
) {
  const slots = getStarterSlots(settings);
  const fullMask = (1 << slots.length) - 1;
  let states = new Map<number, number>([[0, 0]]);

  for (const player of lineup) {
    const nextStates = new Map(states);

    for (const [mask, points] of states) {
      slots.forEach((slot, slotIndex) => {
        const slotBit = 1 << slotIndex;

        if (
          (mask & slotBit) === 0 &&
          playerCanFillSlot(player.position, slot)
        ) {
          const nextMask = mask | slotBit;
          const nextPoints = points + player.points;
          nextStates.set(
            nextMask,
            Math.max(nextStates.get(nextMask) ?? -Infinity, nextPoints),
          );
        }
      });
    }

    states = nextStates;
  }

  return states.get(fullMask) ?? Math.max(0, ...states.values());
}

function getStarterPointsByPlayer(source: SeasonMetricSource) {
  const totals = new Map<string, number>();

  for (const boxScore of source.box_scores.filter(
    (game) =>
      game.status === "final" &&
      !game.is_playoff &&
      game.week <= source.settings.regular_season_length,
  )) {
    const sides = [
      { teamId: boxScore.home_team_id, lineup: boxScore.home_lineup },
      { teamId: boxScore.away_team_id, lineup: boxScore.away_lineup },
    ];

    for (const side of sides) {
      for (const player of side.lineup) {
        if (player.slot_position === "BE" || player.slot_position === "IR") {
          continue;
        }

        const key = `${side.teamId}:${player.player_id}`;
        totals.set(key, (totals.get(key) ?? 0) + player.points);
      }
    }
  }

  return totals;
}

function getBenchBlunder(source: SeasonMetricSource) {
  let biggest: BenchBlunderMetric | null = null;

  for (const boxScore of source.box_scores.filter(
    (game) =>
      game.status === "final" &&
      !game.is_playoff &&
      game.week <= source.settings.regular_season_length,
  )) {
    const sides = [
      {
        teamId: boxScore.home_team_id,
        score: boxScore.home_score,
        opponentScore: boxScore.away_score,
        lineup: boxScore.home_lineup,
      },
      {
        teamId: boxScore.away_team_id,
        score: boxScore.away_score,
        opponentScore: boxScore.home_score,
        lineup: boxScore.away_lineup,
      },
    ];

    for (const side of sides) {
      const starters = side.lineup.filter(
        (player) =>
          player.slot_position !== "BE" && player.slot_position !== "IR",
      );
      const bench = side.lineup.filter(
        (player) => player.slot_position === "BE",
      );

      for (const benchedPlayer of bench) {
        for (const starter of starters) {
          if (
            !playerCanFillSlot(
              benchedPlayer.position,
              starter.slot_position,
            )
          ) {
            continue;
          }

          const gap = benchedPlayer.points - starter.points;
          const biggestGap = biggest
            ? biggest.benchPoints - biggest.starterPoints
            : 0;

          if (gap > biggestGap) {
            biggest = {
              week: boxScore.week,
              teamId: side.teamId,
              benchedPlayer: benchedPlayer.name,
              benchPoints: benchedPlayer.points,
              startedPlayer: starter.name,
              starterPoints: starter.points,
              lost: side.score < side.opponentScore,
            };
          }
        }
      }
    }
  }

  return biggest;
}

function getBestPickup(
  source: SeasonMetricSource,
  starterPoints: Map<string, number>,
) {
  let best: BestPickupMetric | null = null;

  for (const transaction of source.transactions ?? []) {
    if (transaction.status !== "EXECUTED") continue;

    for (const item of transaction.items) {
      if (item.type !== "ADD" || item.from_team_id !== 0) continue;

      const startedPoints =
        starterPoints.get(`${transaction.team_id}:${item.player_id}`) ?? 0;

      if (!best || startedPoints > best.startedPoints) {
        best = {
          teamId: transaction.team_id,
          playerName: item.player_name,
          startedPoints: round(startedPoints, 2),
          bidAmount: transaction.bid_amount,
        };
      }
    }
  }

  return best;
}

function getDraftSteal(
  source: SeasonMetricSource,
  starterPoints: Map<string, number>,
) {
  let best: (DraftStealMetric & { valueScore: number }) | null = null;

  for (const pick of source.draft?.picks ?? []) {
    const startedPoints =
      starterPoints.get(`${pick.team_id}:${pick.player_id}`) ?? 0;
    const valueScore = startedPoints * pick.round;

    if (!best || valueScore > best.valueScore) {
      best = {
        teamId: pick.team_id,
        playerName: pick.player_name,
        round: pick.round,
        roundPick: pick.round_pick,
        startedPoints: round(startedPoints, 2),
        valueScore,
      };
    }
  }

  if (!best) return null;

  const { valueScore: _, ...metric } = best;
  return metric;
}

function updateStreak(
  metrics: MutableTeamMetrics,
  score: number,
  opponentScore: number,
) {
  if (score > opponentScore) {
    metrics.currentWinStreak += 1;
    metrics.currentLossStreak = 0;
    metrics.longestWinStreak = Math.max(
      metrics.longestWinStreak,
      metrics.currentWinStreak,
    );
  } else if (score < opponentScore) {
    metrics.currentLossStreak += 1;
    metrics.currentWinStreak = 0;
    metrics.longestLossStreak = Math.max(
      metrics.longestLossStreak,
      metrics.currentLossStreak,
    );
  } else {
    metrics.currentWinStreak = 0;
    metrics.currentLossStreak = 0;
  }
}

function maxTeam(
  values: TeamSeasonMetrics[],
  selector: (metrics: TeamSeasonMetrics) => number,
) {
  return [...values].sort(
    (left, right) =>
      selector(right) - selector(left) || left.teamId - right.teamId,
  )[0];
}

function minTeam(
  values: TeamSeasonMetrics[],
  selector: (metrics: TeamSeasonMetrics) => number,
) {
  return [...values].sort(
    (left, right) =>
      selector(left) - selector(right) || left.teamId - right.teamId,
  )[0];
}

function tiedTeams(
  values: TeamSeasonMetrics[],
  selector: (metrics: TeamSeasonMetrics) => number,
  leader: TeamSeasonMetrics,
) {
  const leaderValue = selector(leader);
  return values.filter(
    (metrics) => Math.abs(selector(metrics) - leaderValue) < 0.0001,
  );
}

export function calculateSeasonMetrics(
  source: SeasonMetricSource,
  throughWeek = source.settings.regular_season_length,
): SeasonMetrics {
  const teamMetrics = new Map(
    source.teams.map((team) => [
      team.team_id,
      createTeamMetrics(team.team_id),
    ]),
  );
  const regularSeasonMatchups = source.matchups
    .filter(
      (week) =>
        week.status === "final" &&
        week.week <= throughWeek &&
        week.week <= source.settings.regular_season_length,
    )
    .sort((left, right) => left.week - right.week);
  let highestGame: MetricGame | null = null;
  let lowestGame: MetricGame | null = null;

  for (const week of regularSeasonMatchups) {
    const weeklyScores = week.matchups.flatMap((matchup) => {
      if (matchup.home_score === null || matchup.away_score === null) {
        return [];
      }

      return [
        {
          teamId: matchup.home_team_id,
          score: matchup.home_score,
          opponentScore: matchup.away_score,
        },
        {
          teamId: matchup.away_team_id,
          score: matchup.away_score,
          opponentScore: matchup.home_score,
        },
      ];
    });
    const rankedScores = [...weeklyScores].sort(
      (left, right) => right.score - left.score,
    );
    const highScore = rankedScores[0]?.score;
    const lowScore = rankedScores[rankedScores.length - 1]?.score;
    const topHalfCutoff = Math.ceil(rankedScores.length / 2);
    const topFourIds = new Set(
      rankedScores.slice(0, Math.min(4, rankedScores.length)).map(
        ({ teamId }) => teamId,
      ),
    );
    const bottomFourIds = new Set(
      rankedScores.slice(-Math.min(4, rankedScores.length)).map(
        ({ teamId }) => teamId,
      ),
    );

    for (const [rank, { teamId, score }] of rankedScores.entries()) {
      const metrics = teamMetrics.get(teamId);
      if (!metrics) continue;

      metrics.weeksPlayed += 1;
      metrics.weeklyRanks.push({ week: week.week, rank: rank + 1, score });
      if (score === highScore) metrics.weeklyHighs += 1;
      if (score === lowScore) metrics.weeklyLows += 1;
      if (rank < topHalfCutoff) metrics.topHalfFinishes += 1;

      if (!highestGame || score > highestGame.score) {
        highestGame = { teamId, score, week: week.week };
      }
      if (!lowestGame || score < lowestGame.score) {
        lowestGame = { teamId, score, week: week.week };
      }
    }

    for (const team of weeklyScores) {
      const metrics = teamMetrics.get(team.teamId);
      if (!metrics) continue;

      metrics.pointsFor += team.score;
      metrics.pointsAgainst += team.opponentScore;
      recordResult(metrics.record, team.score, team.opponentScore);
      updateStreak(metrics, team.score, team.opponentScore);

      for (const opponent of weeklyScores) {
        if (opponent.teamId !== team.teamId) {
          recordResult(metrics.allPlayRecord, team.score, opponent.score);
        }
      }

      if (Math.abs(team.score - team.opponentScore) < 5) {
        recordResult(metrics.closeGameRecord, team.score, team.opponentScore);
      }
      if (
        team.score < team.opponentScore &&
        topFourIds.has(team.teamId)
      ) {
        metrics.unluckyLosses.push(week.week);
      }
      if (
        team.score > team.opponentScore &&
        bottomFourIds.has(team.teamId)
      ) {
        metrics.luckyWins.push(week.week);
      }
    }
  }

  const boxScores = source.box_scores.filter(
    (boxScore) =>
      boxScore.status === "final" &&
      !boxScore.is_playoff &&
      boxScore.week <= throughWeek,
  );

  for (const boxScore of boxScores) {
    const sides = [
      {
        teamId: boxScore.home_team_id,
        score: boxScore.home_score,
        opponentScore: boxScore.away_score,
        lineup: boxScore.home_lineup,
      },
      {
        teamId: boxScore.away_team_id,
        score: boxScore.away_score,
        opponentScore: boxScore.home_score,
        lineup: boxScore.away_lineup,
      },
    ];

    for (const side of sides) {
      const metrics = teamMetrics.get(side.teamId);
      if (!metrics) continue;

      const optimalPoints = getOptimalLineupPoints(
        side.lineup,
        source.settings,
      );
      metrics.lineupActualPoints += side.score;
      metrics.lineupOptimalPoints += optimalPoints;
      metrics.pointsLeftOnBench += Math.max(0, optimalPoints - side.score);

      if (
        side.score < side.opponentScore &&
        optimalPoints > side.opponentScore
      ) {
        metrics.selfInflictedLosses.push(boxScore.week);
      }
    }
  }

  for (const metrics of teamMetrics.values()) {
    const allPlayGames =
      metrics.allPlayRecord.wins +
      metrics.allPlayRecord.losses +
      metrics.allPlayRecord.ties;
    const opponentsPerWeek =
      metrics.weeksPlayed > 0 ? allPlayGames / metrics.weeksPlayed : 0;
    metrics.expectedWins =
      opponentsPerWeek > 0
        ? (metrics.allPlayRecord.wins + metrics.allPlayRecord.ties / 2) /
          opponentsPerWeek
        : 0;
    metrics.luck =
      metrics.record.wins + metrics.record.ties / 2 - metrics.expectedWins;
    metrics.pointsFor = round(metrics.pointsFor, 2);
    metrics.pointsAgainst = round(metrics.pointsAgainst, 2);
    metrics.expectedWins = round(metrics.expectedWins);
    metrics.luck = round(metrics.luck);
    metrics.pointsLeftOnBench = round(metrics.pointsLeftOnBench, 2);
    metrics.lineupEfficiency =
      metrics.lineupOptimalPoints > 0
        ? round(
            (metrics.lineupActualPoints / metrics.lineupOptimalPoints) * 100,
          )
        : null;
  }

  const values = [...teamMetrics.values()];
  const completedGames = regularSeasonMatchups.flatMap((week) =>
    week.matchups.flatMap((matchup) => {
      if (matchup.home_score === null || matchup.away_score === null) {
        return [];
      }

      const homeWon = matchup.home_score >= matchup.away_score;
      return [
        {
          week: week.week,
          winnerTeamId: homeWon
            ? matchup.home_team_id
            : matchup.away_team_id,
          loserTeamId: homeWon
            ? matchup.away_team_id
            : matchup.home_team_id,
          winnerScore: homeWon ? matchup.home_score : matchup.away_score,
          loserScore: homeWon ? matchup.away_score : matchup.home_score,
          margin: Math.abs(matchup.home_score - matchup.away_score),
        },
      ];
    }),
  );
  const closestGame =
    [...completedGames].sort(
      (left, right) => left.margin - right.margin || left.week - right.week,
    )[0] ?? null;
  const starterPoints = getStarterPointsByPlayer(source);
  const awards = {
    closestGame,
    benchBlunder: getBenchBlunder(source),
    bestPickup: getBestPickup(source, starterPoints),
    draftSteal: getDraftSteal(source, starterPoints),
  };

  if (values.every(({ weeksPlayed }) => weeksPlayed === 0)) {
    return {
      throughWeek: 0,
      teams: Object.fromEntries(teamMetrics),
      highestGame,
      lowestGame,
      awards,
      superlatives: {
        topScore: { ...EMPTY_SUPERLATIVE, label: "Top single week" },
        lowestScore: { ...EMPTY_SUPERLATIVE, label: "Lowest single week" },
        mostPoints: { ...EMPTY_SUPERLATIVE, label: "Most points for" },
        weeklyHighs: { ...EMPTY_SUPERLATIVE, label: "Weekly highs" },
        topHalf: {
          ...EMPTY_SUPERLATIVE,
          label: "Top-half rate",
          explanation:
            "The share of completed weeks a manager ranked in the top half of the league in points.",
        },
        allPlay: {
          ...EMPTY_SUPERLATIVE,
          label: "All-play record",
          explanation:
            "The record a manager would have if they played every other team each week.",
        },
        luckiest: {
          ...EMPTY_SUPERLATIVE,
          label: "Luckiest",
          explanation:
            "Actual wins minus expected wins from all-play performance. Positive values indicate favorable scheduling.",
        },
        unluckiest: {
          ...EMPTY_SUPERLATIVE,
          label: "Unluckiest",
          explanation:
            "Actual wins minus expected wins from all-play performance. The lowest value indicates the least favorable schedule.",
        },
        lineupEfficiency: {
          ...EMPTY_SUPERLATIVE,
          label: "Lineup efficiency",
          explanation:
            "Points scored divided by the best valid lineup that could have been started from that week's roster.",
        },
        benchPoints: {
          ...EMPTY_SUPERLATIVE,
          label: "Points left on bench",
          explanation:
            "Best possible lineup points minus actual lineup points, added across completed weeks.",
        },
        selfInflicted: {
          ...EMPTY_SUPERLATIVE,
          label: "Self-inflicted losses",
          explanation:
            "Losses where the manager's best valid lineup would have beaten the opponent.",
        },
      },
    };
  }

  const mostPoints = maxTeam(values, ({ pointsFor }) => pointsFor);
  const mostWeeklyHighs = maxTeam(values, ({ weeklyHighs }) => weeklyHighs);
  const bestTopHalf = maxTeam(values, ({ topHalfFinishes, weeksPlayed }) =>
    weeksPlayed ? topHalfFinishes / weeksPlayed : 0,
  );
  const bestAllPlay = maxTeam(values, ({ allPlayRecord }) => {
    const games =
      allPlayRecord.wins + allPlayRecord.losses + allPlayRecord.ties;
    return games
      ? (allPlayRecord.wins + allPlayRecord.ties / 2) / games
      : 0;
  });
  const luckiest = maxTeam(values, ({ luck }) => luck);
  const unluckiest = minTeam(values, ({ luck }) => luck);
  const bestEfficiency = maxTeam(
    values.filter(({ lineupEfficiency }) => lineupEfficiency !== null),
    ({ lineupEfficiency }) => lineupEfficiency ?? 0,
  );
  const mostBenchPoints = maxTeam(
    values,
    ({ pointsLeftOnBench }) => pointsLeftOnBench,
  );
  const mostSelfInflicted = maxTeam(
    values,
    ({ selfInflictedLosses }) => selfInflictedLosses.length,
  );
  const latestWeek = Math.max(...regularSeasonMatchups.map(({ week }) => week));
  const topHalfSelector = ({
    topHalfFinishes,
    weeksPlayed,
  }: TeamSeasonMetrics) =>
    weeksPlayed ? topHalfFinishes / weeksPlayed : 0;
  const allPlaySelector = ({ allPlayRecord }: TeamSeasonMetrics) => {
    const games =
      allPlayRecord.wins + allPlayRecord.losses + allPlayRecord.ties;
    return games
      ? (allPlayRecord.wins + allPlayRecord.ties / 2) / games
      : 0;
  };

  return {
    throughWeek: latestWeek,
    teams: Object.fromEntries(teamMetrics),
    highestGame,
    lowestGame,
    awards,
    superlatives: {
      topScore: {
        label: "Top single week",
        presentation: "direct",
        value: highestGame
          ? `${getManagerName(source.teams, highestGame.teamId)} · ${highestGame.score.toFixed(2)}`
          : "Not available",
        note: highestGame ? `Week ${highestGame.week}` : "No completed games",
      },
      lowestScore: {
        label: "Lowest single week",
        presentation: "direct",
        value: lowestGame
          ? `${getManagerName(source.teams, lowestGame.teamId)} · ${lowestGame.score.toFixed(2)}`
          : "Not available",
        note: lowestGame ? `Week ${lowestGame.week}` : "No completed games",
      },
      mostPoints: {
        label: "Most points for",
        presentation: "direct",
        value: `${getManagerName(source.teams, mostPoints.teamId)} · ${mostPoints.pointsFor.toFixed(1)}`,
        note: `Through Week ${latestWeek}`,
      },
      weeklyHighs: {
        label: "Weekly high leader",
        presentation: "comparative",
        value: formatManagers(
          source.teams,
          tiedTeams(
            values,
            ({ weeklyHighs }) => weeklyHighs,
            mostWeeklyHighs,
          ),
        ),
        note: `${mostWeeklyHighs.weeklyHighs} of ${mostWeeklyHighs.weeksPlayed} weeks`,
      },
      topHalf: {
        label: "Top-half rate",
        presentation: "comparative",
        explanation:
          "The share of completed weeks a manager ranked in the top half of the league in points.",
        value: formatManagers(
          source.teams,
          tiedTeams(values, topHalfSelector, bestTopHalf),
        ),
        note: `${bestTopHalf.topHalfFinishes} of ${bestTopHalf.weeksPlayed} weeks`,
      },
      allPlay: {
        label: "Best all-play record",
        presentation: "comparative",
        explanation:
          "The record a manager would have if they played every other team each week.",
        value: formatManagers(
          source.teams,
          tiedTeams(values, allPlaySelector, bestAllPlay),
        ),
        note: formatRecord(bestAllPlay.allPlayRecord),
      },
      luckiest: {
        label: "Luckiest",
        presentation: "narrative",
        explanation:
          "Actual wins minus expected wins from all-play performance. Positive values indicate favorable scheduling.",
        value: formatManagers(
          source.teams,
          tiedTeams(values, ({ luck }) => luck, luckiest),
        ),
        note: `${luckiest.luck >= 0 ? "+" : ""}${luckiest.luck.toFixed(1)} wins vs all-play`,
      },
      unluckiest: {
        label: "Unluckiest",
        presentation: "narrative",
        explanation:
          "Actual wins minus expected wins from all-play performance. The lowest value indicates the least favorable schedule.",
        value: formatManagers(
          source.teams,
          tiedTeams(values, ({ luck }) => luck, unluckiest),
        ),
        note: `${unluckiest.luck >= 0 ? "+" : ""}${unluckiest.luck.toFixed(1)} wins vs all-play`,
      },
      lineupEfficiency: {
        label: "Best lineup efficiency",
        presentation: "comparative",
        explanation:
          "Points scored divided by the best valid lineup that could have been started from that week's roster.",
        value: bestEfficiency
          ? formatManagers(
              source.teams,
              tiedTeams(
                values,
                ({ lineupEfficiency }) => lineupEfficiency ?? 0,
                bestEfficiency,
              ),
            )
          : "Not available",
        note:
          bestEfficiency?.lineupEfficiency === null ||
          bestEfficiency === undefined
            ? "No lineup data"
            : `${bestEfficiency.lineupEfficiency.toFixed(1)}%`,
      },
      benchPoints: {
        label: "Most points left on bench",
        presentation: "narrative",
        explanation:
          "Best possible lineup points minus actual lineup points, added across completed weeks.",
        value: getManagerName(source.teams, mostBenchPoints.teamId),
        note: `${mostBenchPoints.pointsLeftOnBench.toFixed(1)} points`,
      },
      selfInflicted: {
        label: "Self-inflicted losses",
        presentation: "narrative",
        explanation:
          "Losses where the manager's best valid lineup would have beaten the opponent.",
        value: getManagerName(source.teams, mostSelfInflicted.teamId),
        note: `${mostSelfInflicted.selfInflictedLosses.length} lineup-flipped losses`,
      },
    },
  };
}
