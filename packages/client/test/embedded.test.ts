import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { AgentID, ModelRef, SessionID } from "@opencode-ai/server/groups/session-endpoints"
import { Effect, Schema } from "effect"

test("embedded client uses the real router and handlers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "opencode-embedded-"))
  const database = Flag.OPENCODE_DB
  Flag.OPENCODE_DB = join(directory, "opencode.sqlite")
  const { OpenCode, Tool } = await import("../src/effect-embedded")
  const sessionID = SessionID.make(`ses_embedded_${crypto.randomUUID()}`)
  const model = ModelRef.make({ id: "embedded", providerID: "test" })

  try {
    const program = Effect.gen(function* () {
      const opencode = yield* OpenCode.create()
      yield* opencode.tools.register({
        embedded_tool: Tool.make({
          description: "Embedded test tool",
          input: Schema.Struct({}),
          output: Schema.Struct({ ok: Schema.Boolean }),
          execute: () => Effect.succeed({ ok: true }),
        }),
      })

      const created = yield* opencode.sessions.create({
        id: sessionID,
        agent: AgentID.make("build"),
        location: { directory: AbsolutePath.make(directory) },
      })
      yield* opencode.sessions.switchModel({ sessionID, model })
      const selected = yield* opencode.sessions.get({ sessionID })
      const page = yield* opencode.sessions.list({ directory: AbsolutePath.make(directory) })
      const admitted = yield* opencode.sessions.prompt({
        sessionID,
        prompt: { text: "Do not run" },
        resume: false,
      })
      const context = yield* opencode.sessions.context({ sessionID })
      const missing = yield* Effect.flip(
        opencode.sessions.get({ sessionID: SessionID.make(`ses_missing_${crypto.randomUUID()}`) }),
      )

      expect(created.id).toBe(sessionID)
      expect(selected.model?.id).toBe(model.id)
      expect(selected.model?.providerID).toBe(model.providerID)
      expect(page.data.some((session) => session.id === sessionID)).toBe(true)
      expect(admitted.sessionID).toBe(sessionID)
      expect(context.some((message) => message.type === "model-switched")).toBe(true)
      expect(missing._tag).toBe("SessionNotFoundError")
    })
    await Effect.runPromise(Effect.scoped(program))
  } finally {
    Flag.OPENCODE_DB = database
    await rm(directory, { recursive: true, force: true })
  }
})

test("embedded client is available as a Layer service", async () => {
  const directory = await mkdtemp(join(tmpdir(), "opencode-embedded-layer-"))
  const database = Flag.OPENCODE_DB
  Flag.OPENCODE_DB = join(directory, "opencode.sqlite")
  const { OpenCode } = await import("../src/effect-embedded")
  const sessionID = SessionID.make(`ses_embedded_${crypto.randomUUID()}`)

  try {
    const created = await Effect.runPromise(
      Effect.gen(function* () {
        const opencode = yield* OpenCode.Service
        return yield* opencode.sessions.create({
          id: sessionID,
          location: { directory: AbsolutePath.make(directory) },
        })
      }).pipe(Effect.provide(OpenCode.layer), Effect.scoped),
    )

    expect(created.id).toBe(sessionID)
  } finally {
    Flag.OPENCODE_DB = database
    await rm(directory, { recursive: true, force: true })
  }
})
