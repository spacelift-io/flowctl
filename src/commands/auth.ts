import { defineCommand } from "citty";
import { intro, log, outro } from "@clack/prompts";
import color from "picocolors";
import { login, loadToken, logoutStoredToken } from "../auth.ts";
import { handleCancel } from "../utils.ts";

export default defineCommand({
  meta: {
    name: "auth",
    description: "Authentication commands",
  },
  subCommands: {
    login: defineCommand({
      meta: {
        name: "login",
        description: "Authenticate with the Spaceflows API",
      },
      args: {
        "base-url": {
          type: "string",
          required: false,
          description: "API base URL",
        },
      },
      async run({ args }) {
        intro(color.inverse(" CLI "));

        const baseUrl = args["base-url"] ?? "http://localhost";

        const existing = await loadToken();
        if (existing) {
          outro("Already authenticated");
          return;
        }

        log.info("Starting authentication");

        try {
          await login(baseUrl);
          process.exit(0);
        } catch (err) {
          handleCancel(
            `Authentication failed${err instanceof Error ? `: ${err.message}` : ""}`,
          );
        }
      },
    }),
    logout: defineCommand({
      meta: {
        name: "logout",
        description: "Remove stored credentials",
      },
      async run() {
        intro(color.inverse(" CLI "));
        await logoutStoredToken();
        outro("Logged out successfully");
      },
    }),
  },
});
