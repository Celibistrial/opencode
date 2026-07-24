export * as Wildcard from "./wildcard"

// The compiled regex depends only on the pattern (and the constant platform
// flags), while match() is called once per (candidate x rule) — permission checks
// alone run it O(tools x rules) per request. Patterns come from config rulesets /
// policy statements (a small, repeating set), so memoize the compiled RegExp by
// pattern instead of rebuilding it on every call (~7x fewer ns per match).
const regexCache = new Map<string, RegExp>()

function compiled(pattern: string): RegExp {
  const cached = regexCache.get(pattern)
  if (cached) return cached
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
  const regex = new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s")
  regexCache.set(pattern, regex)
  return regex
}

export function match(input: string, pattern: string) {
  return compiled(pattern).test(input.replaceAll("\\", "/"))
}
