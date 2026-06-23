import { ProjectV2 } from "@opencode-ai/core/project"
import { AbsolutePath, PositiveInt, RelativePath, withStatics } from "@opencode-ai/core/schema"
import { SessionV2 } from "@opencode-ai/core/session"
import { WorkspaceV2 } from "@opencode-ai/core/workspace"
import { Schema, Struct } from "effect"

const fields = {
  workspace: WorkspaceV2.ID.pipe(Schema.optional),
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt), Schema.optional),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional),
}
const withCursor = <Fields extends Schema.Struct.Fields>(schema: Schema.Struct<Fields>) =>
  schema.mapFields((value) => ({
    ...Struct.omit(value, ["limit"]),
    anchor: SessionV2.ListAnchor,
  }))
const input = Schema.Union([
  withCursor(Schema.Struct({ ...fields, directory: AbsolutePath })),
  withCursor(Schema.Struct({ ...fields, project: ProjectV2.ID, subpath: RelativePath.pipe(Schema.optional) })),
  withCursor(Schema.Struct(fields)),
])
const json = Schema.fromJsonString(input)
const encode = Schema.encodeSync(json)
const decode = Schema.decodeUnknownEffect(json)

export const SessionsCursor = Schema.String.pipe(
  Schema.brand("SessionsCursor"),
  withStatics((schema) => {
    const make = Schema.decodeUnknownSync(schema)
    return {
      make: (value: typeof input.Type) => make(Buffer.from(encode(value)).toString("base64url")),
      parse: (value: string) => decode(Buffer.from(value, "base64url").toString("utf8")),
    }
  }),
)
