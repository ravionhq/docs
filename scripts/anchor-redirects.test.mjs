import assert from "node:assert/strict";
import vm from "node:vm";
import {test} from "node:test";
import {renderAnchorRedirectScript} from "./anchor-redirects.mjs";

const docs = [
  {
    pages: ["/pipelines/config-reference", "/pipelines/config-reference/steps"],
    anchors: {buildstep: "/pipelines/config-reference/steps"},
  },
];

function evaluate({pathname, hash, existingElement = false, readyState = "complete"}) {
  const listeners = new Map();
  const replaced = [];
  const location = {
    hash,
    pathname,
    replace: (url) => replaced.push(url),
  };
  const document = {
    readyState,
    addEventListener: (event, listener) => listeners.set(event, listener),
    getElementById: () => (existingElement ? {} : null),
  };
  const addEventListener = (event, listener) => listeners.set(event, listener);

  vm.runInNewContext(renderAnchorRedirectScript(docs), {
    addEventListener,
    document,
    location,
  });

  return {document, listeners, location, replaced};
}

test("redirects moved anchors and preserves a /docs prefix", () => {
  const {replaced} = evaluate({
    pathname: "/docs/pipelines/config-reference/",
    hash: "#build%73tep",
  });

  assert.deepEqual(replaced, [
    "/docs/pipelines/config-reference/steps#buildstep",
  ]);
});

test("does not redirect when the anchor exists on the current page", () => {
  const {replaced} = evaluate({
    pathname: "/pipelines/config-reference",
    hash: "#buildstep",
    existingElement: true,
  });

  assert.deepEqual(replaced, []);
});

test("does not redirect an unknown anchor", () => {
  const {replaced} = evaluate({
    pathname: "/pipelines/config-reference",
    hash: "#unknown",
  });

  assert.deepEqual(replaced, []);
});

test("does not redirect on an unrelated page", () => {
  const {replaced} = evaluate({
    pathname: "/docs/pipelines/examples",
    hash: "#buildstep",
  });

  assert.deepEqual(replaced, []);
});

test("runs on hashchange after DOMContentLoaded is registered", () => {
  const {document, listeners, location, replaced} = evaluate({
    pathname: "/docs/pipelines/config-reference",
    hash: "",
    readyState: "loading",
  });

  assert.equal(typeof document.addEventListener, "function");
  assert.equal(typeof listeners.get("DOMContentLoaded"), "function");
  location.hash = "#buildstep";
  listeners.get("hashchange")();

  assert.deepEqual(replaced, [
    "/docs/pipelines/config-reference/steps#buildstep",
  ]);
});
