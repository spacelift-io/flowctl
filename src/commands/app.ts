import { intro, outro, cancel, group, spinner, text } from "@clack/prompts";
import { defineCommand } from "citty";
import color from "picocolors";
import { createApp } from "../api.ts";
import { selectProject } from "../shared.ts";

export default defineCommand({
  meta: {
    name: "app",
    description: "App management",
  },
  subCommands: {
    create: {
      meta: {
        name: "create",
        description: "Create a new app",
      },
      args: {
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

        const config = await group(
          {
            name: () =>
              text({
                message: "Enter app name",
                placeholder: "eg. My App",
                validate(value) {
                  if (value.length === 0) {
                    return "App name is required!";
                  }
                },
              }),
            description: () =>
              text({
                message: "Enter app description",
                placeholder: "eg. My App is a simple app",
              }),
            blockColor: () =>
              text({
                message: "Enter block color",
                initialValue: "#fff",
                validate(value) {
                  if (value.length === 0) {
                    return "Block color is required!";
                  }
                },
              }),
            blockIconUrl: () =>
              text({
                message: "Enter path to block icon",
                initialValue: "/static/empty.svg",
                validate(value) {
                  if (value.length === 0) {
                    return "Block icon URL is required!";
                  }
                },
              }),
          },
          {
            onCancel: () => {
              cancel("Operation cancelled.");
              process.exit(0);
            },
          },
        );

        const s = spinner();

        s.start("Creating app...");

        const appId = await createApp(
          config.name,
          config.description,
          config.blockColor,
          config.blockIconUrl,
          projectId,
        );

        s.stop("App created!");

        outro(`ID: ${appId}`);
      },
    },
  },
});
