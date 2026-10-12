import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(appRoot, "src", "data");
const distRoot = path.join(appRoot, "dist");
const siteUrl = (process.env.SITE_URL ?? "https://ian-book-believers.vercel.app")
  .replace(/\/$/, "");
const siteOrigin = new URL(siteUrl);
if (!["http:", "https:"].includes(siteOrigin.protocol) ||
    siteOrigin.pathname !== "/" || siteOrigin.search || siteOrigin.hash ||
    siteOrigin.username || siteOrigin.password) {
  throw new Error("SITE_URL must be an HTTP(S) site origin, without a path.");
}
const baseHtml = await readFile(path.join(distRoot, "index.html"), "utf8");
const seasons = JSON.parse(
  await readFile(path.join(dataRoot, "seasons.json"), "utf8"),
);

const escapeText = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatScore = (score) =>
  score === null
    ? "—"
    : Number.isInteger(score)
      ? String(score)
      : score.toFixed(2);

const getManagerName = (team) =>
  team?.owners?.map(({ name }) => name).join(" & ") ||
  team?.team_name ||
  "Unknown manager";

const replaceMeta = (html, attribute, key, value) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${escapedKey}"\\s+content="[^"]*"\\s*/?>`,
  );
  if (!pattern.test(html)) {
    throw new Error(`Missing preview metadata template: ${attribute}="${key}"`);
  }
  return html.replace(
    pattern,
    () => `<meta ${attribute}="${key}" content="${escapeText(value)}" />`,
  );
};

const buildHtml = ({ title, description, route, imagePath, imageAlt }) => {
  const url = `${siteUrl}${route}`;
  const imageUrl = `${siteUrl}${imagePath}`;
  if (!/<title>[^<]*<\/title>/.test(baseHtml) ||
      !/<link rel="canonical" href="[^"]*" \/>/.test(baseHtml)) {
    throw new Error("Missing title or canonical URL in the preview template.");
  }
  let html = baseHtml
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeText(title)}</title>`)
    .replace(
      /<link rel="canonical" href="[^"]*" \/>/,
      () => `<link rel="canonical" href="${escapeText(url)}" />`,
    );

  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "property", "og:title", title);
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:url", url);
  html = replaceMeta(html, "property", "og:image", imageUrl);
  html = replaceMeta(html, "property", "og:image:type", "image/png");
  html = replaceMeta(html, "property", "og:image:alt", imageAlt);
  html = replaceMeta(html, "name", "twitter:title", title);
  html = replaceMeta(html, "name", "twitter:description", description);
  html = replaceMeta(html, "name", "twitter:image", imageUrl);
  html = replaceMeta(html, "name", "twitter:image:alt", imageAlt);

  return html;
};

const previewSvg = ({
  eyebrow,
  title,
  subtitle,
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  footer,
}) => `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#071a2f"/>
    <circle cx="1085" cy="115" r="235" fill="#0d2d4d"/>
    <circle cx="1085" cy="115" r="155" fill="#123b62"/>
    <rect x="0" y="0" width="18" height="630" fill="#f59e0b"/>
    <text x="72" y="76" fill="#f8fafc" font-family="Arial, sans-serif" font-size="25" font-weight="700" letter-spacing="3">IAN BOOK BELIEVERS</text>
    <text x="72" y="142" fill="#f59e0b" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="2">${escapeText(eyebrow)}</text>
    <text x="72" y="220" fill="#ffffff" font-family="Arial, sans-serif" font-size="${Math.min(58, 1056 / Math.max(1, Array.from(title).length))}" font-weight="800">${escapeText(title)}</text>
    <text x="72" y="270" fill="#a9bdd1" font-family="Arial, sans-serif" font-size="${Math.min(25, 1056 / Math.max(1, Array.from(subtitle).length))}">${escapeText(subtitle)}</text>
    <line x1="72" y1="315" x2="1128" y2="315" stroke="#31506d" stroke-width="2"/>
    <text x="72" y="370" fill="#8fa8bf" font-family="Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="1">${escapeText(leftLabel)}</text>
    <text x="72" y="438" fill="#ffffff" font-family="Arial, sans-serif" font-size="48" font-weight="800">${escapeText(leftValue)}</text>
    <text x="1128" y="370" fill="#8fa8bf" font-family="Arial, sans-serif" font-size="20" font-weight="700" text-anchor="end" letter-spacing="1">${escapeText(rightLabel)}</text>
    <text x="1128" y="438" fill="#ffffff" font-family="Arial, sans-serif" font-size="48" font-weight="800" text-anchor="end">${escapeText(rightValue)}</text>
    <text x="72" y="568" fill="#8fa8bf" font-family="Arial, sans-serif" font-size="22">${escapeText(footer)}</text>
    <rect x="1037" y="510" width="91" height="72" rx="16" fill="#f59e0b"/>
    <text x="1082" y="560" fill="#071a2f" font-family="Arial, sans-serif" font-size="35" font-weight="900" text-anchor="middle">IB</text>
  </svg>`;

const writePreview = async ({
  route,
  imageRoute,
  metadata,
  image,
}) => {
  const svg = previewSvg(image);
  const imageHash = createHash("sha256").update(svg).digest("hex").slice(0, 12);
  const versionedImageRoute = imageRoute.replace(/\.png$/, `-${imageHash}.png`);
  const htmlPath = path.join(distRoot, `${route.slice(1)}.html`);
  const imagePath = path.join(distRoot, versionedImageRoute.slice(1));
  await Promise.all([
    mkdir(path.dirname(htmlPath), { recursive: true }),
    mkdir(path.dirname(imagePath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      htmlPath,
      buildHtml({ ...metadata, route, imagePath: versionedImageRoute }),
    ),
    sharp(Buffer.from(svg)).png().toFile(imagePath),
  ]);
};

for (const year of seasons) {
  const seasonRoot = path.join(dataRoot, String(year));
  const [teams, matchupWeeks, settings, boxScores] = await Promise.all([
    readFile(path.join(seasonRoot, "teams.json"), "utf8").then(JSON.parse),
    readFile(path.join(seasonRoot, "matchups.json"), "utf8").then(JSON.parse),
    readFile(path.join(seasonRoot, "settings.json"), "utf8").then(JSON.parse),
    readFile(path.join(seasonRoot, "box_scores.json"), "utf8").then(JSON.parse),
  ]);
  const teamsById = new Map(teams.map((team) => [team.team_id, team]));
  const seasonRoute = `/seasons/${year}`;
  const seasonImageRoute = `/link-previews/seasons/${year}.png`;

  await writePreview({
    route: seasonRoute,
    imageRoute: seasonImageRoute,
    metadata: {
      title: `${year} Season | Ian Book Believers`,
      description: `See standings, matchups, scores, and highlights from the ${year} Ian Book Believers season.`,
      imageAlt: `Ian Book Believers ${year} season preview`,
    },
    image: {
      eyebrow: `${year} SEASON`,
      title: `See the ${year} season`,
      subtitle: "Standings, matchups, scores, and season highlights",
      leftLabel: "TEAMS",
      leftValue: String(settings.team_count),
      rightLabel: "WEEKS",
      rightValue: String(matchupWeeks.length),
      footer: siteOrigin.host,
    },
  });

  for (const matchupWeek of matchupWeeks) {
    const weekRoute = `${seasonRoute}/weeks/${matchupWeek.week}`;
    const weekImageRoute =
      `/link-previews/seasons/${year}/weeks/${matchupWeek.week}.png`;
    const gameCount = matchupWeek.matchups.filter(
      ({ away_team_id }) => away_team_id !== null,
    ).length;
    const status =
      matchupWeek.status === "final"
        ? "Final"
        : matchupWeek.status === "in_progress"
          ? "In progress"
          : "Not started";

    await writePreview({
      route: weekRoute,
      imageRoute: weekImageRoute,
      metadata: {
        title: `${year} Week ${matchupWeek.week} | Ian Book Believers`,
        description: `See all ${gameCount} matchups and scores from week ${matchupWeek.week} of the ${year} season.`,
        imageAlt: `Ian Book Believers ${year} week ${matchupWeek.week} preview`,
      },
      image: {
        eyebrow: `${year} SEASON`,
        title: `Week ${matchupWeek.week}`,
        subtitle: "Matchups, scores, and weekly performances",
        leftLabel: "MATCHUPS",
        leftValue: String(gameCount),
        rightLabel: "STATUS",
        rightValue: status,
        footer: "Ian Book Believers weekly scoreboard",
      },
    });

    for (const matchup of matchupWeek.matchups) {
      const boxScore = boxScores.find(
        (game) =>
          game.week === matchupWeek.week &&
          game.home_team_id === matchup.home_team_id &&
          game.away_team_id === matchup.away_team_id,
      );
      if (matchup.away_team_id === null || !boxScore) continue;
      const home = teamsById.get(matchup.home_team_id);
      const away = teamsById.get(matchup.away_team_id);
      if (!home || !away) {
        throw new Error(`Unknown matchup team in ${year} week ${matchupWeek.week}.`);
      }
      const homeName = getManagerName(home);
      const awayName = getManagerName(away);
      const matchupRoute =
        `${weekRoute}/matchups/${matchup.home_team_id}/${matchup.away_team_id}`;
      const matchupImageRoute =
        `/link-previews/seasons/${year}/weeks/${matchupWeek.week}` +
        `/matchups/${matchup.home_team_id}-${matchup.away_team_id}.png`;
      const score =
        `${formatScore(boxScore.home_score)}–${formatScore(boxScore.away_score)}`;

      await writePreview({
        route: matchupRoute,
        imageRoute: matchupImageRoute,
        metadata: {
          title: `${homeName} vs ${awayName} | ${year} Week ${matchupWeek.week}`,
          description: `${homeName} ${formatScore(boxScore.home_score)}, ${awayName} ${formatScore(boxScore.away_score)} — ${status} in week ${matchupWeek.week} of the ${year} season.`,
          imageAlt: `${homeName} versus ${awayName}, ${score}, ${year} week ${matchupWeek.week}`,
        },
        image: {
          eyebrow: `${year} · WEEK ${matchupWeek.week} · ${status.toUpperCase()}`,
          title: `${homeName} vs ${awayName}`,
          subtitle: `${home?.team_name ?? ""} vs ${away?.team_name ?? ""}`,
          leftLabel: homeName.toUpperCase(),
          leftValue: formatScore(boxScore.home_score),
          rightLabel: awayName.toUpperCase(),
          rightValue: formatScore(boxScore.away_score),
          footer: `Ian Book Believers · ${score}`,
        },
      });
    }
  }
}

console.log("Generated link previews for seasons, weeks, and matchups.");
