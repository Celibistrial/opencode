#!/usr/bin/env bun
// CPU-profile opencode from source using Bun's built-in sampling profiler.
// Writes a .cpuprofile (open in Chrome DevTools or https://www.speedscope.app) AND a
// grep-friendly .md (Bun --cpu-prof-md). Running this on the `local/all-fixes` branch
// profiles exactly the code in the installed custom binary.
//
//   bun run script/profile.ts run "summarize this repo"   # headless: server + streaming CPU
//   bun run script/profile.ts                             # interactive TUI: render CPU (quit to write)
//
// Env: PROF_DIR (default /tmp/opencode-prof), PROF_INTERVAL_US sampling interval (default 500).
import path from "path"

const dir = Bun.env.PROF_DIR ?? "/tmp/opencode-prof"
const interval = Bun.env.PROF_INTERVAL_US ?? "500"
const args = process.argv.slice(2)
const root = path.resolve(import.meta.dir, "..")

await Bun.$`mkdir -p ${dir}`
console.error(`[profile] dir=${dir} interval=${interval}us args=${JSON.stringify(args) || "(TUI)"}`)

const proc = Bun.spawn(
  [
    "bun",
    "--cpu-prof",
    "--cpu-prof-md",
    `--cpu-prof-dir=${dir}`,
    `--cpu-prof-interval=${interval}`,
    "run",
    "--conditions=browser",
    "src/index.ts",
    ...args,
  ],
  { cwd: root, stdin: "inherit", stdout: "inherit", stderr: "inherit", env: Bun.env },
)
await proc.exited

console.error(`\n[profile] written to ${dir}:`)
await Bun.$`ls -la ${dir}`.nothrow()
console.error(`[profile] open the .cpuprofile in Chrome DevTools / speedscope.app; the .md is grep-friendly (hot functions by self/total time).`)
