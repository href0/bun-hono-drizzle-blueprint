export interface ErrorDetail {
  field?: string;
  message: string;
}

export abstract class ApiError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorType: string;
  abstract readonly errorCode: string;

  constructor(
    message: string,
    public readonly details: ErrorDetail[] = [],
    public readonly origin: string = 'APP',
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
