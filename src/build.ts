import esbuild from "esbuild";
import { join } from "node:path";

export async function buildUiCode(entrypoint: string) {
  const out = await esbuild.build({
    entryPoints: [join(process.cwd(), entrypoint)],
    bundle: true,
    minify: true,
    outfile: "output.js",
    loader: { ".ts": "ts" },
    platform: "browser",
    target: "es2020",
    format: "esm",
    write: false,
  });

  return out.outputFiles[0].text;
}

export async function buildAppSchema(entrypoint: string) {
  const out = await esbuild.build({
    entryPoints: [join(process.cwd(), entrypoint)],
    bundle: true,
    outfile: "app.js",
    loader: { ".ts": "ts" },
    external: ["@slflows/sdk/*", "*.node"],
    platform: "node",
    target: "node22",
    format: "esm",
    write: false,
    minify: true,
    sourcemap: "linked",
    sourcesContent: false,
    banner: {
      js: `// flowctl banner
import { createRequire } from "node:module";
var require = createRequire(import.meta.url);
var __dirname = import.meta.dirname;
var __filename = import.meta.filename;
// end banner
`,
    },
  });

  return [out.outputFiles[0].text, out.outputFiles[1].text];
}
