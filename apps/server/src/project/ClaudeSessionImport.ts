// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeReadlinePromises from "node:readline/promises";

import {
  ClaudeSessionId,
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  type OrchestrationMessageRole,
  PROJECT_CLAUDE_SESSIONS_DEFAULT_LIMIT,
  type ProjectClaudeSession,
  ProjectClaudeSessionImportError,
  type ProjectImportClaudeSessionInput,
  type ProjectImportClaudeSessionResult,
  type ProjectListClaudeSessionsInput,
  type ProjectListClaudeSessionsResult,
  ProviderDriverKind,
  type ServerProvider,
  type ThreadId,
  isProviderAvailable,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ProviderRegistry from "../provider/Services/ProviderRegistry.ts";
import * as ProviderSessionDirectory from "../provider/Services/ProviderSessionDirectory.ts";

const CLAUDE_DRIVER = ProviderDriverKind.make("claudeAgent");
const CLAUDE_SESSION_CHUNK_BYTES = 64 * 1024;
const CLAUDE_SESSION_LABEL_MAX_CHARS = 160;
const CLAUDE_SESSION_SUMMARY_CONCURRENCY = 16;
const CLAUDE_TRANSCRIPT_IMPORT_MAX_TOTAL_CHARS = 2_000_000;
const CLAUDE_TRANSCRIPT_IMPORT_MAX_MESSAGE_CHARS = 128_000;
const CLAUDE_TRANSCRIPT_IMPORT_MAX_MESSAGES = 2_000;

interface ClaudeTranscriptMessage {
  readonly sourceId: string;
  readonly role: OrchestrationMessageRole;
  readonly text: string;
  readonly createdAt: string;
}

export interface ClaudeSessionImportService {
  readonly list: (
    input: ProjectListClaudeSessionsInput,
  ) => Effect.Effect<ProjectListClaudeSessionsResult, ProjectClaudeSessionImportError>;
  readonly importSession: (
    input: ProjectImportClaudeSessionInput,
  ) => Effect.Effect<ProjectImportClaudeSessionResult, ProjectClaudeSessionImportError>;
}

export function makeClaudeSessionImport(input: {
  readonly orchestrationEngine: OrchestrationEngine.OrchestrationEngineService["Service"];
  readonly projectionSnapshotQuery: ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"];
  readonly providerRegistry: ProviderRegistry.ProviderRegistry["Service"];
  readonly providerSessionDirectory: ProviderSessionDirectory.ProviderSessionDirectory["Service"];
}): ClaudeSessionImportService {
  const {
    orchestrationEngine,
    projectionSnapshotQuery,
    providerRegistry,
    providerSessionDirectory,
  } = input;

  const list: ClaudeSessionImportService["list"] = Effect.fn("ClaudeSessionImport.list")(
    function* (input) {
      const project = yield* resolveImportProject(projectionSnapshotQuery, input);
      const location = resolveClaudeProjectLocation(project.cwd);
      const limit = input.limit ?? PROJECT_CLAUDE_SESSIONS_DEFAULT_LIMIT;
      const entries = yield* readClaudeProjectEntries(input.cwd, location.directory);
      const jsonlEntries = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
        .map((entry) => ({
          sessionId: entry.name.slice(0, -".jsonl".length),
          filePath: NodePath.join(location.directory, entry.name),
        }))
        .filter(
          (entry): entry is { readonly sessionId: ClaudeSessionId; readonly filePath: string } =>
            isClaudeSessionId(entry.sessionId),
        );

      const sessionMetadata = yield* Effect.forEach(
        jsonlEntries,
        (entry) => readClaudeSessionMetadata(entry.sessionId, entry.filePath),
        { concurrency: CLAUDE_SESSION_SUMMARY_CONCURRENCY },
      );
      const recentSessionMetadata = sessionMetadata
        .filter((session): session is ProjectClaudeSession => session !== null)
        .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      const visibleSessionMetadata = recentSessionMetadata.slice(0, limit);
      const sessions = yield* Effect.forEach(
        visibleSessionMetadata,
        (session) => readClaudeSessionSummary(session),
        { concurrency: CLAUDE_SESSION_SUMMARY_CONCURRENCY },
      );

      return {
        cwd: location.cwd,
        encodedCwd: location.encodedCwd,
        directory: location.directory,
        sessions,
        truncated: recentSessionMetadata.length > limit,
      };
    },
  );

  const importSession: ClaudeSessionImportService["importSession"] = Effect.fn(
    "ClaudeSessionImport.importSession",
  )(function* (input) {
    const project = yield* resolveImportProject(projectionSnapshotQuery, input);
    const location = resolveClaudeProjectLocation(project.cwd);
    const sessionFile = NodePath.join(location.directory, `${input.sessionId}.jsonl`);
    yield* verifyClaudeSessionFile(input.cwd, input.sessionId, sessionFile);

    const sessionSummary = yield* readClaudeSessionSummaryForImport(
      input.cwd,
      input.sessionId,
      sessionFile,
    );
    const transcriptMessages = yield* readClaudeTranscriptMessages({
      cwd: input.cwd,
      filePath: sessionFile,
      sessionId: input.sessionId,
    });
    const importCreatedAt = DateTime.formatIso(yield* DateTime.now);
    const existingThreadId = yield* findExistingImportedThread({
      cwd: location.cwd,
      projectionSnapshotQuery,
      providerSessionDirectory,
      sessionId: input.sessionId,
    });
    if (existingThreadId !== null) {
      yield* importClaudeTranscriptMessages({
        createdAt: importCreatedAt,
        cwd: input.cwd,
        messages: transcriptMessages,
        orchestrationEngine,
        sessionId: input.sessionId,
        threadId: existingThreadId,
      });
      return {
        threadId: existingThreadId,
        sessionId: input.sessionId,
      };
    }
    const provider = yield* selectClaudeProvider({
      cwd: input.cwd,
      projectDefaultInstanceId: project.defaultProviderInstanceId,
      providerRegistry,
      sessionId: input.sessionId,
    });
    const modelSelection = createModelSelection(
      provider.instanceId,
      provider.models[0]?.slug ?? DEFAULT_MODEL_BY_PROVIDER[CLAUDE_DRIVER] ?? "claude-sonnet-5",
    );
    const runtimeMode = input.runtimeMode ?? DEFAULT_RUNTIME_MODE;
    const interactionMode = input.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE;
    const title =
      input.title?.trim() ||
      sessionSummary?.title ||
      sessionSummary?.firstUserMessage ||
      `Claude import ${input.sessionId.slice(0, 8)}`;

    yield* orchestrationEngine
      .dispatch({
        type: "thread.create",
        commandId: CommandId.make(`import-claude-thread:${input.threadId}`),
        threadId: input.threadId,
        projectId: input.projectId,
        title,
        modelSelection,
        runtimeMode,
        interactionMode,
        branch: null,
        worktreePath: null,
        createdAt: importCreatedAt,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProjectClaudeSessionImportError({
              cwd: input.cwd,
              sessionId: input.sessionId,
              failure: "thread_create_failed",
              detail: "Failed to create the imported T3 thread.",
              cause,
            }),
        ),
      );

    const rollbackImportedThread = orchestrationEngine
      .dispatch({
        type: "thread.delete",
        commandId: CommandId.make(`rollback-import-claude-thread:${input.threadId}`),
        threadId: input.threadId,
      })
      .pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Failed to roll back imported Claude thread after bind failure.", {
            cause,
            threadId: input.threadId,
            sessionId: input.sessionId,
          }),
        ),
      );

    yield* providerSessionDirectory
      .upsert({
        threadId: input.threadId,
        provider: CLAUDE_DRIVER,
        providerInstanceId: provider.instanceId,
        adapterKey: CLAUDE_DRIVER,
        status: "stopped",
        runtimeMode,
        resumeCursor: { resume: input.sessionId },
        runtimePayload: {
          cwd: location.cwd,
          importedFrom: {
            kind: "claude-code",
            sessionId: input.sessionId,
            path: sessionFile,
          },
        },
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProjectClaudeSessionImportError({
              cwd: input.cwd,
              sessionId: input.sessionId,
              failure: "provider_session_bind_failed",
              detail: "Failed to bind the imported thread to the Claude session.",
              cause,
            }),
        ),
        Effect.catch((error) => rollbackImportedThread.pipe(Effect.andThen(Effect.fail(error)))),
      );

    yield* importClaudeTranscriptMessages({
      createdAt: importCreatedAt,
      cwd: input.cwd,
      messages: transcriptMessages,
      orchestrationEngine,
      sessionId: input.sessionId,
      threadId: input.threadId,
    });

    return {
      threadId: input.threadId,
      sessionId: input.sessionId,
    };
  });

  return { importSession, list };
}

function normalizeCwd(cwd: string): string {
  return NodePath.resolve(cwd.trim());
}

function resolveImportProject(
  projectionSnapshotQuery: ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"],
  input: Pick<ProjectListClaudeSessionsInput, "cwd" | "projectId">,
): Effect.Effect<
  {
    readonly cwd: string;
    readonly defaultProviderInstanceId: ServerProvider["instanceId"] | null;
  },
  ProjectClaudeSessionImportError
> {
  return projectionSnapshotQuery.getProjectShellById(input.projectId).pipe(
    Effect.mapError(
      (cause) =>
        new ProjectClaudeSessionImportError({
          cwd: input.cwd,
          failure: "claude_project_read_failed",
          detail: "Failed to resolve the project for Claude session import.",
          cause,
        }),
    ),
    Effect.flatMap((projectOption) => {
      const project = Option.getOrNull(projectOption);
      if (project === null) {
        return Effect.fail(
          new ProjectClaudeSessionImportError({
            cwd: input.cwd,
            failure: "project_not_found",
            detail: "The target project was not found.",
          }),
        );
      }
      const requestedCwd = normalizeCwd(input.cwd);
      const projectCwd = normalizeCwd(project.workspaceRoot);
      if (requestedCwd !== projectCwd) {
        return Effect.fail(
          new ProjectClaudeSessionImportError({
            cwd: input.cwd,
            failure: "project_cwd_mismatch",
            detail: "The requested cwd does not match the target project's workspace root.",
          }),
        );
      }
      return Effect.succeed({
        cwd: projectCwd,
        defaultProviderInstanceId: project.defaultModelSelection?.instanceId ?? null,
      });
    }),
  );
}

export function encodeClaudeProjectCwd(cwd: string): string {
  return NodePath.resolve(cwd).replace(/[\\/]/g, "-");
}

export function resolveClaudeConfigDirectory(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();
  return configured ? configured : NodePath.join(NodeOS.homedir(), ".claude");
}

function resolveClaudeProjectLocation(cwd: string): {
  readonly cwd: string;
  readonly encodedCwd: string;
  readonly directory: string;
} {
  const normalizedCwd = NodePath.resolve(cwd);
  const encodedCwd = encodeClaudeProjectCwd(normalizedCwd);
  return {
    cwd: normalizedCwd,
    encodedCwd,
    directory: NodePath.join(resolveClaudeConfigDirectory(), "projects", encodedCwd),
  };
}

function isClaudeSessionId(value: string): value is ClaudeSessionId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingPath(cause: unknown): boolean {
  return (cause as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function readClaudeProjectEntries(
  cwd: string,
  directory: string,
): Effect.Effect<
  Array<{ readonly name: string; readonly isFile: () => boolean }>,
  ProjectClaudeSessionImportError
> {
  return Effect.tryPromise({
    try: () => NodeFSP.readdir(directory, { withFileTypes: true }),
    catch: (cause) =>
      new ProjectClaudeSessionImportError({
        cwd,
        failure: "claude_project_read_failed",
        detail: `Failed to read Claude project directory '${directory}'.`,
        cause,
      }),
  }).pipe(
    Effect.catchIf(
      (error) => error.cause !== undefined && isMissingPath(error.cause),
      () => Effect.succeed([]),
    ),
  );
}

function findExistingImportedThread(input: {
  readonly projectionSnapshotQuery: ProjectionSnapshotQuery.ProjectionSnapshotQuery["Service"];
  readonly providerSessionDirectory: ProviderSessionDirectory.ProviderSessionDirectory["Service"];
  readonly cwd: string;
  readonly sessionId: ClaudeSessionId;
}): Effect.Effect<ThreadId | null, ProjectClaudeSessionImportError> {
  return input.providerSessionDirectory.listBindings().pipe(
    Effect.mapError(
      (cause) =>
        new ProjectClaudeSessionImportError({
          cwd: input.cwd,
          sessionId: input.sessionId,
          failure: "provider_session_bind_failed",
          detail: "Failed to inspect existing provider session bindings.",
          cause,
        }),
    ),
    Effect.flatMap((bindings) =>
      Effect.gen(function* () {
        const candidates = bindings.filter(
          (binding) =>
            binding.provider === CLAUDE_DRIVER &&
            readResumeCursor(binding.resumeCursor) === input.sessionId &&
            readRuntimePayloadCwd(binding.runtimePayload) === input.cwd,
        );
        for (const candidate of candidates) {
          const activeThread = yield* input.projectionSnapshotQuery
            .getThreadShellById(candidate.threadId)
            .pipe(
              Effect.mapError(
                (cause) =>
                  new ProjectClaudeSessionImportError({
                    cwd: input.cwd,
                    sessionId: input.sessionId,
                    failure: "claude_project_read_failed",
                    detail: "Failed to inspect existing imported Claude thread.",
                    cause,
                  }),
              ),
            );
          if (Option.isSome(activeThread)) {
            return candidate.threadId;
          }
        }
        return null;
      }),
    ),
  );
}

function readResumeCursor(value: unknown): string | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const resume = (value as { readonly resume?: unknown }).resume;
  return typeof resume === "string" ? resume : null;
}

function readRuntimePayloadCwd(value: unknown): string | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const cwd = (value as { readonly cwd?: unknown }).cwd;
  return typeof cwd === "string" ? normalizeCwd(cwd) : null;
}

function verifyClaudeSessionFile(
  cwd: string,
  sessionId: ClaudeSessionId,
  filePath: string,
): Effect.Effect<void, ProjectClaudeSessionImportError> {
  return Effect.tryPromise({
    try: async () => {
      const stat = await NodeFSP.lstat(filePath);
      if (!stat.isFile() || stat.size === 0) {
        throw new Error(`Claude session path is not a file: ${filePath}`);
      }
    },
    catch: (cause) =>
      new ProjectClaudeSessionImportError({
        cwd,
        sessionId,
        failure: isMissingPath(cause) ? "claude_session_not_found" : "claude_session_invalid",
        detail: isMissingPath(cause)
          ? `Claude session '${sessionId}' was not found for this project cwd.`
          : `Claude session '${sessionId}' is not readable.`,
        cause,
      }),
  });
}

function readClaudeSessionMetadata(
  sessionId: ClaudeSessionId,
  filePath: string,
): Effect.Effect<ProjectClaudeSession | null> {
  return Effect.promise(async () => {
    try {
      const stat = await NodeFSP.lstat(filePath);
      if (!stat.isFile()) {
        return null;
      }
      return {
        sessionId,
        path: filePath,
        updatedAt: stat.mtime.toISOString(),
        createdAt: stat.birthtime.toISOString(),
        sizeBytes: stat.size,
      };
    } catch {
      return null;
    }
  });
}

function readClaudeSessionSummary(
  session: ProjectClaudeSession,
): Effect.Effect<ProjectClaudeSession> {
  return Effect.promise(async () => {
    try {
      const chunk = await readInitialChunk(session.path);
      const labels = summarizeClaudeSessionChunk(chunk);
      return {
        ...session,
        ...(labels.title ? { title: labels.title } : {}),
        ...(labels.firstUserMessage ? { firstUserMessage: labels.firstUserMessage } : {}),
      };
    } catch {
      return session;
    }
  });
}

function readClaudeSessionSummaryForImport(
  cwd: string,
  sessionId: ClaudeSessionId,
  filePath: string,
): Effect.Effect<ProjectClaudeSession | null, ProjectClaudeSessionImportError> {
  return Effect.tryPromise({
    try: async () => {
      const stat = await NodeFSP.lstat(filePath);
      const chunk = await readInitialChunk(filePath);
      if (!chunkHasJsonObjectRecord(chunk)) {
        throw new Error("Claude session JSONL did not contain a JSON object record.");
      }
      const labels = summarizeClaudeSessionChunk(chunk);
      return {
        sessionId,
        path: filePath,
        updatedAt: stat.mtime.toISOString(),
        createdAt: stat.birthtime.toISOString(),
        sizeBytes: stat.size,
        ...(labels.title ? { title: labels.title } : {}),
        ...(labels.firstUserMessage ? { firstUserMessage: labels.firstUserMessage } : {}),
      };
    },
    catch: (cause) =>
      new ProjectClaudeSessionImportError({
        cwd,
        sessionId,
        failure: "claude_session_invalid",
        detail: `Claude session '${sessionId}' is not valid Claude Code JSONL.`,
        cause,
      }),
  });
}

async function readInitialChunk(filePath: string): Promise<string> {
  const handle = await NodeFSP.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(CLAUDE_SESSION_CHUNK_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, CLAUDE_SESSION_CHUNK_BYTES, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}

export function summarizeClaudeSessionChunk(input: string): {
  readonly title: string | null;
  readonly firstUserMessage: string | null;
} {
  let title: string | null = null;
  let firstUserMessage: string | null = null;

  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parsed = parseRecord(trimmed);
    if (!parsed) continue;

    title ??= normalizeLabel(extractSummary(parsed));
    if (!firstUserMessage && isUserRecord(parsed)) {
      firstUserMessage = normalizeLabel(extractText(parsed.message?.content ?? parsed.content));
    }
    if (title && firstUserMessage) break;
  }

  return {
    title: title ?? firstUserMessage,
    firstUserMessage,
  };
}

function importClaudeTranscriptMessages(input: {
  readonly createdAt: string;
  readonly cwd: string;
  readonly messages: ReadonlyArray<ClaudeTranscriptMessage>;
  readonly orchestrationEngine: OrchestrationEngine.OrchestrationEngineService["Service"];
  readonly sessionId: ClaudeSessionId;
  readonly threadId: ThreadId;
}): Effect.Effect<void, ProjectClaudeSessionImportError> {
  return Effect.gen(function* () {
    for (const message of input.messages) {
      yield* input.orchestrationEngine
        .dispatch({
          type: "thread.message.import",
          commandId: CommandId.make(`import-claude-message:${input.threadId}:${message.sourceId}`),
          threadId: input.threadId,
          messageId: MessageId.make(
            `claude:${input.threadId}:${input.sessionId}:${message.sourceId}`,
          ),
          role: message.role,
          text: message.text,
          messageCreatedAt: message.createdAt,
          createdAt: input.createdAt,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new ProjectClaudeSessionImportError({
                cwd: input.cwd,
                sessionId: input.sessionId,
                failure: "claude_transcript_import_failed",
                detail: "Failed to import Claude transcript messages.",
                cause,
              }),
          ),
        );
    }
  });
}

function readClaudeTranscriptMessages(input: {
  readonly cwd: string;
  readonly filePath: string;
  readonly sessionId: ClaudeSessionId;
}): Effect.Effect<ReadonlyArray<ClaudeTranscriptMessage>, ProjectClaudeSessionImportError> {
  return Effect.tryPromise({
    try: async () => {
      const stat = await NodeFSP.lstat(input.filePath);
      const fallbackCreatedAt = stat.mtime.toISOString();
      const stream = NodeFS.createReadStream(input.filePath, { encoding: "utf8" });
      const lines = NodeReadlinePromises.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });
      const messages: Array<ClaudeTranscriptMessage> = [];
      let lineNumber = 0;
      let lastMessageCreatedAtMs: number | null = null;
      let totalChars = 0;
      try {
        for await (const line of lines) {
          lineNumber += 1;
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          const parsed = parseRecord(trimmed);
          if (!parsed) continue;
          const message = readClaudeTranscriptMessage({
            fallbackCreatedAt,
            lastMessageCreatedAtMs,
            lineNumber,
            record: parsed,
          });
          if (message !== null) {
            lastMessageCreatedAtMs = Date.parse(message.createdAt);
            messages.push(message);
            totalChars += message.text.length;
            while (
              messages.length > CLAUDE_TRANSCRIPT_IMPORT_MAX_MESSAGES ||
              totalChars > CLAUDE_TRANSCRIPT_IMPORT_MAX_TOTAL_CHARS
            ) {
              const removed = messages.shift();
              if (removed === undefined) break;
              totalChars -= removed.text.length;
            }
          }
        }
      } finally {
        lines.close();
      }
      return messages;
    },
    catch: (cause) =>
      new ProjectClaudeSessionImportError({
        cwd: input.cwd,
        sessionId: input.sessionId,
        failure: "claude_transcript_import_failed",
        detail: `Failed to read Claude session transcript '${input.sessionId}'.`,
        cause,
      }),
  });
}

function readClaudeTranscriptMessage(input: {
  readonly fallbackCreatedAt: string;
  readonly lastMessageCreatedAtMs: number | null;
  readonly lineNumber: number;
  readonly record: Record<string, any>;
}): ClaudeTranscriptMessage | null {
  if (input.record.isSidechain === true) {
    return null;
  }
  const role = readClaudeTranscriptRole(input.record);
  if (role === null) {
    return null;
  }
  const text = normalizeTranscriptText(
    extractTranscriptText(input.record.message?.content ?? input.record.content),
  );
  if (text === null) {
    return null;
  }
  const uuid = typeof input.record.uuid === "string" ? input.record.uuid.trim() : "";
  return {
    sourceId: uuid.length > 0 ? uuid : `${role}:${input.lineNumber}`,
    role,
    text,
    createdAt: normalizeMonotonicIsoDateTime({
      fallback: input.fallbackCreatedAt,
      lastTimestampMs: input.lastMessageCreatedAtMs,
      value: input.record.timestamp,
    }),
  };
}

function readClaudeTranscriptRole(record: Record<string, any>): OrchestrationMessageRole | null {
  const role = record.message?.role ?? record.role ?? record.type;
  if (role === "user" || role === "assistant") {
    return role;
  }
  return null;
}

function extractTranscriptText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts: Array<string> = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        parts.push(record.text);
      }
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function normalizeTranscriptText(value: string | null): string | null {
  const normalized = value?.replace(/\r\n?/g, "\n").trim() ?? "";
  if (normalized.length === 0) return null;
  if (normalized.length <= CLAUDE_TRANSCRIPT_IMPORT_MAX_MESSAGE_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, CLAUDE_TRANSCRIPT_IMPORT_MAX_MESSAGE_CHARS).trimEnd()}\n\n[Imported transcript message truncated.]`;
}

function normalizeMonotonicIsoDateTime(input: {
  readonly fallback: string;
  readonly lastTimestampMs: number | null;
  readonly value: unknown;
}): string {
  const candidate =
    typeof input.value === "string" && input.value.trim() ? input.value : input.fallback;
  const parsedCandidate = Date.parse(candidate);
  const base = Number.isNaN(parsedCandidate) ? input.fallback : candidate;
  const parsedBase = Date.parse(base);
  const baseTimestampMs = Number.isNaN(parsedBase) ? Date.parse(input.fallback) : parsedBase;
  const nextTimestampMs =
    input.lastTimestampMs !== null && baseTimestampMs <= input.lastTimestampMs
      ? input.lastTimestampMs + 1
      : baseTimestampMs;
  return DateTime.formatIso(
    DateTime.mapEpochMillis(DateTime.makeUnsafe(base), () => nextTimestampMs),
  );
}

function parseRecord(input: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(input);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function chunkHasJsonObjectRecord(input: string): boolean {
  return input.split(/\r?\n/).some((line) => parseRecord(line.trim()) !== null);
}

function extractSummary(record: Record<string, any>): string | null {
  if (typeof record.summary === "string") return record.summary;
  if (typeof record.title === "string") return record.title;
  if (typeof record.message?.summary === "string") return record.message.summary;
  return null;
}

function isUserRecord(record: Record<string, any>): boolean {
  return record.type === "user" || record.role === "user" || record.message?.role === "user";
}

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const parts: Array<string> = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (typeof record.text === "string") {
        parts.push(record.text);
      }
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function normalizeLabel(value: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length === 0) return null;
  if (normalized.length <= CLAUDE_SESSION_LABEL_MAX_CHARS) return normalized;
  return `${normalized.slice(0, CLAUDE_SESSION_LABEL_MAX_CHARS - 1).trimEnd()}...`;
}

function selectClaudeProvider(input: {
  readonly providerRegistry: ProviderRegistry.ProviderRegistry["Service"];
  readonly cwd: string;
  readonly sessionId: ClaudeSessionId;
  readonly projectDefaultInstanceId: ServerProvider["instanceId"] | null;
}): Effect.Effect<ServerProvider, ProjectClaudeSessionImportError> {
  return input.providerRegistry.getProviders.pipe(
    Effect.flatMap((providers) => {
      const availableClaudeProviders = providers.filter(
        (candidate): candidate is ServerProvider =>
          candidate.driver === CLAUDE_DRIVER &&
          candidate.enabled &&
          candidate.installed &&
          candidate.status !== "disabled" &&
          candidate.status !== "error" &&
          candidate.auth.status !== "unauthenticated" &&
          isProviderAvailable(candidate),
      );
      const provider =
        availableClaudeProviders.find(
          (candidate) =>
            input.projectDefaultInstanceId !== null &&
            candidate.instanceId === input.projectDefaultInstanceId,
        ) ?? availableClaudeProviders[0];
      return provider
        ? Effect.succeed(provider)
        : Effect.fail(
            new ProjectClaudeSessionImportError({
              cwd: input.cwd,
              sessionId: input.sessionId,
              failure: "claude_provider_unavailable",
              detail: "No available Claude provider instance is configured.",
            }),
          );
    }),
  );
}
