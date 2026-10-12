import http from 'node:http';
import https from 'node:https';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { z } from 'zod';
import { snakeToCamelCase } from '../../utils/case-converter.util';
import { getRequestContext } from '../context/request-context';
import { logger } from '../logger/logger';
import {
  ExternalServiceError,
  type ExternalFailureKind,
  type IntegrationIdentity,
} from '../errors/external.error';
import { I18N_MESSAGES } from '../i18n/messages';
import type { LocalizedMessage } from '../i18n/translate';
import { summarizeVendorBody } from './vendor-body';

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/** Header that carries the inbound request ID to the vendor, so both sides can correlate logs. */
export const OUTBOUND_REQUEST_ID_HEADER = 'X-Request-ID';

/** Timeout → 504, no response → 502 unreachable, vendor error response → 502 (never its status). */
const classifyFailure = (error: unknown): ExternalFailureKind => {
  if (!axios.isAxiosError(error)) return 'ERROR';
  if (error.code !== undefined && TIMEOUT_CODES.has(error.code)) return 'TIMEOUT';
  return error.response ? 'ERROR' : 'UNREACHABLE';
};

/** What the client is told: a generic, localized reason — never the vendor's own words. */
const CLIENT_DETAIL: Record<ExternalFailureKind, LocalizedMessage> = {
  TIMEOUT: I18N_MESSAGES.EXTERNAL_TIMEOUT_DETAIL,
  UNREACHABLE: I18N_MESSAGES.EXTERNAL_UNREACHABLE_DETAIL,
  ERROR: I18N_MESSAGES.EXTERNAL_ERROR_DETAIL,
};

/** The path only: query strings often carry keys or personal data. */
const withoutQuery = (url: string | undefined): string | undefined => url?.split('?').at(0);

export interface HttpClientOptions {
  /** Entry of `INTEGRATION_REGISTRY` (src/integrations/registry.ts). */
  integration: IntegrationIdentity;
  baseURL?: string;
  /** Required: an outbound call without a deadline can hold a request (and a socket) forever. */
  timeoutMs: number;
  maxSockets?: number;
}

export class HttpClientService {
  private readonly client: AxiosInstance;
  private readonly integration: IntegrationIdentity;

  constructor(options: HttpClientOptions) {
    this.integration = options.integration;

    // HTTP / HTTPS Persistent Keep-Alive Connection Pool
    const agentOptions = {
      keepAlive: true,
      maxSockets: options.maxSockets ?? 100,
      maxFreeSockets: 10,
      timeout: options.timeoutMs,
    };

    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      httpAgent: new http.Agent(agentOptions),
      httpsAgent: new https.Agent(agentOptions),
      headers: {
        connection: 'keep-alive',
      },
    });

    // Correlation & Logging Interceptors (headers are never logged: they carry credentials)
    this.client.interceptors.request.use((config) => {
      const requestId = getRequestContext()?.requestId;
      if (requestId !== undefined && !config.headers.has(OUTBOUND_REQUEST_ID_HEADER)) {
        config.headers.set(OUTBOUND_REQUEST_ID_HEADER, requestId);
      }
      logger.debug(
        {
          integration: this.integration.code,
          method: config.method,
          url: withoutQuery(config.url),
        },
        'Outbound HTTP request started',
      );
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          {
            integration: this.integration.code,
            status: response.status,
            url: withoutQuery(response.config.url),
          },
          'Outbound HTTP request succeeded',
        );
        return response;
      },
      (error: unknown) => {
        throw this.toExternalServiceError(error);
      },
    );
  }

  /** Logs the failure in full (vendor body redacted and truncated) and masks it for the client. */
  private toExternalServiceError(error: unknown): ExternalServiceError {
    const kind = classifyFailure(error);
    const axiosError = axios.isAxiosError(error) ? error : undefined;

    logger.error(
      {
        integration: this.integration.code,
        kind,
        method: axiosError?.config?.method,
        url: withoutQuery(axiosError?.config?.url),
        vendorStatus: axiosError?.response?.status,
        vendorBody: summarizeVendorBody(axiosError?.response?.data),
        err: error instanceof Error ? error.message : String(error),
      },
      'Outbound HTTP request failed',
    );

    return new ExternalServiceError(kind, I18N_MESSAGES.EXTERNAL_SERVICE_FAILED, {
      integration: this.integration,
      vendorStatus: axiosError?.response?.status,
      details: [{ message: CLIENT_DETAIL[kind] }],
    });
  }

  /**
   * Validates a vendor body against the adapter's Zod schema (keys converted to camelCase first,
   * so schemas stay camelCase like DTOs). A body that does not match is the vendor's failure:
   * 502 `ERR_EXT_ERROR`, with only the issue paths and codes logged — never the values.
   */
  parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(snakeToCamelCase(body));
    if (parsed.success) return parsed.data as z.infer<S>;

    logger.error(
      {
        integration: this.integration.code,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
        })),
      },
      'Outbound HTTP response rejected',
    );
    throw new ExternalServiceError('ERROR', I18N_MESSAGES.EXTERNAL_SERVICE_FAILED, {
      integration: this.integration,
      details: [{ message: CLIENT_DETAIL.ERROR }],
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.get<T>(url, config);
    return res.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.post<T>(url, data, config);
    return res.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.put<T>(url, data, config);
    return res.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.client.delete<T>(url, config);
    return res.data;
  }
}
