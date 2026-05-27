// src/display.js
// All terminal rendering lives here. Logic stays in stats.js; paint stays here.

const chalk = require("chalk");
const Table = require("cli-table3");
const { fmt } = require("./stats");

const BRAND = chalk.bold.hex("#58a6ff"); // GitHub blue
const DIM = chalk.dim;
const WIN = chalk.bold.green("✓");
const LOSE = chalk.dim("·");

function printHeader(text) {
  console.log("\n" + chalk.bold.underline(text));
}

function printError(message) {
  console.error("\n" + chalk.bold.red("✖ Error: ") + message);
}

function printWarning(message) {
  console.warn(chalk.yellow("⚠ ") + message);
}

/**
 * Renders a single user profile card.
 */
function printProfile(profile, repoStats, activityStats, countryInfo) {
  printHeader(`${BRAND(profile.login)}  ${DIM(profile.name || "")}`);

  if (profile.bio) {
    console.log(DIM(`"${profile.bio}"`));
  }

  console.log("");

  const table = new Table({
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
    style: { border: ["dim"], head: [] },
  });

  table.push(
    [DIM("Followers"), fmt(profile.followers), DIM("Following"), fmt(profile.following)],
    [DIM("Public Repos"), fmt(repoStats.totalRepos), DIM("Total Stars"), fmt(repoStats.totalStars)],
    [DIM("Total Forks"), fmt(repoStats.totalForks), DIM("Avg Stars/Repo"), fmt(repoStats.avgStarsPerRepo)],
    [DIM("Recent Pushes"), fmt(activityStats.recentPushes), DIM("Recent PRs"), fmt(activityStats.recentPRs)],
    [DIM("Location"), profile.location || "—", DIM("Joined"), profile.created_at?.slice(0, 10) || "—"],
    [DIM("Company"), profile.company || "—", DIM("Blog"), profile.blog ? chalk.cyan(profile.blog) : "—"]
  );

  console.log(table.toString());

  if (repoStats.topLanguages.length > 0) {
    const langs = repoStats.topLanguages.map((l) => chalk.yellow(l.lang)).join("  ");
    console.log(DIM("Top languages: ") + langs);
  }

  if (repoStats.mostStarred) {
    const r = repoStats.mostStarred;
    console.log(
      DIM("Most starred:  ") +
        chalk.cyan(r.name) +
        DIM(` (${fmt(r.stargazers_count)} ⭐)`)
    );
  }

  if (activityStats.activeRepos.length > 0) {
    console.log(DIM("Recently active: ") + activityStats.activeRepos.join(", "));
  }

  // Country context block
  if (countryInfo) {
    printCountryBlock(countryInfo);
  } else if (profile.location) {
    console.log(DIM("\nLocation: ") + profile.location + DIM(" (country data unavailable)"));
  }
}

/**
 * Renders a small country context panel.
 */
function printCountryBlock(country) {
  const name = country.name?.common || "Unknown";
  const capital = country.capital?.[0] || "—";
  const region = country.region || "—";
  const pop = fmt(country.population);
  const langs = Object.values(country.languages || {}).slice(0, 3).join(", ") || "—";
  const currencies = Object.values(country.currencies || {})
    .map((c) => `${c.name} (${c.symbol || "?"})`)
    .join(", ") || "—";

  console.log("\n" + chalk.dim("──── Country Context ") + chalk.dim("─".repeat(28)));
  console.log(`  ${BRAND(name)}  ${DIM(region)}  ${country.flags?.emoji || ""}`);
  console.log(`  ${DIM("Capital:")} ${capital}   ${DIM("Population:")} ${pop}`);
  console.log(`  ${DIM("Languages:")} ${langs}`);
  console.log(`  ${DIM("Currency:")} ${currencies}`);
}

/**
 * Renders the comparison table between two users.
 */
function printComparison(comparison, nameA, nameB) {
  printHeader("Head-to-Head Comparison");

  const table = new Table({
    head: [DIM("Metric"), chalk.bold(nameA), chalk.bold(nameB)],
    style: { head: [], border: ["dim"] },
    colAligns: ["left", "right", "right"],
  });

  const rows = [
    ["Total Stars", "stars"],
    ["Public Repos", "repos"],
    ["Followers", "followers"],
    ["Recent Pushes", "recentPushes"],
  ];

  for (const [label, key] of rows) {
    const d = comparison[key];
    const aWins = d.winner === nameA;
    const bWins = d.winner === nameB;
    table.push([
      DIM(label),
      (aWins ? WIN + " " : LOSE + " ") + fmt(d[nameA]),
      (bWins ? WIN + " " : LOSE + " ") + fmt(d[nameB]),
    ]);
  }

  console.log(table.toString());

  // Count wins
  const wins = Object.values(comparison).filter((d) => d.winner === nameA).length;
  const total = Object.keys(comparison).length;
  const tied = Object.values(comparison).filter((d) => d.winner === null).length;

  if (tied === total) {
    console.log(chalk.yellow("  Perfectly matched!"));
  } else {
    const leader = wins > total / 2 ? nameA : nameB;
    const score = wins > total / 2 ? wins : total - wins;
    console.log(`  ${chalk.bold.green(leader)} leads ${score}/${total - tied} metrics`);
  }
}

module.exports = { printProfile, printComparison, printError, printWarning, printHeader };
