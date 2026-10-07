"""
Regenerates app/src/data/<season>/trades.json from already-cached raw
data - no live ESPN API calls. Wires in the guarded rebuild (the only
change here vs. build_trades_public's prior production behavior): now
emits "rebuilt" trades, not just "espn"/"unknown", per the dry-run
results already validated in scripts/dry_run_trade_rebuild.py.

Touches only app/src/data/<season>/trades.json.

Run: python regenerate_trades.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from export_league_data import (
    RAW_DIR,
    PUBLIC_DATA_DIR,
    build_add_log,
    build_roster_by_week,
    build_trades_public,
    write_json,
)

SEASONS = [2022, 2023, 2024, 2025, 2026]
CURRENT_SEASON = max(SEASONS)


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def main() -> None:
    for season in SEASONS:
        raw_dir = RAW_DIR / str(season)
        txns = load_json(raw_dir / "transactions.json")
        box_scores = load_json(raw_dir / "box_scores.json")
        activity_path = raw_dir / "trades_activity.json"
        trade_activity = load_json(activity_path) if activity_path.exists() else []
        is_current_season = season == CURRENT_SEASON

        roster_by_week = build_roster_by_week(box_scores)
        add_log = build_add_log(txns)

        trades_public = build_trades_public(
            txns, trade_activity, is_current_season, roster_by_week=roster_by_week, add_log=add_log
        )
        write_json(PUBLIC_DATA_DIR / str(season) / "trades.json", trades_public)

        counts: dict[str, int] = {}
        for t in trades_public:
            counts[t["source"]] = counts.get(t["source"], 0) + 1
        print(f"{season}: wrote trades.json ({len(trades_public)} trades) -> {counts}")


if __name__ == "__main__":
    main()
