import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import sharp from "sharp";

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
