"""
Export ESPN fantasy football league history to JSON.

Writes two copies of the data:
  - RAW   (full detail, local only): /data/raw/<season>/
  - PUBLIC (cleaned, committed, app-facing): /app/src/data/<season>/

The public copy has ESPN member IDs and usernames replaced with stable
made-up manager IDs/names (see build_owner_name_map()); the mapping itself
is kept only in /data/raw/owner_id_map.json.

Usage:
    python export_league_data.py              # discover and export every season
    python export_league_data.py --season 2026 # refresh a single season only

Reads ESPN_S2, SWID, and LEAGUE_ID from a .env file in the repo root.
Never prints or logs the values of ESPN_S2 / SWID.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import os

from espn_api.football import League

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PUBLIC_DATA_DIR = REPO_ROOT / "app" / "src" / "data"
OWNER_MAP_PATH = RAW_DIR / "owner_id_map.json"

# Seconds to pause between network requests to be polite to ESPN's API.
REQUEST_DELAY_SECONDS = 1.0

# Transaction types that represent real roster moves (trades, waivers, free
# agent adds/drops). Excludes internal bookkeeping types like DRAFT, ROSTER,
# FUTURE_ROSTER, RETRO_ROSTER.
TRANSACTION_TYPES = {
    "TRADE_ACCEPT",
    "TRADE_VETO",
    "TRADE_PROPOSAL",
    "TRADE_DECLINE",
    "TRADE_UPHOLD",
    "TRADE_ERROR",
    "WAIVER",
    "WAIVER_ERROR",
    "FREEAGENT",
}

# How far back to search for a season that will respond, when discovering the
# full season list from scratch (no --season flag).
MAX_DISCOVERY_LOOKBACK_YEARS = 20


@dataclass
class SeasonResult:
    season: int
    status: str  # "ok", "partial", "failed"
    notes: list[str]


def load_config() -> tuple[str, str, int]:
    load_dotenv(REPO_ROOT / ".env")
    espn_s2 = os.environ.get("ESPN_S2", "")
    swid = os.environ.get("SWID", "")
    league_id_raw = os.environ.get("LEAGUE_ID", "")
    if not league_id_raw:
        raise RuntimeError("LEAGUE_ID is not set in .env")
    return espn_s2, swid, int(league_id_raw)


def make_league(league_id: int, year: int, espn_s2: str, swid: str) -> League:
    return League(
        league_id=league_id,
        year=year,
        espn_s2=espn_s2 or None,
        swid=swid or None,
    )


def discover_seasons(league_id: int, espn_s2: str, swid: str, start_year: int) -> list[int]:
    """Find an anchor season that loads successfully, then use the league's
    own `previousSeasons` history to build the full list of seasons to try.
    Never hardcodes a season number."""
    for year in range(start_year, start_year - MAX_DISCOVERY_LOOKBACK_YEARS, -1):
        try:
            league = make_league(league_id, year, espn_s2, swid)
        except Exception as exc:  # noqa: BLE001 - we want to try the next year
            print(f"[discover] season {year} unavailable as anchor ({type(exc).__name__}); trying earlier season")
            time.sleep(REQUEST_DELAY_SECONDS)
            continue
        seasons = sorted(set(league.previousSeasons) | {year})
        print(f"[discover] anchor season {year} succeeded; league history reports seasons: {seasons}")
        return seasons
    raise RuntimeError(
        f"Could not find any loadable season for league {league_id} going back "
        f"{MAX_DISCOVERY_LOOKBACK_YEARS} years from {start_year}."
    )


# --------------------------------------------------------------------------
# Owner identity: raw ESPN member info vs. stable anonymized public identity
# --------------------------------------------------------------------------


def owner_dict(member: dict[str, Any]) -> dict[str, Any]:
    """Raw-only representation of an ESPN league member. Never written to
    the public/app-facing output."""
    display_name = member.get("displayName") or " ".join(
        part for part in (member.get("firstName"), member.get("lastName")) if part
    ).strip()
    first_name = member.get("firstName")
    last_name = member.get("lastName")
    full_name = " ".join(part for part in (first_name, last_name) if part).strip()
    return {
        "id": member.get("id"),
        "display_name": display_name or "Unknown",
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name or None,
    }


def load_owner_map() -> dict[str, Any]:
    if OWNER_MAP_PATH.exists():
        with OWNER_MAP_PATH.open() as f:
            return json.load(f)
    return {"members": {}}


def save_owner_map(owner_map: dict[str, Any]) -> None:
    write_json(OWNER_MAP_PATH, owner_map)


def update_owner_map(owner_map: dict[str, Any], leagues: list[League]) -> dict[str, Any]:
    """Discover every ESPN member across every season's teams, assign each a
    stable anonymized ID (m01, m02, ...) the first time it's seen, and
    recompute public display names (first name, +last initial if another
    member shares that first name) across the *entire* known set so a name
    never changes between seasons or across re-runs."""
    members: dict[str, Any] = owner_map.get("members", {})

    # Discover members in a deterministic order: season ascending, team
    # ascending, owner list order. Only new (not-yet-mapped) members get a
    # new anon ID; existing ones keep theirs.
    existing_ids = {m["espn_id"] for m in members.values()}
    next_num = len(members) + 1
    for league in sorted(leagues, key=lambda lg: lg.year):
        for team in sorted(league.teams, key=lambda t: t.team_id):
            for raw_member in team.owners:
                od = owner_dict(raw_member)
                espn_id = od["id"]
                if not espn_id or espn_id in existing_ids:
                    continue
                anon_id = f"m{next_num:02d}"
                members[anon_id] = {
                    "espn_id": espn_id,
                    "first_name": od["first_name"],
                    "last_name": od["last_name"],
                }
                existing_ids.add(espn_id)
                next_num += 1

    # Recompute public display names across the whole known set so that
    # adding a new member can never change an existing member's name.
    by_first_name: dict[str, list[str]] = {}
    for anon_id, info in members.items():
        first = (info.get("first_name") or "").strip() or f"Manager {anon_id}"
        by_first_name.setdefault(first, []).append(anon_id)

    for first, anon_ids in by_first_name.items():
        if len(anon_ids) == 1:
            members[anon_ids[0]]["public_name"] = first
            continue
        # Shared first name: disambiguate with a single last initial only -
        # never expose more of a real last name than that, even if two
        # members share both first name and last initial (e.g. the same
        # person appearing under two different ESPN member IDs across
        # seasons). Any residual collision is broken with a numeric suffix
        # instead of revealing more of the surname.
        by_initial: dict[str, list[str]] = {}
        for anon_id in sorted(anon_ids):
            last = (members[anon_id].get("last_name") or "").strip()
            initial = last[:1]
            by_initial.setdefault(initial, []).append(anon_id)
        for initial, ids_in_group in by_initial.items():
            base_label = f"{first} {initial}".strip() if initial else first
            for idx, anon_id in enumerate(ids_in_group, start=1):
                label = base_label if idx == 1 else f"{base_label}{idx}"
                members[anon_id]["public_name"] = label

    owner_map["members"] = members
    return owner_map


def espn_id_to_public(owner_map: dict[str, Any]) -> dict[str, dict[str, str]]:
    """espn member id -> {"id": anon_id, "name": public_name}"""
    result = {}
    for anon_id, info in owner_map.get("members", {}).items():
        result[info["espn_id"]] = {"id": anon_id, "name": info.get("public_name") or anon_id}
    return result


# --------------------------------------------------------------------------
# Week status: final / in_progress / not_started, from ESPN's own status
# fields (matchup period position + per-matchup "winner" + pro game kickoff
# times). Never inferred from fantasy scores.
# --------------------------------------------------------------------------


def fetch_week_schedule_raw(league: League, week: int) -> list[dict[str, Any]]:
    params = {"view": ["mMatchupScore"], "scoringPeriodId": week}
    filters = {"schedule": {"filterMatchupPeriodIds": {"value": [week]}}}
    headers = {"x-fantasy-filter": json.dumps(filters)}
    data = league.espn_request.league_get(params=params, headers=headers)
    return data.get("schedule", [])


def compute_week_status(league: League, week: int, current_matchup_period: int, schedule_entries: list[dict[str, Any]]) -> str:
    if week > current_matchup_period:
        return "not_started"
    if week < current_matchup_period:
        return "final"

    # week == current_matchup_period: ESPN's own pointer is ambiguous here
    # (it can mark a week "current" before any games kick off, or while
    # games are still being played). Cross-check with the per-matchup
    # "winner" field (ignoring playoff byes, which never resolve a winner)
    # and, if still undecided, the actual NFL kickoff times for that week.
    decided_entries = [e for e in schedule_entries if e.get("away")]
    if decided_entries and all(e.get("winner") != "UNDECIDED" for e in decided_entries):
        return "final"

    try:
        pro_schedule = league._get_pro_schedule(week)  # noqa: SLF001
        kickoffs = [v[1] for v in pro_schedule.values() if v and v[1]]
    except Exception:  # noqa: BLE001
        kickoffs = []

    if kickoffs and datetime.now().timestamp() * 1000 < min(kickoffs):
        return "not_started"
    return "in_progress"


def compute_all_week_statuses(league: League, weeks: int) -> dict[int, str]:
    current_matchup_period = league.currentMatchupPeriod
    statuses: dict[int, str] = {}
    for week in range(1, weeks + 1):
        try:
            entries = fetch_week_schedule_raw(league, week)
        except Exception:  # noqa: BLE001
            entries = []
        statuses[week] = compute_week_status(league, week, current_matchup_period, entries)
        time.sleep(REQUEST_DELAY_SECONDS)
    return statuses


# --------------------------------------------------------------------------
# Serialization: RAW (full ESPN detail)
# --------------------------------------------------------------------------


def serialize_settings_raw(league: League, week_statuses: dict[int, str]) -> dict[str, Any]:
    settings = league.settings
    return {
        "name": settings.name,
        "team_count": settings.team_count,
        "scoring_type": settings.scoring_type,
        "regular_season_length": settings.reg_season_count,
        "playoff_team_count": settings.playoff_team_count,
        "playoff_matchup_period_length": settings.playoff_matchup_period_length,
        "matchup_periods": settings.matchup_periods,
        "roster_slots": settings.position_slot_counts,
        "keeper_count": settings.keeper_count,
        "faab": settings.faab,
        "acquisition_budget": settings.acquisition_budget,
        "current_week": league.currentMatchupPeriod,
        "week_status": {str(wk): status for wk, status in sorted(week_statuses.items())},
    }


def serialize_team_raw(team: Any) -> dict[str, Any]:
    return {
        "team_id": team.team_id,
        "team_name": team.team_name,
        "team_abbrev": team.team_abbrev,
        "division_id": team.division_id,
        "division_name": team.division_name,
        "owners": [owner_dict(m) for m in team.owners],
        "wins": team.wins,
        "losses": team.losses,
        "ties": team.ties,
        "points_for": team.points_for,
        "points_against": team.points_against,
        "standing": team.standing,
        "final_standing": team.final_standing,
        "acquisitions": team.acquisitions,
        "drops": team.drops,
        "trades": team.trades,
    }


def total_weeks(league: League) -> int:
    """Total scoring weeks (regular season + playoffs) for this season."""
    if league.settings.matchup_periods:
        return max(int(period) for period in league.settings.matchup_periods)
    return league.current_week


def serialize_box_player(player: Any) -> dict[str, Any]:
    return {
        "player_id": player.playerId,
        "name": player.name,
        "position": player.position,
        "pro_team": player.proTeam,
        "slot_position": player.slot_position,
        "points": player.points,
    }


def serialize_box_score_raw(box_score: Any, week: int, status: str) -> dict[str, Any]:
    def team_id(team: Any) -> int | None:
        return team.team_id if team is not None else None

    def team_name(team: Any) -> str | None:
        return team.team_name if team is not None else None

    return {
        "week": week,
        "status": status,
        "is_playoff": box_score.is_playoff,
        "home_team_id": team_id(box_score.home_team),
        "home_team_name": team_name(box_score.home_team),
        "home_score": box_score.home_score,
        "home_lineup": [serialize_box_player(p) for p in box_score.home_lineup],
        "away_team_id": team_id(box_score.away_team),
        "away_team_name": team_name(box_score.away_team),
        "away_score": box_score.away_score,
        "away_lineup": [serialize_box_player(p) for p in box_score.away_lineup],
    }


def serialize_matchup_only_raw(matchup: Any, week: int, status: str) -> dict[str, Any]:
    home_team = getattr(matchup, "home_team", None)
    away_team = getattr(matchup, "away_team", None)
    return {
        "week": week,
        "status": status,
        "is_playoff": matchup.is_playoff,
        "home_team_id": getattr(home_team, "team_id", None),
        "home_team_name": getattr(home_team, "team_name", None),
        "home_score": matchup.home_score,
        "away_team_id": getattr(away_team, "team_id", None),
        "away_team_name": getattr(away_team, "team_name", None),
        "away_score": matchup.away_score,
    }


def fetch_transactions_raw(league: League, week: int, types: set[str]) -> list[dict[str, Any]]:
    """Fetch the mTransactions2 view directly instead of using
    League.transactions(), which raises KeyError('status') on certain
    trade-related sub-entries (legs of a trade with no top-level status).
    Working from the raw JSON lets us parse those entries defensively."""
    params = {"view": "mTransactions2", "scoringPeriodId": week}
    filters = {"transactions": {"filterType": {"value": list(types)}}}
    headers = {"x-fantasy-filter": json.dumps(filters)}
    data = league.espn_request.league_get(params=params, headers=headers)
    return data.get("transactions", [])


def serialize_transaction_raw(txn: dict[str, Any], league: League) -> dict[str, Any]:
    team = league.get_team_data(txn.get("teamId"))
    items = []
    for item in txn.get("items") or []:
        player_id = item.get("playerId")
        items.append(
            {
                "type": item.get("type"),
                "player_id": player_id,
                "player_name": league.player_map.get(player_id, "Unknown"),
                "from_team_id": item.get("fromTeamId"),
                "to_team_id": item.get("toTeamId"),
                "is_keeper": item.get("isKeeper"),
            }
        )
    date = txn.get("processDate") or txn.get("acceptedDate") or txn.get("proposedDate")
    return {
        "id": txn.get("id"),
        "type": txn.get("type"),
        "status": txn.get("status"),
        "team_id": txn.get("teamId"),
        "team_name": team.team_name if team else None,
        "scoring_period": txn.get("scoringPeriodId"),
        "date": date,
        "bid_amount": txn.get("bidAmount"),
        "related_transaction_id": txn.get("relatedTransactionId"),
        "items": items,
    }


def serialize_pick_raw(pick: Any) -> dict[str, Any]:
    return {
        "round": pick.round_num,
        "round_pick": pick.round_pick,
        "team_id": pick.team.team_id if pick.team else None,
        "team_name": pick.team.team_name if pick.team else None,
        "player_id": pick.playerId,
        "player_name": pick.playerName,
        "bid_amount": pick.bid_amount,
        "is_keeper": pick.keeper_status,
        "nominating_team_id": pick.nominatingTeam.team_id if pick.nominatingTeam else None,
    }


def serialize_standing_raw(team: Any) -> dict[str, Any]:
    return {
        "team_id": team.team_id,
        "team_name": team.team_name,
        "final_standing": team.final_standing,
        "wins": team.wins,
        "losses": team.losses,
        "ties": team.ties,
        "points_for": team.points_for,
        "points_against": team.points_against,
    }


# --------------------------------------------------------------------------
# Serialization: PUBLIC (cleaned, anonymized, committed to the app)
# --------------------------------------------------------------------------


def clean_settings_public(raw_settings: dict[str, Any]) -> dict[str, Any]:
    regular_season_length = raw_settings["regular_season_length"]
    all_weeks = sorted(int(w) for w in raw_settings["week_status"].keys())
    playoff_weeks = [w for w in all_weeks if w > regular_season_length]
    return {
        "team_count": raw_settings["team_count"],
        "regular_season_length": regular_season_length,
        "playoff_weeks": playoff_weeks,
        "current_week": raw_settings["current_week"],
        "roster_slots": raw_settings["roster_slots"],
        "week_status": raw_settings["week_status"],
    }


def clean_teams_public(raw_teams: list[dict[str, Any]], espn_to_public: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    cleaned = []
    for team in raw_teams:
        owners = []
        for raw_owner in team["owners"]:
            mapped = espn_to_public.get(raw_owner["id"])
            if mapped:
                owners.append(mapped)
        cleaned.append(
            {
                "team_id": team["team_id"],
                "team_name": team["team_name"],
                "owners": owners,
            }
        )
    return cleaned


def clean_box_score_public(raw_entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "week": raw_entry["week"],
        "status": raw_entry["status"],
        "is_playoff": raw_entry["is_playoff"],
        "home_team_id": raw_entry["home_team_id"],
        "home_score": raw_entry["home_score"],
        "home_lineup": raw_entry["home_lineup"],
        "away_team_id": raw_entry["away_team_id"],
        "away_score": raw_entry["away_score"],
        "away_lineup": raw_entry["away_lineup"],
    }


def clean_matchups_public(box_score_entries: list[dict[str, Any]], weeks: int, week_statuses: dict[int, str]) -> list[dict[str, Any]]:
    """Slim, per-week matchup list for the app. Byes (one team, no
    opponent) are preserved exactly as ESPN returns them - never given an
    invented placeholder opponent."""
    by_week: dict[int, list[dict[str, Any]]] = {w: [] for w in range(1, weeks + 1)}
    for entry in box_score_entries:
        by_week.setdefault(entry["week"], []).append(
            {
                "home_team_id": entry["home_team_id"],
                "home_score": entry["home_score"],
                "away_team_id": entry["away_team_id"],
                "away_score": entry["away_score"],
            }
        )
    return [
        {
            "week": week,
            "status": week_statuses.get(week, "not_started"),
            "matchups": by_week.get(week, []),
        }
        for week in range(1, weeks + 1)
    ]


def clean_transaction_public(raw_txn: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": raw_txn["id"],
        "type": raw_txn["type"],
        "status": raw_txn["status"],
        "team_id": raw_txn["team_id"],
        "team_name": raw_txn["team_name"],
        "scoring_period": raw_txn["scoring_period"],
        "date": raw_txn["date"],
        "bid_amount": raw_txn["bid_amount"],
        "items": [
            {
                "type": item["type"],
                "player_id": item["player_id"],
                "player_name": item["player_name"],
                "from_team_id": item["from_team_id"],
                "to_team_id": item["to_team_id"],
            }
            for item in raw_txn["items"]
        ],
    }


def clean_pick_public(raw_pick: dict[str, Any]) -> dict[str, Any]:
    return {
        "round": raw_pick["round"],
        "round_pick": raw_pick["round_pick"],
        "team_id": raw_pick["team_id"],
        "team_name": raw_pick["team_name"],
        "player_id": raw_pick["player_id"],
        "player_name": raw_pick["player_name"],
        "is_keeper": raw_pick["is_keeper"],
    }


def clean_standing_public(raw_standing: dict[str, Any]) -> dict[str, Any]:
    return dict(raw_standing)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(data, f, indent=2, default=str)


def write_seasons_manifest() -> list[int]:
    """The browser can't list directories at runtime, so write a small
    manifest (/app/src/data/seasons.json) the app can fetch/import to know
    which seasons exist. Reflects every season folder actually present on
    disk (not just the ones touched by this run), so `--season` refreshes
    don't drop older seasons from the list."""
    seasons = sorted(
        int(child.name)
        for child in PUBLIC_DATA_DIR.iterdir()
        if child.is_dir() and child.name.isdigit() and (child / "settings.json").exists()
    )
    write_json(PUBLIC_DATA_DIR / "seasons.json", seasons)
    return seasons


def export_season(league: League, espn_to_public: dict[str, dict[str, str]]) -> SeasonResult:
    notes: list[str] = []
    season = league.year
    raw_dir = RAW_DIR / str(season)
    public_dir = PUBLIC_DATA_DIR / str(season)

    weeks = total_weeks(league)
    week_statuses = compute_all_week_statuses(league, weeks)

    raw_settings = serialize_settings_raw(league, week_statuses)
    write_json(raw_dir / "settings.json", raw_settings)
    write_json(public_dir / "settings.json", clean_settings_public(raw_settings))

    raw_teams = [serialize_team_raw(t) for t in league.teams]
    write_json(raw_dir / "teams.json", raw_teams)
    write_json(public_dir / "teams.json", clean_teams_public(raw_teams, espn_to_public))

    raw_standings = [serialize_standing_raw(t) for t in league.standings()]
    write_json(raw_dir / "standings.json", raw_standings)
    write_json(public_dir / "standings.json", [clean_standing_public(s) for s in raw_standings])

    raw_picks = [serialize_pick_raw(p) for p in league.draft]
    write_json(raw_dir / "draft.json", {"picks": raw_picks})
    write_json(public_dir / "draft.json", {"picks": [clean_pick_public(p) for p in raw_picks]})
    if not league.draft:
        notes.append("draft data was empty")

    # Only fetch detailed box scores through the last week that has
    # started; future weeks have no lineups yet and are represented purely
    # via their "not_started" status in matchups.json.
    last_relevant_week = max((w for w, s in week_statuses.items() if s != "not_started"), default=0)

    box_scores: list[dict[str, Any]] = []
    player_team_cache: dict[int, int] = {}
    box_score_failed_weeks: list[int] = []
    for week in range(1, last_relevant_week + 1):
        status = week_statuses[week]
        try:
            week_box_scores = league.box_scores(week=week, player_team_cache=player_team_cache)
            for bs in week_box_scores:
                box_scores.append(serialize_box_score_raw(bs, week, status))
        except Exception:  # noqa: BLE001
            box_score_failed_weeks.append(week)
            try:
                week_matchups = league.scoreboard(week=week)
                for m in week_matchups:
                    box_scores.append(serialize_matchup_only_raw(m, week, status))
            except Exception as exc2:  # noqa: BLE001
                notes.append(f"week {week}: scoreboard also failed ({type(exc2).__name__})")
        time.sleep(REQUEST_DELAY_SECONDS)

    if box_score_failed_weeks:
        notes.append(
            f"box scores unavailable for weeks {box_score_failed_weeks} "
            f"({len(box_score_failed_weeks)} of {last_relevant_week}); "
            "fell back to score-only matchup data for those weeks"
        )

    # RAW keeps only box_scores.json (full player detail). The old
    # matchups.json duplicated the same records - removed.
    write_json(raw_dir / "box_scores.json", box_scores)
    write_json(public_dir / "box_scores.json", [clean_box_score_public(b) for b in box_scores])
    write_json(public_dir / "matchups.json", clean_matchups_public(box_scores, weeks, week_statuses))

    transactions_by_id: dict[Any, dict[str, Any]] = {}
    transaction_failed_weeks: list[int] = []
    for week in range(1, last_relevant_week + 1):
        try:
            raw_txns = fetch_transactions_raw(league, week, TRANSACTION_TYPES)
            for raw_txn in raw_txns:
                serialized = serialize_transaction_raw(raw_txn, league)
                transactions_by_id[serialized["id"]] = serialized
        except Exception:  # noqa: BLE001
            transaction_failed_weeks.append(week)
        time.sleep(REQUEST_DELAY_SECONDS)

    if transaction_failed_weeks:
        notes.append(f"transactions unavailable for weeks {transaction_failed_weeks}")

    raw_transactions = list(transactions_by_id.values())
    write_json(raw_dir / "transactions.json", raw_transactions)
    write_json(public_dir / "transactions.json", [clean_transaction_public(t) for t in raw_transactions])

    status = "ok" if not notes else "partial"
    return SeasonResult(season=season, status=status, notes=notes)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season",
        type=int,
        default=None,
        help="Only (re-)export this single season, e.g. --season 2026. "
        "Use this to refresh the current season without re-fetching history.",
    )
    args = parser.parse_args()

    espn_s2, swid, league_id = load_config()

    if args.season is not None:
        seasons = [args.season]
    else:
        # Use today's year as the starting point to search for a working
        # anchor season; the league's own history then tells us the rest.
        from datetime import date

        seasons = discover_seasons(league_id, espn_s2, swid, date.today().year)

    leagues: list[League] = []
    load_failures: list[tuple[int, str]] = []
    for season in seasons:
        try:
            leagues.append(make_league(league_id, season, espn_s2, swid))
        except Exception as exc:  # noqa: BLE001
            reason = f"{type(exc).__name__}: {exc}"
            print(f"[export] season {season}: FAILED to load ({reason})")
            load_failures.append((season, reason))
        time.sleep(REQUEST_DELAY_SECONDS)

    # Build/refresh the stable owner-id map using every season we could
    # load (not just the ones in this run, if --season was used: the
    # persisted map already has prior seasons' members in it).
    owner_map = load_owner_map()
    owner_map = update_owner_map(owner_map, leagues)
    save_owner_map(owner_map)
    espn_to_public = espn_id_to_public(owner_map)

    results: list[SeasonResult] = []
    failures: list[tuple[int, str]] = list(load_failures)

    for league in leagues:
        season = league.year
        print(f"[export] season {season}: starting")
        try:
            result = export_season(league, espn_to_public)
            results.append(result)
            if result.notes:
                print(f"[export] season {season}: partial ({'; '.join(result.notes)})")
            else:
                print(f"[export] season {season}: ok")
        except Exception as exc:  # noqa: BLE001
            reason = f"{type(exc).__name__}: {exc}"
            print(f"[export] season {season}: FAILED ({reason})")
            failures.append((season, reason))
        time.sleep(REQUEST_DELAY_SECONDS)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "exported": [
            {"season": r.season, "status": r.status, "notes": r.notes} for r in results
        ],
        "failed": [{"season": s, "reason": reason} for s, reason in failures],
    }
    write_json(RAW_DIR / "export_run_summary.json", summary)

    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
    seasons_manifest = write_seasons_manifest()

    print("\n=== Export summary ===")
    for r in results:
        print(f"  season {r.season}: {r.status}")
    for s, reason in failures:
        print(f"  season {s}: failed - {reason}")
    print(f"  seasons manifest (app/src/data/seasons.json): {seasons_manifest}")


if __name__ == "__main__":
    main()
