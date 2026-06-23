export * as Location from "./location"

import { Effect, Schema } from "effect"
import { AbsolutePath } from "./schema"
import { Workspace } from "./workspace"

export class Ref extends Schema.Class<Ref>("Location.Ref")({
  directory: AbsolutePath,
  workspaceID: Schema.optional(Workspace.ID).pipe(Schema.withConstructorDefault(Effect.succeed(undefined))),
}) {}
