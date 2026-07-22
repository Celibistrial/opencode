export * as Watcher from "./watcher"

// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper"
import type ParcelWatcher from "@parcel/watcher"
import { makeLocationNode } from "../effect/app-node"
import { Cause, Context, Effect, Layer, Semaphore } from "effect"
import { FileSystemWatcher } from "@opencode-ai/schema/filesystem-watcher"
import path from "path"
import { Config } from "../config"
import { EventV2 } from "../event"
import { Flag } from "../flag/flag"
import { FSUtil } from "../fs-util"
import { Git } from "../git"
import { Location } from "../location"
import { lazy } from "../util/lazy"
import { Ignore } from "./ignore"
import { Protected } from "./protected"

declare const OPENCODE_LIBC: string | undefined

const SUBSCRIBE_TIMEOUT_MS = 10_000

export const Event = FileSystemWatcher.Event

const watcher = lazy((): typeof import("@parcel/watcher") | undefined => {
  try {
    const libc = typeof OPENCODE_LIBC === "undefined" ? undefined : OPENCODE_LIBC
    const binding = require(
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${libc || "glibc"}` : ""}`,
    )
    return createWrapper(binding) as typeof import("@parcel/watcher")
  } catch {
    return
  }
})

function getBackend() {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
}

function protecteds(dir: string) {
  return Protected.paths().filter((item) => {
    const relative = path.relative(dir, item)
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  })
}

/**
 * Build the `@parcel/watcher` ignore list for the `.git` directory watch.
 *
 * The `.git` watch exists only to detect branch/ref changes via `.git/HEAD`, so
 * every other top-level entry is ignored. On large repositories the `objects`
 * and `logs` subtrees can be enormous (packed objects, LFS, reflogs); if parcel
 * crawls them the native `subscribe()` can wedge (see #38201, #37111, #37793),
 * so it is important these are pruned from the crawl, not merely filtered from
 * the event stream.
 *
 * @parcel/watcher's wrapper (`normalizeOptions`) treats a non-glob ignore entry
 * as a path, resolves it against the subscribe directory, and stores it in
 * `ignorePaths`; the native `Watcher::isIgnored` then prunes any path equal to
 * or beneath an `ignorePaths` entry (`fts` uses `FTS_SKIP`, inotify never
 * descends, FSEvents excludes it). We emit ABSOLUTE paths explicitly instead of
 * relying on that implicit resolution, so the subtree-pruning intent is
 * unambiguous and directly testable.
 *
 * `HEAD` is always kept watchable so branch switches (which rewrite `.git/HEAD`)
 * still surface.
 */
export function gitWatchIgnore(gitDirectory: string, entries: readonly string[]): string[] {
  return entries.filter((name) => name !== "HEAD").map((name) => path.join(gitDirectory, name))
}

/**
 * Single-flight gate used to serialize native `@parcel/watcher` subscribes.
 *
 * Exactly one permit, so at most one `subscribe()` runs at a time. Concurrent
 * parcel subscribes have deadlocked natively (#37111); the permit is held for
 * the full duration of a subscribe (including its initial crawl), removing the
 * concurrency hazard. Exported so the serialization guarantee can be tested
 * without a real parcel backend.
 */
export const makeSubscribeGate = Semaphore.make(1)

export const hasNativeBinding = () => !!watcher()

export interface Interface {}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/FileWatcher") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    if (yield* Flag.OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER) return Service.of({})

    const backend = getBackend()
    const location = yield* Location.Service
    if (!backend) {
      yield* Effect.logError("watcher backend not supported", {
        directory: location.directory,
        platform: process.platform,
      })
      return Service.of({})
    }

    const w = watcher()
    if (!w) return Service.of({})

    yield* Effect.logInfo("watcher backend", { directory: location.directory, platform: process.platform, backend })
    const events = yield* EventV2.Service
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const context = yield* Effect.context()
    const runFork = Effect.runForkWith(context)
    const subscriptions: ParcelWatcher.AsyncSubscription[] = []
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => Promise.allSettled(subscriptions.map((subscription) => subscription.unsubscribe()))),
    )

    const callback: ParcelWatcher.SubscribeCallback = (_error, updates) => {
      for (const update of updates) {
        if (update.type === "create") runFork(events.publish(Event.Updated, { file: update.path, event: "add" }))
        if (update.type === "update") runFork(events.publish(Event.Updated, { file: update.path, event: "change" }))
        if (update.type === "delete") runFork(events.publish(Event.Updated, { file: update.path, event: "unlink" }))
      }
    }

    // Concurrent `@parcel/watcher` subscribes have been implicated in a native
    // futex deadlock (#37111). The native `subscribe()` also runs its
    // backend-shared bootstrap synchronously on the calling thread before the
    // returned promise is awaited, so `Effect.timeout` below cannot rescue a
    // wedge. Funnel every subscribe through a single-permit gate so at most one
    // native `subscribe()` is ever in flight; the gate is held until the
    // subscription resolves (or times out), which also serializes the initial
    // directory crawls.
    const gate = yield* makeSubscribeGate

    const subscribe = (directory: string, ignore: string[]) =>
      gate.withPermits(1)(
        Effect.suspend(() => {
          const pending = w.subscribe(directory, callback, { ignore, backend })
          return Effect.promise(() => pending).pipe(
            Effect.tap((subscription) => Effect.sync(() => subscriptions.push(subscription))),
            Effect.timeout(SUBSCRIBE_TIMEOUT_MS),
            Effect.catchCause((cause) => {
              pending.then((subscription) => subscription.unsubscribe()).catch(() => {})
              return Effect.logError("failed to subscribe", { directory, cause: Cause.pretty(cause) })
            }),
          )
        }),
      )

    const config = (yield* (yield* Config.Service).entries())
      .filter((entry): entry is Config.Document => entry.type === "document")
      .flatMap((item) => item.info.watcher?.ignore ?? [])
    if (location.vcs && (yield* Flag.OPENCODE_EXPERIMENTAL_FILEWATCHER)) {
      yield* Effect.forkScoped(
        subscribe(location.directory, [...Ignore.PATTERNS, ...config, ...protecteds(location.directory)]),
      )
    }

    if (location.vcs?.type === "git") {
      const resolved = (yield* git.repo.discover(location.directory))?.gitDirectory
      const vcs = resolved ? yield* fs.realPath(resolved).pipe(Effect.catch(() => Effect.succeed(resolved))) : undefined
      if (vcs && !config.includes(".git") && !config.includes(vcs) && (!resolved || !config.includes(resolved))) {
        const entries = (yield* fs.readDirectoryEntries(vcs).pipe(Effect.catch(() => Effect.succeed([])))).map(
          (entry) => entry.name,
        )
        yield* Effect.forkScoped(subscribe(vcs, gitWatchIgnore(vcs, entries)))
      }
    }

    return Service.of({})
  }).pipe(
    Effect.catchCause((cause) => {
      return Effect.logError("failed to init watcher service", { cause: Cause.pretty(cause) }).pipe(
        Effect.as(Service.of({})),
      )
    }),
  ),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Location.node, Config.node, Git.node, EventV2.node],
})
