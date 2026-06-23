import { AbsolutePath, PositiveInt, RelativePath } from "@opencode-ai/schema/schema"
import { Project } from "@opencode-ai/schema/project"
import { Session } from "@opencode-ai/schema/session"
import { Workspace } from "@opencode-ai/schema/workspace"
import { Effect, Encoding, Schema, Struct } from "effect"

const fields = {
  workspace: Workspace.ID.pipe(Schema.optional),
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional),
}
const withCursor = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>) =>
  schema.mapFields((value) => ({ ...Struct.omit(value, ["limit"]), anchor: Session.ListAnchor }))
const input = Schema.Union([
  withCursor(Schema.Struct({ ...fields, directory: AbsolutePath })),
  withCursor(Schema.Struct({ ...fields, project: Project.ID, subpath: RelativePath.pipe(Schema.optional) })),
  withCursor(Schema.Struct(fields)),
])
const json = Schema.fromJsonString(input)
const encode = Schema.encodeSync(json)
const decode = Schema.decodeUnknownEffect(json)

const schema = Schema.String.pipe(Schema.brand("SessionsCursor"))
const make = Schema.decodeUnknownSync(schema)
export const SessionsCursor = Object.assign(schema, {
  make: (value: typeof input.Type) => make(Encoding.encodeBase64Url(encode(value))),
  parse: (value: string) => Effect.fromResult(Encoding.decodeBase64UrlString(value)).pipe(Effect.flatMap(decode)),
})
export type SessionsCursor = typeof SessionsCursor.Type
