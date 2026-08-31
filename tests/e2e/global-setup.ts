import { execFileSync, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = "http://localhost:4321";

/**
 * Builds the site and starts the preview server for the E2E run.
 *
 * This lives here rather than in Playwright's `webServer` because Astro 7's
 * `astro preview` **daemonizes and returns immediately** — Playwright requires a
 * command that stays in the foreground and reports
 * "Process from config.webServer exited early" when it does not. (Astro's own
 * `--background` flag implies foreground is the default; as of 7.2.9 it is not.)
 *
 * Running the build here also guarantees the suite tests current output rather
 * than whatever stale `dist/` happened to be lying around.
 */
async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  throw new Error(`Preview server did not become reachable at ${BASE_URL} in time`);
}

export default async function globalSetup() {
  // Always start from a clean server so a stale daemon cannot serve old output.
  try {
    execFileSync("npx", ["astro", "preview", "stop"], { stdio: "ignore" });
  } catch {
    // Nothing was running.
  }

  execSync("npm run build", { stdio: "inherit" });
  execFileSync("npx", ["astro", "preview"], { stdio: "inherit" });

  await waitForServer();
}
