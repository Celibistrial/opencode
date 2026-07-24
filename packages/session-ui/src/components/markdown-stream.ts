import { marked, type Tokens } from "marked"
import remend from "remend"

export type Block = {
  raw: string
  src: string
  mode: "full" | "live" | "code"
  language?: string
  complete?: boolean
}

export type Projection = {
  text: string
  blocks: Block[]
}

function refs(text: string) {
  if (!text.includes("]:")) return false
  return /^[ \t]{0,3}\[[^\]]+\]:[ \t]*(?:\S+|\r?\n[ \t]+\S+)/m.test(text)
}

function language(value: string | undefined) {
  return value?.trim().split(/\s+/, 1)[0] || undefined
}

function openCode(raw: string) {
  const newline = raw.indexOf("\n")
  return newline < 0 ? "" : raw.slice(newline + 1)
}

function open(raw: string) {
  const match = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
  if (!match) return false
  const mark = match[1]
  if (!mark) return false
  const char = mark[0]
  const size = mark.length
  const last = raw.trimEnd().split("\n").at(-1)?.trim() ?? ""
  return !new RegExp(`^[\\t ]{0,3}${char}{${size},}[\\t ]*$`).test(last)
}

function closesFence(raw: string, suffix: string) {
  const mark = raw.match(/^[ \t]{0,3}(`{3,}|~{3,})/)?.[1]
  if (!mark) return suffix.includes("```") || suffix.includes("~~~")
  return `${raw.slice(-(mark.length - 1))}${suffix}`.includes(mark)
}

function heal(text: string) {
  return remend(text, { linkMode: "text-only" })
}

export function stream(text: string, live: boolean): Block[] {
  if (!live) return [{ raw: text, src: text, mode: "full" }] satisfies Block[]
  if (refs(text)) return [{ raw: text, src: heal(text), mode: "live" }] satisfies Block[]
  const tokens = marked.lexer(text)
  const tail = tokens.findLastIndex((token) => token.type !== "space")
  if (tail < 0) return [{ raw: text, src: heal(text), mode: "live" }] satisfies Block[]
  const last = tokens[tail]
  if (!last) return [{ raw: text, src: heal(text), mode: "live" }] satisfies Block[]

  const result: Block[] = []
  for (let index = 0; index < tail; index++) {
    const token = tokens[index]
    if (!token || token.type === "space") continue
    let raw = token.raw
    while (tokens[index + 1]?.type === "space" && index + 1 < tail) raw += tokens[++index]!.raw
    if (token.type === "code") {
      const code = token as Tokens.Code
      result.push({ raw, src: code.text, mode: "code", language: language(code.lang), complete: true })
      continue
    }
    result.push({ raw, src: raw, mode: "full" })
  }

  const raw = tokens
    .slice(tail)
    .map((token) => token.raw)
    .join("")
  if (last.type !== "code") return [...result, { raw, src: heal(raw), mode: "live" }]

  const code = last as Tokens.Code
  if (!open(code.raw))
    return [...result, { raw, src: code.text, mode: "code", language: language(code.lang), complete: true }]
  return [...result, { raw, src: openCode(code.raw), mode: "code", language: language(code.lang) }]
}

export function canReusePendingBlock(current: Pick<Block, "mode" | "raw"> | undefined, next: Block) {
  if (!current || current.mode !== next.mode) return false
  if (next.mode === "code") return next.raw.startsWith(current.raw)
  return current.raw === next.raw
}

export function project(previous: Projection | undefined, text: string, live: boolean): Projection {
  if (!live || !previous || !text.startsWith(previous.text)) return { text, blocks: stream(text, live) }
  const suffix = text.slice(previous.text.length)
  if (!suffix) return { text, blocks: previous.blocks }
  const tail = previous.blocks.at(-1)

  // Fast path: an open (unclosed) code fence just grows — append the suffix without re-lexing.
  if (tail?.mode === "code" && !tail.complete && !closesFence(tail.raw, suffix))
    return {
      text,
      blocks: [
        ...previous.blocks.slice(0, -1),
        {
          ...tail,
          raw: tail.raw + suffix,
          src: tail.src + suffix,
        },
      ],
    }

  // Incremental lex: reuse the already-frozen leading blocks and re-lex only the
  // trailing region, instead of running marked.lexer over the whole (growing)
  // message on every delta — the dominant streaming-render cost for long answers.
  //
  // Safety: this only reuses a prefix of blocks whose combined raw ends at a blank
  // line ("\n\n"). A blank line is a hard block boundary in CommonMark — no setext
  // underline, lazy list/blockquote continuation, or paragraph can span it — so
  // lexing the remainder in isolation yields the same tail blocks as lexing the
  // whole text. Reference definitions are the one construct that reaches across
  // boundaries; `refs(text)` already routes those to a single live block, and we
  // additionally bail when refs are present. Frozen code blocks must be complete
  // (an open fence is handled by the fast path above).
  if (!refs(text) && previous.blocks.length > 1) {
    const frozen = previous.blocks.slice(0, -1)
    if (!frozen.some((block) => block.mode === "code" && !block.complete)) {
      const prefix = frozen.reduce((sum, block) => sum + block.raw, "")
      if (prefix.endsWith("\n\n") && text.startsWith(prefix)) {
        return { text, blocks: [...frozen, ...stream(text.slice(prefix.length), live)] }
      }
    }
  }

  return { text, blocks: stream(text, live) }
}
