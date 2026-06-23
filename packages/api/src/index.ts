import { DateTime, Option, Schema, SchemaGetter } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"

export const SessionID = Schema.String.check(Schema.isStartsWith("ses")).pipe(Schema.brand("SessionID"))
export type SessionID = typeof SessionID.Type

const ProjectID = Schema.String.pipe(Schema.brand("Project.ID"))
export const AgentID = Schema.String.pipe(Schema.brand("AgentV2.ID"))
const ModelID = Schema.String.pipe(Schema.brand("ModelV2.ID"))
const ProviderID = Schema.String.pipe(Schema.brand("ProviderV2.ID"))
const VariantID = Schema.String.pipe(Schema.brand("VariantID"))
export const AbsolutePath = Schema.String.pipe(Schema.brand("AbsolutePath"))
const RelativePath = Schema.String.pipe(Schema.brand("RelativePath"))
const WorkspaceID = Schema.String.check(Schema.isStartsWith("wrk")).pipe(Schema.brand("WorkspaceV2.ID"))
export const MessageID = Schema.String.check(Schema.isStartsWith("msg_")).pipe(Schema.brand("Session.Message.ID"))
export const ModelRef = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  variant: VariantID.pipe(Schema.optional),
})
export const LocationRef = Schema.Struct({
  directory: AbsolutePath,
  workspaceID: WorkspaceID.pipe(Schema.optional),
})
const DateTimeUtcFromMillis = Schema.Finite.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((value) => DateTime.makeUnsafe(value)),
    encode: SchemaGetter.transform((value) => DateTime.toEpochMillis(value)),
  }),
)
const optionalOmitUndefined = <S extends Schema.Top>(schema: S) =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.optional(schema), {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.transformOptional(Option.filter((value) => value !== undefined)),
    }),
  )

export const Session = Schema.Struct({
  id: SessionID,
  parentID: optionalOmitUndefined(SessionID),
  projectID: ProjectID,
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
    created: DateTimeUtcFromMillis,
    updated: DateTimeUtcFromMillis,
    archived: DateTimeUtcFromMillis.pipe(Schema.optional),
  }),
  title: Schema.String,
  location: LocationRef,
  subpath: RelativePath.pipe(Schema.optional),
})
export type Session = typeof Session.Type

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

export const Delivery = Schema.Literals(["steer", "queue"])

export const Admission = Schema.Struct({
  admittedSeq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  id: MessageID,
  sessionID: SessionID,
  prompt: Prompt,
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  promotedSeq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(Schema.optional),
})

export const SessionsCursor = Schema.String.pipe(Schema.brand("SessionsCursor"))

export const SessionsQuery = Schema.Struct({
  workspace: WorkspaceID.pipe(Schema.optional),
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(Schema.Int.check(Schema.isGreaterThan(0))), Schema.optional),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional),
  directory: AbsolutePath.pipe(Schema.optional),
  project: ProjectID.pipe(Schema.optional),
  subpath: RelativePath.pipe(Schema.optional),
  cursor: SessionsCursor.pipe(Schema.optional),
})

export class SessionNotFoundError extends Schema.TaggedErrorClass<SessionNotFoundError>()(
  "SessionNotFoundError",
  {
    sessionID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export class InvalidCursorError extends Schema.TaggedErrorClass<InvalidCursorError>()(
  "InvalidCursorError",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()(
  "InvalidRequestError",
  {
    message: Schema.String,
    kind: Schema.String.pipe(Schema.optional),
    field: Schema.String.pipe(Schema.optional),
  },
  { httpApiStatus: 400 },
) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
    resource: Schema.String.pipe(Schema.optional),
  },
  { httpApiStatus: 409 },
) {}

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
    identifier: "sessions.list",
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
    identifier: "sessions.create",
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
    identifier: "sessions.get",
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
    identifier: "sessions.switchAgent",
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
    identifier: "sessions.switchModel",
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
    identifier: "sessions.prompt",
    summary: "Send prompt",
    description: "Durably admit one session input and schedule execution unless resume is false.",
  }),
)

export const SessionsGroup = HttpApiGroup.make("sessions")
  .add(SessionsList)
  .add(SessionsCreate)
  .add(SessionsGet)
  .add(SessionsSwitchAgent)
  .add(SessionsSwitchModel)
  .add(SessionsPrompt)
  .annotateMerge(
    OpenApi.annotations({
      title: "sessions",
      description: "OpenCode sessions.",
    }),
  )

export const Api = HttpApi.make("opencode").add(SessionsGroup)
