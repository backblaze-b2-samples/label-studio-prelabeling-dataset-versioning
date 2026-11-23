#!/usr/bin/env node
// Idempotent cold-start setup for local development.
//
// Run directly:  node scripts/setup.mjs
// Run via pnpm:  pnpm run setup  (`pnpm setup` is a built-in pnpm command
//                before pnpm 11, so the bare form would not run this script)

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findPython,
  isSupportedPython,
  readPythonVersion,
  REQUIRED_PYTHON_MINOR,
} from "./python-runtime.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = resolve(REPO_ROOT, "services/api");
const ENV_EXAMPLE = resolve(REPO_ROOT, ".env.example");
const ENV_FILE = resolve(REPO_ROOT, ".env");
const VENV_DIR = resolve(API_DIR, ".venv");
const VENV_PYTHON = resolve(VENV_DIR, "bin/python");
const REQUIREMENTS_LOCK = resolve(API_DIR, "requirements.lock");
const ML_DIR = resolve(REPO_ROOT, "services/ml-backend");
const ML_VENV_PYTHON = resolve(ML_DIR, ".venv/bin/python");
const ML_TEST_REQUIREMENTS = resolve(ML_DIR, "requirements-test.txt");

/** Local-only secrets docker compose needs; generated once, never printed. */
const GENERATED_SECRETS = {
  LABEL_STUDIO_API_TOKEN: () => randomBytes(20).toString("hex"),
  LABEL_STUDIO_PASSWORD: () => randomBytes(18).toString("base64url"),
};

function fail(message) {
  console.error(`setup: ${message}`);
  process.exit(1);
}

function run(command, args, cwd) {
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });

  if (result.error) {
    fail(
      `${command} could not start (${result.error.code ?? result.error.message}). ` +
        "Check that it is installed and on PATH.",
    );
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureSupportedPlatform() {
  if (process.platform !== "win32") return;

  fail(
    "native Windows is not supported by the local dev scripts yet. " +
      "Use macOS, Linux, or WSL2 so the POSIX shell and .venv/bin paths work.",
  );
}

function ensureEnvFile() {
  if (existsSync(ENV_FILE)) {
    console.log("OK .env already exists; leaving it unchanged");
    return;
  }

  if (!existsSync(ENV_EXAMPLE)) {
    fail(".env.example is missing, so .env cannot be created");
  }

  copyFileSync(ENV_EXAMPLE, ENV_FILE);
  console.log("OK copied .env.example to .env; fill in your B2 credentials next");
}

function ensureLabelStudioSecrets() {
  const lines = readFileSync(ENV_FILE, "utf8").split("\n");
  const generated = [];

  for (const [name, make] of Object.entries(GENERATED_SECRETS)) {
    const index = lines.findIndex((line) => line.trim().startsWith(`${name}=`));
    if (index !== -1 && lines[index].trim().slice(name.length + 1).trim() !== "") continue;
    const entry = `${name}=${make()}`;
    if (index === -1) lines.push(entry);
    else lines[index] = entry;
    generated.push(name);
  }

  if (generated.length === 0) {
    console.log("OK Label Studio token and password already set in .env");
    return;
  }
  writeFileSync(ENV_FILE, lines.join("\n"), { mode: 0o600 });
  console.log(`OK generated ${generated.join(", ")} in .env (values not shown)`);
}

function resolveVenvPython() {
  if (existsSync(VENV_PYTHON)) {
    const existing = readPythonVersion(VENV_PYTHON);
    if (!existing) {
      fail(
        "services/api/.venv/bin/python is not executable. " +
          "Move the broken virtualenv aside, then rerun `pnpm run setup`.",
      );
    }
    if (!isSupportedPython(existing.version)) {
      fail(
        `services/api/.venv uses ${existing.text}; Python 3.${REQUIRED_PYTHON_MINOR}+ is required. ` +
          "Move the virtualenv aside, then rerun `pnpm run setup`.",
      );
    }
    console.log(`OK backend virtualenv already exists (${existing.text})`);
    return null;
  }

  if (existsSync(VENV_DIR)) {
    fail(
      "services/api/.venv exists but .venv/bin/python is missing. " +
        "Move the broken virtualenv aside, then rerun `pnpm run setup`.",
    );
  }

  const { python, found } = findPython();
  if (!python) {
    const seen = found.length > 0 ? ` Found: ${found.map((item) => item.text).join(", ")}.` : "";
    fail(
      `Python 3.${REQUIRED_PYTHON_MINOR}+ is required.${seen} ` +
        "Install it with Homebrew, pyenv, or your OS package manager, then rerun `pnpm run setup`.",
    );
  }
  return python.bin;
}

function ensureVenv(pythonBin) {
  if (existsSync(VENV_PYTHON)) return;
  run(pythonBin, ["-m", "venv", ".venv"], API_DIR);
}

function main() {
  ensureSupportedPlatform();
  const pythonBin = resolveVenvPython();

  // .env first: it is the only step that needs no network, so a sandbox that
  // blocks package downloads still leaves a usable .env to fill in instead of
  // exiting before it is created.
  ensureEnvFile();
  ensureLabelStudioSecrets();
  run("pnpm", ["install", "--frozen-lockfile"], REPO_ROOT);
  ensureVenv(pythonBin);
  run(VENV_PYTHON, ["-m", "pip", "install", "-r", REQUIREMENTS_LOCK], API_DIR);
  // The ML backend runs in docker compose; this light venv (no torch) is only
  // for its unit tests (`pnpm test:ml`).
  if (!existsSync(ML_VENV_PYTHON)) run(VENV_PYTHON, ["-m", "venv", ".venv"], ML_DIR);
  run(ML_VENV_PYTHON, ["-m", "pip", "install", "-r", ML_TEST_REQUIREMENTS], ML_DIR);

  console.log(
    "\nSetup complete. Fill in your B2 credentials in .env, then `docker compose up -d` " +
      "(Label Studio + ML backend) and `pnpm run doctor`.",
  );
}

main();
