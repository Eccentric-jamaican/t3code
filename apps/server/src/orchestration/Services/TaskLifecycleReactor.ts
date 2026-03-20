import type { Effect, Scope } from "effect";
import { ServiceMap } from "effect";

export interface TaskLifecycleReactorShape {
  readonly start: Effect.Effect<void, never, Scope.Scope>;
}

export class TaskLifecycleReactor extends ServiceMap.Service<
  TaskLifecycleReactor,
  TaskLifecycleReactorShape
>()("t3/orchestration/Services/TaskLifecycleReactor") {}
