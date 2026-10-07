"""
Dry run for the guarded trade-rebuild mechanism (item 4 of the trade
rebuild approval). Reads cached /data/raw/<season>/*.json only - no live
API calls, no writes to /app/src/data/. For every trade currently
"source": "unknown" in the committed public trades.json, reports whether
the guarded rebuild would promote it to "rebuilt" or leave it "unknown",
and why.

Run: python dry_run_trade_rebuild.py
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
    group_trade_transactions,
    classify_trade_group,
    rebuild_trade_group,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"
PUBLIC_DIR = REPO_ROOT / "app" / "src" / "data"

SEASONS = [2022, 2023, 2024, 2025, 2026]


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def main() -> None:
    totals = {"rebuilt": 0, "unknown": 0}
    reason_totals: dict[str, int] = {}

    for season in SEASONS:
        txns = load_json(RAW_DIR / str(season) / "transactions.json")
        box_scores = load_json(RAW_DIR / str(season) / "box_scores.json")
        activity_path = RAW_DIR / str(season) / "trades_activity.json"
        trade_activity = load_json(activity_path) if activity_path.exists() else []
        is_current_season = season == max(SEASONS)

        # Current "source" per trade using the already-fixed espn/activity
        # matching only (no rebuild) - this is exactly what's currently
        # committed to app/src/data/<season>/trades.json.
        current_trades = build_trades_public(txns, trade_activity, is_current_season)
        currently_unknown = [t for t in current_trades if t["source"] == "unknown"]
        if not currently_unknown:
            print(f"=== {season}: 0 unknown trades, nothing to dry-run ===\n")
            continue

        groups = group_trade_transactions(txns)
        upheld = {k: v for k, v in groups.items() if classify_trade_group(v) == "upheld"}
        accepts_by_key = {key: group_accept_leg(legs) for key, legs in upheld.items()}
        team_week_counts: dict[tuple[int, int], int] = {}
        for accept in accepts_by_key.values():
            tw = (accept["team_id"], accept["scoring_period"])
            team_week_counts[tw] = team_week_counts.get(tw, 0) + 1

        roster_by_week = build_roster_by_week(box_scores)
        add_log = build_add_log(txns)

        print(f"=== {season}: {len(currently_unknown)} currently-unknown trade(s) ===")
        season_counts = {"rebuilt": 0, "unknown": 0}
        for trade in currently_unknown:
            key = trade["id"]
            accept = accepts_by_key[key]
            tw = (accept["team_id"], accept["scoring_period"])
            status, items, reason = rebuild_trade_group(
                accept["team_id"], accept["scoring_period"], roster_by_week, add_log, team_week_counts[tw]
            )
            totals[status] += 1
            season_counts[status] += 1
            if status == "unknown":
                reason_totals[reason] = reason_totals.get(reason, 0) + 1
            label = "REBUILT" if status == "rebuilt" else f"unknown ({reason})"
            print(f"  week {accept['scoring_period']:>2} team {accept['team_id']:>2} -> {label}")
            if status == "rebuilt":
                for i in items:
                    print(f"      {i['from_team_id']} -> {i['to_team_id']}: player {i['player_id']}")
        print(f"  season totals: rebuilt={season_counts['rebuilt']} unknown={season_counts['unknown']}\n")

    print("=== overall ===")
    print(f"rebuilt: {totals['rebuilt']}  unknown: {totals['unknown']}")
    print("unknown reasons:", reason_totals)


if __name__ == "__main__":
    main()
