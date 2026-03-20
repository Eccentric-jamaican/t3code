import { CommandId, type OrchestrationEvent, type TaskId } from "@t3tools/contracts";
import { Cause, Effect, Layer, Queue, Stream } from "effect";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  TaskLifecycleReactor,
  type TaskLifecycleReactorShape,
} from "../Services/TaskLifecycleReactor.ts";

type TaskLifecycleEvent = Extract<
  OrchestrationEvent,
  {
    type: "thread.turn-diff-completed" | "thread.session-set";
  }
>;

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;

  const resolveTaskForThread = Effect.fnUntraced(function* (threadId: string) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const thread = readModel.threads.find((entry) => entry.id === threadId);
    if (!thread || thread.origin !== "task" || thread.taskId === null) {
      return null;
    }
    const task = readModel.tasks.find((entry) => entry.id === thread.taskId && entry.deletedAt === null);
    if (!task || task.deletedAt !== null) {
      return null;
    }
    const projectRules = readModel.projectRules.find((entry) => entry.projectId === task.projectId);
    return {
      task,
      projectRules,
      thread,
    };
  });

  const dispatchTaskState = (input: {
    readonly taskId: TaskId;
    readonly state: "backlog" | "ready" | "running" | "review" | "blocked" | "done";
    readonly createdAt: string;
  }) =>
    orchestrationEngine.dispatch({
      type: "task.state.set",
      commandId: serverCommandId("task-lifecycle-state"),
      taskId: input.taskId,
      state: input.state,
      createdAt: input.createdAt,
    });

  const processEvent = Effect.fnUntraced(function* (event: TaskLifecycleEvent) {
    switch (event.type) {
      case "thread.turn-diff-completed": {
        const resolved = yield* resolveTaskForThread(event.payload.threadId);
        if (!resolved || resolved.task.state !== "running") {
          return;
        }

        const nextState =
          event.payload.status === "error"
            ? (resolved.projectRules?.onFailureMoveTo ?? "blocked")
            : (resolved.projectRules?.onSuccessMoveTo ?? "review");
        if (resolved.task.state === nextState) {
          return;
        }

        yield* dispatchTaskState({
          taskId: resolved.task.id,
          state: nextState,
          createdAt: event.payload.completedAt,
        });
        return;
      }

      case "thread.session-set": {
        if (event.payload.session.status !== "error") {
          return;
        }

        const resolved = yield* resolveTaskForThread(event.payload.threadId);
        if (!resolved || resolved.task.state !== "running") {
          return;
        }

        const nextState = resolved.projectRules?.onFailureMoveTo ?? "blocked";
        if (resolved.task.state === nextState) {
          return;
        }

        yield* dispatchTaskState({
          taskId: resolved.task.id,
          state: nextState,
          createdAt: event.payload.session.updatedAt,
        });
        return;
      }
    }
  });

  const processEventSafely = (event: TaskLifecycleEvent) =>
    processEvent(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning("task lifecycle reactor failed to process event", {
          eventType: event.type,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const start: TaskLifecycleReactorShape["start"] = Effect.gen(function* () {
    const queue = yield* Queue.unbounded<TaskLifecycleEvent>();
    yield* Effect.addFinalizer(() => Queue.shutdown(queue).pipe(Effect.asVoid));

    yield* Effect.forkScoped(
      Effect.forever(Queue.take(queue).pipe(Effect.flatMap(processEventSafely))),
    );

    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (event.type !== "thread.turn-diff-completed" && event.type !== "thread.session-set") {
          return Effect.void;
        }
        return Queue.offer(queue, event).pipe(Effect.asVoid);
      }),
    );
  });

  return {
    start,
  } satisfies TaskLifecycleReactorShape;
});

export const TaskLifecycleReactorLive = Layer.effect(TaskLifecycleReactor, make);
