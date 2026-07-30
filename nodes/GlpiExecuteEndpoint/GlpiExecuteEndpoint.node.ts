import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import {
  AUTHENTICATION_PROPERTY,
  CONTEXT_OPTIONS_PROPERTY,
  GLPI_CREDENTIALS,
} from "../Glpi/SharedProperties";
import { glpiApiRequest } from "../Glpi/GenericFunctions";

/** JSON.parse with a clear NodeOperationError instead of a generic crash — an AI caller
 * can produce slightly malformed JSON, so the error message needs to say which field.
 * A "json"-type parameter driven by an AI Agent / MCP tool call arrives already parsed
 * (a plain object), not as a string, so this has to accept both shapes. */
function parseJsonParameter(
  this: IExecuteFunctions,
  raw: unknown,
  itemIndex: number,
  fieldLabel: string,
): IDataObject {
  if (raw === undefined || raw === null || raw === "") {
    return {};
  }
  if (typeof raw === "object") {
    return raw as IDataObject;
  }
  if (typeof raw !== "string") {
    return {};
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return {};
  }
  try {
    return JSON.parse(trimmed) as IDataObject;
  } catch {
    throw new NodeOperationError(
      this.getNode(),
      `${fieldLabel} is not valid JSON: ${raw}`,
      { itemIndex },
    );
  }
}

// Executes a single GLPI API call given an exact method + path, as returned by
// GLPI: Find Endpoint. Reuses glpiApiRequest() from nodes/Glpi/GenericFunctions.ts
// so auth (OAuth2 / Password Grant) and HTTP handling aren't duplicated. Meant to
// be plugged as a tool (`usableAsTool: true`) on an AI Agent or MCP Server Trigger.
export class GlpiExecuteEndpoint implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GLPI: Execute Endpoint",
    name: "glpiExecuteEndpoint",
    icon: "file:glpi-execute.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["method"] + " " + $parameter["path"]}}',
    description:
      "Call a specific GLPI API endpoint given its exact method and path (as returned by GLPI: Find Endpoint) — for an AI agent that already knows which endpoint to call.",
    defaults: {
      name: "GLPI: Execute Endpoint",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: GLPI_CREDENTIALS,
    properties: [
      AUTHENTICATION_PROPERTY,
      {
        displayName: "Method",
        name: "method",
        type: "string",
        default: "",
        required: true,
        description:
          "HTTP method, e.g. GET, POST, PATCH, DELETE — copy the 'method' value from Find Endpoint's result.",
      },
      {
        displayName: "Path",
        name: "path",
        type: "string",
        default: "",
        required: true,
        description:
          "The exact path from Find Endpoint's result, with placeholders like {id} already replaced by real values, e.g. '/Assistance/Ticket/1234' or '/Assistance/Ticket' for creation.",
      },
      {
        displayName: "Query Parameters",
        name: "queryParams",
        type: "json",
        default: "{}",
        description:
          'Optional JSON object of query parameters, e.g. {"filter": "status==1", "limit": 10}.',
      },
      {
        displayName: "Body",
        name: "body",
        type: "json",
        default: "{}",
        description:
          'JSON object matching the bodyFields returned by Find Endpoint, e.g. {"name": "Printer down", "urgency": 3}.',
      },
      CONTEXT_OPTIONS_PROPERTY,
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const method = (
          this.getNodeParameter("method", i) as string
        ).toUpperCase() as IHttpRequestMethods;
        const path = this.getNodeParameter("path", i) as string;
        const queryParamsRaw = this.getNodeParameter("queryParams", i, "{}");
        const bodyRaw = this.getNodeParameter("body", i, "{}");

        const qs = parseJsonParameter.call(
          this,
          queryParamsRaw,
          i,
          "Query Parameters",
        );
        const body = parseJsonParameter.call(this, bodyRaw, i, "Body");

        const headers: IDataObject = {};
        const contextOptions = this.getNodeParameter(
          "contextOptions",
          i,
          {},
        ) as IDataObject;
        if (
          contextOptions.glpiEntity !== undefined &&
          contextOptions.glpiEntity !== 0
        ) {
          headers["GLPI-Entity"] = contextOptions.glpiEntity;
        }
        if (
          contextOptions.glpiProfile !== undefined &&
          contextOptions.glpiProfile !== 0
        ) {
          headers["GLPI-Profile"] = contextOptions.glpiProfile;
        }
        if (contextOptions.glpiEntityRecursive) {
          headers["GLPI-Entity-Recursive"] = "true";
        }
        if (contextOptions.acceptLanguage) {
          headers["Accept-Language"] = contextOptions.acceptLanguage;
        }

        const responseData = await glpiApiRequest.call(
          this,
          method,
          path,
          body,
          qs,
          headers,
        );

        const dataArray = Array.isArray(responseData)
          ? responseData
          : [responseData];
        for (const data of dataArray) {
          returnData.push({ json: data ?? {}, pairedItem: { item: i } });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
