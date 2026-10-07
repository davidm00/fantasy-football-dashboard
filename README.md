# Fantasy Football League Dashboard

## App functionality (so far)

- Pick a season and week (selectors + prev/next), see that week's matchup
  cards (teams, scores, win-loss record through that week).
- View that week's report PDF inline, with open-in-full-screen and
  download links; a sidebar lists other reports for the selected season.
- This will keep changing as more of the app gets built.

## Project layout

- `app/` — Vite + React + TypeScript frontend (Tailwind CSS, react-router installed). All app code (components, routes, types) is written by hand; this scaffold only installed and wired up tooling.
- `app/src/data/` — cleaned, anonymized league JSON (committed). This is what the app imports.
- `scripts/` — Python data export script (`export_league_data.py`) that pulls league history from ESPN.
- `data/raw/` — full, unanonymized export (gitignored, local only). Includes the owner-ID mapping; never commit this.
- `data/EXPORT_REPORT.md` — verification report from the most recent export run.
- `.env` — your ESPN credentials (never committed; see below).

## Running the app

```bash
cd app
npm install
npm run dev
```

Build for production with `npm run build`, preview with `npm run preview`.

## Getting your ESPN cookies into `.env`

The export script needs two cookies from a logged-in ESPN Fantasy session,
plus your league ID.

1. Log in to [fantasy.espn.com](https://fantasy.espn.com) in your browser and open your league.
2. Open DevTools → Application/Storage → Cookies → `https://fantasy.espn.com`.
3. Copy the values of the `espn_s2` and `SWID` cookies (SWID includes the curly braces).
4. Edit the `.env` file in the repo root (already present and gitignored) and fill in:
   ```
   ESPN_S2=<your espn_s2 value>
   SWID=<your SWID value>
   LEAGUE_ID=1371469314
   ```
5. Never paste these values into chat, commit messages, or logs. `.env` is already listed in `.gitignore`.

## Running the data export

```bash
cd scripts
source .venv/bin/activate   # venv is already created with requirements.txt installed
python export_league_data.py
```

This discovers every season your league has (via ESPN's own season history —
nothing is hardcoded) and writes two copies of the data:

- **Raw** (full ESPN detail, local only): `/data/raw/<season>/` —
  `settings.json`, `teams.json`, `standings.json`, `draft.json`,
  `box_scores.json`, `transactions.json`. This includes real ESPN member
  IDs and names, and the owner-ID anonymization mapping
  (`data/raw/owner_id_map.json`). Never committed.
- **Public** (cleaned, committed): `/app/src/data/<season>/` — the same
  file set plus a slim `matchups.json`, with manager identities replaced by
  stable made-up IDs/first names (see "Data rules" below). This is what the
  app imports. `/app/src/data/seasons.json` lists every season that has
  been exported (e.g. `[2022, 2023, 2024, 2025, 2026]`) — the app reads
  this to know how many seasons exist, since a browser can't list
  directories on its own.

To refresh only the current season (faster, re-runnable any time during the
season):

```bash
python export_league_data.py --season 2026
```

Seasons that fail (e.g. older private-league seasons without valid cookies)
are logged and skipped; see `data/EXPORT_REPORT.md` for the results of the
most recent full run.

### Automated weekly refresh (GitHub Action)

`.github/workflows/fetch-league-data.yml` runs the full export automatically
every Tuesday morning during the NFL season (Sept-Jan), and can also be
triggered manually from the Actions tab. It:

1. Runs `check_espn_connection.py` first as a fast pre-flight check (fails
   the job immediately if credentials are bad, before doing a full export).
2. Runs a full `export_league_data.py` (every season, not just the current
   one) - this keeps the anonymized manager-ID mapping deterministic without
   needing to persist `owner_id_map.json` anywhere in CI.
3. Commits only `app/src/data/` and `data/EXPORT_REPORT.md` back to `main`
   if anything changed (never `data/raw/`, never `.env`). That push
   triggers a Vercel redeploy automatically.

**Setup**: add three repository secrets (Settings -> Secrets and variables
-> Actions): `ESPN_S2`, `SWID`, `LEAGUE_ID` - same values as your local
`.env`. These are encrypted by GitHub and never appear in logs.

## Weekly report PDF conventions

- Reports live at `/app/public/reports/<season>/week-<NN>.pdf`, where `<NN>`
  is a two-digit, zero-padded week number (e.g. `reports/2026/week-05.pdf`).
- Exactly one report per week. There are no preseason or "week 0" reports.
- The file path is derived from `season` + `week` at render time — it is
  never stored anywhere.
- Each report also needs an entry in a hand-kept report list (season, week,
  title, author, publish date). That list and its type are maintained by
  hand in the app code — this scaffold does not create it.
- If a given week has no report, the app should show a "no report this
  week" state instead of a broken link.

## Data rules

Things the app needs to handle because the underlying league data isn't
uniform across seasons — read these from the JSON, never hardcode them:

- **League size changes by season.** 10 teams in 2022-2023, 12 teams from
  2024 onward. Read `team_count` from each season's `settings.json`; don't
  assume a fixed number of matchups per week (it's `team_count / 2`, minus
  any bye).
- **Regular season length changes.** 16 total weeks in 2022/2023, 17 in
  2024/2025 (2026 in progress). Always read `regular_season_length` and
  `playoff_weeks` from that season's `settings.json` — never hardcode a
  week count.
- **Teams can have multiple owners in a season**, and a team's owners can
  change between seasons. `teams.json` → `owners` is a list for exactly
  this reason. Team 7 changed owners between the 2023 and 2024 seasons —
  don't assume a team's manager(s) are constant across its history.
- **Playoff byes appear as a matchup with one team and no opponent** (the
  other team ID/score are `null`). This is real ESPN data, not a bug —
  don't invent a placeholder opponent for it.
- **Week status is the only reliable way to tell an unplayed week from a
  played one.** Every week in `settings.json` → `week_status` and every
  matchup in `matchups.json`/`box_scores.json` has a `status` of `final`,
  `in_progress`, or `not_started`. Never infer "played" from whether a
  score is non-zero — an unplayed week can still show `0` scores, and
  that's expected.
