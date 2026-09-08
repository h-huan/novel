/**
 * HTTP API 客户端
 * 封装 fetch，提供类型安全的 REST 调用
 */

/** Web 开发模式走同源代理；打包后的 Electron 通过 IPC 确认固定服务端端口。 */
let BASE_URL = typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
  ? '/api/v1'
  : 'http://127.0.0.1:3100/api/v1';

interface DesktopServerStatus {
  running: boolean;
  port: number;
  error?: string;
}

let apiBaseInitialization: Promise<DesktopServerStatus | null> | null = null;

/**
 * 设置 API 基础地址（端口变化时调用）
 * 桌面端从 server-status IPC 确认服务端就绪后调用此函数
 */
export function setBaseUrl(port: number): void {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return;
  BASE_URL = `http://127.0.0.1:${port}/api/v1`;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('api-base-url-changed', { detail: { baseUrl: BASE_URL } }));
  }
}

/**
 * Electron 首屏的所有请求共用这一项初始化，避免服务端就绪前发出请求。
 * Web 模式不需要 IPC，直接使用 Vite 同源代理。
 */
export function initializeApiBaseUrl(): Promise<DesktopServerStatus | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.invoke) {
    return Promise.resolve(null);
  }
  if (!apiBaseInitialization) {
    apiBaseInitialization = window.electronAPI.invoke('get-server-status')
      .then((result) => {
        const status = result?.data;
        if (!result?.success || !status?.running || !status.port) {
          throw new ApiError(0, status?.error || '服务器未启动');
        }
        setBaseUrl(status.port);
        return status;
      })
      .catch((error) => {
        apiBaseInitialization = null;
        throw error;
      });
  }
  return apiBaseInitialization;
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
  await initializeApiBaseUrl();
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
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    // Fastify 在 Content-Type 为 application/json 但请求体为空字节时，会直接返回
    // 400 "Body cannot be empty when content-type is set to 'application/json'"。
    // 这三类动词若调用方未传 body，这里补一个合法空对象，确保请求本身有效；
    // 不影响任何业务逻辑或模型/场景配置（后端对应端点本就允许空 body）。
    options.body = '{}';
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

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 只读 GET 的有限自动重试（仅用于幂等的查询/看板/轮询，严禁用于 POST 等写操作）。
 * 只对“连不上后端（status=0，典型为后端正在重启）/ 5xx / 响应解析失败”重试，
 * 采用指数退避；4xx 属于真实业务错误，立即抛出不重试。
 * 解决：后端重启的几十秒内看板请求失败后永久停在空白/全 0，必须手动刷新的问题。
 */
async function requestGetWithRetry<T>(
  path: string,
  attempts = 4,
  baseDelayMs = 800,
  timeoutMs = 15_000,
): Promise<ApiResponse<T>> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await request<T>('GET', path, undefined, timeoutMs);
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
      if (!retryable || i === attempts - 1) throw err;
      await sleep(baseDelayMs * Math.pow(2, i)); // 0.8s → 1.6s → 3.2s
    }
  }
  throw lastErr;
}

export const api = {
  get<T = unknown>(path: string, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('GET', path, undefined, timeoutMs);
  },

  /** 只读查询专用：后端短暂不可达（如重启）时自动有限重试，看板/轮询使用避免假死空白 */
  getWithRetry<T = unknown>(path: string, attempts?: number, baseDelayMs?: number): Promise<ApiResponse<T>> {
    return requestGetWithRetry<T>(path, attempts, baseDelayMs);
  },

  post<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body, timeoutMs);
  },

  put<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body, timeoutMs);
  },

  patch<T = unknown>(path: string, body?: unknown, timeoutMs?: number): Promise<ApiResponse<T>> {
    return request<T>('PATCH', path, body, timeoutMs);
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
  try {
    await initializeApiBaseUrl();
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
    return;
  }
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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  // This is an idle timeout. SSE heartbeats and real node-progress events both
  // keep a healthy long generation alive instead of expiring it by wall-clock.
  const refreshIdleTimeout = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      reader.cancel('timeout');
      onError?.(new Error(`生成连接连续${Math.round(timeoutMs / 1000)}秒未收到进度或心跳`));
    }, timeoutMs);
  };
  refreshIdleTimeout();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      refreshIdleTimeout();
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
