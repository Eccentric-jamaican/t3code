import type {
  ServerCancelProviderLoginResult,
  ServerProviderAccountSummary,
  ServerStartProviderLoginResult,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect, Stream } from "effect";

export interface CodexAccountServiceShape {
  readonly getSnapshot: () => Effect.Effect<ServerProviderAccountSummary>;
  readonly startChatGptLogin: () => Effect.Effect<ServerStartProviderLoginResult, Error>;
  readonly cancelLogin: (
    loginId: string,
  ) => Effect.Effect<ServerCancelProviderLoginResult, Error>;
  readonly logout: () => Effect.Effect<void, Error>;
  readonly updates: Stream.Stream<ServerProviderAccountSummary>;
}

export class CodexAccountService extends ServiceMap.Service<
  CodexAccountService,
  CodexAccountServiceShape
>()("t3/provider/Services/CodexAccountService") {}
