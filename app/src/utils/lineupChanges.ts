import type { Lineup } from "../models/models";
import type { OptimalLineupPlayer } from "./metrics";

export function getLineupChanges(
  lineup: Lineup[],
  optimal: OptimalLineupPlayer[],
) {
  const starters = lineup.filter(
    ({ slot_position }) =>
      slot_position !== "BE" &&
      slot_position !== "IR" &&
      slot_position !== "ER",
  );
  const actualIds = new Set(starters.map(({ player_id }) => player_id));
  const optimalIds = new Set(optimal.map(({ player_id }) => player_id));
  const added = optimal.filter(({ player_id }) => !actualIds.has(player_id));
  const removed = starters.filter(({ player_id }) => !optimalIds.has(player_id));

  return {
    added,
    removed,
    addedIds: new Set(added.map(({ player_id }) => player_id)),
    removedIds: new Set(removed.map(({ player_id }) => player_id)),
  };
}
