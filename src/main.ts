import { defineCommand, runMain } from "citty";

import version from "./commands/version.ts";
import app from "./commands/app.ts";
import auth from "./commands/auth.ts";
import flow from "./commands/flow.ts";

const main = defineCommand({
  meta: {
    name: "flowctl",
    description: "Spacelift Flows CLI",
  },
  subCommands: {
    app,
    version,
    auth,
    flow,
  },
});

await runMain(main);
