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
PEOPLE_PATH = RAW_DIR / "people.json"

# Seconds to pause between network requests to be polite to ESPN's API.
REQUEST_DELAY_SECONDS = 1.0

# Approved real-person merges/exclusions (see /data/raw/people.json for the
# full reviewable draft with display names/seasons - this is the subset
# that actually needs to survive into every run, including CI, where
# data/raw/ never persists between runs). Two ESPN member IDs in the same
# group are the same real person and always resolve to one anon ID; an ID
# in KNOWN_NOT_A_PERSON is dropped from owners everywhere (never assigned
# an anon ID at all).
KNOWN_SAME_PERSON: list[list[str]] = [
    ["{17F61188-C664-4827-8F9E-2F4263223B0A}", "{B61EAF29-AB69-469D-B011-1EFA38744F69}"],  # David Moses
    ["{25658ADB-9C1E-43E9-8CFA-AC14FFE356EE}", "{ACCD7B19-B676-4329-A664-2555A51B7A38}"],  # Jhajuan Countee
]
KNOWN_NOT_A_PERSON: set[str] = {
    "{B8EDDD07-E5F3-4C77-894C-0613FF9B6B56}",  # "Ian Book" co-owner slot - not a real league member
}

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
    trade_counts_by_source: dict[str, int]
    vetoed_trades_total: int
    bracket_status: str  # "built", "not_started"
    player_info_calls: int
    waiver_type: str
    faab_budget: int | None


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


def load_people_decisions() -> tuple[dict[str, str], set[str]]:
    """Return (merge_into, excluded), combining two sources:
      - KNOWN_SAME_PERSON / KNOWN_NOT_A_PERSON (hardcoded above): the
        approved facts that MUST apply on every run, including CI, where
        data/raw/ (and therefore people.json) never persists between runs.
      - /data/raw/people.json, if present: the full reviewable draft,
        read in addition for local runs - lets a new merge/exclusion be
        tried out locally before it's promoted to a hardcoded constant.

      - merge_into: raw ESPN member id -> a single arbitrary-but-
        deterministic "merge group key" (sorted-min id of the group).
        Used only to recognize that two raw ids are the same person; the
        anon ID a merged person actually keeps is resolved against
        whichever anon ID already exists in owner_id_map.json (see
        update_owner_map), never recomputed from this key.
      - excluded: raw ESPN member ids that are not a real league member
        and should be dropped from owners everywhere.
    """
    merge_into: dict[str, str] = {}
    excluded: set[str] = set(KNOWN_NOT_A_PERSON)
    for group in KNOWN_SAME_PERSON:
        canonical = sorted(group)[0]
        for member_id in group:
            merge_into[member_id] = canonical

    if PEOPLE_PATH.exists():
        with PEOPLE_PATH.open() as f:
            people = json.load(f)
        for espn_id, info in people.items():
            if info.get("person") is None:
                excluded.add(espn_id)
                continue
            group = sorted({espn_id, *(info.get("merged_with") or [])})
            canonical = group[0]
            for member_id in group:
                merge_into.setdefault(member_id, canonical)
    return merge_into, excluded


def _migrate_legacy_member_schema(members: dict[str, Any]) -> None:
    """One-time in-place migration: old schema stored a single "espn_id"
    string per anon ID; new schema stores "espn_ids" (a list), since a
    merged person can have more than one raw ESPN account."""
    for info in members.values():
        if "espn_ids" not in info and "espn_id" in info:
            info["espn_ids"] = [info.pop("espn_id")]


def update_owner_map(owner_map: dict[str, Any], owner_dicts_in_order: list[dict[str, Any]]) -> dict[str, Any]:
    """Discover every ESPN member (in the given deterministic order - season
    ascending, team ascending, owner-list order), assign each real person a
    stable anonymized ID (m01, m02, ...) the first time they're seen, and
    recompute public display names (first name, +last initial if another
    member shares that first name) across the *entire* known set so a name
    never changes between seasons or across re-runs.

    Applies /data/raw/people.json's approved merges and exclusions:
      - Two+ raw ESPN accounts confirmed to be the same real person always
        resolve to the SAME anon ID (whichever one already exists; new
        accounts for an already-known person never get a new ID).
      - Accounts marked "not a real person" (person: null) are dropped
        entirely - no anon ID is ever assigned to them.
    IDs already assigned are frozen: this function only ever *adds* new
    anon IDs for a brand-new real person, never changes or reuses an
    existing one, even across merges (the lowest already-assigned ID in a
    merge group wins as canonical; any higher-numbered duplicate for the
    same person is folded into it and stops being a separate ID)."""
    members: dict[str, Any] = owner_map.get("members", {})
    _migrate_legacy_member_schema(members)
    merge_into, excluded = load_people_decisions()

    def anon_num(anon_id: str) -> int:
        return int(anon_id[1:])

    # Drop excluded (not-a-real-person) accounts from any anon entry that
    # currently holds them.
    for info in members.values():
        info["espn_ids"] = [eid for eid in info["espn_ids"] if eid not in excluded]
    for anon_id in [a for a, info in members.items() if not info["espn_ids"]]:
        del members[anon_id]

    # One-time consolidation: if a merge group's accounts are currently
    # split across more than one anon ID (e.g. a duplicate account was
    # discovered before the merge was known), fold every higher-numbered
    # anon ID in the group into the lowest-numbered one.
    espn_id_to_anon: dict[str, str] = {}
    for anon_id, info in members.items():
        for eid in info["espn_ids"]:
            espn_id_to_anon[eid] = anon_id

    merge_groups: dict[str, set[str]] = {}
    for member_id, canonical_key in merge_into.items():
        merge_groups.setdefault(canonical_key, set()).add(member_id)
    for group in merge_groups.values():
        anon_ids_in_group = sorted({espn_id_to_anon[m] for m in group if m in espn_id_to_anon}, key=anon_num)
        if len(anon_ids_in_group) <= 1:
            continue
        keep, *drop = anon_ids_in_group
        for anon_id in drop:
            for eid in members[anon_id]["espn_ids"]:
                if eid not in members[keep]["espn_ids"]:
                    members[keep]["espn_ids"].append(eid)
                espn_id_to_anon[eid] = keep
            del members[anon_id]

    # Discover new members. Only a brand-new real person (no existing
    # anon ID anywhere in their merge group) gets the next unused number.
    next_num = max((anon_num(a) for a in members), default=0) + 1
    for od in owner_dicts_in_order:
        espn_id = od["id"]
        if not espn_id or espn_id in excluded:
            continue
        canonical_key = merge_into.get(espn_id, espn_id)
        anon_id = espn_id_to_anon.get(espn_id)
        if anon_id is None:
            # Has a merge-mate already been assigned an ID?
            for member_id, key in merge_into.items():
                if key == canonical_key and member_id in espn_id_to_anon:
                    anon_id = espn_id_to_anon[member_id]
                    break
        if anon_id is None:
            anon_id = f"m{next_num:02d}"
            next_num += 1
            members[anon_id] = {"espn_ids": [], "first_name": od["first_name"], "last_name": od["last_name"]}
        if espn_id not in members[anon_id]["espn_ids"]:
            members[anon_id]["espn_ids"].append(espn_id)
        espn_id_to_anon[espn_id] = anon_id

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
        # never expose more of a real last name than that. Any residual
        # collision is broken with a numeric suffix instead of revealing
        # more of the surname.
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
    """espn member id -> {"id": anon_id, "name": public_name}. A merged
    person's multiple raw ESPN IDs all resolve to the same entry."""
    result = {}
    for anon_id, info in owner_map.get("members", {}).items():
        for espn_id in info["espn_ids"]:
            result[espn_id] = {"id": anon_id, "name": info.get("public_name") or anon_id}
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


def compute_all_week_statuses(league: League, weeks: int) -> tuple[dict[int, str], dict[int, list[dict[str, Any]]]]:
    current_matchup_period = league.currentMatchupPeriod
    statuses: dict[int, str] = {}
    schedule_by_week: dict[int, list[dict[str, Any]]] = {}
    for week in range(1, weeks + 1):
        try:
            entries = fetch_week_schedule_raw(league, week)
        except Exception:  # noqa: BLE001
            entries = []
        schedule_by_week[week] = entries
        statuses[week] = compute_week_status(league, week, current_matchup_period, entries)
        time.sleep(REQUEST_DELAY_SECONDS)
    return statuses, schedule_by_week


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
        "waiver_type": "faab" if settings.faab else "waivers",
        "faab_budget": settings.acquisition_budget if settings.faab else None,
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


# --------------------------------------------------------------------------
# Trades: grouping, recent_activity (current season), rebuild-free
# resolution, and privacy-safe counts for non-upheld trades.
# --------------------------------------------------------------------------


def group_trade_transactions(txns: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group TRADE_* legs that belong to the same trade thread. A trade's
    legs (PROPOSAL, ACCEPT, UPHOLD/VETO/DECLINE) share one relatedTransactionId
    (the proposal's own id); the proposal itself has no relatedTransactionId,
    so it is its own group key."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for t in txns:
        if not t["type"].startswith("TRADE"):
            continue
        key = t.get("related_transaction_id") or t["id"]
        groups.setdefault(key, []).append(t)
    return groups


def classify_trade_group(legs: list[dict[str, Any]]) -> str:
    """One of: upheld, vetoed, declined, cancelled, pending."""
    types = {t["type"] for t in legs}
    if "TRADE_VETO" in types:
        return "vetoed"
    if "TRADE_DECLINE" in types:
        return "declined"
    if "TRADE_ACCEPT" in types:
        return "upheld"
    statuses = {t.get("status") for t in legs}
    if "PENDING" in statuses:
        return "pending"
    return "cancelled"


def group_accept_leg(legs: list[dict[str, Any]]) -> dict[str, Any]:
    accepts = [t for t in legs if t["type"] == "TRADE_ACCEPT"]
    return max(accepts, key=lambda t: t["date"] or 0)


def group_known_items(legs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Union of TRADE-type items across all legs in the group. Excludes
    incidental DROP items (roster space made for incoming players) - those
    aren't something either side "received"."""
    seen = set()
    items = []
    for t in legs:
        for item in t["items"]:
            if item["type"] != "TRADE":
                continue
            dedup_key = (item["player_id"], item["from_team_id"], item["to_team_id"])
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            items.append(item)
    return items


def fetch_trade_activity_raw(league: League) -> list[dict[str, Any]]:
    """league.recent_activity() only has data for the live/current season -
    it returns an empty list harmlessly for completed seasons, so this is
    safe to call for every season on every run."""
    try:
        acts = league.recent_activity(msg_type="TRADED", size=50)
    except Exception:  # noqa: BLE001
        return []
    resolved = []
    for a in acts:
        sent_by_player: dict[int, int] = {}
        received_by_player: dict[int, int] = {}
        player_names: dict[int, str] = {}
        for team, action, player, _bid in a.actions:
            team_id = getattr(team, "team_id", None)
            player_names[player.playerId] = player.name
            if action == "TRADE_SENT":
                sent_by_player[player.playerId] = team_id
            elif action == "TRADE_RECEIVED":
                received_by_player[player.playerId] = team_id
        items = [
            {
                "player_id": pid,
                "player_name": player_names.get(pid),
                "from_team_id": sent_by_player[pid],
                "to_team_id": received_by_player[pid],
            }
            for pid in sent_by_player
            if pid in received_by_player
        ]
        if items:
            resolved.append({"date": a.date, "items": items})
    return resolved


def merge_trade_activity(existing: list[dict[str, Any]], new: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge by date (recent_activity's timestamps are unique per trade
    event); never overwrite an entry already on disk."""
    by_date = {e["date"]: e for e in existing}
    for event in new:
        by_date.setdefault(event["date"], event)
    return [by_date[d] for d in sorted(by_date)]


def match_activity_to_group(
    accepting_team_id: int,
    group_date: int | None,
    activity: list[dict[str, Any]],
    consumed: set[int],
) -> tuple[int, list[dict[str, Any]]] | None:
    """Match a trade group to a resolved recent_activity event.

    Groups are processed in ascending accept-date order by the caller, and
    recent_activity events correspond 1:1 with upheld trades for a team
    (confirmed empirically: 2026 had exactly 8 upheld trades and
    recent_activity returned exactly 8 TRADED events). Picking the
    *nearest-by-absolute-time* candidate was the bug: ESPN's processing lag
    between acceptance and the activity feed timestamp varies enough
    (routinely 20-40h) that two trades involving the same team in the same
    week can have their nearest-candidate ranking flip. Instead, pick the
    *earliest remaining* (not-yet-consumed) event that involves this team -
    since both lists are chronological and each team's trades consume its
    own events in order, this pairs correctly regardless of absolute gap."""
    if group_date is None:
        return None
    candidates = [
        (i, a) for i, a in enumerate(activity)
        if i not in consumed
        and any(accepting_team_id in (item["from_team_id"], item["to_team_id"]) for item in a["items"])
    ]
    if not candidates:
        return None
    idx, best = min(candidates, key=lambda ia: ia[1]["date"])
    return idx, best["items"]


def build_roster_by_week(box_scores: list[dict[str, Any]]) -> dict[int, dict[int, int]]:
    """week -> {player_id: team_id}, from locked box-score lineups."""
    by_week: dict[int, dict[int, int]] = {}
    for bs in box_scores:
        week = bs["week"]
        roster = by_week.setdefault(week, {})
        for side in ("home", "away"):
            team_id = bs.get(f"{side}_team_id")
            if team_id is None:
                continue
            for player in bs.get(f"{side}_lineup", []):
                roster[player["player_id"]] = team_id
    return by_week


def build_add_log(txns: list[dict[str, Any]]) -> dict[tuple[int, int], set[int]]:
    """(player_id, week) -> set of team_ids that logged an EXECUTED ADD of
    that player that week (via WAIVER or FREEAGENT). A player can only
    enter a roster via waiver/FA from free agency, never directly from
    another team's roster, so a direct team-to-team change with no
    logged add here is unambiguously a trade, not a waiver pickup."""
    log: dict[tuple[int, int], set[int]] = {}
    for t in txns:
        if t["type"] not in ("WAIVER", "FREEAGENT"):
            continue
        if t["status"] != "EXECUTED":
            continue
        week = t["scoring_period"]
        for item in t["items"]:
            if item["type"] != "ADD":
                continue
            log.setdefault((item["player_id"], week), set()).add(item["to_team_id"])
    return log


def _unexplained_transitions(
    before: dict[int, int],
    after: dict[int, int],
    weeks_to_check: tuple[int, ...],
    add_log: dict[tuple[int, int], set[int]],
) -> dict[int, tuple[int, int]]:
    """player_id -> (from_team, to_team) for every player whose team
    changed between two roster snapshots with no logged waiver/FA add by
    the destination team in any of weeks_to_check."""
    result: dict[int, tuple[int, int]] = {}
    for player_id, from_team in before.items():
        to_team = after.get(player_id)
        if to_team is None or to_team == from_team:
            continue
        explained = any(to_team in add_log.get((player_id, w), set()) for w in weeks_to_check)
        if explained:
            continue
        result[player_id] = (from_team, to_team)
    return result


def rebuild_trade_group(
    accepting_team_id: int,
    week: int,
    roster_by_week: dict[int, dict[int, int]],
    add_log: dict[tuple[int, int], set[int]],
    same_team_same_week_count: int,
) -> tuple[str, list[dict[str, Any]], str | None]:
    """Rebuild a trade's player contents from roster diffs around its
    execution week. Returns (status, items, guard_reason).

    status is "rebuilt" (safe to use), or "unknown" (not safe - either no
    unexplained transitions were found, or a guard tripped). Window: we
    check BOTH week-1 -> week AND week -> week+1, since a trade accepted
    mid-week can already be reflected in that week's locked lineup (not
    just the following week's) - using whichever of the two windows has
    data available, unioned together."""
    if same_team_same_week_count > 1:
        return "unknown", [], "same_team_multiple_trades_this_week"

    transitions: dict[int, tuple[int, int]] = {}
    conflicting_players: set[int] = set()
    any_window_available = False
    for before_wk, after_wk in ((week - 1, week), (week, week + 1)):
        if before_wk not in roster_by_week or after_wk not in roster_by_week:
            continue
        any_window_available = True
        window_transitions = _unexplained_transitions(
            roster_by_week[before_wk], roster_by_week[after_wk], (before_wk, week, after_wk), add_log
        )
        for player_id, move in window_transitions.items():
            if player_id in transitions and transitions[player_id] != move:
                conflicting_players.add(player_id)
            transitions[player_id] = move

    if not transitions:
        return "unknown", [], "no_unexplained_transitions" if any_window_available else "insufficient_window"

    relevant = {
        pid: (frm, to) for pid, (frm, to) in transitions.items()
        if accepting_team_id in (frm, to) and pid not in conflicting_players
    }
    if not relevant:
        return "unknown", [], "no_unexplained_transitions"

    counterparties: dict[int, int] = {}
    for frm, to in relevant.values():
        other = to if frm == accepting_team_id else frm
        counterparties[other] = counterparties.get(other, 0) + 1

    # Guard: every moved player must tie back to one single counterparty
    # team. If relevant transitions point at more than one other team,
    # we can't safely say which trade each player belongs to.
    if len(counterparties) > 1:
        return "unknown", [], "multiple_candidate_counterparties"

    counterparty = next(iter(counterparties))
    items = [
        {"player_id": pid, "from_team_id": frm, "to_team_id": to}
        for pid, (frm, to) in relevant.items()
    ]

    received_by_accepting = sum(1 for i in items if i["to_team_id"] == accepting_team_id)
    received_by_counterparty = sum(1 for i in items if i["to_team_id"] == counterparty)
    if received_by_accepting == 0 or received_by_counterparty == 0:
        return "unknown", [], "one_sided_result"

    return "rebuilt", items, None


def build_trades_public(
    txns: list[dict[str, Any]],
    trade_activity: list[dict[str, Any]],
    is_current_season: bool,
    roster_by_week: dict[int, dict[int, int]] | None = None,
    add_log: dict[tuple[int, int], set[int]] | None = None,
) -> list[dict[str, Any]]:
    """One entry per upheld (executed, non-vetoed) trade. Players are
    included when we have an actual ESPN record (a full item list on one
    of the trade's legs, or - for the current season - a recent_activity
    match): "source": "espn". Failing that, if roster_by_week/add_log are
    supplied, we attempt a guarded roster-diff rebuild: "source":
    "rebuilt". If neither succeeds (or a guard trips), the trade is
    "source": "unknown" with an empty player list - nothing is ever
    guessed past what the guards allow."""
    groups = group_trade_transactions(txns)
    trades = []
    consumed_activity: set[int] = set()
    upheld = {k: v for k, v in groups.items() if classify_trade_group(v) == "upheld"}

    # Count upheld trades per (team, week) up front - needed by the
    # same-team-same-week rebuild guard.
    team_week_counts: dict[tuple[int, int], int] = {}
    accepts_by_key = {key: group_accept_leg(legs) for key, legs in upheld.items()}
    for accept in accepts_by_key.values():
        tw_key = (accept["team_id"], accept["scoring_period"])
        team_week_counts[tw_key] = team_week_counts.get(tw_key, 0) + 1

    for key, legs in sorted(upheld.items(), key=lambda kv: group_accept_leg(kv[1])["date"] or 0):
        accept = accepts_by_key[key]
        known_items = group_known_items(legs)
        source = None
        items = known_items
        if items:
            source = "espn"
        elif is_current_season:
            match = match_activity_to_group(accept["team_id"], accept["date"], trade_activity, consumed_activity)
            if match:
                idx, activity_items = match
                consumed_activity.add(idx)
                items = [
                    {
                        "player_id": i["player_id"],
                        "player_name": i["player_name"],
                        "from_team_id": i["from_team_id"],
                        "to_team_id": i["to_team_id"],
                    }
                    for i in activity_items
                ]
                source = "espn"
        if source is None and roster_by_week is not None and add_log is not None:
            tw_key = (accept["team_id"], accept["scoring_period"])
            status, rebuilt_items, _reason = rebuild_trade_group(
                accept["team_id"], accept["scoring_period"], roster_by_week, add_log, team_week_counts[tw_key]
            )
            if status == "rebuilt":
                items = rebuilt_items
                source = "rebuilt"
        if source is None:
            items = []
            source = "unknown"
        team_ids = sorted({accept["team_id"], *(i["from_team_id"] for i in items), *(i["to_team_id"] for i in items)})
        trades.append(
            {
                "id": key,
                "week": accept["scoring_period"],
                "date": accept["date"],
                "team_ids": team_ids,
                "items": items,
                "source": source,
            }
        )
    _check_no_rebuilt_overlap(trades)
    return trades


def _check_no_rebuilt_overlap(trades: list[dict[str, Any]]) -> None:
    """Safety guard for the (not-yet-wired-in) rebuild path: a single
    player roster transition can only ever belong to one real trade. If
    the same player_id shows up in more than one "rebuilt" trade in the
    same week, that's a sign the guards let through a bad grouping -
    fail loudly instead of silently publishing conflicting trades."""
    seen: dict[tuple[int, int], str] = {}  # (week, player_id) -> trade id
    conflicts: list[str] = []
    for trade in trades:
        if trade["source"] != "rebuilt":
            continue
        week = trade["week"]
        for item in trade["items"]:
            dupe_key = (week, item["player_id"])
            if dupe_key in seen and seen[dupe_key] != trade["id"]:
                conflicts.append(
                    f"player {item['player_id']} in both trade {seen[dupe_key]!r} and {trade['id']!r} (week {week})"
                )
            else:
                seen[dupe_key] = trade["id"]
    if conflicts:
        raise RuntimeError(
            "rebuilt-trade overlap guard tripped - a player appears in more than one "
            "rebuilt trade in the same week:\n  " + "\n  ".join(conflicts)
        )


def build_trade_privacy_summary(txns: list[dict[str, Any]]) -> dict[str, Any]:
    """Counts only for non-upheld trades - no player contents, and no
    record of which team cast a veto (we never read team_id off a
    TRADE_VETO leg for this reason)."""
    groups = group_trade_transactions(txns)
    by_team: dict[int, dict[str, int]] = {}
    vetoed_total = 0

    def bump(team_id: int | None, field: str) -> None:
        if team_id is None:
            return
        by_team.setdefault(team_id, {"declined": 0, "cancelled": 0, "pending": 0})[field] += 1

    for legs in groups.values():
        classification = classify_trade_group(legs)
        if classification == "upheld":
            continue
        if classification == "vetoed":
            vetoed_total += 1
            continue
        if classification == "declined":
            decline_leg = next((t for t in legs if t["type"] == "TRADE_DECLINE"), None)
            bump(decline_leg["team_id"] if decline_leg else None, "declined")
        elif classification == "cancelled":
            proposal = next((t for t in legs if t["type"] == "TRADE_PROPOSAL"), None)
            bump(proposal["team_id"] if proposal else None, "cancelled")
        elif classification == "pending":
            proposal = next((t for t in legs if t["type"] == "TRADE_PROPOSAL"), None)
            bump(proposal["team_id"] if proposal else None, "pending")

    return {"vetoed_trades_total": vetoed_total, "by_team": by_team}


# --------------------------------------------------------------------------
# Playoff bracket
# --------------------------------------------------------------------------


def build_bracket_public(
    league: League, schedule_by_week: dict[int, list[dict[str, Any]]], regular_season_length: int, weeks: int
) -> dict[str, Any] | None:
    """Reconstructed from playoff-week schedule entries (playoffTierType,
    winner, teamId, totalPoints). Returns None if playoffs haven't started
    yet this season."""
    playoff_weeks = [w for w in range(regular_season_length + 1, weeks + 1) if schedule_by_week.get(w)]
    if not playoff_weeks:
        return None

    rounds = []
    any_decided = False
    for week in playoff_weeks:
        games = []
        for entry in schedule_by_week[week]:
            home = entry.get("home") or {}
            away = entry.get("away") or {}
            winner = entry.get("winner", "UNDECIDED")
            if winner != "UNDECIDED":
                any_decided = True
            games.append(
                {
                    "tier": entry.get("playoffTierType"),
                    "home_team_id": home.get("teamId"),
                    "home_score": home.get("totalPoints"),
                    "away_team_id": away.get("teamId"),
                    "away_score": away.get("totalPoints"),
                    "winner": winner,
                }
            )
        rounds.append({"week": week, "games": games})

    if not any_decided:
        # playoff weeks exist on the schedule but nothing has been played yet
        return None

    return {"rounds": rounds}


# --------------------------------------------------------------------------
# Player weekly points, scoped to players who appear in a resolved trade
# --------------------------------------------------------------------------


def build_traded_player_points(
    league: League, trades_public: list[dict[str, Any]], existing: dict[str, Any] | None, season_finished: bool
) -> dict[str, Any]:
    traded_player_ids = sorted({item["player_id"] for trade in trades_public for item in trade["items"]})
    existing_players: dict[str, Any] = (existing or {}).get("players", {})

    if season_finished:
        ids_to_fetch = [pid for pid in traded_player_ids if str(pid) not in existing_players]
    else:
        ids_to_fetch = traded_player_ids

    fetched_count = 0
    players_out = dict(existing_players)
    if ids_to_fetch:
        results = league.player_info(playerId=ids_to_fetch)
        if results is None:
            results = []
        elif not isinstance(results, list):
            results = [results]
        fetched_count = len(results)
        for player in results:
            weekly_points = {
                str(week): stat.get("points")
                for week, stat in (player.stats or {}).items()
                if isinstance(stat, dict)
            }
            players_out[str(player.playerId)] = {
                "player_name": player.name,
                "weekly_points": weekly_points,
            }

    return {"players": players_out}, fetched_count


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
        "waiver_type": raw_settings["waiver_type"],
        "faab_budget": raw_settings["faab_budget"],
    }


def clean_teams_public(raw_teams: list[dict[str, Any]], espn_to_public: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    cleaned = []
    for team in raw_teams:
        owners = []
        seen_anon_ids: set[str] = set()
        for raw_owner in team["owners"]:
            mapped = espn_to_public.get(raw_owner["id"])
            # A merged person (two raw ESPN accounts for the same real
            # manager) can show up as two separate co-owner slots on the
            # same team once both accounts map to the same anon ID - only
            # list that person once.
            if mapped and mapped["id"] not in seen_anon_ids:
                owners.append(mapped)
                seen_anon_ids.add(mapped["id"])
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
    """Only called for WAIVER/FREEAGENT transactions now - trades have
    their own dedicated trades.json (upheld only, privacy-filtered) and
    trade_activity_summary.json (counts only for everything else)."""
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


def load_json_if_exists(path: Path) -> Any | None:
    if not path.exists():
        return None
    with path.open() as f:
        return json.load(f)


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


def export_season(league: League, espn_to_public: dict[str, dict[str, str]], is_current_season: bool) -> SeasonResult:
    notes: list[str] = []
    season = league.year
    raw_dir = RAW_DIR / str(season)
    public_dir = PUBLIC_DATA_DIR / str(season)

    weeks = total_weeks(league)
    week_statuses, schedule_by_week = compute_all_week_statuses(league, weeks)

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
    # Trades are handled separately below (trades.json + privacy-safe
    # summary); the general transactions.json is now only adds/drops.
    non_trade_transactions = [t for t in raw_transactions if not t["type"].startswith("TRADE")]
    write_json(public_dir / "transactions.json", [clean_transaction_public(t) for t in non_trade_transactions])

    # --- Trades: current-season recent_activity cache (merge, never overwrite) ---
    activity_path = raw_dir / "trades_activity.json"
    existing_activity = load_json_if_exists(activity_path) or []
    new_activity = fetch_trade_activity_raw(league)
    merged_activity = merge_trade_activity(existing_activity, new_activity)
    write_json(activity_path, merged_activity)

    roster_by_week = build_roster_by_week(box_scores)
    add_log = build_add_log(raw_transactions)
    trades_public = build_trades_public(
        raw_transactions, merged_activity, is_current_season, roster_by_week=roster_by_week, add_log=add_log
    )
    write_json(public_dir / "trades.json", trades_public)
    trade_counts_by_source: dict[str, int] = {}
    for trade in trades_public:
        trade_counts_by_source[trade["source"]] = trade_counts_by_source.get(trade["source"], 0) + 1

    privacy_summary = build_trade_privacy_summary(raw_transactions)
    write_json(public_dir / "trade_activity_summary.json", privacy_summary)

    # --- Playoff bracket ---
    bracket = build_bracket_public(league, schedule_by_week, raw_settings["regular_season_length"], weeks)
    bracket_status = "built" if bracket is not None else "not_started"
    if bracket is not None:
        write_json(public_dir / "bracket.json", bracket)

    # --- Player weekly points, scoped to traded players ---
    points_path = public_dir / "traded_player_points.json"
    existing_points = load_json_if_exists(points_path)
    season_finished = all(s == "final" for s in week_statuses.values())
    traded_player_points, player_info_calls = build_traded_player_points(
        league, trades_public, existing_points, season_finished
    )
    write_json(points_path, traded_player_points)

    status = "ok" if not notes else "partial"
    return SeasonResult(
        season=season,
        status=status,
        notes=notes,
        trade_counts_by_source=trade_counts_by_source,
        vetoed_trades_total=privacy_summary["vetoed_trades_total"],
        bracket_status=bracket_status,
        player_info_calls=player_info_calls,
        waiver_type=raw_settings["waiver_type"],
        faab_budget=raw_settings["faab_budget"],
    )


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
    # persisted map already has prior seasons' members in it). Discovery
    # order is season ascending, team ascending, owner-list order - this
    # must match the offline regeneration path in
    # scripts/apply_people_merge.py so re-runs stay deterministic.
    owner_dicts_in_order = [
        owner_dict(raw_member)
        for league in sorted(leagues, key=lambda lg: lg.year)
        for team in sorted(league.teams, key=lambda t: t.team_id)
        for raw_member in team.owners
    ]
    owner_map = load_owner_map()
    owner_map = update_owner_map(owner_map, owner_dicts_in_order)
    save_owner_map(owner_map)
    espn_to_public = espn_id_to_public(owner_map)

    results: list[SeasonResult] = []
    failures: list[tuple[int, str]] = list(load_failures)

    max_season = max((l.year for l in leagues), default=None)

    for league in leagues:
        season = league.year
        print(f"[export] season {season}: starting")
        try:
            result = export_season(league, espn_to_public, is_current_season=(season == max_season))
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
            {
                "season": r.season,
                "status": r.status,
                "notes": r.notes,
                "trade_counts_by_source": r.trade_counts_by_source,
                "vetoed_trades_total": r.vetoed_trades_total,
                "bracket_status": r.bracket_status,
                "player_info_calls": r.player_info_calls,
                "waiver_type": r.waiver_type,
                "faab_budget": r.faab_budget,
            }
            for r in results
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
