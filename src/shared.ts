import { isCancel, log, select } from "@clack/prompts";
import { getApps, getVersions, getProjects } from "./api";
import { compare } from "semver";
import { handleCancel } from "./utils";

export async function selectProject() {
  const projects: Array<{ id: string; name: string }> = await getProjects();

  if (projects.length === 0) {
    handleCancel("No projects found");
  }

  if (projects.length === 1) {
    const project = projects[0];
    log.info(`Using project: ${project.name}`);
    return project.id;
  }

  const projectId = await select<string>({
    message: "Pick a project",
    options: projects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  });

  if (isCancel(projectId)) {
    handleCancel("Operation cancelled");
  }

  return projectId;
}

export async function selectApp(projectId: string) {
  const apps = await getApps(projectId);

  const appId = await select<string>({
    message: "Pick an app",
    options: apps.map((app) => ({
      value: app.id,
      label: app.name,
    })),
  });

  if (isCancel(appId)) {
    handleCancel("Operation cancelled");
  }

  if (!appId) {
    handleCancel("No app selected");
  }

  return appId;
}

export async function selectAppVersion(appId: string) {
  const versions = await getVersions(appId);

  if (versions.length === 0) {
    handleCancel("No app versions found");
  }

  const appVersionId = await select<string>({
    message: "Pick an app version",
    options: versions
      .filter((version) => version.draft)
      .sort((a, b) => compare(b.version, a.version))
      .map((version) => ({
        value: version.id,
        label: version.version,
      })),
  });

  if (isCancel(appVersionId)) {
    handleCancel("Operation cancelled");
  }

  if (!appVersionId) {
    handleCancel("No app version selected");
  }

  return appVersionId;
}
