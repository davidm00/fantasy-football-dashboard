export type BoxScore = {
  week: number;
  status: string;
  is_playoff: boolean;
  home_team_id: number;
  home_score: number;
  home_lineup: Lineup[];
  away_team_id: number;
  away_score: number;
  away_lineup: Lineup[];
};

export type Lineup = {
  player_id: number;
  name: string;
  position: string;
  pro_team: string;
  slot_position: string;
  points: number;
};

export type Team = {
  team_id: number;
  team_name: string;
  owners: Owners[];
};

export type Owners = {
  id: string;
  name: string;
};

export type Matchup = {
  week: number;
  status: string;
  matchups: MatchupResult[];
};

export type MatchupResult = {
  home_team_id: number;
  home_score: number;
  away_team_id: number;
  away_score: number;
};

export type Settings = {
  team_count: number;
  regular_season_length: number;
  playoff_weeks: number[];
  current_week: number;
  roster_slots: Record<string, number>;
  week_status: Record<string, string>;
};
