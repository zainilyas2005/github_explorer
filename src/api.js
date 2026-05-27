// src/api.js
// Wraps GitHub and REST Countries APIs with timeout, retry, and structured error handling

const axios = require("axios");

const GITHUB_BASE = "https://api.github.com";
const COUNTRIES_BASE = "https://restcountries.com/v3.1";
const TIMEOUT_MS = 8000; // 8s — fail fast, not forever
const MAX_RETRIES = 2;

/**
 * Makes an HTTP GET with timeout and exponential-backoff retry.
 * Returns { data } on success, throws ApiError on failure.
 */
async function fetchWithRetry(url, options = {}, attempt = 1) {
  try {
    const response = await axios.get(url, {
      timeout: TIMEOUT_MS,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
        ...options.headers,
      },
      ...options,
    });
    return response.data;
  } catch (err) {
    // Retry on transient errors (network timeout, 5xx), not on 4xx client errors
    const status = err.response?.status;
    const isTransient =
      !status || // network-level error (ECONNABORTED, etc.)
      status === 429 || // rate limited
      status >= 500; // server error

    if (isTransient && attempt <= MAX_RETRIES) {
      const delay = attempt * 1000; // 1s, then 2s
      await sleep(delay);
      return fetchWithRetry(url, options, attempt + 1);
    }

    // Build a descriptive, structured error
    throw new ApiError(err, url);
  }
}

class ApiError extends Error {
  constructor(originalError, url) {
    const status = originalError.response?.status;
    const isTimeout =
      originalError.code === "ECONNABORTED" ||
      originalError.message?.includes("timeout");

    let message;
    if (isTimeout) {
      message = `Request timed out after ${TIMEOUT_MS / 1000}s (${url})`;
    } else if (status === 404) {
      message = `Not found (404): ${url}`;
    } else if (status === 403) {
      message = `Forbidden (403) — likely rate-limited. Set GITHUB_TOKEN to raise limits.`;
    } else if (status === 422) {
      message = `Unprocessable input (422): ${url}`;
    } else if (status) {
      message = `HTTP ${status} from ${url}`;
    } else {
      message = `Network error: ${originalError.message}`;
    }

    super(message);
    this.name = "ApiError";
    this.status = status || null;
    this.isTimeout = isTimeout;
    this.isNotFound = status === 404;
    this.isRateLimited = status === 403 || status === 429;
  }
}

// ── GitHub helpers ────────────────────────────────────────────────────────────

async function getUser(username) {
  // Guard: reject clearly invalid usernames before hitting the network
  // GitHub usernames: 1–39 chars, alphanumeric + hyphens, no leading/trailing hyphen
  if (!isValidGithubUsername(username)) {
    throw new ApiError(
      { response: { status: 422 }, message: "Invalid username format" },
      `github.com/${username}`
    );
  }
  return fetchWithRetry(`${GITHUB_BASE}/users/${encodeURIComponent(username)}`);
}

async function getUserRepos(username, perPage = 100) {
  return fetchWithRetry(
    `${GITHUB_BASE}/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&sort=pushed`
  );
}

async function getUserEvents(username) {
  return fetchWithRetry(
    `${GITHUB_BASE}/users/${encodeURIComponent(username)}/events/public?per_page=30`
  );
}

// ── REST Countries helpers ────────────────────────────────────────────────────

async function getCountryByName(name) {
  // Returns an array; we take the first match
  const results = await fetchWithRetry(
    `${COUNTRIES_BASE}/name/${encodeURIComponent(name)}?fullText=false&fields=name,capital,region,population,flags,currencies,languages`
  );
  return Array.isArray(results) ? results[0] : results;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function isValidGithubUsername(username) {
  if (typeof username !== "string") return false;
  if (username.length === 0 || username.length > 39) return false;
  // No leading/trailing hyphen, only alphanumeric + hyphens
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(username);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  getUser,
  getUserRepos,
  getUserEvents,
  getCountryByName,
  ApiError,
  isValidGithubUsername,
};

// Added after initial scaffold: explicit guard for empty-string username
// (catches cases like: node src/index.js profile "")
