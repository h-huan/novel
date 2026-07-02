# AI写作平台 — RAG引擎与状态管理技术方案

> **版本**: v1.0  
> **作者**: 伯约 (RAG与状态管理架构师)  
> **日期**: 2025-06-06  
> **状态**: Phase 1.3 交付

---

## 目录

1. [RAG引擎架构设计](#1-rag引擎架构设计)
2. [混合检索方案](#2-混合检索方案)
3. [RTCO分级策略详解](#3-rtco分级策略详解)
4. [24维状态引擎数据模型](#4-24维状态引擎数据模型)
5. [三段式创作闭环流程](#5-三段式创作闭环流程)
6. [RAG持久化方案](#6-rag持久化方案)
7. [模型路由引擎方案](#7-模型路由引擎方案)
8. [冲突检测引擎](#8-冲突检测引擎)

---

## 1. RAG引擎架构设计

### 1.1 总体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RAG Engine Pipeline                              │
│                                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐ │
│  │ 文档入库  │ → │ 智能分块  │ → │ 多路Embed │ → │ 向量索引  │ → │ 混合检 │ │
│  │ Ingestion │   │ Chunking │   │ Embedding│   │ Indexing │   │ 索融合  │ │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘   └────────┘ │
│       │              │              │              │              │       │
│       ▼              ▼              ▼              ▼              ▼       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    上下文融合层 (Context Fusion)                    │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ P0 核心   │  │ P1 关键   │  │ P2 备用   │  │  动态Token预算   │  │   │
│  │  │ (必注入)  │  │ (按需注入)│  │ (可检索)  │  │  Budget Allocator│  │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│                          ┌─────────────────┐                            │
│                          │   LLM Generator  │                            │
│                          └─────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 向量数据库选型对比

| 维度 | ChromaDB | Qdrant | Milvus Lite | LanceDB |
|------|----------|--------|-------------|---------|
| **部署方式** | 嵌入式/Python | 嵌入式/独立服务 | 嵌入式 | 嵌入式 |
| **存储引擎** | SQLite + hnswlib | RocksDB + 自研HNSW | FAISS | Lance (列式) |
| **检索速度** | ★★★★ | ★★★★★ | ★★★★ | ★★★★☆ |
| **混合检索** | 需自建 | 原生支持(≥v1.7) | 需自建 | 需自建 |
| **过滤能力** | 元数据过滤 | 富过滤+Payload索引 | 标量过滤 | SQL过滤 |
| **本地部署** | 零配置 | 零配置 | 需编译 | 零配置 |
| **内存占用** | ~200MB | ~150MB | ~300MB | ~100MB |
| **社区活跃度** | ★★★★★ | ★★★★ | ★★★★☆ | ★★★☆ |
| **多集合支持** | ✅ | ✅ | ✅ | ✅ |
| **增量写入** | ✅ | ✅ | ✅ | ✅ (列式追加) |

**推荐方案：Qdrant（主力）+ ChromaDB（备选）**

选择理由：
1. **Qdrant** 原生支持多向量+Payload索引+全文检索（v1.7+），混合检索无需自建融合层
2. 支持 `quantization`（标量量化/乘积量化），内存效率高
3. Rust实现，单机性能最优
4. **ChromaDB** 作为轻量备选，Python生态更友好

### 1.3 索引策略

```python
# 索引架构设计
INDEX_STRATEGY = {
    # ── 主索引：知识库全局索引 ──
    "global_knowledge": {
        "collection": "world_kb",
        "vectors": {
            "dense": {  # 语义向量
                "model": "bge-large-zh-v1.5",  # 1024维
                "metric": "cosine",
                "quantization": "scalar"  # int8量化
            },
            "sparse": {  # 稀疏向量（BM25等价）
                "model": "BAAI/bge-m3",  # SPLADE稀疏编码
                "metric": "dot"
            }
        },
        "payload_indexes": [
            {"field": "doc_type", "schema": "keyword"},     # 世界观/角色/章节/伏笔
            {"field": "chapter_id", "schema": "integer"},    # 所属章节
            {"field": "priority", "schema": "keyword"},      # P0/P1/P2
            {"field": "characters", "schema": "keyword[]"},  # 关联角色
            {"field": "created_at", "schema": "datetime"},   # 创建时间
            {"field": "version", "schema": "integer"},       # 版本号
            {"field": "locked", "schema": "bool"},           # 是否锁定
        ]
    },

    # ── 角色独立索引 ──
    "character_index": {
        "collection": "characters",
        "vectors": {
            "dense": {"model": "bge-large-zh-v1.5", "metric": "cosine"},
        },
        "payload_indexes": [
            {"field": "character_id", "schema": "keyword"},
            {"field": "name", "schema": "keyword"},
            {"field": "faction", "schema": "keyword"},
            {"field": "status_snapshot", "schema": "json"},  # 24维快照
        ]
    },

    # ── 章节滚动索引 ──
    "chapter_index": {
        "collection": "chapters",
        "vectors": {
            "dense": {"model": "bge-large-zh-v1.5", "metric": "cosine"},
        },
        "payload_indexes": [
            {"field": "chapter_no", "schema": "integer"},
            {"field": "arc_id", "schema": "keyword"},         # 所属故事弧
            {"field": "summary_hash", "schema": "keyword"},   # 摘要指纹
        ]
    },

    # ── 伏笔追踪索引 ──
    "foreshadow_index": {
        "collection": "foreshadows",
        "vectors": {
            "dense": {"model": "bge-large-zh-v1.5", "metric": "cosine"},
        },
        "payload_indexes": [
            {"field": "planted_chapter", "schema": "integer"},
            {"field": "resolved_chapter", "schema": "integer"},
            {"field": "status", "schema": "keyword"},         # planted | resolved | abandoned
            {"field": "related_characters", "schema": "keyword[]"},
        ]
    }
}
```

### 1.4 增量更新方案

```python
# ── 增量更新核心流程 ──

class IncrementalRAGUpdater:
    """
    增量更新策略：
    1. 章节级：每章写完后，仅更新该章相关的chunk
    2. 角色级：角色24维状态变化时，更新角色索引
    3. 世界观级：世界观文档修改时，仅重索引受影响节点
    """

    def on_chapter_complete(self, chapter_id: str, content: str):
        """章节完成后的增量更新"""
        with self.transaction() as txn:
            # Step 1: 分块新内容
            new_chunks = self.chunker.split(content, 
                strategy="semantic",  # 语义分块
                chunk_size=512,
                overlap=64
            )
            
            # Step 2: 生成向量嵌入（仅新chunk）
            embeddings = self.embedder.encode_batch([c.text for c in new_chunks])
            
            # Step 3: 写入向量库（upsert模式）
            self.vector_store.upsert(
                collection="chapters",
                points=[{
                    "id": f"{chapter_id}:chunk:{i}",
                    "vector": embeddings[i],
                    "payload": {
                        "chapter_id": chapter_id,
                        "chunk_index": i,
                        "text": new_chunks[i].text,
                        "priority": self._calc_priority(new_chunks[i]),
                        "characters": self._extract_characters(new_chunks[i].text),
                        "created_at": now_iso(),
                        "version": 1,
                    }
                } for i in range(len(new_chunks))]
            )
            
            # Step 4: 更新BM25稀疏向量
            self._update_sparse_index(chapter_id, new_chunks)
            
            # Step 5: 触发状态快照更新
            self.state_engine.snapshot_all_characters(chapter_id)
            
            # Step 6: 检查伏笔状态
            self._check_foreshadow_resolution(chapter_id, content)

    def on_world_doc_update(self, doc_id: str, new_content: str):
        """世界观文档更新——精准替换策略"""
        old_chunks = self.vector_store.get_by_filter(
            collection="world_kb",
            filter={"doc_id": doc_id}
        )
        
        # 增量diff：仅重索引变化的chunk
        new_chunks = self.chunker.split(new_content)
        diff_result = self._diff_chunks(old_chunks, new_chunks)
        
        with self.transaction():
            # 删除旧chunk
            for chunk_id in diff_result.removed:
                self.vector_store.delete(collection="world_kb", ids=[chunk_id])
            # 插入新chunk
            for chunk in diff_result.added:
                self.vector_store.upsert(collection="world_kb", points=[chunk.to_point()])
            # 更新版本
            self._bump_version(doc_id)
```

### 1.5 文档分块策略

```python
class SmartChunker:
    """智能分块——写作场景专用"""
    
    CHUNK_STRATEGIES = {
        "chapter": {  # 章节内容分块
            "method": "semantic",
            "chunk_size": 512,       # tokens
            "overlap": 64,           # tokens
            "separators": ["\n\n", "\n", "。", "！", "？"],
            "min_chunk_size": 128,
        },
        "world_doc": {  # 世界观文档分块
            "method": "hierarchical",  # 按标题层级
            "chunk_size": 1024,
            "overlap": 128,
            "separators": ["\n## ", "\n### ", "\n#### ", "\n\n"],
            "preserve_headers": True,   # 保留父级标题
        },
        "character_profile": {  # 角色档案——不分块，整体索引
            "method": "whole",
            "max_size": 2048,
        },
        "outline": {  # 大纲——按节点分块
            "method": "structural",
            "node_marker": "##",  # 每个大纲节点为独立chunk
            "include_children_summary": True,  # 附带子节点摘要
        }
    }
    
    def split(self, content: str, doc_type: str) -> List[Chunk]:
        strategy = self.CHUNK_STRATEGIES[doc_type]
        
        if strategy["method"] == "semantic":
            return self._semantic_split(content, strategy)
        elif strategy["method"] == "hierarchical":
            return self._hierarchical_split(content, strategy)
        elif strategy["method"] == "whole":
            return [Chunk(text=content[:strategy["max_size"]])]
        elif strategy["method"] == "structural":
            return self._structural_split(content, strategy)
```

---

## 2. 混合检索方案

### 2.1 检索架构总览

```
                        ┌─────────────┐
                        │  Query 输入  │
                        └──────┬──────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │  Dense      │   │  Sparse     │   │  Keyword    │
     │  Retriever  │   │  Retriever  │   │  Retriever   │
     │ (语义向量)   │   │ (SPLADE)   │   │ (BM25+字段) │
     └──────┬─────┘   └──────┬─────┘   └──────┬─────┘
            │                │                 │
            ▼                ▼                 ▼
     ┌─────────────────────────────────────────────┐
     │           RRF (Reciprocal Rank Fusion)       │
     │  ┌─────────────────────────────────────────┐│
     │  │ score(d) = Σ 1/(k + rank_i(d))          ││
     │  │ k = 60 (平滑参数)                        ││
     │  └─────────────────────────────────────────┘│
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │            Cross-Encoder Reranker           │
     │  ┌─────────────────────────────────────────┐│
     │  │ model: bge-reranker-large               ││
     │  │ top-N: 20 → rerank → top-K: 5           ││
     │  └─────────────────────────────────────────┘│
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │           RTCO 优先级过滤器                  │
     │  P0(必注入) → P1(按需) → P2(备选)           │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  上下文融合    │
                    └──────────────┘
```

### 2.2 三路检索器实现

```python
from typing import List, Tuple
import numpy as np
from dataclasses import dataclass

@dataclass
class RetrievalResult:
    chunk_id: str
    text: str
    score: float
    source: str  # "dense" | "sparse" | "keyword"
    priority: str  # P0/P1/P2
    payload: dict

class HybridRetriever:
    """
    三路混合检索器
    - Dense: bge-large-zh-v1.5 语义向量检索
    - Sparse: BGE-M3 SPLADE 稀疏编码
    - Keyword: BM25 + 字段精确匹配
    """
    
    def __init__(self, vector_store, embedder, bm25_index):
        self.vector_store = vector_store
        self.embedder = embedder
        self.bm25 = bm25_index
        self.reranker = CrossEncoderReranker("BAAI/bge-reranker-large")
        
        # 权重配置 — 按场景动态调整
        self.fusion_weights = {
            "writing_context":  {"dense": 0.5, "sparse": 0.3, "keyword": 0.2},
            "character_check":  {"dense": 0.3, "sparse": 0.2, "keyword": 0.5},
            "world_consistency": {"dense": 0.2, "sparse": 0.2, "keyword": 0.6},
            "foreshadow_match": {"dense": 0.4, "sparse": 0.4, "keyword": 0.2},
        }
    
    def search(self, 
               query: str, 
               scene: str = "writing_context",
               top_k: int = 10,
               rerank_top_n: int = 20,
               filters: dict = None) -> List[RetrievalResult]:
        
        # ── 1. Dense检索 ──
        query_vector = self.embedder.encode(query)
        dense_results = self.vector_store.search(
            collection="world_kb",
            query_vector=query_vector,
            with_vectors=False,
            limit=top_k * 3,  # 超额召回
            query_filter=filters,
            score_threshold=0.65
        )
        
        # ── 2. Sparse检索（SPLADE） ──
        sparse_vector = self.embedder.encode_sparse(query)
        sparse_results = self.vector_store.search(
            collection="world_kb",
            query_vector=sparse_vector,
            with_vectors=False,
            limit=top_k * 3,
            using="sparse",  # 使用稀疏向量索引
            query_filter=filters,
            score_threshold=0.3
        )
        
        # ── 3. Keyword检索（BM25 + 字段过滤） ──
        keyword_results = self.bm25.search(
            query=query,
            top_k=top_k * 2,
            filters=filters
        )
        
        # ── 4. RRF融合 ──
        weights = self.fusion_weights[scene]
        fused = self._rrf_fusion(
            dense_results, sparse_results, keyword_results,
            weights=weights,
            k=60  # RRF平滑参数
        )
        
        # ── 5. Cross-Encoder Rerank ──
        top_n_candidates = fused[:rerank_top_n]
        reranked = self.reranker.rerank(
            query=query,
            candidates=top_n_candidates,
            top_k=top_k
        )
        
        return reranked
    
    def _rrf_fusion(self, 
                    dense: list, sparse: list, keyword: list,
                    weights: dict, k: int = 60) -> List[RetrievalResult]:
        """RRF融合算法"""
        scores = {}
        
        for rank, result in enumerate(dense):
            chunk_id = result.id
            scores[chunk_id] = scores.get(chunk_id, 0) + \
                weights["dense"] * (1.0 / (k + rank + 1))
        
        for rank, result in enumerate(sparse):
            chunk_id = result.id
            scores[chunk_id] = scores.get(chunk_id, 0) + \
                weights["sparse"] * (1.0 / (k + rank + 1))
        
        for rank, result in enumerate(keyword):
            chunk_id = result.id
            scores[chunk_id] = scores.get(chunk_id, 0) + \
                weights["keyword"] * (1.0 / (k + rank + 1))
        
        # 降序排列
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        return [self._build_result(cid, scores[cid]) for cid in sorted_ids]
```

### 2.3 Cross-Encoder重排序

```python
class CrossEncoderReranker:
    """
    精细重排序——对RRF融合后的top-N做精细语义匹配。
    使用bge-reranker-large，在本地CPU推理延迟约30ms/对。
    """
    
    def __init__(self, model_name: str = "BAAI/bge-reranker-large"):
        from FlagEmbedding import FlagReranker
        self.model = FlagReranker(model_name, use_fp16=True)
        self.batch_size = 8
    
    def rerank(self, 
               query: str, 
               candidates: List[RetrievalResult],
               top_k: int = 5) -> List[RetrievalResult]:
        
        # 构建 (query, doc) 对
        pairs = [[query, c.text] for c in candidates]
        
        # 批量推理
        scores = self.model.compute_score(pairs, batch_size=self.batch_size)
        
        # 按分数重排
        for i, candidate in enumerate(candidates):
            candidate.score = float(scores[i])
        
        candidates.sort(key=lambda x: x.score, reverse=True)
        return candidates[:top_k]
```

### 2.4 检索场景路由

```python
class RetrievalRouter:
    """
    根据写作阶段路由到最优检索策略
    """
    
    SCENE_CONFIG = {
        "pre_writing": {  # 动笔前——广泛检索世界观
            "collections": ["world_kb", "characters", "foreshadows"],
            "top_k": 20,
            "rerank_top_n": 30,
            "fusion": "writing_context",
            "filters": {"doc_type": ["world_setting", "character_profile", "outline"]},
        },
        "mid_writing": {  # 写作中——精准检索角色+前文
            "collections": ["chapters", "characters"],
            "top_k": 8,
            "rerank_top_n": 15,
            "fusion": "character_check",
            "filters": {
                "chapter_id": {"$lte": "$current_chapter"},  # 仅检索已写章节
                "priority": ["P0", "P1"],
            },
        },
        "consistency_check": {  # 一致性校验——全库检索
            "collections": ["world_kb", "chapters", "characters", "foreshadows"],
            "top_k": 15,
            "rerank_top_n": 25,
            "fusion": "world_consistency",
            "filters": {},
        },
        "character_query": {  # 角色查询——精确匹配优先
            "collections": ["characters", "chapters"],
            "top_k": 10,
            "rerank_top_n": 15,
            "fusion": "character_check",
            "filters": {},  # 动态指定character_id
        },
    }
```

---

## 3. RTCO分级策略详解

### 3.1 RTCO四级分类体系

```
RTCO (Retrieval Token Context Optimization) 上下文预算分级

┌──────────────────────────────────────────────────────────────────┐
│  P0 · 核心必用 (Core)           预算: 40% of context window       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ • 当前章节大纲（正在写的这部分）                              │  │
│  │ • 出场角色当前状态（24维快照）                                │  │
│  │ • 上一章结尾摘要（衔接上下文）                                │  │
│  │ • 活跃伏笔列表（待回收的伏笔）                                │  │
│  │ • 关键世界观规则（与本章直接相关）                             │  │
│  │ 特点：每次生成必注入，占据上下文开头的黄金位置                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  P1 · 关键内容 (Critical)        预算: 35% of context window      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ • 相关角色详细档案（不限于出场角色）                           │  │
│  │ • 相关世界设定扩展（可能被引用的次级设定）                     │  │
│  │ • 近5章情节摘要（滚动窗口）                                   │  │
│  │ • 未激活伏笔（本章不回收但需知道存在）                         │  │
│  │ 特点：通过RAG检索按相关性动态加载，有选择地注入                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  P2 · 备用参考 (Reference)       预算: 20% of context window      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ • 全世界观文档（完整版）                                      │  │
│  │ • 全角色档案库（非活跃角色）                                  │  │
│  │ • 已回收伏笔历史记录                                         │  │
│  │ • 远章情节摘要                                               │  │
│  │ 特点：不注入上下文，仅作为可检索知识库存在                      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  P3 · 归档存储 (Archive)         预算: 5% of context window       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ • 被覆盖的旧版世界观                                         │  │
│  │ • 已删除角色的档案备份                                       │  │
│  │ • 废弃的大纲版本                                             │  │
│  │ 特点：不可检索（除非显式开启历史查看），仅用于审计回溯           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 动态预算分配算法

```python
class RTCOBudgetAllocator:
    """
    动态Token预算分配器
    
    核心思想：根据写作阶段、模型上下文窗口大小、当前章节复杂度，
    动态调整P0/P1/P2的token配额。
    """
    
    def __init__(self, model_context_size: int):
        self.total_budget = model_context_size
        # 基础分配比例
        self.base_ratios = {"P0": 0.40, "P1": 0.35, "P2": 0.20, "P3": 0.05}
        
    def allocate(self, 
                 stage: str,       # "outline" | "drafting" | "revision" | "polish"
                 chapter_complexity: float,  # 0-1，角色数×伏笔数归一化
                 active_characters: int,
                 active_foreshadows: int) -> BudgetPlan:
        
        ratios = self.base_ratios.copy()
        
        # ── 阶段调整因子 ──
        if stage == "outline":
            # 大纲阶段：更多世界观参考
            ratios["P0"] += 0.05   # 大纲
            ratios["P1"] += 0.05   # 世界观
            ratios["P2"] -= 0.10
        
        elif stage == "drafting":
            # 正文阶段：更多角色状态和前文
            ratios["P0"] += 0.10   # 角色+前文
            ratios["P2"] -= 0.10
        
        elif stage == "revision":
            # 修改阶段：需要更广的参考
            ratios["P1"] += 0.10   # 扩展参考
            ratios["P0"] -= 0.05
            ratios["P2"] -= 0.05
        
        elif stage == "polish":
            # 润色阶段：聚焦当前文本
            ratios["P0"] += 0.15   # 当前文本+紧邻上下文
            ratios["P1"] -= 0.05
            ratios["P2"] -= 0.10
        
        # ── 复杂度调整 ──
        if chapter_complexity > 0.7:
            # 高复杂度：P0和P1都要更多预算
            ratios["P0"] += 0.05
            ratios["P1"] += 0.05
            ratios["P2"] -= 0.10
        
        # ── 归一化 ──
        total = sum(ratios.values())
        ratios = {k: v/total for k, v in ratios.items()}
        
        # ── 计算token数 ──
        tokens = {
            level: int(self.total_budget * ratio)
            for level, ratio in ratios.items()
        }
        
        return BudgetPlan(
            ratios=ratios,
            tokens=tokens,
            total_budget=self.total_budget,
        )


@dataclass
class BudgetPlan:
    ratios: dict     # {"P0": 0.45, "P1": 0.35, ...}
    tokens: dict     # {"P0": 3600, "P1": 2800, ...}
    total_budget: int
```

### 3.3 上下文注入模板

```python
class ContextInjector:
    """
    将RTCO分级内容按优先级注入LLM上下文
    """
    
    def build_context(self, 
                      budget_plan: BudgetPlan,
                      p0_content: List[RetrievalResult],
                      p1_content: List[RetrievalResult]) -> str:
        
        sections = []
        
        # ── P0: 核心必用（放在最前面，模型注意力最高） ──
        sections.append("【本章大纲·必循】")
        p0_text = self._assemble(p0_content, max_tokens=budget_plan.tokens["P0"])
        sections.append(p0_text)
        
        # ── P1: 关键参考 ──
        sections.append("\n---\n【相关设定与历史·参考】")
        p1_text = self._assemble(p1_content, max_tokens=budget_plan.tokens["P1"])
        sections.append(p1_text)
        
        # ── 系统指令（不计入内容预算） ──
        system_prompt = self._build_system_prompt(budget_plan)
        
        context = "\n".join(sections)
        return system_prompt, context
    
    def _assemble(self, items: List[RetrievalResult], max_tokens: int) -> str:
        """按优先级拼接，token超限时截断"""
        assembled = []
        token_count = 0
        
        for item in sorted(items, key=lambda x: x.score, reverse=True):
            item_tokens = self._estimate_tokens(item.text)
            if token_count + item_tokens > max_tokens:
                continue  # 跳过当前item，尝试下一个更短的
            assembled.append(f"[{item.payload.get('doc_type', 'ref')}] {item.text}")
            token_count += item_tokens
        
        return "\n\n".join(assembled)
```

---

## 4. 24维状态引擎数据模型

### 4.1 24维状态完整定义

```python
from enum import Enum
from datetime import datetime
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

# ─────────────────────────────────────────────
# 24维状态定义
# ─────────────────────────────────────────────

class CharacterStateDimension(Enum):
    """
    24维角色状态追踪体系
    
    分类：
    - 身体状态 (Physical): 1-4
    - 社会关系 (Social): 5-10
    - 心理状态 (Mental): 11-15
    - 能力状态 (Ability): 16-19
    - 剧情状态 (Plot): 20-24
    """
    
    # ═══ 身体状态 (Physical) ═══
    HP_INJURY = "hp_injury"              # 1. 伤势/健康状态: 0(濒死)-100(满血)
    PHYSICAL_CONDITION = "physical_cond" # 2. 体能状况: exhausted/tired/normal/energized/peaked
    APPEARANCE = "appearance"            # 3. 外貌变化: 伤疤/残疾/变装/衰老等标记
    EQUIPMENT = "equipment"              # 4. 装备/物品: 当前持有物品列表
    
    # ═══ 社会关系 (Social) ═══
    FACTION = "faction"                  # 5. 阵营归属: 势力名称+忠诚度(0-100)
    REPUTATION = "reputation"            # 6. 声望: 在不同势力中的声望值{"势力": 声望}
    DEBT_OBLIGATION = "debt"            # 7. 欠债/承诺: [{"to": "某人", "what": "某事", "deadline": "..."}]
    RELATIONSHIP = "relationship"        # 8. 人际关系网: {"角色ID": 好感度(-100到100)}
    SOCIAL_RANK = "social_rank"          # 9. 社会地位: 官职/爵位/职级/称号
    WEALTH = "wealth"                    # 10. 财富: {"currency_type": amount}
    
    # ═══ 心理状态 (Mental) ═══
    MENTAL_STATE = "mental_state"        # 11. 心理状态: stable/anxious/depressed/enraged/fearful
    MOTIVATION = "motivation"            # 12. 当前动机: 短期目标+长期目标
    KNOWLEDGE = "knowledge"              # 13. 已知信息: 角色已知的关键信息列表
    SECRET = "secret"                    # 14. 持有秘密: 角色的秘密（其他人不知道的）
    PERSONALITY_SHIFT = "personality"   # 15. 性格变化: 性格弧线当前阶段
    
    # ═══ 能力状态 (Ability) ═══
    SKILL_LEVEL = "skill_level"          # 16. 技能等级: {"技能名": 等级(1-10)}
    POWER_UP = "power_up"                # 17. 能力提升/觉醒: 新获得的能力列表
    RESOURCE = "resource"                # 18. 掌控资源: {"资源名": 数量/掌控度}
    LIMITATION = "limitation"            # 19. 当前限制: 诅咒/封印/毒/debuff
    
    # ═══ 剧情状态 (Plot) ═══
    LOCATION = "location"                # 20. 当前位置: 地点+坐标
    ALLIANCE_STATE = "alliance"          # 21. 盟友/敌人状态: 与他人当前的合作/敌对状态
    PLOT_FLAG = "plot_flag"              # 22. 剧情标记: 已完成的关键剧情节点
    FORESHADOW_TAG = "foreshadow_tag"   # 23. 伏笔标签: 角色身上的待回收伏笔
    ARC_POSITION = "arc_position"        # 24. 角色弧位置: 角色在成长弧中的位置百分比


# ─────────────────────────────────────────────
# 状态值类型定义
# ─────────────────────────────────────────────

@dataclass
class CharacterStateSnapshot:
    """角色状态快照"""
    snapshot_id: str                    # UUID
    character_id: str
    chapter_id: str                     # 产生此快照的章节
    timestamp: datetime
    
    # 24维状态数值
    states: Dict[str, Any] = field(default_factory=dict)
    
    # 变化追踪
    changed_dimensions: List[str] = field(default_factory=list)  # 本快照变化的维度
    previous_snapshot_id: Optional[str] = None
    
    # 元数据
    created_by: str = "system"          # system | user_manual | consistency_check
    notes: Optional[str] = None


# ─────────────────────────────────────────────
# 默认状态模板
# ─────────────────────────────────────────────

DEFAULT_CHARACTER_STATE = {
    "hp_injury": 100,
    "physical_cond": "normal",
    "appearance": [],
    "equipment": [],
    "faction": {"name": "未加入", "loyalty": 0},
    "reputation": {},
    "debt": [],
    "relationship": {},
    "social_rank": "平民",
    "wealth": {"gold": 0},
    "mental_state": "stable",
    "motivation": {"short_term": "生存", "long_term": "未知"},
    "knowledge": [],
    "secret": [],
    "personality": "初始阶段",
    "skill_level": {},
    "power_up": [],
    "resource": {},
    "limitation": [],
    "location": "未知",
    "alliance": {},
    "plot_flag": [],
    "foreshadow_tag": [],
    "arc_position": 0.0,
}
```

### 4.2 状态更新规则引擎

```python
class StateUpdateEngine:
    """
    状态更新规则引擎
    
    核心原则：
    1. 每章生成完成后自动触发状态变更检测
    2. 正文中明确描述的变化 → 自动更新
    3. 隐含变化 → 标记待人工确认
    4. 冲突变化 → 产生告警
    """
    
    # 更新规则定义
    UPDATE_RULES = {
        "hp_injury": {
            "triggers": ["受伤", "受伤较重", "重伤", "治愈", "恢复", "治疗"],
            "type": "numeric_delta",
            "auto_threshold": 20,  # 变化>20时需人工确认
        },
        "location": {
            "triggers": ["前往", "到达", "离开", "进入", "回到", "抵达"],
            "type": "set_value",
            "auto_apply": True,  # 自动应用
        },
        "relationship": {
            "triggers": ["好感", "信任", "厌恶", "背叛", "结盟", "和解", "决裂"],
            "type": "numeric_delta_per_target",
            "auto_threshold": 30,
        },
        "faction": {
            "triggers": ["加入", "退出", "背叛", "晋升", "贬黜"],
            "type": "set_value",
            "auto_confirm": True,  # 需要人工确认
        },
        "mental_state": {
            "triggers": ["崩溃", "冷静", "愤怒", "绝望", "希望", "恐惧", "坚定"],
            "type": "enum_set",
            "auto_apply": True,
        },
        "motivation": {
            "triggers": ["决定", "立志", "发誓", "放弃", "改变目标"],
            "type": "set_value",
            "auto_confirm": True,
        },
        "plot_flag": {
            "triggers": ["完成", "达成", "通过", "战胜"],  # 剧情节点完成
            "type": "append_list",
            "auto_apply": True,
        },
        "foreshadow_tag": {
            "triggers": ["伏笔", "暗示", "铺垫", "揭示"],  # 新增或回收伏笔
            "type": "append_or_resolve",
            "auto_confirm": True,
        },
        "arc_position": {
            "triggers": [],  # 不通过触发词，而是通过章节比例自动计算
            "type": "computed",
            "formula": "chapter_no / total_chapters * 100",
        },
    }
    
    def detect_changes(self, 
                       character_id: str,
                       chapter_content: str,
                       previous_snapshot: CharacterStateSnapshot) -> List[StateChange]:
        """
        从章节内容中检测角色状态变化
        
        使用LLM辅助分析 + 规则引擎双重检测
        """
        changes = []
        
        # ── 规则引擎检测 ──
        for dim, rules in self.UPDATE_RULES.items():
            for trigger in rules.get("triggers", []):
                if self._find_trigger_for_character(chapter_content, character_id, trigger):
                    change = StateChange(
                        dimension=dim,
                        change_type=rules["type"],
                        auto_apply=rules.get("auto_apply", False),
                        auto_confirm=rules.get("auto_confirm", False),
                        threshold=rules.get("auto_threshold"),
                        detected_trigger=trigger,
                    )
                    changes.append(change)
        
        # ── LLM辅助检测（处理规则无法覆盖的隐含变化） ──
        llm_changes = self._llm_detect_changes(chapter_content, character_id, previous_snapshot)
        changes.extend(llm_changes)
        
        return self._deduplicate_changes(changes)
    
    def apply_changes(self,
                      previous_snapshot: CharacterStateSnapshot,
                      changes: List[StateChange],
                      chapter_id: str) -> CharacterStateSnapshot:
        """应用状态变更，生成新快照"""
        
        new_states = previous_snapshot.states.copy()
        changed_dims = []
        
        for change in changes:
            if change.auto_apply:
                new_value = self._compute_new_value(
                    previous_snapshot.states[change.dimension],
                    change
                )
                new_states[change.dimension] = new_value
                changed_dims.append(change.dimension)
            elif change.auto_confirm:
                # 标记待确认，但仍生成建议快照
                new_states[change.dimension] = change.suggested_value
                changed_dims.append(change.dimension)
                change.needs_review = True
        
        return CharacterStateSnapshot(
            snapshot_id=generate_uuid(),
            character_id=previous_snapshot.character_id,
            chapter_id=chapter_id,
            timestamp=datetime.now(),
            states=new_states,
            changed_dimensions=changed_dims,
            previous_snapshot_id=previous_snapshot.snapshot_id,
        )
```

### 4.3 数据库Schema设计

```sql
-- ═══════════════════════════════════════════
-- 角色基础表
-- ═══════════════════════════════════════════
CREATE TABLE characters (
    id              TEXT PRIMARY KEY,          -- UUID
    name            TEXT NOT NULL,
    aliases         TEXT,                      -- JSON: ["别名1", "别名2"]
    archetype       TEXT,                      -- 角色原型
    first_chapter   INTEGER,                   -- 首次出场章节
    status          TEXT DEFAULT 'active',     -- active | dead | departed | retired
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- ═══════════════════════════════════════════
-- 24维状态快照表（核心表）
-- ═══════════════════════════════════════════
CREATE TABLE character_state_snapshots (
    id                  TEXT PRIMARY KEY,       -- UUID
    character_id        TEXT NOT NULL REFERENCES characters(id),
    chapter_id          TEXT NOT NULL,
    snapshot_order      INTEGER NOT NULL,       -- 快照序号（全局递增）
    
    -- 24维状态（JSON存完整状态，列存高频查询维度）
    states_json         TEXT NOT NULL,           -- JSON: 完整24维状态
    
    -- 高频查询维度冗余列（支持SQL直接查询）
    hp_injury           INTEGER DEFAULT 100,
    location            TEXT,
    faction_name        TEXT,
    faction_loyalty     INTEGER DEFAULT 0,
    mental_state        TEXT DEFAULT 'stable',
    social_rank         TEXT,
    arc_position        REAL DEFAULT 0.0,
    
    -- 变化追踪
    changed_dimensions  TEXT,                    -- JSON: ["hp_injury", "location", ...]
    previous_snapshot_id TEXT,
    change_summary      TEXT,                    -- 人类可读的变化摘要
    
    -- 可靠性标记
    confidence          REAL DEFAULT 1.0,        -- 自动检测置信度
    needs_review        INTEGER DEFAULT 0,       -- 0=confirmed, 1=needs_review
    reviewed_by         TEXT,                    -- 审核人
    reviewed_at         TEXT,
    
    -- 元数据
    created_by          TEXT DEFAULT 'system',   -- system | auto_detect | manual | import
    created_at          TEXT NOT NULL,
    
    FOREIGN KEY (character_id) REFERENCES characters(id)
);

CREATE INDEX idx_snapshots_char_chapter 
    ON character_state_snapshots(character_id, snapshot_order);
CREATE INDEX idx_snapshots_needs_review 
    ON character_state_snapshots(needs_review) WHERE needs_review = 1;

-- ═══════════════════════════════════════════
-- 状态变更日志表（审计用）
-- ═══════════════════════════════════════════
CREATE TABLE state_change_log (
    id                  TEXT PRIMARY KEY,
    snapshot_id         TEXT NOT NULL,
    character_id        TEXT NOT NULL,
    dimension           TEXT NOT NULL,          -- 变化的维度名
    old_value           TEXT,                   -- JSON
    new_value           TEXT,                   -- JSON
    change_source       TEXT NOT NULL,          -- rule_detect | llm_detect | manual | import
    trigger_keyword     TEXT,                   -- 触发变化的关键词
    chapter_id          TEXT,
    created_at          TEXT NOT NULL,
    
    FOREIGN KEY (snapshot_id) REFERENCES character_state_snapshots(id)
);

CREATE INDEX idx_changes_dimension 
    ON state_change_log(character_id, dimension);

-- ═══════════════════════════════════════════
-- 快照比较视图（用于一致性检查）
-- ═══════════════════════════════════════════
CREATE VIEW v_character_latest_state AS
SELECT 
    c.id AS character_id,
    c.name,
    s.states_json,
    s.chapter_id,
    s.snapshot_order,
    s.created_at AS last_updated
FROM characters c
LEFT JOIN (
    SELECT *, ROW_NUMBER() OVER (
        PARTITION BY character_id ORDER BY snapshot_order DESC
    ) AS rn
    FROM character_state_snapshots
) s ON c.id = s.character_id AND s.rn = 1;
```

### 4.4 快照策略

```
快照触发时机:
  ├── 每章完成后 → 自动全量快照（所有出场角色）
  ├── 重大事件后 → 强制快照（生死、背叛、觉醒等）
  ├── 人工触发 → 用户手动标记"重要节点"
  └── 编辑回滚 → 从快照恢复（保留完整快照链）

快照存储策略:
  ├── 完整快照：每5章存储一次完整24维JSON
  ├── 增量快照：仅存储变化的维度 + 引用上一个完整快照
  └── 保留策略：所有快照永久保留（SQLite存储成本极低）

快照一致性:
  ├── 每章快照附带checksum（states_json的SHA256）
  ├── 快照链单向链表（previous_snapshot_id）
  └── 启动时校验链完整性
```

---

## 5. 三段式创作闭环流程

### 5.1 完整时序图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        三段式创作闭环 (Write-Loop)                            │
│                                                                              │
│  Phase 1: 动笔前 ── 上下文构建                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  用户选择写作目标 ──→ 确定写作阶段(大纲/正文/润色)                       │   │
│  │        │                                                              │   │
│  │        ▼                                                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │   │
│  │  │ 大纲检索  │  │ 角色状态  │  │ 伏笔扫描  │  │  RTCO预算分配    │     │   │
│  │  │ (本章大纲)│  │ (24维快照)│  │ (活跃伏笔)│  │  (P0/P1/P2)     │     │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬──────────┘     │   │
│  │       └──────────────┴─────────────┴───────────────┘                │   │
│  │                          │                                            │   │
│  │                          ▼                                            │   │
│  │               ┌─────────────────┐                                    │   │
│  │               │  上下文组装完成   │  → 进入Phase 2                    │   │
│  │               └─────────────────┘                                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  Phase 2: 写作中 ── 约束注入 + 实时监控                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  ┌──────────────────────────────────────────────────────────────┐    │   │
│  │  │                    LLM 生成循环                                │    │   │
│  │  │                                                               │    │   │
│  │  │   系统指令(P0上下文) + 用户指令                                │    │   │
│  │  │        │                                                      │    │   │
│  │  │        ▼                                                      │    │   │
│  │  │   ┌─────────┐     ┌─────────────┐     ┌───────────────┐      │    │   │
│  │  │   │ LLM生成  │ ──→ │ 规则校验     │ ──→ │ 输出给用户     │      │    │   │
│  │  │   └─────────┘     │ (实时)       │     └───────────────┘      │    │   │
│  │  │                    │ • 角色行为  │                            │    │   │
│  │  │                    │ • 世界观规则│                            │    │   │
│  │  │                    │ • 伏笔检查  │                            │    │   │
│  │  │                    └──────┬──────┘                            │    │   │
│  │  │                           │ 违规                              │    │   │
│  │  │                           ▼                                   │    │   │
│  │  │                    ┌─────────────┐                            │    │   │
│  │  │                    │ 注入修正指令  │ → 重新生成                │    │   │
│  │  │                    └─────────────┘                            │    │   │
│  │  └──────────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  Phase 3: 完稿后 ── 信息回写                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                                                                       │   │
│  │  用户确认章节完成 ──→ 触发后处理流水线                                  │   │
│  │        │                                                              │   │
│  │        ├──→ ① 章节分块 → 写入章节向量索引                              │   │
│  │        ├──→ ② 角色状态检测 → 24维状态更新 → 生成快照                   │   │
│  │        ├──→ ③ 伏笔扫描 → 新伏笔入库 / 已回收伏笔标记                   │   │
│  │        ├──→ ④ 一致性检查 → 跨角色行为校验 → 标记矛盾                   │   │
│  │        ├──→ ⑤ 摘要生成 → 章节摘要写入摘要链                            │   │
│  │        └──→ ⑥ WAL日志写入 → 快照落盘                                   │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 核心代码实现

```python
class WritingLoopOrchestrator:
    """
    三段式创作闭环编排器
    
    这是整个写作平台的核心编排逻辑：
    将RAG检索、状态管理、LLM生成、信息回写串联为完整闭环。
    """
    
    def __init__(self,
                 rag_engine: HybridRetriever,
                 state_engine: StateUpdateEngine,
                 model_router: ModelRouter,
                 conflict_detector: ConflictDetector):
        self.rag = rag_engine
        self.state = state_engine
        self.router = model_router
        self.conflict = conflict_detector
    
    async def write_chapter_section(self, 
                                    user_intent: str,
                                    chapter_id: str,
                                    writing_stage: str) -> WriteResult:
        """
        完整的写作闭环——一个章节片段的生成
        
        Args:
            user_intent: 用户的写作意图描述
            chapter_id: 当前章节ID
            writing_stage: drafting | revision | polish
        """
        
        # ═══════════════════════════════════════
        # PHASE 1: 动笔前 —— 上下文构建
        # ═══════════════════════════════════════
        
        # 1a. 获取本章大纲
        outline = await self._get_chapter_outline(chapter_id)
        
        # 1b. 检索出场角色的最新24维状态快照
        active_characters = self._identify_active_characters(user_intent, chapter_id)
        character_states = {
            char_id: self.state.get_latest_snapshot(char_id)
            for char_id in active_characters
        }
        
        # 1c. 扫描活跃伏笔（本章可能需要回收的）
        active_foreshadows = self._scan_active_foreshadows(chapter_id, active_characters)
        
        # 1d. RTCO预算分配
        complexity = self._calc_complexity(active_characters, active_foreshadows)
        budget = self.rtco_allocator.allocate(
            stage=writing_stage,
            chapter_complexity=complexity,
            active_characters=len(active_characters),
            active_foreshadows=len(active_foreshadows),
        )
        
        # 1e. RAG混合检索 —— P0和P1内容
        p0_results = await self._rag_retrieve_p0(
            outline, character_states, active_foreshadows
        )
        p1_results = await self._rag_retrieve_p1(chapter_id, active_characters)
        
        # 1f. 上下文组装
        system_prompt, context = self.context_injector.build_context(
            budget, p0_results, p1_results
        )
        
        # ═══════════════════════════════════════
        # PHASE 2: 写作中 —— LLM生成 + 实时校验
        # ═══════════════════════════════════════
        
        # 2a. 模型选择
        model = self.router.select_model(
            stage=writing_stage,
            complexity=complexity,
            chapter_id=chapter_id,
        )
        
        # 2b. LLM生成（带重试和校验循环）
        max_retries = 3
        for attempt in range(max_retries):
            generated_text = await model.generate(
                system_prompt=system_prompt,
                context=context,
                user_instruction=user_intent,
            )
            
            # 2c. 实时规则校验
            violations = self.conflict.check_realtime(
                generated_text=generated_text,
                character_states=character_states,
                world_rules=self._get_relevant_world_rules(chapter_id),
                active_foreshadows=active_foreshadows,
            )
            
            if not violations:
                break  # 通过校验
            
            # 2d. 违规修正
            correction_prompt = self._build_correction_prompt(violations)
            context = context + "\n" + correction_prompt
        
        # ═══════════════════════════════════════
        # PHASE 3: 完稿后 —— 信息回写（事务性保证）
        # ═══════════════════════════════════════
        
        async with self._transaction() as txn:
            # 3a. 章节分块 + 向量索引写入
            chunks = self.rag.chunker.split(generated_text, "chapter")
            await self.rag.vector_store.upsert_batch(
                collection="chapters",
                points=[c.to_point(chapter_id) for c in chunks]
            )
            
            # 3b. 24维状态检测 + 快照更新
            for char_id in active_characters:
                changes = self.state.detect_changes(
                    char_id, generated_text, character_states[char_id]
                )
                new_snapshot = self.state.apply_changes(
                    character_states[char_id], changes, chapter_id
                )
                await self.state.save_snapshot(new_snapshot)
            
            # 3c. 伏笔扫描
            await self._process_foreshadows(generated_text, chapter_id)
            
            # 3d. 一致性检查（事后深度校验）
            consistency_issues = await self.conflict.check_deep(
                chapter_id=chapter_id,
                generated_text=generated_text,
                new_snapshots=new_snapshots,
            )
            
            # 3e. 章节摘要生成（用于滚动窗口）
            summary = await self._generate_chapter_summary(generated_text)
            await self._save_summary(chapter_id, summary)
            
            # 3f. WAL日志写入
            await self._write_wal_entry(chapter_id, txn)
        
        return WriteResult(
            text=generated_text,
            violations=violations if attempt > 0 else [],
            consistency_issues=consistency_issues,
            state_changes=changes,
            model_used=model.name,
            token_usage=model.last_usage,
        )
```

### 5.3 信息回写的事务性保证

```python
class TransactionalWriteBack:
    """
    事务性信息回写
    
    保证：正文生成 + 状态更新 + RAG索引更新 = 一个原子操作
    任何一步失败，整个事务回滚。
    """
    
    async def commit_chapter(self, chapter_id: str, write_result: WriteResult):
        """
        以事务方式提交章节的所有副作用
        """
        tx_id = generate_uuid()
        
        try:
            # Begin transaction
            await self.db.execute("BEGIN IMMEDIATE")
            
            # 1. 保存章节正文
            await self.db.execute(
                "INSERT INTO chapters (id, content, summary, ...) VALUES (?, ?, ?, ...)",
                [chapter_id, write_result.text, write_result.summary]
            )
            
            # 2. 保存状态快照
            for snapshot in write_result.new_snapshots:
                await self.db.execute(
                    """INSERT INTO character_state_snapshots 
                       (id, character_id, chapter_id, states_json, ...) 
                       VALUES (?, ?, ?, ?, ...)""",
                    [snapshot.snapshot_id, snapshot.character_id, 
                     chapter_id, json.dumps(snapshot.states)]
                )
                # 状态变更日志
                for change in snapshot.changed_dimensions:
                    await self.db.execute(
                        "INSERT INTO state_change_log (...) VALUES (...)",
                        [...]
                    )
            
            # 3. 更新RAG向量索引（Qdrant操作）
            # 注意：向量库操作不支持事务回滚，
            # 采用"先写SQLite→成功后再写向量库→失败则补偿删除"策略
            vector_points = self._prepare_vector_points(write_result, chapter_id)
            
            # 4. 保存伏笔变更
            for fs in write_result.foreshadow_changes:
                await self.db.execute(
                    "INSERT OR UPDATE foreshadows (...) VALUES (...)",
                    [...]
                )
            
            # Commit SQLite transaction
            await self.db.execute("COMMIT")
            
            # 向量库写入（后置，失败时补偿）
            try:
                await self.vector_store.upsert_batch(
                    collection="chapters",
                    points=vector_points
                )
            except Exception as e:
                # 补偿：标记该章节向量索引待重建
                await self.db.execute(
                    "UPDATE chapters SET vector_status='pending_rebuild' WHERE id=?",
                    [chapter_id]
                )
                logger.error(f"Vector write failed for {chapter_id}: {e}")
                # 不抛异常——正文和状态已安全落盘
            
            # 写入WAL
            await self._write_wal(tx_id, chapter_id, "COMMIT")
            
        except Exception as e:
            await self.db.execute("ROLLBACK")
            await self._write_wal(tx_id, chapter_id, f"ROLLBACK: {e}")
            raise WriteBackError(f"Transaction failed: {e}")
```

---

## 6. RAG持久化方案

### 6.1 三层记忆架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         三层记忆架构                                      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Layer 1: 内存缓存 (L1)                          │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  LRU Cache (容量: 1000 entries)                              │  │  │
│  │  │  • 热门角色状态快照 (TTL: 5分钟)                              │  │  │
│  │  │  • 活跃伏笔列表 (TTL: 1分钟，写后失效)                        │  │  │
│  │  │  • 近5章摘要 (常驻)                                          │  │  │
│  │  │  • RAG检索结果缓存 (TTL: 同一次写作会话)                      │  │  │
│  │  │  延迟: < 1ms                                                  │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │ Cache Miss                          │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Layer 2: SQLite持久化 (L2)                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  • 角色状态快照全量存储                                       │  │  │
│  │  │  • 章节正文 + 摘要                                            │  │  │
│  │  │  • 伏笔全量数据                                               │  │  │
│  │  │  • 世界观文档原文                                             │  │  │
│  │  │  • 元数据（大纲结构/冲突记录/用户偏好）                        │  │  │
│  │  │  延迟: 1-5ms (索引查询)                                       │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │ 异步同步                            │
│                                    ▼                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                Layer 3: WAL日志 + 快照备份 (L3)                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  • WAL日志: 所有写操作的顺序记录                               │  │  │
│  │  │  • 全量快照: 每N章/每天自动备份                               │  │  │
│  │  │  • 云端同步: 可选（未来）                                     │  │  │
│  │  │  延迟: 异步（不影响主流程）                                    │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 L1内存缓存实现

```python
from functools import lru_cache
from collections import OrderedDict
import time
import threading

class MemoryCache:
    """
    L1内存缓存层
    
    特性：
    - LRU淘汰策略
    - TTL过期
    - 写失效（写操作后自动清除相关缓存）
    - 线程安全
    """
    
    def __init__(self, max_size: int = 1000):
        self._cache = OrderedDict()
        self._max_size = max_size
        self._lock = threading.RLock()
        
        # 缓存分区
        self._ttl = {
            "character_state": 300,    # 5分钟
            "active_foreshadows": 60,  # 1分钟
            "chapter_summary": 0,      # 永不过期（手动失效）
            "rag_result": 300,         # 同一次写作会话
            "world_rule": 600,         # 10分钟
        }
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            entry = self._cache[key]
            
            # TTL检查
            cache_type = entry.get("type", "default")
            ttl = self._ttl.get(cache_type, 300)
            if ttl > 0 and time.time() - entry["ts"] > ttl:
                del self._cache[key]
                return None
            
            # LRU: 移到末尾
            self._cache.move_to_end(key)
            return entry["value"]
    
    def set(self, key: str, value: Any, cache_type: str = "default"):
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = {
                "value": value,
                "ts": time.time(),
                "type": cache_type,
            }
            # 淘汰最久未使用的
            if len(self._cache) > self._max_size:
                self._cache.popitem(last=False)
    
    def invalidate_pattern(self, pattern: str):
        """按前缀匹配失效缓存"""
        with self._lock:
            keys_to_remove = [k for k in self._cache if k.startswith(pattern)]
            for k in keys_to_remove:
                del self._cache[k]
    
    def invalidate_character(self, character_id: str):
        """角色状态变更时，失效所有相关缓存"""
        self.invalidate_pattern(f"char:{character_id}")
        self.invalidate_pattern(f"rag:char:{character_id}")


# 全局缓存实例
l1_cache = MemoryCache(max_size=1000)
```

### 6.3 L2 SQLite持久化实现

```python
import sqlite3
import json
from pathlib import Path

class SQLitePersistence:
    """
    L2 SQLite持久化层
    
    设计要点：
    - WAL模式（Write-Ahead Logging）支持并发读写
    - 预编译语句缓存
    - 自动VACUUM（每1000次写入）
    - 完整性检查
    """
    
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._conn = None
        self._write_count = 0
        self._vacuum_threshold = 1000
        
    async def initialize(self):
        """初始化数据库连接和表结构"""
        self._conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,  # 异步场景
        )
        self._conn.row_factory = sqlite3.Row
        
        # 启用WAL模式
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")  # 平衡安全和性能
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.execute("PRAGMA cache_size=-8000")    # 8MB缓存
        
        # 创建表结构
        await self._create_tables()
        
        # 启动时完整性检查
        await self.integrity_check()
    
    async def integrity_check(self) -> bool:
        """
        启动时完整性校验
        
        检查项：
        1. SQLite INTEGRITY_CHECK
        2. 向量库count vs SQLite索引映射count
        3. 快照链完整性
        """
        results = {}
        
        # 1. SQLite结构完整性
        cursor = self._conn.execute("PRAGMA integrity_check")
        row = cursor.fetchone()
        results["sqlite"] = row[0] == "ok"
        
        # 2. 向量库 vs SQLite 计数校验
        sqlite_chunk_count = self._conn.execute(
            "SELECT COUNT(*) FROM chapter_chunks"
        ).fetchone()[0]
        vector_count = await self._vector_store.count("chapters")
        results["vector_count_match"] = sqlite_chunk_count == vector_count
        
        # 3. 快照链完整性
        broken_chains = self._conn.execute("""
            SELECT a.id FROM character_state_snapshots a
            LEFT JOIN character_state_snapshots b 
                ON a.previous_snapshot_id = b.id
            WHERE a.previous_snapshot_id IS NOT NULL 
              AND b.id IS NULL
        """).fetchall()
        results["broken_snapshot_chains"] = len(broken_chains)
        
        # 4. 外键完整性
        fk_result = self._conn.execute("PRAGMA foreign_key_check")
        fk_violations = fk_result.fetchall()
        results["fk_violations"] = len(fk_violations)
        
        all_ok = all([
            results["sqlite"],
            results["vector_count_match"],
            results["broken_snapshot_chains"] == 0,
            results["fk_violations"] == 0,
        ])
        
        return all_ok, results
    
    async def _create_tables(self):
        """创建所有持久化表"""
        # 参见 4.3 节 Schema
        # ... (characters, character_state_snapshots, state_change_log, 
        #       chapters, chapter_chunks, foreshadows, world_docs, 
        #       outline_nodes, consistency_issues, wal_log)
        
        self._conn.executescript(SCHEMA_SQL)
        self._conn.commit()
```

### 6.4 WAL日志与崩溃恢复

```python
class WALManager:
    """
    L3 WAL日志管理器
    
    WAL设计：
    - 顺序写入（追加模式）
    - 定期截断（保留最近30天或最近1000条）
    - 崩溃恢复时从最后一个checkpoint回放
    """
    
    WAL_SCHEMA = """
    CREATE TABLE IF NOT EXISTS wal_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_id       TEXT NOT NULL,
        operation   TEXT NOT NULL,      -- BEGIN | INSERT | UPDATE | DELETE | COMMIT | ROLLBACK
        table_name  TEXT,
        record_id   TEXT,
        before_json TEXT,               -- 操作前数据（用于回滚）
        after_json  TEXT,               -- 操作后数据（用于重放）
        timestamp   TEXT NOT NULL,
        status      TEXT DEFAULT 'pending'  -- pending | committed | rolled_back
    );
    
    CREATE TABLE IF NOT EXISTS wal_checkpoint (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        checkpoint_at   TEXT NOT NULL,
        last_wal_id     INTEGER NOT NULL,
        snapshot_path   TEXT,           -- 全量快照文件路径
        verified        INTEGER DEFAULT 0
    );
    """
    
    async def recover(self) -> RecoveryResult:
        """
        崩溃恢复流程
        
        1. 找到最后一个已校验的checkpoint
        2. 从checkpoint处读取WAL日志
        3. 回放所有 COMMITTED 但未checkpoint的操作
        4. 对于 PENDING 的操作，检查数据完整性并决定回滚或重放
        """
        
        # Step 1: 找最后一个checkpoint
        last_ckpt = self.db.execute(
            "SELECT * FROM wal_checkpoint ORDER BY id DESC LIMIT 1"
        ).fetchone()
        
        if last_ckpt:
            start_wal_id = last_ckpt["last_wal_id"] + 1
        else:
            start_wal_id = 1  # 从头开始
        
        # Step 2: 读取WAL日志
        pending_entries = self.db.execute(
            """SELECT * FROM wal_log 
               WHERE id >= ? AND status = 'pending'
               ORDER BY id""",
            [start_wal_id]
        ).fetchall()
        
        # Step 3: 按tx_id分组
        transactions = self._group_by_tx(pending_entries)
        
        recovered = 0
        rolled_back = 0
        
        for tx_id, entries in transactions.items():
            last_entry = entries[-1]
            
            if last_entry["operation"] == "COMMIT":
                # 已提交但未checkpoint → 重放确认
                await self._replay_transaction(entries)
                await self._mark_transaction(tx_id, "committed")
                recovered += 1
            
            elif last_entry["operation"] == "ROLLBACK":
                # 显式回滚
                await self._mark_transaction(tx_id, "rolled_back")
                rolled_back += 1
            
            else:
                # 不完整的事务 → 回滚
                await self._rollback_transaction(entries)
                await self._mark_transaction(tx_id, "rolled_back")
                rolled_back += 1
        
        # Step 4: 向量库一致性修复
        await self._repair_vector_consistency()
        
        return RecoveryResult(
            recovered_transactions=recovered,
            rolled_back_transactions=rolled_back,
            vector_repairs=await self._count_vector_repairs(),
        )
    
    async def checkpoint(self):
        """创建checkpoint（建议每小时或每100条WAL）"""
        last_wal = self.db.execute(
            "SELECT MAX(id) FROM wal_log WHERE status IN ('committed', 'rolled_back')"
        ).fetchone()[0]
        
        # 创建全量快照备份
        snapshot_path = await self._create_full_snapshot()
        
        self.db.execute(
            "INSERT INTO wal_checkpoint (checkpoint_at, last_wal_id, snapshot_path) VALUES (?, ?, ?)",
            [datetime.now().isoformat(), last_wal, snapshot_path]
        )
        
        # 清理旧WAL（保留最近1000条）
        self.db.execute(
            "DELETE FROM wal_log WHERE id < ?",
            [last_wal - 1000]
        )
```

### 6.5 持久化架构总览

```python
# ── 持久化层统一入口 ──

class PersistenceLayer:
    """
    持久化层统一门面
    
    三层协调：
    L1：内存缓存 → 快速读取
    L2：SQLite → 结构化持久化
    L3：WAL + 快照 → 崩溃恢复
    """
    
    def __init__(self, data_dir: Path):
        self.cache = MemoryCache(max_size=1000)
        self.sqlite = SQLitePersistence(data_dir / "novel.db")
        self.wal = WALManager(data_dir / "wal.db")
        self.vector_store = None  # 延迟初始化（Qdrant客户端）
        
    async def read_character_state(self, character_id: str) -> CharacterStateSnapshot:
        """读：L1 → L2"""
        # 尝试L1
        cached = self.cache.get(f"char:{character_id}:latest")
        if cached:
            return cached
        
        # L2查询
        row = await self.sqlite.execute(
            """SELECT * FROM v_character_latest_state WHERE character_id = ?""",
            [character_id]
        )
        snapshot = self._row_to_snapshot(row)
        
        # 回填L1
        self.cache.set(f"char:{character_id}:latest", snapshot, "character_state")
        return snapshot
    
    async def write_character_state(self, snapshot: CharacterStateSnapshot):
        """写：L2 → L1失效 → L3 WAL"""
        # L2写入
        await self.sqlite.execute(
            "INSERT INTO character_state_snapshots (...) VALUES (...)",
            [...]
        )
        
        # L1失效
        self.cache.invalidate_character(snapshot.character_id)
        
        # L3 WAL
        await self.wal.log_operation(
            tx_id=current_tx_id(),
            operation="INSERT",
            table_name="character_state_snapshots",
            record_id=snapshot.snapshot_id,
            after_json=json.dumps(snapshot.__dict__),
        )
```

---

## 7. 模型路由引擎方案

### 7.1 模型登记与能力矩阵

```python
from dataclasses import dataclass
from typing import List, Optional, Dict

@dataclass
class ModelProfile:
    """模型能力档案"""
    model_id: str
    provider: str          # anthropic | openai | deepseek | zhipu | moonshot
    display_name: str
    role: str              # writer | reviewer | planner | summarizer
    
    # 能力参数
    context_window: int    # 最大上下文长度（tokens）
    max_output: int        # 最大输出长度
    speed_tier: str        # fast | normal | slow
    cost_per_1k_input: float   # USD
    cost_per_1k_output: float  # USD
    
    # 写作能力评分 (1-10)
    creativity: int        # 创造性
    consistency: int       # 一致性
    style_control: int     # 风格控制
    instruction_follow: int # 指令遵循
    
    # 技术特性
    supports_streaming: bool
    supports_json_mode: bool
    supports_system_prompt: bool
    
    # 状态
    available: bool = True
    current_load: float = 0.0  # 0-1，当前负载
    fail_count: int = 0
    last_fail_at: Optional[str] = None


# ── 模型注册表 ──

MODEL_REGISTRY = {
    # ═══ 写手模型 ═══
    "claude-3.5-sonnet": ModelProfile(
        model_id="claude-3.5-sonnet",
        provider="anthropic",
        display_name="Claude 3.5 Sonnet",
        role="writer",
        context_window=200000,
        max_output=8192,
        speed_tier="normal",
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        creativity=9, consistency=9, style_control=9, instruction_follow=10,
        supports_streaming=True, supports_json_mode=True, supports_system_prompt=True,
    ),
    "gpt-4o": ModelProfile(
        model_id="gpt-4o",
        provider="openai",
        display_name="GPT-4o",
        role="writer",
        context_window=128000,
        max_output=16384,
        speed_tier="fast",
        cost_per_1k_input=0.0025,
        cost_per_1k_output=0.01,
        creativity=8, consistency=8, style_control=8, instruction_follow=9,
        supports_streaming=True, supports_json_mode=True, supports_system_prompt=True,
    ),
    "deepseek-v3": ModelProfile(
        model_id="deepseek-v3",
        provider="deepseek",
        display_name="DeepSeek V3",
        role="writer",
        context_window=65536,
        max_output=8192,
        speed_tier="fast",
        cost_per_1k_input=0.00014,
        cost_per_1k_output=0.00028,
        creativity=7, consistency=7, style_control=7, instruction_follow=8,
        supports_streaming=True, supports_json_mode=False, supports_system_prompt=True,
    ),
    "glm-4": ModelProfile(
        model_id="glm-4",
        provider="zhipu",
        display_name="GLM-4",
        role="writer",
        context_window=128000,
        max_output=4096,
        speed_tier="fast",
        cost_per_1k_input=0.0001,
        cost_per_1k_output=0.0001,
        creativity=7, consistency=6, style_control=6, instruction_follow=7,
        supports_streaming=True, supports_json_mode=False, supports_system_prompt=True,
    ),
    
    # ═══ 评审模型 ═══
    "claude-3.5-sonnet-review": ModelProfile(
        model_id="claude-3.5-sonnet",
        provider="anthropic",
        display_name="Claude 3.5 Sonnet (Review)",
        role="reviewer",
        context_window=200000,
        max_output=4096,
        speed_tier="normal",
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        creativity=3, consistency=10, style_control=7, instruction_follow=10,
        supports_streaming=False, supports_json_mode=True, supports_system_prompt=True,
    ),
    "deepseek-v3-review": ModelProfile(
        model_id="deepseek-v3",
        provider="deepseek",
        display_name="DeepSeek V3 (Review)",
        role="reviewer",
        context_window=65536,
        max_output=4096,
        speed_tier="fast",
        cost_per_1k_input=0.00014,
        cost_per_1k_output=0.00028,
        creativity=2, consistency=8, style_control=5, instruction_follow=8,
        supports_streaming=False, supports_json_mode=False, supports_system_prompt=True,
    ),
    
    # ═══ 策划模型 ═══
    "claude-3.5-sonnet-plan": ModelProfile(
        model_id="claude-3.5-sonnet",
        provider="anthropic",
        display_name="Claude 3.5 Sonnet (Plan)",
        role="planner",
        context_window=200000,
        max_output=8192,
        speed_tier="normal",
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        creativity=9, consistency=9, style_control=5, instruction_follow=10,
        supports_streaming=False, supports_json_mode=True, supports_system_prompt=True,
    ),
}
```

### 7.2 场景路由引擎

```python
from enum import Enum

class WritingStage(Enum):
    PLANNING = "planning"         # 策划阶段
    OUTLINING = "outlining"       # 大纲阶段
    DRAFTING = "drafting"         # 正文写作
    KEY_SCENE = "key_scene"       # 关键转折/高潮
    TRANSITION = "transition"     # 过渡章节
    REVISION = "revision"         # 修改
    POLISH = "polish"             # 润色
    REVIEW = "review"             # 评审
    SUMMARIZE = "summarize"       # 摘要

class ModelRouter:
    """
    智能模型路由器
    
    核心功能：
    1. 场景→模型映射（静态规则）
    2. 动态负载均衡
    3. 成本优化（双模型策略）
    4. 故障转移
    """
    
    # 场景路由表
    SCENE_ROUTING = {
        WritingStage.PLANNING: {
            "primary": "claude-3.5-sonnet-plan",
            "fallback": "deepseek-v3",
            "max_cost_tier": "high",
        },
        WritingStage.OUTLINING: {
            "primary": "claude-3.5-sonnet-plan",
            "fallback": "deepseek-v3",
            "max_cost_tier": "medium",
        },
        WritingStage.KEY_SCENE: {
            "primary": "claude-3.5-sonnet",
            "fallback": "gpt-4o",
            "max_cost_tier": "high",
        },
        WritingStage.DRAFTING: {
            "primary": "claude-3.5-sonnet",
            "fallback": "deepseek-v3",
            "max_cost_tier": "medium",
        },
        WritingStage.TRANSITION: {
            "primary": "deepseek-v3",  # 过渡章节用低成本模型
            "fallback": "glm-4",
            "max_cost_tier": "low",
        },
        WritingStage.REVISION: {
            "primary": "claude-3.5-sonnet",
            "fallback": "gpt-4o",
            "max_cost_tier": "medium",
        },
        WritingStage.POLISH: {
            "primary": "gpt-4o",
            "fallback": "claude-3.5-sonnet",
            "max_cost_tier": "medium",
        },
        WritingStage.REVIEW: {
            "primary": "deepseek-v3-review",  # 评审可降级
            "fallback": "claude-3.5-sonnet-review",
            "max_cost_tier": "low",
        },
        WritingStage.SUMMARIZE: {
            "primary": "deepseek-v3",
            "fallback": "glm-4",
            "max_cost_tier": "low",
        },
    }
    
    def select_model(self, 
                     stage: WritingStage,
                     complexity: float = 0.5,
                     user_preference: Optional[str] = None,
                     force_model: Optional[str] = None) -> ModelProfile:
        """
        选择最优模型
        
        决策流程：
        1. 用户强制指定 → 直接使用
        2. 用户偏好设置 → 优先匹配
        3. 场景路由规则 → 选择主模型
        4. 健康检查 → 故障则切换备用
        5. 成本优化 → 简单场景降级
        """
        
        # 用户强制指定
        if force_model and force_model in MODEL_REGISTRY:
            return MODEL_REGISTRY[force_model]
        
        # 场景路由
        route = self.SCENE_ROUTING[stage]
        
        # 用户偏好覆盖
        preferred = user_preference or route["primary"]
        
        # 成本优化——双模型策略
        if route["max_cost_tier"] == "low" and complexity < 0.5:
            # 简单过渡场景：优先低成本
            primary = route.get("low_cost_primary", route["primary"])
        else:
            primary = preferred
        
        profile = MODEL_REGISTRY.get(primary)
        
        # 健康检查 + 故障转移
        if not self._is_healthy(profile):
            fallback_id = route["fallback"]
            profile = MODEL_REGISTRY[fallback_id]
            logger.warning(f"Model {primary} unhealthy, fallback to {fallback_id}")
        
        return profile
    
    def _is_healthy(self, profile: ModelProfile) -> bool:
        """模型健康检查"""
        if not profile.available:
            return False
        
        # 故障计数检查（3次失败 → 熔断5分钟）
        if profile.fail_count >= 3:
            if profile.last_fail_at:
                elapsed = time.time() - datetime.fromisoformat(profile.last_fail_at).timestamp()
                if elapsed < 300:  # 5分钟熔断
                    return False
                else:
                    profile.fail_count = 0  # 重置（半开状态）
        
        return True
    
    def report_failure(self, model_id: str):
        """上报模型调用失败"""
        profile = MODEL_REGISTRY[model_id]
        profile.fail_count += 1
        profile.last_fail_at = datetime.now().isoformat()
    
    def report_success(self, model_id: str):
        """上报成功——重置故障计数"""
        MODEL_REGISTRY[model_id].fail_count = 0
```

### 7.3 模型切换时的状态迁移

```python
class ModelStateMigrator:
    """
    模型热切换时的状态迁移器
    
    问题：不同模型的prompt格式、system prompt支持、上下文组织方式不同。
    解决方案：定义统一的内部表示，各模型Adapter负责转换。
    """
    
    def migrate_context(self, 
                        context: UnifiedContext,
                        from_model: ModelProfile,
                        to_model: ModelProfile) -> UnifiedContext:
        """
        上下文在不同模型间的迁移
        
        核心操作：
        1. Token预算重新分配（目标模型context window可能不同）
        2. Prompt模板适配（不同模型对system/user/assistant格式要求不同）
        3. 压缩策略调整（目标模型窗口更小→更激进的摘要）
        """
        
        # 上下文窗口变化处理
        if to_model.context_window < from_model.context_window:
            # 目标模型窗口更小 → 需要压缩
            ratio = to_model.context_window / from_model.context_window
            context = self._compress_context(context, ratio)
        
        # Prompt模板适配
        context = self._adapt_prompt_template(context, to_model)
        
        # 记录迁移事件
        self._log_migration(from_model.model_id, to_model.model_id, context)
        
        return context
    
    def _compress_context(self, context: UnifiedContext, ratio: float) -> UnifiedContext:
        """压缩上下文以适应更小的窗口"""
        # 优先压缩P2，再压缩P1，P0不变
        budget = RTCOBudgetAllocator(int(context.total_tokens * ratio))
        plan = budget.allocate("drafting", 0.5, context.active_characters, 0)
        
        context.p2_content = self._truncate_to_tokens(context.p2_content, plan.tokens["P2"])
        context.p1_content = self._truncate_to_tokens(context.p1_content, plan.tokens["P1"])
        # P0不压缩
        
        return context
```

### 7.4 成本统计与预算控制

```python
class CostTracker:
    """
    模型使用成本统计
    
    功能：
    - 按项目/章节/模型统计token使用和费用
    - 设置日/周/月预算上限
    - 超预算告警
    """
    
    def __init__(self, db: sqlite3.Connection):
        self.db = db
        self._ensure_table()
    
    def _ensure_table(self):
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS model_usage_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                model_id    TEXT NOT NULL,
                project_id  TEXT NOT NULL,
                chapter_id  TEXT,
                stage       TEXT NOT NULL,
                input_tokens   INTEGER NOT NULL,
                output_tokens  INTEGER NOT NULL,
                cost_usd    REAL NOT NULL,
                latency_ms  INTEGER,
                success     INTEGER DEFAULT 1,
                created_at  TEXT NOT NULL
            )
        """)
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS cost_budget (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id      TEXT NOT NULL,
                period          TEXT NOT NULL,  -- daily | weekly | monthly
                budget_usd      REAL NOT NULL,
                start_date      TEXT NOT NULL,
                end_date        TEXT,
                alert_threshold REAL DEFAULT 0.8  -- 80%时告警
            )
        """)
    
    def log_usage(self, 
                  model_id: str, 
                  project_id: str,
                  chapter_id: str,
                  stage: str,
                  input_tokens: int,
                  output_tokens: int,
                  latency_ms: int,
                  success: bool = True):
        """记录模型使用"""
        profile = MODEL_REGISTRY[model_id]
        cost = (input_tokens * profile.cost_per_1k_input / 1000 +
                output_tokens * profile.cost_per_1k_output / 1000)
        
        self.db.execute(
            """INSERT INTO model_usage_log 
               (model_id, project_id, chapter_id, stage, 
                input_tokens, output_tokens, cost_usd, latency_ms, success, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [model_id, project_id, chapter_id, stage,
             input_tokens, output_tokens, round(cost, 6), latency_ms,
             int(success), datetime.now().isoformat()]
        )
        
        # 检查预算
        self._check_budget(project_id)
    
    def get_usage_report(self, project_id: str, period: str = "daily") -> dict:
        """获取使用报告"""
        return self.db.execute("""
            SELECT 
                model_id,
                SUM(input_tokens) as total_input,
                SUM(output_tokens) as total_output,
                SUM(cost_usd) as total_cost,
                COUNT(*) as call_count,
                AVG(latency_ms) as avg_latency,
                SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) as failures
            FROM model_usage_log
            WHERE project_id = ? 
              AND date(created_at) = date('now')
            GROUP BY model_id
        """, [project_id]).fetchall()
```

---

## 8. 冲突检测引擎

### 8.1 四级优先级体系

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       冲突优先级体系                                      │
│                                                                          │
│  P0 · 锁定正文 (LOCKED_CONTENT)         优先级: 最高 (100)               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  定义：已被用户显式锁定的章节/段落                                    │ │
│  │  检测时机：写入时 / 修改时 / 世界观变更时                              │ │
│  │  处理策略：任何违反行为 → 硬阻断，必须人工确认                          │ │
│  │  示例：第3章已锁定，第5章写"小明死了"但小明在第3章锁定内容中出现       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  P1 · 世界观规则 (WORLD_RULES)           优先级: 高 (80)                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  定义：已确立的世界观铁律（魔法体系、物理法则、社会结构等）             │ │
│  │  检测时机：写入时 / 世界观修改时                                       │ │
│  │  处理策略：检测到违反 → 警告 + 建议修正；世界观修改→冲突报告            │ │
│  │  示例：设定"这个世界没有魔法"但生成内容出现魔法                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  P2 · 基础设定 (BASIC_SETTINGS)          优先级: 中 (50)                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  定义：角色基础属性（姓名/性别/年龄/外貌等）、基础场景设定              │ │
│  │  检测时机：写入时                                                      │ │
│  │  处理策略：检测到不一致 → 提示，可忽略                                  │ │
│  │  示例：角色"小明"在第1章设定为黑发，第10章写成金发                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  P3 · 未锁定正文 (UNLOCKED_CONTENT)      优先级: 低 (20)                 │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  定义：未锁定的章节内容（可以被后续章节覆盖）                           │ │
│  │  检测时机：写入时（作为参考）                                           │ │
│  │  处理策略：检测到冲突 → 列为"潜在矛盾"，不强制修正                      │ │
│  │  示例：第2章（未锁定）提到A事件发生在周一，第4章写A事件在周三           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 冲突检测算法

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Set

class ConflictPriority(Enum):
    P0_LOCKED = 100      # 锁定正文
    P1_WORLD_RULE = 80   # 世界观
    P2_BASIC_SETTING = 50 # 基础设定
    P3_UNLOCKED = 20     # 未锁定正文

@dataclass
class Conflict:
    """冲突记录"""
    conflict_id: str
    priority: ConflictPriority
    source_type: str          # 冲突来源类型
    source_ref: str           # 来源引用（章节ID/世界观文档ID）
    target_ref: str           # 目标引用（新生成的内容）
    description: str          # 人类可读的冲突描述
    suggestion: str           # 修正建议
    auto_resolvable: bool     # 是否可自动解决
    detected_by: str          # rule_based | llm_based | hybrid
    created_at: str

class ConflictDetector:
    """
    四级冲突检测引擎
    
    检测策略：
    1. 规则引擎 → 快速检测明确违反（P0/P1/P2）
    2. LLM检测 → 检测语义层面的隐含矛盾（P1/P2/P3）
    3. 交叉验证 → 规则+LLM双重确认
    """
    
    def __init__(self, rag_engine, state_engine):
        self.rag = rag_engine
        self.state = state_engine
    
    async def check_realtime(self,
                             generated_text: str,
                             character_states: Dict[str, CharacterStateSnapshot],
                             world_rules: List[dict],
                             active_foreshadows: List[dict]) -> List[Conflict]:
        """
        实时冲突检测（写作中Phase 2调用）
        
        轻量级，聚焦P0/P1，延迟<500ms
        """
        conflicts = []
        
        # ── P0: 锁定正文冲突 ──
        conflicts.extend(
            self._check_locked_content(generated_text, character_states)
        )
        
        # ── P1: 世界观规则违反 ──
        conflicts.extend(
            self._check_world_rules(generated_text, world_rules)
        )
        
        # ── P2: 角色基础属性 ──
        conflicts.extend(
            self._check_basic_settings(generated_text, character_states)
        )
        
        return conflicts
    
    async def check_deep(self,
                         chapter_id: str,
                         generated_text: str,
                         new_snapshots: List[CharacterStateSnapshot]) -> List[Conflict]:
        """
        深度冲突检测（完稿后Phase 3调用）
        
        全面检测，可接受2-5秒延迟
        """
        conflicts = []
        
        # ── 全库检索交叉验证 ──
        # 检索所有相关角色历史行为
        for snapshot in new_snapshots:
            history = await self.rag.search(
                query=f"{snapshot.character_id} 角色行为",
                scene="consistency_check",
                top_k=15,
            )
            
            # LLM辅助分析：新内容是否与历史行为一致
            llm_conflicts = await self._llm_consistency_check(
                character_id=snapshot.character_id,
                new_content=generated_text,
                history=history,
                new_states=snapshot.states,
            )
            conflicts.extend(llm_conflicts)
        
        # ── 伏笔一致性 ──
        conflicts.extend(
            await self._check_foreshadow_consistency(chapter_id, generated_text)
        )
        
        # ── 跨角色关系一致性 ──
        conflicts.extend(
            await self._check_cross_character_consistency(new_snapshots)
        )
        
        return conflicts
    
    # ─── P0 检测 ───
    
    def _check_locked_content(self, 
                               generated_text: str,
                               character_states: dict) -> List[Conflict]:
        """
        P0: 锁定正文冲突检测
        
        策略：RAG检索锁定内容中的角色状态，与新生成内容比对
        """
        conflicts = []
        
        for char_id, state in character_states.items():
            # 检索该角色在锁定章节中的行为记录
            locked_records = self.rag.search(
                query=f"角色 {char_id} 相关",
                filters={"locked": True, "characters": char_id},
                top_k=5,
            )
            
            for record in locked_records:
                # 规则检查：新内容是否与锁定记录的明确事实矛盾
                # 例如：锁定记录说"小明在北京"，新内容说"小明在纽约"
                contradictions = self._find_factual_contradictions(
                    record.text, generated_text
                )
                
                for c in contradictions:
                    conflicts.append(Conflict(
                        conflict_id=generate_uuid(),
                        priority=ConflictPriority.P0_LOCKED,
                        source_type="locked_content",
                        source_ref=record.chunk_id,
                        target_ref="current_generation",
                        description=c.description,
                        suggestion=c.suggestion,
                        auto_resolvable=False,  # P0不可自动解决
                        detected_by="rule_based",
                        created_at=datetime.now().isoformat(),
                    ))
        
        return conflicts
    
    # ─── P1 检测 ───
    
    def _check_world_rules(self, 
                            generated_text: str,
                            world_rules: List[dict]) -> List[Conflict]:
        """
        P1: 世界观规则违反检测
        
        策略：对每条活跃的世界观规则，用关键词匹配+LLM语义判断是否违反
        """
        conflicts = []
        
        for rule in world_rules:
            # 关键词快速匹配
            if self._keyword_match(generated_text, rule["keywords"]):
                # LLM精确判断
                is_violation, reason = self._llm_check_rule_violation(
                    generated_text, rule
                )
                
                if is_violation:
                    conflicts.append(Conflict(
                        conflict_id=generate_uuid(),
                        priority=ConflictPriority.P1_WORLD_RULE,
                        source_type="world_rule",
                        source_ref=rule["id"],
                        target_ref="current_generation",
                        description=f"违反世界观规则 '{rule['name']}': {reason}",
                        suggestion=f"建议按规则修正: {rule['description']}",
                        auto_resolvable=False,
                        detected_by="hybrid",
                        created_at=datetime.now().isoformat(),
                    ))
        
        return conflicts
    
    # ─── P2 检测 ───
    
    def _check_basic_settings(self,
                               generated_text: str,
                               character_states: dict) -> List[Conflict]:
        """
        P2: 基础设定冲突检测
        
        策略：提取生成内容中角色的描述性信息（外貌/姓名等），
              与角色档案中的基础设定比对
        """
        conflicts = []
        
        # 提取生成内容中的实体描述
        entities = self._extract_entity_descriptions(generated_text)
        
        for entity in entities:
            if entity.character_id in character_states:
                profile = self._get_character_profile(entity.character_id)
                
                # 比对基础属性
                for attr in ["appearance", "name", "gender"]:
                    if attr in entity.attributes and attr in profile:
                        if entity.attributes[attr] != profile[attr]:
                            conflicts.append(Conflict(
                                conflict_id=generate_uuid(),
                                priority=ConflictPriority.P2_BASIC_SETTING,
                                source_type="basic_setting",
                                source_ref=profile.id,
                                target_ref="current_generation",
                                description=f"角色 {profile['name']} 的 {attr} 不一致: "
                                           f"设定为{profile[attr]}, 生成为{entity.attributes[attr]}",
                                suggestion=f"请确认 {attr} 是否发生变更，或修正生成内容",
                                auto_resolvable=True,  # P2可自动修正
                                detected_by="rule_based",
                                created_at=datetime.now().isoformat(),
                            ))
        
        return conflicts
    
    # ─── 辅助方法 ───
    
    def _find_factual_contradictions(self, 
                                      locked_text: str, 
                                      new_text: str) -> List[dict]:
        """
        事实矛盾检测
        
        使用：
        1. NER提取锁定文本中的关键事实
        2. NER提取新文本中的关键事实
        3. 比对同一实体的状态
        """
        locked_facts = self._extract_facts(locked_text)
        new_facts = self._extract_facts(new_text)
        
        contradictions = []
        for fact_id, locked in locked_facts.items():
            if fact_id in new_facts:
                new = new_facts[fact_id]
                if locked["value"] != new["value"]:
                    contradictions.append({
                        "description": f"'{fact_id}' 在锁定内容中为 '{locked['value']}', "
                                      f"新内容中为 '{new['value']}'",
                        "suggestion": f"保持与锁定内容一致: '{locked['value']}'",
                    })
        
        return contradictions
```

### 8.3 冲突检测触发时机

```python
class ConflictTrigger:
    """
    冲突检测的触发时机管理
    
    四种触发时机 + 对应的检测范围
    """
    
    TRIGGER_CONFIG = {
        "on_write": {  # 用户每次点击"生成"
            "priority": "realtime",  # 必须在2秒内完成
            "checks": ["P0_locked", "P1_world_rule", "P2_basic_setting"],
            "action": "warn_or_block",  # P0阻塞，P1/P2警告
            "async_deep_check": False,
        },
        "on_lock": {  # 用户锁定章节时
            "priority": "normal",
            "checks": ["P0_locked", "P1_world_rule"],
            "action": "full_report",
            "async_deep_check": False,
        },
        "on_world_change": {  # 世界观文档修改时
            "priority": "background",  # 可异步
            "checks": ["P0_locked", "P1_world_rule", "P2_basic_setting", "P3_unlocked"],
            "action": "full_report_with_impact",
            "async_deep_check": True,   # 全量扫描所有已写章节
            "estimated_duration": "5-60s",
        },
        "on_import": {  # 导入外部文档时
            "priority": "normal",
            "checks": ["P1_world_rule", "P2_basic_setting"],
            "action": "report_and_confirm",
            "async_deep_check": False,
        },
    }
    
    def get_detection_scope(self, trigger: str) -> DetectionScope:
        """根据触发时机确定检测范围"""
        config = self.TRIGGER_CONFIG[trigger]
        return DetectionScope(
            checks=config["checks"],
            timeout_ms=2000 if config["priority"] == "realtime" else 30000,
            async_allowed=config["async_deep_check"],
        )
```

### 8.4 冲突解决策略

```python
class ConflictResolver:
    """
    冲突解决引擎
    
    解决策略优先级：
    1. 锁定正文永远优先（P0不可被任何内容覆盖）
    2. 世界观规则优先于基础设定
    3. 显式设定优先于隐含推导
    """
    
    RESOLUTION_RULES = {
        # P0冲突：必须人工处理
        ConflictPriority.P0_LOCKED: {
            "auto_resolve": False,
            "user_action_required": True,
            "options": [
                "keep_locked",       # 保持锁定内容，回退生成
                "unlock_and_accept", # 解锁旧内容，接受新内容
                "manual_edit",       # 手动编辑新内容
            ]
        },
        # P1冲突：强烈建议修正，但可覆盖
        ConflictPriority.P1_WORLD_RULE: {
            "auto_resolve": False,
            "user_action_required": True,
            "options": [
                "fix_generation",     # 按规则修正生成内容
                "update_rule",        # 更新世界观规则（这是一个世界观演变）
                "add_exception",      # 添加规则例外
                "ignore",             # 忽略（不推荐）
            ]
        },
        # P2冲突：可自动修正
        ConflictPriority.P2_BASIC_SETTING: {
            "auto_resolve": True,
            "auto_strategy": "prefer_setting",  # 优先遵循设定
            "options": [
                "auto_fix_to_setting",  # 自动修正为设定值
                "update_setting",       # 更新设定（角色外貌变化等）
                "ignore",
            ]
        },
        # P3冲突：仅记录
        ConflictPriority.P3_UNLOCKED: {
            "auto_resolve": True,
            "auto_strategy": "log_only",  # 仅记录，不修正
            "options": [
                "log",     # 记录潜在矛盾
                "resolve", # 手动标记解决
            ]
        },
    }
    
    async def resolve(self, 
                      conflict: Conflict,
                      resolution_choice: str) -> ResolutionResult:
        """执行冲突解决"""
        
        rules = self.RESOLUTION_RULES[conflict.priority]
        
        if resolution_choice == "auto_fix_to_setting":
            # 自动修正：用设定值替换生成内容
            return await self._auto_fix(conflict)
        
        elif resolution_choice == "keep_locked":
            # 回退生成内容，保留锁定版本
            return await self._revert_to_locked(conflict)
        
        elif resolution_choice == "update_rule":
            # 更新世界观规则（规则演变）
            return await self._update_world_rule(conflict)
        
        elif resolution_choice == "log":
            # 仅记录
            return ResolutionResult(
                conflict=conflict,
                action="logged",
                status="unresolved",
            )
        
        # ...
        return ResolutionResult(conflict=conflict, action=resolution_choice)
```

---

## 附录A: 项目文件结构建议

```
src/
├── rag/                          # RAG引擎
│   ├── __init__.py
│   ├── chunker.py                # 智能分块器
│   ├── embedder.py               # 向量嵌入
│   ├── retriever.py              # 混合检索器
│   ├── reranker.py               # Cross-Encoder重排序
│   ├── context_injector.py       # 上下文注入器
│   └── incremental.py            # 增量更新
│
├── state/                        # 状态引擎
│   ├── __init__.py
│   ├── dimensions.py             # 24维定义
│   ├── snapshot.py               # 快照管理
│   ├── update_engine.py          # 状态更新规则
│   └── consistency.py            # 一致性检查
│
├── routing/                      # 模型路由
│   ├── __init__.py
│   ├── registry.py               # 模型注册表
│   ├── router.py                 # 路由引擎
│   ├── migrator.py               # 状态迁移器
│   └── cost_tracker.py           # 成本追踪
│
├── conflict/                     # 冲突检测
│   ├── __init__.py
│   ├── detector.py               # 冲突检测主引擎
│   ├── resolver.py               # 冲突解决器
│   └── trigger.py                # 触发时机管理
│
├── persistence/                  # 持久化
│   ├── __init__.py
│   ├── memory_cache.py           # L1 内存缓存
│   ├── sqlite_store.py           # L2 SQLite
│   ├── wal_manager.py            # L3 WAL日志
│   └── recovery.py               # 崩溃恢复
│
└── orchestration/                # 编排
    ├── __init__.py
    ├── write_loop.py             # 三段式创作闭环
    └── transaction.py            # 事务性回写
```

## 附录B: API接口设计

```python
# ── 核心API ──

# 1. 写作生成API
POST /api/v1/write/generate
{
    "project_id": "proj_xxx",
    "chapter_id": "ch_xxx",
    "instruction": "写一段小明与小红在茶馆相遇的场景",
    "writing_stage": "drafting",       # planning|outlining|drafting|key_scene|transition|revision|polish
    "force_model": null,               # 可选：强制指定模型
    "options": {
        "auto_consistency_check": true,
        "max_retries": 3,
    }
}
Response:
{
    "generated_text": "...",
    "model_used": "claude-3.5-sonnet",
    "token_usage": {"input": 3500, "output": 800},
    "conflicts_found": [],
    "state_changes": [
        {"character": "小明", "dimension": "location", "old": "城西", "new": "茶馆"}
    ],
    "foreshadow_updates": []
}

# 2. 章节完成确认API
POST /api/v1/write/chapter/{chapter_id}/finalize
Response:
{
    "status": "committed",
    "consistency_issues": [...],
    "state_snapshots_created": 5,
    "vector_chunks_indexed": 23,
}

# 3. RAG检索API
POST /api/v1/rag/search
{
    "query": "小明与小红的关系",
    "scene": "character_query",
    "top_k": 10,
    "filters": {
        "characters": ["char_xiaoming", "char_xiaohong"],
        "doc_type": ["chapter", "character_profile"],
        "priority": ["P0", "P1"]
    }
}

# 4. 状态快照查询API
GET /api/v1/state/characters/{character_id}/snapshots?limit=10

# 5. 冲突列表API
GET /api/v1/conflicts?project_id=xxx&status=unresolved&priority=P0,P1

# 6. 冲突解决API
POST /api/v1/conflicts/{conflict_id}/resolve
{
    "resolution": "fix_generation",
    "notes": "用户手动确认"
}

# 7. 模型使用统计API
GET /api/v1/cost/report?project_id=xxx&period=monthly
```

---

> **文档结束** | 版本 v1.0 | 2025-06-06  
> 本文档为AI写作平台 RAG引擎与状态管理技术方案的完整设计。  
> 涵盖8大核心模块的架构设计、数据库Schema、API接口定义和关键代码实现思路。
