import * as fs from "fs";
import * as path from "path";

export interface EndpointEntry {
  category: string;
  resource: string;
  path: string;
  method: string;
  pathParams: string[];
  queryParams: string[];
  hasBody: boolean;
  bodySchema: string | null;
  responseSchema: string | null;
}

const METHOD_ORDER = ["GET", "POST", "PATCH", "DELETE"];

// The real GLPI API categories, taken directly from each operation's OpenAPI
// `tags` (see scripts/generate-endpoint-index.js — category = tags[0], falling
// back to "default" for the handful of untagged utility endpoints). This is
// GLPI's own documentation grouping, listed here in the same alphabetical order
// Swagger/Redoc-style renderers display them in.
const DISPLAY_CATEGORIES = [
  "Administration",
  "Assets",
  "Assistance",
  "Components",
  "Custom Assets",
  "default",
  "Dropdowns",
  "GraphQL",
  "Inventory",
  "Knowledgebase",
  "Localization",
  "Management",
  "Notes",
  "Notifications",
  "Project",
  "Rule",
  "Session",
  "Setup",
  "Statistics",
  "Status",
  "Tools",
];

let cachedIndex: EndpointEntry[] | undefined;

function loadIndex(): EndpointEntry[] {
  if (cachedIndex) {
    return cachedIndex;
  }

  // Built next to this compiled file at dist/nodes/Glpi/resources/glpi-endpoints-index.json
  // (see gulpfile.js copyIndex task).
  const bundledPath = path.join(
    __dirname,
    "resources",
    "glpi-endpoints-index.json",
  );
  // Fallback for ts-node / running the source directly (before build).
  const sourcePath = path.join(
    __dirname,
    "..",
    "..",
    "resources",
    "glpi-endpoints-index.json",
  );

  const indexPath = fs.existsSync(bundledPath) ? bundledPath : sourcePath;
  const raw = fs.readFileSync(indexPath, "utf8");
  cachedIndex = JSON.parse(raw) as EndpointEntry[];

  return cachedIndex;
}

// All distinct {placeholder} names seen anywhere in the bundled index, ordered so
// that params which appear together in a real path keep their real relative order
// (e.g. asset_itemtype before asset_id, project_id before ticket_id/change_id).
// Computed from the index rather than hardcoded so that regenerating the index
// with new/renamed params updates the generated fields automatically.
let cachedPathParamOrder: string[] | undefined;

export function listAllPathParamNames(): string[] {
  if (cachedPathParamOrder) {
    return cachedPathParamOrder;
  }

  const index = loadIndex();
  const nodes = new Set<string>();
  const frequency = new Map<string, number>();
  const precedes = new Map<string, Set<string>>();

  for (const entry of index) {
    for (const name of entry.pathParams) {
      nodes.add(name);
      frequency.set(name, (frequency.get(name) ?? 0) + 1);
    }
    for (let i = 0; i < entry.pathParams.length; i++) {
      for (let j = i + 1; j < entry.pathParams.length; j++) {
        const before = entry.pathParams[i];
        const after = entry.pathParams[j];
        if (!precedes.has(before)) {
          precedes.set(before, new Set());
        }
        precedes.get(before)!.add(after);
      }
    }
  }

  const inDegree = new Map<string, number>();
  for (const name of nodes) {
    inDegree.set(name, 0);
  }
  for (const afters of precedes.values()) {
    for (const after of afters) {
      inDegree.set(after, (inDegree.get(after) ?? 0) + 1);
    }
  }

  const byFrequencyDesc = (a: string, b: string): number =>
    (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0) || a.localeCompare(b);

  const ready = [...nodes]
    .filter((name) => (inDegree.get(name) ?? 0) === 0)
    .sort(byFrequencyDesc);
  const result: string[] = [];

  while (ready.length > 0) {
    const name = ready.shift()!;
    result.push(name);
    for (const after of precedes.get(name) ?? []) {
      const remaining = (inDegree.get(after) ?? 0) - 1;
      inDegree.set(after, remaining);
      if (remaining === 0) {
        ready.push(after);
        ready.sort(byFrequencyDesc);
      }
    }
  }

  // Defensive fallback in case the real path data ever contains a genuine cycle
  // (shouldn't happen: URL segments are strictly ordered left-to-right).
  if (result.length < nodes.size) {
    for (const name of [...nodes].sort(byFrequencyDesc)) {
      if (!result.includes(name)) {
        result.push(name);
      }
    }
  }

  cachedPathParamOrder = result;
  return result;
}

const PARAM_LABEL_OVERRIDES: Record<string, string> = {
  req: "Request Path",
};

export function humanizeParamName(name: string): string {
  if (PARAM_LABEL_OVERRIDES[name]) {
    return PARAM_LABEL_OVERRIDES[name];
  }

  return name
    .split("_")
    .map((word) =>
      word === "id" ? "ID" : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function listCategories(): string[] {
  return DISPLAY_CATEGORIES;
}

// One entry per (method, path) pair in a category, e.g. "GET /Administration/ApprovalSubstitute" —
// mirrors how GLPI's own API documentation presents routes, and needs no derived/shortened
// label: since (method, path) is already the index's natural unique key, there's nothing to
// disambiguate.
export function listRoutesForCategory(
  category: string,
): Array<{ method: string; path: string }> {
  const index = loadIndex();

  return index
    .filter((entry) => entry.category === category)
    .map((entry) => ({ method: entry.method, path: entry.path }))
    .sort(
      (a, b) =>
        a.path.localeCompare(b.path) ||
        METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method),
    );
}

/** The full bundled index, unfiltered — used by SearchEngine.ts to score every endpoint. */
export function listAllEntries(): EndpointEntry[] {
  return loadIndex();
}

export function getEntry(
  entryPath: string,
  method: string,
): EndpointEntry | undefined {
  const index = loadIndex();
  return index.find(
    (entry) => entry.path === entryPath && entry.method === method,
  );
}

/** Returns true when a GET path targets a collection (i.e. does not end on an id-like placeholder). */
export function isCollectionPath(entryPath: string): boolean {
  const segments = entryPath.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return !(last.startsWith("{") && last.endsWith("}"));
}
