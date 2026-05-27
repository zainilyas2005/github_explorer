# ANSWERS.md

---

## 1. How to run

**Prerequisites:** Node.js v18+ (check with `node --version`)

```bash
git clone https://github.com/YOUR_USERNAME/github-explorer.git
cd github-explorer
npm install

# Basic commands
node src/index.js profile torvalds
node src/index.js compare torvalds gvanrossum
node src/index.js search machine-learning --count 10
```

**Optional (recommended):** Set `GITHUB_TOKEN` to raise API rate limits from 60 to 5,000 req/hour:

```bash
export GITHUB_TOKEN=ghp_yourTokenHere
node src/index.js profile sindresorhus
```

No build step, no Docker, no database. `npm install` and you're running.

---

## 2. Stack choice

**Why Node.js + plain npm scripts:**

JavaScript was the right fit here for three reasons:

1. **I/O-bound workload.** This tool does nothing but make HTTP requests and format the results. Node's async/event-loop model handles concurrent API calls (e.g. fetching two users' repos and events in parallel via `Promise.all`) without threads or complexity.

2. **CLI ecosystem.** `commander`, `chalk`, `ora`, and `cli-table3` are mature, well-typed, and handle the fiddly terminal work (colour codes, spinner clearing, table alignment). Reimplementing these in a lower-level language would waste time on tooling, not the actual problem.

3. **No build step.** The assessment says "runnable on a fresh machine." A Python or Node script with a `requirements.txt` / `package.json` is simpler to reproduce than a compiled binary or a Docker image that needs to be built.

**A worse choice would be:**

Bash. Shell scripts can call `curl` and `jq`, but error handling across multiple API calls becomes brittle fast. Retry logic with exponential backoff is ~5 lines in JavaScript and ~40 messy lines in Bash. Structured error types (the `ApiError` class) don't exist in shell. The comparison table rendering would be a nightmare. Bash is excellent for glue; it's a poor fit when your code *is* the product.

---

## 3. One real edge case

**Edge case:** A user with zero public repositories, or whose repos are all forks.

**File and line:** `src/stats.js`, lines 13–22 (`summariseRepos` function):

```js
// src/stats.js, line 13
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
```

And line 26 filters out fork repos:
```js
const ownRepos = repos.filter((r) => !r.fork);
```

**What happens without this handling:**

Without the empty-array guard, `ownRepos.reduce(...)` on an empty array with no initial value throws `TypeError: Reduce of empty array with no initial value`. The app crashes with a stack trace instead of cleanly displaying "0 repos, 0 stars."

The fork filter matters too: GitHub's API returns forked repos in a user's repo list. If someone has 50 forks and 2 original repos, counting forks inflates both repo count and language stats to meaningless numbers. By filtering `!r.fork`, we only score what the user actually built.

---

## 4. AI usage

I used Claude (claude.ai) throughout this project. Here's a specific log:

**1. Initial structure**
Asked: *"Help me design a Node.js CLI that fetches GitHub profiles, with clean separation between HTTP logic, stats, and display."*
Got: A layout with three modules (api, stats, display) and a basic commander setup.
**What I changed:** The AI suggested putting retry logic inside each individual API function. I moved it into a single `fetchWithRetry` utility instead, so retries are consistent and I'm not duplicating backoff logic in `getUser`, `getUserRepos`, etc. DRY principle — one place to tune the retry count and timing.

**2. The `ApiError` class**
Asked: *"What structured error info should a CLI surface for GitHub API failures?"*
Got: A basic error class with `status` and `message`.
**What I changed:** Added `isNotFound`, `isRateLimited`, and `isTimeout` boolean flags. The AI's version required every call site to check `err.status === 404` — brittle if the status code ever comes from a different field. The boolean flags let the display layer say `if (err.isNotFound)` without caring about HTTP details, which keeps the rendering code cleanly separated from the network layer.

**3. Country enrichment**
Asked: *"The GitHub user location field is free-text like 'San Francisco, CA, USA'. How should I extract the country?"*
Got: A regex approach.
**What I changed:** Used a simple split-on-comma approach (`extractCountry` in `stats.js`, last segment). The regex was over-engineered for what's essentially a best-effort heuristic — if the country lookup fails, we gracefully skip it anyway. Simpler code, same outcome.

**4. The `compare` command's parallel fetching**
Asked: *"How should I fetch two users' data in parallel without waiting for user A before starting user B?"*
Got: A `Promise.all` with all 6 calls in one array.
**This I kept as-is.** It was the right answer. Total fetch time = max(A's slowest call, B's slowest call), not the sum of all 6.

---

## 5. Honest gap

**The weakest part:** The `search` command makes a one-off `axios.get` call directly inside the command handler (`src/index.js`, roughly line 100) instead of going through the `fetchWithRetry` wrapper in `api.js`.

This happened because the search endpoint (`/search/repositories`) uses different query params than the user endpoints, and I didn't want to over-generalise `fetchWithRetry` mid-build. The quick fix was an inline call. It works, but it means search requests don't retry on transient 5xx errors — they just fail once and exit.

**Fix with another day:** Refactor `fetchWithRetry` in `api.js` to accept a full options object (URL, custom headers, query params) and expose a `searchRepos(topic, count)` helper that goes through it. The retry + error-classification logic would then cover all three commands equally, and the search command handler becomes 5 lines instead of 25. I'd also add a simple test file (`tests/stats.test.js`) covering `summariseRepos([])`, `extractCountry("Berlin, Germany")`, and `isValidGithubUsername` edge cases — currently the project has zero automated tests.
