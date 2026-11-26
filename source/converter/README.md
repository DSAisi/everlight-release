# 长明十二库 · 100,000 条批处理器

面向最多 **100,000 条**原始对话的离线编排器。它不替代长明正式写入链路，也不会伪造 S02/S10 回执；输出是待审核候选。

## 为什么不用旧网页直接跑

旧网页工作台适合小样本人工核对，会把记录保存在浏览器内存并反复渲染列表。十万条必须使用本包的流式读取、独立分块、原子落盘和断点续跑。

## 固定流程

```bash
cp config.example.json config.json
# 修改 input、字段映射与模型环境变量名称

node src/cli.mjs prepare --config config.json
node src/cli.mjs calibrate --config config.json
node src/cli.mjs verify --config config.json --mode calibration

# 人类/承影实际检查跨时间段 1000 条结果后才执行；note 不可写“未检查”
node src/cli.mjs approve-calibration --config config.json \
  --reviewer "承影" --note "已核对人物、时间、旧状态、分库与无候选记录"

node src/cli.mjs run --config config.json
node src/cli.mjs verify --config config.json
node src/cli.mjs merge --config config.json
```

## 精确行为

- 输入支持 JSONL、顶层 JSON 数组和每行一条的 TXT；JSON 数组由流式解析器读取，不整体载入内存。
- 硬上限固定为 100,000 条，配置也不能调高；第 100,001 条立即拒绝，预处理临时文件随即删除，不留下可误用的半成品。
- 默认每块最多 80 条主记录，同时受 24,000 字符预算约束；前后各 5 条同会话上下文。语音转文字等长消息会自动缩小分块，上下文只帮助理解，禁止生成候选。
- 默认并发 8，硬上限 12；每块独立原子写入。重新执行 `run` 会验证并跳过已完成块。
- 每块最多重试 3 次，指数退避；失败块写入 `failed/`，不会拖垮其他块。
- 校准样本从最多 10 个时间区段抽取连续窗口，共 1,000 条；没有与当前提示词哈希匹配的人工批准，全量运行硬拒绝。
- 每个主 `source_id` 必须且只能返回一次；未知 ID、重叠上下文 ID、重复 ID、缺项和非法库均拒绝。
- 每个库的候选载荷有必填字段合同；`classified` 必须有候选，`no_candidate/needs_review` 必须没有候选，禁止“状态与内容对不上”。
- S01 原文保存在 `normalized.jsonl`；模型只能给 S03–S09、S11–S12 生成候选。S02/S10 系统专用。
- 相同文字在不同消息中不会合并；同一消息的块结果可幂等复用。
- 合并前要求所有块齐全且通过结构验证，最终输出 JSONL 和带 SHA-256 的清单。

## 模型连接

默认使用 OpenAI-compatible `chat/completions` JSON 接口：

```bash
export EVERLIGHT_API_URL="https://example.invalid/v1/chat/completions"
export EVERLIGHT_API_KEY="..."
export EVERLIGHT_MODEL="..."
```

密钥只放环境变量，不写入配置和结果。若宿主接口字段不同，只替换 `classifyChunk()` 适配层，不改分块、门禁和校验逻辑。

## 时间语义

分类提示明确要求：旧记录仍是旧记录，`happened_at` 与导入时间分开；过去的计划、情绪、关系状态不得自动当成当前进展。模型拿不准时必须返回 `needs_review`。

## 产物

```text
work/
  normalized.jsonl
  plan.json
  chunks/*.json
  results/*.json
  failed/*.json
  state.jsonl
  calibration/sample.jsonl
  calibration/chunks/*.json
  calibration/results/*.json
  calibration/approved.json
  everlight-classified-v2.jsonl
  merge-manifest.json
```

`everlight-classified-v2.jsonl` 仍是候选结果，后续必须绑定可信来源、权限和审核，再走 proposal → review → commit → readback。

## 验收

```bash
npm test
npm run test:100k
```

第二条命令会真实生成并流式预处理 100,000 条合成记录，断言首条、末条、总数与 1,250 个主分块均准确；它不调用模型、不产生费用。

十万条短消息在 80 条/块时是 1,250 个全量请求，另有约 13 个校准请求。实际耗时不写死，按 `ceil(实际分块数 / 有效并发) × 模型单块耗时` 估算；若模型单块中位耗时为 10/20/30 秒、有效并发为 8，则纯请求时间约为 26/52/79 分钟，限流与重试另计。

## RC5 预算与运行锁
真实模型必须配置 budget.maxTokens（校准与全量共享）；请求前按 UTF-8 字节数、1024 framing allowance 与 maxOutputTokens 预留。供应商实际 usage 可调整预留；未知用量保留。此为本地估算额度，不保证供应商实际费用上限。429 只降低本轮后续并发，不取消已发请求，不自动升档。异常退出后 run.lock 可能残留，确认没有运行进程后才可手动删除；不要删除 budget.jsonl。账本损坏时停止并人工核对。mock 不计费。

## RC6 完整性门禁
配置指纹升级，旧工作目录需重新准备。校准批准绑定校准分块和结果的摘要；变更后拒绝全量运行。合并核对计划总数及原始来源集合。JSON 数组拒绝空元素、尾逗号和尾部垃圾。结构化消息内容保留 JSON 表达。仍需真实模型及 RC6 HTTP 联调，不可直接生产入库。

## RC7 导出路径（覆盖旧版说明）
读取 work/exports/CURRENT.json 的 generation，再读取 exports/<generation>/ 下的 normalized.jsonl、everlight-classified-v2.jsonl、association-review.json、merge-manifest.json。旧代保留。仅发布指针所指代；忽略 staging 目录。未完成真实断电持久性验证。

## RC8
`node src/cli.mjs status --config config.json` 查询文件级进度（不等于结果验证）。并发遇到429降级，连续8块成功后逐级恢复至初始 worker 数。尚未进行真实供应商限流专项测试。

## RC9 本地操作界面
复制并配置 config.json 后，运行 `npm run ui`，浏览器打开 http://127.0.0.1:8765 。仅绑定回环地址；不要公网暴露。按钮调用真实 CLI，校准仍需人工查看结果文件。界面暂不支持上传、编辑配置或逐条审核。HTTP 冒烟已执行，未做真实浏览器验收。

RC10: 本地候选分页、原话证据查看、接受/拒绝/暂缓记录。审核不等于入库。仍未完成真实模型及核心接口联调。

RC11: submit-trial requires trial scope, explicit --confirm-isolated-trial, loopback EVERLIGHT_TRIAL_URL, EVERLIGHT_CORE_TOKEN and EVERLIGHT_SHARED_HOST_TOKEN. Only locally accepted candidates are submitted as pending proposals; no review or commit. Live integration not yet verified.

## RC12
真实 RC6 隔离 HTTP 联调：RC6_CORE_DIR=/absolute/path/to/rc6 npm run test:rc6。使用临时数据库、随机凭据、固定测试端口 18973（须空闲）。验证重复提交、审核门禁及零正式记忆。仅合成单候选，未验证真实模型或十万条接口提交。

### RC13 本地文件导入
先复制 config.example.json 为 config.json，配置模型及工作目录，再运行 npm run ui。选择本地文件并点击导入，成功后点击准备。上传上限 512 MiB（压缩文件按上传字节计），准备阶段仍执行十万条限制。已有 plan.json 时拒绝导入；新任务使用新工作目录。文件保存在配置目录 imports 下，不自动删除。当前仅支持 JSON、JSONL、TXT 及其 GZ；CSV 未支持。仅绑定本机回环地址。不要与外部 CLI 同时操作同一工作目录。

### RC14 CSV 导入
支持 UTF-8 CSV/CSV.GZ，首行为唯一非空字段名，字段映射沿用 fieldMap。支持引号内换行、逗号及双引号转义；列数不一致或引号错误时拒绝。保留上传文件原始字节。未进行真实模型或浏览器端到端验收。

## RC15
Cross-conversation exact-name review hints (not semantic identity resolution); task reports sorted by known message time, never inferred current. Classification prompt distinguishes event and message time, quotations and plans. Configuration fingerprint changed: prepare a fresh work directory.

## RC16
`association-review.json` 增加 `semantic_review`：本地中文二元字组及英文词项检索，同 kind 候选产生带原话证据的未确认关联。默认每个起始候选最多五条建议，忽略超过200条候选的高频词项。不是向量语义理解，不自动合并、不推断当前状态。真实模型与浏览器验收尚未完成。

## RC17 可选 Embedding
默认 `embedding.type=lexical`，不请求向量 API。启用时改为 `openai-compatible`，设置 `allowExternalProcessing=true`（候选内容将发送给配置的服务），环境变量 `EVERLIGHT_EMBEDDING_URL` 填完整 embeddings endpoint，百炼兼容接口示例 `https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings`；`EVERLIGHT_EMBEDDING_KEY` 填密钥。模型、维度必须与实际服务一致，示例 text-embedding-v3 / 1024 未经真实百炼验证。merge 时生成 embedding_review，原有 lexical 建议保留。缓存按 URL、模型、维度、revision 隔离；切换模型版本请修改 revision。maxInputBytes 是每个缓存命名空间累计请求输入字节预算，不是实际费用或 token 上限。默认每批10条、10000000字节预算、近似检索8组12位签名、每桶最多256条、每候选最多5条建议。失败停止导出，已有成功缓存可复用。缓存含私人派生数据，应保护工作目录。尚未接入既有8933向量协议、BM25融合排序或AI二次判断；本地模式仍是词项检索而非神经向量。测试使用本地模拟 HTTP 服务，十万条测试未开启向量。

### RC18 混合排序
导出 association-review.json 新增 fused_review，使用 RRF 融合现有词项检索和可选向量检索，默认 k=60，每个候选最多五条有向建议。保留原始检索结果，不自动合并或确认当前状态。现有词项检索不是 BM25。

## RC19
BM25 payload-value retrieval, kind-scoped index, k1=1.2, b=0.75, posting cap 200. RRF retained. 24 tests passed; mock 100k 9289 ms. No live provider or core retest.

## RC20 semantic judgment
Set judgment.enabled=true and allowExternalProcessing=true to enable evidence-based pair review using the configured chat model. Default maxPairs=1000 per export; remaining pairs are reported. Cached results share the existing token ledger. Results are advisory only.

### RC21 history review
Export adds history_review with pairwise evidence, message times, unknown effective time and no inferred current state. One-sided evidence is flagged. No automatic version-chain merge.

## RC22
Export association-review.json now includes history_groups: connected pending-review state-change edges with original evidence. No inferred effective ordering or current state.

### RC23 历史顺序确认（程序接口）
`saveHistoryReview(work, {generation, group_index, order, identity_confirmed:true, reviewer, note})` 从 `src/review.mjs` 导入。order 为全部候选 ID 的人工确认顺序；相邻候选必须有直接状态变化证据。结果写入独立 history-reviews 目录，绑定导出版本及关联文件指纹。不推断有效日期或当前状态，不提交核心。尚未接入浏览器界面。

RC24: 面板历史版本确认区加载历史组，按编号填写相对顺序，勾选同主体确认，填写审核人及说明后保存。仅本地确认，不入库。

### RC25 离线向量复用
配置 `embedding.type=offline-vectors`、`vectorFile`、`model`、`dimensions`、`revision`（默认字符串 `1`）。文件格式：`{"model":"模型名","dimensions":1024,"revision":"1","entries":[{"text_sha256":"64位小写SHA256","embedding":[...]}]}`。哈希输入为 UTF-8 `JSON.stringify([candidate.kind,candidate.payload])`。必须覆盖全部候选，模型、维度、版本一致；缺失或重复拒绝，不自动付费补齐。原话向量不能直接冒充候选向量。文件整体载入内存，尚未验证十万候选向量规模。8933 服务实际协议未知，未连接。RC6 内置 vector/store.mjs 是词项特征索引，不是稠密 embedding 导出服务。

### RC26 验收复验
- Node 22.16.0：34 项测试通过；真实隔离 RC6 HTTP 测试 1 项通过；十万条模拟全流程通过（8857 ms）。
- 浏览器复验脚本 `python test/browser-smoke.py` 需要 Python Playwright 和 Chromium，可通过 CHROMIUM_PATH 指定浏览器。本环境 Chromium 导航被管理员策略阻止，未完成浏览器验收，保留失败日志。
- 未调用真实模型、未连接生产服务；8933 私有协议仍待提供。
