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
  status: WeekStatus;
  matchups: MatchupResult[];
};

export type MatchupResult = {
  home_team_id: number;
  home_score: number | null;
  away_team_id: number;
  away_score: number | null;
};

export type Settings = {
  team_count: number;
  regular_season_length: number;
  playoff_weeks: number[];
  current_week: number;
  roster_slots: Record<string, number>;
  week_status: Record<string, WeekStatus>;
  waiver_type?: string;
  faab_budget?: number;
};

export type WeekStatus = "not_started" | "final" | "in_progress";

export type Standing = {
  team_id: number;
  team_name: string;
  final_standing: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  points_against: number;
};

export type Draft = {
  picks: DraftPick[];
};

export type DraftPick = {
  round: number;
  round_pick: number;
  team_id: number;
  team_name: string;
  player_id: number;
  player_name: string;
  is_keeper: boolean;
};

export type Transaction = {
  id: string;
  type: string;
  status: string;
  team_id: number;
  team_name: string;
  scoring_period: number;
  date: number;
  bid_amount: number;
  items: TransactionItem[];
};

export type TransactionItem = {
  type: "ADD" | "DROP";
  player_id: number;
  player_name: string;
  from_team_id: number;
  to_team_id: number;
};

export type Bracket = {
  champion: BracketChampion | null;
  rounds: BracketRound[];
};

export type BracketChampion = {
  team_id: number;
};

export type BracketRound = {
  week: number;
  games: BracketGame[];
};

export type BracketGame = {
  tier:
    | "WINNERS_BRACKET"
    | "WINNERS_CONSOLATION_LADDER"
    | "LOSERS_CONSOLATION_LADDER";
  home_team_id: number | null;
  home_score: number | null;
  away_team_id: number | null;
  away_score: number | null;
  winner: "HOME" | "AWAY" | null;
  is_bye: boolean;
};
