export interface ApiErrorDetail {
  field: string;
  message: string;
  code: string;
}

export interface ApiErrorInput {
  code: string;
  message: string;
  requestId: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    request_id: string;
  };
}

export function errorResponse(input: ApiErrorInput): ApiErrorResponse {
  return {
    error: {
      code: input.code,
      message: input.message,
      ...(input.details ? { details: input.details } : {}),
      request_id: input.requestId
    }
  };
}
