import {
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  spinner,
} from "@clack/prompts";
import { defineCommand } from "citty";
import color from "picocolors";
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import {
  cancelTestScenarioRun,
  exportFlowDefinition,
  getTestScenarioRun,
  listTestScenarios,
  startTestScenarioRun,
  startTestScenarioRunBatch,
  type TestScenario,
  type TestScenarioRun,
  type TestScenarioRunAssertion,
} from "../api.ts";
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
    // Named positively so citty's --no- handling flips them.
    ids: {
      type: "boolean",
      default: true,
      description:
        "Omit app installation, data table and agent pool IDs (they are project scoped)",
    },
    layout: {
      type: "boolean",
      default: true,
      description: "Omit canvas positions and note styling",
    },
    "app-schemas": {
      type: "boolean",
      default: true,
      description: "Omit inline app block schemas",
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

    const exportOptions = {
      omitIds: !args.ids,
      omitLayout: !args.layout,
      omitAppSchemas: !args["app-schemas"],
    };

    // Without a file the definition goes to stdout so it can be piped, which
    // means no interactive decoration is allowed around it.
    if (!args.file) {
      const definition = await exportFlowDefinition(flowId, exportOptions);

      process.stdout.write(definition);

      return;
    }

    const s = spinner();
    s.start("Exporting the flow definition...");

    const definition = await exportFlowDefinition(flowId, exportOptions);

    await writeFile(args.file, definition, "utf8");

    s.stop("Flow definition exported!");

    outro(`Definition saved to: ${args.file}`);
  },
});

const POLL_INTERVAL_MS = 2000;

const SETTLED_STATUSES = ["passed", "failed", "canceled"];

interface StartedRun {
  runId: string;
  run?: TestScenarioRun;
  assertions?: TestScenarioRunAssertion[];
}

function pickScenarios(scenarios: TestScenario[], names: string) {
  const wanted = names
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");

  return wanted.map((name) => {
    const scenario = scenarios.find(
      (scenario) => scenario.name.toLowerCase() === name.toLowerCase(),
    );

    if (!scenario) {
      const available = scenarios.map((scenario) => scenario.name).join(", ");
      handleCancel(
        `No test scenario named "${name}" (available: ${available})`,
      );
    }

    return scenario;
  });
}

async function reportRun(scenario: TestScenario, started: StartedRun) {
  const { run, assertions = [] } = started;

  if (run?.status === "passed") {
    log.success(`${scenario.name} passed`);
    return;
  }

  if (run?.status === "canceled") {
    log.warn(`${scenario.name} was canceled`);
    return;
  }

  const failed = assertions.filter(
    (assertion) => assertion.status === "failed",
  );
  const lines = [
    `${scenario.name} failed${run?.error ? `: ${run.error}` : ""}`,
  ];

  for (const assertion of failed) {
    const output = assertion.outputKey ? ` (${assertion.outputKey})` : "";
    const detail = assertion.detail ? `: ${assertion.detail}` : "";

    lines.push(
      `  ${assertion.kind} assertion on ${assertion.blockName ?? "an unnamed block"}${output}${detail}`,
    );
  }

  log.error(lines.join("\n"));
}

const testFlow = defineCommand({
  meta: {
    name: "test",
    description: "Run a flow's test scenarios and wait for the results",
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
    scenario: {
      type: "string",
      required: false,
      alias: "s",
      description:
        "Comma-separated names of the scenarios to run (defaults to all)",
    },
  },
  async run({ args }) {
    const [stray] = args._;
    if (stray) {
      handleCancel(`Unexpected argument: ${stray}`);
    }

    const mustSelect = !args.id;

    if (mustSelect && !(process.stdin.isTTY && process.stdout.isTTY)) {
      handleCancel(
        "No flow ID given: pass --id when not running in a terminal",
      );
    }

    intro(color.inverse(" CLI "));

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

    const scenarios = await listTestScenarios(flowId);

    if (scenarios.length === 0) {
      handleCancel("This flow has no test scenarios");
    }

    const scenariosById = new Map(
      scenarios.map((scenario) => [scenario.id, scenario]),
    );

    let selected = args.scenario
      ? pickScenarios(scenarios, args.scenario)
      : undefined;

    if (mustSelect && !selected) {
      const ids = await multiselect<string>({
        message: "Pick the scenarios to run",
        options: scenarios.map((scenario) => ({
          value: scenario.id,
          label: scenario.name,
        })),
        initialValues: scenarios.map((scenario) => scenario.id),
      });

      if (isCancel(ids)) {
        handleCancel("Operation cancelled");
      }

      if (ids.length < scenarios.length) {
        selected = ids.map((id) => scenariosById.get(id)!);
      }
    }

    const s = spinner();
    s.start("Starting test scenario runs...");

    const runs: StartedRun[] = [];
    let skipped: Array<{ scenarioId: string; reason: string }> = [];

    process.on("SIGINT", async () => {
      const active = runs.filter(
        (started) =>
          !started.run || !SETTLED_STATUSES.includes(started.run.status),
      );

      await Promise.all(
        active.map((started) => cancelTestScenarioRun(started.runId)),
      );

      handleCancel(`Canceled ${active.length} active run(s)`);
    });

    // A batch always covers every scenario of the flow.
    if (selected) {
      for (const scenario of selected) {
        runs.push({ runId: await startTestScenarioRun(scenario.id) });
      }
    } else {
      const batch = await startTestScenarioRunBatch(flowId);

      runs.push(...batch.runIds.map((runId) => ({ runId })));
      skipped = batch.skipped;
    }

    let pending = runs;

    while (pending.length > 0) {
      s.message(`Waiting for ${pending.length} of ${runs.length} run(s)...`);

      await sleep(POLL_INTERVAL_MS);

      for (const started of pending) {
        const { run, assertions } = await getTestScenarioRun(started.runId);

        started.run = run;
        started.assertions = assertions;
      }

      pending = pending.filter(
        (started) => !SETTLED_STATUSES.includes(started.run!.status),
      );
    }

    s.stop("All runs settled");

    for (const started of runs) {
      const { scenarioId } = started.run!;

      await reportRun(
        scenariosById.get(scenarioId) ?? { id: scenarioId, name: scenarioId },
        started,
      );
    }

    for (const { scenarioId, reason } of skipped) {
      const name = scenariosById.get(scenarioId)?.name ?? scenarioId;

      log.warn(`${name} was skipped: ${reason}`);
    }

    const passed = runs.filter((started) => started.run!.status === "passed");
    const total = runs.length + skipped.length;

    if (passed.length < total) {
      handleCancel(`${passed.length} of ${total} scenario(s) passed`);
    }

    outro(`All ${total} scenario(s) passed`);
  },
});

export default defineCommand({
  meta: {
    name: "flow",
    description: "Flow management",
  },
  subCommands: {
    export: exportFlow,
    test: testFlow,
  },
});
