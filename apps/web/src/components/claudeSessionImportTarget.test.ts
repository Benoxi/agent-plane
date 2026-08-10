import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { claudeSessionImportTargetForProject } from "./claudeSessionImportTarget";

describe("claudeSessionImportTargetForProject", () => {
  it("preserves the selected physical project and workspace", () => {
    expect(
      claudeSessionImportTargetForProject({
        environmentId: EnvironmentId.make("environment-remote"),
        id: ProjectId.make("project-member-b"),
        title: "Agent Plane (remote)",
        workspaceRoot: "/srv/agent-plane",
        environmentLabel: "Remote workstation",
      }),
    ).toEqual({
      environmentId: "environment-remote",
      projectId: "project-member-b",
      title: "Agent Plane (remote)",
      workspaceRoot: "/srv/agent-plane",
      environmentLabel: "Remote workstation",
    });
  });

  it("omits an unavailable environment label", () => {
    expect(
      claudeSessionImportTargetForProject({
        environmentId: EnvironmentId.make("environment-local"),
        id: ProjectId.make("project-local"),
        title: "Agent Plane",
        workspaceRoot: "/workspace/agent-plane",
        environmentLabel: null,
      }),
    ).toEqual({
      environmentId: "environment-local",
      projectId: "project-local",
      title: "Agent Plane",
      workspaceRoot: "/workspace/agent-plane",
    });
  });
});
