/**
 * HTTP API 客户端
 * 封装 fetch，提供类型安全的 REST 调用
 */

/** 默认端口，收到服务端实际端口前使用 */
let BASE_URL = 'http://localhost:3100/api/v1';

/**
 * 设置 API 基础地址（端口变化时调用）
 * 桌面端从 server-status IPC 获取实际端口后调用此函数
 */
export function setBaseUrl(port: number): void {
  BASE_URL = `http://localhost:${port}/api/v1`;
}

/** 获取当前 API 基础地址 */
export function getBaseUrl(): string {
  return BASE_URL;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs: number = 1_800_000,
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const options: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError' || err.name === 'AbortSignal') {
      throw new ApiError(0, `请求超时（${Math.round(timeoutMs / 1000)}秒）`);
    }
    throw new ApiError(0, `网络请求失败: ${err.message}`);
  }
  clearTimeout(timeoutId);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status, `响应解析失败 (${response.status})`);
  }

  if (!response.ok) {
    const apiResponse = json as ApiResponse;
    throw new ApiError(
      response.status,
      apiResponse.message || `请求失败 (${response.status})`,
      json,
    );
  }

  return json as ApiResponse<T>;
}

export const api = {
  get<T = unknown>(path: string, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('GET', path, undefined, timeoutMs);
  },

  post<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body, timeoutMs);
  },

  put<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body, timeoutMs);
  },

  delete<T = unknown>(path: string, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path, undefined, timeoutMs);
  },
};

/**
 * SSE 流式请求
 * 解析 text/event-stream，逐事件回调
 * @param path API 路径
 * @param body 请求体
 * @param onEvent 每个 SSE 事件的回调（解析后的 JSON 对象）
 * @param onError 错误回调
 * @param onComplete 完成回调（收到 type:complete 时触发）
 */
export async function streamRequest(
  path: string,
  body: unknown,
  onEvent: (data: Record<string, unknown>) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
  timeoutMs: number = 600_000,
): Promise<void> {
  const url = `${BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    onError?.(new Error(`网络请求失败: ${(err as Error).message}`));
    return;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    onError?.(new Error(`请求失败 (${response.status}): ${text}`));
    return;
  }
  const reader = response.body?.getReader();
  if (!reader) {
    onError?.(new Error('响应无 body，无法读取流'));
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  const timeoutId = setTimeout(() => {
    reader.cancel('timeout');
    onError?.(new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒）`));
  }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 保留最后一个可能不完整的行
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') {
          clearTimeout(timeoutId);
          onComplete?.();
          return;
        }
        try {
          const data = JSON.parse(jsonStr) as Record<string, unknown>;
          onEvent(data);
          if (data.type === 'complete') {
            clearTimeout(timeoutId);
            onComplete?.();
            return;
          }
        } catch {
          // 忽略无法解析的行
        }
      }
    }
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  } finally {
    clearTimeout(timeoutId);
    reader.releaseLock();
  }
}
