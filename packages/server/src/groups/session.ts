import { SessionV2 } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { ServiceUnavailableError, SessionNotFoundError, UnauthorizedError, UnknownError } from "../errors"
import { SessionLocationMiddleware } from "../middleware/session-location"
import {
  SessionsCreate,
  SessionsGet,
  SessionsList,
  SessionsPrompt,
  SessionsSwitchAgent,
  SessionsSwitchModel,
} from "./session-endpoints"

export { SessionsQuery } from "./session-endpoints"
export { SessionsCursor } from "../session-cursor"

export const SessionGroup = HttpApiGroup.make("server.session")
  .add(SessionsList)
  .add(SessionsCreate)
  .add(SessionsGet.middleware(SessionLocationMiddleware))
  .add(SessionsSwitchAgent.middleware(SessionLocationMiddleware))
  .add(SessionsSwitchModel.middleware(SessionLocationMiddleware))
  .add(SessionsPrompt.middleware(SessionLocationMiddleware))
  .add(
    HttpApiEndpoint.post("session.compact", "/api/session/:sessionID/compact", {
      params: { sessionID: SessionV2.ID },
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
      params: { sessionID: SessionV2.ID },
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
      params: { sessionID: SessionV2.ID },
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
  .annotateMerge(
    OpenApi.annotations({
      title: "sessions",
      description: "Experimental session routes.",
    }),
  )
