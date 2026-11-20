import assert from "node:assert/strict";
import {test} from "node:test";

import {checkExampleIds, readRepositoryFiles, realLookingIds} from "./check-example-ids.mjs";

const realShaped = `proj_${"3aB".repeat(9)}`;

test("an ID of the real shape is reported with its line and a placeholder to use", () => {
  const failures = checkExampleIds([{filePath: "guides/page.mdx", source: `intro\n  id: ${realShaped}\n`}]);

  assert.deepEqual(failures, [
    `guides/page.mdx:2: ${realShaped} looks like a real Ravion ID. Write proj_123 instead.`,
  ]);
});

test("placeholders, config keys and other underscored words pass", () => {
  const source = [
    "ravion pipeline run wait prun_123",
    "project: proj_123",
    "env_variables: {}",
    "pipe_system_tf_change_pipeline",
    "arn:aws:iam::123456789012:policy/terraform-apply",
    `longer_${"a".repeat(40)}`,
  ].join("\n");

  assert.deepEqual(realLookingIds(source), []);
});

test("every ID on a line is reported", () => {
  const other = `pipe_${"2xY".repeat(9)}`;

  assert.deepEqual(realLookingIds(`${realShaped} and ${other}`), [
    {line: 1, id: realShaped},
    {line: 1, id: other},
  ]);
});

test("the repository shows no real Ravion ID", () => {
  assert.deepEqual(checkExampleIds(readRepositoryFiles()), []);
});
