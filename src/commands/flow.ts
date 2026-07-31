import { intro, outro, spinner } from "@clack/prompts";
import { defineCommand } from "citty";
import color from "picocolors";
import { writeFile } from "node:fs/promises";
import { exportFlowDefinition } from "../api.ts";
import { selectFlow, selectProject } from "../shared.ts";
import { handleCancel } from "../utils.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const exportFlow = defineCommand({
  meta: {
    name: "export",
    description: "Export a flow definition",
  },
  args: {
    id: {
      type: "string",
      required: false,
      description: "Flow ID (prompts for one when omitted)",
    },
    project: {
      type: "string",
      required: false,
      alias: "p",
      description: "Project ID",
    },
    file: {
      type: "string",
      alias: "f",
      required: false,
      description: "Path to write the definition to (defaults to stdout)",
    },
  },
  async run({ args }) {
    // Bare arguments are dropped silently, so `export --id <id> out.yaml` would
    // quietly print to stdout instead of writing the file the user meant.
    // Unknown flags become named args rather than landing here.
    const [stray] = args._;
    if (stray) {
      const hint = args.file ? "" : " (use -f to write to a file)";
      handleCancel(`Unexpected argument: ${stray}${hint}`);
    }

    // `-f` with no value parses to an empty string, which is otherwise
    // indistinguishable from omitting it and would fall back to stdout.
    if (args.file !== undefined && args.file.trim() === "") {
      handleCancel("The --file option needs a path");
    }

    const mustSelect = !args.id;

    // Picking a flow needs a terminal to read the answer from, and the prompts
    // would otherwise end up in a redirected definition.
    if (mustSelect && !(process.stdin.isTTY && process.stdout.isTTY)) {
      handleCancel(
        "No flow ID given: pass --id when not running in a terminal",
      );
    }

    // The prompts and the spinner both draw on stdout, so they are only safe
    // when the definition is going to a file, or when we had to prompt anyway
    // — which only ever happens on a terminal.
    const decorate = mustSelect || args.file !== undefined;

    if (decorate) {
      intro(color.inverse(" CLI "));
    }

    let flowId: string;

    if (mustSelect) {
      const projectId = args.project ?? (await selectProject());

      flowId = await selectFlow(projectId);
    } else {
      flowId = args.id.trim();

      if (!UUID.test(flowId)) {
        handleCancel(`Not a valid flow ID: ${args.id}`);
      }
    }

    // Without a file the definition goes to stdout so it can be piped, which
    // means no interactive decoration is allowed around it.
    if (!args.file) {
      const definition = await exportFlowDefinition(flowId);

      process.stdout.write(definition);

      return;
    }

    const s = spinner();
    s.start("Exporting the flow definition...");

    const definition = await exportFlowDefinition(flowId);

    await writeFile(args.file, definition, "utf8");

    s.stop("Flow definition exported!");

    outro(`Definition saved to: ${args.file}`);
  },
});

export default defineCommand({
  meta: {
    name: "flow",
    description: "Flow management",
  },
  subCommands: {
    export: exportFlow,
  },
});
