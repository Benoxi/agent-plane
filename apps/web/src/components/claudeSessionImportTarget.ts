import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

export interface ClaudeSessionImportTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly environmentLabel?: string;
}

export function claudeSessionImportTargetForProject(project: {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly environmentLabel?: string | null;
}): ClaudeSessionImportTarget {
  return {
    environmentId: project.environmentId,
    projectId: project.id,
    title: project.title,
    workspaceRoot: project.workspaceRoot,
    ...(project.environmentLabel ? { environmentLabel: project.environmentLabel } : {}),
  };
}
