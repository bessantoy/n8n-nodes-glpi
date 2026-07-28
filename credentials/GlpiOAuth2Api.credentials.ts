import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class GlpiOAuth2Api implements ICredentialType {
  name = "glpiOAuth2Api";

  extends = ["oAuth2Api"];

  displayName = "GLPI OAuth2 API";

  documentationUrl = "https://github.com/your-org/n8n-nodes-glpi";

  properties: INodeProperties[] = [
    {
      displayName: "GLPI Base URL",
      name: "baseUrl",
      type: "string",
      default: "",
      placeholder: "https://glpi.example.com/api.php",
      required: true,
      description:
        "Base URL of the GLPI High-Level REST API (without trailing slash)",
    },
    {
      displayName: "Grant Type",
      name: "grantType",
      type: "hidden",
      default: "authorizationCode",
    },
    {
      displayName: "Authorization URL",
      name: "authUrl",
      type: "hidden",
      default: '={{$self["baseUrl"]}}/authorize',
    },
    {
      displayName: "Access Token URL",
      name: "accessTokenUrl",
      type: "hidden",
      default: '={{$self["baseUrl"]}}/token',
    },
    {
      displayName: "Scope",
      name: "scope",
      type: "hidden",
      default: "api user email status",
    },
    {
      displayName: "Auth URI Query Parameters",
      name: "authQueryParameters",
      type: "hidden",
      default: "",
    },
    {
      displayName: "Authentication",
      name: "authentication",
      type: "hidden",
      default: "body",
    },
  ];
}
