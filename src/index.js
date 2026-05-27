#!/usr/bin/env node
// src/index.js — CLI entry point

const { program } = require("commander");
const ora = require("ora");
const { getUser, getUserRepos, getUserEvents, getCountryByName, ApiError, isValidGithubUsername } = require("./api");
const { summariseRepos, summariseActivity, compareUsers, extractCountry } = require("./stats");
const { printProfile, printComparison, printError, printWarning, printHeader } = require("./display");

// ── Command: profile <username> ───────────────────────────────────────────────

program
  .command("profile <username>")
  .description("Show a detailed profile card for a GitHub user")
  .action(async (username) => {
    // Validate before any network call — fail fast for obvious bad input
    if (!isValidGithubUsername(username)) {
      printError(`"${username}" is not a valid GitHub username.\n  Usernames must be 1–39 chars, alphanumeric + hyphens, no leading/trailing hyphen.`);
      process.exit(1);
    }

    const spinner = ora(`Fetching ${username}…`).start();

    try {
      // Parallel fetch of repos + events — both needed, neither depends on the other
      const [profile, repos, events] = await Promise.all([
        getUser(username),
        getUserRepos(username),
        getUserEvents(username),
      ]);

      const repoStats = summariseRepos(repos);
      const activityStats = summariseActivity(events);

      // Country enrichment is optional — failure here shouldn't kill the whole command
      let countryInfo = null;
      const countryName = extractCountry(profile.location);
      if (countryName) {
        try {
          countryInfo = await getCountryByName(countryName);
        } catch {
          // silently skip — country API is best-effort
        }
      }

      spinner.stop();
      printProfile(profile, repoStats, activityStats, countryInfo);
      console.log(""); // trailing newline
    } catch (err) {
      spinner.stop();
      if (err instanceof ApiError) {
        printError(err.message);
        if (err.isNotFound) {
          console.error(`  → No GitHub user found with username "${username}"`);
        } else if (err.isRateLimited) {
          console.error(`  → Run: export GITHUB_TOKEN=<your_token>  to raise the rate limit`);
        } else if (err.isTimeout) {
          console.error(`  → The API took too long. Try again — this is usually transient.`);
        }
      } else {
        printError(err.message);
      }
      process.exit(1);
    }
  });

// ── Command: compare <userA> <userB> ─────────────────────────────────────────

program
  .command("compare <userA> <userB>")
  .description("Compare two GitHub users head-to-head")
  .action(async (userA, userB) => {
    // Validate both usernames upfront — give a clear error for each invalid one
    const invalid = [userA, userB].filter((u) => !isValidGithubUsername(u));
    if (invalid.length > 0) {
      printError(`Invalid GitHub username(s): ${invalid.map((u) => `"${u}"`).join(", ")}`);
      process.exit(1);
    }

    if (userA.toLowerCase() === userB.toLowerCase()) {
      printError(`Both usernames are the same ("${userA}"). Please provide two different users.`);
      process.exit(1);
    }

    const spinner = ora(`Fetching ${userA} and ${userB}…`).start();

    try {
      // Fetch both users in parallel — total time = max(A, B), not A+B
      const [profileA, reposA, eventsA, profileB, reposB, eventsB] =
        await Promise.all([
          getUser(userA),
          getUserRepos(userA),
          getUserEvents(userA),
          getUser(userB),
          getUserRepos(userB),
          getUserEvents(userB),
        ]);

      spinner.stop();

      const statsA = {
        profile: profileA,
        repos: summariseRepos(reposA),
        activity: summariseActivity(eventsA),
      };
      const statsB = {
        profile: profileB,
        repos: summariseRepos(reposB),
        activity: summariseActivity(eventsB),
      };

      // Print individual cards first, then the comparison
      let countryA = null, countryB = null;
      // Best-effort country enrichment for both, in parallel
      await Promise.allSettled([
        (async () => {
          const c = extractCountry(profileA.location);
          if (c) countryA = await getCountryByName(c).catch(() => null);
        })(),
        (async () => {
          const c = extractCountry(profileB.location);
          if (c) countryB = await getCountryByName(c).catch(() => null);
        })(),
      ]);

      const { printProfile } = require("./display");
      printProfile(profileA, statsA.repos, statsA.activity, countryA);
      printProfile(profileB, statsB.repos, statsB.activity, countryB);

      const comparison = compareUsers(statsA, statsB, userA, userB);
      printComparison(comparison, userA, userB);
      console.log("");
    } catch (err) {
      spinner.stop();
      if (err instanceof ApiError) {
        printError(err.message);
        if (err.isNotFound) {
          console.error(`  → One of the usernames doesn't exist on GitHub.`);
        } else if (err.isRateLimited) {
          console.error(`  → Set GITHUB_TOKEN to raise API rate limits.`);
        } else if (err.isTimeout) {
          console.error(`  → Request timed out. The API may be slow — try again.`);
        }
      } else {
        printError(err.message);
      }
      process.exit(1);
    }
  });

// ── Command: search <topic> ───────────────────────────────────────────────────

program
  .command("search <topic>")
  .description("Find top repositories for a topic (e.g. 'machine-learning', 'cli')")
  .option("-n, --count <n>", "Number of results", "8")
  .action(async (topic, opts) => {
    const count = parseInt(opts.count, 10);
    // Guard: count must be a sensible integer
    if (isNaN(count) || count < 1 || count > 30) {
      printError(`--count must be a number between 1 and 30 (got "${opts.count}")`);
      process.exit(1);
    }

    // Guard: topic must not be empty or just whitespace
    if (!topic || !topic.trim()) {
      printError(`Topic cannot be empty.`);
      process.exit(1);
    }

    const spinner = ora(`Searching for "${topic}"…`).start();

    const { fetchWithRetry: _, ...api } = require("./api");
    // We need the raw fetchWithRetry here — access it directly
    const axios = require("axios");
    const TIMEOUT_MS = 8000;

    try {
      const data = await (async () => {
        const { ApiError } = require("./api");
        try {
          const resp = await axios.get(
            `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic.trim())}&sort=stars&per_page=${count}`,
            {
              timeout: TIMEOUT_MS,
              headers: {
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                ...(process.env.GITHUB_TOKEN
                  ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
                  : {}),
              },
            }
          );
          return resp.data;
        } catch (err) {
          throw new ApiError(err, "github.com/search");
        }
      })();

      spinner.stop();

      const items = data.items || [];
      if (items.length === 0) {
        printWarning(`No repositories found for topic "${topic}".`);
        return;
      }

      const chalk = require("chalk");
      printHeader(`Top ${items.length} repos for topic "${topic}"`);
      console.log("");

      for (let i = 0; i < items.length; i++) {
        const r = items[i];
        const stars = String(r.stargazers_count).padStart(7);
        const lang = r.language ? chalk.yellow(r.language.padEnd(14)) : "".padEnd(14);
        console.log(
          `  ${chalk.dim(String(i + 1).padStart(2) + ".")} ${chalk.bold.cyan(r.full_name.padEnd(40))} ${lang} ${chalk.yellow("★")} ${stars}`
        );
        if (r.description) {
          console.log(`      ${chalk.dim(r.description.slice(0, 80))}`);
        }
      }
      console.log("");
    } catch (err) {
      spinner.stop();
      if (err instanceof ApiError) {
        printError(err.message);
      } else {
        printError(err.message);
      }
      process.exit(1);
    }
  });

// ── Global options & parse ────────────────────────────────────────────────────

program
  .name("github-explorer")
  .version("1.0.0")
  .description("Explore and compare GitHub developer profiles with country context")
  .addHelpText(
    "after",
    `
Examples:
  $ node src/index.js profile torvalds
  $ node src/index.js compare torvalds gvanrossum
  $ node src/index.js search machine-learning --count 10
  $ GITHUB_TOKEN=ghp_xxx node src/index.js profile sindresorhus
`
  );

program.parse(process.argv);

// Show help if no subcommand given
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
