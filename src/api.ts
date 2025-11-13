import { getAuthHeaders, getBaseUrl } from "./auth.ts";
import { handleCancel } from "./utils.ts";

async function apiFetch(path: string, body: any) {
  const headers = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  } as Record<string, string>;

  const baseUrl = await getBaseUrl();

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  let errorMessage = res.ok ? null : res.statusText;

  try {
    const json = await res.json();

    if (json.error) {
      throw new Error(json.error);
    }

    return json;
  } catch (err) {
    if (err instanceof Error) {
      errorMessage = err.message;
    }

    handleCancel(`Error: ${errorMessage ?? "Unknown error"}`);
  }
}

export async function getApps(projectId: string) {
  const data = await apiFetch("/cli/apps/list_apps", { projectId });

  return data.data.apps;
}

export async function createApp(
  name: string,
  description: string,
  blockColor: string,
  blockIconUrl: string,
  projectId: string,
) {
  const res = await apiFetch("/cli/apps/create_app", {
    name,
    description,
    projectId,
    blockStyle: {
      color: blockColor,
      iconUrl: blockIconUrl,
    },
  });

  return res.data.app.id;
}

export async function createVersion(
  appId: string,
  version: string,
  code: string,
  sourceMap: string,
  uiCode: string,
) {
  const res = await apiFetch("/cli/apps/create_version", {
    customAppId: appId,
    version,
    code,
    sourceMap,
    uiCode,
  });
  return res.data.appVersion.id;
}

export async function getVersion(appVersionId: string) {
  const data = await apiFetch("/cli/apps/get_version", { id: appVersionId });
  return data.data.appVersion;
}

export async function publishVersion(appVersionId: string) {
  await apiFetch("/cli/apps/update_version", {
    id: appVersionId,
    draft: false,
  });
}

export async function getVersions(appId: string) {
  const data = await apiFetch("/cli/apps/list_versions", {
    customAppId: appId,
  });
  return data.data.versions;
}

export async function updateVersion(
  appVersionId: string,
  code: string,
  sourceMap: string,
  uiCode: string,
) {
  await apiFetch("/cli/apps/update_version", {
    id: appVersionId,
    code,
    sourceMap,
    uiCode,
  });
}

export async function getProjects() {
  const data = await apiFetch("/cli/projects", {});
  return data.projects as Array<{ id: string; name: string }>;
}
