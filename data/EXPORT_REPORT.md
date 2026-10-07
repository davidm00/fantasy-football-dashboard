# Export Verification Report

Generated from a real run of `scripts/export_league_data.py` against league
`1371469314`, after the AUDIT.md remediation pass. Season discovery is
**not** hardcoded: the script asks the current season for `previousSeasons`
and got back `[2022, 2023, 2024, 2025, 2026]`.

The export now produces two copies of the data (see README "Data rules"):

- **RAW** — full ESPN detail, local only: `/data/raw/<season>/`
- **PUBLIC** — cleaned/anonymized, committed: `/app/src/data/<season>/`

All counts below are read directly from these files, not carried over from
an older report.

## 1. Seasons exported vs. failed

| Season | Exported? | Notes |
|--------|-----------|-------|
| 2022 | ✅ OK | **The league's first season.** 10 teams, 160 draft picks, 584 transactions (27 trades), 16 weeks, all `final`. |
| 2023 | ✅ OK | 10 teams, 180 draft picks, 449 transactions (10 trades), 16 weeks, all `final`. |
| 2024 | ✅ OK | 12 teams, 204 draft picks, 692 transactions (9 trades), 17 weeks, all `final`. |
| 2025 | ✅ OK | 12 teams, 204 draft picks, 801 transactions (11 trades), 17 weeks, all `final`. |
| 2026 | ✅ OK | In-progress season. 12 teams, 204 draft picks, 304 transactions so far (9 trades), weeks 1-4 `final`, weeks 5-17 `not_started`. |

**No seasons failed in this run.** Earlier in this project, 2022-2024
returned `ESPNAccessDenied` ("not authorized") when the script was first run
with empty `ESPN_S2`/`SWID` placeholders in `.env` — this is simply because
this is a private ESPN league and those older seasons require authentication
to read at all (2025-2026 happened to be servable without cookies, which is
what let us partially validate the script before real credentials were
added). Those were never genuine export failures once valid cookies were
supplied; they are not reflected as failures above because every season now
exports successfully on every run.

## 2. Fields missing or empty

Every field in the original spec is present and non-empty for all five
seasons, **except**:

- **Transactions `FREEAGENT` type**: zero `FREEAGENT`-typed entries exist in
  any season; all adds/drops come back as `WAIVER` type instead. This league
  has FAAB enabled (`settings.json` → `"faab": true`), so free-agent moves
  are processed through the waiver system — not a data gap, just an unused
  bucket for this league.
- **2022 keepers**: 0 of 160 picks flagged `is_keeper`. Confirmed with the
  league owner — **2022 was the league's first year**, so there were no
  keepers to carry over yet. This is accurate data, not an export gap.

One library bug remains worked around in the script: the `espn-api`
package's `League.transactions()` throws `KeyError: 'status'` on certain
trade-related sub-entries (legs of a trade with no top-level `status`
field). The script fetches the raw `mTransactions2` JSON directly and parses
it defensively instead of using the library's `Transaction` class.

## 3. Week status

Every week in every season now carries a `status` of `final`, `in_progress`,
or `not_started` (stored per-week in each season's `settings.json` →
`week_status`, and per-matchup in `matchups.json`/`box_scores.json`). This
comes entirely from ESPN's own status data — the position of the matchup
period relative to `currentMatchupPeriod`, the per-matchup `winner` field,
and (only for the single ambiguous "current" week) actual NFL kickoff
times — never from fantasy scores.

All of 2022-2025 are fully `final`. For 2026 (the live season as of this
export), weeks 1-4 are `final` and weeks 5-17 are `not_started` — the
previous version of this export stored week 5 as a `0.0`-`0.0` placeholder
matchup, indistinguishable from a real tie; that's fixed now, and no box
score data is fetched at all for weeks marked `not_started`.

## 4. Trade player-points gap check

**Trade picked:** 2025 season, week 7, between team 5 and team 6 — Jahmyr
Gibbs + Brian Robinson Jr. (from team 5) traded for Chase Brown + Rico
Dowdle (from team 6).

For this specific trade, all four players stayed on a roster (starter or
bench) every remaining week of the regular season, so weekly points are
available for all of them through week 14 (this league's regular season
length).

**However, this is not a guarantee — it's a gap in the data model.** The
`box_scores.json` export is built by walking each team's roster for a given
week (`League.box_scores()`), which only includes players who are on **some**
team's roster that week. If a traded player is later dropped and spends a
week as a free agent before being re-added (by anyone), there is no row for
them that week — free agents aren't attached to any team's box score.
**Plainly: if a traded player goes to free agency, this export does not have
their points for that week.** Getting those points would require a separate
per-week free-agent/player-pool query stitched in by `player_id`, which is
out of scope for this script as built.

## 5. Keeper picks in draft data

Keepers are identifiable via an `is_keeper` boolean per pick in `draft.json`
(sourced from ESPN's `keeper` flag on each draft pick):

| Season | Picks | Flagged as keeper |
|--------|-------|--------------------|
| 2022 | 160 | 0 |
| 2023 | 180 | 8 |
| 2024 | 204 | 7 |
| 2025 | 204 | 11 |
| 2026 | 204 | 11 |

2022 shows zero keepers because it was the league's first year — confirmed
by the league owner, not a data gap.

Example keeper pick (2023, `draft.json`): round 1, pick 4, team 6 ("Let me
in the Playoffs") kept Justin Jefferson, `is_keeper: true`.

## 6. Manager-identity anonymization (public data) check

Every ESPN member ID was replaced with a stable made-up ID (`m01`, `m02`,
...), consistent across every season, with the mapping kept only in
`/data/raw/owner_id_map.json` (gitignored). Public display names are first
name only, with a last initial added when two managers share a first name
(e.g. "David M", "David G"); if a first name *and* last initial collide too
(this happened once — the same real person has two different ESPN member
IDs across league history), a numeric suffix is added instead of ever
exposing more of the surname (e.g. "David M", "David M2").

After writing `/app/src/data/`, we searched the whole tree for:

- The `SWID` cookie value: **not found**.
- Every ESPN member ID (the raw GUIDs, which are identical to the `SWID`
  cookie format and were the root cause of the leak AUDIT.md flagged):
  **not found**.
- Every manager's last name (3+ characters, to avoid false-positive single
  letter matches): a small number of **unrelated, expected** matches exist
  in `box_scores.json`/`draft.json`/`transactions.json` — these are public
  NFL player names (e.g. "... Washington") that coincidentally share a
  surname with one league manager. No manager's actual surname appears
  attached to a manager identity anywhere in `/app/src/data/`.

## 7. File sizes (public, `/app/src/data/`)

| Season | settings.json | teams.json | matchups.json | box_scores.json | draft.json | transactions.json | standings.json |
|--------|---------------|------------|----------------|-------------------|------------|---------------------|------------------|
| 2022 | 793 B | 1.4 KB | 11.2 KB | 495 KB | 31.8 KB | 302 KB | 1.9 KB |
| 2023 | 793 B | 1.5 KB | 11.2 KB | 555 KB | 36.0 KB | 245 KB | 2.0 KB |
| 2024 | 820 B | 1.7 KB | 14.2 KB | 674 KB | 40.9 KB | 379 KB | 2.3 KB |
| 2025 | 820 B | 1.9 KB | 14.2 KB | 682 KB | 40.5 KB | 429 KB | 2.3 KB |
| 2026 | 897 B | 1.9 KB | 4.2 KB | 160 KB | 41.0 KB | 158 KB | 2.3 KB |

(2026's `box_scores.json`/`matchups.json` are smaller because only 4 of 17
weeks are `final` so far.)
