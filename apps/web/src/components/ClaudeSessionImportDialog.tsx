import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  CLAUDE_SESSION_ID_PATTERN,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ClaudeSessionId,
  type EnvironmentId,
  type ProjectClaudeSession,
  type ProjectId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { newThreadId } from "~/lib/utils";
import { projectEnvironment } from "~/state/projects";
import { readThreadShell } from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { environmentShell } from "~/state/shell";
import { useAtomCommand } from "~/state/use-atom-command";
import { buildThreadRouteParams } from "~/threadRoutes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { stackedThreadToast, toastManager } from "./ui/toast";

export interface ClaudeSessionImportTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly environmentLabel?: string;
}

interface ClaudeSessionImportDialogProps {
  readonly target: ClaudeSessionImportTarget | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function shortSessionId(sessionId: string): string {
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-6)}`;
}

function sessionTitle(session: ProjectClaudeSession): string {
  return (
    session.title ??
    session.firstUserMessage ??
    `Claude session ${shortSessionId(session.sessionId)}`
  );
}

function sessionDescription(session: ProjectClaudeSession): string {
  const details = [formatRelativeTimeLabel(session.updatedAt), shortSessionId(session.sessionId)];
  return details.join(" - ");
}

function isValidClaudeSessionId(value: string): value is ClaudeSessionId {
  return CLAUDE_SESSION_ID_PATTERN.test(value.trim());
}

async function waitForImportedThreadShell(
  ref: ReturnType<typeof scopeThreadRef>,
  options: { readonly timeoutMs: number },
): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() <= deadline) {
    if (readThreadShell(ref) !== null) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return readThreadShell(ref) !== null;
}

export function ClaudeSessionImportDialog({
  target,
  open,
  onOpenChange,
}: ClaudeSessionImportDialogProps) {
  const navigate = useNavigate();
  const [manualSessionId, setManualSessionId] = useState("");
  const [importingSessionId, setImportingSessionId] = useState<string | null>(null);
  const importClaudeSession = useAtomCommand(projectEnvironment.importClaudeSession, {
    reportFailure: false,
  });

  const queryAtom = useMemo(() => {
    if (!open || !target) return null;
    return projectEnvironment.listClaudeSessions({
      environmentId: target.environmentId,
      input: {
        cwd: target.workspaceRoot,
        projectId: target.projectId,
        limit: 20,
      },
    });
  }, [open, target]);
  const sessionsQuery = useEnvironmentQuery(queryAtom);
  const shellQueryAtom = useMemo(() => {
    if (!target) return null;
    return environmentShell.stateAtom(target.environmentId);
  }, [target]);
  const shellQuery = useEnvironmentQuery(shellQueryAtom);

  const normalizedManualSessionId = manualSessionId.trim();
  const canImportManual = target !== null && isValidClaudeSessionId(normalizedManualSessionId);
  const sessions = sessionsQuery.data?.sessions ?? [];

  useEffect(() => {
    setManualSessionId("");
  }, [open, target?.environmentId, target?.projectId]);

  const importSession = async (sessionId: ClaudeSessionId, title?: string) => {
    if (!target) return;
    const threadId = newThreadId();
    const threadRef = scopeThreadRef(target.environmentId, threadId);
    setImportingSessionId(sessionId);
    try {
      const result = await importClaudeSession({
        environmentId: target.environmentId,
        input: {
          cwd: target.workspaceRoot,
          projectId: target.projectId,
          threadId,
          sessionId,
          title: title ?? `Claude import ${shortSessionId(sessionId)}`,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        },
      });

      if (result._tag !== "Success") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to import Claude session",
              description: error instanceof Error ? error.message : "The import failed.",
            }),
          );
        }
        return;
      }

      onOpenChange(false);
      setManualSessionId("");
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "Claude thread imported",
          description: shortSessionId(result.value.sessionId),
        }),
      );
      shellQuery.refresh();
      if (await waitForImportedThreadShell(threadRef, { timeoutMs: 2_500 })) {
        await navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(threadRef),
        });
      }
    } finally {
      setImportingSessionId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Claude thread</DialogTitle>
          <DialogDescription>
            {target
              ? `Resume a Claude Code CLI session from ${target.workspaceRoot}.`
              : "Resume a Claude Code CLI session."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (canImportManual) {
                void importSession(normalizedManualSessionId);
              }
            }}
          >
            <span className="text-xs font-medium text-foreground">Session id</span>
            <div className="flex min-w-0 gap-2">
              <Input
                aria-label="Claude session id"
                className="min-w-0 flex-1"
                value={manualSessionId}
                onChange={(event) => setManualSessionId(event.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                spellCheck={false}
              />
              <Button disabled={!canImportManual || importingSessionId !== null} type="submit">
                {importingSessionId === normalizedManualSessionId ? <LoaderIcon /> : null}
                Import
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-foreground">Recent sessions</span>
              <Button
                aria-label="Refresh Claude sessions"
                disabled={sessionsQuery.isPending}
                onClick={sessionsQuery.refresh}
                size="xs"
                variant="ghost"
              >
                <RefreshCwIcon className={sessionsQuery.isPending ? "animate-spin" : undefined} />
                Refresh
              </Button>
            </div>
            {sessionsQuery.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {sessionsQuery.error}
              </p>
            ) : sessions.length === 0 ? (
              <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                No Claude Code sessions found for this project cwd.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-md border border-border/70">
                <div className="divide-y divide-border/70">
                  {sessions.map((session) => {
                    const isImporting = importingSessionId === session.sessionId;
                    return (
                      <button
                        className="grid w-full min-w-0 gap-1 px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-64"
                        disabled={importingSessionId !== null}
                        key={session.sessionId}
                        onClick={() => void importSession(session.sessionId, sessionTitle(session))}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {sessionTitle(session)}
                          </span>
                          {isImporting ? (
                            <LoaderIcon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                          ) : null}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {sessionDescription(session)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {target?.environmentLabel ? (
            <p className="text-xs text-muted-foreground">Environment: {target.environmentLabel}</p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button
            disabled={importingSessionId !== null}
            onClick={() => onOpenChange(false)}
            variant="outline"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
