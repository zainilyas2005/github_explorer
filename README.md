# GitHub Explorer CLI

A command-line tool that lets you explore, compare, and search GitHub developer profiles — enriched with country context from the REST Countries API.

**What you can do that the GitHub website doesn't easily give you:**
- Compare two developers side-by-side across stars, repos, followers, and recent activity — in a single command
- See country context (capital, population, languages, currency) for any developer's listed location
- Search top repositories by topic with star counts in a clean terminal table
- All with timeout handling, retries, and clear error messages for bad input or API failures

---

## Quick Start (fresh machine)

### 1. Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (`node --version` to check)
- npm (comes with Node.js)

### 2. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/github-explorer.git
cd github-explorer
npm install
```

### 3. (Optional but recommended) Set a GitHub token

The GitHub API allows **60 unauthenticated requests/hour** per IP. For the compare command (6 API calls) you'll hit this quickly. A free token raises it to 5,000/hour.

**Get a token:** GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate (no special scopes needed for public data).

```bash
export GITHUB_TOKEN=ghp_yourTokenHere
```

You can also put this in a `.env` file — but don't commit it. The `.gitignore` covers `.env` files.

---

## Usage

```bash
# Show a profile card for one user
node src/index.js profile torvalds

# Compare two users head-to-head
node src/index.js compare torvalds gvanrossum

# Find top repos for a topic
node src/index.js search machine-learning
node src/index.js search cli --count 10
```

### Error handling — what the tool does when things go wrong

| Situation | Behaviour |
|---|---|
| GitHub API is slow | Times out after 8s, retries up to 2× with backoff |
| API returns a 5xx error | Retries with exponential backoff (1s, then 2s) |
| User not found (404) | Clear message: "No GitHub user found with username X" |
| Rate limited (403/429) | Tells you to set `GITHUB_TOKEN` |
| Invalid username format | Validated locally before any network call |
| Country API fails | Silently skipped — profile still shown without country block |
| Same username passed twice to compare | Caught before network calls |
| `--count` is not a number | Validated with a clear error message |

---

## API keys

- **GitHub API**: No key needed for basic usage. Set `GITHUB_TOKEN` to avoid rate limits.
- **REST Countries API**: Completely free, no key required. [restcountries.com](https://restcountries.com)

---

## Project structure

```
src/
  index.js   — CLI commands (profile, compare, search)
  api.js     — HTTP client with timeout, retry, error handling
  stats.js   — Pure functions: repo/activity analysis, comparison logic
  display.js — Terminal rendering (all chalk/table code lives here)
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `axios` | HTTP client (timeout + response parsing) |
| `chalk` | Terminal colours |
| `cli-table3` | Aligned terminal tables |
| `commander` | CLI argument parsing |
| `ora` | Spinner while waiting for API |
