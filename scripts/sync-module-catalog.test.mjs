import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
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
  assert.equal(existsSync(path.join(root, "module-definitions/catalog/rvn-ecs-cluster")), false);
  const docsJson = JSON.parse(readFileSync(path.join(root, "docs.json"), "utf8"));
  const standardLibrary = docsJson.navigation.tabs[0].groups[0].pages.find(
    (entry) => typeof entry === "object" && entry.group === "Standard library",
  );
  assert.ok(standardLibrary.pages.includes("module-definitions/catalog/rvn-ecs-cluster"));
  assert.doesNotMatch(page, /- \[Inputs/);
});

test("catalog sync paginates large input sections and writes anchor redirects", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "ravion-catalog-split-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(path.join(root, "bin"));
  mkdirSync(path.join(root, "snippets"));
  writeFileSync(
    path.join(root, "docs.json"),
    JSON.stringify({
      navigation: {
        tabs: [{tab: "Documentation", groups: [{group: "Modules", pages: []}]}],
      },
    }),
  );

  const definitions = [
    {
      type: "rvn-large",
      name: "Large Module",
      latestVersion: "1.0.0",
      latestVersionId: "version-large",
      organizationId: null,
    },
    {
      type: "rvn-medium",
      name: "Medium Module",
      latestVersion: "1.0.0",
      latestVersionId: "version-medium",
      organizationId: null,
    },
  ];
  const input = (id) => ({id, type: "string"});
  const general = [
    ...Array.from({length: 66}, (_, index) => input(`general_${index}`)),
    {
      id: "nested_fields",
      type: "list",
      item_inputs: [{id: "nested_value", type: "string"}],
    },
    {
      id: "mapped_parent",
      type: "string",
      mapped_inputs: [{id: "mapped_value", type: "string"}],
    },
  ];
  const section = (label, inputs) => [
    {id: label.toLowerCase(), type: "section", label},
    ...inputs,
  ];
  const version = {
    config: {
      inputs: [
        ...section("General", general),
        ...section("Advanced", Array.from({length: 30}, (_, index) => input(`advanced_${index}`))),
        ...section("Networking", Array.from({length: 30}, (_, index) => input(`network_${index}`))),
        ...section("Miscellaneous", Array.from({length: 30}, (_, index) => input(`misc_${index}`))),
      ],
    },
  };
  const mediumVersion = {
    config: {
      inputs: [
        {id: "overview", type: "section", label: "Overview"},
        ...Array.from({length: 90}, (_, index) => input(`overview_${index}`)),
      ],
    },
  };
  writeFileSync(
    path.join(root, "bin/ravion"),
    `#!/usr/bin/env node
const definitions = ${JSON.stringify(definitions)};
const versions = ${JSON.stringify({"version-large": version, "version-medium": mediumVersion})};
console.log(JSON.stringify(process.argv[3] === "definition" ? definitions : versions[process.argv[5]]));
`,
    {mode: 0o755},
  );

  execFileSync(process.execPath, [script], {
    cwd: root,
    env: {...process.env, PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`},
  });

  const mainPage = readFileSync(
    path.join(root, "module-definitions/catalog/rvn-large.mdx"),
    "utf8",
  );
  const firstPage = readFileSync(
    path.join(root, "module-definitions/catalog/rvn-large/inputs-general.mdx"),
    "utf8",
  );
  const secondPage = readFileSync(
    path.join(root, "module-definitions/catalog/rvn-large/inputs-networking.mdx"),
    "utf8",
  );
  const firstCount = (firstPage.match(/<ResponseField\b/g) ?? []).length;
  const secondCount = (secondPage.match(/<ResponseField\b/g) ?? []).length;
  assert.equal(firstCount, 100);
  assert.equal(secondCount, 60);
  assert.ok(firstCount <= 120 && secondCount <= 120);
  assert.match(firstPage, /title: "Large Module inputs: General to advanced"/);
  assert.match(secondPage, /sidebarTitle: "Inputs: Networking to miscellaneous"/);
  assert.match(
    firstPage,
    /description: "Reference the Large Module module's General, Advanced inputs\."/,
  );
  assert.match(firstPage, /<ResponseField name="nested_value"/);
  assert.match(firstPage, /<ResponseField name="mapped_value"/);
  assert.match(mainPage, /## Inputs reference/);
  assert.match(
    mainPage,
    /- \[Inputs: General to advanced\]\(\/module-definitions\/catalog\/rvn-large\/inputs-general\) — General, Advanced/,
  );
  assert.match(
    mainPage,
    /- \[Inputs: Networking to miscellaneous\]\(\/module-definitions\/catalog\/rvn-large\/inputs-networking\) — Networking, Miscellaneous/,
  );
  assert.doesNotMatch(mainPage, /<ResponseField\b/);

  const docsJson = JSON.parse(readFileSync(path.join(root, "docs.json"), "utf8"));
  const standardLibrary = docsJson.navigation.tabs[0].groups[0].pages.find(
    (entry) => typeof entry === "object" && entry.group === "Standard library",
  );
  assert.deepEqual(standardLibrary.pages[0], {
    group: "rvn-large",
    root: "module-definitions/catalog/rvn-large",
    pages: [
      "module-definitions/catalog/rvn-large/inputs-general",
      "module-definitions/catalog/rvn-large/inputs-networking",
    ],
  });
  assert.deepEqual(standardLibrary.pages[1], {
    group: "rvn-medium",
    root: "module-definitions/catalog/rvn-medium",
    pages: ["module-definitions/catalog/rvn-medium/inputs"],
  });
  const mediumPage = readFileSync(
    path.join(root, "module-definitions/catalog/rvn-medium/inputs.mdx"),
    "utf8",
  );
  assert.equal((mediumPage.match(/<ResponseField\b/g) ?? []).length, 90);

  const redirects = readFileSync(path.join(root, "catalog-anchor-redirects.js"), "utf8");
  assert.match(
    redirects,
    /"general":"\/module-definitions\/catalog\/rvn-large\/inputs-general"/,
  );
  assert.match(
    redirects,
    /"networking":"\/module-definitions\/catalog\/rvn-large\/inputs-networking"/,
  );
});

test("catalog sync rejects an input section that exceeds the page field limit", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "ravion-catalog-overflow-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(path.join(root, "bin"));
  mkdirSync(path.join(root, "snippets"));
  writeFileSync(
    path.join(root, "docs.json"),
    JSON.stringify({
      navigation: {
        tabs: [{tab: "Documentation", groups: [{group: "Modules", pages: []}]}],
      },
    }),
  );
  const definitions = [
    {
      type: "rvn-overflow",
      name: "Overflow Module",
      latestVersion: "1.0.0",
      latestVersionId: "version-overflow",
      organizationId: null,
    },
  ];
  const version = {
    config: {
      inputs: [
        {id: "general", type: "section", label: "General"},
        ...Array.from({length: 121}, (_, index) => ({
          id: `field_${index}`,
          type: "string",
        })),
      ],
    },
  };
  writeFileSync(
    path.join(root, "bin/ravion"),
    `#!/usr/bin/env node
const definitions = ${JSON.stringify(definitions)};
const version = ${JSON.stringify(version)};
console.log(JSON.stringify(process.argv[3] === "definition" ? definitions : version));
`,
    {mode: 0o755},
  );

  let thrown;
  try {
    execFileSync(process.execPath, [script], {
      cwd: root,
      env: {...process.env, PATH: `${path.join(root, "bin")}${path.delimiter}${process.env.PATH}`},
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown);
  assert.match(thrown.stderr.toString(), /General.*121 fields, exceeding 120/);
});
