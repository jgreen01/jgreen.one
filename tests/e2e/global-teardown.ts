import { execFileSync } from "node:child_process";

/** Stops the background preview server started in global setup. */
export default function globalTeardown() {
  try {
    execFileSync("npx", ["astro", "preview", "stop"], { stdio: "ignore" });
  } catch {
    // Already stopped, or never started because setup failed.
  }
}
