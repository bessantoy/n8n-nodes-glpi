# Contributing

This document describes how to develop, maintain, and publish this package. For installation and usage of the node in an n8n workflow, see the [README](README.md).

## Local development

```bash
npm install
npm run build
```

To test in a local n8n instance: `npm link`, then inside `~/.n8n/custom`: `npm link @bessantoy/n8n-nodes-glpi`, and restart n8n.

```bash
npm run dev                 # tsc --watch
npm run format               # prettier --write
npm run generate:index       # regenerate the index from the OpenAPI spec
npm run validate:endpoints   # check the regenerated index
```

## Updating to a new version of the GLPI API

The node's endpoint list (`resources/glpi-endpoints-index.json`) is generated from the OpenAPI spec published by GLPI, rather than hand-written. To regenerate it after a new API version is released:

1. Replace `resources/glpi-openapi-full.json` with the new spec (`GET /api.php/v{X.Y.Z}/doc.json` on the target instance — not `/doc` without `.json`, which is the HTML page).
2. `npm run generate:index` — regenerates the index (`category` = the operation's OpenAPI tag).
3. `npm run build`
4. `npm run validate:endpoints` — flags any new GLPI category missing from `DISPLAY_CATEGORIES` (`nodes/Glpi/EndpointIndex.ts`), the only manual adjustment needed. Routes and parameter fields update automatically.

**CI/CD** (`.github/workflows/`): `ci.yml` runs build + validation on every push/PR. `sync-glpi-api.yml` (scheduled every Monday + manually triggerable) fetches the live spec from a GLPI instance, compares it, and opens a pull request if a change is detected — never an automatic merge. Requires the repository secret `GLPI_DOC_JSON_URL` (a `.../doc.json` URL, not `.../doc`); the real hostname is never written to the repository (`scripts/fetch-and-normalize-spec.js` anonymizes it before any comparison/write).

## npm publishing

The package is published under the **`@bessantoy/n8n-nodes-glpi`** scope (public, `publishConfig.access: "public"`), via `.github/workflows/publish-npm.yml`:

1. Create a **GitHub Release** with a `vX.Y.Z` tag (e.g. `v0.1.1`) — this is what triggers publishing, never a direct push. No need to manually bump the version in `package.json`: the workflow aligns the version with the tag automatically before publishing.
2. The workflow rebuilds, runs `validate:endpoints`, then `npm publish`.

Requires the repository secret **`NPM_TOKEN`**: an npm **Automation** token, generated from an account with publish rights on the `@bessantoy` scope (npmjs.com > Access Tokens > Generate New Token).
