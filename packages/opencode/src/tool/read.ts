import { Effect, Option, Schema, Scope, Stream } from "effect"
import { NonNegativeInt } from "@opencode-ai/core/schema"
import * as path from "path"
import * as Tool from "./tool"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { LSP } from "@/lsp/lsp"
import DESCRIPTION from "./read.txt"
import { InstanceState } from "@/effect/instance-state"
import { assertExternalDirectoryEffect } from "./external-directory"
import { Instruction } from "../session/instruction"
import { isPdfAttachment, sniffAttachmentMime } from "@/util/media"

const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
// Upper bound on how many characters of a single (newline-free) line we ever
// accumulate. Any characters past MAX_LINE_LENGTH are truncated away before
// output anyway, so we keep exactly one extra character — enough for the
// `text.length > MAX_LINE_LENGTH` check below to still fire and append the
// truncation suffix — and drop the rest as they stream in. This bounds memory
// for pathological files with no newlines (e.g. a minified/one-line bundle)
// without changing output for any line up to this length.
const MAX_LINE_ACCUMULATE = MAX_LINE_LENGTH + 1
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`
const MAX_BYTES = 50 * 1024
const MAX_BYTES_LABEL = `${MAX_BYTES / 1024} KB`
const SAMPLE_BYTES = 4096
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

class ReadStop extends Schema.TaggedErrorClass<ReadStop>()("ReadStop", {}) {}

// `offset` and `limit` were originally `z.coerce.number()` — the runtime
// coercion was useful when the tool was called from a shell but serves no
// purpose in the LLM tool-call path (the model emits typed JSON). The JSON
// Schema output is identical (`type: "number"`), so the LLM view is
// unchanged; purely CLI-facing uses must now send numbers rather than strings.
export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(NonNegativeInt).annotate({
    description: "The line number to start reading from (1-indexed)",
  }),
  limit: Schema.optional(NonNegativeInt).annotate({
    description: "The maximum number of lines to read (defaults to 2000)",
  }),
})

type Display =
  | {
      type: "directory"
      path: string
      entries: string[]
      offset: number
      totalEntries: number
      truncated: boolean
    }
  | {
      type: "file"
      path: string
      text: string
      lineStart: number
      lineEnd: number
      totalLines: number
      truncated: boolean
    }

type Metadata = {
  preview: string
  truncated: boolean
  loaded: string[]
  display?: Display
}

export const ReadTool = Tool.define<
  typeof Parameters,
  Metadata,
  FSUtil.Service | Instruction.Service | LSP.Service | Scope.Scope
>(
  "read",
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const instruction = yield* Instruction.Service
    const lsp = yield* LSP.Service
    const scope = yield* Scope.Scope

    const miss = Effect.fn("ReadTool.miss")(function* (filepath: string) {
      const dir = path.dirname(filepath)
      const base = path.basename(filepath)
      const items = yield* fs.readDirectory(dir).pipe(
        Effect.map((items) =>
          items
            .filter(
              (item) =>
                item.toLowerCase().includes(base.toLowerCase()) || base.toLowerCase().includes(item.toLowerCase()),
            )
            .map((item) => path.join(dir, item))
            .slice(0, 3),
        ),
        Effect.catch(() => Effect.succeed([] as string[])),
      )

      if (items.length > 0) {
        return yield* Effect.fail(
          new Error(`File not found: ${filepath}\n\nDid you mean one of these?\n${items.join("\n")}`),
        )
      }

      return yield* Effect.fail(new Error(`File not found: ${filepath}`))
    })

    const list = Effect.fn("ReadTool.list")(function* (filepath: string) {
      const items = yield* fs.readDirectoryEntries(filepath)
      return yield* Effect.forEach(
        items,
        Effect.fnUntraced(function* (item) {
          if (item.type === "directory") return item.name + "/"
          if (item.type !== "symlink") return item.name

          const target = yield* fs.stat(path.join(filepath, item.name)).pipe(Effect.catch(() => Effect.void))
          if (target?.type === "Directory") return item.name + "/"
          return item.name
        }),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((items: string[]) => items.sort((a, b) => a.localeCompare(b))))
    })

    const warm = Effect.fn("ReadTool.warm")(function* (filepath: string) {
      // LSP warm-up is optional; do not let a background defect fail an otherwise successful read.
      yield* lsp.touchFile(filepath).pipe(Effect.ignoreCause, Effect.forkIn(scope))
    })

    const readSample = Effect.fn("ReadTool.readSample")(function* (
      filepath: string,
      fileSize: number,
      sampleSize: number,
    ) {
      if (fileSize === 0) return new Uint8Array()

      return yield* Effect.scoped(
        Effect.gen(function* () {
          const file = yield* fs.open(filepath, { flag: "r" })
          return Option.getOrElse(yield* file.readAlloc(Math.min(sampleSize, fileSize)), () => new Uint8Array())
        }),
      )
    })

    const lines = Effect.fn("ReadTool.lines")(function* (filepath: string, opts: { limit: number; offset: number }) {
      const start = opts.offset - 1
      const raw: string[] = []
      const flags = { bytes: 0, count: 0, cut: false, more: false, done: false }

      // Note: prefer manual TextDecoder over Stream.decodeText — when the source stream
      // ends without flushing, decodeText drops the final unterminated line. We also
      // avoid Stream.runForEachWhile (it currently swallows the final unterminated
      // line of the upstream splitLines pipeline) and use a tagged error to stop the
      // upstream file stream as soon as the byte cap is reached.
      const decoder = new TextDecoder("utf-8")

      // Bound the size of any single line *before* Stream.splitLines materializes it.
      // splitLines buffers characters until it sees a line boundary, so a file with no (or
      // very sparse) line boundaries would otherwise accumulate the whole line — potentially
      // gigabytes — in memory before the MAX_LINE_LENGTH truncation below ever runs. We track
      // how many characters of the current line have been kept and drop everything past
      // MAX_LINE_ACCUMULATE until the next boundary. The boundary characters themselves
      // ("\n", "\r", and "\r\n" — everything splitLines breaks on) are always passed through
      // untouched, so splitLines produces the exact same lines it would have; only oversized
      // intra-line content (which would be truncated away regardless) is dropped. Output for
      // any line up to MAX_LINE_ACCUMULATE is therefore unchanged.
      let kept = 0
      const capLine = (chunk: string) => {
        if (chunk.length === 0) return chunk
        let out = ""
        let start = 0
        while (start < chunk.length) {
          const cr = chunk.indexOf("\r", start)
          const lf = chunk.indexOf("\n", start)
          const bound = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf)
          const end = bound === -1 ? chunk.length : bound + 1
          const contentLen = (bound === -1 ? end : bound) - start
          if (kept >= MAX_LINE_ACCUMULATE) {
            // Current line already at cap: drop its remaining content, keep the boundary char.
            if (bound !== -1) {
              out += chunk[bound]
              kept = 0
            }
          } else if (kept + contentLen <= MAX_LINE_ACCUMULATE) {
            out += chunk.slice(start, end)
            kept = bound === -1 ? kept + contentLen : 0
          } else {
            out += chunk.slice(start, start + (MAX_LINE_ACCUMULATE - kept))
            if (bound !== -1) {
              out += chunk[bound]
              kept = 0
            } else {
              kept = MAX_LINE_ACCUMULATE
            }
          }
          start = end
        }
        return out
      }

      yield* fs.stream(filepath).pipe(
        Stream.map((bytes) => decoder.decode(bytes, { stream: true })),
        Stream.map(capLine),
        Stream.splitLines,
        Stream.runForEach((text) =>
          Effect.gen(function* () {
            if (flags.done) return yield* new ReadStop()
            flags.count += 1
            if (flags.count <= start) return

            if (raw.length >= opts.limit) {
              flags.more = true
              return
            }

            const line = text.length > MAX_LINE_LENGTH ? text.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX : text
            const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0)
            if (flags.bytes + size <= MAX_BYTES) {
              raw.push(line)
              flags.bytes += size
              return
            }

            flags.cut = true
            flags.more = true
            flags.done = true
            return yield* new ReadStop()
          }),
        ),
        Effect.catchTag("ReadStop", () => Effect.void),
      )

      return { raw, count: flags.count, cut: flags.cut, more: flags.more, offset: opts.offset }
    })

    const isBinaryFile = (filepath: string, bytes: Uint8Array) => {
      const ext = path.extname(filepath).toLowerCase()
      switch (ext) {
        case ".zip":
        case ".tar":
        case ".gz":
        case ".exe":
        case ".dll":
        case ".so":
        case ".class":
        case ".jar":
        case ".war":
        case ".7z":
        case ".doc":
        case ".docx":
        case ".xls":
        case ".xlsx":
        case ".ppt":
        case ".pptx":
        case ".odt":
        case ".ods":
        case ".odp":
        case ".bin":
        case ".dat":
        case ".obj":
        case ".o":
        case ".a":
        case ".lib":
        case ".wasm":
        case ".pyc":
        case ".pyo":
          return true
      }

      if (bytes.length === 0) return false

      let nonPrintableCount = 0
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) return true
        if (bytes[i] < 9 || (bytes[i] > 13 && bytes[i] < 32)) {
          nonPrintableCount++
        }
      }

      return nonPrintableCount / bytes.length > 0.3
    }

    const run = Effect.fn("ReadTool.execute")(function* (
      params: Schema.Schema.Type<typeof Parameters>,
      ctx: Tool.Context<Metadata>,
    ) {
      const instance = yield* InstanceState.context
      let filepath = params.filePath
      if (!path.isAbsolute(filepath)) {
        filepath = path.resolve(instance.directory, filepath)
      }
      if (process.platform === "win32") {
        filepath = FSUtil.normalizePath(filepath)
      }
      const title = path.relative(instance.worktree, filepath)

      const stat = yield* fs.stat(filepath).pipe(
        Effect.catchIf(
          (err) => "reason" in err && err.reason._tag === "NotFound",
          () => Effect.succeed(undefined),
        ),
      )

      yield* assertExternalDirectoryEffect(ctx, filepath, {
        bypass: Boolean(ctx.extra?.["bypassCwdCheck"]),
        kind: stat?.type === "Directory" ? "directory" : "file",
      })

      yield* ctx.ask({
        permission: "read",
        patterns: [path.relative(instance.worktree, filepath)],
        always: ["*"],
        metadata: {},
      })

      if (!stat) return yield* miss(filepath)

      if (stat.type === "Directory") {
        const items = yield* list(filepath)
        const limit = params.limit ?? DEFAULT_READ_LIMIT
        const offset = params.offset || 1
        const start = offset - 1
        const sliced = items.slice(start, start + limit)
        const truncated = start + sliced.length < items.length

        return {
          title,
          output: [
            `<path>${filepath}</path>`,
            `<type>directory</type>`,
            `<entries>`,
            sliced.join("\n"),
            truncated
              ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`
              : `\n(${items.length} entries)`,
            `</entries>`,
          ].join("\n"),
          metadata: {
            preview: sliced.slice(0, 20).join("\n"),
            truncated,
            loaded: [] as string[],
            display: {
              type: "directory" as const,
              path: filepath,
              entries: sliced,
              offset,
              totalEntries: items.length,
              truncated,
            },
          },
        }
      }

      const loaded = yield* instruction.resolve(ctx.messages, filepath, ctx.messageID)
      const sample = yield* readSample(filepath, Number(stat.size), SAMPLE_BYTES)

      const mime = sniffAttachmentMime(sample, FSUtil.mimeType(filepath))
      const isImage = SUPPORTED_IMAGE_MIMES.has(mime)

      if (isImage || isPdfAttachment(mime)) {
        const bytes = yield* fs.readFile(filepath)
        const msg = isPdfAttachment(mime) ? "PDF read successfully" : "Image read successfully"
        return {
          title,
          output: msg,
          metadata: {
            preview: msg,
            truncated: false,
            loaded: loaded.map((item) => item.filepath),
          },
          attachments: [
            {
              type: "file" as const,
              mime,
              url: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
            },
          ],
        }
      }

      if (isBinaryFile(filepath, sample)) {
        return yield* Effect.fail(new Error(`Cannot read binary file: ${filepath}`))
      }

      const file = yield* lines(filepath, { limit: params.limit ?? DEFAULT_READ_LIMIT, offset: params.offset || 1 })
      if (file.count < file.offset && !(file.count === 0 && file.offset === 1)) {
        return yield* Effect.fail(
          new Error(`Offset ${file.offset} is out of range for this file (${file.count} lines)`),
        )
      }

      let output = [`<path>${filepath}</path>`, `<type>file</type>`, "<content>\n"].join("\n")
      output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n")

      const last = file.offset + file.raw.length - 1
      const next = last + 1
      const truncated = file.more || file.cut
      if (file.cut) {
        output += `\n\n(Output capped at ${MAX_BYTES_LABEL}. Showing lines ${file.offset}-${last}. Use offset=${next} to continue.)`
      } else if (file.more) {
        output += `\n\n(Showing lines ${file.offset}-${last} of ${file.count}. Use offset=${next} to continue.)`
      } else {
        output += `\n\n(End of file - total ${file.count} lines)`
      }
      output += "\n</content>"

      yield* warm(filepath)

      if (loaded.length > 0) {
        output += `\n\n<system-reminder>\n${loaded.map((item) => item.content).join("\n\n")}\n</system-reminder>`
      }

      return {
        title,
        output,
        metadata: {
          preview: file.raw.slice(0, 20).join("\n"),
          truncated,
          loaded: loaded.map((item) => item.filepath),
          display: {
            type: "file" as const,
            path: filepath,
            text: file.raw.join("\n"),
            lineStart: file.offset,
            lineEnd: last,
            totalLines: file.count,
            truncated,
          },
        },
      }
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        run(params, ctx).pipe(Effect.orDie),
    }
  }),
)
