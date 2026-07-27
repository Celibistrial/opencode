import type { Event } from "@opencode-ai/sdk/v2"
import { useSDK } from "./sdk"

type EventMetadata = {
  directory: string
  workspace: string | undefined
}

export function useEvent() {
  const sdk = useSDK()

  function subscribe(handler: (event: Event, metadata: EventMetadata) => void) {
    return sdk.event.on("event", (event) => {
      if (event.payload.type === "sync") {
        return
      }

      handler(event.payload, { directory: event.directory, workspace: event.workspace })
    })
  }

  function on<T extends Event["type"]>(
    type: T,
    handler: (event: Extract<Event, { type: T }>, metadata: EventMetadata) => void,
  ) {
    // typed registration: the dispatcher only invokes this handler for events
    // of the requested type instead of every subscriber seeing every event
    return sdk.event.onPayloadType(type, (event) => {
      handler(event.payload as Extract<Event, { type: T }>, {
        directory: event.directory,
        workspace: event.workspace,
      })
    })
  }

  // like on(), but for event types outside the v1 Event union (e.g. v2
  // session.next.* events); the caller narrows the payload itself
  function onType(type: string, handler: (event: unknown, metadata: EventMetadata) => void) {
    return sdk.event.onPayloadType(type, (event) => {
      handler(event.payload, { directory: event.directory, workspace: event.workspace })
    })
  }

  return {
    subscribe,
    on,
    onType,
  }
}
