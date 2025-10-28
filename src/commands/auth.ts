import { defineCommand } from "citty";
import { intro, log, outro, select, text, isCancel } from "@clack/prompts";
import color from "picocolors";
import { login, loadToken, logoutStoredToken, getValidToken } from "../auth.ts";
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

        const existing = await loadToken();
        if (existing) {
          outro("Already authenticated");
          return;
        }

        let baseUrl: string;

        if (args["base-url"]) {
          baseUrl = args["base-url"];
        } else {
          const endpointChoice = await select<string>({
            message: "Select API endpoint",
            options: [
              { value: "https://useflows.eu", label: "EU (useflows.eu)" },
              { value: "https://useflows.us", label: "US (useflows.us)" },
              { value: "custom", label: "Custom URL" },
            ],
          });

          if (isCancel(endpointChoice)) {
            handleCancel("Operation cancelled");
          }

          if (endpointChoice === "custom") {
            const customUrl = await text({
              message: "Enter custom API URL",
              placeholder: "https://example.com",
              validate(value) {
                if (value.length === 0) {
                  return "URL is required!";
                }
              },
            });

            if (isCancel(customUrl)) {
              handleCancel("Operation cancelled");
            }

            baseUrl = customUrl;
          } else {
            baseUrl = endpointChoice;
          }
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
    token: defineCommand({
      meta: {
        name: "token",
        description: "Get a valid access token for API access.",
      },
      async run() {
        const token = await getValidToken();
        console.log(token);
      },
    }),
  },
});
