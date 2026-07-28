#!/usr/bin/env node
/**
 * Run this after regenerating resources/glpi-endpoints-index.json (see
 * scripts/generate-endpoint-index.js) and rebuilding (npm run build), whenever
 * upgrading to a new GLPI API version. It catches the one way a new version
 * can silently break the "GLPI (Generic)" node's UI: a brand new OpenAPI tag
 * (category) appearing in the index. The node's Category dropdown is a fixed
 * list (DISPLAY_CATEGORIES in nodes/Glpi/EndpointIndex.ts) for a predictable,
 * alphabetically-sorted UI — so a new tag's endpoints would exist in the index
 * but never be reachable from the dropdown until it's added there manually.
 *
 * Run with: node scripts/validate-endpoint-update.js
 */

const fs = require("fs");
const path = require("path");

const { listCategories } = require("../dist/nodes/Glpi/EndpointIndex.js");

let ok = true;

const indexPath = path.join(
  __dirname,
  "..",
  "resources",
  "glpi-endpoints-index.json",
);
const rawIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const actualCategories = new Set(rawIndex.map((entry) => entry.category));
const knownCategories = new Set(listCategories());
const newCategories = [...actualCategories].filter(
  (category) => !knownCategories.has(category),
);

if (newCategories.length > 0) {
  ok = false;
  console.error(
    `NEW CATEGOR${newCategories.length > 1 ? "IES" : "Y"} FOUND: ${newCategories.join(", ")}`,
  );
  console.error(
    "Add them to DISPLAY_CATEGORIES in nodes/Glpi/EndpointIndex.ts (their endpoints exist in the " +
      "index but are unreachable from the Category dropdown until then).",
  );
} else {
  console.log(
    "OK — no new OpenAPI category (tag) to add to DISPLAY_CATEGORIES.",
  );
}

process.exit(ok ? 0 : 1);
