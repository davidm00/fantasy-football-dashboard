"""
Dry-run connectivity check for the ESPN export.

Confirms that ESPN_S2 / SWID / LEAGUE_ID (from .env locally, or real
environment variables in CI) are valid and that the league can be reached,
WITHOUT fetching full season data or writing any files. Intended as a fast
pre-flight check before running the full export.py, both locally and as the
first step of the GitHub Action.

Never prints or logs the values of ESPN_S2 / SWID.

Usage:
    python check_espn_connection.py              # check the current season
    python check_espn_connection.py --season 2026
"""

from __future__ import annotations

import argparse
import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from espn_api.football import League

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", type=int, default=None)
    args = parser.parse_args()

    load_dotenv(REPO_ROOT / ".env")
    espn_s2 = os.environ.get("ESPN_S2", "")
    swid = os.environ.get("SWID", "")
    league_id_raw = os.environ.get("LEAGUE_ID", "")

    if not league_id_raw:
        raise SystemExit("LEAGUE_ID is not set (check .env locally, or repo secrets in CI).")
    if not espn_s2 or not swid:
        print("[warn] ESPN_S2 and/or SWID is empty - only public league data (if any) will be reachable.")

    league_id = int(league_id_raw)
    year = args.season or date.today().year

    print(f"[check] connecting to league {league_id}, season {year} ...")
    try:
        league = League(league_id=league_id, year=year, espn_s2=espn_s2 or None, swid=swid or None)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"[check] FAILED: {type(exc).__name__}: {exc}") from exc

    team_count = len(league.teams)
    print(f"[check] OK - league name: {league.settings.name!r}, teams: {team_count}, "
          f"current matchup period: {league.currentMatchupPeriod}")
    print("[check] credentials are valid. No files were written.")


if __name__ == "__main__":
    main()
