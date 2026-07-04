#!/usr/bin/env node

import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

const defaults = {
  sourceDir: NodePath.join(repoRoot, "release-fedora"),
  installDir: NodePath.join(NodeOS.homedir(), ".local", "share", "t3code", "stable"),
  launcherPath: NodePath.join(NodeOS.homedir(), ".local", "bin", "t3code-stable"),
  desktopFilePath: NodePath.join(
    NodeOS.homedir(),
    ".local",
    "share",
    "applications",
    "t3code-stable.desktop",
  ),
  stateDir: NodePath.join(NodeOS.homedir(), ".t3", "stable"),
};

function expandHome(inputPath) {
  if (inputPath === "~") return NodeOS.homedir();
  if (inputPath.startsWith("~/")) return NodePath.join(NodeOS.homedir(), inputPath.slice(2));
  return inputPath;
}

function escapeDesktopExecPath(inputPath) {
  return inputPath.replaceAll("\\", "\\\\").replaceAll(" ", "\\ ");
}

function parseArgs(argv) {
  const result = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--source-dir":
        if (!next) throw new Error("--source-dir requires a value");
        result.sourceDir = NodePath.resolve(expandHome(next));
        index += 1;
        break;
      case "--install-dir":
        if (!next) throw new Error("--install-dir requires a value");
        result.installDir = NodePath.resolve(expandHome(next));
        index += 1;
        break;
      case "--launcher-path":
        if (!next) throw new Error("--launcher-path requires a value");
        result.launcherPath = NodePath.resolve(expandHome(next));
        index += 1;
        break;
      case "--desktop-file":
        if (!next) throw new Error("--desktop-file requires a value");
        result.desktopFilePath = NodePath.resolve(expandHome(next));
        index += 1;
        break;
      case "--state-dir":
        if (!next) throw new Error("--state-dir requires a value");
        result.stateDir = NodePath.resolve(expandHome(next));
        index += 1;
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

function printHelp() {
  NodeProcess.stdout.write(
    [
      "Usage: node scripts/install-fedora-desktop.mjs [options]",
      "",
      "Options:",
      "  --source-dir <dir>     Directory containing the Fedora AppImage build",
      "  --install-dir <dir>    Install root for the AppImage payload",
      "  --launcher-path <p>    Shell launcher path to create",
      "  --desktop-file <p>     Desktop entry path to create",
      "  --state-dir <dir>      Stable T3CODE_HOME to use when launching",
    ].join("\n"),
  );
  NodeProcess.stdout.write("\n");
}

async function findAppImage(sourceDir) {
  await NodeFSP.access(sourceDir).catch(() => {
    throw new Error(
      `Source directory not found: ${sourceDir}. Build with \`bun run dist:desktop:fedora\` first.`,
    );
  });
  const entries = await NodeFSP.readdir(sourceDir, { withFileTypes: true });
  const appImages = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".AppImage"))
    .map((entry) => NodePath.join(sourceDir, entry.name));

  if (appImages.length === 0) {
    throw new Error(
      `No AppImage found in ${sourceDir}. Build with \`bun run dist:desktop:fedora\` first.`,
    );
  }

  const stats = await Promise.all(
    appImages.map(async (filePath) => ({
      filePath,
      mtimeMs: (await NodeFSP.stat(filePath)).mtimeMs,
    })),
  );

  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return stats[0].filePath;
}

async function ensureParentDir(filePath) {
  await NodeFSP.mkdir(NodePath.dirname(filePath), { recursive: true });
}

async function main() {
  const options = parseArgs(NodeProcess.argv.slice(2));
  const sourceAppImage = await findAppImage(options.sourceDir);
  const installedAppImage = NodePath.join(options.installDir, "T3Code.AppImage");

  await NodeFSP.mkdir(options.installDir, { recursive: true });
  await NodeFSP.copyFile(sourceAppImage, installedAppImage);
  await NodeFSP.chmod(installedAppImage, 0o755);

  const launcher = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `export T3CODE_HOME="${options.stateDir}"`,
    `exec "${installedAppImage}" "$@"`,
    "",
  ].join("\n");

  await ensureParentDir(options.launcherPath);
  await NodeFSP.writeFile(options.launcherPath, launcher);
  await NodeFSP.chmod(options.launcherPath, 0o755);

  const desktopEntry = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=T3 Code (Stable)",
    "Comment=T3 Code stable build",
    `Exec=${escapeDesktopExecPath(options.launcherPath)} %U`,
    "Terminal=false",
    "Categories=Development;",
    "StartupWMClass=t3code",
    "",
  ].join("\n");

  await ensureParentDir(options.desktopFilePath);
  await NodeFSP.writeFile(options.desktopFilePath, desktopEntry);

  NodeProcess.stdout.write(
    [
      `Installed AppImage: ${sourceAppImage}`,
      `Launcher: ${options.launcherPath}`,
      `Desktop entry: ${options.desktopFilePath}`,
      `Stable state dir: ${options.stateDir}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  NodeProcess.exit(1);
});
