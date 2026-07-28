import type { ICredentialType, INodeProperties } from "n8n-workflow";

export class GlpiPasswordApi implements ICredentialType {
  name = "glpiPasswordApi";

  displayName = "GLPI Password Grant API";

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
      displayName: "Client ID",
      name: "clientId",
      type: "string",
      default: "",
      required: true,
    },
    {
      displayName: "Client Secret",
      name: "clientSecret",
      type: "string",
      typeOptions: { password: true },
      default: "",
    },
    {
      displayName: "Username",
      name: "username",
      type: "string",
      default: "",
      required: true,
    },
    {
      displayName: "Password",
      name: "password",
      type: "string",
      typeOptions: { password: true },
      default: "",
      required: true,
    },
    {
      displayName: "Scope",
      name: "scope",
      type: "string",
      default: "api user email status",
    },
  ];
}
