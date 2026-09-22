import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  checkDocsSeoInvariants,
  navigationPagePaths,
  readRepositoryPages,
} from "./check-docs-seo-invariants.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonical = "https://www.ravion.com/docs/concepts/modules";
const canonicalAlias = {
  pagePath: "modules/overview",
  frontmatter: { canonical, noindex: true },
};
const target = { pagePath: "concepts/modules", frontmatter: {} };

test("canonical alias fallback with noindex fails", () => {
  const violations = checkDocsSeoInvariants({
    pages: [canonicalAlias, target],
    navigationPages: new Set(["concepts/modules"]),
    redirects: [],
  });
  assert.ok(
    violations.some((violation) =>
      violation.includes("noindex pages must not define a canonical URL"),
    ),
  );
});

test("cross-page canonical without noindex fails", () => {
  const violations = checkDocsSeoInvariants({
    pages: [{pagePath: "modules/overview", frontmatter: {canonical}}, target],
    navigationPages: new Set(["concepts/modules"]),
    redirects: [],
  });
  assert.ok(
    violations.some((violation) => violation.includes("cross-page canonical URLs")),
  );
});

test("a group root counts as navigated", () => {
  const navigation = {
    groups: [
      {
        group: "Concepts",
        root: "concepts/modules",
        pages: ["concepts/pipelines"],
      },
    ],
  };
  assert.deepEqual(
    checkDocsSeoInvariants({
      pages: [target],
      navigationPages: navigationPagePaths(navigation),
      redirects: [],
    }),
    [],
  );
});

test("noindex page fails", () => {
  const violations = checkDocsSeoInvariants({
    pages: [{...target, frontmatter: {noindex: true}}],
    navigationPages: new Set(["concepts/modules"]),
    redirects: [],
  });
  assert.ok(
    violations.some((violation) => violation.includes("noindex is not allowed")),
  );
});

test("duplicate navigation entries do not create duplicate violations", () => {
  const navigation = {
    groups: [
      {group: "Concepts", pages: ["concepts/modules"]},
      {group: "Modules", pages: ["concepts/modules"]},
    ],
  };
  assert.deepEqual(
    checkDocsSeoInvariants({
      pages: [target],
      navigationPages: navigationPagePaths(navigation),
      redirects: [],
    }),
    [],
  );
});

test("real repository content passes", () => {
  const docsConfig = JSON.parse(
    readFileSync(path.join(root, "docs.json"), "utf8"),
  );
  assert.deepEqual(
    checkDocsSeoInvariants({
      pages: readRepositoryPages(),
      navigationPages: navigationPagePaths(docsConfig.navigation),
      redirects: docsConfig.redirects,
    }),
    [],
  );
});

test("redirect destination missing from navigation fails", () => {
  const violations = checkDocsSeoInvariants({
    pages: [target],
    navigationPages: new Set(),
    redirects: [{source: "/legacy", destination: "/concepts/modules"}],
  });
  assert.ok(
    violations.some((violation) =>
      violation.includes("redirect destination /concepts/modules is not in docs.json navigation"),
    ),
  );
});

test("redirect destination with noindex fails", () => {
  const violations = checkDocsSeoInvariants({
    pages: [{...target, frontmatter: {noindex: true}}],
    navigationPages: new Set(["concepts/modules"]),
    redirects: [{source: "/legacy", destination: "/concepts/modules"}],
  });
  assert.ok(
    violations.some((violation) =>
      violation.includes("redirect destination /concepts/modules must be indexable and visible"),
    ),
  );
});

test("page at a redirect source fails", () => {
  const violations = checkDocsSeoInvariants({
    pages: [{pagePath: "legacy", frontmatter: {}}, target],
    navigationPages: new Set(["concepts/modules"]),
    redirects: [{source: "/legacy", destination: "/concepts/modules"}],
  });
  assert.ok(
    violations.some((violation) => violation.includes("redirect source has a live MDX page")),
  );
});

test("wildcard redirects are skipped", () => {
  assert.deepEqual(
    checkDocsSeoInvariants({
      pages: [],
      navigationPages: new Set(),
      redirects: [
        {source: "/legacy/:slug", destination: "/concepts/modules"},
        {source: "/legacy/*", destination: "/missing"},
      ],
    }),
    [],
  );
});
