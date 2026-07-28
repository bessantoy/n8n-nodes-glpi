#!/usr/bin/env node
/**
 * Fetches the live OpenAPI spec from the GLPI instance configured via the
 * GLPI_DOC_JSON_URL environment variable (see
 * .github/workflows/sync-glpi-api.yml), and compares it against the committed
 * resources/glpi-openapi-full.json.
 *
 * The real instance hostname is replaced with the same "glpi.example.com"
 * placeholder already used in the committed spec BEFORE any comparison or
 * write happens — the real hostname must never be written to the repo (see
 * README "Mettre à jour vers une nouvelle version de l'API GLPI"). Because of
 * this, GLPI_DOC_JSON_URL must be stored as a GitHub Actions secret, never
 * committed or logged.
 *
 * Exit codes:
 *   0 — fetched successfully, no change from what's committed.
 *   2 — fetched successfully, spec changed and resources/glpi-openapi-full.json
 *       was overwritten; the caller should regenerate the index and open a PR.
 *   1 — fetch/parse error (network issue, non-200 status, invalid JSON — e.g.
 *       the URL points at the HTML Swagger page instead of the raw doc.json).
 *
 * Run with: GLPI_DOC_JSON_URL=... node scripts/fetch-and-normalize-spec.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const PLACEHOLDER_HOST = "glpi.example.com";
const MAX_REDIRECTS = 5;

const url = process.env.GLPI_DOC_JSON_URL;
if (!url) {
  console.error("GLPI_DOC_JSON_URL is not set.");
  process.exit(1);
}

const specPath = path.join(
  __dirname,
  "..",
  "resources",
  "glpi-openapi-full.json",
);

function fetch(targetUrl, redirectsLeft) {
  return new Promise((resolve, reject) => {
    https
      .get(targetUrl, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(
              new Error("Too many redirects while fetching the GLPI API spec."),
            );
            return;
          }
          res.resume();
          resolve(fetch(res.headers.location, redirectsLeft - 1));
          return;
        }
        if (status !== 200) {
          reject(
            new Error(
              `Unexpected HTTP status ${status} fetching the GLPI API spec.`,
            ),
          );
          return;
        }
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

(async () => {
  const raw = await fetch(url, MAX_REDIRECTS);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Response was not valid JSON — GLPI_DOC_JSON_URL likely points at the HTML Swagger page " +
        "(.../doc) instead of the raw spec (.../doc.json).",
    );
  }

  const realHost = new URL(url).host;
  const normalized =
    JSON.stringify(parsed, null, 2).split(realHost).join(PLACEHOLDER_HOST) +
    "\n";

  // Compare after identical canonicalization on both sides — the committed file
  // may be minified/differently formatted, which must never look like a "real"
  // change on its own (that would fire on every run, formatting aside).
  const current = fs.existsSync(specPath)
    ? fs.readFileSync(specPath, "utf8")
    : "";
  const currentNormalized = current
    ? JSON.stringify(JSON.parse(current), null, 2) + "\n"
    : "";

  if (normalized === currentNormalized) {
    console.log("No change in the GLPI API spec.");
    process.exit(0);
  }

  fs.writeFileSync(specPath, normalized, "utf8");
  console.log(
    `Spec changed (API version: ${parsed.info?.version ?? "unknown"}). Wrote ${path.relative(process.cwd(), specPath)}.`,
  );
  process.exit(2);
})().catch((error) => {
  console.error("Failed to fetch/compare the GLPI API spec:", error.message);
  process.exit(1);
});
