export type InvalidCursorError = { readonly _tag: "InvalidCursorError"; readonly message: string }
export const isInvalidCursorError = (value: unknown): value is InvalidCursorError =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === "InvalidCursorError"

export type InvalidRequestError = {
  readonly _tag: "InvalidRequestError"
  readonly message: string
  readonly kind: string | undefined
  readonly field: string | undefined
}
export const isInvalidRequestError = (value: unknown): value is InvalidRequestError =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === "InvalidRequestError"

export type SessionNotFoundError = {
  readonly _tag: "SessionNotFoundError"
  readonly sessionID: string
  readonly message: string
}
export const isSessionNotFoundError = (value: unknown): value is SessionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === "SessionNotFoundError"

export type ConflictError = {
  readonly _tag: "ConflictError"
  readonly message: string
  readonly resource: string | undefined
}
export const isConflictError = (value: unknown): value is ConflictError =>
  typeof value === "object" && value !== null && "_tag" in value && value._tag === "ConflictError"

export type SessionsListInput = {
  readonly workspace?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["workspace"]
  readonly limit?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["limit"]
  readonly order?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["order"]
  readonly search?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["search"]
  readonly directory?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["directory"]
  readonly project?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["project"]
  readonly subpath?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["subpath"]
  readonly cursor?: {
    readonly workspace?: string | undefined
    readonly limit?: string | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}

export type SessionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string | null } | null
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number | null }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string | null }
    readonly subpath?: string | null
  }>
  readonly cursor: { readonly previous?: string | null; readonly next?: string | null }
}

export type SessionsCreateInput = {
  readonly id?: {
    readonly id?: string | undefined
    readonly agent?: string | undefined
    readonly model?:
      | { readonly id: string; readonly providerID: string; readonly variant?: string | undefined }
      | undefined
    readonly location?: { readonly directory: string; readonly workspaceID?: string | undefined } | undefined
  }["id"]
  readonly agent?: {
    readonly id?: string | undefined
    readonly agent?: string | undefined
    readonly model?:
      | { readonly id: string; readonly providerID: string; readonly variant?: string | undefined }
      | undefined
    readonly location?: { readonly directory: string; readonly workspaceID?: string | undefined } | undefined
  }["agent"]
  readonly model?: {
    readonly id?: string | undefined
    readonly agent?: string | undefined
    readonly model?:
      | { readonly id: string; readonly providerID: string; readonly variant?: string | undefined }
      | undefined
    readonly location?: { readonly directory: string; readonly workspaceID?: string | undefined } | undefined
  }["model"]
  readonly location?: {
    readonly id?: string | undefined
    readonly agent?: string | undefined
    readonly model?:
      | { readonly id: string; readonly providerID: string; readonly variant?: string | undefined }
      | undefined
    readonly location?: { readonly directory: string; readonly workspaceID?: string | undefined } | undefined
  }["location"]
}

export type SessionsCreateOutput = {
  readonly data: {
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string | null } | null
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number | null }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string | null }
    readonly subpath?: string | null
  }
}["data"]

export type SessionsGetInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsGetOutput = {
  readonly data: {
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string | null } | null
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number | null }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string | null }
    readonly subpath?: string | null
  }
}["data"]

export type SessionsSwitchAgentInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly agent: { readonly agent: string }["agent"]
}

export type SessionsSwitchAgentOutput = void

export type SessionsSwitchModelInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly model: {
    readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string | undefined }
  }["model"]
}

export type SessionsSwitchModelOutput = void

export type SessionsPromptInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: {
    readonly id?: string | undefined
    readonly prompt: {
      readonly text: string
      readonly files?:
        | ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string | undefined
            readonly description?: string | undefined
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
      readonly agents?:
        | ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
    }
    readonly delivery?: "steer" | "queue" | undefined
    readonly resume?: boolean | undefined
  }["id"]
  readonly prompt: {
    readonly id?: string | undefined
    readonly prompt: {
      readonly text: string
      readonly files?:
        | ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string | undefined
            readonly description?: string | undefined
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
      readonly agents?:
        | ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
    }
    readonly delivery?: "steer" | "queue" | undefined
    readonly resume?: boolean | undefined
  }["prompt"]
  readonly delivery?: {
    readonly id?: string | undefined
    readonly prompt: {
      readonly text: string
      readonly files?:
        | ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string | undefined
            readonly description?: string | undefined
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
      readonly agents?:
        | ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
    }
    readonly delivery?: "steer" | "queue" | undefined
    readonly resume?: boolean | undefined
  }["delivery"]
  readonly resume?: {
    readonly id?: string | undefined
    readonly prompt: {
      readonly text: string
      readonly files?:
        | ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string | undefined
            readonly description?: string | undefined
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
      readonly agents?:
        | ReadonlyArray<{
            readonly name: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string } | undefined
          }>
        | undefined
    }
    readonly delivery?: "steer" | "queue" | undefined
    readonly resume?: boolean | undefined
  }["resume"]
}

export type SessionsPromptOutput = {
  readonly data: {
    readonly admittedSeq: number
    readonly id: string
    readonly sessionID: string
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly mime: string
        readonly name?: string | null
        readonly description?: string | null
        readonly source?: { readonly start: number; readonly end: number; readonly text: string } | null
      }> | null
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string } | null
      }> | null
    }
    readonly delivery: "steer" | "queue"
    readonly timeCreated: number
    readonly promotedSeq?: number | null
  }
}["data"]
