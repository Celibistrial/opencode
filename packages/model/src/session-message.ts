export * as SessionMessage from "./session-message"

import { Schema } from "effect"
import { Model } from "./model"
import { FileAttachment, Prompt } from "./prompt"
import { DateTimeUtcFromMillis, withStatics } from "./schema"
import { Session } from "./session"
import { ascending } from "./identifier"

export const ID = Schema.String.check(Schema.isStartsWith("msg_")).pipe(
  Schema.brand("Session.Message.ID"),
  withStatics((schema) => ({ create: () => schema.make("msg_" + ascending()) })),
)
export type ID = typeof ID.Type

const ProviderMetadata = Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown))
const ToolContent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }).annotate({
    identifier: "Tool.TextContent",
  }),
  Schema.Struct({
    type: Schema.Literal("file"),
    uri: Schema.String,
    mime: Schema.String,
    name: Schema.optional(Schema.String),
  }).annotate({ identifier: "Tool.FileContent" }),
]).pipe(Schema.toTaggedUnion("type"))
const UnknownError = Schema.Struct({
  type: Schema.Literal("unknown"),
  message: Schema.String,
}).annotate({ identifier: "Session.Error.Unknown" })

const Base = {
  id: ID,
  metadata: Schema.Record(Schema.String, Schema.Unknown).pipe(Schema.optional),
  time: Schema.Struct({ created: DateTimeUtcFromMillis }),
}

export class AgentSwitched extends Schema.Class<AgentSwitched>("Session.Message.AgentSwitched")({
  ...Base,
  type: Schema.Literal("agent-switched"),
  agent: Schema.String,
}) {}

export class ModelSwitched extends Schema.Class<ModelSwitched>("Session.Message.ModelSwitched")({
  ...Base,
  type: Schema.Literal("model-switched"),
  model: Model.Ref,
}) {}

export class User extends Schema.Class<User>("Session.Message.User")({
  ...Base,
  text: Prompt.fields.text,
  files: Prompt.fields.files,
  agents: Prompt.fields.agents,
  type: Schema.Literal("user"),
  time: Schema.Struct({ created: DateTimeUtcFromMillis }),
}) {}

export class Synthetic extends Schema.Class<Synthetic>("Session.Message.Synthetic")({
  ...Base,
  sessionID: Session.ID,
  text: Schema.String,
  type: Schema.Literal("synthetic"),
}) {}

export class System extends Schema.Class<System>("Session.Message.System")({
  ...Base,
  type: Schema.Literal("system"),
  text: Schema.String,
}) {}

export class Shell extends Schema.Class<Shell>("Session.Message.Shell")({
  ...Base,
  type: Schema.Literal("shell"),
  callID: Schema.String,
  command: Schema.String,
  output: Schema.String,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    completed: DateTimeUtcFromMillis.pipe(Schema.optional),
  }),
}) {}

export class ToolStatePending extends Schema.Class<ToolStatePending>("Session.Message.ToolState.Pending")({
  status: Schema.Literal("pending"),
  input: Schema.String,
}) {}

export class ToolStateRunning extends Schema.Class<ToolStateRunning>("Session.Message.ToolState.Running")({
  status: Schema.Literal("running"),
  input: Schema.Record(Schema.String, Schema.Unknown),
  structured: Schema.Record(Schema.String, Schema.Any),
  content: ToolContent.pipe(Schema.Array),
}) {}

export class ToolStateCompleted extends Schema.Class<ToolStateCompleted>("Session.Message.ToolState.Completed")({
  status: Schema.Literal("completed"),
  input: Schema.Record(Schema.String, Schema.Unknown),
  attachments: FileAttachment.pipe(Schema.Array, Schema.optional),
  content: ToolContent.pipe(Schema.Array),
  outputPaths: Schema.Array(Schema.String).pipe(Schema.optional),
  structured: Schema.Record(Schema.String, Schema.Any),
  result: Schema.Unknown.pipe(Schema.optional),
}) {}

export class ToolStateError extends Schema.Class<ToolStateError>("Session.Message.ToolState.Error")({
  status: Schema.Literal("error"),
  input: Schema.Record(Schema.String, Schema.Unknown),
  content: ToolContent.pipe(Schema.Array),
  structured: Schema.Record(Schema.String, Schema.Any),
  error: UnknownError,
  result: Schema.Unknown.pipe(Schema.optional),
}) {}

export const ToolState = Schema.Union([ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError]).pipe(
  Schema.toTaggedUnion("status"),
)
export type ToolState = typeof ToolState.Type

export class AssistantTool extends Schema.Class<AssistantTool>("Session.Message.Assistant.Tool")({
  type: Schema.Literal("tool"),
  id: Schema.String,
  name: Schema.String,
  provider: Schema.Struct({
    executed: Schema.Boolean,
    metadata: ProviderMetadata.pipe(Schema.optional),
    resultMetadata: ProviderMetadata.pipe(Schema.optional),
  }).pipe(Schema.optional),
  state: ToolState,
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    ran: DateTimeUtcFromMillis.pipe(Schema.optional),
    completed: DateTimeUtcFromMillis.pipe(Schema.optional),
    pruned: DateTimeUtcFromMillis.pipe(Schema.optional),
  }),
}) {}

export class AssistantText extends Schema.Class<AssistantText>("Session.Message.Assistant.Text")({
  type: Schema.Literal("text"),
  id: Schema.String,
  text: Schema.String,
}) {}

export class AssistantReasoning extends Schema.Class<AssistantReasoning>("Session.Message.Assistant.Reasoning")({
  type: Schema.Literal("reasoning"),
  id: Schema.String,
  text: Schema.String,
  providerMetadata: ProviderMetadata.pipe(Schema.optional),
}) {}

export const AssistantContent = Schema.Union([AssistantText, AssistantReasoning, AssistantTool]).pipe(
  Schema.toTaggedUnion("type"),
)
export type AssistantContent = typeof AssistantContent.Type

export class Assistant extends Schema.Class<Assistant>("Session.Message.Assistant")({
  ...Base,
  type: Schema.Literal("assistant"),
  agent: Schema.String,
  model: Model.Ref,
  content: AssistantContent.pipe(Schema.Array),
  snapshot: Schema.Struct({
    start: Schema.String.pipe(Schema.optional),
    end: Schema.String.pipe(Schema.optional),
  }).pipe(Schema.optional),
  finish: Schema.String.pipe(Schema.optional),
  cost: Schema.Finite.pipe(Schema.optional),
  tokens: Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    reasoning: Schema.Finite,
    cache: Schema.Struct({ read: Schema.Finite, write: Schema.Finite }),
  }).pipe(Schema.optional),
  error: UnknownError.pipe(Schema.optional),
  time: Schema.Struct({
    created: DateTimeUtcFromMillis,
    completed: DateTimeUtcFromMillis.pipe(Schema.optional),
  }),
}) {}

export class Compaction extends Schema.Class<Compaction>("Session.Message.Compaction")({
  type: Schema.Literal("compaction"),
  reason: Schema.Literals(["auto", "manual"]),
  summary: Schema.String,
  recent: Schema.String,
  ...Base,
}) {}

export const Message = Schema.Union([
  AgentSwitched,
  ModelSwitched,
  User,
  Synthetic,
  System,
  Shell,
  Assistant,
  Compaction,
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Session.Message" })
export type Message = typeof Message.Type
export type Type = Message["type"]
