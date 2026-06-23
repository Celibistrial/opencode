import { expect, test } from "bun:test"
import { DateTime, Effect } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { AbsolutePath, AgentV2, Location, ModelV2, OpenCode, Prompt, SessionInput, SessionV2 } from "../src/effect"

test("sessions.get returns the decoded Effect projection", async () => {
  const httpClient = HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(session))),
  )
  const result = await Effect.gen(function* () {
    const client = yield* OpenCode.make({ baseUrl: "http://localhost:3000" })
    return yield* client.sessions.get({ sessionID: SessionV2.ID.make("ses_test") })
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(DateTime.toEpochMillis(result.time.created)).toBe(1_717_171_717_000)
})

test("session methods retain decoded Effect inputs and outputs", async () => {
  const httpClient = HttpClient.make((request) => {
    const url = request.url
    if (url.includes("/prompt")) {
      return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(admission)))
    }
    if (url.includes("/context")) {
      return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ data: [] })))
    }
    if (request.method === "POST" && url.endsWith("/api/session")) {
      return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(session)))
    }
    if (request.method === "POST") {
      return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
    }
    return Effect.succeed(
      HttpClientResponse.fromWeb(request, Response.json({ data: [session.data], cursor: { next: "next" } })),
    )
  })
  const result = await Effect.gen(function* () {
    const client = yield* OpenCode.make({ baseUrl: "http://localhost:3000" })
    const page = yield* client.sessions.list({ limit: 10 })
    const created = yield* client.sessions.create({
      location: Location.Ref.make({ directory: AbsolutePath.make("/tmp/project") }),
    })
    yield* client.sessions.switchAgent({ sessionID: SessionV2.ID.make("ses_test"), agent: AgentV2.ID.make("build") })
    yield* client.sessions.switchModel({
      sessionID: SessionV2.ID.make("ses_test"),
      model: ModelV2.Ref.make({ id: "claude", providerID: "anthropic" }),
    })
    const admitted = yield* client.sessions.prompt({
      sessionID: SessionV2.ID.make("ses_test"),
      prompt: new Prompt({ text: "Hello" }),
      resume: false,
    })
    yield* client.sessions.compact({ sessionID: SessionV2.ID.make("ses_test") })
    yield* client.sessions.wait({ sessionID: SessionV2.ID.make("ses_test") })
    const context = yield* client.sessions.context({ sessionID: SessionV2.ID.make("ses_test") })
    return { page, created, admitted, context }
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(DateTime.toEpochMillis(result.page.data[0].time.created)).toBe(1_717_171_717_000)
  expect(result.page.data[0]).toBeInstanceOf(SessionV2.Info)
  expect(result.created).toBeInstanceOf(SessionV2.Info)
  expect(result.created.id).toBe("ses_test")
  expect(result.admitted).toBeInstanceOf(SessionInput.Admitted)
  expect(result.admitted.prompt).toBeInstanceOf(Prompt)
  expect(DateTime.toEpochMillis(result.admitted.timeCreated)).toBe(1_717_171_717_000)
  expect(result.context).toEqual([])
})

const session = {
  data: {
    id: "ses_test",
    projectID: "project",
    cost: 0,
    tokens: {
      input: 1,
      output: 2,
      reasoning: 3,
      cache: { read: 4, write: 5 },
    },
    time: {
      created: 1_717_171_717_000,
      updated: 1_717_171_717_000,
    },
    title: "Test",
    location: { directory: "/tmp/project" },
  },
}

const admission = {
  data: {
    admittedSeq: 0,
    id: "msg_test",
    sessionID: "ses_test",
    prompt: { text: "Hello" },
    delivery: "steer",
    timeCreated: 1_717_171_717_000,
  },
}
