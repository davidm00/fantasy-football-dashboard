import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";
import { getTradeReceipts } from "../src/utils/tradeReceipts.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(appRoot, "dist");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const seasons = await readJson(path.join(appRoot, "src/data/seasons.json"));
const filesUnder = async (folder) => {
  const entries = await readdir(folder, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) =>
    entry.isDirectory() ? filesUnder(path.join(folder, entry.name)) : [path.join(folder, entry.name)],
  ))).flat();
};

test("every usable manager/trade/season/week/matchup route has crawlable HTML and a valid hashed PNG", async () => {
  let expected = seasons.length;
  const owners = new Set();
  for (const season of seasons) {
    const dataRoot = path.join(appRoot, `src/data/${season}`);
    const [weeks, boxScores, teams, trades] = await Promise.all([
      readJson(path.join(dataRoot, "matchups.json")),
      readJson(path.join(dataRoot, "box_scores.json")),
      readJson(path.join(dataRoot, "teams.json")),
      readJson(path.join(dataRoot, "trades.json")),
    ]);
    teams.forEach((team) => team.owners.forEach(({ id }) => owners.add(id)));
    expected += trades.length;
    expected += weeks.length + weeks.reduce((count, week) => count +
      week.matchups.filter((game) => game.away_team_id !== null && boxScores.some(
        (box) => box.week === week.week && box.home_team_id === game.home_team_id && box.away_team_id === game.away_team_id,
      )).length, 0);
  }
  expected += owners.size + 2;
  const htmlFiles = [
    ...(await filesUnder(path.join(distRoot, "seasons"))),
    ...(await filesUnder(path.join(distRoot, "managers"))),
    path.join(distRoot, "managers.html"),
  ].filter((file) => file.endsWith(".html"));
  assert.equal(htmlFiles.length, expected);
  const pngFiles = (await filesUnder(path.join(distRoot, "link-previews"))).filter((file) => file.endsWith(".png"));
  assert.equal(pngFiles.length, expected);
  for (const file of htmlFiles) {
    const html = await readFile(file, "utf8");
    const route = "/" + path.relative(distRoot, file).replace(/\.html$/, "").split(path.sep).join("/");
    assert.ok(html.includes(`name="twitter:card" content="summary_large_image"`));
    assert.ok(html.includes(`property="og:image:type" content="image/png"`));
    const url = html.match(/property="og:url" content="([^"]+)"/)?.[1];
    assert.equal(new URL(url).pathname, route);
    assert.ok(html.includes(`rel="canonical" href="${url}"`));
    assert.equal((html.match(/property="og:title"/g) ?? []).length, 1);
    assert.ok(!html.includes("Unknown manager"), `Unknown team at ${route}`);
    const imageUrl = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    const imagePath = new URL(imageUrl).pathname;
    assert.match(imagePath, /-[a-f0-9]{12}\.png$/);
    const image = await sharp(path.join(distRoot, imagePath.slice(1))).metadata();
    assert.equal(image.width, 1200);
    assert.equal(image.height, 630);
    assert.equal(image.format, "png");
    const script = html.match(/type="module"[^>]*src="([^"]+)"/)?.[1];
    assert.ok(script, `No React entrypoint at ${route}`);
    assert.ok((await stat(path.join(distRoot, script.slice(1)))).isFile());
  }
});

test("manager profiles and trade previews name the actual participants", async () => {
  const profile = await readFile(path.join(distRoot, "managers/m02.html"), "utf8");
  assert.ok(profile.includes("Devon | Manager profile"));
  assert.ok(profile.includes('href="https://ian-book-believers.vercel.app/managers/m02"'));
  const trades = await readJson(path.join(appRoot, "src/data/2026/trades.json"));
  const html = await readFile(path.join(distRoot, `seasons/2026/trades/${trades[0].id}.html`), "utf8");
  assert.ok(html.includes("keep-original optimal-lineup scenario"));
  assert.ok(html.includes("Opponent scores stay unchanged"));
});
test("rivalry exploration has its own canonical social preview", async () => {
  const html = await readFile(path.join(distRoot, "managers/rivalries.html"), "utf8");
  assert.ok(html.includes("Rivalries | Ian Book Believers"));
  assert.ok(html.includes('href="https://ian-book-believers.vercel.app/managers/rivalries"'));
  assert.ok(html.includes("head-to-head rivalry grid"));
});

test("trade cards use the fleece title and render the actual received-player points chart", async () => {
  let charts = 0;
  for (const year of seasons) {
    const root = path.join(appRoot, `src/data/${year}`);
    const [teams, matchups, settings, box_scores, trades] = await Promise.all(
      ["teams", "matchups", "settings", "box_scores", "trades"].map((name) => readJson(path.join(root, `${name}.json`))),
    );
    for (const trade of trades) {
      const receipts = getTradeReceipts({ teams, matchups, settings, box_scores }, trade);
      const html = await readFile(path.join(distRoot, `seasons/${year}/trades/${trade.id}.html`), "utf8");
      assert.ok(html.includes('<title>Was this a fleece? '));
      assert.ok(html.includes('property="og:title" content="Was this a fleece? '));
      assert.ok(html.includes('name="twitter:title" content="Was this a fleece? '));
      const alt = html.match(/property="og:image:alt" content="([^"]+)"/)?.[1];
      assert.ok(alt.startsWith("Was this a fleece?"));
      for (const { points, covered, weeks } of receipts) {
        assert.ok(alt.includes(points === null ? "Unavailable" : `${points.toFixed(1)} pts`));
        assert.ok(alt.includes(`${covered}/${weeks} full weeks covered`));
      }
      const maximum = Math.max(1, ...receipts.map(({ points }) => Math.abs(points ?? 0)));
      const index = receipts.findIndex(({ points }) => points !== null && Math.abs(points) === maximum);
      if (index < 0) continue;
      const rowHeight = 200 / receipts.length;
      const image = new URL(html.match(/property="og:image" content="([^"]+)"/)[1]);
      const pixel = await sharp(path.join(distRoot, image.pathname.slice(1)))
        .extract({ left: 600, top: Math.floor(335 + index * rowHeight + Math.min(24, rowHeight * 0.28) + 8 + Math.min(22, rowHeight * 0.2) / 2), width: 1, height: 1 })
        .removeAlpha().raw().toBuffer();
      assert.deepEqual([...pixel], [[45, 212, 191], [245, 158, 11], [167, 139, 250]][index % 3]);
      charts++;
    }
  }
  assert.ok(charts > 0, "No trade points charts were checked");
});

test("shared trade receipts keep missing, zero, negative and non-starter production distinct", () => {
  const game = { home_team_id: 1, away_team_id: 2, home_score: 100, away_score: 90 };
  const player = (id, slot, points) => ({ player_id: id, slot_position: slot, points });
  const season = {
    teams: [{ team_id: 1 }, { team_id: 2 }],
    settings: { regular_season_length: 3 },
    matchups: [1, 2, 3, 4].map((week) => ({ week, status: "final", matchups: [game] })),
    box_scores: [
      { ...game, week: 1, status: "final", home_lineup: [player(10, "RB", 100)], away_lineup: [] },
      { ...game, week: 2, status: "final", home_lineup: [
        player(10, "RB", -2), player(11, "BE", 30), player(12, "IR", 40), player(13, "ER", 50),
      ], away_lineup: [player(20, "BE", 25)] },
      { ...game, week: 3, status: "in_progress", home_lineup: [player(10, "RB", 100)], away_lineup: [] },
      { ...game, week: 4, status: "final", home_lineup: [player(10, "RB", 100)], away_lineup: [] },
    ],
  };
  const trade = { week: 1, team_ids: [1, 2], items: [
    ...[10, 11, 12, 13].map((player_id) => ({ player_id, to_team_id: 1 })),
    { player_id: 20, to_team_id: 2 },
  ] };
  assert.deepEqual(getTradeReceipts(season, trade), [
    { teamId: 1, points: -2, covered: 1, weeks: 2 },
    { teamId: 2, points: 0, covered: 1, weeks: 2 },
  ]);
  assert.deepEqual(getTradeReceipts({ ...season, box_scores: [] }, trade), [
    { teamId: 1, points: null, covered: 0, weeks: 2 },
    { teamId: 2, points: null, covered: 0, weeks: 2 },
  ]);
  assert.equal(getTradeReceipts(season, { ...trade, week: 3 })[0].weeks, 0);
});
test("representative matchup metadata contains season, week, managers and actual scores", async () => {
  const html = await readFile(path.join(distRoot, "seasons/2025/weeks/8/matchups/8/10.html"), "utf8");
  assert.ok(html.includes("<title>Dylan vs Joey | 2025 Week 8</title>"));
  assert.ok(html.includes("Dylan 111.20, Joey 147.95"));
  assert.ok(html.includes("Final in week 8 of the 2025 season"));
});

test("Vercel uses the full build and clean static URLs before the SPA fallback", async () => {
  const config = await readJson(path.join(appRoot, "vercel.json"));
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.outputDirectory, "dist");
  assert.equal(config.cleanUrls, true);
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/" }]);
});
