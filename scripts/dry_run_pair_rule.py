"""
Compares the current guarded single-trade rebuild ("old rule") against a
new pair-based rule, for both validation (against ground-truth trades)
and the dry run (the 35 currently-unknown trades). Reads cached
/data/raw/<season>/*.json only - no live API calls, no writes to
/app/src/data/ or any raw file.

Old rule = export_league_data.rebuild_trade_group (dual window, 3 guards:
same_team_multiple_trades_this_week / one_sided_result /
multiple_candidate_counterparties).

New pair rule (per your spec):
  1. Per week w, collect every direct team-to-team player move from that
     week's box score to the next (no logged WAIVER/FREEAGENT add by the
     destination team in between).
  2. Group moves by unordered team pair. A candidate trade needs players
     moving in BOTH directions between the two teams.
  3. Count check: if the number of two-way pairs that week equals the
     number of upheld trades that week still needing contents (i.e. not
     already resolved via ESPN/recent_activity), mark them all "rebuilt".
     Otherwise mark that week's leftovers "unknown".
  4. (Added for per-trade reporting only, not in your spec): when the
     count matches, a specific trade is only assigned a specific pair if
     exactly one two-way pair that week contains its accepting team - if
     a team made 2+ trades the same week and 2+ pairs both touch it, we
     can't tell which pair is which trade, so those stay "unknown"
     ("ambiguous_pair_assignment") even though the week-level count check
     passed.

Run: python dry_run_pair_rule.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from export_league_data import (
    build_add_log,
    build_roster_by_week,
    build_trades_public,
    group_accept_leg,
    group_known_items,
    group_trade_transactions,
    classify_trade_group,
    match_activity_to_group,
    rebuild_trade_group,
    _unexplained_transitions,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"

SEASONS = [2022, 2023, 2024, 2025, 2026]
CURRENT_SEASON = max(SEASONS)


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


# --------------------------------------------------------------------------
# Shared per-season setup
# --------------------------------------------------------------------------


class SeasonCtx:
    def __init__(self, season: int) -> None:
        self.season = season
        self.txns = load_json(RAW_DIR / str(season) / "transactions.json")
        self.box_scores = load_json(RAW_DIR / str(season) / "box_scores.json")
        activity_path = RAW_DIR / str(season) / "trades_activity.json"
        self.trade_activity = load_json(activity_path) if activity_path.exists() else []
        self.is_current = season == CURRENT_SEASON

        self.roster_by_week = build_roster_by_week(self.box_scores)
        self.add_log = build_add_log(self.txns)

        groups = group_trade_transactions(self.txns)
        self.upheld = {k: v for k, v in groups.items() if classify_trade_group(v) == "upheld"}
        self.accepts_by_key = {key: group_accept_leg(legs) for key, legs in self.upheld.items()}

        # Resolve each upheld trade's real source (espn via item list or,
        # current season only, recent_activity) - same logic as
        # build_trades_public, kept separate here so we can both (a) know
        # which trades are "known" (and thus excluded from the rebuild
        # math) and (b) treat any of them as hidden ground truth on
        # demand for validation.
        self.ground_truth: dict[str, list[dict[str, Any]]] = {}
        consumed_activity: set[int] = set()
        for key, legs in sorted(self.upheld.items(), key=lambda kv: self.accepts_by_key[kv[0]]["date"] or 0):
            accept = self.accepts_by_key[key]
            known_items = group_known_items(legs)
            if known_items:
                self.ground_truth[key] = known_items
                continue
            if self.is_current:
                match = match_activity_to_group(accept["team_id"], accept["date"], self.trade_activity, consumed_activity)
                if match:
                    idx, activity_items = match
                    consumed_activity.add(idx)
                    self.ground_truth[key] = [
                        {"player_id": i["player_id"], "from_team_id": i["from_team_id"], "to_team_id": i["to_team_id"]}
                        for i in activity_items
                    ]

        # Same-team-same-week counts (for the old rule's guard 1).
        self.team_week_counts: dict[tuple[int, int], int] = {}
        for accept in self.accepts_by_key.values():
            tw = (accept["team_id"], accept["scoring_period"])
            self.team_week_counts[tw] = self.team_week_counts.get(tw, 0) + 1

    def upheld_keys_at_week(self, week: int) -> list[str]:
        return [k for k, a in self.accepts_by_key.items() if a["scoring_period"] == week]

    def remaining_keys_at_week(self, week: int, hide_key: str | None) -> list[str]:
        """Keys still needing contents this week, optionally forcing one
        normally-known key to also count as "remaining" (for validation -
        we pretend we don't know its ground truth yet)."""
        return [
            k for k in self.upheld_keys_at_week(week)
            if k == hide_key or k not in self.ground_truth
        ]


# --------------------------------------------------------------------------
# New pair rule
# --------------------------------------------------------------------------


def two_way_pairs_for_week(ctx: SeasonCtx, week: int) -> dict[frozenset[int], list[dict[str, Any]]]:
    """unordered team pair -> list of {player_id, from_team_id, to_team_id}
    moves between week -> week+1, restricted to pairs with movement in
    BOTH directions."""
    if week not in ctx.roster_by_week or (week + 1) not in ctx.roster_by_week:
        return {}
    transitions = _unexplained_transitions(
        ctx.roster_by_week[week], ctx.roster_by_week[week + 1], (week, week + 1), ctx.add_log
    )
    pair_moves: dict[frozenset[int], list[dict[str, Any]]] = {}
    for player_id, (frm, to) in transitions.items():
        pair = frozenset({frm, to})
        pair_moves.setdefault(pair, []).append({"player_id": player_id, "from_team_id": frm, "to_team_id": to})
    two_way = {}
    for pair, moves in pair_moves.items():
        directions = {(m["from_team_id"], m["to_team_id"]) for m in moves}
        if len(directions) == 2:  # both (A,B) and (B,A) present
            two_way[pair] = moves
    return two_way


def pair_rule_result(
    ctx: SeasonCtx, key: str, hide_key: str | None
) -> tuple[str, list[dict[str, Any]], str]:
    """Returns (status, items, reason) for one trade key under the pair
    rule, given the "remaining" accounting with hide_key optionally
    forced unresolved."""
    accept = ctx.accepts_by_key[key]
    week = accept["scoring_period"]
    accept_team = accept["team_id"]

    remaining = ctx.remaining_keys_at_week(week, hide_key)
    two_way = two_way_pairs_for_week(ctx, week)

    if len(two_way) != len(remaining):
        return "unknown", [], f"count_check_failed ({len(two_way)} two-way pairs vs {len(remaining)} remaining trades)"

    candidate_pairs = [p for p in two_way if accept_team in p]
    if len(candidate_pairs) != 1:
        return "unknown", [], "ambiguous_pair_assignment"

    return "rebuilt", two_way[candidate_pairs[0]], ""


# --------------------------------------------------------------------------
# Old rule wrapper (for side-by-side comparison)
# --------------------------------------------------------------------------


def old_rule_result(ctx: SeasonCtx, key: str) -> tuple[str, list[dict[str, Any]], str]:
    accept = ctx.accepts_by_key[key]
    tw = (accept["team_id"], accept["scoring_period"])
    status, items, reason = rebuild_trade_group(
        accept["team_id"], accept["scoring_period"], ctx.roster_by_week, ctx.add_log, ctx.team_week_counts[tw]
    )
    return status, items, reason or ""


# --------------------------------------------------------------------------
# Validation (against ground-truth trades)
# --------------------------------------------------------------------------


def items_match(a: list[dict[str, Any]], b: list[dict[str, Any]]) -> bool:
    def norm(items: list[dict[str, Any]]) -> set[tuple[int, int, int]]:
        return {(i["player_id"], i["from_team_id"], i["to_team_id"]) for i in items}
    return norm(a) == norm(b)


def classify_against_ground_truth(status: str, items: list[dict[str, Any]], truth: list[dict[str, Any]]) -> str:
    if status == "rebuilt" and items_match(truth, items):
        return "exact"
    if status == "rebuilt":
        return "mismatch"
    return "miss"


def main() -> None:
    contexts = {season: SeasonCtx(season) for season in SEASONS}

    print("=" * 70)
    print("VALIDATION (against ground-truth trades)")
    print("=" * 70)
    val_totals = {"old": {"exact": 0, "mismatch": 0, "miss": 0}, "pair": {"exact": 0, "mismatch": 0, "miss": 0}}
    disagreements = []
    ground_truth_count = 0
    for season, ctx in contexts.items():
        for key in sorted(ctx.ground_truth, key=lambda k: ctx.accepts_by_key[k]["date"] or 0):
            truth = ctx.ground_truth[key]
            accept = ctx.accepts_by_key[key]
            ground_truth_count += 1

            old_status, old_items, old_reason = old_rule_result(ctx, key)
            old_verdict = classify_against_ground_truth(old_status, old_items, truth)
            val_totals["old"][old_verdict] += 1

            pair_status, pair_items, pair_reason = pair_rule_result(ctx, key, hide_key=key)
            pair_verdict = classify_against_ground_truth(pair_status, pair_items, truth)
            val_totals["pair"][pair_verdict] += 1

            print(
                f"{season} wk{accept['scoring_period']:>2} team{accept['team_id']:>2} | "
                f"old={old_verdict:<8}({old_status}{', ' + old_reason if old_reason else ''}) | "
                f"pair={pair_verdict:<8}({pair_status}{', ' + pair_reason if pair_reason else ''})"
            )
            if old_verdict != pair_verdict:
                disagreements.append(
                    f"  {season} wk{accept['scoring_period']} team{accept['team_id']}: "
                    f"old={old_verdict} ({old_status}), pair={pair_verdict} ({pair_status})"
                )

    print(f"\n{ground_truth_count} ground-truth trades checked.")
    print(f"  old rule : exact={val_totals['old']['exact']}  mismatch={val_totals['old']['mismatch']}  miss={val_totals['old']['miss']}")
    print(f"  pair rule: exact={val_totals['pair']['exact']}  mismatch={val_totals['pair']['mismatch']}  miss={val_totals['pair']['miss']}")

    print("\n" + "=" * 70)
    print("DRY RUN (currently-unknown trades)")
    print("=" * 70)
    dry_totals = {"old": {"rebuilt": 0, "unknown": 0}, "pair": {"rebuilt": 0, "unknown": 0}}
    for season, ctx in contexts.items():
        current_trades = build_trades_public(ctx.txns, ctx.trade_activity, ctx.is_current)
        currently_unknown = [t for t in current_trades if t["source"] == "unknown"]
        if not currently_unknown:
            continue
        season_old = {"rebuilt": 0, "unknown": 0}
        season_pair = {"rebuilt": 0, "unknown": 0}
        for trade in currently_unknown:
            key = trade["id"]
            accept = ctx.accepts_by_key[key]

            old_status, _old_items, old_reason = old_rule_result(ctx, key)
            season_old[old_status] += 1
            dry_totals["old"][old_status] += 1

            pair_status, _pair_items, pair_reason = pair_rule_result(ctx, key, hide_key=None)
            season_pair[pair_status] += 1
            dry_totals["pair"][pair_status] += 1

            if old_status != pair_status:
                print(
                    f"  DISAGREE {season} wk{accept['scoring_period']:>2} team{accept['team_id']:>2}: "
                    f"old={old_status} ({old_reason}) | pair={pair_status} ({pair_reason})"
                )
        print(
            f"{season}: old rebuilt={season_old['rebuilt']} unknown={season_old['unknown']} | "
            f"pair rebuilt={season_pair['rebuilt']} unknown={season_pair['unknown']}"
        )

    print(f"\noverall: old rebuilt={dry_totals['old']['rebuilt']} unknown={dry_totals['old']['unknown']}")
    print(f"         pair rebuilt={dry_totals['pair']['rebuilt']} unknown={dry_totals['pair']['unknown']}")

    if disagreements:
        print("\nValidation disagreements (old vs pair):")
        for d in disagreements:
            print(d)
    else:
        print("\nNo validation disagreements between old and pair rule.")


if __name__ == "__main__":
    main()
