import { Glob } from "../util/glob"

const FOLDERS = new Set([
  "node_modules",
  "bower_components",
  ".pnpm-store",
  "vendor",
  ".npm",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "bin",
  "obj",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  ".turbo",
  ".output",
  "desktop",
  ".sst",
  ".cache",
  ".webkit-cache",
  "__pycache__",
  ".pytest_cache",
  "mypy_cache",
  ".history",
  ".gradle",
])

const FILES = [
  "**/*.swp",
  "**/*.swo",
  "**/*.pyc",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/logs/**",
  "**/tmp/**",
  "**/temp/**",
  "**/*.log",
  "**/coverage/**",
  "**/.nyc_output/**",
]

// @parcel/watcher treats a bare, glob-free entry (e.g. "node_modules") as a
// single path resolved relative to the watched root, so it only ignores the
// TOP-LEVEL folder. Nested folders (e.g. packages/*/node_modules) stay watched
// and produce event storms on installs/builds. Emit globs instead so both the
// folder node and its contents are ignored at any depth (matching the FILES style).
export const PATTERNS = [...FILES, ...Array.from(FOLDERS).flatMap((folder) => [`**/${folder}`, `**/${folder}/**`])]

export function match(filepath: string, opts?: { extra?: string[]; whitelist?: string[] }) {
  for (const pattern of opts?.whitelist || []) {
    if (Glob.match(pattern, filepath)) return false
  }

  const parts = filepath.split(/[/\\]/)
  for (const part of parts) {
    if (FOLDERS.has(part)) return true
  }

  for (const pattern of [...FILES, ...(opts?.extra || [])]) {
    if (Glob.match(pattern, filepath)) return true
  }

  return false
}

export * as Ignore from "./ignore"
