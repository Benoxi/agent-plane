// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  encodeClaudeProjectCwd,
  makeClaudeSessionImport,
  summarizeClaudeSessionChunk,
} from "./ClaudeSessionImport.ts";

const PROJECT_ID = ProjectId.make("project-claude-import");
const THREAD_ID = ThreadId.make("thread-claude-import");
const CLAUDE_PROVIDER = ProviderDriverKind.make("claudeAgent");
const CLAUDE_INSTANCE = ProviderInstanceId.make("claudeAgent");
const SESSION_ID_1 = "00000000-0000-4000-8000-000000000001";
const SESSION_ID_2 = "00000000-0000-4000-8000-000000000002";

function makeProjectShell(workspaceRoot: string) {
  return {
    id: PROJECT_ID,
    title: "Import project",
    workspaceRoot,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeService(workspaceRoot: string) {
  return makeClaudeSessionImport({
    orchestrationEngine: {
      dispatch: () => Effect.void,
    } as any,
    projectionSnapshotQuery: {
      getProjectShellById: (projectId: ProjectId) =>
        Effect.succeed(
          projectId === PROJECT_ID ? Option.some(makeProjectShell(workspaceRoot)) : Option.none(),
        ),
    } as any,
    providerRegistry: {
      getProviders: Effect.succeed([
        {
          instanceId: CLAUDE_INSTANCE,
          driver: CLAUDE_PROVIDER,
          enabled: true,
          installed: true,
          version: null,
          status: "ready",
          auth: { status: "authenticated" },
          checkedAt: "2026-01-01T00:00:00.000Z",
          models: [
            {
              slug: "claude-sonnet-5",
              name: "Claude Sonnet 5",
              isCustom: false,
              capabilities: null,
            },
          ],
          slashCommands: [],
          skills: [],
        } satisfies ServerProvider,
      ]),
    } as any,
    providerSessionDirectory: {
      upsert: () => Effect.void,
      listBindings: () => Effect.succeed([]),
    } as any,
  });
}

function withClaudeConfigDir<A, E, R>(
  run: (configDir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.promise(async () => {
      const previous = process.env.CLAUDE_CONFIG_DIR;
      const tempRoot = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-claude-import-"));
      const configDir = NodePath.join(tempRoot, ".claude");
      process.env.CLAUDE_CONFIG_DIR = configDir;
      return { configDir, previous, tempRoot };
    }),
    ({ configDir }) => run(configDir),
    ({ previous, tempRoot }) =>
      Effect.promise(async () => {
        if (previous === undefined) {
          delete process.env.CLAUDE_CONFIG_DIR;
        } else {
          process.env.CLAUDE_CONFIG_DIR = previous;
        }
        await NodeFSP.rm(tempRoot, { force: true, recursive: true });
      }),
  );
}

async function writeClaudeSession(input: {
  readonly configDir: string;
  readonly cwd: string;
  readonly sessionId: string;
  readonly text: string;
  readonly mtime: number;
}) {
  const directory = NodePath.join(input.configDir, "projects", encodeClaudeProjectCwd(input.cwd));
  await NodeFSP.mkdir(directory, { recursive: true });
  const filePath = NodePath.join(directory, `${input.sessionId}.jsonl`);
  await NodeFSP.writeFile(filePath, input.text);
  await NodeFSP.utimes(filePath, input.mtime, input.mtime);
  return filePath;
}

describe("ClaudeSessionImport", () => {
  it("encodes Claude project cwd using Claude Code's slash replacement", () => {
    expect(encodeClaudeProjectCwd("/home/alice/work/app")).toBe("-home-alice-work-app");
  });

  it("normalizes relative cwd before encoding", () => {
    expect(encodeClaudeProjectCwd(".")).toBe(NodePath.resolve(".").replace(/[\\/]/g, "-"));
  });

  it("extracts a summary and first user message from Claude JSONL chunks", () => {
    const result = summarizeClaudeSessionChunk(
      [
        JSON.stringify({ type: "summary", summary: "Existing project context" }),
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [{ type: "text", text: "Please fix the failing tests." }],
          },
        }),
      ].join("\n"),
    );

    expect(result).toEqual({
      title: "Existing project context",
      firstUserMessage: "Please fix the failing tests.",
    });
  });

  it("falls back to the first user message when no summary exists", () => {
    const result = summarizeClaudeSessionChunk(
      JSON.stringify({
        message: {
          role: "user",
          content: "Continue the import flow.",
        },
      }),
    );

    expect(result).toEqual({
      title: "Continue the import flow.",
      firstUserMessage: "Continue the import flow.",
    });
  });

  it.effect("lists recent sessions for the validated project cwd", () =>
    withClaudeConfigDir((configDir) =>
      Effect.gen(function* () {
        const workspaceRoot = yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-project-")),
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => NodeFSP.rm(workspaceRoot, { force: true, recursive: true })),
        );
        yield* Effect.promise(() =>
          writeClaudeSession({
            configDir,
            cwd: workspaceRoot,
            sessionId: SESSION_ID_1,
            text: '{"type":"summary","summary":"Older session"}',
            mtime: 1_767_225_600,
          }),
        );
        yield* Effect.promise(() =>
          writeClaudeSession({
            configDir,
            cwd: workspaceRoot,
            sessionId: SESSION_ID_2,
            text: '{"type":"summary","summary":"Newer session"}',
            mtime: 1_767_312_000,
          }),
        );

        const service = makeService(workspaceRoot);
        const result = yield* service.list({ cwd: workspaceRoot, projectId: PROJECT_ID, limit: 1 });

        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]?.sessionId).toBe(SESSION_ID_2);
        expect(result.sessions[0]?.title).toBe("Newer session");
        expect(result.truncated).toBe(true);
      }),
    ),
  );

  it.effect("rejects a cwd that does not match the target project", () =>
    withClaudeConfigDir(() =>
      Effect.gen(function* () {
        const workspaceRoot = yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-project-")),
        );
        const otherRoot = yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-other-project-")),
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => NodeFSP.rm(workspaceRoot, { force: true, recursive: true })),
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => NodeFSP.rm(otherRoot, { force: true, recursive: true })),
        );
        const service = makeService(workspaceRoot);
        const error = yield* service
          .list({ cwd: otherRoot, projectId: PROJECT_ID, limit: 20 })
          .pipe(Effect.flip);

        expect(error.failure).toBe("project_cwd_mismatch");
      }),
    ),
  );

  it.effect("rejects symlinked Claude session files on import", () =>
    withClaudeConfigDir((configDir) =>
      Effect.gen(function* () {
        const workspaceRoot = yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-project-")),
        );
        const outsideRoot = yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-outside-")),
        );
        const outsideFile = NodePath.join(outsideRoot, "session.jsonl");
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => NodeFSP.rm(workspaceRoot, { force: true, recursive: true })),
        );
        yield* Effect.addFinalizer(() =>
          Effect.promise(() => NodeFSP.rm(outsideRoot, { force: true, recursive: true })),
        );
        yield* Effect.promise(() =>
          NodeFSP.writeFile(outsideFile, '{"type":"summary","summary":"Outside session"}'),
        );
        const directory = NodePath.join(
          configDir,
          "projects",
          encodeClaudeProjectCwd(workspaceRoot),
        );
        yield* Effect.promise(() => NodeFSP.mkdir(directory, { recursive: true }));
        yield* Effect.promise(() =>
          NodeFSP.symlink(outsideFile, NodePath.join(directory, `${SESSION_ID_1}.jsonl`)),
        );

        const service = makeService(workspaceRoot);
        const error = yield* service
          .importSession({
            cwd: workspaceRoot,
            projectId: PROJECT_ID,
            threadId: THREAD_ID,
            sessionId: SESSION_ID_1,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          })
          .pipe(Effect.flip);

        expect(error.failure).toBe("claude_session_invalid");
      }),
    ),
  );
});
