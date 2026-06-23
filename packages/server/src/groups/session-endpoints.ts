import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidCursorError, InvalidRequestError, SessionNotFoundError } from "../errors"

export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(Schema.brand("SessionID"))
export const AgentID = Schema.String.pipe(Schema.brand("AgentV2.ID"))
export const ModelRef = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("ModelV2.ID")),
  providerID: Schema.String.pipe(Schema.brand("ProviderV2.ID")),
  variant: Schema.String.pipe(Schema.brand("VariantID"), Schema.optional),
})
export const LocationRef = Schema.Struct({
  directory: Schema.String.pipe(Schema.brand("AbsolutePath")),
  workspaceID: Schema.String.check(Schema.isStartsWith("wrk")).pipe(Schema.brand("WorkspaceV2.ID"), Schema.optional),
})
export const Session = Schema.Struct({
  id: SessionID,
  parentID: SessionID.pipe(Schema.optional),
  projectID: Schema.String.pipe(Schema.brand("Project.ID")),
  agent: AgentID.pipe(Schema.optional),
  model: ModelRef.pipe(Schema.optional),
  cost: Schema.Finite,
  tokens: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    reasoning: Schema.Finite,
    cache: Schema.Struct({
      read: Schema.Finite,
      write: Schema.Finite,
    }),
  }),
  time: Schema.Struct({
    created: Schema.DateTimeUtcFromMillis,
    updated: Schema.DateTimeUtcFromMillis,
    archived: Schema.DateTimeUtcFromMillis.pipe(Schema.optional),
  }),
  title: Schema.String,
  location: LocationRef,
  subpath: Schema.String.pipe(Schema.brand("RelativePath"), Schema.optional),
})
export const Prompt = Schema.Struct({
  text: Schema.String,
  files: Schema.Array(
    Schema.Struct({
      uri: Schema.String,
      mime: Schema.String,
      name: Schema.String.pipe(Schema.optional),
      description: Schema.String.pipe(Schema.optional),
      source: Schema.Struct({
        start: Schema.Finite,
        end: Schema.Finite,
        text: Schema.String,
      }).pipe(Schema.optional),
    }),
  ).pipe(Schema.optional),
  agents: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      source: Schema.Struct({
        start: Schema.Finite,
        end: Schema.Finite,
        text: Schema.String,
      }).pipe(Schema.optional),
    }),
  ).pipe(Schema.optional),
})
export const MessageID = Schema.String.check(Schema.isStartsWith("msg_")).pipe(Schema.brand("Session.Message.ID"))
export const Delivery = Schema.Literals(["steer", "queue"])
export const Admission = Schema.Struct({
  admittedSeq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  id: MessageID,
  sessionID: SessionID,
  prompt: Prompt,
  delivery: Delivery,
  timeCreated: Schema.DateTimeUtcFromMillis,
  promotedSeq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.optional),
})

export const SessionsCursor = Schema.String.pipe(Schema.brand("SessionsCursor"))
export const SessionsQuery = Schema.Struct({
  workspace: Schema.String.check(Schema.isStartsWith("wrk")).pipe(Schema.brand("WorkspaceV2.ID"), Schema.optional),
  limit: Schema.NumberFromString.pipe(
    Schema.decodeTo(Schema.Int.check(Schema.isGreaterThan(0))),
    Schema.optional,
  ).annotate({ description: "Maximum number of sessions to return. Defaults to the newest 50 sessions." }),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional).annotate({
    description: "Session order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  search: Schema.String.pipe(Schema.optional),
  directory: Schema.String.pipe(Schema.brand("AbsolutePath"), Schema.optional),
  project: Schema.String.pipe(Schema.brand("Project.ID"), Schema.optional),
  subpath: Schema.String.pipe(Schema.brand("RelativePath"), Schema.optional),
  cursor: SessionsCursor.pipe(Schema.optional),
})

export const SessionsList = HttpApiEndpoint.get("list", "/api/session", {
  query: SessionsQuery,
  success: Schema.Struct({
    data: Schema.Array(Session),
    cursor: Schema.Struct({
      previous: SessionsCursor.pipe(Schema.optional),
      next: SessionsCursor.pipe(Schema.optional),
    }),
  }),
  error: [InvalidCursorError, InvalidRequestError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "v2.session.list",
    summary: "List sessions",
    description: "Retrieve an ordered page of sessions.",
  }),
)

export const SessionsCreate = HttpApiEndpoint.post("create", "/api/session", {
  payload: Schema.Struct({
    id: SessionID.pipe(Schema.optional),
    agent: AgentID.pipe(Schema.optional),
    model: ModelRef.pipe(Schema.optional),
    location: LocationRef.pipe(Schema.optional),
  }),
  success: Schema.Struct({ data: Session }),
}).annotateMerge(
  OpenApi.annotations({
    identifier: "v2.session.create",
    summary: "Create session",
    description: "Create a session at the requested location.",
  }),
)

export const SessionsGet = HttpApiEndpoint.get("get", "/api/session/:sessionID", {
  params: { sessionID: SessionID },
  success: Schema.Struct({ data: Session }),
  error: SessionNotFoundError,
}).annotateMerge(
  OpenApi.annotations({
    identifier: "v2.session.get",
    summary: "Get session",
    description: "Retrieve a session by ID.",
  }),
)

export const SessionsSwitchAgent = HttpApiEndpoint.post("switchAgent", "/api/session/:sessionID/agent", {
  params: { sessionID: SessionID },
  payload: Schema.Struct({ agent: AgentID }),
  success: HttpApiSchema.NoContent,
  error: SessionNotFoundError,
}).annotateMerge(
  OpenApi.annotations({
    identifier: "v2.session.switchAgent",
    summary: "Switch session agent",
    description: "Switch the agent used by subsequent session activity.",
  }),
)

export const SessionsSwitchModel = HttpApiEndpoint.post("switchModel", "/api/session/:sessionID/model", {
  params: { sessionID: SessionID },
  payload: Schema.Struct({ model: ModelRef }),
  success: HttpApiSchema.NoContent,
  error: SessionNotFoundError,
}).annotateMerge(
  OpenApi.annotations({
    identifier: "v2.session.switchModel",
    summary: "Switch session model",
    description: "Switch the model used by subsequent session activity.",
  }),
)

export const SessionsPrompt = HttpApiEndpoint.post("prompt", "/api/session/:sessionID/prompt", {
  params: { sessionID: SessionID },
  payload: Schema.Struct({
    id: MessageID.pipe(Schema.optional),
    prompt: Prompt,
    delivery: Delivery.pipe(Schema.optional),
    resume: Schema.Boolean.pipe(Schema.optional),
  }),
  success: Schema.Struct({ data: Admission }),
  error: [ConflictError, SessionNotFoundError],
}).annotateMerge(
  OpenApi.annotations({
    identifier: "v2.session.prompt",
    summary: "Send prompt",
    description: "Durably admit one session input and schedule execution unless resume is false.",
  }),
)
