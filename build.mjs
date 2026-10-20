import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/popup", { recursive: true });

// Static files: only runtime assets belong in the production package.
cpSync("public/manifest.json", "dist/manifest.json");
cpSync("public/icons", "dist/icons", { recursive: true });
cpSync("src/popup/popup.html", "dist/popup/popup.html");
cpSync("src/popup/popup.css", "dist/popup/popup.css");

// Bundle the popup script and its npm dependencies into one local file.
// All code ships inside the package (required by Manifest V3); nothing is loaded remotely.
await build({
  entryPoints: { "popup/popup": "src/popup/popup.js" },
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome110",
  minify: false, // readable output keeps Chrome Web Store review simple
  logLevel: "info",
});
