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
  any season; all adds/drops come back as `WAIVER` type instead. 2023-2026
  have FAAB enabled (`settings.json` → `"waiver_type": "faab"`), so
  free-agent moves there are processed through the waiver system. **2022 is
  the exception: FAAB was not on that season** (`"waiver_type": "waivers"`,
  `"faab_budget": null`) — standard waiver-priority adds/drops still come
  back typed `WAIVER` from this API, not `FREEAGENT`, so this is an unused
  bucket for every season, not something specific to FAAB.
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

**This gap is now closed for traded players.** `box_scores.json` is still
built by walking each team's roster for a given week, so it only ever
includes players who are on *some* team's roster that week — if a traded
player is later dropped and spends a week as a free agent, there's still
no row for them in `box_scores.json`. But `/app/src/data/<season>/
traded_player_points.json` (added in this update) sidesteps that entirely:
for every player who appears in that season's `trades.json`, it calls
`league.player_info(playerId=[...])` directly, which returns a `.stats`
dict keyed by week regardless of roster status — free agency, bench, or
started. **Plainly: every traded player's weekly points are now available
for every week, including weeks they were unrostered**, scoped only to
players who were actually part of a trade (not the whole league, to keep
the call count small — see section 8 for per-season call counts).

For this specific Jahmyr Gibbs trade, all four players also happened to
stay rostered every remaining week, so this case wasn't actually testing
the gap - but the mechanism now covers the general case too.

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

## 8. Items 2-6 (data-quality punch list)

Everything below is real data from a run against all 5 seasons.

### Person merge map (draft - needs your confirmation)

`scripts/generate_people_draft.py` wrote `/data/raw/people.json` (16 ESPN
member IDs, gitignored, local only). It is a **draft**: nothing reads it
yet, and no public data has been regenerated from it.

- **David Moses** (`David M`): 2 ESPN IDs merged to one person (`m01`).
- **Jhajuan Countee**: 2 ESPN IDs merged to one person (`m03`).
- **Ian Book**: mapped to `"person": null` - not a real league member,
  flagged to be dropped from owners everywhere once applied.
- The other 11 members each have exactly one ESPN ID across all 5 seasons
  - no other duplicates were detected (no two distinct IDs share a display
  name outside the two known-merge groups above), so every entry is
  `"confirm": false`. Please review the file by hand regardless before
  it's used for anything.

### Trades: counts by source, per season

`/app/src/data/<season>/trades.json` has one entry per **upheld** (executed,
non-vetoed, non-declined) trade only. `"source"` is `"espn"` when we have a
real ESPN item record (either the trade's own leg data, or - current season
only - a `league.recent_activity` match), `"rebuilt"` when the guarded
roster-diff mechanism below safely reconstructed it, or `"unknown"` (empty
player list) when neither succeeded.

| Season | espn | rebuilt | unknown | Vetoed (count only) |
|--------|------|---------|---------|----------------------|
| 2022 | 2 | 8 | 9 | 5 |
| 2023 | 2 | 3 | 1 | 3 |
| 2024 | 1 | 3 | 3 | 1 |
| 2025 | 2 | 6 | 2 | 0 |
| 2026 | 8 | 0 | 0 | 1 |
| **Total** | **15** | **20** | **15** | 10 |

**2026 matching bug fixed.** `recent_activity` returned exactly 8 TRADED
events for 2026's 8 upheld trades, but the matcher only resolved 5/8 - it
picked the *globally nearest-by-absolute-time* candidate event for each
trade, and ESPN's acceptance-to-activity-feed lag (routinely 20-40h) made
that ranking flip when the same team had two trades close together. Fixed
by picking the *earliest still-unconsumed* event involving that team
instead (both lists are chronological and each team's trades consume its
own events in order) - now **8/8 (100%) sourced `"espn"`** for 2026.

`/app/src/data/<season>/trade_activity_summary.json` holds **counts only**
for declined/cancelled/pending trades, per team, per season, plus one
season-level `vetoed_trades_total` int. No player contents and no
per-team veto attribution are stored anywhere (we never read `team_id`
off a `TRADE_VETO` leg, since that field can represent the vetoing actor
rather than a trade participant).

### Trade rebuild: guarded mechanism (wired into export)

`rebuild_trade_group()` is implemented in `export_league_data.py` with the
corrected week window and three guards, and is now called directly from
`build_trades_public()` in `export_season()` (passing `roster_by_week`/
`add_log`) - every season's committed `trades.json` includes real
`"source": "rebuilt"` entries as of this export.

**Window fix:** checks BOTH week N-1→N and N→N+1 (previously only N-1→N+1,
skipping week N entirely) - a trade accepted mid-week can already be
reflected in that week's own locked lineup, not just the following week's.

**Guards (any one marks the trade `"unknown"` instead of `"rebuilt"`):**
1. `same_team_multiple_trades_this_week` - the accepting team has 2+
   upheld trades that week; can't tell which counterparty a transition
   belongs to.
2. `one_sided_result` - one side of the rebuilt trade would receive zero
   players (likely a window artifact, not a real lopsided trade).
3. `multiple_candidate_counterparties` - unexplained transitions point at
   more than one other team; can't tie every moved player to a single
   counterparty.

**Overlap safety check.** `_check_no_rebuilt_overlap()` runs after every
rebuild pass and fails the export outright if the same player ever ends up
in two different `"rebuilt"` trades the same week - this export produced
no such conflict.

Results, now live in `trades.json` (2026 had none left after the matching
fix above - all 8 are `"espn"`):

| Season | Rebuilt | Still unknown |
|--------|---------|-----------------|
| 2022 | 8 | 9 |
| 2023 | 3 | 1 |
| 2024 | 3 | 3 |
| 2025 | 6 | 2 |
| **Total** | **20** | **15** |

Reasons for the 15 that stayed `"unknown"`:

| Guard reason | Count |
|---|---|
| `multiple_candidate_counterparties` | 9 |
| `one_sided_result` | 3 |
| `same_team_multiple_trades_this_week` | 2 |
| `no_unexplained_transitions` | 1 |

One concrete validation of guard 1: 2025 week 7 team 6 has **two** separate
upheld trade groups - the Jahmyr Gibbs trade (already fully known from its
own ESPN record, `"source": "espn"`) and a second, genuinely-unknown trade
the same team made the same week. The guard correctly leaves the second
one `"unknown"` rather than attributing its players to the wrong trade -
this is exactly the ambiguity the guard exists to catch, not a flaw.

A pair-based alternative rule (group by unordered team-pair instead of a
single fixed accepting team) was evaluated as a fallback for the 9
`multiple_candidate_counterparties` misses above, including a dual-window
variant.
It was **not adopted**: on validation it performed strictly worse than the
guarded rule above (0 exact / 15 miss vs. 5 exact / 10 miss), and on the two
specific cases spot-checked by hand (2022 wk4, 2024 wk7) the dual-window
version produced *more* ambiguity, not less, from extra noise introduced by
unioning both windows. Those `multiple_candidate_counterparties` trades
remain `"unknown"`.


### Playoff bracket

Built from already-fetched `mMatchupScore` schedule data (`playoffTierType`,
`winner`, per-side `teamId`/`totalPoints`) — no new API calls needed.

| Season | Bracket status |
|--------|----------------|
| 2022 | built |
| 2023 | built |
| 2024 | built |
| 2025 | built |
| 2026 | not started (no playoff week has a decided game yet) |

### Player weekly points, scoped to traded players

`league.player_info()` calls made this run (batched per season, one call
covers every player who appears in that season's `trades.json`, skipping
already-saved players for finished seasons):

| Season | `player_info` calls |
|--------|----------------------|
| 2022 | 8 |
| 2023 | 6 |
| 2024 | 4 |
| 2025 | 6 |
| 2026 | 19 |

### Waiver type per season

| Season | Type | FAAB budget |
|--------|------|-------------|
| 2022 | waivers (no FAAB) | — |
| 2023 | faab | 100 |
| 2024 | faab | 100 |
| 2025 | faab | 100 |
| 2026 | faab | 100 |

2022 is the only season where FAAB tracking isn't meaningful - the league
ran standard waiver priority that year.
