/**
 * Update command — updates ARC CLI and reinstalls skills.
 *
 * Detects whether this is a local (repo) install or a global npm install:
 *   - Local: runs npm install + npm run build in the repo, then reinstalls skills
 *   - Global: runs npm install -g @axolotlai/arc-cli@latest, then reinstalls skills
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, getConfigDir } from "./config.js";
import { installSkill, detectAllFrameworks } from "./skill-installer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isLocalInstall(): string | null {
  // Check if we're running from a repo checkout (packages/cli/dist/update.js)
  const repoRoot = resolve(__dirname, "..", "..", "..");
  if (
    existsSync(resolve(repoRoot, "package.json")) &&
    existsSync(resolve(repoRoot, "packages", "cli")) &&
    existsSync(resolve(repoRoot, "relay"))
  ) {
    return repoRoot;
  }
  return null;
}

/**
 * Find the Python that Hermes uses by reading the shebang from the hermes entrypoint.
 * Falls back to known venv paths, then system python.
 */
function findHermesPython(homeDir: string): string {
  // 1. Read shebang from the hermes CLI entrypoint
  for (const hermesPath of [
    join(homeDir, ".local", "bin", "hermes"),
    "/usr/local/bin/hermes",
  ]) {
    if (existsSync(hermesPath)) {
      try {
        const content = readFileSync(hermesPath, "utf-8");
        const shebang = content.split("\n")[0];
        // Extract Python path from: #!/path/to/python3
        if (shebang.startsWith("#!") && shebang.includes("python")) {
          const pythonPath = shebang.slice(2).trim();
          if (existsSync(pythonPath)) {
            return pythonPath;
          }
        }
      } catch {
        // not readable
      }
    }
  }

  // 2. Try which hermes and read its shebang
  try {
    const hermesPath = execSync("which hermes", { encoding: "utf-8" }).trim();
    if (hermesPath && existsSync(hermesPath)) {
      const content = readFileSync(hermesPath, "utf-8");
      const shebang = content.split("\n")[0];
      if (shebang.startsWith("#!") && shebang.includes("python")) {
        const pythonPath = shebang.slice(2).trim();
        if (existsSync(pythonPath)) {
          return pythonPath;
        }
      }
    }
  } catch {
    // hermes not found
  }

  // 3. Known venv locations
  for (const candidate of [
    join(homeDir, ".hermes", "hermes-agent", "venv", "bin", "python3"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }

  return "python3";
}

export async function runUpdate(): Promise<void> {
  console.log("");
  console.log("  ARC — Update");
  console.log("");

  const repoRoot = isLocalInstall();

  if (repoRoot) {
    // ── Local (repo checkout) ──
    console.log("  Detected local install (repo checkout)");
    console.log("");

    console.log("  Pulling latest changes...");
    try {
      const output = execSync("git pull", { cwd: repoRoot, encoding: "utf-8" }).trim();
      console.log(`  ${output}`);
    } catch {
      console.log("  ⚠ git pull failed — skipping (maybe not a git repo or has local changes)");
    }

    console.log("  Installing dependencies...");
    try {
      execSync("npm install", { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      console.log("  ✓ Dependencies installed");
    } catch {
      console.error("  ✗ npm install failed");
      return;
    }

    console.log("  Building...");
    try {
      execSync("npm run build", { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      console.log("  ✓ Build complete");
    } catch {
      console.error("  ✗ Build failed");
      return;
    }
  } else {
    // ── Global npm install ──
    console.log("  Updating @axolotlai/arc-cli...");
    try {
      execSync("npm install -g @axolotlai/arc-cli@latest", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
      console.log("  ✓ Updated to latest version");
    } catch {
      console.error("  ✗ npm install -g failed. Try: sudo npm install -g @axolotlai/arc-cli@latest");
      return;
    }
  }

  // ── Install plugin dependencies ──
  const frameworks = detectAllFrameworks();
  if (frameworks.includes("hermes")) {
    console.log("");
    console.log("  Installing Hermes plugin dependencies...");
    try {
      const python = execSync("which python3 || which python", { encoding: "utf-8" }).trim();
      execSync(`${python} -m pip install -q websocket-client`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      console.log("  ✓ websocket-client installed");
    } catch {
      console.log("  ⚠ Could not install websocket-client. Run: pip install websocket-client");
    }

    // Ensure plugin symlink exists and points to current repo
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";
    if (homeDir && repoRoot) {
      const pluginSource = join(repoRoot, "hermes-plugin", "arc-remote-control");
      const pluginTarget = join(homeDir, ".hermes", "plugins", "arc-remote-control");
      if (existsSync(pluginSource)) {
        const { mkdirSync, symlinkSync, lstatSync, unlinkSync } = await import("node:fs");
        mkdirSync(join(homeDir, ".hermes", "plugins"), { recursive: true });
        // Refresh symlink to ensure it points to current repo location
        try {
          const stat = lstatSync(pluginTarget);
          if (stat.isSymbolicLink()) {
            unlinkSync(pluginTarget);
          }
        } catch {
          // doesn't exist yet
        }
        try {
          symlinkSync(pluginSource, pluginTarget);
          console.log(`  ✓ Hermes plugin symlinked: ${pluginTarget}`);
        } catch {
          // already exists as directory, skip
        }
      }

      // Patch hermes entrypoint to add inject_message support
      const hermesPython = findHermesPython(homeDir);
      try {
        execSync(`${hermesPython} -m pip install -q websocket-client`, {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        // Non-fatal
      }
      // Import and call patchHermesEntrypoint from skill-installer
      const { patchHermesEntrypoint } = await import("./skill-installer.js");
      patchHermesEntrypoint(homeDir, hermesPython);
      console.log("  ✓ Hermes entrypoint patched");
    }
  }

  // ── Reinstall skills ──
  console.log("");
  console.log("  Reinstalling skills...");

  // Force reinstall by deleting existing skill files first
  for (const fw of frameworks) {
    const result = installSkill(fw);
    if (result.installed) {
      console.log(`  ✓ ${fw}: ${result.path}`);
    } else {
      // Already exists — remove and reinstall to get latest content
      try {
        const { unlinkSync } = await import("node:fs");
        unlinkSync(result.path);
        const retry = installSkill(fw);
        if (retry.installed) {
          console.log(`  ✓ ${fw}: updated ${retry.path}`);
        }
      } catch {
        console.log(`  ⚠ ${fw}: ${result.message}`);
      }
    }
  }

  // ── Restart local services (dev mode only) ──
  // Only restart relay/viewer if running locally (not when using hosted relay)
  const config = loadConfig();
  const isDevMode = !config.hosted || process.env.ARC_ENV === "dev";

  if (!isDevMode) {
    console.log("");
    console.log("  ✓ Update complete");
    console.log("");
    return;
  }

  // Check if dev:viewer (Vite) is running
  let viewerWasRunning = false;
  try {
    // Find viewer PIDs — check for both npm script name and vite binary
    const psOutput = execSync("ps -eo pid,command", { encoding: "utf-8" });
    const viewerPids: number[] = [];
    for (const line of psOutput.split("\n")) {
      if (line.includes("dev:viewer") || (line.includes("vite") && line.includes("web-client"))) {
        const pid = parseInt(line.trim(), 10);
        if (pid && pid !== process.pid) viewerPids.push(pid);
      }
    }
    viewerWasRunning = viewerPids.length > 0;
    if (viewerWasRunning) {
      console.log("");
      console.log(`  Stopping dev viewer (pids: ${viewerPids.join(", ")})...`);
      for (const pid of viewerPids) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // already dead
        }
      }
      execSync("sleep 1", { encoding: "utf-8" });
      console.log("  ✓ Dev viewer stopped");
    }
  } catch {
    // ps failed, skip
  }

  const pidFile = join(getConfigDir(), "relay.pid");
  if (existsSync(pidFile)) {
    try {
      const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      if (pid) {
        console.log("");
        console.log(`  Restarting relay (pid ${pid})...`);
        try {
          process.kill(pid, "SIGTERM");
          // Give it a moment to shut down
          execSync("sleep 1", { encoding: "utf-8" });
          console.log("  ✓ Old relay stopped");
        } catch {
          console.log("  ⚠ Old relay was not running (pid stale)");
        }

        // Re-start if we have a local install
        if (repoRoot) {
          const config = loadConfig();
          try {
            const { spawn } = await import("node:child_process");
            const python = execSync("which python3 || which python", { encoding: "utf-8" }).trim();
            const { openSync } = await import("node:fs");
            const logFile = join(getConfigDir(), "relay.log");
            const logFd = openSync(logFile, "a");

            const relayProc = spawn(python, ["-m", "relay"], {
              cwd: repoRoot,
              env: { ...process.env, AGENT_TOKEN: config.agentToken, PORT: "8600" },
              detached: true,
              stdio: ["ignore", logFd, logFd],
            });
            relayProc.unref();
            if (relayProc.pid) {
              const { writeFileSync } = await import("node:fs");
              writeFileSync(pidFile, String(relayProc.pid), { mode: 0o600 });
              console.log(`  ✓ Relay restarted (pid ${relayProc.pid})`);
            }
          } catch {
            console.log("  ⚠ Could not restart relay. Run: arc setup (and start the relay)");
          }
        }
      }
    } catch {
      // pid file unreadable, skip
    }
  }

  // Restart dev viewer if it was running
  if (viewerWasRunning && repoRoot) {
    console.log("");
    console.log("  Restarting dev viewer...");
    try {
      const { spawn } = await import("node:child_process");
      const viewerProc = spawn("npm", ["run", "dev:viewer"], {
        cwd: repoRoot,
        detached: true,
        stdio: "ignore",
      });
      viewerProc.unref();
      console.log(`  ✓ Dev viewer restarted (pid ${viewerProc.pid})`);
    } catch {
      console.log("  ⚠ Could not restart dev viewer. Run: npm run dev:viewer");
    }
  }

  console.log("");
  console.log("  ✓ Update complete");
  console.log("");
}
