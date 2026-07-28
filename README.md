# n8n-nodes-glpi

Node communautaire [n8n](https://n8n.io) pour piloter la **GLPI High-Level REST API** (`/api.php/v2.3`)

Le package fournit un seul node, **GLPI (Generic)**, capable d'appeler n'importe quel endpoint de l'API sans code spécifique par ressource : une sélection **Category → Route** (affichée telle quelle, ex. `GET /Administration/ApprovalSubstitute`, exactement comme dans la doc officielle de l'API), pilotée par un index bundlé (`resources/glpi-endpoints-index.json`) généré depuis le spec OpenAPI de GLPI et couvrant la totalité des ~2485 endpoints. Les paramètres de chemin (ex. `{id}`) deviennent des champs dédiés nommés automatiquement, le corps des requêtes peut s'écrire en JSON libre ou via une liste de champs Name/Value, et l'authentification supporte aussi bien le flow OAuth2 interactif que le flow Password Grant pour de l'automatisation serveur-à-serveur.

## Sommaire

- [Prérequis](#prérequis)
- [Installation](#installation)
- [Authentification](#authentification)
- [Utilisation](#utilisation)
- [Exemples](#exemples)
- [Architecture technique](#architecture-technique)
- [Mettre à jour vers une nouvelle version de l'API GLPI](#mettre-à-jour-vers-une-nouvelle-version-de-lapi-glpi)
- [Développement local](#développement-local)
- [Limites connues](#limites-connues)

## Prérequis

- Une instance **GLPI** exposant la High-Level REST API (`/api.php/v2.3`, distincte de l'ancienne `/apirest.php`).
- Un client OAuth2 déclaré côté GLPI (Configuration générale > API > Clients OAuth2).

## Installation

Depuis n8n : **Settings > Community Nodes > Install**, renseigner `n8n-nodes-glpi`. Pour le dev local, voir [Développement local](#développement-local).

## Authentification

Deux types de credential, au choix via le champ **Authentication** du node :

- **OAuth2 (Authorization Code)** — credential `GLPI OAuth2 API`. Renseigner **GLPI Base URL**, **Client ID**/**Client Secret**, puis se connecter via "Connect my account" (mécanisme standard n8n).
- **Password Grant** — credential `GLPI Password Grant API`, pour un usage serveur-à-serveur sans interaction. Renseigner **Base URL**, **Client ID/Secret**, **Username/Password**, **Scope**. Le token est mis en cache et renouvelé automatiquement.

**Context Options** (sur chaque requête) : GLPI Entity, GLPI Profile, GLPI Entity Recursive, Accept Language → headers `GLPI-Entity`, `GLPI-Profile`, `GLPI-Entity-Recursive`, `Accept-Language`.

## Utilisation

1. **Category** — la vraie catégorie GLPI (tag OpenAPI de l'endpoint), triée alphabétiquement comme la doc officielle.
2. **Route** — méthode + chemin affichés ensemble (ex. `GET /Assistance/Ticket/{id}`), exactement comme dans la doc.
3. Un champ apparaît automatiquement pour chaque `{placeholder}` de la route (ex. **Asset Itemtype**, **Asset ID**), avec un nom lisible — chaque champ accepte aussi une expression n8n (`{{$json.ticket_id}}`).
4. **Query Options** *(GET)* : Filter (RSQL), Sort, Start/Limit. **Return All** paginer automatiquement.
5. **Body** *(POST/PATCH)* — champ **Specify Body** : soit l'éditeur JSON libre, soit une liste **Name/Value** (comme le node HTTP Request natif) où les valeurs numériques/booléennes/JSON sont envoyées avec leur vrai type.

## Exemples

**Récupérer un ticket**
- Category: `Assistance` → Route: `GET /Assistance/Ticket/{id}` → champ **ID**: `1234`

**Créer un ticket sans écrire de JSON**
- Category: `Assistance` → Route: `POST /Assistance/Ticket`
- Specify Body: `Using Fields Below` → `name` = `Imprimante HS`, `urgency` = `3` (envoyé comme nombre)

**Endpoint à plusieurs paramètres (installer un OS sur un asset)**
- Category: `Assets` → Route: `POST /Assets/{asset_itemtype}/{asset_id}/OSInstallation`
- Champ **Asset Itemtype**: `Computer` · Champ **Asset ID**: `1234`
- Body : `{ "operatingsystems_id": 1 }`

## Mettre à jour vers une nouvelle version de l'API GLPI

1. Remplacer `resources/glpi-openapi-full.json` par le nouveau spec (`GET /api.php/v{X.Y.Z}/doc.json` sur l'instance cible — pas `/doc` sans `.json`, qui est la page HTML).
2. `npm run generate:index` — régénère l'index (`category` = tag OpenAPI de l'opération).
3. `npm run build`
4. `npm run validate:endpoints` — signale toute nouvelle catégorie GLPI absente de `DISPLAY_CATEGORIES` (`nodes/Glpi/EndpointIndex.ts`), seul ajustement manuel nécessaire. Les routes et champs de paramètres se mettent à jour automatiquement.

**CI/CD** (`.github/workflows/`) : `ci.yml` exécute build + validation sur chaque push/PR. `sync-glpi-api.yml` (planifié chaque lundi + déclenchable manuellement) récupère le spec live d'une instance GLPI, le compare, et ouvre une pull request si un changement est détecté — jamais de merge automatique. Nécessite le secret de dépôt `GLPI_DOC_JSON_URL` (URL `.../doc.json`, pas `.../doc`) ; le nom d'hôte réel n'est jamais écrit dans le dépôt (`scripts/fetch-and-normalize-spec.js` l'anonymise avant toute comparaison/écriture).

## Développement local

```bash
npm install
npm run build
```

Pour tester dans n8n : `npm link`, puis dans `~/.n8n/custom` : `npm link n8n-nodes-glpi`, et redémarrer n8n.

```bash
npm run dev                 # tsc --watch
npm run format               # prettier --write
npm run generate:index       # régénère l'index depuis le spec OpenAPI
npm run validate:endpoints   # vérifie l'index régénéré
```

## Licence

MIT
