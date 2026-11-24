import type { Lineup, Trade } from "../models/models";
import type { SeasonLoaderData } from "../routes/loader";

export type ReceiptSeason = Pick<SeasonLoaderData, "teams" | "matchups" | "settings" | "box_scores">;
export type TradeReceipt = {
  teamId: number;
  points: number | null;
  covered: number;
  weeks: number;
};

export function isStarter(player: Pick<Lineup, "slot_position">): boolean;
export function getTradeReceipts(season: ReceiptSeason, trade: Trade): TradeReceipt[];
