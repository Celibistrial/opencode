// Returns true when `str` contains more than `limit` Unicode code points.
// A string's UTF-16 `.length` is an upper bound on its code-point count, so
// when that is already within `limit` we skip walking the string entirely;
// otherwise we count code points and bail out as soon as we pass `limit`
// (avoids allocating a full `Array.from(str)` of ~30k entries per update).
function exceedsCodePoints(str: string, limit: number) {
  if (str.length <= limit) return false
  let count = 0
  for (const _ of str) {
    count++
    if (count > limit) return true
  }
  return false
}

export function collapseToolOutput(output: string, maxLines: number, maxChars: number) {
  const lines = output.split("\n")
  if (lines.length <= maxLines && !exceedsCodePoints(output, maxChars)) {
    return { output, overflow: false }
  }

  const preview = lines.slice(0, maxLines).join("\n")
  if (exceedsCodePoints(preview, maxChars)) {
    // Equivalent to Array.from(preview).slice(0, max(0, maxChars - 1)).join(""),
    // but built code point by code point so the full array is never allocated.
    const limit = Math.max(0, maxChars - 1)
    let truncated = ""
    let count = 0
    for (const ch of preview) {
      if (count >= limit) break
      truncated += ch
      count++
    }
    return {
      output: truncated + "…",
      overflow: true,
    }
  }

  return { output: [...lines.slice(0, maxLines), "…"].join("\n"), overflow: true }
}
