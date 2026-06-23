import { Agent } from "@opencode-ai/model/agent"
import { Location } from "@opencode-ai/model/location"
import { Model } from "@opencode-ai/model/model"
import { Project } from "@opencode-ai/model/project"
import { AbsolutePath, PositiveInt, RelativePath } from "@opencode-ai/model/schema"
import { Session } from "@opencode-ai/model/session"
import { SessionInput } from "@opencode-ai/model/session-input"
import { SessionMessage } from "@opencode-ai/model/session-message"
import { Prompt } from "@opencode-ai/model/prompt"
import { Workspace } from "@opencode-ai/model/workspace"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import {
  ConflictError,
  InvalidCursorError,
  InvalidRequestError,
  ServiceUnavailableError,
  SessionNotFoundError,
  UnauthorizedError,
  UnknownError,
} from "./errors"
import { SessionLocationMiddleware } from "./middleware/session-location"
import { SessionsCursor } from "./session-cursor"

export { SessionsCursor } from "./session-cursor"

export const SessionsQuery = Schema.Struct({
  workspace: Workspace.ID.pipe(Schema.optional),
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional).annotate({
    description: "Maximum number of sessions to return. Defaults to the newest 50 sessions.",
  }),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional).annotate({
    description: "Session order for the first page. Use desc for newest first or asc for oldest first.",
  }),
  search: Schema.String.pipe(Schema.optional),
  directory: AbsolutePath.pipe(Schema.optional),
  project: Project.ID.pipe(Schema.optional),
  subpath: RelativePath.pipe(Schema.optional),
  cursor: SessionsCursor.pipe(Schema.optional),
}).annotate({ identifier: "SessionsQuery" })

export const SessionGroup = HttpApiGroup.make("server.session")
  .add(
    HttpApiEndpoint.get("session.list", "/api/session", {
      query: SessionsQuery,
      success: Schema.Struct({
        data: Schema.Array(Session.Info),
        cursor: Schema.Struct({
          previous: SessionsCursor.pipe(Schema.optional),
          next: SessionsCursor.pipe(Schema.optional),
        }),
      }).annotate({ identifier: "SessionsResponse" }),
      error: [InvalidCursorError, InvalidRequestError, UnauthorizedError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.session.list",
        summary: "List sessions",
        description:
          "Retrieve sessions in the requested order. Items keep that order across pages; use cursor.next or cursor.previous to move through the ordered list.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("session.create", "/api/session", {
      payload: Schema.Struct({
        id: Session.ID.pipe(Schema.optional),
        agent: Agent.ID.pipe(Schema.optional),
        model: Model.Ref.pipe(Schema.optional),
        location: Location.Ref.pipe(Schema.optional),
      }),
      success: Schema.Struct({ data: Session.Info }),
      error: [InvalidRequestError, UnauthorizedError],
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.session.create",
        summary: "Create session",
        description: "Create a session at the requested location.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("session.get", "/api/session/:sessionID", {
      params: { sessionID: Session.ID },
      success: Schema.Struct({ data: Session.Info }),
      error: [InvalidRequestError, SessionNotFoundError, UnauthorizedError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.get",
          summary: "Get session",
          description: "Retrieve a session by ID.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("session.switchAgent", "/api/session/:sessionID/agent", {
      params: { sessionID: Session.ID },
      payload: Schema.Struct({ agent: Agent.ID }),
      success: HttpApiSchema.NoContent,
      error: [InvalidRequestError, SessionNotFoundError, UnauthorizedError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.switchAgent",
          summary: "Switch session agent",
          description: "Switch the agent used by subsequent provider turns.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("session.switchModel", "/api/session/:sessionID/model", {
      params: { sessionID: Session.ID },
      payload: Schema.Struct({ model: Model.Ref }),
      success: HttpApiSchema.NoContent,
      error: [InvalidRequestError, SessionNotFoundError, UnauthorizedError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.switchModel",
          summary: "Switch session model",
          description: "Switch the model used by subsequent provider turns.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("session.prompt", "/api/session/:sessionID/prompt", {
      params: { sessionID: Session.ID },
      payload: Schema.Struct({
        id: SessionMessage.ID.pipe(Schema.optional),
        prompt: Prompt,
        delivery: SessionInput.Delivery.pipe(Schema.optional),
        resume: Schema.Boolean.pipe(Schema.optional),
      }),
      success: Schema.Struct({ data: SessionInput.Admitted }),
      error: [ConflictError, InvalidRequestError, SessionNotFoundError, UnauthorizedError],
    })
      .middleware(SessionLocationMiddleware)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.session.prompt",
          summary: "Send message",
          description: "Durably admit one session input and schedule agent-loop execution unless resume is false.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("session.compact", "/api/session/:sessionID/compact", {
      params: { sessionID: Session.ID },
      success: HttpApiSchema.NoContent,
      error: [SessionNotFoundError, ServiceUnavailableError, UnauthorizedError],
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
      params: { sessionID: Session.ID },
      success: HttpApiSchema.NoContent,
      error: [SessionNotFoundError, ServiceUnavailableError, UnauthorizedError],
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
      params: { sessionID: Session.ID },
      success: Schema.Struct({ data: Schema.Array(SessionMessage.Message) }),
      error: [SessionNotFoundError, UnauthorizedError, UnknownError],
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
  .annotateMerge(OpenApi.annotations({ title: "sessions", description: "Experimental session routes." }))
