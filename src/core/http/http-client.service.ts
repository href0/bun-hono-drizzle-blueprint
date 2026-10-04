import http from 'node:http';
import https from 'node:https';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { logger } from '../logger/logger';
import { ExternalServiceError, type ExternalFailureKind } from '../errors/external.error';

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT']);

/** Timeout → 504, no response → 502 unreachable, vendor error response → 502 (never its status). */
const classifyFailure = (error: unknown): ExternalFailureKind => {
  if (!axios.isAxiosError(error)) return 'ERROR';
  if (error.code !== undefined && TIMEOUT_CODES.has(error.code)) return 'TIMEOUT';
  return error.response ? 'ERROR' : 'UNREACHABLE';
};

export interface HttpClientOptions {
  baseURL?: string;
  timeoutMs?: number;
  originName: string;
  maxSockets?: number;
}

export class HttpClientService {
  private readonly client: AxiosInstance;
  private readonly originName: string;

  constructor(options: HttpClientOptions) {
    this.originName = options.originName;

    // HTTP / HTTPS Persistent Keep-Alive Connection Pool
    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: options.maxSockets ?? 100,
      maxFreeSockets: 10,
      timeout: options.timeoutMs ?? 10000,
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: options.maxSockets ?? 100,
      maxFreeSockets: 10,
      timeout: options.timeoutMs ?? 10000,
    });

    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeoutMs ?? 10000,
      httpAgent,
      httpsAgent,
      headers: {
        connection: 'keep-alive',
      },
    });

    // Logging & Error Interceptors
    this.client.interceptors.request.use((config) => {
      logger.debug(
        { url: config.url, method: config.method, origin: this.originName },
        'Outbound HTTP request started',
      );
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          { status: response.status, url: response.config.url },
          'Outbound HTTP request succeeded',
        );
        return response;
      },
      (error: unknown) => {
        const kind = classifyFailure(error);
        let vendorStatus: number | undefined;
        let details = [{ message: 'Unknown external service error' }];
        let errorMessage = 'Unknown error';

        if (axios.isAxiosError(error)) {
          vendorStatus = error.response?.status;
          details = error.response?.data
            ? [{ message: JSON.stringify(error.response.data) }]
            : [{ message: error.message }];
          errorMessage = error.message;
        } else if (error instanceof Error) {
          errorMessage = error.message;
          details = [{ message: error.message }];
        }

        logger.error(
          { err: errorMessage, kind, vendorStatus, origin: this.originName },
          'Outbound HTTP request failed',
        );

        throw new ExternalServiceError(kind, `External service ${this.originName} request failed`, {
          details,
          origin: this.originName,
        });
      },
    );
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
