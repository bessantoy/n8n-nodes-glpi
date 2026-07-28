#!/usr/bin/env node
/**
 * Regenerates resources/glpi-endpoints-index.json from
 * resources/glpi-openapi-full.json.
 *
 * `category` is taken from each operation's real OpenAPI `tags[0]` (falling
 * back to "default" for the handful of untagged utility endpoints), NOT from
 * the first URL path segment: GLPI's own doc groups operations by tag, and
 * that tag set (Administration, Assets, Custom Assets, Notes, Session,
 * Status, Localization, Statistics, GraphQL, default, ...) does not line up
 * with path segments (e.g. many endpoints tagged "Assets" or "Notes" don't
 * start with /Assets or /Notes at all).
 *
 * Run with: node scripts/generate-endpoint-index.js
 */

const fs = require("fs");
const path = require("path");

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
];

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
  "glpi-endpoints-index.json",
);

const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));

function resolveRef(ref) {
  // "#/components/parameters/filter" -> spec.components.parameters.filter
  const segments = ref.replace(/^#\//, "").split("/");
  return segments.reduce((node, segment) => node?.[segment], spec);
}

function schemaRefName(schema) {
  if (!schema) return null;
  if (schema.$ref) return schema.$ref.split("/").pop();
  if (schema.type === "array" && schema.items?.$ref)
    return schema.items.$ref.split("/").pop();
  return "";
}

function buildResource(entryPath) {
  return entryPath
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("{") && segment.endsWith("}")))
    .join("/");
}

const entries = [];

for (const [entryPath, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    if (!HTTP_METHODS.includes(method) || !op || typeof op !== "object") {
      continue;
    }

    const category = op.tags?.[0] || "default";
    const pathParams = [...entryPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);

    const resolvedParams = (op.parameters ?? []).map((p) =>
      p.$ref ? resolveRef(p.$ref) : p,
    );
    const queryParams = resolvedParams
      .filter((p) => p?.in === "query")
      .map((p) => p.name)
      .filter(Boolean);

    const requestBodySchema =
      op.requestBody?.content?.["application/json"]?.schema;
    const hasBody = Boolean(requestBodySchema);
    const bodySchema = hasBody ? schemaRefName(requestBodySchema) : null;

    const successResponse = Object.entries(op.responses ?? {}).find(([code]) =>
      code.startsWith("2"),
    )?.[1];
    const responseJsonSchema =
      successResponse?.content?.["application/json"]?.schema;
    const responseSchema = responseJsonSchema
      ? schemaRefName(responseJsonSchema)
      : null;

    entries.push({
      category,
      resource: buildResource(entryPath),
      path: entryPath,
      method: method.toUpperCase(),
      pathParams,
      queryParams,
      hasBody,
      bodySchema,
      responseSchema,
    });
  }
}

fs.writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${entries.length} entries to ${path.relative(process.cwd(), outPath)}`,
);

const tagCounts = new Map();
for (const entry of entries) {
  tagCounts.set(entry.category, (tagCounts.get(entry.category) ?? 0) + 1);
}
console.log(
  [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `${tag}: ${count}`)
    .join("\n"),
);
