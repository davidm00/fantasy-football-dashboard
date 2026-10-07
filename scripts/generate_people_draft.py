"""
Generates/updates the person-merge map for manual review
(/data/raw/people.json): a mapping of ESPN member ID -> approved person.
Reads every season's raw teams.json (ESPN member IDs + display names),
groups by team.

This is a human-review file (local only): the two known merges (David
Moses, Jhajuan Countee) and the one known exclusion (Ian Book) live as
code constants in export_league_data.py (KNOWN_SAME_PERSON /
KNOWN_NOT_A_PERSON) so they apply on every run including CI, where
data/raw/ never persists - this script imports those same constants so
the two files can never drift apart. Anything beyond those known facts
is only a suggestion; re-running this script never changes a "person"
value already assigned (see the freeze logic below) - only brand-new
ESPN member IDs get a new number.

Run: python generate_people_draft.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from export_league_data import KNOWN_SAME_PERSON, KNOWN_NOT_A_PERSON

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"
SEASONS = [2022, 2023, 2024, 2025, 2026]


def main() -> None:
    # member_id -> {display_names: set, seasons: {season: [team_id,...]}}
    members: dict[str, dict[str, Any]] = {}
    for season in SEASONS:
        teams = json.load(open(RAW_DIR / str(season) / "teams.json"))
        for team in teams:
            for owner in team["owners"]:
                mid = owner["id"]
                entry = members.setdefault(
                    mid, {"display_names": set(), "seasons": {}}
                )
                entry["display_names"].add(owner.get("full_name") or owner.get("display_name") or "")
                entry["seasons"].setdefault(str(season), []).append(team["team_id"])

    # Assign canonical person IDs: merge known-same-person groups first,
    # then one person per remaining member_id, ordered by first season
    # appearance for stable/readable IDs.
    merge_of: dict[str, str] = {}
    for group in KNOWN_SAME_PERSON:
        canonical = group[0]
        for mid in group:
            merge_of[mid] = canonical

    def sort_key(mid: str) -> tuple[int, str]:
        first_season = min(int(s) for s in members[mid]["seasons"])
        return (first_season, mid)

    canonical_ids = sorted(
        {merge_of.get(mid, mid) for mid in members}, key=sort_key
    )

    # Freeze: a person's number is assigned exactly once, ever. Re-running
    # this script must never change an existing "person" value, even if
    # new members are discovered (new accounts for an existing merge
    # group reuse that group's existing number; new real people just get
    # the next unused number - old numbers are never reused or shifted).
    existing_draft: dict[str, Any] = {}
    out_path = RAW_DIR / "people.json"
    if out_path.exists():
        with out_path.open() as f:
            existing_draft = json.load(f)

    frozen_person_of: dict[str, str] = {
        mid: info["person"] for mid, info in existing_draft.items() if info.get("person")
    }
    used_numbers = {int(p[1:]) for p in frozen_person_of.values()}
    next_num = max(used_numbers, default=0) + 1

    person_number: dict[str, str] = {}
    for cid in canonical_ids:
        group_members = [mid for mid in members if merge_of.get(mid, mid) == cid]
        prior = next((frozen_person_of[m] for m in group_members if m in frozen_person_of), None)
        if prior:
            person_number[cid] = prior
        else:
            person_number[cid] = f"m{next_num:02d}"
            next_num += 1

    draft: dict[str, Any] = {}
    for mid, info in sorted(members.items(), key=lambda kv: sort_key(kv[0])):
        display_names = sorted(n for n in info["display_names"] if n)
        display = display_names[0] if display_names else None

        if mid in KNOWN_NOT_A_PERSON:
            seen = display_names[0] if display_names else mid
            draft[mid] = {
                "person": None,
                "display": None,
                "note": f"not a real person ({seen}) - drop from owners everywhere",
                "display_names_seen": display_names,
                "seasons": info["seasons"],
                "confirm": False,
            }
            continue

        canonical = merge_of.get(mid, mid)
        is_merged = canonical != mid or any(mid in g for g in KNOWN_SAME_PERSON)
        draft[mid] = {
            "person": person_number[canonical],
            "display": display,
            "display_names_seen": display_names,
            "seasons": info["seasons"],
            "merged_with": [m for g in KNOWN_SAME_PERSON if mid in g for m in g if m != mid] or None,
            "confirm": False if (is_merged or mid not in [m for g in KNOWN_SAME_PERSON for m in g]) else True,
        }

    # Sanity flag: any two member_ids NOT already in a known-merge group
    # that share the exact same display name are a likely undetected
    # duplicate - flag for manual confirmation instead of guessing.
    by_display: dict[str, list[str]] = {}
    for mid, info in members.items():
        for name in info["display_names"]:
            if name:
                by_display.setdefault(name, []).append(mid)
    known_pairs = {frozenset(g) for g in KNOWN_SAME_PERSON}
    for name, mids in by_display.items():
        unique_mids = sorted(set(mids))
        if len(unique_mids) > 1 and frozenset(unique_mids) not in known_pairs:
            for mid in unique_mids:
                draft[mid]["confirm"] = True
                draft[mid]["note"] = draft[mid].get("note") or f"shares display name '{name}' with another ID not in a known-merge group - please confirm"

    out_path = RAW_DIR / "people.json"
    with out_path.open("w") as f:
        json.dump(draft, f, indent=2, sort_keys=True)
    print(f"wrote {out_path} ({len(draft)} ESPN member IDs)")
    print("Review every entry with \"confirm\": true by hand before this is used for anything.")


if __name__ == "__main__":
    main()
