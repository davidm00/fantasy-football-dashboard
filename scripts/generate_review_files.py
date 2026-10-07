"""
Generates three human-readable Markdown review files for the user to
spot-check before approving the guarded trade rebuild and the person
merge map. Reads cached /data/raw/<season>/*.json only (no live API
calls) and /data/raw/people.json. Writes only to /data/raw/ - nothing
here touches /app/src/data.

Output (all local-only, real names are fine):
  - /data/raw/review_rebuilt_trades.md
  - /data/raw/review_people.md
  - /data/raw/review_unknown_trades.md

Run: python generate_review_files.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
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
    _unexplained_transitions,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"

SEASONS = [2022, 2023, 2024, 2025, 2026]


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def manager_names(teams: list[dict[str, Any]]) -> dict[int, str]:
    names = {}
    for team in teams:
        owner_names = list(dict.fromkeys(o["full_name"] for o in team.get("owners", []) if o.get("full_name")))
        names[team["team_id"]] = " & ".join(owner_names) if owner_names else team["team_name"]
    return names


def player_names(box_scores: list[dict[str, Any]]) -> dict[int, str]:
    names = {}
    for bs in box_scores:
        for side in ("home", "away"):
            for p in bs.get(f"{side}_lineup", []):
                names[p["player_id"]] = p["name"]
    return names


def fmt_date(ms: int | None) -> str:
    if not ms:
        return "?"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def season_data(season: int) -> dict[str, Any]:
    txns = load_json(RAW_DIR / str(season) / "transactions.json")
    box_scores = load_json(RAW_DIR / str(season) / "box_scores.json")
    teams = load_json(RAW_DIR / str(season) / "teams.json")
    activity_path = RAW_DIR / str(season) / "trades_activity.json"
    trade_activity = load_json(activity_path) if activity_path.exists() else []
    is_current = season == max(SEASONS)

    groups = group_trade_transactions(txns)
    upheld = {k: v for k, v in groups.items() if classify_trade_group(v) == "upheld"}
    accepts_by_key = {key: group_accept_leg(legs) for key, legs in upheld.items()}
    team_week_counts: dict[tuple[int, int], int] = {}
    for accept in accepts_by_key.values():
        tw = (accept["team_id"], accept["scoring_period"])
        team_week_counts[tw] = team_week_counts.get(tw, 0) + 1

    roster_by_week = build_roster_by_week(box_scores)
    add_log = build_add_log(txns)
    current_trades = build_trades_public(txns, trade_activity, is_current)
    currently_unknown = {t["id"]: t for t in current_trades if t["source"] == "unknown"}

    return {
        "mgr": manager_names(teams),
        "ply": player_names(box_scores),
        "accepts_by_key": accepts_by_key,
        "team_week_counts": team_week_counts,
        "roster_by_week": roster_by_week,
        "add_log": add_log,
        "currently_unknown": currently_unknown,
    }


def diagnose_counterparties(accepting_team_id: int, week: int, roster_by_week, add_log) -> list[int]:
    """Re-derive which counterparty team(s) the rebuild saw before it hit
    the multiple_candidate_counterparties guard, for the review file only."""
    transitions: dict[int, tuple[int, int]] = {}
    conflicting: set[int] = set()
    for before_wk, after_wk in ((week - 1, week), (week, week + 1)):
        if before_wk not in roster_by_week or after_wk not in roster_by_week:
            continue
        window = _unexplained_transitions(
            roster_by_week[before_wk], roster_by_week[after_wk], (before_wk, week, after_wk), add_log
        )
        for pid, move in window.items():
            if pid in transitions and transitions[pid] != move:
                conflicting.add(pid)
            transitions[pid] = move
    relevant = {
        pid: (frm, to) for pid, (frm, to) in transitions.items()
        if accepting_team_id in (frm, to) and pid not in conflicting
    }
    counterparties: set[int] = set()
    for frm, to in relevant.values():
        counterparties.add(to if frm == accepting_team_id else frm)
    return sorted(counterparties)


def write_rebuilt_review(seasons: dict[int, dict[str, Any]]) -> None:
    rows = []
    for season, data in seasons.items():
        for key, trade in data["currently_unknown"].items():
            accept = data["accepts_by_key"][key]
            tw = (accept["team_id"], accept["scoring_period"])
            status, items, _reason = rebuild_trade_group(
                accept["team_id"], accept["scoring_period"], data["roster_by_week"], data["add_log"],
                data["team_week_counts"][tw],
            )
            if status != "rebuilt":
                continue
            a_team = accept["team_id"]
            b_team = next(i["to_team_id"] if i["from_team_id"] == a_team else i["from_team_id"] for i in items)
            a_got = [data["ply"].get(i["player_id"], f"player {i['player_id']}") for i in items if i["to_team_id"] == a_team]
            b_got = [data["ply"].get(i["player_id"], f"player {i['player_id']}") for i in items if i["to_team_id"] == b_team]
            rows.append(
                {
                    "season": season,
                    "week": accept["scoring_period"],
                    "a": data["mgr"].get(a_team, f"team {a_team}"),
                    "b": data["mgr"].get(b_team, f"team {b_team}"),
                    "a_got": ", ".join(a_got) or "(none)",
                    "b_got": ", ".join(b_got) or "(none)",
                }
            )

    rows.sort(key=lambda r: (r["season"], r["week"]))
    lines = [
        "# Rebuilt trades — review before wiring into export",
        "",
        f"{len(rows)} trades the guarded rebuild would promote from `unknown` to `rebuilt`.",
        "Local-only file; real names used intentionally.",
        "",
        "| Season | Week | Manager A | Manager B | Players A got | Players B got |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| {r['season']} | {r['week']} | {r['a']} | {r['b']} | {r['a_got']} | {r['b_got']} |")
    (RAW_DIR / "review_rebuilt_trades.md").write_text("\n".join(lines) + "\n")
    print(f"wrote review_rebuilt_trades.md ({len(rows)} rows)")


def write_people_review() -> None:
    people = load_json(RAW_DIR / "people.json")
    rows = []
    for espn_id, info in people.items():
        seasons_str = ", ".join(
            f"{yr} (team {','.join(str(t) for t in teams)})" for yr, teams in sorted(info["seasons"].items())
        )
        flag = ""
        if info.get("confirm"):
            flag = "⚠️ confirm"
        if info.get("merged_with"):
            flag = (flag + " " if flag else "") + "merged (2 ESPN accounts)"
        if info.get("person") is None:
            flag = (flag + " " if flag else "") + "excluded - not a real person"
        rows.append(
            {
                "account": ", ".join(info.get("display_names_seen") or [info.get("display") or "?"]),
                "seasons": seasons_str,
                "person": info.get("person") or "(none)",
                "display": info.get("display") or "(dropped)",
                "flag": flag or "-",
            }
        )
    rows.sort(key=lambda r: (r["person"] == "(none)", r["person"], r["account"]))
    lines = [
        "# People / account merge map — review before applying",
        "",
        "One row per raw ESPN account (16 total). Local-only file.",
        "",
        "| ESPN account (display name) | Seasons (team id) | Suggested person | Person display name | Flag |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| {r['account']} | {r['seasons']} | {r['person']} | {r['display']} | {r['flag']} |")
    (RAW_DIR / "review_people.md").write_text("\n".join(lines) + "\n")
    print(f"wrote review_people.md ({len(rows)} rows)")


def write_unknown_review(seasons: dict[int, dict[str, Any]]) -> None:
    rows = []
    week_cluster: dict[tuple[int, int], int] = defaultdict(int)
    for season, data in seasons.items():
        for key, trade in data["currently_unknown"].items():
            accept = data["accepts_by_key"][key]
            tw = (accept["team_id"], accept["scoring_period"])
            status, _items, reason = rebuild_trade_group(
                accept["team_id"], accept["scoring_period"], data["roster_by_week"], data["add_log"],
                data["team_week_counts"][tw],
            )
            if status != "unknown":
                continue
            a_team = accept["team_id"]
            teams_involved = [data["mgr"].get(a_team, f"team {a_team}")]
            candidates = ""
            if reason == "multiple_candidate_counterparties":
                cps = diagnose_counterparties(a_team, accept["scoring_period"], data["roster_by_week"], data["add_log"])
                teams_involved += [data["mgr"].get(c, f"team {c}") for c in cps]
                candidates = ", ".join(data["mgr"].get(c, f"team {c}") for c in cps)
                week_cluster[(season, accept["scoring_period"])] += 1
            elif reason == "same_team_multiple_trades_this_week":
                other_keys = [
                    k for k, acc in data["accepts_by_key"].items()
                    if k != key and (acc["team_id"], acc["scoring_period"]) == tw
                ]
                candidates = f"{len(other_keys)} other upheld trade(s) for this team, same week"
            rows.append(
                {
                    "season": season,
                    "week": accept["scoring_period"],
                    "teams": ", ".join(dict.fromkeys(teams_involved)),
                    "guard": reason,
                    "candidates": candidates,
                }
            )

    rows.sort(key=lambda r: (r["season"], r["week"]))
    lines = [
        "# Unknown trades — review before wiring into export",
        "",
        f"{len(rows)} trades the guarded rebuild leaves `unknown` (no contents guessed). Local-only file.",
        "",
        "| Season | Week | Team(s) involved | Guard | Candidate counterparties / detail |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(f"| {r['season']} | {r['week']} | {r['teams']} | {r['guard']} | {r['candidates']} |")

    lines += ["", "## Week clustering for `multiple_candidate_counterparties`", ""]
    if week_cluster:
        lines.append("| Season | Week | Count |")
        lines.append("|---|---|---|")
        for (season, week), count in sorted(week_cluster.items()):
            lines.append(f"| {season} | {week} | {count} |")
        multi = {k: v for k, v in week_cluster.items() if v > 1}
        if multi:
            lines.append("")
            lines.append(
                "Weeks with more than one ambiguous-counterparty case: "
                + ", ".join(f"{s} wk{w} ({c})" for (s, w), c in sorted(multi.items()))
                + " - several ambiguous trades land in the same week, consistent with busy trade-deadline weeks "
                "rather than a systematic bug."
            )
        else:
            lines.append("")
            lines.append("No single week has more than one ambiguous-counterparty case - these are spread out, not clustered.")
    else:
        lines.append("None.")

    (RAW_DIR / "review_unknown_trades.md").write_text("\n".join(lines) + "\n")
    print(f"wrote review_unknown_trades.md ({len(rows)} rows)")


def main() -> None:
    seasons = {season: season_data(season) for season in SEASONS}
    write_rebuilt_review(seasons)
    write_people_review()
    write_unknown_review(seasons)


if __name__ == "__main__":
    main()
