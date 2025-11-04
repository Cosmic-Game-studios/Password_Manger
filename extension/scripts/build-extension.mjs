import { build } from "esbuild";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(source, destination) {
  await ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}

async function buildExtension() {
  await fs.rm(distDir, { recursive: true, force: true });
  await ensureDir(distDir);

  await build({
    entryPoints: [
      path.join(srcDir, "background.ts"),
      path.join(srcDir, "popup.ts"),
      path.join(srcDir, "autofillContent.ts"),
      path.join(srcDir, "syncContent.ts"),
    ],
    bundle: true,
    outdir: distDir,
    format: "iife",
    platform: "browser",
    target: ["chrome110"],
    sourcemap: false,
    logLevel: "info",
  });

  await copyFile(path.join(rootDir, "manifest.json"), path.join(distDir, "manifest.json"));
  await copyFile(path.join(srcDir, "popup.html"), path.join(distDir, "popup.html"));
}

buildExtension().catch((error) => {
  console.error("✖ Fehler beim Bauen der Chrome-Erweiterung", error);
  process.exit(1);
});
