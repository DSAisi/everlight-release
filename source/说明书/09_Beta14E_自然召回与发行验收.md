# Beta14-E · 历史语义补查、质量与发行验收

## 1. 默认关闭，宿主一次授权后自动运行
保留原有 12 库必检、词法和结构化召回；没有可用的结构化、原话、连续性命中时才尝试历史稠密向量补查。独立证据请求、时序冲突、二次联想、关闭远程通道、原有召回降级时不启动。第二次选择有独立 S10 记录及首轮 probe run id，最终只有核验通过的请求才能交给上游。使用同一个索引模型的 provider identity（scope、完整 URL、model、dimensions、revision）；不复算历史原话。查询本身需要一次 embedding，运行时不属于首次导入账本。由管理员或可信私有宿主许可，禁止将共享/客户网关配置为私有。历史证据不等于当前事实；分数和差值未达标或扫描不完整时保持静默。未做真实模型校准前不要启用。

在隔离 trial.env 内设置：
```dotenv
EVERLIGHT_D14C2B_RAW=1
EVERLIGHT_D14C3_AUTO_RAW=1
EVERLIGHT_HISTORICAL_FALLBACK=1
EVERLIGHT_HISTORICAL_SEMANTIC=1
EVERLIGHT_HISTORICAL_EMBED_URL=http://127.0.0.1:1234/embeddings
EVERLIGHT_HISTORICAL_EMBED_MODEL=YOUR_MODEL
EVERLIGHT_HISTORICAL_EMBED_DIMENSIONS=1024
EVERLIGHT_HISTORICAL_EMBED_REVISION=1
# 下面两项必须根据独立校准集填写，不存在通用推荐阈值：
EVERLIGHT_HISTORICAL_EMBED_MIN_SCORE=YOUR_CALIBRATED_SCORE
EVERLIGHT_HISTORICAL_EMBED_MIN_MARGIN=YOUR_CALIBRATED_MARGIN
# 仅专用私有会话网关允许：
EVERLIGHT_HISTORICAL_GATEWAY_PRIVATE_OPT_IN=1
```
远程 HTTPS 需要额外 `EVERLIGHT_HISTORICAL_QUERY_EXTERNAL_OPT_IN=1`（代表允许查询正文传输，可能含隐私），凭据 `EVERLIGHT_HISTORICAL_EMBED_KEY` 仅写私人配置。查询费用使用独立服务商额度。自定义宿主使用既有 recall 的 `raw_evidence:true`（仅私有获授权轮次）及 readback，无新公开写接口。离线向量包须由相同模型和身份标识产生，当前 offline-vectors 文件身份不等于 runtime HTTP 身份，不自动复用。只在授权历史索引上扫描，撤回证据旧快照即失效。最多 100000 向量扫描，部分扫描不自动浮现；长原话首段截取及全链路内部事件、语义二次联想仍未完成。

## 2. 质量和成本实验
免费、零外部调用：`node converter/src/quality-beta14e.mjs converter/test/beta14e-labeled-fixture.json`。
30 条合成中文样本（9 类结构化记忆、3 条多标签），简单双字词重叠基线只用于对照，不代表产品完整 BM25 性能。真实质量实验用独立同意的盲标样本（JSON 数组：id,text,labels,external_ok），先分出开发/校准集和未见测试集；不以原型或训练样本作为测试集；记录来源版本、模型、维数、日期、价格、计费单位。人工或独立两位标注者确认多标签和冲突，去除重复、秘密、未授权样本；`external_ok:false` 永不外发。建议各类至少 100 条并增加否定、历史转折、同名和多义案例。标签仅用于本地评估。
真实对照：`node converter/src/quality-beta14e.mjs labeled.json private-config.json --embedding --llm`。配置沿用转换器 embedding、workDir、allowEmbeddingProcessing，另外 `allowQualityExternal:true`、独立 `spending`（真实供应商输入/输出/embedding 每百万 token 价格及金额上限）、`qualityLLM:{urlEnv,apiKeyEnv,model}`；URL 和密钥通过环境变量传递。外部调用使用可单独撤销的授权，不使用生产密钥。输出 top1/top3、覆盖率、每库统计、多标签召回率、相同可外发子集的词法基线及预算账本。费用是供应商 usage 推算而非发票，分离冷/热缓存运行。评测不写正式记忆，不自动改变分类器或阈值。另用独立 query/expected source/negative pairs 校准 runtime score 与 margin：评估 precision、recall、误浮现率、拒绝率、撤回/越权命中（必须为零），盲测后再写入部署配置。未提供真实语料/价格/密钥，本包只运行合成词法基线、模拟服务和接口测试。

## 3. 发行验收与 D 交接
这是 Beta13→Beta14 的累计候选，不是已经推送的 GitHub 正式版；Beta14 A-D 均为预览，勿使用同版本号在预览安装之间执行正式自动更新。运行 `npm test`、`cd converter && npm test`、`npm run beta:verify`。实际旧包与本包隔离升级测试：`node test/beta14e-upgrade-stack.mjs /path/Everlight_0.1.0-beta.13.zip /path/candidate.zip`。临时签名仅用于测试。发布者核对清单、使用真实私钥签署 `release.json` 和 `release.sig`（私钥不进仓库）、检查 GitHub release asset/tag/公开密钥，再在授权测试机停止写入、备份、使用新解包器桥接（Beta13 不支持 LICENSE.txt）、验签、安装、健康检查、实际宿主请求核验、失败回滚。真实手机、真实 DSH、正式签名与实际仓库未验，production_approved=false。不得改动家用 H6Y/I11-B。所有前版待办仍保留。
