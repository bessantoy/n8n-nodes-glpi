import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodeProperties,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeConnectionTypes } from "n8n-workflow";

import {
  AUTHENTICATION_PROPERTY,
  buildBodyParametersProperty,
  buildBodyProperty,
  buildSpecifyBodyProperty,
  CONTEXT_OPTIONS_PROPERTY,
  GLPI_CREDENTIALS,
} from "./SharedProperties";
import {
  getEntry,
  humanizeParamName,
  isCollectionPath,
  listAllPathParamNames,
  listCategories,
  listRoutesForCategory,
} from "./EndpointIndex";
import {
  buildRequestBody,
  glpiApiRequest,
  glpiApiRequestAllItems,
} from "./GenericFunctions";

/** Node parameter name used for a given {placeholder}, to keep it distinct from other fields. */
function pathParamFieldName(name: string): string {
  return `pp_${name}`;
}

/** The Route field's value is "METHOD /path" (e.g. "GET /Assets/Computer") — split it back apart. */
function parseRoute(route: string): {
  method: IHttpRequestMethods;
  path: string;
} {
  const spaceIndex = route.indexOf(" ");
  return {
    method: route.slice(0, spaceIndex) as IHttpRequestMethods,
    path: route.slice(spaceIndex + 1),
  };
}

// One field per distinct {placeholder} name found anywhere in the bundled index
// (see EndpointIndex.listAllPathParamNames), each shown only when the currently
// selected Route actually contains that placeholder. This gives a plain,
// well-labeled field per parameter (e.g. "Asset Itemtype", "Asset ID") instead of
// a generic "name + value" list the user has to fill in blind.
const BODY_SHOW_CONDITION = {
  route: [{ _cnd: { regex: "^(POST|PATCH) " } }] as unknown as string[],
};

const PATH_PARAMETER_PROPERTIES: INodeProperties[] =
  listAllPathParamNames().map((name) => ({
    displayName: humanizeParamName(name),
    name: pathParamFieldName(name),
    type: "string",
    default: "",
    description: `Value for the {${name}} placeholder of the selected route`,
    displayOptions: {
      show: {
        route: [{ _cnd: { regex: `\\{${name}\\}` } }] as unknown as string[],
      },
    },
  }));

// Sole GLPI node: reaches any of the 2485 GLPI High-Level REST API endpoints
// via a Category -> Route cascade driven by the bundled endpoint index.
export class Glpi implements INodeType {
  description: INodeTypeDescription = {
    displayName: "GLPI API",
    name: "glpi",
    icon: "file:glpi.svg",
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["route"]}}',
    description: "Call any endpoint of the GLPI High-Level REST API (v2.3).",
    defaults: {
      name: "GLPI API",
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: GLPI_CREDENTIALS,
    properties: [
      AUTHENTICATION_PROPERTY,
      {
        displayName: "Category",
        name: "category",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getCategories",
        },
        default: "",
        required: true,
        description:
          "GLPI API category (matches the official API documentation)",
      },
      {
        displayName: "Route",
        name: "route",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getRoutes",
          loadOptionsDependsOn: ["category"],
        },
        default: "",
        required: true,
        description:
          "HTTP method and path of the endpoint to call, exactly as shown in the GLPI API documentation",
      },
      ...PATH_PARAMETER_PROPERTIES,
      {
        displayName: "Return All",
        name: "returnAll",
        type: "boolean",
        default: false,
        description:
          "Whether to return all results or only up to a given limit",
        displayOptions: {
          show: {
            route: [{ _cnd: { regex: "^GET " } }] as unknown as string[],
          },
        },
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        typeOptions: {
          minValue: 1,
        },
        default: 100,
        description: "Max number of results to return",
        displayOptions: {
          show: {
            route: [{ _cnd: { regex: "^GET " } }] as unknown as string[],
            returnAll: [false],
          },
        },
      },
      buildSpecifyBodyProperty(BODY_SHOW_CONDITION),
      buildBodyProperty(BODY_SHOW_CONDITION),
      buildBodyParametersProperty(BODY_SHOW_CONDITION),
      {
        displayName: "Query Options",
        name: "queryOptions",
        type: "collection",
        placeholder: "Add Query Option",
        default: {},
        displayOptions: {
          show: {
            route: [{ _cnd: { regex: "^GET " } }] as unknown as string[],
          },
        },
        options: [
          {
            displayName: "Filter (RSQL)",
            name: "filter",
            type: "string",
            default: "",
            placeholder: "name==foo;status==1",
            description:
              "RSQL filter expression, e.g. ==, !=, =lt=, =gt=, ; for AND, , for OR",
          },
          {
            displayName: "Sort",
            name: "sort",
            type: "string",
            default: "",
            placeholder: "date_creation:desc,name:asc",
          },
          {
            displayName: "Start",
            name: "start",
            type: "number",
            default: 0,
            description: "Pagination offset",
          },
          {
            displayName: "Limit",
            name: "limit",
            type: "number",
            default: 100,
            description: "Page size (ignored when Return All is enabled)",
          },
        ],
      },
      CONTEXT_OPTIONS_PROPERTY,
    ],
  };

  methods = {
    loadOptions: {
      async getCategories(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        return listCategories().map((category) => ({
          name: category,
          value: category,
        }));
      },

      async getRoutes(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const category = this.getCurrentNodeParameter("category") as string;
        if (!category) {
          return [];
        }

        return listRoutesForCategory(category).map(({ method, path }) => ({
          name: `${method} ${path}`,
          value: `${method} ${path}`,
        }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const route = this.getNodeParameter("route", i) as string;
        const parsedRoute = parseRoute(route);
        const method = parsedRoute.method;
        let path = parsedRoute.path;
        const entry = getEntry(path, method);

        const placeholderNames = [...path.matchAll(/\{([^}]+)\}/g)].map(
          (match) => match[1],
        );
        for (const name of placeholderNames) {
          const value = this.getNodeParameter(
            pathParamFieldName(name),
            i,
            "",
          ) as string;
          path = path.replace(`{${name}}`, encodeURIComponent(value));
        }

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

        const body: IDataObject = entry?.hasBody
          ? buildRequestBody.call(this, i)
          : {};

        let responseData: IDataObject | IDataObject[];

        if (method === "GET" && isCollectionPath(path)) {
          const queryOptions = this.getNodeParameter(
            "queryOptions",
            i,
            {},
          ) as IDataObject;
          const returnAll = this.getNodeParameter(
            "returnAll",
            i,
            false,
          ) as boolean;
          const qs: IDataObject = {};
          if (queryOptions.filter) qs.filter = queryOptions.filter;
          if (queryOptions.sort) qs.sort = queryOptions.sort;
          qs.start = queryOptions.start ?? 0;
          qs.limit = returnAll
            ? 100
            : (queryOptions.limit ?? this.getNodeParameter("limit", i, 100));

          responseData = returnAll
            ? await glpiApiRequestAllItems.call(
                this,
                method,
                path,
                body,
                qs,
                headers,
              )
            : await glpiApiRequest.call(this, method, path, body, qs, headers);
        } else if (method === "GET") {
          const queryOptions = this.getNodeParameter(
            "queryOptions",
            i,
            {},
          ) as IDataObject;
          const qs: IDataObject = {};
          if (queryOptions.filter) qs.filter = queryOptions.filter;
          if (queryOptions.sort) qs.sort = queryOptions.sort;
          responseData = await glpiApiRequest.call(
            this,
            method,
            path,
            body,
            qs,
            headers,
          );
        } else {
          responseData = await glpiApiRequest.call(
            this,
            method,
            path,
            body,
            {},
            headers,
          );
        }

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
