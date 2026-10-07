"""
Applies the approved /data/raw/people.json merge map to the production
owner identity (owner_id_map.json) and regenerates every season's public
teams.json from already-cached raw data - no live ESPN API calls.

What this does:
  1. Loads owner_id_map.json and runs it through update_owner_map() with
     owner dicts rebuilt from cached raw teams.json (same deterministic
     order as a live run: season ascending, team ascending, owner-list
     order). This performs the one-time consolidation (duplicate accounts
     for the same person folded into the lower, already-assigned anon ID)
     and drops excluded accounts (Ian Book), per people.json.
  2. Re-writes app/src/data/<season>/teams.json for every season using the
     updated mapping - the only public file this touches.

Run: python apply_people_merge.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from export_league_data import (
    RAW_DIR,
    PUBLIC_DATA_DIR,
    load_owner_map,
    save_owner_map,
    update_owner_map,
    espn_id_to_public,
    clean_teams_public,
    write_json,
)

SEASONS = [2022, 2023, 2024, 2025, 2026]


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def main() -> None:
    owner_dicts_in_order: list[dict[str, Any]] = []
    raw_teams_by_season: dict[int, list[dict[str, Any]]] = {}
    for season in SEASONS:
        teams = load_json(RAW_DIR / str(season) / "teams.json")
        raw_teams_by_season[season] = teams
        for team in sorted(teams, key=lambda t: t["team_id"]):
            for owner in team["owners"]:
                # Cached raw teams.json already stores owners in the
                # owner_dict() output shape (id/display_name/first_name/
                # last_name/full_name) - use as-is.
                owner_dicts_in_order.append(owner)

    owner_map = load_owner_map()
    before = json.dumps(owner_map, sort_keys=True)
    owner_map = update_owner_map(owner_map, owner_dicts_in_order)
    after = json.dumps(owner_map, sort_keys=True)
    save_owner_map(owner_map)
    espn_to_public = espn_id_to_public(owner_map)

    print("owner_id_map.json " + ("unchanged" if before == after else "updated"))
    for anon_id, info in sorted(owner_map["members"].items()):
        if len(info["espn_ids"]) > 1:
            print(f"  {anon_id} ({info.get('public_name')}): merged {len(info['espn_ids'])} ESPN accounts")

    for season, teams in raw_teams_by_season.items():
        public_teams = clean_teams_public(teams, espn_to_public)
        write_json(PUBLIC_DATA_DIR / str(season) / "teams.json", public_teams)
        print(f"wrote app/src/data/{season}/teams.json ({len(public_teams)} teams)")


if __name__ == "__main__":
    main()
