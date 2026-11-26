# Beta 14-B · 旧笔记直入、向量分流与单轮导入

本手册优先于旧版首次导入操作说明。仅用于独立个人测试库，production_approved=false。不是已经签名的公开升级资产。

## 给新手 AI：如何决定导入方式

1. 先确认用户提供的文件、数据范围及一次批次授权。优先复用已有分类，不要让人类逐条整理。必须区分历史聊天与 AI 自己保存的笔记，不把笔记冒充人类原话；源记录保持原始内容和来源。原话归档不需要模型。
2. 旧笔记有明确的类别、完整的 D9 payload、真实作者和记录时间时，在新的 JSONL 文件中逐条转换为 `everlight.historical-note.v1`。不得编造日期、来源、身份、验证结果或补齐未知事实。原文件保留。不能确认分类或必填字段时，直接保留原笔记文本，不强制填写。已导入的笔记不需要重新写入。
3. 选择模式：只保存原话用 `--raw-only`；已有结构化笔记且不要语言模型用 `--local-notes`；需要给未分类内容生成候选标签时，使用 `--local-notes --vector-classify --config ...`；需要对剩余非结构化内容进行正式语义提取时，用 `--allow-model`。普通模式默认无第二轮模型复核，严格复核须明确选择 `--strict-review`。
4. 本地程序使用原 D9 合同和 `POST /api/v8/import/historical-commit` 的机器准入；不会制造人工/AI审核票。当前只允许符合条件的历史 S04/S05/S06/S08 自动正式提交。其他类型按现有规则保存候选或仅保留来源。原话、源笔记与分类结果分开保存；任务、身份、关系不能被历史材料直接激活。不要把向量相似度解释为真实性。
5. 查报告后再决定是否值得调用语言模型。对于失败或未归类项，保留原话及候选标签。无需人类逐条批准；AI 在授权范围内后续整理。不得声称所有内容都已正式入库或已可语义召回。

## 明确的旧笔记记录格式（JSONL 每行一个对象）

```json
{"format":"everlight.historical-note.v1","id":"note-001","actor":"ai","conversation_id":"notes-archive","happened_at":"2025-01-01T01:00:00Z","slot":"S06","kind":"procedure","payload":{"template_version":"everlight.write.d7","contract_version":"everlight.write.d9","category":"troubleshooting","problem":"缓存修复","solution":"清理本机临时目录","environment":"本机","verification":"untested","verification_detail":null}}
```

示例为虚构测试记录，不是应该写入任何真实库的事实。完整字段及合法枚举以《02_十二库写入字典.md》和运行时合同为准。该格式仅声明已有类别，不证明内容真实；机器准入仍进行本地证据检查。源笔记序列化保存，保留其原有字段；不等于聊天原话。已有普通文本笔记不强行转换成新格式，除非 AI 能据原文件准确填写。

## 已启动独立试用服务时的命令

```sh
npm run beta:easy-import -- "旧笔记.jsonl" --confirm-history --local-notes
npm run beta:easy-import -- "混合记录.jsonl" --confirm-history --allow-model --config "配置.json"
npm run beta:easy-import -- "混合记录.jsonl" --confirm-history --local-notes --vector-classify --config "向量配置.json"
```

第三条为离线向量文件方式；如使用已授权的外部 Embedding，额外加 `--allow-embedding`。向量配置使用 `converter/config.example.json` 的 embedding 字段：`type` 为 `openai-compatible` 或 `offline-vectors`，指定模型 ID、dimensions、batchSize、revision；外部地址和密钥通过 `urlEnv`/`apiKeyEnv` 对应的本地环境变量传递，离线文件通过 `vectorFile` 提供，需包含与分类原型及输入文本完全匹配的 SHA-256、模型、维度和版本。不发送密钥给用户或其他 AI。禁止把本地词法特征当成真实稠密语义模型。

混合模式会自动识别显式结构化笔记，仅剩余未分类的主记录送语言模型；上下文允许的情况下仍会含有附近非结构化记录。`--vector-classify` 可以在这一模式加用，向量标签先提供给语言模型作为候选，不能自动生成事实。明确标记为私密/虚构的结构化笔记不会被送往分类模型；仅向量模式对明确标记的私密/虚构输入也跳过向量请求。不得上传未经授权的数据；本版尚无完整敏感数据自动识别。

## AI 自动部署入口

```sh
npm run beta:ai-deploy -- --input "旧笔记.jsonl" --local-notes
npm run beta:ai-deploy -- --input "旧笔记.jsonl" --local-notes --apply --confirm-history
```

第一条仅预检计划，第二条需要一次真实授权，自动初始化、临时启动、导入和结束服务。已有网关的试用库不使用该临时启动路径；已启动独立试用服务时采用前述 easy-import。外部向量与模型配置仅在授权后使用，不默认付费。

## 结果与断点

`trial-beta/imports/<指纹>/bootstrap-report.json`：原话记录、候选及正式提交数、`classification_routes`（local 含无法通过合同的显式笔记、model 为送入语言模型的主记录、vector_only 为仅生成向量候选标签、unrouted 为未路由）、`classification_usage`（成功分类响应报告的 tokens 与报告用量的 chunk 数，不含失败重试、Embedding 和严格复核费用）。`budget.jsonl` 记录语言模型预算；Embedding 有独立请求字节账本。向量候选标签保存在 `exports/<generation>/everlight-classified-v2.jsonl` 的 `vector_hints`，还没有成为 CRSI 生产向量索引。重复相同输入和配置可复用有效分类结果；相同源记录在本地和混合模式之间不重复入库。跨文件/跨导出顺序的去重尚未完成。14-A 的旧工作目录不能直接作为新分类算法的断点，使用新的工作目录；不要删除旧报告、数据库或锁，不要未经授权重做已完成的批次。

现阶段仍待真实中文语料校准、自由文本的向量优先准确率验证、历史原话独立向量召回、扩大自动正式提交范围、全量费用预览、签名升级与真实宿主联调。无需为这些尚未完成的功能绕过当前门禁。
