import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionV2 } from "@opencode-ai/core/session"
import { ProjectV2 } from "@opencode-ai/core/project"
import { AbsolutePath, PositiveInt, RelativePath, withStatics } from "@opencode-ai/core/schema"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { Schema, Struct } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ServiceUnavailableError, SessionNotFoundError, UnknownError } from "../errors"
import { SessionLocationMiddleware } from "../middleware/session-location"

const SessionsQueryFields = {
  workspace: WorkspaceV2.ID.pipe(Schema.optional),
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional).annotate({
    description: "Maximum number of sessions to return. Defaults to the newest 50 sessions.",
  }),
  order: Schema.optional(Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")])).annotate({
    description: "Session order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  search: Schema.optional(Schema.String),
}

const SessionsDirectoryQuery = Schema.Struct({
  ...SessionsQueryFields,
  directory: AbsolutePath,
})

const SessionsProjectQuery = Schema.Struct({
  ...SessionsQueryFields,
  project: ProjectV2.ID,
  subpath: RelativePath.pipe(Schema.optional),
})

const SessionsAllQuery = Schema.Struct(SessionsQueryFields)

const withCursor = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>) =>
  schema.mapFields((fields) => ({
    ...Struct.omit(fields, ["limit"]),
    anchor: SessionV2.ListAnchor,
  }))

const SessionsCursorInput = Schema.Union([
  withCursor(SessionsDirectoryQuery),
  withCursor(SessionsProjectQuery),
  withCursor(SessionsAllQuery),
])
const SessionsCursorJson = Schema.fromJsonString(SessionsCursorInput)
const encodeSessionsCursor = Schema.encodeSync(SessionsCursorJson)
const decodeSessionsCursor = Schema.decodeUnknownEffect(SessionsCursorJson)

export const SessionsCursor = Schema.String.pipe(
  Schema.brand("SessionsCursor"),
  withStatics((schema) => {
    return {
      make: (input: typeof SessionsCursorInput.Type) =>
        schema.make(Buffer.from(encodeSessionsCursor(input)).toString("base64url")),
      parse: (input: string) => decodeSessionsCursor(Buffer.from(input, "base64url").toString("utf8")),
    }
  }),
)
export type SessionsCursor = typeof SessionsCursor.Type

export const SessionGroup = HttpApiGroup.make("server.session")
  .add(
    HttpApiEndpoint.post("session.compact", "/api/session/:sessionID/compact", {
      params: { sessionID: SessionV2.ID },
      success: HttpApiSchema.NoContent,
      error: [SessionNotFoundError, ServiceUnavailableError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.compact",
          summary: "Compact session",
          description: "Compact a session conversation.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("session.wait", "/api/session/:sessionID/wait", {
      params: { sessionID: SessionV2.ID },
      success: HttpApiSchema.NoContent,
      error: [SessionNotFoundError, ServiceUnavailableError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.wait",
          summary: "Wait for session",
          description: "Wait for a session agent loop to become idle.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("session.context", "/api/session/:sessionID/context", {
      params: { sessionID: SessionV2.ID },
      success: Schema.Struct({ data: Schema.Array(SessionMessage.Message) }),
      error: [SessionNotFoundError, UnknownError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.context",
          summary: "Get session context",
          description: "Retrieve the active context messages for a session (all messages after the last compaction).",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "sessions",
      description: "Experimental session routes.",
    }),
  )
