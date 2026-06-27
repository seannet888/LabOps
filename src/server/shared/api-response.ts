export interface DataResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ListResponse<T> {
  data: T[];
  meta: Record<string, unknown>;
  links: Record<string, unknown>;
}

export function dataResponse<T>(data: T, options?: { meta?: Record<string, unknown> }): DataResponse<T> {
  return options?.meta ? { data, meta: options.meta } : { data };
}

export function listResponse<T>(
  data: T[],
  meta: Record<string, unknown>,
  links: Record<string, unknown>
): ListResponse<T> {
  return { data, meta, links };
}
