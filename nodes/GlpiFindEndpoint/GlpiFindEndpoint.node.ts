import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import { search } from "./SearchEngine";

// Pure search over the bundled endpoint + schema indexes, no request sent to
// GLPI. Meant to be plugged as a tool (`usableAsTool: true`) on an AI Agent or
// MCP Server Trigger, paired with GlpiExecuteEndpoint: the agent describes what
// it wants in plain English, gets back candidate routes with their exact body
// fields, then calls GlpiExecuteEndpoint with the one it picked.
export class GlpiFindEndpoint implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GLPI: Find Endpoint",
    name: "glpiFindEndpoint",
    icon: "file:glpi-find.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["query"]}}',
    description:
      "Search the GLPI API's endpoints for the ones matching a plain-English request (e.g. 'create a ticket'). Returns candidate routes with their exact body fields, for use with GLPI: Execute Endpoint.",
    defaults: {
      name: "GLPI: Find Endpoint",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: "Query",
        name: "query",
        type: "string",
        default: "",
        required: true,
        description:
          "Describe in plain English what you want to do in GLPI, e.g. 'create a ticket', 'update computer location', 'list users in an entity'. Be specific about the object type (ticket, computer, user, project...) and the action (create, get, update, delete, list, search).",
      },
      {
        displayName: "Max Results",
        name: "maxResults",
        type: "number",
        default: 5,
        typeOptions: {
          minValue: 1,
        },
        description: "Maximum number of candidate endpoints to return",
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const query = this.getNodeParameter("query", i) as string;
      const maxResults = this.getNodeParameter("maxResults", i, 5) as number;

      const results = search(query, maxResults);
      returnData.push({ json: { results }, pairedItem: { item: i } });
    }

    return [returnData];
  }
}
