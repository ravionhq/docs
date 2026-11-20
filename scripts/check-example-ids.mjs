import {readdirSync, readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skippedDirectories = new Set(["node_modules", ".git"]);
const checkedExtensions = new Set([".mdx", ".md", ".json", ".yaml", ".yml"]);
const skippedFiles = new Set(["pnpm-lock.yaml", "skills-lock.json"]);

// A Ravion ID is a short lowercase prefix, an underscore and 27 letters and
// digits. Examples in the docs use the prefix and "123" instead (proj_123), so
// anything of the real shape was copied from a real resource.
const realIdShape = /\b[a-z]{2,8}_[A-Za-z0-9]{27}\b/g;

export function realLookingIds(source) {
  const found = [];
  source.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(realIdShape)) {
      found.push({line: index + 1, id: match[0]});
    }
  });
  return found;
}

export function readRepositoryFiles(directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) files.push(...readRepositoryFiles(entryPath));
      continue;
    }
    if (!checkedExtensions.has(path.extname(entry.name)) || skippedFiles.has(entry.name)) continue;
    files.push({filePath: path.relative(root, entryPath), source: readFileSync(entryPath, "utf8")});
  }
  return files;
}

export function checkExampleIds(files) {
  return files.flatMap(({filePath, source}) =>
    realLookingIds(source).map(({line, id}) => {
      const placeholder = `${id.slice(0, id.indexOf("_"))}_123`;
      return `${filePath}:${line}: ${id} looks like a real Ravion ID. Write ${placeholder} instead.`;
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = checkExampleIds(readRepositoryFiles());
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    console.error("\nThis repository is public. Example IDs must not come from a real resource.");
    process.exit(1);
  }
  console.log("No page shows a real Ravion ID.");
}
