import { Database } from "@opencode-ai/core/database/database"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { SessionLocationMiddleware } from "@opencode-ai/protocol/middleware/session-location"
import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError, SessionNotFoundError } from "../errors"
import type { LocationServices } from "../groups/location"

export { SessionLocationMiddleware }

export class SessionLocationServicesMiddleware extends HttpApiMiddleware.Service<
  SessionLocationServicesMiddleware,
  {
    provides: LocationServices
  }
>()("@opencode/HttpApiSessionLocationServices", {
  error: [InvalidRequestError, SessionNotFoundError],
}) {}

const decodeSessionID = Schema.decodeUnknownEffect(SessionV2.ID)

const resolver = Effect.gen(function* () {
  const { db } = yield* Database.Service
  const locations = yield* LocationServiceMap

  return Effect.fnUntraced(function* () {
    const route = yield* HttpRouter.RouteContext
    const sessionID = yield* decodeSessionID(route.params.sessionID).pipe(
      Effect.mapError(
        () =>
          new InvalidRequestError({
            message: "Invalid session ID",
            field: "sessionID",
          }),
      ),
    )
    const row = yield* db
      .select({ directory: SessionTable.directory, workspaceID: SessionTable.workspace_id })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(Effect.orDie)
    if (!row)
      return yield* new SessionNotFoundError({
        sessionID,
        message: `Session not found: ${sessionID}`,
      })

    return locations.get(
      Location.Ref.make({
        directory: AbsolutePath.make(row.directory),
        workspaceID: row.workspaceID ? WorkspaceV2.ID.make(row.workspaceID) : undefined,
      }),
    )
  })
})

export const sessionLocationLayer = Layer.effect(
  SessionLocationMiddleware,
  resolver.pipe(
    Effect.map((resolve) =>
      SessionLocationMiddleware.of((effect) =>
        Effect.gen(function* () {
          const location = yield* resolve()
          return yield* effect.pipe(Effect.provide(location))
        }),
      ),
    ),
  ),
)

export const sessionLocationServicesLayer = Layer.effect(
  SessionLocationServicesMiddleware,
  resolver.pipe(
    Effect.map((resolve) =>
      SessionLocationServicesMiddleware.of((effect) =>
        Effect.gen(function* () {
          const location = yield* resolve()
          return yield* effect.pipe(Effect.provide(location))
        }),
      ),
    ),
  ),
)
