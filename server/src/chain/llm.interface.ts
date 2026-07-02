/**
 * LLM 模型服务抽象接口
 *
 * 定义模型调用的抽象层，当前使用 RealLLMService 实现（真实 API 调用）
 */
import { LLMRequest, LLMResponse } from './chain.types';

/**
 * LLM 模型服务接口
 * 所有具体的模型实现（DeepSeekService / ClaudeService / GPT4Service 等）均实现此接口
 */
export interface ILLMService {
  /**
   * 发送 Prompt 并获取响应
   * @param request LLM 调用请求
   * @returns LLM 响应结果
   */
  generate(request: LLMRequest): Promise<LLMResponse>;

  /**
   * 获取模型名称标识
   */
  getModelName(): string;

  /**
   * 检查模型是否可用
   */
  isAvailable(): Promise<boolean>;
}

/**
 * LLM 服务工厂接口
 * 根据模型名称获取对应的 ILLMService 实例
 */
export interface ILLMProviderFactory {
  /**
   * 获取指定模型的 LLM 服务
   * @param modelName 模型名称
   * @returns LLM 服务实例
   */
  getService(modelName: string): Promise<ILLMService>;

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): string[];
}
