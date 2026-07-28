import type { INodeProperties, INodeTypeDescription } from "n8n-workflow";

// Shared building blocks used by the GLPI API node.

export const GLPI_CREDENTIALS: NonNullable<
  INodeTypeDescription["credentials"]
> = [
  {
    name: "glpiOAuth2Api",
    required: true,
    displayOptions: { show: { authentication: ["oAuth2"] } },
  },
  {
    name: "glpiPasswordApi",
    required: true,
    displayOptions: { show: { authentication: ["password"] } },
  },
];

export const AUTHENTICATION_PROPERTY: INodeProperties = {
  displayName: "Authentication",
  name: "authentication",
  type: "options",
  options: [
    { name: "OAuth2 (Authorization Code)", value: "oAuth2" },
    { name: "OAuth2 (Password / Resource Owner)", value: "password" },
  ],
  default: "oAuth2",
};

export const CONTEXT_OPTIONS_PROPERTY: INodeProperties = {
  displayName: "Context Options",
  name: "contextOptions",
  type: "collection",
  placeholder: "Add Context Option",
  default: {},
  options: [
    {
      displayName: "GLPI Entity",
      name: "glpiEntity",
      type: "number",
      default: 0,
      description: "Entity ID to use for this request (header GLPI-Entity)",
    },
    {
      displayName: "GLPI Profile",
      name: "glpiProfile",
      type: "number",
      default: 0,
      description: "Profile ID to use for this request (header GLPI-Profile)",
    },
    {
      displayName: "GLPI Entity Recursive",
      name: "glpiEntityRecursive",
      type: "boolean",
      default: false,
      description:
        "Whether to include sub-entities (header GLPI-Entity-Recursive)",
    },
    {
      displayName: "Accept Language",
      name: "acceptLanguage",
      type: "string",
      default: "",
      placeholder: "fr_FR",
      description: "Response language (header Accept-Language)",
    },
  ],
};

/**
 * "Specify Body" toggle matching the pattern used by n8n's own HTTP Request
 * node: a raw JSON editor, or a plain Name/Value list ("Using Fields Below")
 * for users who'd rather not hand-write JSON for simple bodies.
 * `showCondition` is whatever displayOptions rule already gates the Body field
 * (a route regex, in the generic node).
 */
export function buildSpecifyBodyProperty(
  showCondition: NonNullable<INodeProperties["displayOptions"]>["show"],
): INodeProperties {
  return {
    displayName: "Specify Body",
    name: "specifyBody",
    type: "options",
    options: [
      { name: "Using Fields Below", value: "keypair" },
      { name: "Using JSON", value: "json" },
    ],
    default: "json",
    displayOptions: { show: showCondition },
  };
}

export function buildBodyProperty(
  showCondition: NonNullable<INodeProperties["displayOptions"]>["show"],
): INodeProperties {
  return {
    displayName: "Body",
    name: "body",
    type: "json",
    default: "{}",
    description:
      'JSON body sent to the GLPI API. Check the "bodySchema" of the underlying endpoint in resources/glpi-endpoints-index.json (or the full OpenAPI spec) for the expected shape.',
    displayOptions: { show: { ...showCondition, specifyBody: ["json"] } },
  };
}

export function buildBodyParametersProperty(
  showCondition: NonNullable<INodeProperties["displayOptions"]>["show"],
): INodeProperties {
  return {
    displayName: "Body Parameters",
    name: "bodyParameters",
    type: "fixedCollection",
    typeOptions: { multipleValues: true },
    default: {},
    placeholder: "Add Field",
    displayOptions: { show: { ...showCondition, specifyBody: ["keypair"] } },
    options: [
      {
        displayName: "Field",
        name: "parameter",
        values: [
          {
            displayName: "Name",
            name: "name",
            type: "string",
            default: "",
          },
          {
            displayName: "Value",
            name: "value",
            type: "string",
            default: "",
            description:
              "Numbers, true/false, null, or JSON arrays/objects (e.g. [1,2]) are sent as that type; anything else is sent as a string.",
          },
        ],
      },
    ],
  };
}
