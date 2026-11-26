# Beta 14-D 导入成本、自动提交与维护说明

## AI 部署者先读
对外测试线从 Beta13 升级到 Beta14-D 候选，家庭内部版本不参与。本次仍为预发行，禁止未经授权覆盖现有数据库。先读 AGENTS.md 与十二库写入字典。默认不做第二轮模型复核，不伪造审核票。已授权的历史批次使用专用机器校验准入；日常写入、梦境修订不变。

1. 备份；确认历史数据来源、权限、私密标记、时间与身份，保留原文件。
2. 免费预览：`npm run beta:import-preview -- "聊天.jsonl" --mode hybrid --config 配置.json`。也支持 `--mode raw` 和 `--mode local`。预览不发模型请求、不写记忆库；预算估计采用 UTF-8 字节与输出上限，未包含全部可选路径、重试、真实账单。需要向量预览时加 `--vector-classify --index-history-vectors`，与实际配置对应。
3. 免费原话归档：`npm run beta:easy-import -- "聊天.jsonl" --confirm-history --raw-only`。旧 D9 格式笔记：`npm run beta:easy-import -- "笔记.jsonl" --confirm-history --local-notes`。这两种不加向量参数时不需要付费模型。
4. 复杂原话：`npm run beta:easy-import -- "聊天.jsonl" --confirm-history --allow-model --config 配置.json`。默认一次分类流程，不自动独立复核；严格模式 `--strict-review` 可选并额外计费。向量服务须另有授权：按需加 `--allow-embedding --vector-classify --index-history-vectors`。旧结构化笔记直入，普通自由文本只产生候选或调用单轮语义分类；向量相似度不能证实事实。不得为候选补造原话或时间。
5. 配置以 converter/config.example.json 为模板另存本机文件，环境变量填写服务端点、密钥、模型，绝不写入公开仓库。稠密向量配置 `embedding.type=openai-compatible`，`urlEnv`、`apiKeyEnv`、`model`、`dimensions`、`batchSize` 与服务相符；同模型及文本复用缓存。不要擅自换维度或向量模型。真实百炼未实测。

## 金额限额（可选，付费导入建议配置）
在上述配置的顶层增加 `spending` 对象。例如（下列价格是演示，不是任何提供商报价）：
```json
{"currency":"CNY","maxCost":5,"inputPerMillion":2,"outputPerMillion":8,"embeddingPerMillion":0.5}
```
请由 AI 核对真实提供商价格及计费口径，并获得总预算授权。费用账本为当前标准安装的 `trial-beta/import-budget/import-spending.sqlite`，同币种跨批次累积；调整上限不清空历史消耗，不删除账本，不伪造 usage。请求发出前预留金额，收到可信 usage 后结算，缺 usage 保留预留额。重试也计费。若实报费用超过预留，后续请求会阻断；由于供应商可能收取额外费用，本机制不能保证账单绝不超限，请同时设置服务端硬限额。未配置 spending 时只有既有 Token/字节预算。部分失败保留原话及已有合法结果；补充授权后按相同输入和配置继续，避免删除工作目录。14C 到 14D 的计划格式变化可能需要重新构建计划，已提交相同证据与 payload 会尽量复用，不保证跨版本旧分类完全零调用。

## 接口与写入
- `/api/v8/import/historical-proposal`：仅可信历史导入授权，沿用 D9 结构化提交体，按同一不可变证据及规范化 payload 复用提案，不跨身份/来源误合并；撤回证据不得复活。具体请求和角色由 `core/historical-proposal-beta14d.mjs`、`converter/src/bootstrap.mjs` 及测试定义，使用附带转换器，不绕过验证直接写 SQLite。
- `/api/v8/import/historical-commit`：机器校验入库；S04/S05/S06/S08 延续原范围，新增明确旧结构化 S11（仅 guess）与 S12（仅 received/referenced，不声称已读）。S03/S07/S09 及其他不确定内容保留候选，不擅自激活。
- 历史向量接口同第七章；宿主可使用 `searchHistoricalVectorEvidence` 显式查候选。自动 CRSI 仍以唯一精确线索补查为主，未将任意向量结果直接注入。100000 条扫描上限，返回 partial 时不可声称完整搜索；不是 ANN。合成 32 维测试不代表真实 1024 维性能或语义准确率。
- 面板 `/imports`（导入进度），认证读取 `/ui/api/v1/imports/status`，刷新可显示近批次阶段/计数及累计费用估计，不暴露原话、路径、密钥。只读，不会从按钮直接触发付费请求。由 AI 执行导入。
- 私密、敏感、虚构、角色扮演明确标记内容保留原话，但不发往首次导入分类/向量服务；没有标记不代表自动脱敏，必须先确认资料授权。撤回索引授权阻断后续查询，旧缓存清理仍需手动维护。

## 发行与升级
必须经过正式签名、权利确认及真实宿主联调再发布。Beta13 老解包器漏掉 LICENSE.txt；不能假定点一次旧版更新按钮就能安装此包。先用可信公钥独立验签并核对兼容版本和完整压缩包，再在隔离目录使用已验签的新安装器桥接，保持旧版受管文件哈希不变。停止所有写入，完整备份，验证恢复；不要直接替换旧版 extractor 或改写哈希清单来绕过。D 负责现场验证并确定过渡发布方案。标准非 git 安装才可用现有升级器。新装可直接采用独立包，正式发行地址仍由 D 配置。
