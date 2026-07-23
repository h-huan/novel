import { Controller, Get, Inject, Optional } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { VectorIndexService } from "../rag/vector-index.service";

export interface HealthCheckResult {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: "ok" | "error";
    vectorStore: "ok" | "error";
    meilisearch?: "ok" | "error";
  };
}

export interface RagHealthResult {
  status: "ok" | "degraded";
  vectorStore: "sqlite" | "unavailable";
  vectorStoreAvailable: boolean;
  detail: string;
  collectionsCount: number;
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  private readonly startTime: number;

  constructor(
    @Optional() @Inject(VectorIndexService)
    private readonly vectorIndex?: VectorIndexService,
  ) {
    this.startTime = Date.now();
  }

  @Get()
  check(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("full")
  async fullCheck(): Promise<HealthCheckResult> {
    const vsOk = this.vectorIndex?.isAvailable() ?? false;
    return {
      status: vsOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version ?? "0.1.0",
      services: {
        database: "ok",
        vectorStore: vsOk ? "ok" : "error",
      },
    };
  }

  @Get("rag")
  getRagHealth(): RagHealthResult {
    const available = this.vectorIndex?.isAvailable() ?? false;
    const health = this.vectorIndex?.getHealthStatus();
    return {
      status: available ? "ok" : "degraded",
      vectorStore: available ? "sqlite" : "unavailable",
      vectorStoreAvailable: available,
      detail: health?.detail ?? "VectorIndexService not available",
      collectionsCount: Object.keys(VectorIndexService.COLLECTIONS).length,
    };
  }

  private async checkMeilisearch(): Promise<boolean> {
    try {
      const url = process.env.MEILI_URL ?? "http://localhost:7700";
      const key = process.env.MEILI_MASTER_KEY ?? "";
      const response = await fetch(`${url}/health`, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch { return false; }
  }
}
