/**
 * macOS Launchd Daemon Management
 * Handles installation, uninstallation, and control of the Daisy daemon
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DAEMON_LABEL = "com.daisy.daemon";
const PLIST_FILENAME = `${DAEMON_LABEL}.plist`;

/**
 * Get the path to the LaunchAgents directory
 */
export function getLaunchAgentsDir(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

/**
 * Get the path to the plist file
 */
export function getPlistPath(): string {
  return path.join(getLaunchAgentsDir(), PLIST_FILENAME);
}

/**
 * Get the path to the logs directory
 */
export function getLogsDir(): string {
  return path.join(os.homedir(), "Library", "Logs", "daisy");
}

/**
 * Get the path to the node binary
 */
function getNodePath(): string {
  const result = spawnSync("which", ["node"], {
    encoding: "utf-8",
  });

  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  // Common fallback locations
  const commonPaths = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];

  for (const nodePath of commonPaths) {
    if (existsSync(nodePath)) {
      return nodePath;
    }
  }

  throw new Error("Could not find node binary. Make sure Node.js is installed.");
}

/**
 * Generate the launchd plist content
 */
export function generatePlist(serverPath: string, port: number = 4141): string {
  const logsDir = getLogsDir();
  const nodePath = getNodePath();

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${DAEMON_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${serverPath}</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${logsDir}/stdout.log</string>

  <key>StandardErrorPath</key>
  <string>${logsDir}/stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${port}</string>
    <key>HOST</key>
    <string>127.0.0.1</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>

  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>
</dict>
</plist>`;
}

/**
 * Check if the daemon is installed
 */
export function isDaemonInstalled(): boolean {
  return existsSync(getPlistPath());
}

/**
 * Check if the daemon is currently running
 */
export function isDaemonRunning(): boolean {
  const result = spawnSync("launchctl", ["list", DAEMON_LABEL], {
    encoding: "utf-8",
  });
  return result.status === 0;
}

/**
 * Get detailed daemon status
 */
export function getDaemonStatus(): {
  installed: boolean;
  running: boolean;
  pid?: number;
  lastExitStatus?: number;
} {
  const installed = isDaemonInstalled();

  if (!installed) {
    return { installed: false, running: false };
  }

  const result = spawnSync("launchctl", ["list", DAEMON_LABEL], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    return { installed: true, running: false };
  }

  // Parse launchctl list output (dictionary format)
  // Format: { "PID" = 1234; "LastExitStatus" = 0; ... }
  const output = result.stdout;

  // Extract PID
  const pidMatch = output.match(/"PID"\s*=\s*(\d+)/);
  const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;

  // Extract LastExitStatus
  const exitMatch = output.match(/"LastExitStatus"\s*=\s*(\d+)/);
  const lastExitStatus = exitMatch ? parseInt(exitMatch[1], 10) : undefined;

  return {
    installed: true,
    running: pid !== undefined,
    pid,
    lastExitStatus,
  };
}

/**
 * Install the daemon
 * Returns true if successful, throws error otherwise
 */
export function installDaemon(serverPath: string, port: number = 80): void {
  // Ensure LaunchAgents directory exists
  const launchAgentsDir = getLaunchAgentsDir();
  if (!existsSync(launchAgentsDir)) {
    mkdirSync(launchAgentsDir, { recursive: true });
  }

  // Ensure logs directory exists
  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  // Generate and write plist
  const plistContent = generatePlist(serverPath, port);
  const plistPath = getPlistPath();
  writeFileSync(plistPath, plistContent, "utf-8");

  // Load the daemon
  const result = spawnSync("launchctl", ["load", plistPath], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to load daemon: ${result.stderr || result.stdout}`);
  }
}

/**
 * Uninstall the daemon
 */
export function uninstallDaemon(): void {
  const plistPath = getPlistPath();

  if (!existsSync(plistPath)) {
    return; // Already uninstalled
  }

  // Unload the daemon first
  const _result = spawnSync("launchctl", ["unload", plistPath], {
    encoding: "utf-8",
  });

  // Remove the plist file even if unload fails (daemon might not be running)
  if (existsSync(plistPath)) {
    unlinkSync(plistPath);
  }
}

/**
 * Start the daemon (if installed but not running)
 */
export function startDaemon(): void {
  const plistPath = getPlistPath();

  if (!existsSync(plistPath)) {
    throw new Error("Daemon is not installed. Run 'daisy install' first.");
  }

  if (isDaemonRunning()) {
    return; // Already running
  }

  const result = spawnSync("launchctl", ["load", plistPath], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(
      `Failed to start daemon: ${result.stderr || result.stdout}`
    );
  }
}

/**
 * Stop the daemon
 */
export function stopDaemon(): void {
  const plistPath = getPlistPath();

  if (!existsSync(plistPath)) {
    return; // Not installed
  }

  if (!isDaemonRunning()) {
    return; // Not running
  }

  const result = spawnSync("launchctl", ["unload", plistPath], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(`Failed to stop daemon: ${result.stderr || result.stdout}`);
  }
}

/**
 * Restart the daemon
 */
export function restartDaemon(): void {
  stopDaemon();
  startDaemon();
}

/**
 * Get the server path for the installed package
 */
export function getServerPath(): string {
  // 1. Check for local development (current working directory)
  const cwdServerPath = path.join(process.cwd(), "dist", "server", "index.js");
  if (existsSync(cwdServerPath)) {
    return cwdServerPath;
  }

  // 2. Check for npm link (local package.json points to daisy)
  const localPkgPath = path.join(process.cwd(), "package.json");
  if (existsSync(localPkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
      if (pkg.name === "plan-with-daisy" || pkg.name === "daisy") {
        const localServerPath = path.join(
          process.cwd(),
          "dist",
          "server",
          "index.js"
        );
        if (existsSync(localServerPath)) {
          return localServerPath;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // 3. Check global npm modules
  const result = spawnSync("npm", ["root", "-g"], {
    encoding: "utf-8",
  });

  if (result.status === 0) {
    const globalModules = result.stdout.trim();
    // Try both package names
    for (const pkgName of ["plan-with-daisy", "daisy"]) {
      const serverPath = path.join(
        globalModules,
        pkgName,
        "dist",
        "server",
        "index.js"
      );
      if (existsSync(serverPath)) {
        return serverPath;
      }
    }
  }

  // 4. Fallback: try to find via which daisy
  const whichResult = spawnSync("which", ["daisy"], {
    encoding: "utf-8",
  });

  if (whichResult.status === 0) {
    const daisyBin = whichResult.stdout.trim();
    // daisy bin is typically a symlink to the actual location
    const realResult = spawnSync("realpath", [daisyBin], {
      encoding: "utf-8",
    });

    if (realResult.status === 0) {
      const realPath = realResult.stdout.trim();
      // Navigate from bin to server
      const packageDir = path.dirname(path.dirname(realPath));
      const serverPath = path.join(packageDir, "dist", "server", "index.js");
      if (existsSync(serverPath)) {
        return serverPath;
      }
    }
  }

  throw new Error(
    "Could not find Daisy server path. Run from the daisy project directory or install globally via npm."
  );
}
