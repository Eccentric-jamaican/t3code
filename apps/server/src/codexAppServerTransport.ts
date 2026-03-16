import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import readline from "node:readline";

type PendingRequestKey = string;

interface PendingRequest {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export interface JsonRpcError {
  code?: number;
  message?: string;
}

export interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

export interface CodexAppServerTransportEvents {
  error: [error: Error];
  exit: [details: { code: number | null; signal: NodeJS.Signals | null; expected: boolean }];
  notification: [notification: JsonRpcNotification];
  request: [request: JsonRpcRequest];
  stderr: [line: string];
}

export interface CodexAppServerTransportOptions {
  readonly binaryPath?: string;
  readonly cwd: string;
  readonly homePath?: string;
}

export class CodexAppServerTransport extends EventEmitter<CodexAppServerTransportEvents> {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly output: readline.Interface;
  private readonly pending = new Map<PendingRequestKey, PendingRequest>();
  private nextRequestId = 1;
  private stopping = false;

  constructor(options: CodexAppServerTransportOptions) {
    super();
    this.child = spawn(options.binaryPath ?? "codex", ["app-server"], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.homePath ? { CODEX_HOME: options.homePath } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    this.output = readline.createInterface({ input: this.child.stdout });
    this.attachListeners();
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  async request<TResponse>(method: string, params: unknown, timeoutMs = 20_000): Promise<TResponse> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);

      this.pending.set(String(id), {
        method,
        timeout,
        resolve,
        reject,
      });
      this.writeMessage({
        method,
        id,
        params,
      });
    });

    return result as TResponse;
  }

  notify(method: string, params?: unknown): void {
    this.writeMessage(params === undefined ? { method } : { method, params });
  }

  respond(requestId: string | number, response: { result?: unknown; error?: JsonRpcError }): void {
    this.writeMessage({
      id: requestId,
      ...(response.result !== undefined ? { result: response.result } : {}),
      ...(response.error !== undefined ? { error: response.error } : {}),
    });
  }

  close(): void {
    this.stopping = true;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Session stopped before request completed."));
    }
    this.pending.clear();

    this.output.close();

    if (!this.child.killed) {
      killChildTree(this.child);
    }
  }

  private attachListeners(): void {
    this.output.on("line", (line) => {
      this.handleStdoutLine(line);
    });

    this.child.stderr.on("data", (chunk: Buffer) => {
      const raw = chunk.toString();
      const lines = raw.split(/\r?\n/g);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0) {
          continue;
        }
        this.emit("stderr", line);
      }
    });

    this.child.on("error", (error) => {
      this.emit("error", error);
    });

    this.child.on("exit", (code, signal) => {
      this.emit("exit", {
        code,
        signal,
        expected: this.stopping,
      });
    });
  }

  private handleStdoutLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.emit("error", new Error("Received invalid JSON from codex app-server."));
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      this.emit("error", new Error("Received non-object protocol message."));
      return;
    }

    if (this.isServerRequest(parsed)) {
      this.emit("request", parsed);
      return;
    }

    if (this.isServerNotification(parsed)) {
      this.emit("notification", parsed);
      return;
    }

    if (this.isResponse(parsed)) {
      this.handleResponse(parsed);
      return;
    }

    this.emit("error", new Error("Received protocol message in an unknown shape."));
  }

  private handleResponse(response: JsonRpcResponse): void {
    const key = String(response.id);
    const pending = this.pending.get(key);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(key);

    if (response.error?.message) {
      pending.reject(new Error(`${pending.method} failed: ${String(response.error.message)}`));
      return;
    }

    pending.resolve(response.result);
  }

  private writeMessage(message: unknown): void {
    const encoded = JSON.stringify(message);
    if (!this.child.stdin.writable) {
      throw new Error("Cannot write to codex app-server stdin.");
    }

    this.child.stdin.write(`${encoded}\n`);
  }

  private isServerRequest(value: unknown): value is JsonRpcRequest {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.method === "string" &&
      (typeof candidate.id === "string" || typeof candidate.id === "number")
    );
  }

  private isServerNotification(value: unknown): value is JsonRpcNotification {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.method === "string" && !("id" in candidate);
  }

  private isResponse(value: unknown): value is JsonRpcResponse {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    const hasId = typeof candidate.id === "string" || typeof candidate.id === "number";
    const hasMethod = typeof candidate.method === "string";
    return hasId && !hasMethod;
  }
}

/**
 * On Windows with `shell: true`, `child.kill()` only terminates the `cmd.exe`
 * wrapper, leaving the actual command running. Use `taskkill /T` to kill the
 * entire process tree instead.
 */
function killChildTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall back to direct kill.
    }
  }
  child.kill();
}
