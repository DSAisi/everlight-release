# 长明 CRSI 梦境同步补丁 · Beta 10 Dream Sync (开发预览)

production_approved=false。D 先在独立副本联调。对外与内部采用同一梦境接口，不重新开启对外禁用的八大认知服务。内部已有认知服务的连接由 D 单独完成；不替换生产数据库、宿主插件或运行配置。

## 1. 基线和合并方式
基于 Everlight_RC6_Beta09_Dream_Host_Preview.zip。D 的现役分支可能不同，先比对 git diff，不直接复制覆盖 engine、server、面板整个目录。独立补丁包提供 unified diff、变更文件、测试及设计手册；有冲突时手工合并对应路由/函数，保持 D 现有接口契约。旧梦境记录不删除，不新增数据库表。首次运行仍需现有 inbox 安装逻辑。

## 2. 面板真实通知链
面板 /dreams → 邀请 AI 自主整理 → POST /api/v8/ui/workflow（action=dream-invite, idempotency_key）→ 受信 dashboard 代理 POST /api/v8/dream/invite → shared_actions → connect_inbox_w3e → 宿主消费。
面板 GET /api/v8/ui/dream-invitations 代理 GET /api/v8/dream/invitations（仅返回状态、时间、读回存在、结果和配置标志）。按钮重复点击复用同一未处理邀请；成功刷新页面，展示 queued / acknowledged / resolved / rejected；请求读回与实际模型送达不混淆。收件箱已配置不代表消费者已运行。无宿主时仍保留 queued，不虚构唤醒。

配置：CORE_ADAPTER=v8 对应 EVERLIGHT_CORE_ADAPTER=v8；EVERLIGHT_REVIEW_WRITES=1（受信写入）；EVERLIGHT_CORE_URL 指向本机核心；EVERLIGHT_BOUND_SCOPE 与 EVERLIGHT_UI_SCOPE 一致；EVERLIGHT_CORE_TOKEN、EVERLIGHT_SHARED_HOST_TOKEN、EVERLIGHT_UI_TOKEN、EVERLIGHT_CONNECT_TOKEN 各自独立；EVERLIGHT_CONNECT_ENABLED=1、EVERLIGHT_CONNECT_INBOX=1。独立 AI/人类审核和治理管理员令牌沿用原配置，禁止交给模型或前端。不要使用测试凭据。D 须确认实际宿主调度能力，不擅自重启生产。

## 3. D 宿主接线（以下是接线模板，enqueue 是 D 自己的真实持久化队列，不是已实现 DSH 方法）
```js
import {openInbox} from './adapters/connect-inbox-w3e.mjs';
import {dreamDispatch} from './adapters/dream-dispatch-beta10.mjs';
import {dreamHost} from './adapters/dream-host-beta09.mjs';
const dispatch=dreamDispatch({baseUrl,token,hostToken,scope,enqueue: async job=>{
  // D: 按 job.key 去重并持久化；确认成功才返回 durable:true。
  await existingDurableHostQueue(job);
  return {durable:true};
}});
const dream=dreamHost({baseUrl,token,hostToken,scope});
// 若已有消费者，在其 handle 内增加这一分支，不另起会吞掉其他事件的消费者。
// const handled=await dispatch.handle(event,ctx);
// if(!handled) await existingHandler(event,ctx);
// 仅新建隔离消费者时才使用 openInbox；复用现有 scope 和 checkpoint。
// D 在真正空闲且已授权时：await dream.opportunity({idle:true,enabled:true});
// D 模型真正发起请求时记录实际 messages 和稳定 requestRef：
// await dispatch.readback({actionId,requestRef,messages});
// 捕获 AI 的真实处理响应为 source 后：
// await dispatch.resolve({actionId,sourceId,outcome:'reported',detail:'实际结果'});
// 不做梦时 outcome='declined'；暂缓留在宿主队列，避免假装已完成。
```
宿主队列任务需处理 ack 后崩溃、投递失败、重启重试与去重。readback 是宿主请求自证，不是供应商独立确认。由 D 将真实模型响应与原始来源绑定；不发送模拟消息充数。已有其他事件必须继续交给原 handler。24 小时自动邀请冷却仍为 Beta09 规则；手动邀请不受该冷却限制，但未处理邀请去重。自由梦境允许拒绝；必要认知维护独立任务机制仍需实施。

## 4. 梦境修订流程（真实正式库路径）
选择分类/目的 → 精准召回相关原话及目标旧版本来源 → POST /api/v8/dream/start（显式 source_ids，最多30个）→ advance（阶段至少3）→ POST /api/v8/dream/revision → GET /api/v8/joint/status → 独立 AI 审核 POST /api/v8/joint/ai（专用审核凭据）→ 治理策略允许时 auto_commit:true → GET /api/v8/memories/detail 读回新版本。双审策略必须等人类批准；D 不得擅自关闭治理或伪造人类决定。一次授权式专项自动治理尚待设计；现有治理模式已可在授权 AI 单审下提交。

修订请求字段：scope, id（梦境ID）, target_id, expected_revision, payload（目标 slot/kind 对应完整 D9 合同）, source_refs（冻结证据，保留目标旧版本全部来源）, reason, idempotency_key。现支持 S04、S05、S06、S07、S08、S11 普通正式记忆版本修订。S01/S02/S03/S09/S10/S12、私密/虚构/撤回来源、跨域和并发旧版本禁止通过此路由直接改写。其他类型走既有专用合同。新记忆走已有 proposal 接口；反思候选走 dream/improvement。只增加候选不等于修订；独立审核提交并读回后才算成功。旧版本 superseded，原话不变。索引、外部向量与召回缓存须按 D 现有机制验证，不声称已完成全域向量更新。梦境候选使用现有审核系统；正式修订结果尚未逐条投影到梦境面板。

## 5. AI 自选梦境与后续开发
沿用九类梦境 guidance 与 source_ids 冻结，虚构不写真实记忆；不是九套独立模型工作流。D 先接宿主空闲事件、按钮真实消费及 revision；之后落实每类不同的分析策略、自然多轮联想、独立证据复核、历史经验重放、认知策略评估及内部八模块联动。不能仅推进 stage 冒充做梦完成，不能自评即宣称学习成功。

## 6. 验收
在隔离目录执行 `node --test test/beta09-dream*.test.mjs test/beta10-dream-sync.test.mjs`。测试覆盖真实 SQLite + 核心/面板 HTTP、按钮对应 POST、重复邀请、错误令牌拒绝、宿主持久化测试夹具、错误读回拒绝、读回状态、D9 修订、保留证据、独立审核夹具、正式库 revision=2、旧版本拒绝。没有调用真实模型，也没有点击实际浏览器按钮。D 真机验收：点击页面按钮→真实队列→D 自主选择→召回→真实证据改写→审核→新版本读回→实际召回→重启后状态仍在。提交实际日志及 ID，不能只报“接口200”。

## Beta 13 共用递进协议（优先于旧章节）

宿主在真实空闲时调用 opportunity，或消费面板 invite 事件；通过实际模型请求选择主题、类别和来源。未连接通知消费者时仅排队。对真实资料使用 recall 或已授权的 s01/search，按主题获取小批证据；需要补查时先发起新的精准检索，在 start 之前确定证据。已冻结快照不直接改写，补充证据应开启新作业，不绕过授权。保持执行预算，找不到足够证据就不修改。

九类执行方法（由真实 AI 执行，不是九个独立自动模型）:

| 类型 | 操作步骤 | 验收输出 |
|---|---|---|
| review | 按实际时间排列事件、查原话、找缺失 | 有来源的遗漏或无需修改 |
| consolidation | 找重复事件和同义记录，比较来源与版本 | 保留来源的修订候选，不删除原话 |
| emotion | 比较历史当事人表达、时间、归因 | 有证据的历史表达，不推断当前情绪 |
| relationship | 核对身份标识和共同事件，不凭名字合并 | 人物或关系修订候选 |
| conflict | 比较反例、有效期、原始证据 | 确认修订或明确暂缓 |
| self_reflection | 复盘错误、分析根因、找反例、提出可验证假设 | S11 待验证反思，不声称行为已改善 |
| association | 用具体新线索再检索，去掉已读、无关候选 | 有证据的新联系或无结果 |
| imagined | 创作，证据列表为空 | 独立虚构档案，不得修改真实记忆 |
| custom | 说明问题与方法，沿用真实或虚构边界 | 可读回的结果与限制 |

### 修订后复验

1. 修订前调用 `POST /api/v8/recall`，保存 `run_id`，确认选中目标旧版本。固定 query 和 limit。
2. 调用 `dream/revision`；按 `joint/status` 的 digest 交给独立审核者，依实际治理策略正式 commit/scoped。不得伪造批准。
3. 使用相同 query/limit 再召回，保存新 `run_id`。
4. 调用 `POST /api/v8/dream/replay`，JSON 必填 `scope,id,proposal_id,before_run_id,after_run_id`，core bearer + trusted host；服务端核对同域、同一检索词、真实时间、已提交当前版本及旧版本选中证据，返回 `selected_current_revision`。宿主须保持检索条件一致。不同查询、跨域、未提交、撤回、虚构均不能作为有效证据。
5. `GET /api/v8/ui/dreams?scope=personal` 返回 `changes`、`canonical_memory_changed`、`recall_replay`、`recall_replay_verified`；回执不是模型理解或行为学习的证明。面板区分实际提交、召回复验、行为未验证。

可复用 `adapters/dream-revision-loop-beta13.mjs` 的 `reviseAndReplay({dream,recall,review,request,query,limit})`；dream 由 `dreamHost` 构造，recall 接真实宿主检索，review 必须使用真实独立审核与提交读回，返回 `{state:'committed'}` 仅限已确认提交；其他状态保持等待。中断后持久化 before_run_id 与 proposal_id，已提交时从后置召回继续，不盲目重复提交。没有宿主运行环境，不会自行唤醒模型。行为验证、自动多轮规划、自动策略应用仍属实验研发。
