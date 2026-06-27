type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export type ListMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type ListEnvelope<T> = {
  data: T[];
  meta: ListMeta;
  links: unknown;
};

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id: string;
  };
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId: string;

  constructor(input: { status: number; code: string; message: string; details?: unknown; requestId: string }) {
    super(input.message);
    this.name = "ApiClientError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId;
  }
}

function apiUrl(path: string): string {
  return path.startsWith("/api/v1") ? path : `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return Boolean(value && typeof value === "object" && "error" in value);
}

function isListEnvelope(value: unknown): value is {
  data: unknown[];
  meta: { page?: number; per_page?: number; total?: number; total_pages?: number; limit?: number };
  links: unknown;
} {
  return Boolean(value && typeof value === "object" && "data" in value && "meta" in value && "links" in value);
}

function isResourceEnvelope<T>(value: unknown): value is { data: T } {
  return Boolean(value && typeof value === "object" && "data" in value);
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers
  };

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const payload = await response.json() as unknown;

  if (!response.ok) {
    if (isErrorEnvelope(payload)) {
      throw new ApiClientError({
        status: response.status,
        code: payload.error.code,
        message: payload.error.message,
        details: payload.error.details,
        requestId: payload.error.request_id
      });
    }

    throw new ApiClientError({
      status: response.status,
      code: "unknown_error",
      message: "请求失败",
      requestId: "unknown"
    });
  }

  if (isListEnvelope(payload)) {
    return {
      data: payload.data,
      meta: {
        page: payload.meta.page ?? 1,
        perPage: payload.meta.per_page ?? payload.meta.limit ?? 20,
        total: payload.meta.total ?? 0,
        totalPages: payload.meta.total_pages ?? Math.ceil((payload.meta.total ?? 0) / (payload.meta.per_page ?? payload.meta.limit ?? 20))
      },
      links: payload.links
    } as T;
  }

  if (isResourceEnvelope<T>(payload)) {
    return payload.data;
  }

  return payload as T;
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function buildQueryString(entries: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function commandRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(path, {
    ...options,
    method: options.method ?? "POST",
    headers: {
      ...options.headers,
      "idempotency-key": options.idempotencyKey ?? options.headers?.["idempotency-key"] ?? createIdempotencyKey()
    }
  });
}
