#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const VALID_BUMPS = new Set(["major", "minor", "patch"]);
const VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function parseVersion(version) {
  const [core] = version.split("-", 1);
  const parts = core.split(".");
  if (parts.length !== 3) {
    fail(`Invalid version: ${version}`);
  }
  const [major, minor, patch] = parts.map((item) => Number(item));
  if ([major, minor, patch].some((item) => Number.isNaN(item))) {
    fail(`Invalid numeric version: ${version}`);
  }
  return { major, minor, patch };
}

function bumpVersion(currentVersion, bumpType) {
  const parsed = parseVersion(currentVersion);
  if (bumpType === "major") {
    return `${parsed.major + 1}.0.0`;
  }
  if (bumpType === "minor") {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

const bumpType = (process.argv[2] || "patch").trim();
if (!VALID_BUMPS.has(bumpType)) {
  fail(`Usage: node scripts/auto-bump-version.mjs <major|minor|patch>`);
}

const repoRoot = resolveRepoRoot();
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const currentVersion = packageJson.version;

if (!VERSION_PATTERN.test(currentVersion)) {
  fail(`Invalid current package.json version: ${currentVersion}`);
}

const nextVersion = bumpVersion(currentVersion, bumpType);
execFileSync(process.execPath, [path.join(repoRoot, "scripts", "sync-version.mjs"), nextVersion], {
  stdio: "inherit",
});

console.log(nextVersion);
