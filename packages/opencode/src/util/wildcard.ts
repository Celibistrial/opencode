import { sortBy, pipe } from "remeda"

// The compiled regex depends only on the pattern (plus constant platform flags);
// match() runs per (candidate x rule) on permission/command matching, so memoize
// the compiled RegExp by pattern rather than rebuilding it every call. Patterns
// come from config rulesets (a small, repeating set); only the candidate string
// varies per call.
const regexCache = new Map<string, RegExp>()

function compiled(pattern: string): RegExp {
  const cached = regexCache.get(pattern)
  if (cached) return cached
  let normalized = pattern
  if (normalized) normalized = normalized.replaceAll("\\", "/")
  let escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape special regex chars
    .replace(/\*/g, ".*") // * becomes .*
    .replace(/\?/g, ".") // ? becomes .

  // If pattern ends with " *" (space + wildcard), make the trailing part optional
  // This allows "ls *" to match both "ls" and "ls -la"
  if (escaped.endsWith(" .*")) {
    escaped = escaped.slice(0, -3) + "( .*)?"
  }

  const flags = process.platform === "win32" ? "si" : "s"
  const regex = new RegExp("^" + escaped + "$", flags)
  regexCache.set(pattern, regex)
  return regex
}

export function match(str: string, pattern: string) {
  if (str) str = str.replaceAll("\\", "/")
  return compiled(pattern).test(str)
}

export function all(input: string, patterns: Record<string, any>) {
  const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]))
  let result = undefined
  for (const [pattern, value] of sorted) {
    if (match(input, pattern)) {
      result = value
      continue
    }
  }
  return result
}

export function allStructured(input: { head: string; tail: string[] }, patterns: Record<string, any>) {
  const sorted = pipe(patterns, Object.entries, sortBy([([key]) => key.length, "asc"], [([key]) => key, "asc"]))
  let result = undefined
  for (const [pattern, value] of sorted) {
    const parts = pattern.split(/\s+/)
    if (!match(input.head, parts[0])) continue
    if (parts.length === 1 || matchSequence(input.tail, parts.slice(1))) {
      result = value
      continue
    }
  }
  return result
}

function matchSequence(items: string[], patterns: string[]): boolean {
  if (patterns.length === 0) return true
  const [pattern, ...rest] = patterns
  if (pattern === "*") return matchSequence(items, rest)
  for (let i = 0; i < items.length; i++) {
    if (match(items[i], pattern) && matchSequence(items.slice(i + 1), rest)) {
      return true
    }
  }
  return false
}

export * as Wildcard from "./wildcard"
