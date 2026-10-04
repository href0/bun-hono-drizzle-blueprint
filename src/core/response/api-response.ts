import { camelToSnakeCase } from '../../utils/case-converter.util';

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
    public readonly message: string = 'Success',
    public readonly statusCode: number = 200,
    public readonly meta?: PaginationMeta,
  ) {
    this.success = statusCode < 400;
  }

  toJSON(): Record<string, unknown> {
    const transformedData = camelToSnakeCase(this.data);
    const transformedMeta = this.meta
      ? (camelToSnakeCase(this.meta) as Record<string, unknown>)
      : undefined;

    return {
      success: this.success,
      status_code: this.statusCode,
      message: this.message,
      data: transformedData,
      ...(transformedMeta ? { meta: transformedMeta } : {}),
    };
  }
}
