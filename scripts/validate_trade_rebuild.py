"""
Standalone validation for the "rebuild trade contents from roster diffs"
idea. This is NOT wired into export_league_data.py. It only reads the
already-exported /data/raw/<season>/*.json files (plus one live call to
recent_activity() for the current season, which isn't cached anywhere
yet) and reports how often the rebuild would match the real ESPN record.

Rebuild rule (per the corrected test spec):
  - Only consider "upheld" trades: has a TRADE_ACCEPT leg, no TRADE_VETO,
    no TRADE_DECLINE in the same relatedTransactionId group.
  - For the accepting team, compare its roster the week before the trade
    (N-1) to the week after (N+1), skipping the execution week itself to
    allow for lock-timing slop.
  - Any player who changed teams in that window AND has no logged
    WAIVER/FREEAGENT ADD (status EXECUTED) by the destination team in
    that window is treated as a traded player, not a waiver pickup
    (a player can only enter a roster via waiver/FA from team 0 (free
    agency), never directly from another team's roster - so a direct
    team-to-team change with no logged add is unambiguous).
  - The counterparty team is whichever other team has matching
    unexplained transitions in the same window.

Ground truth sources, in priority order:
  1. Full item list already present on an ESPN transaction leg in the
     group (unioned across all legs).
  2. For the current season only, a live call to
     League.recent_activity(msg_type="TRADED"), matched to the group by
     closest timestamp.

Run: python validate_trade_rebuild.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"

SEASONS = [2022, 2023, 2024, 2025, 2026]
CURRENT_SEASON = 2026  # only season recent_activity has any data for


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def group_trade_transactions(txns: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for t in txns:
        if not t["type"].startswith("TRADE"):
            continue
        key = t.get("related_transaction_id") or t["id"]
        groups.setdefault(key, []).append(t)
    return groups


def upheld_groups(groups: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    result = {}
    for key, legs in groups.items():
        types = {t["type"] for t in legs}
        if "TRADE_ACCEPT" in types and "TRADE_VETO" not in types and "TRADE_DECLINE" not in types:
            result[key] = legs
    return result


def group_known_items(legs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Union of items across all legs in the group, restricted to type
    TRADE - i.e. players actually exchanged between the two teams. A
    trade's ESPN record can also bundle incidental DROP items (roster
    space made for the incoming players); those aren't something either
    side "received" so they're excluded from the comparison set."""
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


def group_accept_leg(legs: list[dict[str, Any]]) -> dict[str, Any]:
    accepts = [t for t in legs if t["type"] == "TRADE_ACCEPT"]
    # If multiple ACCEPT legs exist (both sides explicitly accepted),
    # use the one with the latest date as the trade's effective moment.
    return max(accepts, key=lambda t: t["date"] or 0)


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
    """(player_id, week) -> set of team_ids that logged an EXECUTED ADD
    of that player that week (via WAIVER or FREEAGENT)."""
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


def rebuild_group(
    accepting_team_id: int,
    week: int,
    roster_by_week: dict[int, dict[int, int]],
    add_log: dict[tuple[int, int], set[int]],
) -> tuple[str, list[dict[str, Any]]]:
    before_week = week - 1
    after_week = week + 1
    if before_week not in roster_by_week or after_week not in roster_by_week:
        return "insufficient_window", []

    before = roster_by_week[before_week]
    after = roster_by_week[after_week]

    # every player present in both snapshots whose team changed
    transitions = []
    for player_id, from_team in before.items():
        to_team = after.get(player_id)
        if to_team is None or to_team == from_team:
            continue
        # explained by a logged waiver/FA add by the destination team
        # anywhere in the window (week-1 .. week+1)?
        explained = False
        for w in (before_week, week, after_week):
            if to_team in add_log.get((player_id, w), set()):
                explained = True
                break
        if explained:
            continue
        transitions.append({"player_id": player_id, "from_team_id": from_team, "to_team_id": to_team})

    relevant = [
        t for t in transitions if accepting_team_id in (t["from_team_id"], t["to_team_id"])
    ]
    if not relevant:
        return "no_unexplained_transitions", []

    # counterparty = whichever other team appears most among relevant transitions
    counterparties: dict[int, int] = {}
    for t in relevant:
        other = t["to_team_id"] if t["from_team_id"] == accepting_team_id else t["from_team_id"]
        counterparties[other] = counterparties.get(other, 0) + 1
    counterparty = max(counterparties, key=lambda k: counterparties[k])

    items = [
        t for t in relevant
        if accepting_team_id in (t["from_team_id"], t["to_team_id"])
        and counterparty in (t["from_team_id"], t["to_team_id"])
    ]
    return "rebuilt", items


def items_match(a: list[dict[str, Any]], b: list[dict[str, Any]]) -> bool:
    def norm(items: list[dict[str, Any]]) -> set[tuple[int, int, int]]:
        return {(i["player_id"], i["from_team_id"], i["to_team_id"]) for i in items}
    return norm(a) == norm(b)


def fetch_current_season_activity() -> list[dict[str, Any]]:
    """One live call: recent_activity(msg_type='TRADED') for the current
    season only (not cached anywhere yet). Returns a list of
    {date, items: [{player_id, from_team_id, to_team_id}]}."""
    load_dotenv(REPO_ROOT / ".env")
    from espn_api.football import League

    espn_s2 = os.environ["ESPN_S2"]
    swid = os.environ["SWID"]
    league_id = int(os.environ["LEAGUE_ID"])
    league = League(league_id=league_id, year=CURRENT_SEASON, espn_s2=espn_s2, swid=swid)

    acts = league.recent_activity(msg_type="TRADED", size=50)
    resolved = []
    for a in acts:
        sent_by_player: dict[int, int] = {}
        received_by_player: dict[int, int] = {}
        for team, action, player, _bid in a.actions:
            team_id = getattr(team, "team_id", None)
            if action == "TRADE_SENT":
                sent_by_player[player.playerId] = team_id
            elif action == "TRADE_RECEIVED":
                received_by_player[player.playerId] = team_id
        items = [
            {
                "player_id": pid,
                "from_team_id": sent_by_player[pid],
                "to_team_id": received_by_player[pid],
            }
            for pid in sent_by_player
            if pid in received_by_player
        ]
        resolved.append({"date": a.date, "items": items})
    return resolved


def match_activity_to_group(
    accepting_team_id: int,
    group_date: int | None,
    activity: list[dict[str, Any]],
    consumed: set[int],
) -> tuple[int, list[dict[str, Any]]] | None:
    """Match a trade group to a recent_activity event. Candidates must
    actually involve the accepting team (closest timestamp alone isn't
    enough - two trades can be accepted within minutes of each other),
    and each activity event can only be consumed by one group."""
    if group_date is None:
        return None
    candidates = [
        (i, a) for i, a in enumerate(activity)
        if i not in consumed
        and any(accepting_team_id in (item["from_team_id"], item["to_team_id"]) for item in a["items"])
    ]
    if not candidates:
        return None
    idx, best = min(candidates, key=lambda ia: abs(ia[1]["date"] - group_date))
    # generous tolerance: ESPN's accept/processDate vs activity-log date can
    # drift by a few minutes to a few hours around review windows.
    if abs(best["date"] - group_date) > 24 * 60 * 60 * 1000:
        return None
    return idx, best["items"]


def main() -> None:
    current_activity = fetch_current_season_activity()
    print(f"recent_activity: {len(current_activity)} resolved trade events for {CURRENT_SEASON}\n")

    overall = {"ground_truth_checked": 0, "exact_match": 0, "partial_match": 0, "miss": 0}

    for season in SEASONS:
        txns = load_json(RAW_DIR / str(season) / "transactions.json")
        box_scores = load_json(RAW_DIR / str(season) / "box_scores.json")

        groups = group_trade_transactions(txns)
        upheld = upheld_groups(groups)
        roster_by_week = build_roster_by_week(box_scores)
        add_log = build_add_log(txns)

        print(f"=== {season}: {len(upheld)} upheld trade group(s) ===")

        consumed_activity: set[int] = set()
        for key, legs in sorted(upheld.items(), key=lambda kv: group_accept_leg(kv[1])["date"] or 0):
            accept = group_accept_leg(legs)
            known_items = group_known_items(legs)
            activity_match = (
                match_activity_to_group(accept["team_id"], accept["date"], current_activity, consumed_activity)
                if season == CURRENT_SEASON
                else None
            )
            activity_items = None
            if activity_match is not None:
                idx, activity_items = activity_match
                consumed_activity.add(idx)
            ground_truth = known_items or activity_items
            ground_truth_source = "mTransactions2" if known_items else ("recent_activity" if activity_items else None)

            status, rebuilt_items = rebuild_group(
                accept["team_id"], accept["scoring_period"], roster_by_week, add_log
            )

            if ground_truth is not None:
                overall["ground_truth_checked"] += 1
                if status == "rebuilt" and items_match(ground_truth, rebuilt_items):
                    overall["exact_match"] += 1
                    verdict = "EXACT MATCH"
                elif status == "rebuilt" and rebuilt_items:
                    overall["partial_match"] += 1
                    verdict = "MISMATCH"
                else:
                    overall["miss"] += 1
                    verdict = f"MISS ({status})"
                print(
                    f"  week {accept['scoring_period']:>2} team {accept['team_id']:>2} "
                    f"[ground truth: {ground_truth_source}] -> {verdict}"
                )
                if verdict != "EXACT MATCH":
                    print(f"    ground truth: {ground_truth}")
                    print(f"    rebuilt:      {rebuilt_items}")
            else:
                label = "rebuilt (no ground truth to check)" if status == "rebuilt" else f"unresolved ({status})"
                print(
                    f"  week {accept['scoring_period']:>2} team {accept['team_id']:>2} "
                    f"[no ESPN record] -> {label}: {rebuilt_items if rebuilt_items else ''}"
                )
        print()

    print("=== summary ===")
    print(
        f"Checked against ground truth: {overall['ground_truth_checked']}  "
        f"Exact match: {overall['exact_match']}  "
        f"Mismatch: {overall['partial_match']}  "
        f"Miss: {overall['miss']}"
    )


if __name__ == "__main__":
    main()
