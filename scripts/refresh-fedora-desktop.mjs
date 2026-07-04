#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeTimersPromises from "node:timers/promises";
import * as NodeURL from "node:url";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

const defaults = {
  launcherPath: NodePath.join(NodeOS.homedir(), ".local", "bin", "t3code-stable"),
  closeTimeoutMs: 10_000,
  skipBuild: false,
  noLaunch: false,
};

function expandHome(inputPath) {
  if (inputPath === "~") return NodeOS.homedir();
  if (inputPath.startsWith("~/")) return NodePath.join(NodeOS.homedir(), inputPath.slice(2));
  return inputPath;
}

function parseArgs(argv) {
  const result = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--launcher-path":
        if (!next) throw new Error("--launcher-path requires a value");
        result.launcherPath = NodePath.resolve(expandHome(next));
        index += 1;
        break;
      case "--close-timeout-ms":
        if (!next) throw new Error("--close-timeout-ms requires a value");
        result.closeTimeoutMs = parsePositiveInteger(next, "--close-timeout-ms");
        index += 1;
        break;
      case "--skip-build":
        result.skipBuild = true;
        break;
      case "--no-launch":
        result.noLaunch = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        NodeProcess.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return result;
}

function parsePositiveInteger(raw, flagName) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return value;
}

function printHelp() {
  NodeProcess.stdout.write(
    [
      "Usage: node scripts/refresh-fedora-desktop.mjs [options]",
      "",
      "Build, install, close running T3 Code desktop instances, and relaunch the Fedora AppImage.",
      "",
      "Options:",
      "  --launcher-path <p>       Launcher path to run after install",
      "  --close-timeout-ms <ms>   Time to wait before force-killing old app processes",
      "  --skip-build              Reinstall and relaunch the latest existing release-fedora artifact",
      "  --no-launch               Stop after installing the refreshed build",
    ].join("\n"),
  );
  NodeProcess.stdout.write("\n");
}

function run(command, args) {
  const pretty = [command, ...args].join(" ");
  NodeProcess.stdout.write(`\n$ ${pretty}\n`);
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd: repoRoot,
    env: NodeProcess.env,
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${String(result.status)}: ${pretty}`);
  }
}

function listT3DesktopPids() {
  const result = NodeChildProcess.spawnSync("ps", ["-eo", "pid=,comm=,args="], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("Failed to list processes with ps");
  }

  const ownPid = NodeProcess.pid;
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(\S+)\s+(.*)$/u.exec(line);
      if (!match) return undefined;
      return {
        pid: Number(match[1]),
        command: match[2],
        args: match[3],
      };
    })
    .filter((processInfo) => processInfo && processInfo.pid !== ownPid)
    .filter((processInfo) => isT3DesktopProcess(processInfo))
    .map((processInfo) => processInfo.pid);
}

function isT3DesktopProcess(processInfo) {
  const args = processInfo.args.toLowerCase();
  const command = processInfo.command.toLowerCase();

  return (
    command === "t3code.appimage" ||
    command === "t3_code_alpha.appimage" ||
    command === "t3code" ||
    args.includes("/t3code.appimage") ||
    args.includes("/t3_code_alpha.appimage") ||
    args.includes("/.mount_t3code") ||
    args.includes("/.mount_t3_code")
  );
}

function isAlive(pid) {
  try {
    NodeProcess.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function closeT3DesktopProcesses(timeoutMs) {
  const pids = [...new Set(listT3DesktopPids())];
  if (pids.length === 0) {
    NodeProcess.stdout.write("No running T3 Code desktop processes found.\n");
    return;
  }

  NodeProcess.stdout.write(`Closing T3 Code desktop processes: ${pids.join(", ")}\n`);
  for (const pid of pids) {
    try {
      NodeProcess.kill(pid, "SIGTERM");
    } catch {
      // The process may have exited after we listed it.
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = pids.filter(isAlive);
    if (remaining.length === 0) return;
    await NodeTimersPromises.setTimeout(250);
  }

  const remaining = pids.filter(isAlive);
  if (remaining.length === 0) return;

  NodeProcess.stdout.write(`Force-killing T3 Code desktop processes: ${remaining.join(", ")}\n`);
  for (const pid of remaining) {
    try {
      NodeProcess.kill(pid, "SIGKILL");
    } catch {
      // The process may have exited after the timeout.
    }
  }
}

function launchDesktop(launcherPath) {
  NodeProcess.stdout.write(`Launching ${launcherPath}\n`);
  const child = NodeChildProcess.spawn(launcherPath, [], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function main() {
  const options = parseArgs(NodeProcess.argv.slice(2));

  if (!options.skipBuild) {
    run(NodeProcess.execPath, [
      "scripts/build-desktop-artifact.ts",
      "--platform",
      "linux",
      "--target",
      "AppImage",
      "--arch",
      "x64",
      "--output-dir",
      "release-fedora",
    ]);
  }

  await closeT3DesktopProcesses(options.closeTimeoutMs);
  run(NodeProcess.execPath, ["scripts/install-fedora-desktop.mjs"]);

  if (!options.noLaunch) {
    launchDesktop(options.launcherPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  NodeProcess.exit(1);
});
