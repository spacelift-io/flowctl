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
    outfile: "output.js",
    loader: { ".ts": "ts" },
    external: ["@slflows/sdk/*", "*.node"],
    platform: "node",
    target: "node22",
    format: "esm",
    write: false,
    banner: {
      js: `
        import { createRequire } from "node:module";
        const require = createRequire(import.meta.url);
        const __dirname = import.meta.dirname;
        const __filename = import.meta.filename;
      `,
    },
  });

  return out.outputFiles[0].text;
}
