import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function notice(name, version, license, directory) {
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter(file => file.isFile() && /^(licen[cs]e|copying|notice)([-_.]|$)/i.test(file.name))
    .map(file => file.name).sort();
  return [name + " " + version, license ?? "",
    ...files.map(file => file + "\n" + fs.readFileSync(path.join(directory, file), "utf8").trim())].join("\n");
}

function rustNotices() {
  const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--locked", "--format-version", "1",
    "--manifest-path", "src-tauri/Cargo.toml", "--filter-platform", "x86_64-pc-windows-msvc"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
  const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
  const root = metadata.resolve.root;
  const seen = new Set([root]);
  const pending = [root];
  while (pending.length > 0) {
    for (const dependency of nodes.get(pending.pop())?.deps ?? []) {
      if (seen.has(dependency.pkg) || !dependency.dep_kinds.some(kind => kind.kind === null)) continue;
      seen.add(dependency.pkg);
      pending.push(dependency.pkg);
    }
  }
  return metadata.packages.filter(pkg => pkg.id !== root && seen.has(pkg.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map(pkg => notice(pkg.name, pkg.version, pkg.license, path.dirname(pkg.manifest_path)));
}

const jsNotices = ["react", "react-dom", "scheduler", "lottie-web"].map(name => {
  const directory = path.resolve("node_modules", name);
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  return notice(pkg.name, pkg.version, pkg.license, directory);
});
const native = process.argv.includes("--windows") ? rustNotices() : [];
const entries = [
  "TimerOS third-party notices",
  "Bundled appearance assets\nForest Mist and Danish Coast backgrounds are shared with LifeOS (Casper Norup).",
  ...jsNotices,
  ...native,
];
fs.mkdirSync("public/licenses", { recursive: true });
fs.writeFileSync("public/licenses/third-party.txt", entries.join("\n\n" + "-".repeat(64) + "\n\n") + "\n", "utf8");
console.log("Bundled notices for " + (jsNotices.length + native.length) + " packages.");
