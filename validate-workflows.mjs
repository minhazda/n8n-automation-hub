#!/usr/bin/env node
/**
 * Structural validator for the n8n workflow exports.
 *
 * n8n won't import a workflow whose connections point at a node that doesn't
 * exist, or whose nodes are missing required fields — the two failure modes
 * that make a "here are my workflows" repo embarrassing. This checks both
 * (plus JSON validity and unique node names/ids) so CI catches breakage before
 * a reviewer ever opens n8n.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "workflows");
const REQUIRED_NODE_FIELDS = ["id", "name", "type", "typeVersion", "position"];

let failures = 0;
const fail = (file, msg) => {
  console.error(`  ✗ ${file}: ${msg}`);
  failures++;
};

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error("No workflow JSON files found.");
  process.exit(1);
}

for (const file of files) {
  let wf;
  try {
    wf = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  } catch (e) {
    fail(file, `invalid JSON — ${e.message}`);
    continue;
  }

  if (!Array.isArray(wf.nodes) || wf.nodes.length === 0) {
    fail(file, "no nodes array");
    continue;
  }
  if (typeof wf.connections !== "object" || wf.connections === null) {
    fail(file, "no connections object");
    continue;
  }

  const names = new Set();
  const ids = new Set();
  for (const node of wf.nodes) {
    for (const field of REQUIRED_NODE_FIELDS) {
      if (node[field] === undefined) fail(file, `node "${node.name ?? "?"}" missing "${field}"`);
    }
    if (names.has(node.name)) fail(file, `duplicate node name "${node.name}"`);
    if (ids.has(node.id)) fail(file, `duplicate node id "${node.id}"`);
    names.add(node.name);
    ids.add(node.id);
  }

  // Every connection endpoint must reference an existing node by name.
  for (const [source, outputs] of Object.entries(wf.connections)) {
    if (!names.has(source)) fail(file, `connection from unknown node "${source}"`);
    for (const branch of outputs.main ?? []) {
      for (const conn of branch ?? []) {
        if (!names.has(conn.node)) {
          fail(file, `"${source}" connects to unknown node "${conn.node}"`);
        }
      }
    }
  }

  if (failures === 0) console.log(`  ✓ ${file}  (${wf.nodes.length} nodes)`);
}

if (failures > 0) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} workflows valid.`);
