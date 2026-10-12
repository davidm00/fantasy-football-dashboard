import type { Bracket, Settings } from "../models/models";

export function getPlayoffRounds(settings: Settings, bracket: Bracket) {
  const weeks = [...new Set([
    ...settings.playoff_weeks,
    ...bracket.rounds.map(({ week }) => week),
  ])].sort((left, right) => left - right);

  return weeks.map((week, index) => ({
    week,
    label: index === weeks.length - 1
      ? "Championship"
      : index === weeks.length - 2
        ? "Semifinals"
        : index === weeks.length - 3
          ? "Quarterfinals"
          : `Round ${index + 1}`,
  }));
}
