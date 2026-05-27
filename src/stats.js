// src/stats.js
// Pure functions that derive metrics from raw GitHub API payloads.
// No network calls here — all inputs are already-fetched objects.

/**
 * Summarises a user's repositories into meaningful aggregates.
 * Handles the edge case where repos is empty (new/private-only accounts).
 */
function summariseRepos(repos) {
  if (!repos || repos.length === 0) {
    return {
      totalRepos: 0,
      totalStars: 0,
      totalForks: 0,
      topLanguages: [],
      mostStarred: null,
      avgStarsPerRepo: 0,
    };
  }

  // Only count repos the user owns (not forks they haven't touched)
  const ownRepos = repos.filter((r) => !r.fork);

  const totalStars = ownRepos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const totalForks = ownRepos.reduce((sum, r) => sum + r.forks_count, 0);

  // Language frequency map — repos with null language are skipped
  const langCount = {};
  for (const repo of ownRepos) {
    if (repo.language) {
      langCount[repo.language] = (langCount[repo.language] || 0) + 1;
    }
  }

  const topLanguages = Object.entries(langCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang, count]) => ({ lang, count }));

  const mostStarred = ownRepos.reduce(
    (best, r) =>
      r.stargazers_count > (best?.stargazers_count ?? -1) ? r : best,
    null
  );

  return {
    totalRepos: ownRepos.length,
    totalStars,
    totalForks,
    topLanguages,
    mostStarred,
    avgStarsPerRepo: ownRepos.length
      ? Math.round(totalStars / ownRepos.length)
      : 0,
  };
}

/**
 * Derives recent activity summary from public events.
 * GitHub's events endpoint can return an empty array for very inactive users.
 */
function summariseActivity(events) {
  if (!events || events.length === 0) {
    return { recentPushes: 0, recentPRs: 0, activeRepos: [] };
  }

  const pushes = events.filter((e) => e.type === "PushEvent");
  const prs = events.filter((e) => e.type === "PullRequestEvent");

  // Unique repo names from push events (preserves insertion order = most recent first)
  const activeRepoSet = new Set(pushes.map((e) => e.repo?.name).filter(Boolean));

  return {
    recentPushes: pushes.length,
    recentPRs: prs.length,
    activeRepos: [...activeRepoSet].slice(0, 3),
  };
}

/**
 * Builds a simple comparison object from two user stat sets.
 * "winner" fields are whoever has the higher value; null = tied.
 */
function compareUsers(statsA, statsB, nameA, nameB) {
  const compare = (a, b) => {
    if (a > b) return nameA;
    if (b > a) return nameB;
    return null; // tied
  };

  return {
    stars: {
      [nameA]: statsA.repos.totalStars,
      [nameB]: statsB.repos.totalStars,
      winner: compare(statsA.repos.totalStars, statsB.repos.totalStars),
    },
    repos: {
      [nameA]: statsA.repos.totalRepos,
      [nameB]: statsB.repos.totalRepos,
      winner: compare(statsA.repos.totalRepos, statsB.repos.totalRepos),
    },
    followers: {
      [nameA]: statsA.profile.followers,
      [nameB]: statsB.profile.followers,
      winner: compare(statsA.profile.followers, statsB.profile.followers),
    },
    recentPushes: {
      [nameA]: statsA.activity.recentPushes,
      [nameB]: statsB.activity.recentPushes,
      winner: compare(statsA.activity.recentPushes, statsB.activity.recentPushes),
    },
  };
}

/**
 * Formats a large number with commas: 1234567 → "1,234,567"
 */
function fmt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

/**
 * Extracts the country name from a GitHub user profile.
 * The `location` field is free-text, so we do a best-effort parse:
 * take the last comma-separated segment (usually the country).
 * Returns null if location is missing or unparseable.
 */
function extractCountry(location) {
  if (!location || typeof location !== "string") return null;
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  // Edge case: single-word location like "Germany" — return it directly
  return parts[parts.length - 1] || null;
}

module.exports = { summariseRepos, summariseActivity, compareUsers, fmt, extractCountry };
