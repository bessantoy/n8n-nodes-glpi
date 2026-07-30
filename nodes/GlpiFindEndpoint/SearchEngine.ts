import * as fs from "fs";
import * as path from "path";

import { listAllEntries } from "../Glpi/EndpointIndex";

export interface SchemaField {
  type?: string;
  enum?: Array<string | number>;
  description?: string;
  relatesTo?: string;
  writeHint?: string;
}

export type SchemasIndex = Record<string, Record<string, SchemaField>>;

export interface FindResult {
  method: string;
  path: string;
  category: string;
  pathParams: string[];
  queryParams: string[];
  bodySchema: string | null;
  bodyFields?: Record<string, SchemaField>;
  score: number;
}

let cachedSchemas: SchemasIndex | undefined;

function loadSchemasIndex(): SchemasIndex {
  if (cachedSchemas) {
    return cachedSchemas;
  }

  // Built next to this compiled file at dist/nodes/GlpiFindEndpoint/resources/glpi-schemas-index.json
  // (see gulpfile.js copySchemasIndex task).
  const bundledPath = path.join(
    __dirname,
    "resources",
    "glpi-schemas-index.json",
  );
  // Fallback for ts-node / running the source directly (before build).
  const sourcePath = path.join(
    __dirname,
    "..",
    "..",
    "resources",
    "glpi-schemas-index.json",
  );

  const indexPath = fs.existsSync(bundledPath) ? bundledPath : sourcePath;
  const raw = fs.readFileSync(indexPath, "utf8");
  cachedSchemas = JSON.parse(raw) as SchemasIndex;

  return cachedSchemas;
}

// Static category <-> everyday-word table so a plain-English query ("create a
// ticket") can be matched against GLPI's real OpenAPI category names
// ("Assistance") without the caller having to know GLPI's own vocabulary.
// Deliberately small and hardcoded (v0, see FIND-EXECUTE-SPEC.md section 2) —
// extend as real queries turn out to miss their category. Accents already
// stripped here since normalize() strips them from the query too.
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  Assistance: [
    "ticket",
    "incident",
    "demande",
    "change",
    "changement",
    "problem",
    "probleme",
    "support",
  ],
  Assets: [
    "ordinateur",
    "computer",
    "imprimante",
    "printer",
    "moniteur",
    "monitor",
    "telephone",
    "phone",
    "materiel",
    "asset",
    "equipement",
  ],
  Administration: [
    "utilisateur",
    "user",
    "compte",
    "account",
    "profil",
    "profile",
    "entite",
    "entity",
    "groupe",
    "group",
  ],
  Management: [
    "contrat",
    "contract",
    "fournisseur",
    "supplier",
    "budget",
    "document",
    "ligne",
    "line",
  ],
  Project: ["projet", "project", "tache", "task"],
  Dropdowns: [
    "localisation",
    "location",
    "site",
    "categorie",
    "fabricant",
    "manufacturer",
  ],
  Rule: ["regle", "rule", "automatisation"],
  Components: [
    "composant",
    "component",
    "memoire",
    "memory",
    "processeur",
    "processor",
    "disque",
    "disk",
  ],
  Setup: ["configuration", "config", "webhook", "plugin"],
  Notifications: ["notification", "email", "alerte"],
  Knowledgebase: ["connaissance", "knowledge", "article", "kb"],
  Inventory: ["inventaire", "inventory"],
  Tools: ["outil", "tool"],
};

// "create"/"creer" -> POST, "update"/"modifier" -> PATCH, "delete"/"supprimer" -> DELETE,
// "get"/"list"/"lister" -> GET (keys are accent-stripped, see normalize()).
const ACTION_METHOD: Record<string, string> = {
  create: "POST",
  creer: "POST",
  add: "POST",
  ajouter: "POST",
  update: "PATCH",
  modifier: "PATCH",
  maj: "PATCH",
  edit: "PATCH",
  delete: "DELETE",
  supprimer: "DELETE",
  remove: "DELETE",
  effacer: "DELETE",
  get: "GET",
  fetch: "GET",
  list: "GET",
  lister: "GET",
  recuperer: "GET",
  afficher: "GET",
  search: "GET",
  chercher: "GET",
  rechercher: "GET",
  voir: "GET",
  obtenir: "GET",
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "with",
  "is",
  "are",
  "be",
  "i",
  "want",
  "would",
  "like",
  "please",
  "me",
  "my",
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "de",
  "du",
  "au",
  "aux",
  "pour",
  "dans",
  "sur",
  "et",
  "ou",
  "avec",
  "est",
  "sont",
  "je",
  "veux",
  "voudrais",
  "svp",
  "stp",
  "moi",
  "mon",
  "ma",
  "mes",
]);

// Accented letters we might realistically see in a French query, each mapped to
// its plain ASCII equivalent, so e.g. "créer"/"catégorie"/"problème" match the
// unaccented forms used throughout CATEGORY_SYNONYMS/ACTION_METHOD above.
const ACCENT_MAP: Record<string, string> = {
  à: "a",
  â: "a",
  ä: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  î: "i",
  ï: "i",
  ô: "o",
  ö: "o",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  œ: "oe",
};

/** Lowercase + strip accents, so "créer"/"problème"/"catégorie" match their unaccented forms. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => ACCENT_MAP[char] ?? char)
    .join("");
}

function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Naive singular form (strip a trailing "s") so plural queries ("tickets", "utilisateurs")
 * still match the singular vocabulary used by CATEGORY_SYNONYMS and path segments — a v0
 * heuristic, not real stemming, kept deliberately simple. */
function singularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/** A token plus its naive singular, so callers can match either without repeating the check. */
function tokenVariants(token: string): string[] {
  const singular = singularize(token);
  return singular === token ? [token] : [token, singular];
}

/**
 * Scores every endpoint of the bundled index against a plain-English query
 * (see FIND-EXECUTE-SPEC.md section 1 for the rules below) and returns the
 * top `maxResults`, each enriched with its body schema's fields so a caller
 * knows exactly what to send — not just the schema's name.
 */
export function search(query: string, maxResults = 5): FindResult[] {
  const tokens = tokenize(query);
  const actionTokens = tokens.filter((token) => token in ACTION_METHOD);
  const schemas = loadSchemasIndex();

  const scored = listAllEntries().map((entry) => {
    let score = 0;
    const categoryNormalized = normalize(entry.category);
    const synonyms = CATEGORY_SYNONYMS[entry.category] ?? [];
    const segments = entry.path
      .toLowerCase()
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/[{}]/g, ""));
    const bodySchemaNormalized = entry.bodySchema
      ? normalize(entry.bodySchema)
      : "";
    const responseSchemaNormalized = entry.responseSchema
      ? normalize(entry.responseSchema)
      : "";

    for (const token of tokens) {
      const variants = tokenVariants(token);

      if (
        variants.includes(categoryNormalized) ||
        variants.some((variant) => synonyms.includes(variant))
      ) {
        score += 3;
      }
      if (
        segments.some((segment) =>
          variants.some(
            (variant) => segment === variant || segment.includes(variant),
          ),
        )
      ) {
        score += 5;
      }
      if (
        variants.some(
          (variant) =>
            (bodySchemaNormalized && bodySchemaNormalized.includes(variant)) ||
            (responseSchemaNormalized &&
              responseSchemaNormalized.includes(variant)),
        )
      ) {
        score += 1;
      }
    }

    for (const action of actionTokens) {
      if (ACTION_METHOD[action] === entry.method) {
        score += 2;
      }
    }

    return { entry, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxResults))
    .map(({ entry, score }) => ({
      method: entry.method,
      path: entry.path,
      category: entry.category,
      pathParams: entry.pathParams,
      queryParams: entry.queryParams,
      bodySchema: entry.bodySchema,
      bodyFields: entry.bodySchema ? schemas[entry.bodySchema] : undefined,
      score,
    }));
}
