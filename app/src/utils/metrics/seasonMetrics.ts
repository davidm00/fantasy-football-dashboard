import type {
  BoxScore,
  Draft,
  Lineup,
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
  power: TeamPowerMetrics;
};

export type WeeklyRank = {
  week: number;
  rank: number;
  score: number;
};

export type PowerTrendPoint = {
  week: number;
  score: number;
  rank: number;
};

export type TeamPowerMetrics = {
  pointsPerGame: number | null;
  seasonHigh: number | null;
  seasonLow: number | null;
  pointsVsLeagueAverage: number | null;
  score: number | null;
  rank: number | null;
  rankChange: number | null;
  trend: PowerTrendPoint[];
  tier: string | null;
  recentScore: number | null;
  recentWeekCount: number;
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
  position: string;
  round: number;
  roundPick: number;
  totalPoints: number;
  startedPoints: number;
  positionRank: number;
  positionCount: number;
  teamPointShare: number;
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
    powerLeader: SeasonSuperlative;
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
  weeklyPowerInputs: WeeklyPowerInput[];
};

type WeeklyPowerInput = {
  week: number;
  score: number;
  winValue: number;
};

const POWER_TIER_THRESHOLD = 0.95;

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
  power: {
    pointsPerGame: null,
    seasonHigh: null,
    seasonLow: null,
    pointsVsLeagueAverage: null,
    score: null,
    rank: null,
    rankChange: null,
    trend: [],
    tier: null,
    recentScore: null,
    recentWeekCount: 0,
  },
  lineupActualPoints: 0,
  lineupOptimalPoints: 0,
  currentWinStreak: 0,
  currentLossStreak: 0,
  weeklyPowerInputs: [],
});

function calculatePowerScore(inputs: WeeklyPowerInput[]) {
  if (inputs.length === 0) return null;

  const scores = inputs.map(({ score }) => score);
  const average =
    scores.reduce((total, score) => total + score, 0) / scores.length;
  const winPercentage =
    inputs.reduce((total, { winValue }) => total + winValue, 0) /
    inputs.length;

  return (
    (6 * average +
      2 * Math.max(...scores) +
      2 * Math.min(...scores) +
      400 * winPercentage) /
    10
  );
}

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
const DRAFT_VALUE_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

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
  return getOptimalLineup(lineup, settings).points;
}

export type OptimalLineupPlayer = Lineup & {
  selectedSlot: string;
};

export function getOptimalLineup(
  lineup: BoxScore["home_lineup"],
  settings: Settings,
) {
  const slots = getStarterSlots(settings);
  const fullMask = (1 << slots.length) - 1;
  let states = new Map<
    number,
    { points: number; players: OptimalLineupPlayer[] }
  >([[0, { points: 0, players: [] }]]);

  for (const player of lineup) {
    if (player.slot_position === "IR" || player.slot_position === "ER") {
      continue;
    }

    const nextStates = new Map(states);

    for (const [mask, state] of states) {
      slots.forEach((slot, slotIndex) => {
        const slotBit = 1 << slotIndex;

        if (
          (mask & slotBit) === 0 &&
          playerCanFillSlot(player.position, slot)
        ) {
          const nextMask = mask | slotBit;
          const nextPoints = state.points + player.points;
          const current = nextStates.get(nextMask);

          if (!current || nextPoints > current.points) {
            nextStates.set(nextMask, {
              points: nextPoints,
              players: [
                ...state.players,
                { ...player, selectedSlot: slot },
              ],
            });
          }
        }
      });
    }

    states = nextStates;
  }

  return (
    states.get(fullMask) ??
    [...states.values()].sort(
      (left, right) => right.points - left.points,
    )[0] ?? { points: 0, players: [] }
  );
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
        if (
          player.slot_position === "BE" ||
          player.slot_position === "IR" ||
          player.slot_position === "ER"
        ) {
          continue;
        }

        const key = `${side.teamId}:${player.player_id}`;
        totals.set(key, (totals.get(key) ?? 0) + player.points);
      }
    }
  }

  return totals;
}

type DraftValueCandidate = DraftStealMetric & {
  overallPick: number;
  utilization: number;
  valueScore: number;
};

function getPlayerSeasonTotals(source: SeasonMetricSource) {
  const totals = new Map<
    number,
    { playerName: string; position: string; points: number }
  >();

  for (const boxScore of source.box_scores.filter(
    (game) =>
      game.status === "final" &&
      !game.is_playoff &&
      game.week <= source.settings.regular_season_length,
  )) {
    for (const player of [
      ...boxScore.home_lineup,
      ...boxScore.away_lineup,
    ]) {
      const current = totals.get(player.player_id);
      totals.set(player.player_id, {
        playerName: player.name,
        position: player.position,
        points: (current?.points ?? 0) + player.points,
      });
    }
  }

  return totals;
}

function getTeamScoringTotals(source: SeasonMetricSource) {
  const totals = new Map<number, number>();

  for (const boxScore of source.box_scores.filter(
    (game) =>
      game.status === "final" &&
      !game.is_playoff &&
      game.week <= source.settings.regular_season_length,
  )) {
    totals.set(
      boxScore.home_team_id,
      (totals.get(boxScore.home_team_id) ?? 0) + boxScore.home_score,
    );
    totals.set(
      boxScore.away_team_id,
      (totals.get(boxScore.away_team_id) ?? 0) + boxScore.away_score,
    );
  }

  return totals;
}

function getDescendingPercentile(value: number, values: number[]) {
  if (values.length <= 1) return 1;

  const rank = 1 + values.filter((other) => other > value).length;
  return 1 - (rank - 1) / (values.length - 1);
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
          player.slot_position !== "BE" &&
          player.slot_position !== "IR" &&
          player.slot_position !== "ER",
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
  const eligiblePicks =
    source.draft?.picks.filter(({ is_keeper }) => !is_keeper) ?? [];
  const playerTotals = getPlayerSeasonTotals(source);
  const teamScoring = getTeamScoringTotals(source);
  const maxOverallPick = Math.max(
    1,
    ...eligiblePicks.map(
      ({ round, round_pick: roundPick }) =>
        (round - 1) * source.settings.team_count + roundPick,
    ),
  );
  const candidates: DraftValueCandidate[] = eligiblePicks.flatMap((pick) => {
    const player = playerTotals.get(pick.player_id);
    if (!player || !DRAFT_VALUE_POSITIONS.has(player.position)) return [];

    const startedPoints =
      starterPoints.get(`${pick.team_id}:${pick.player_id}`) ?? 0;
    const teamPoints = teamScoring.get(pick.team_id) ?? 0;
    const totalPoints = player.points;

    return [{
      teamId: pick.team_id,
      playerName: pick.player_name,
      position: player.position,
      round: pick.round,
      roundPick: pick.round_pick,
      totalPoints,
      startedPoints,
      positionRank: 0,
      positionCount: 0,
      teamPointShare: teamPoints > 0 ? startedPoints / teamPoints : 0,
      overallPick:
        (pick.round - 1) * source.settings.team_count + pick.round_pick,
      utilization: totalPoints > 0 ? startedPoints / totalPoints : 0,
      valueScore: 0,
    }];
  });

  for (const candidate of candidates) {
    const positionCandidates = candidates.filter(
      ({ position }) => position === candidate.position,
    );
    const observedAtPosition = [...playerTotals.values()]
      .filter(({ position }) => position === candidate.position)
      .map(({ points }) => points);
    candidate.positionRank =
      1 +
      observedAtPosition.filter(
        (points) => points > candidate.totalPoints,
      ).length;
    candidate.positionCount = observedAtPosition.length;

    const productionScore = getDescendingPercentile(
      candidate.totalPoints,
      observedAtPosition,
    );
    const contributionScore = getDescendingPercentile(
      candidate.teamPointShare,
      positionCandidates.map(({ teamPointShare }) => teamPointShare),
    );
    const draftCapitalScore =
      maxOverallPick > 1
        ? (candidate.overallPick - 1) / (maxOverallPick - 1)
        : 0;

    candidate.valueScore =
      productionScore * 0.45 +
      contributionScore * 0.25 +
      draftCapitalScore * 0.2 +
      Math.min(1, candidate.utilization) * 0.1;
  }

  const best = candidates
    .filter(({ totalPoints }) => totalPoints > 0)
    .sort(
      (left, right) =>
        right.valueScore - left.valueScore ||
        right.startedPoints - left.startedPoints ||
        right.overallPick - left.overallPick,
    )[0];
  if (!best) return null;

  const {
    overallPick: _overallPick,
    utilization: _utilization,
    valueScore: _valueScore,
    ...metric
  } = best;

  metric.totalPoints = round(metric.totalPoints, 2);
  metric.startedPoints = round(metric.startedPoints, 2);
  metric.teamPointShare = round(metric.teamPointShare * 100);
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
      metrics.weeklyPowerInputs.push({
        week: week.week,
        score: team.score,
        winValue:
          team.score > team.opponentScore
            ? 1
            : team.score < team.opponentScore
              ? 0
              : 0.5,
      });
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

  const completedWeeks = regularSeasonMatchups.map(({ week }) => week);
  const leaguePointsAverage =
    teamMetrics.size > 0
      ? [...teamMetrics.values()].reduce(
          (total, { pointsFor }) => total + pointsFor,
          0,
        ) / teamMetrics.size
      : 0;
  const powerSnapshots = completedWeeks.map((week) => {
    const rankings = [...teamMetrics.values()]
      .flatMap((metrics) => {
        const score = calculatePowerScore(
          metrics.weeklyPowerInputs.filter((input) => input.week <= week),
        );
        return score === null ? [] : [{ teamId: metrics.teamId, score }];
      })
      .sort(
        (left, right) =>
          right.score - left.score || left.teamId - right.teamId,
      );

    return {
      week,
      rankings: rankings.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      })),
    };
  });
  const currentPowerRanking =
    powerSnapshots[powerSnapshots.length - 1]?.rankings ?? [];
  let tierNumber = 1;
  const tiers = new Map<number, number>();

  currentPowerRanking.forEach((entry, index) => {
    const previous = currentPowerRanking[index - 1];
    if (previous && entry.score < previous.score * POWER_TIER_THRESHOLD) {
      tierNumber += 1;
    }
    tiers.set(entry.teamId, tierNumber);
  });
  const lowestTier = tierNumber;

  for (const metrics of teamMetrics.values()) {
    const scores = metrics.weeklyPowerInputs.map(({ score }) => score);
    const trend = powerSnapshots.flatMap(({ week, rankings }) => {
      const entry = rankings.find(({ teamId }) => teamId === metrics.teamId);
      return entry
        ? [{ week, score: entry.score, rank: entry.rank }]
        : [];
    });
    const current = trend[trend.length - 1];
    const previous = trend[trend.length - 2];
    const recentInputs = metrics.weeklyPowerInputs.slice(-3);
    const teamTier = tiers.get(metrics.teamId);

    metrics.power = {
      pointsPerGame:
        scores.length > 0
          ? scores.reduce((total, score) => total + score, 0) / scores.length
          : null,
      seasonHigh: scores.length > 0 ? Math.max(...scores) : null,
      seasonLow: scores.length > 0 ? Math.min(...scores) : null,
      pointsVsLeagueAverage:
        scores.length > 0 ? metrics.pointsFor - leaguePointsAverage : null,
      score: current?.score ?? null,
      rank: current?.rank ?? null,
      rankChange:
        current && previous ? previous.rank - current.rank : null,
      trend,
      tier:
        teamTier === undefined
          ? null
          : teamTier === lowestTier && lowestTier > 1
            ? "Taco"
            : `T${teamTier}`,
      recentScore: calculatePowerScore(recentInputs),
      recentWeekCount: recentInputs.length,
    };
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
        powerLeader: {
          ...EMPTY_SUPERLATIVE,
          label: "Power leader",
          explanation:
            "A blended rating of scoring average, weekly ceiling and floor, and win percentage.",
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
  const powerLeader = maxTeam(
    values.filter(({ power }) => power.score !== null),
    ({ power }) => power.score ?? 0,
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
      powerLeader: {
        label: "Power leader",
        presentation: "comparative",
        explanation:
          "Power score = (6 × scoring average + 2 × season high + 2 × season low + 400 × win percentage) ÷ 10.",
        value: getManagerName(source.teams, powerLeader.teamId),
        note: `${powerLeader.power.score?.toFixed(2)} · ${powerLeader.power.tier}`,
      },
    },
  };
}
