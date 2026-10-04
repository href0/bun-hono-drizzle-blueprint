import { camelToSnakeCase } from '../../utils/case-converter.util';
import { getLocale } from '../context/request-context';
import { I18N_MESSAGES } from '../i18n/messages';
import { translate, type MessageInput } from '../i18n/translate';

export interface PaginationMeta {
  currentPage: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}

export class ApiResponse<T = unknown> {
  public readonly success: boolean;

  constructor(
    public readonly data: T,
    public readonly message: MessageInput = I18N_MESSAGES.SUCCESS,
    public readonly statusCode: number = 200,
    public readonly meta?: PaginationMeta,
  ) {
    this.success = statusCode < 400;
  }

  /** Serializes to the snake_case envelope with the message in the request's language. */
  toJSON(): Record<string, unknown> {
    const transformedData = camelToSnakeCase(this.data);
    const transformedMeta = this.meta
      ? (camelToSnakeCase(this.meta) as Record<string, unknown>)
      : undefined;

    return {
      success: this.success,
      status_code: this.statusCode,
      message: translate(this.message, getLocale()),
      data: transformedData,
      ...(transformedMeta ? { meta: transformedMeta } : {}),
    };
  }
}
