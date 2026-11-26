# Beta 14-C：历史原话索引、跨文件复用与向量检索（研发预览）

## 新手 AI 的操作顺序
1. 只在独立测试目录升级代码；不要覆盖用户数据库。先停写、备份，验证可恢复。Beta 13 仍是发行基线，14-C 未签名，不走公开自动更新。
2. 阅读 AGENTS.md 和 01–06 手册。历史导入默认单轮分类及本地机器校验；不要给全部历史逐条调用复核模型。已有 D9 笔记可直接写入。向量相似度不是事实、身份或任务完成证据。
3. 若用户授权历史原话检索，先在私有 trial-beta/trial.env 设置 `EVERLIGHT_D14C2B_RAW=1`。如需允许正常召回时的精确历史补查，另设 `EVERLIGHT_D14C3_AUTO_RAW=1`、`EVERLIGHT_HISTORICAL_FALLBACK=1`。重启隔离 core 后验证。真实宿主需在已授权实际普通对话调用 recall 时传 `raw_evidence:true`，不可对所有会话强开。旧配置默认不索引、不浮现。
4. `npm run beta:easy-import -- "聊天.jsonl" --confirm-history --raw-only --index-history`：保存全部原话，仅给明确标记 `privacy: normal`、`context_kind: actual` 且有过去有效时间的普通记录建立授权索引。没有明确标记的原话继续保留但不索引。AI 可整理受信授权清单，不能猜测隐私标记或擅自覆盖原始证据。
5. 如用户同时授权外部 Embedding，在上一步添加 `--index-history-vectors --allow-embedding --config 配置.json`。配置示例见 converter/config.example.json，`embedding.type` 用 `openai-compatible`，设置 `urlEnv` 对应完整 `/embeddings` HTTPS 地址、`apiKeyEnv` 的密钥、`model`、`dimensions`、`revision`（模型实际变更时必须递增）、`batchSize`（1–32）、`maxInputBytes`。密钥放私有环境，不放仓库。离线向量配置 `offline-vectors`、`vectorFile`，文件须覆盖精确原话文本的 SHA-256，模型/维数/版本一致。外部服务须单独授权，即便不调用聊天模型也可能产生 Embedding 费用。只使用合成模拟服务验证，未验证百炼真实计费或准确率。
6. 检查 `bootstrap-report.json`：`new_sources` / `reused_sources` / `cross_file_reused_sources`；`historical_index.new_grants` / `held` / `vector_added` / `vector_reused` / `vector_provider`。索引状态 pending 不等于已建立索引；词法索引后台异步处理。向量写入已完成则可按 provider 查询。若模型或网络失败，原话仍保留；重新执行相同命令续跑，勿清理缓存或伪造成功。

## 向量缓存和去重
- 同一独立安装 `trial-beta/embedding-cache` 复用完全相同文本的 Embedding，隔离 scope、模型、地址、维度与版本。共享预算账本累计请求输入字节，超出 `maxInputBytes` 停止新请求，未实际发送的新文本不计成功。它不是精确 Token/货币预算。缓存锁防并发重复支出；若异常退出残留 provider.lock，确认无运行中的进程后才可清理锁，不清理账本。
- 旧 Beta14-B 缓存路径与命名空间不同，未自动迁移；离线向量直接从用户提供的文件读取。只有文本字节一致及相同 Embedding 身份才可复用；不同模型的向量不能混用。
- 跨文件原话去重要求明确且稳定的会话 ID、消息 ID、说话者、历史时间以及其余原始字段完全一致（除导入序号和生成的来源 ID）。缺少身份、内容/隐私元数据不同则分别保留。复用时使用原有来源 ID 与原始哈希。撤回来源不得通过导入复活。暂不对相似原话或跨批次结构化候选做语义合并，不能用向量相似度抹去不同经历。

## 接口合同（直接连接独立 core，不通过普通面板网关）
所有请求 `POST /api/v8/...`，JSON，`Authorization: Bearer <CORE_TOKEN>`、`x-everlight-host-token: <SHARED_HOST_TOKEN>`；两个管理写接口额外 `x-everlight-governance-token: <GOVERNANCE_ADMIN_TOKEN>`。绑定 scope=personal，原话索引开关开启。管理凭据不得放进模型提示词、客户端或公开面板。

| 路由 | JSON 顶层字段 | 说明 |
|---|---|---|
| source | scope, actor, kind, source_ref, body, source_id, historical_dedup（可选） | 历史精确复用返回真实 id、idempotent、deduplicated、source_hash |
| s01/historical-grants | scope,batch_id,items | 1–128 条；每条 id/hash/decision/reason，grant 另需 privacy=normal,context_kind=actual；撤回后默认不重新授权，治理方明确重新授权才可加 allow_regrant=true |
| s01/historical-vectors | scope,provider,dimensions,items | provider 为报告中的 64 位 SHA-256；1–16 条；每条 id/hash/text_sha256/embedding；实际原话及哈希校验；最多 4096 维 |
| s01/historical-vector-search | scope,provider,dimensions,embedding,limit（可选） | 宿主提供同模型查询向量，返回同域授权候选、历史时间、原话摘录；扫描上限 20000 条，partial=true 表示不完整 |
| s01/search | scope,query,limit,historicalOnly（可选） | BM25 词法搜索，支持历史限定 |
| s01/expand | scope,id,hash,offset,limit | 原话证据逐段展开，失效拒绝 |

`historical-vector-search` 是独立候选检索，不自动把所有语义相似记忆注入模型。宿主用匹配 Embedding 生成查询向量，先核对人物、时间、上下文，再按需通过 expand 读取。查询向量本身可能产生费用。自动 CRSI 当前只接通词法唯一精确补查（正式记忆无命中且相关线索唯一时），语义向量与结构化召回融合、语义自动浮现门禁、S10 向量实际传输读回、大规模 ANN 性能仍待完善。不能声称完整自然浮现已实现。

撤回索引授权后核心派生向量删除、旧词法召回读回失效。转换器本地共享缓存仍存在，需要专门的数据清除/保留策略；撤回不等于删除已备份历史原话或外部提供商的数据。

## 验收
使用 `node --test test/beta14c-historical-recall.test.mjs test/beta14c-vector-dedup.test.mjs converter/test/beta14c-cache.test.mjs converter/test/beta14c-live.test.mjs`；再跑全量核心、面板、转换器。真实 DSH 与其他宿主、百炼、十万条稠密向量性能、费用与召回质量尚未验收。production_approved=false。
