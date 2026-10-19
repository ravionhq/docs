import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";

const script = fileURLToPath(new URL("./sync-module-catalog.mjs", import.meta.url));

test("catalog sync includes mapped inputs, conditional fields, and the full input list", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "ravion-catalog-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(path.join(root, "bin"));
  mkdirSync(path.join(root, "snippets"));
  writeFileSync(path.join(root, "docs.json"), JSON.stringify({
    navigation: {tabs: [{tab: "Documentation", groups: [{group: "Modules", pages: []}]}]},
  }));

  const definitions = [
    {
      type: "rvn-ecs-cluster",
      name: "ECS cluster",
      latestVersion: "2.1.2",
      latestVersionId: "version-1",
      organizationId: null,
    },
    {
      type: "rvn-aws-network",
      name: "AWS network",
      latestVersion: "1.0.0",
      latestVersionId: "version-3",
      organizationId: null,
    },
    {
      type: "rvn-org-only",
      name: "Organization-only module",
      latestVersion: "1.0.0",
      latestVersionId: "version-2",
      organizationId: "org-1",
    },
    {
      type: "rvn-no-latest",
      name: "Module without a latest version",
      organizationId: null,
    },
  ];
  const version = {config: {inputs: [
    {id: "org_only", type: "$ref:rvn-org-only", required: true},
    {id: "network", type: "$ref:rvn-aws-network", mapped_inputs: [
      {id: "private_subnet_ids", type: "string_array", required: true, immutable: true, default: "<<ref.stack.output.private_subnet_ids>>"},
    ]},
    {id: "ec2_instance_type", type: "string"},
    {id: "public_alb_certificate", type: "$ref:rvn-acm-certificate", show_when: {public_alb_enabled: true}, mapped_inputs: [
      {id: "public_alb_certificate_arns", type: "string_array"},
    ]},
    {id: "origins", type: "list", item_inputs: [
      {id: "certificate", type: "$ref:rvn-acm-certificate", mapped_inputs: [
        {id: "certificate_arn", type: "string"},
      ]},
    ]},
    {id: "last_input", type: "boolean", default: false},
  ]}};
  writeFileSync(path.join(root, "bin/ravion"), `#!/usr/bin/env node
console.log(JSON.stringify(process.argv[3] === "definition" ? ${JSON.stringify(definitions)} : ${JSON.stringify(version)}));
`, {mode: 0o755});

  execFileSync(process.execPath, [script], {
    cwd: root,
    env: {...process.env, PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`},
  });
  const page = readFileSync(path.join(root, "module-definitions/catalog/rvn-ecs-cluster.mdx"), "utf8");
  const networkPage = readFileSync(path.join(root, "module-definitions/catalog/rvn-aws-network.mdx"), "utf8");
  assert.throws(() => readFileSync(path.join(root, "module-definitions/catalog/rvn-org-only.mdx")));
  assert.throws(() => readFileSync(path.join(root, "module-definitions/catalog/rvn-no-latest.mdx")));
  assert.match(page, /click rvn_aws_network/);
  assert.doesNotMatch(page, /click rvn_org_only/);
  assert.doesNotMatch(networkPage, /click rvn_org_only/);
  assert.match(page, /<ResponseField name="private_subnet_ids" type="string_array" required>/);
  assert.match(page, /Default: `<<ref.stack.output.private_subnet_ids>>`/);
  assert.match(page, /Immutable after creation/);
  assert.match(page, /Set `network` to `null`\./);
  assert.match(page, /set these keys alongside `network`, not inside it/);
  assert.match(page, /<\/ResponseField>\n\nSet `network` to `null`\.\nMapped inputs for `network`/);
  assert.match(page, /<ResponseField name="public_alb_certificate"/);
  assert.match(page, /Shown when: `\{"public_alb_enabled":true\}`/);
  assert.match(page, /<ResponseField name="public_alb_certificate_arns"/);
  assert.match(page, /    <ResponseField name="certificate_arn"/);
  assert.match(page, /<ResponseField name="last_input" type="boolean">/);
  assert.match(page, /Default: `false`/);
});
