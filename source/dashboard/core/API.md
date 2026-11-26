# 长明 · 实际有效接口契约（2026-11-21 修订版）

本文件以 `everlight.mjs` 中真实服务路由为准。原来的 `/api/marks` 没有实现，已从规范删除；原先 `/api/query` 被误写为全库搜索，实际上只查 S01。现在新增 `/api/search` 供 UI 检索十二库。

## 基础约定

- 默认只监听 `127.0.0.1:4780`。`GET /notebook/` 加载唯一面板；`GET /`、`GET /ui` 重定向至它。
- 设置 `EVERLIGHT_TOKEN` 后所有 `/api/*` 需要令牌或会话，`POST /api/session` 提交令牌取得 SameSite=Strict 的 HttpOnly cookie。远程部署必须有真正 HTTPS 代理并显式开启对应部署选项。
- `POST` 修改需要启动参数 `--enable-writes` 和至少16字节令牌，且有同源验证；写失败不会修改浏览器本地的模拟数据。
- 原始事件和运行回执永不直接改写；S05 支持创建事实新版本；其他条目只能增加人工标注及其历史。所有写入使用预期版本检查与回执。
- `/api/turn` 的 `selected` 是计划选中，**不是**经读回核验的实际模型请求。`actual_request_verified=false` 直到有可信宿主证据。
- 无生产授权的环境只使用隔离库及合成数据测试。新增的 `vitals` 敏感数据默认不可见：仅 `EVERLIGHT_ENABLE_SENSITIVE=1` 且设置令牌后启用查看；正式生产仍需要独立的细粒度角色权限设计。

## UI 唯一使用的 GET 接口

| 路径 | 参数 | 说明 |
|---|---|---|
| `/api/status` | 无 | S01–S12 各库原始行数、实例身份、读写授权、模块开关 |
| `/api/recent` | `limit=1..30` | 按时间合并最近记录；稳定 `slot`+`id` |
| `/api/list` | `slot=S01..S12&limit&offset` | 单库分页；S05 仅当前版本，历史不在列表重复 |
| `/api/detail` | `slot&id[&revision]` | 单条记录、准确时间、原始字段、人工注释、S05 历史 |
| `/api/annotations/history` | `slot&id` | 单条记忆的人工标注版本记录 |
| `/api/search` | `q&[slot]&limit&offset` | 十二库或指定库字面匹配（**非语义检索**）；报告扫描库列表与每库命中数 |
| `/api/reviews` | `state=pending\|accepted\|rejected\|deferred&limit&offset` | 按审核状态分页 |
| `/api/review/detail` | `id` | 单条候选、当前决议和审核事件历史 |
| `/api/turn` | `[trace]&limit&offset` | 无 `trace`：轮次分页；有 `trace`：召回/选中/舍弃明细 |
| `/api/modules` | 无 | 八类可选模块存在状态及条数 |
| `/api/module` | `name&limit&offset` | 单独模块数据；未接入返回 `available=false` |

所有 GET 以 JSON 返回；不可用或未知内容不自动回退到其它库。单条 `id` 通过 URL 编码传入；S02 运行回执采用组合 ID，不能用列表索引代替。

## UI 唯一使用的 POST 接口

| 路径 | 输入关键字段 | 保证 |
|---|---|---|
| `/api/session` | `token` | 认证会话，**不**启用写入权限（是否可写由服务器决定） |
| `/api/fact/revise` | `memory_id`, `expected_revision`, `statement`, `reason`, `actor` | 仅修订 S05 当前事实；生成 vN+1，旧版保留；冲突返回 409 |
| `/api/annotation` | `slot`, `id`, `expected_revision`, `note`, `review_status`, `actor` | 单条人工备注版本化；不改原始正文；冲突返回 409 |
| `/api/review/decide` | `item_id`, `decision`, `reason`, `actor`, `proposal_text` | 采纳/拒绝/暂缓审计留痕；**不自动写入目标库** |

## 历史兼容但新版前端不会再调用

- `GET /api/query?q=...`：旧版 S01 原话字面检索，同时写覆盖账；不要再作为全库搜索。
- `GET /api/vitals`：向后兼容别名；统一使用 `/api/module?name=vitals`。敏感数据默认关闭。
- `GET /ui`：向后兼容跳转；实际只有 `/notebook/` 这一套前端。
- 不再出现 `/api/marks`、`/__rv` 伪库或两套前端脚本共同生效的设计。

## 已知工程边界

本服务不是宿主的实际请求拦截器：不能证明 messages 真被替换；不能把候选审核采纳当作已写入；没有部署级角色/工作区 ACL；12 库跨库字面检索会执行表扫描，高数据量时要做索引和性能回归。开源前补正式 LICENSE、安全审计和部署资源验收。
