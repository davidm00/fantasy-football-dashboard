import type {
  BoxScore,
  Matchup,
  Settings,
  Team,
  WeekStatus,
} from "../../models/models";
import {
  getOptimalLineupPoints,
  type MetricPresentation,
  type MetricRecord,
} from "./seasonMetrics";

export type WeeklyTeamPerformance = {
  teamId: number;
  opponentTeamId: number;
  rank: number;
  score: number;
  opponentScore: number;
  result: "W" | "L" | "T";
  allPlayRecord: MetricRecord;
  lineupEfficiency: number | null;
  pointsLeftOnBench: number | null;
};

export type WeekMetricCard = {
  label: string;
  value: string;
  note: string;
  explanation?: string;
  presentation?: MetricPresentation;
};

export type WeekMatchupInsight = {
  homeTeamId: number;
  awayTeamId: number;
  text: string;
};

export type WeekMetrics = {
  status: WeekStatus;
  performances: WeeklyTeamPerformance[];
  cards: WeekMetricCard[];
  matchupInsights: WeekMatchupInsight[];
};

type WeekMetricSource = {
  teams: Team[];
  settings: Settings;
  matchups: Matchup[];
  box_scores: BoxScore[];
};

const getManagerName = (teams: Team[], teamId: number) => {
  const team = teams.find((item) => item.team_id === teamId);
  return team?.owners.map(({ name }) => name).join(" & ") || team?.team_name ||
    "Unknown manager";
};

const getPositionGroup = (slot: string) => {
  if (slot === "RB/WR/TE" || slot === "RB/WR" || slot === "WR/TE") {
    return "FLEX";
  }

  return slot;
};

function getStarterPositionTotals(lineup: BoxScore["home_lineup"]) {
  const totals = new Map<string, number>();

  for (const player of lineup) {
    if (
      player.slot_position === "BE" ||
      player.slot_position === "IR" ||
      player.slot_position === "ER"
    ) {
      continue;
    }

    const position = getPositionGroup(player.slot_position);
    totals.set(position, (totals.get(position) ?? 0) + player.points);
  }

  return totals;
}

function getTopStarter(lineup: BoxScore["home_lineup"]) {
  return [...lineup]
    .filter(
      (player) =>
        player.slot_position !== "BE" &&
        player.slot_position !== "IR" &&
        player.slot_position !== "ER",
    )
    .sort((left, right) => right.points - left.points)[0];
}

export function calculateWeekMetrics(
  source: WeekMetricSource,
  week: number,
  historicalScores: number[] = [],
): WeekMetrics {
  const matchupWeek = source.matchups.find((item) => item.week === week);
  const status =
    matchupWeek?.status ??
    source.settings.week_status[String(week)] ??
    "not_started";
  const scores = (matchupWeek?.matchups ?? []).flatMap((matchup) => {
    if (matchup.home_score === null || matchup.away_score === null) {
      return [];
    }

    return [
      {
        teamId: matchup.home_team_id,
        opponentTeamId: matchup.away_team_id,
        score: matchup.home_score,
        opponentScore: matchup.away_score,
      },
      {
        teamId: matchup.away_team_id,
        opponentTeamId: matchup.home_team_id,
        score: matchup.away_score,
        opponentScore: matchup.home_score,
      },
    ];
  });
  const ranked = [...scores].sort(
    (left, right) => right.score - left.score || left.teamId - right.teamId,
  );
  const boxScores = source.box_scores.filter(
    (boxScore) => boxScore.week === week,
  );
  const lineupByTeam = new Map<
    number,
    { score: number; lineup: BoxScore["home_lineup"] }
  >();
  const matchupInsights: WeekMatchupInsight[] = [];
  let biggestPositionEdge:
    | {
        teamId: number;
        opponentTeamId: number;
        position: string;
        points: number;
      }
    | undefined;
  let strongestLosingStar:
    | {
        teamId: number;
        playerName: string;
        playerPoints: number;
        share: number;
      }
    | undefined;

  for (const boxScore of boxScores) {
    lineupByTeam.set(boxScore.home_team_id, {
      score: boxScore.home_score,
      lineup: boxScore.home_lineup,
    });
    lineupByTeam.set(boxScore.away_team_id, {
      score: boxScore.away_score,
      lineup: boxScore.away_lineup,
    });

    const homePositions = getStarterPositionTotals(boxScore.home_lineup);
    const awayPositions = getStarterPositionTotals(boxScore.away_lineup);
    const positions = new Set([
      ...homePositions.keys(),
      ...awayPositions.keys(),
    ]);
    const positionEdge = [...positions]
      .map((position) => ({
        position,
        difference:
          (homePositions.get(position) ?? 0) -
          (awayPositions.get(position) ?? 0),
      }))
      .sort(
        (left, right) =>
          Math.abs(right.difference) - Math.abs(left.difference),
      )[0];

    if (positionEdge) {
      const homeAdvantage = positionEdge.difference >= 0;
      const insight = {
        homeTeamId: boxScore.home_team_id,
        awayTeamId: boxScore.away_team_id,
        text: `${getManagerName(source.teams, homeAdvantage ? boxScore.home_team_id : boxScore.away_team_id)} held a ${Math.abs(positionEdge.difference).toFixed(1)}-point ${positionEdge.position} advantage.`,
      };
      matchupInsights.push(insight);

      if (
        !biggestPositionEdge ||
        Math.abs(positionEdge.difference) > biggestPositionEdge.points
      ) {
        biggestPositionEdge = {
          teamId: homeAdvantage
            ? boxScore.home_team_id
            : boxScore.away_team_id,
          opponentTeamId: homeAdvantage
            ? boxScore.away_team_id
            : boxScore.home_team_id,
          position: positionEdge.position,
          points: Math.abs(positionEdge.difference),
        };
      }
    }

    const homeWon = boxScore.home_score >= boxScore.away_score;
    const losingTeamId = homeWon
      ? boxScore.away_team_id
      : boxScore.home_team_id;
    const losingScore = homeWon ? boxScore.away_score : boxScore.home_score;
    const losingLineup = homeWon
      ? boxScore.away_lineup
      : boxScore.home_lineup;
    const topStarter = getTopStarter(losingLineup);

    if (topStarter && losingScore > 0) {
      const share = (topStarter.points / losingScore) * 100;

      if (!strongestLosingStar || share > strongestLosingStar.share) {
        strongestLosingStar = {
          teamId: losingTeamId,
          playerName: topStarter.name,
          playerPoints: topStarter.points,
          share,
        };
      }
    }
  }

  const performances = ranked.map((team, index) => {
    const allPlayRecord: MetricRecord = { wins: 0, losses: 0, ties: 0 };

    for (const opponent of ranked) {
      if (opponent.teamId === team.teamId) continue;
      if (team.score > opponent.score) allPlayRecord.wins += 1;
      else if (team.score < opponent.score) allPlayRecord.losses += 1;
      else allPlayRecord.ties += 1;
    }

    const lineupData = lineupByTeam.get(team.teamId);
    const optimalPoints = lineupData
      ? getOptimalLineupPoints(lineupData.lineup, source.settings)
      : null;

    return {
      ...team,
      rank: index + 1,
      result:
        team.score > team.opponentScore
          ? "W"
          : team.score < team.opponentScore
            ? "L"
            : "T",
      allPlayRecord,
      lineupEfficiency:
        optimalPoints && optimalPoints > 0
          ? Number(((team.score / optimalPoints) * 100).toFixed(1))
          : null,
      pointsLeftOnBench:
        optimalPoints === null
          ? null
          : Number(Math.max(0, optimalPoints - team.score).toFixed(2)),
    } satisfies WeeklyTeamPerformance;
  });
  const closestGame = [...(matchupWeek?.matchups ?? [])]
    .filter(
      (matchup) =>
        matchup.home_score !== null && matchup.away_score !== null,
    )
    .sort(
      (left, right) =>
        Math.abs((left.home_score ?? 0) - (left.away_score ?? 0)) -
        Math.abs((right.home_score ?? 0) - (right.away_score ?? 0)),
    )[0];
  const mostBenchPoints = [...performances]
    .filter(({ pointsLeftOnBench }) => pointsLeftOnBench !== null)
    .sort(
      (left, right) =>
        (right.pointsLeftOnBench ?? 0) - (left.pointsLeftOnBench ?? 0),
    )[0];
  const cards: WeekMetricCard[] = [];
  const highScorer = performances[0];

  if (highScorer) {
    const history = historicalScores.length
      ? historicalScores
      : performances.map(({ score }) => score);
    const scoresBelow = history.filter(
      (score) => score < highScorer.score,
    ).length;
    const percentile = (scoresBelow / history.length) * 100;
    const historicalRank =
      history.filter((score) => score > highScorer.score).length + 1;

    cards.push({
      label: "Historic heat",
      value: `${getManagerName(source.teams, highScorer.teamId)} · ${highScorer.score.toFixed(2)}`,
      note: `${percentile.toFixed(1)}th percentile · #${historicalRank} of ${history.length}`,
      presentation: "narrative",
      explanation:
        "This score's percentile and rank among all completed regular-season team scores in league history.",
    });
  }

  if (biggestPositionEdge) {
    cards.push({
      label: "Biggest position edge",
      value: `${getManagerName(source.teams, biggestPositionEdge.teamId)} · ${biggestPositionEdge.position}`,
      note: `+${biggestPositionEdge.points.toFixed(1)} vs ${getManagerName(source.teams, biggestPositionEdge.opponentTeamId)}`,
      presentation: "comparative",
      explanation:
        "The largest scoring difference between matching starting lineup position groups in any matchup this week.",
    });
  }

  const scheduleRobbery = performances.find(
    ({ result, rank }) =>
      result === "W" && rank > Math.ceil(performances.length / 2),
  );
  const brutalBeat = performances.find(
    ({ result, rank }) =>
      result === "L" && rank <= Math.ceil(performances.length / 2),
  );

  if (scheduleRobbery) {
    cards.push({
      label: "Schedule robbery",
      value: getManagerName(source.teams, scheduleRobbery.teamId),
      note: `Won while ranking ${scheduleRobbery.rank} of ${performances.length} in points`,
      presentation: "narrative",
      explanation:
        "A matchup win by a manager who scored in the bottom half of the league this week.",
    });
  } else if (brutalBeat) {
    cards.push({
      label: "Brutal beat",
      value: getManagerName(source.teams, brutalBeat.teamId),
      note: `Lost while ranking ${brutalBeat.rank} of ${performances.length} in points`,
      presentation: "narrative",
      explanation:
        "A matchup loss by a manager who scored in the top half of the league this week.",
    });
  } else if (strongestLosingStar) {
    cards.push({
      label: "Star performance wasted",
      value: `${strongestLosingStar.playerName} · ${strongestLosingStar.playerPoints.toFixed(1)}`,
      note: `${strongestLosingStar.share.toFixed(1)}% of ${getManagerName(source.teams, strongestLosingStar.teamId)}'s score in a loss`,
      presentation: "narrative",
      explanation:
        "The largest share of a losing team's score supplied by one starter this week.",
    });
  } else if (
    closestGame &&
    closestGame.home_score !== null &&
    closestGame.away_score !== null
  ) {
    cards.push({
      label: "Closest game",
      value: `${Math.abs(closestGame.home_score - closestGame.away_score).toFixed(2)} points`,
      note: "Smallest matchup margin",
      presentation: "direct",
    });
  }

  const selfInflictedLoss = performances
    .filter(
      ({ result, pointsLeftOnBench, score, opponentScore }) =>
        result === "L" &&
        pointsLeftOnBench !== null &&
        score + pointsLeftOnBench > opponentScore,
    )
    .sort(
      (left, right) =>
        (right.pointsLeftOnBench ?? 0) -
        (left.pointsLeftOnBench ?? 0),
    )[0];

  if (selfInflictedLoss && selfInflictedLoss.pointsLeftOnBench !== null) {
    cards.push({
      label: "Self-inflicted loss",
      value: getManagerName(source.teams, selfInflictedLoss.teamId),
      note: `${selfInflictedLoss.pointsLeftOnBench.toFixed(2)} points left · optimal lineup wins`,
      presentation: "narrative",
      explanation:
        "A loss where the manager's best valid lineup would have scored enough to beat the opponent.",
    });
  } else if (
    mostBenchPoints &&
    mostBenchPoints.pointsLeftOnBench !== null
  ) {
    cards.push({
      label: "Biggest lineup swing",
      value: getManagerName(source.teams, mostBenchPoints.teamId),
      note: `${mostBenchPoints.pointsLeftOnBench.toFixed(2)} points`,
      presentation: "comparative",
      explanation:
        "Best possible lineup points minus the points scored by the manager's actual starters this week.",
    });
  }

  return { status, performances, cards, matchupInsights };
}
