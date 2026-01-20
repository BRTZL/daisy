/**
 * /etc/hosts File Management
 * Handles adding and removing the daisy.test domain mapping
 */

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const HOSTS_FILE = "/etc/hosts";
const DAISY_HOST = "daisy.test";
const DAISY_IP = "127.0.0.1";
const DAISY_MARKER = "# Added by Daisy";

/**
 * Read the current /etc/hosts content
 */
export function readHostsFile(): string {
  return readFileSync(HOSTS_FILE, "utf-8");
}

/**
 * Check if daisy.test entry exists in /etc/hosts
 */
export function hasDaisyHost(): boolean {
  const content = readHostsFile();
  const regex = new RegExp(`^\\s*${DAISY_IP}\\s+${DAISY_HOST}`, "m");
  return regex.test(content);
}

/**
 * Generate the hosts entry line
 */
function generateHostsEntry(): string {
  return `${DAISY_IP}\t${DAISY_HOST}\t${DAISY_MARKER}`;
}

/**
 * Add daisy.test entry to /etc/hosts
 * Requires sudo privileges
 */
export function addDaisyHost(): {
  success: boolean;
  error?: string;
  needsSudo?: boolean;
} {
  if (hasDaisyHost()) {
    return { success: true }; // Already exists
  }

  const currentContent = readHostsFile();
  const newEntry = generateHostsEntry();
  const newContent = `${currentContent.trimEnd()}\n${newEntry}\n`;

  // Try to write directly first (in case we have permissions)
  try {
    writeFileSync(HOSTS_FILE, newContent, "utf-8");
    return { success: true };
  } catch {
    // Need sudo
  }

  // Use sudo to write
  const result = spawnSync("sudo", ["tee", "-a", HOSTS_FILE], {
    input: `${newEntry}\n`,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return {
      success: false,
      error: result.stderr || "Failed to modify /etc/hosts",
      needsSudo: true,
    };
  }

  return { success: true };
}

/**
 * Remove daisy.test entry from /etc/hosts
 * Requires sudo privileges
 */
export function removeDaisyHost(): {
  success: boolean;
  error?: string;
  needsSudo?: boolean;
} {
  if (!hasDaisyHost()) {
    return { success: true }; // Already removed
  }

  const currentContent = readHostsFile();

  // Remove lines containing daisy.test with our marker
  const lines = currentContent.split("\n");
  const filteredLines = lines.filter((line) => {
    // Remove lines that have daisy.test AND our marker
    const isDaisyLine =
      line.includes(DAISY_HOST) && line.includes(DAISY_MARKER);
    // Also remove lines that are just the daisy.test entry (in case marker was removed)
    const isDaisyEntry = new RegExp(
      `^\\s*${DAISY_IP}\\s+${DAISY_HOST}\\s*$`
    ).test(line);
    return !isDaisyLine && !isDaisyEntry;
  });

  const newContent = filteredLines.join("\n");

  // Try to write directly first
  try {
    writeFileSync(HOSTS_FILE, newContent, "utf-8");
    return { success: true };
  } catch {
    // Need sudo
  }

  // Use sudo with a temp file approach
  const tempFile = `/tmp/daisy-hosts-${Date.now()}`;

  // Write to temp file
  writeFileSync(tempFile, newContent, "utf-8");

  // Copy temp file to /etc/hosts with sudo
  const result = spawnSync("sudo", ["cp", tempFile, HOSTS_FILE], {
    encoding: "utf-8",
    stdio: ["inherit", "pipe", "pipe"],
  });

  // Clean up temp file
  spawnSync("rm", [tempFile]);

  if (result.status !== 0) {
    return {
      success: false,
      error: result.stderr || "Failed to modify /etc/hosts",
      needsSudo: true,
    };
  }

  return { success: true };
}

/**
 * Check if we have write access to /etc/hosts
 */
export function canWriteHostsFile(): boolean {
  // Check if we can write to /etc/hosts without sudo
  const result = spawnSync("test", ["-w", HOSTS_FILE], {
    encoding: "utf-8",
  });
  return result.status === 0;
}

/**
 * Run the hosts modification with sudo prompt
 * This function is meant to be called from the CLI with user interaction
 */
export function modifyHostsWithSudo(action: "add" | "remove"): {
  success: boolean;
  error?: string;
} {
  if (action === "add") {
    return addDaisyHost();
  } else {
    return removeDaisyHost();
  }
}
