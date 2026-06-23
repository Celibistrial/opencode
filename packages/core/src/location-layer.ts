import { Context, Data, Effect, Layer, LayerMap, Scope } from "effect"
import { Location } from "./location"
import { Policy } from "./policy"
import { Config } from "./config"
import { PluginV2 } from "./plugin"
import { Catalog } from "./catalog"
import { Integration } from "./integration"
import { CommandV2 } from "./command"
import { AgentV2 } from "./agent"
import { PluginInternal } from "./plugin/internal"
import { Project } from "./project"
import { ProjectCopy } from "./project/copy"
import { ProjectDirectories } from "./project/directories"
import { EventV2 } from "./event"
import { Credential } from "./credential"
import { Npm } from "./npm"
import { ModelsDev } from "./models-dev"
import { FSUtil } from "./fs-util"
import { Git } from "./git"
import { Global } from "./global"
import { Database } from "./database/database"
import { PermissionV2 } from "./permission"
import { PermissionSaved } from "./permission/saved"
import { FileSystem } from "./filesystem"
import { Ripgrep } from "./ripgrep"
import { Watcher } from "./filesystem/watcher"
import { LocationMutation } from "./location-mutation"
import { FileMutation } from "./file-mutation"
import { Reference } from "./reference"
import { ReferenceGuidance } from "./reference/guidance"
import { RepositoryCache } from "./repository-cache"
import { Pty } from "./pty"
import { SkillV2 } from "./skill"
import { SkillGuidance } from "./skill/guidance"
import { BuiltInTools } from "./tool/builtins"
import { Image } from "./image"
import { ToolRegistry } from "./tool/registry"
import { ApplicationTools } from "./tool/application-tools"
import { ToolOutputStore } from "./tool-output-store"
import { AppProcess } from "./process"
import { SessionStore } from "./session/store"
import { SessionTodo } from "./session/todo"
import { QuestionV2 } from "./question"
import { LLMClient } from "@opencode-ai/llm"
import { RequestExecutor } from "@opencode-ai/llm/route"
import * as SessionRunnerLLM from "./session/runner/llm"
import { SessionRunnerModel } from "./session/runner/model"
import { SystemContextBuiltIns } from "./system-context/builtins"
import { FetchHttpClient } from "effect/unstable/http"

class LocationRefKey extends Data.Class<{
  readonly directory: Location.Ref["directory"]
  readonly workspaceID: Location.Ref["workspaceID"] | null
}> {}

const locationRefKey = (ref: Location.Ref) =>
  new LocationRefKey({ directory: ref.directory, workspaceID: ref.workspaceID ?? null })

const locationServiceDependencies = [
  Project.defaultLayer,
  EventV2.defaultLayer,
  Credential.defaultLayer,
  Npm.defaultLayer,
  ModelsDev.defaultLayer,
  FSUtil.defaultLayer,
  Git.defaultLayer,
  AppProcess.defaultLayer,
  Global.defaultLayer,
  Ripgrep.defaultLayer,
  Database.defaultLayer,
  ProjectDirectories.defaultLayer,
  SessionStore.layer.pipe(Layer.provide(Database.defaultLayer)),
  PermissionSaved.defaultLayer,
  RepositoryCache.defaultLayer,
  LLMClient.layer.pipe(Layer.provide(RequestExecutor.defaultLayer)),
  FetchHttpClient.layer,
  ToolOutputStore.defaultCleanupLayer,
] as const

class LocationServiceCache extends LayerMap.Service<LocationServiceCache>()("@opencode/example/LocationServiceCache", {
  lookup: (ref: ReturnType<typeof locationRefKey>) => {
    const locationRef = Location.Ref.make({
      directory: ref.directory,
      ...(ref.workspaceID === null ? {} : { workspaceID: ref.workspaceID }),
    })
    const boot = Layer.effectDiscard(
      Effect.logInfo("booting location services", {
        directory: locationRef.directory,
        workspaceID: locationRef.workspaceID,
      }),
    )
    const location = Location.layer(locationRef)
    const systemContext = SystemContextBuiltIns.locationLayer
    const base = Layer.mergeAll(
      location,
      Policy.locationLayer,
      Config.locationLayer,
      Reference.locationLayer,
      PluginV2.locationLayer,
      Catalog.locationLayer,
      Integration.locationLayer,
      CommandV2.locationLayer,
      AgentV2.locationLayer,
      PluginInternal.locationLayer,
      ProjectCopy.locationLayer,
      FileSystem.locationLayer,
      Watcher.locationLayer,
      Pty.locationLayer,
      SkillV2.locationLayer,
      systemContext,
      LocationMutation.locationLayer.pipe(Layer.orDie),
    ).pipe(Layer.provideMerge(location))
    const resources = ToolOutputStore.layer.pipe(Layer.provide(base))
    const permissionsAndTools = ToolRegistry.layer.pipe(
      Layer.provideMerge(PermissionV2.locationLayer),
      Layer.provide(resources),
      Layer.provide(base),
    )
    const services = Layer.mergeAll(base, resources, permissionsAndTools)
    const image = Image.layer.pipe(Layer.provide(services))
    const mutation = FileMutation.locationLayer.pipe(Layer.provide(services))
    const skillGuidance = SkillGuidance.locationLayer.pipe(Layer.provide(services))
    const referenceGuidance = ReferenceGuidance.locationLayer.pipe(Layer.provide(services))
    const todos = SessionTodo.layer.pipe(Layer.provide(services))
    const questions = QuestionV2.locationLayer.pipe(Layer.provide(services))
    const builtInTools = BuiltInTools.locationLayer.pipe(
      Layer.provide(services),
      Layer.provide(mutation),
      Layer.provide(resources),
      Layer.provide(todos),
      Layer.provide(questions),
      Layer.provide(image),
    )
    const model = SessionRunnerModel.locationLayer.pipe(Layer.provide(services))
    const runner = SessionRunnerLLM.defaultLayer.pipe(
      Layer.provide(services),
      Layer.provide(model),
      Layer.provide(skillGuidance),
      Layer.provide(referenceGuidance),
    )

    // Kick off a background project copy refresh to update locations now that we
    // have a location
    const projectCopyRefresh = Layer.effectDiscard(ProjectCopy.refreshAfterBoot).pipe(Layer.provide(services))

    return Layer.mergeAll(
      boot,
      services,
      image,
      mutation,
      resources,
      todos,
      questions,
      model,
      runner,
      builtInTools,
      referenceGuidance,
      projectCopyRefresh,
    ).pipe(Layer.fresh)
  },
  idleTimeToLive: "60 minutes",
  dependencies: [...locationServiceDependencies, ApplicationTools.layer],
}) {}

type LocationServices = Layer.Success<ReturnType<typeof LocationServiceCache.get>>

export interface LocationServiceMapService {
  readonly get: (ref: Location.Ref) => Layer.Layer<LocationServices>
  readonly contextEffect: (ref: Location.Ref) => Effect.Effect<Context.Context<LocationServices>, never, Scope.Scope>
  readonly invalidate: (ref: Location.Ref) => Effect.Effect<void>
}

const locationServiceMapLayer = <E, R>(
  service: Context.Service<LocationServiceMap, LocationServiceMapService>,
  cache: Layer.Layer<LocationServiceCache, E, R>,
) =>
  Layer.effect(
    service,
    Effect.map(LocationServiceCache, (locations) =>
      service.of({
        get: (ref) => locations.get(locationRefKey(ref)),
        contextEffect: (ref) => locations.contextEffect(locationRefKey(ref)),
        invalidate: (ref) => locations.invalidate(locationRefKey(ref)),
      }),
    ),
  ).pipe(Layer.provide(cache))

export class LocationServiceMap extends Context.Service<LocationServiceMap, LocationServiceMapService>()(
  "@opencode/example/LocationServiceMap",
) {
  static readonly get = (ref: Location.Ref) =>
    Layer.unwrap(Effect.map(LocationServiceMap, (locations) => locations.get(ref)))
  static readonly contextEffect = (ref: Location.Ref) =>
    Effect.flatMap(LocationServiceMap, (locations) => locations.contextEffect(ref))
  static readonly invalidate = (ref: Location.Ref) =>
    Effect.flatMap(LocationServiceMap, (locations) => locations.invalidate(ref))
  static readonly layer: Layer.Layer<LocationServiceMap> = locationServiceMapLayer(this, LocationServiceCache.layer)
  static readonly layerWithApplicationTools: Layer.Layer<LocationServiceMap, never, ApplicationTools.Service> =
    locationServiceMapLayer(
      this,
      LocationServiceCache.layerNoDeps.pipe(Layer.provide(Layer.mergeAll(...locationServiceDependencies))),
    )
}
