export * as Session from "./session"

import { Schema } from "effect"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { Agent } from "./agent"
import { Location } from "./location"
import { Model } from "./model"
import { Project } from "./project"
import { DateTimeUtcFromMillis, optionalOmitUndefined, RelativePath } from "./schema"
import { withStatics } from "./schema"
import { descending } from "./identifier"

export interface ExternalID {
  readonly namespace: string
  readonly key: string
}

export const ID = Schema.String.check(Schema.isStartsWith("ses")).pipe(
  Schema.brand("SessionID"),
  withStatics((schema) => {
    const create = () => schema.make("ses_" + descending())
    return {
      create,
      descending: (id?: string) => (id === undefined ? create() : schema.make(id)),
      fromExternal: (input: ExternalID) =>
        schema.make(
          "ses_" + bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([input.namespace, input.key])))),
        ),
    }
  }),
)
export type ID = typeof ID.Type

export class Info extends Schema.Class<Info>("SessionV2.Info")({
  id: ID,
  parentID: ID.pipe(optionalOmitUndefined),
  projectID: Project.ID,
  agent: Agent.ID.pipe(Schema.optional),
  model: Model.Ref.pipe(Schema.optional),
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
  location: Location.Ref,
  subpath: RelativePath.pipe(Schema.optional),
}) {}

export const ListAnchor = Schema.Struct({
  id: ID,
  time: Schema.Finite,
  direction: Schema.Literals(["previous", "next"]),
})
export type ListAnchor = typeof ListAnchor.Type
