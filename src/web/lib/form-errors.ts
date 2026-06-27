import type { ZodIssue } from "zod";
import { ApiClientError } from "./api-client.js";

export type FormattedApiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

export function zodIssuesToFieldErrors<TField extends string>(issues: ZodIssue[]): Partial<Record<TField, string>> {
  const errors: Partial<Record<TField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && errors[field as TField] === undefined) {
      errors[field as TField] = issue.message;
    }
  }
  return errors;
}

export function formatApiError(error: unknown): FormattedApiError {
  if (error instanceof ApiClientError) {
    const fallbackMessage = (() => {
      if (error.status === 403) return "无权限执行该操作。";
      if (error.status === 404) return "接口未找到，请重启后端服务后重试。";
      if (error.status === 409) return "状态已变化，请刷新后确认。";
      if (error.status === 422) return "请检查表单字段。";
      if (error.status >= 500) return "系统错误，请稍后重试并保留 request_id。";
      return error.message;
    })();

    return {
      code: error.code,
      status: error.status,
      message: fallbackMessage,
      requestId: error.requestId === "unknown" ? undefined : error.requestId
    };
  }

  return { message: "请求失败" };
}
