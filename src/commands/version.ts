import { intro, isCancel, log, outro, select, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import color from "picocolors";
import {
  createVersion,
  getVersion,
  getVersions,
  publishVersion,
  updateVersion,
} from "../api.ts";
import { buildAppSchema, buildUiCode } from "../build.ts";
import { compare, inc, ReleaseType } from "semver";
import debounce from "p-debounce";
import { watch } from "node:fs/promises";
import { selectApp, selectAppVersion, selectProject } from "../shared.ts";
import { handleCancel } from "../utils.ts";

const create = defineCommand({
  meta: {
    name: "create",
    description: "Create a new app version",
  },
  args: {
    entrypoint: {
      type: "string",
      alias: "e",
      required: true,
    },
    uiEntrypoint: {
      type: "string",
      required: false,
      alias: "u",
    },
    app: {
      type: "string",
      required: false,
      alias: "a",
    },
    project: {
      type: "string",
      required: false,
      alias: "p",
      description: "Project ID",
    },
    version: {
      type: "string",
      required: false,
      description: "",
    },
    debug: {
      type: "boolean",
      alias: "d",
      default: false,
    },
  },
  async run({ args }) {
    intro(color.inverse(" CLI "));

    const projectId = args.project ?? (await selectProject());
    const appId = args.app ?? (await selectApp(projectId));
    let version = args.version;

    if (!version) {
      const versions = await getVersions(appId);

      const latestVersion = versions
        .sort((a, b) => compare(a.version, b.version))
        .pop();

      if (latestVersion) {
        log.info(`Latest version: ${latestVersion.version}`);

        const versionBump = await select<ReleaseType>({
          message: "Pick a version bump",
          options: [
            { value: "major", label: "Major" },
            { value: "minor", label: "Minor" },
            { value: "patch", label: "Patch" },
          ],
          initialValue: "minor",
        });

        if (isCancel(versionBump)) {
          handleCancel("Operation cancelled");
        }

        const nextVersion = inc(latestVersion.version, versionBump);

        if (!nextVersion) {
          handleCancel("Invalid version bump");
        }

        log.info(`Next version: ${nextVersion}`);

        version = nextVersion;
      } else {
        log.info("No versions found, creating new version: 1.0.0");

        version = "1.0.0";
      }
    }

    const s = spinner();
    s.start("Building the app schema...");

    const appSchemaCode = await buildAppSchema(args.entrypoint);

    s.stop("App schema built!");

    if (args.debug) {
      log.info(appSchemaCode);
    }

    let uiCode = "";

    if (args.uiEntrypoint) {
      const s = spinner();
      s.start("Building the app UI...");

      uiCode = await buildUiCode(args.uiEntrypoint);

      s.stop("App UI built!");

      if (args.debug) {
        log.info(uiCode);
      }
    }

    s.start("Creating the app version...");

    const appVersionId = await createVersion(
      appId,
      version,
      appSchemaCode,
      uiCode,
    );

    s.stop("App version created!");

    outro(`ID: ${appVersionId}`);
  },
});

const publish = defineCommand({
  meta: {
    name: "publish",
    description: "Publish an app version",
  },
  args: {
    id: {
      type: "string",
      required: false,
      description: "App version ID",
    },
    project: {
      type: "string",
      required: false,
      alias: "p",
      description: "Project ID",
    },
    app: {
      type: "string",
      required: false,
      alias: "a",
      description: "App ID",
    },
  },
  async run({ args }) {
    intro(color.inverse(" CLI "));

    let appVersionId = args.id;

    if (!appVersionId) {
      const projectId = args.project ?? (await selectProject());
      const appId = args.app ?? (await selectApp(projectId));
      appVersionId = await selectAppVersion(appId);
    }

    const s = spinner();
    s.start("Publishing the app version...");

    await publishVersion(appVersionId);

    s.stop("App version published!");
  },
});

const watcherCtrl = new AbortController();

const update = defineCommand({
  meta: {
    name: "update",
    description: "Update an app version",
  },
  args: {
    id: {
      type: "string",
      required: false,
    },
    entrypoint: {
      type: "string",
      required: true,
      alias: "e",
    },
    uiEntrypoint: {
      type: "string",
      required: false,
      alias: "u",
    },
    project: {
      type: "string",
      required: false,
      alias: "p",
      description: "Project ID",
    },
    app: {
      type: "string",
      required: false,
      alias: "a",
      description: "App ID",
    },
    watch: {
      type: "boolean",
      alias: "w",
      default: false,
    },
  },
  cleanup() {
    watcherCtrl.abort();
  },
  async run({ args }) {
    intro(color.inverse(" CLI "));

    let appVersionId = args.id;

    if (!appVersionId) {
      const projectId = args.project ?? (await selectProject());
      const appId = args.app ?? (await selectApp(projectId));

      appVersionId = await selectAppVersion(appId);
    }

    const s = spinner();
    s.start("Fetching the app version...");

    const version = await getVersion(appVersionId);

    if (!version.draft) {
      handleCancel("App version is not a draft!");
    }

    s.stop("App version fetched!");

    const build = async () => {
      s.start("Building the app schema...");

      const appSchemaCode = await buildAppSchema(args.entrypoint);

      s.stop("App schema built!");

      if (args.debug) {
        log.info(appSchemaCode);
      }

      let uiCode = "";

      if (args.uiEntrypoint) {
        s.start("Building the app UI...");

        uiCode = await buildUiCode(args.uiEntrypoint);

        s.stop("App UI built!");

        if (args.debug) {
          log.info(uiCode);
        }
      }

      s.start("Updating the app version...");

      await updateVersion(appVersionId, appSchemaCode, uiCode);

      s.stop("App version updated!");
    };

    if (args.watch) {
      await build();
      log.info("Watching for changes...");

      const watcher = watch(process.cwd(), {
        recursive: true,
        signal: watcherCtrl.signal,
      });

      await Array.fromAsync(
        watcher,
        debounce(async () => {
          log.info("Changes detected, rebuilding...");
          await build();
          log.info("Watching for changes...");
        }, 200),
      );
    } else {
      await build();
    }
  },
});

const list = defineCommand({
  meta: {
    name: "list",
    description: "List app versions",
  },
  args: {
    app: {
      type: "string",
      required: false,
      alias: "a",
      description: "App ID",
    },
    project: {
      type: "string",
      required: false,
      alias: "p",
      description: "Project ID",
    },
  },
  async run({ args }) {
    intro(color.inverse(" CLI "));

    const projectId = args.project ?? (await selectProject());
    const appId = args.app ?? (await selectApp(projectId));

    const s = spinner();
    s.start("Fetching the app versions...");

    const versions = await getVersions(appId);

    s.stop("App versions fetched!");

    for (const version of versions) {
      log.info(`Version: ${version.version} (${version.id})`);
    }
  },
});

const bundle = defineCommand({
  meta: {
    name: "bundle",
    description: "Create a .tar.gz bundle from app version files",
  },
  args: {
    entrypoint: {
      type: "string",
      alias: "e",
      required: true,
      description: "Path to the main app entrypoint file",
    },
    uiEntrypoint: {
      type: "string",
      required: false,
      alias: "u",
      description: "Path to the UI entrypoint file",
    },
    output: {
      type: "string",
      alias: "o",
      required: false,
      description:
        "Output path for the .tar.gz bundle (defaults to 'bundle.tar.gz')",
    },
    debug: {
      type: "boolean",
      alias: "d",
      default: false,
      description: "Enable debug output",
    },
  },
  async run({ args }) {
    intro(color.inverse(" CLI "));

    const s = spinner();
    s.start("Building the app schema...");

    const appSchemaCode = await buildAppSchema(args.entrypoint);

    s.stop("App schema built!");

    if (args.debug) {
      log.info("App schema code:");
      log.info(appSchemaCode);
    }

    let uiCode = "";

    if (args.uiEntrypoint) {
      s.start("Building the app UI...");

      uiCode = await buildUiCode(args.uiEntrypoint);

      s.stop("App UI built!");

      if (args.debug) {
        log.info("UI code:");
        log.info(uiCode);
      }
    }

    s.start("Creating bundle...");

    const { writeFile, mkdir, unlink, rmdir } = await import(
      "node:fs/promises"
    );
    const { join } = await import("node:path");
    const tar = await import("tar");

    // Use default output filename if not specified
    const outputPath = args.output || "bundle.tar.gz";

    // Create temporary files to include in the tar
    const tempDir = join(process.cwd(), ".tmp-bundle");
    const appPath = join(tempDir, "app.js");
    const uiPath = join(tempDir, "ui.js");

    try {
      // Ensure temp directory exists and write files
      await mkdir(tempDir, { recursive: true });
      await writeFile(appPath, appSchemaCode);

      if (uiCode) {
        await writeFile(uiPath, uiCode);
      }

      // Create tar.gz bundle
      const files = ["app.js"];
      if (uiCode) {
        files.push("ui.js");
      }

      await tar.create(
        {
          gzip: true,
          file: outputPath,
          cwd: tempDir,
        },
        files,
      );

      s.stop("Bundle created!");

      outro(`Bundle saved to: ${outputPath}`);
    } finally {
      // Clean up temporary files
      try {
        await unlink(appPath).catch(() => {});
        if (uiCode) {
          await unlink(uiPath).catch(() => {});
        }
        await rmdir(tempDir).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    }
  },
});

export default defineCommand({
  meta: {
    name: "version",
    description: "App version management",
  },
  subCommands: {
    create,
    publish,
    update,
    list,
    bundle,
  },
});
