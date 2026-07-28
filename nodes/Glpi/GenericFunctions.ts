import type {
  IDataObject,
  IExecuteFunctions,
  IHttpRequestMethods,
  IHttpRequestOptions,
  ILoadOptionsFunctions,
  JsonObject,
} from "n8n-workflow";
import { NodeApiError } from "n8n-workflow";

type GlpiFunctions = IExecuteFunctions | ILoadOptionsFunctions;

interface GlpiPasswordTokenCache {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function requestPasswordGrantToken(
  this: GlpiFunctions,
  baseUrl: string,
  form: IDataObject,
): Promise<IDataObject> {
  return (await this.helpers.httpRequest({
    method: "POST",
    url: `${baseUrl}/token`,
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    json: true,
  })) as IDataObject;
}

async function getPasswordGrantToken(this: GlpiFunctions): Promise<string> {
  const credentials = await this.getCredentials("glpiPasswordApi");
  const baseUrl = normalizeBaseUrl(credentials.baseUrl as string);
  const staticData = this.getWorkflowStaticData("node") as {
    glpiPasswordToken?: GlpiPasswordTokenCache;
  };
  const cached = staticData.glpiPasswordToken;
  const now = Date.now();

  if (cached && cached.expiresAt > now + 5000) {
    return cached.accessToken;
  }

  let response: IDataObject;

  if (cached?.refreshToken) {
    try {
      response = await requestPasswordGrantToken.call(this, baseUrl, {
        grant_type: "refresh_token",
        refresh_token: cached.refreshToken,
        client_id: credentials.clientId as string,
        client_secret: credentials.clientSecret as string,
      });
    } catch {
      response = await requestPasswordGrantToken.call(this, baseUrl, {
        grant_type: "password",
        client_id: credentials.clientId as string,
        client_secret: credentials.clientSecret as string,
        username: credentials.username as string,
        password: credentials.password as string,
        scope: (credentials.scope as string) || "api user email status",
      });
    }
  } else {
    response = await requestPasswordGrantToken.call(this, baseUrl, {
      grant_type: "password",
      client_id: credentials.clientId as string,
      client_secret: credentials.clientSecret as string,
      username: credentials.username as string,
      password: credentials.password as string,
      scope: (credentials.scope as string) || "api user email status",
    });
  }

  const accessToken = response.access_token as string;
  const expiresIn = (response.expires_in as number) ?? 3600;

  staticData.glpiPasswordToken = {
    accessToken,
    refreshToken: (response.refresh_token as string) ?? cached?.refreshToken,
    expiresAt: now + expiresIn * 1000,
  };

  return accessToken;
}

/**
 * Performs an authenticated request against the GLPI High-Level REST API,
 * transparently handling both supported credential types (OAuth2 authorization
 * code, managed by n8n core, and the custom password grant with manual token
 * caching via workflow static data).
 */
export async function glpiApiRequest(
  this: GlpiFunctions,
  method: IHttpRequestMethods,
  endpointPath: string,
  body: IDataObject = {},
  qs: IDataObject = {},
  headers: IDataObject = {},
): Promise<any> {
  const authentication = this.getNodeParameter(
    "authentication",
    0,
    "oAuth2",
  ) as string;

  const options: IHttpRequestOptions = {
    method,
    url: "",
    headers: { ...headers },
    json: true,
  };

  if (Object.keys(qs).length > 0) {
    options.qs = qs;
  }
  if (Object.keys(body).length > 0) {
    options.body = body;
  }

  try {
    if (authentication === "password") {
      const credentials = await this.getCredentials("glpiPasswordApi");
      const baseUrl = normalizeBaseUrl(credentials.baseUrl as string);
      const token = await getPasswordGrantToken.call(this);

      options.url = `${baseUrl}${endpointPath}`;
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };

      return await this.helpers.httpRequest(options);
    }

    const credentials = await this.getCredentials("glpiOAuth2Api");
    const baseUrl = normalizeBaseUrl(credentials.baseUrl as string);
    options.url = `${baseUrl}${endpointPath}`;

    return await this.helpers.httpRequestWithAuthentication.call(
      this,
      "glpiOAuth2Api",
      options,
    );
  } catch (error) {
    throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
  }
}

/** JSON-parses a "Body Parameters" field value when it looks like a number, boolean, null, or a
 * JSON array/object (e.g. "42", "true", '["a","b"]'), otherwise keeps it as a plain string. This
 * lets "Using Fields Below" send the same non-string types the GLPI schemas expect (e.g. numeric
 * IDs, booleans) without forcing the user into the raw JSON editor for simple bodies. */
function smartParseFieldValue(value: string): unknown {
  if (value === "") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Resolves the request body for the current item, honoring the "Specify Body" toggle shared by
 * every GLPI node: either the raw JSON editor ("json", the default), or the "Body Parameters"
 * fixedCollection of Name/Value pairs ("keypair"), assembled into a plain object here.
 */
export function buildRequestBody(
  this: IExecuteFunctions,
  itemIndex: number,
): IDataObject {
  const specifyBody = this.getNodeParameter(
    "specifyBody",
    itemIndex,
    "json",
  ) as string;

  if (specifyBody === "keypair") {
    const bodyParametersUi = this.getNodeParameter(
      "bodyParameters",
      itemIndex,
      {},
    ) as IDataObject;
    const pairs = (bodyParametersUi.parameter as IDataObject[]) ?? [];
    const body: IDataObject = {};

    for (const { name, value } of pairs as Array<{
      name: string;
      value: string;
    }>) {
      if (!name) {
        continue;
      }
      body[name] = smartParseFieldValue(value) as IDataObject[string];
    }

    return body;
  }

  const rawBody = this.getNodeParameter("body", itemIndex, "{}") as string;
  return typeof rawBody === "string"
    ? JSON.parse(rawBody || "{}")
    : (rawBody as IDataObject);
}

/**
 * Loops over `start`/`limit` to fetch every page of a GLPI collection endpoint.
 */
export async function glpiApiRequestAllItems(
  this: GlpiFunctions,
  method: IHttpRequestMethods,
  endpointPath: string,
  body: IDataObject = {},
  qs: IDataObject = {},
  headers: IDataObject = {},
): Promise<IDataObject[]> {
  const returnData: IDataObject[] = [];
  const limit = (qs.limit as number) || 100;
  let start = (qs.start as number) || 0;

  let responseLength: number;
  do {
    const response = await glpiApiRequest.call(
      this,
      method,
      endpointPath,
      body,
      {
        ...qs,
        start,
        limit,
      },
      headers,
    );

    const items: IDataObject[] = Array.isArray(response)
      ? response
      : [response];
    returnData.push(...items);
    responseLength = items.length;
    start += limit;
  } while (responseLength === limit);

  return returnData;
}
