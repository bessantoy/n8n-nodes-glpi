#!/usr/bin/env node
/**
 * Regenerates resources/glpi-schemas-index.json from
 * resources/glpi-openapi-full.json.
 *
 * For every GLPI object schema (Ticket, Computer, User, ...), keeps only the
 * fields an AI agent needs to fill in a request body: type, enum, description,
 * and for relation fields (marked with the vendor extension `x-itemtype`) a
 * `relatesTo` + explicit `writeHint` describing the `{ "id": <integer> }` shape
 * expected on write. Used by nodes/GlpiFindEndpoint/SearchEngine.ts to enrich
 * search results with the exact shape of a bodySchema.
 *
 * Run with: node scripts/generate-schemas-index.js
 */

const fs = require("fs");
const path = require("path");

const specPath = path.join(
  __dirname,
  "..",
  "resources",
  "glpi-openapi-full.json",
);
const outPath = path.join(
  __dirname,
  "..",
  "resources",
  "glpi-schemas-index.json",
);

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const schemas = spec.components.schemas;

function simplifyProperty(prop) {
  if (!prop || typeof prop !== "object") {
    return prop;
  }

  const out = {};
  if ("type" in prop) out.type = prop.type;
  if ("enum" in prop) out.enum = prop.enum;
  if ("description" in prop) out.description = prop.description;
  if (prop.type === "object" && "x-itemtype" in prop) {
    out.relatesTo = prop["x-itemtype"];
    out.writeHint = `Provide as { "id": <integer> } referencing a ${prop["x-itemtype"]}`;
  }

  return out;
}

const slim = {};
for (const [name, schema] of Object.entries(schemas)) {
  const properties = schema?.properties ?? {};
  const fields = {};
  for (const [propName, propDef] of Object.entries(properties)) {
    fields[propName] = simplifyProperty(propDef);
  }
  slim[name] = fields;
}

fs.writeFileSync(outPath, JSON.stringify(slim, null, 1) + "\n", "utf8");
console.log(
  `Wrote ${Object.keys(slim).length} schemas to ${path.relative(process.cwd(), outPath)}`,
);
