-- 长明 Everlight · 参考 schema v0.1（SQLite）
-- 按 DESIGN-十二库契约.md 落地。判据：约定对得上就算长明，表多少张随实现。

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── S01 原始记录：只增，无改删接口 ──────────────────────────
CREATE TABLE IF NOT EXISTS raw_event (
  event_id      TEXT PRIMARY KEY,
  source_ref    TEXT NOT NULL,        -- 文件:行 / URL
  source_revision TEXT,
  actor         TEXT NOT NULL,
  subject       TEXT,
  scope         TEXT NOT NULL DEFAULT 'default',
  happened_at   TEXT,                 -- 没有可靠时间就 NULL（不许猜）
  observed_at   TEXT NOT NULL,
  text          TEXT NOT NULL,
  seq           INTEGER,
  first_ingested_at TEXT,             -- 首次入库（以后重灌也不改）
  last_recalled_at TEXT,
  recall_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_raw_scope_time ON raw_event(scope, observed_at);

-- ── S02 运行回执：一次尝试一条，不同尝试不串接 ──────────────
CREATE TABLE IF NOT EXISTS run_receipt (
  trace_id   TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  stage      TEXT NOT NULL,           -- ingest/query/inject/output/action/eval/recover
  result     TEXT NOT NULL CHECK (result IN ('ok','partial','failed','unknown')),
  at         TEXT NOT NULL,
  detail     TEXT,
  PRIMARY KEY (trace_id, attempt_id, stage)
);

-- ── S03 工作：欠的定义写死在 kind 上 ────────────────────────
CREATE TABLE IF NOT EXISTS work_item (
  item_id   TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  state     TEXT NOT NULL CHECK (state IN ('open','in_progress','done','dropped')),
  kind      TEXT NOT NULL CHECK (kind IN ('commitment','direction','question','utterance','plan')),
  scope     TEXT NOT NULL DEFAULT 'default',
  source_refs TEXT,                   -- JSON 数组
  acceptance  TEXT,                   -- 「做完长什么样」，commitment 必填
  result_ref  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);

-- ── S04 经历 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS episode (
  episode_id TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  participants TEXT,                  -- JSON 数组
  summary    TEXT NOT NULL,
  event_refs TEXT,                    -- JSON 数组
  scope      TEXT NOT NULL DEFAULT 'default'
);

-- ── S05 事实与偏好：按修订存，current 只一条 ────────────────
CREATE TABLE IF NOT EXISTS fact_rev (
  memory_id  TEXT NOT NULL,
  revision   INTEGER NOT NULL,
  statement  TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to   TEXT,
  status     TEXT NOT NULL CHECK (status IN ('current','superseded','disputed','archived')),
  source_refs TEXT,                   -- JSON 数组，不许空
  scope      TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  updated_at TEXT,
  last_recalled_at TEXT,              -- 上一次被召回是什么时候（稿 §5 要露这一行）
  recall_count INTEGER NOT NULL DEFAULT 0,
  first_ingested_at TEXT,             -- 首次入库；索引重建不会改它
  review_note TEXT,                   -- 审核人写了什么
  reviewed_by TEXT,
  PRIMARY KEY (memory_id, revision)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fact_current
  ON fact_rev(memory_id) WHERE status='current';

-- ── S06 方法：env 必填 ──────────────────────────────────
CREATE TABLE IF NOT EXISTS procedure (
  proc_id  TEXT PRIMARY KEY,
  how      TEXT NOT NULL,
  env      TEXT NOT NULL,             -- 宿主/容器/版本/权限，必填
  wins     TEXT,                      -- JSON 数组
  fails    TEXT,                      -- JSON 数组
  scope    TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL
);

-- ── S07 关系 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person (
  person_id TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  also      TEXT,                     -- JSON 数组
  circle    TEXT NOT NULL CHECK (circle IN ('home','family','partner','public')),
  boundary  TEXT,
  evidence  TEXT,                     -- JSON 数组
  scope     TEXT NOT NULL DEFAULT 'default'
);

-- ── S08 情绪：来源不许空；三段分栏 ──────────────────────────
CREATE TABLE IF NOT EXISTS affect (
  affect_id   TEXT PRIMARY KEY,
  expression  TEXT NOT NULL,          -- 当时的表达（原词/原话摘）
  understood  TEXT,                   -- 系统理解（与表达分栏）
  concern     TEXT,                   -- 关切
  target_ref  TEXT,
  source_refs TEXT NOT NULL,          -- JSON 数组；空的话写 ["自述/无出处"]
  observed_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','current','retain','revise','coexist','suspend','unknown','invalid','duplicate','rejected')),
  last_recalled_at TEXT,
  recall_count INTEGER NOT NULL DEFAULT 0,
  review_note TEXT,
  reviewed_by TEXT,
  scope       TEXT NOT NULL DEFAULT 'default'
);

-- ── S09 身份与自我：必填，空着不许启动 ──────────────────────
CREATE TABLE IF NOT EXISTS identity (
  id         INTEGER PRIMARY KEY CHECK (id = 1),   -- 单行
  -- 它是谁
  name       TEXT NOT NULL,
  calls_them TEXT NOT NULL,
  voice      TEXT NOT NULL,
  boundaries TEXT NOT NULL,           -- JSON 数组
  never      TEXT NOT NULL,           -- JSON 数组（红线）
  -- 它知道对面那个人是谁
  their_nickname TEXT NOT NULL,
  their_habits   TEXT,
  their_fears    TEXT,
  no_touch       TEXT,                -- 不许碰的话
  revision   INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- ── S10 元记忆：这次为什么没查到 ────────────────────────────
CREATE TABLE IF NOT EXISTS coverage (
  run_id     TEXT NOT NULL,
  asked      TEXT NOT NULL,
  sources_checked TEXT,               -- JSON 数组
  hit        INTEGER NOT NULL DEFAULT 0,
  missed_reason TEXT,
  coverage   TEXT,
  at         TEXT NOT NULL,
  PRIMARY KEY (run_id)
);

-- ── S11 反思：只有 repeatable 才能当已知做法 ────────────────
CREATE TABLE IF NOT EXISTS reflection (
  reflection_id TEXT PRIMARY KEY,
  from_episode  TEXT,
  claim         TEXT NOT NULL,
  counter_examples TEXT,              -- JSON 数组
  verified_level TEXT NOT NULL CHECK (verified_level IN ('guess','tested_once','repeatable')),
  at            TEXT NOT NULL
);

-- ── S12 资料地图 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS atlas_file (
  file_id TEXT PRIMARY KEY,
  path    TEXT NOT NULL,
  version TEXT,
  summary TEXT,
  range   TEXT,
  sha     TEXT,
  checked_at TEXT
);

-- ── 删除水位与审计（稿 §3 隐私治理） ────────────────────────
CREATE TABLE IF NOT EXISTS tombstone (
  kind      TEXT NOT NULL,            -- table/row/file
  target    TEXT NOT NULL,
  reason    TEXT NOT NULL,
  forbidden_from TEXT,                -- 从什么时候起不许它回来
  at        TEXT NOT NULL
);

-- ── 待确认队列（稿 §5「待确认」页：同屏看建议、原话、当前版本与差异） ──
CREATE TABLE IF NOT EXISTS review_queue (
  item_id     TEXT PRIMARY KEY,
  slot        TEXT NOT NULL,          -- S01..S12
  target_ref  TEXT NOT NULL,          -- 指向哪条（表:id 或 表:id:rev）
  proposal    TEXT NOT NULL,          -- 建议做什么（accept/reject/merge/edit）
  proposed_by TEXT NOT NULL,          -- ai | human | import
  reason      TEXT,
  risk        TEXT,                   -- low/normal/high
  state       TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','accepted','rejected','deferred')),
  decided_by  TEXT,
  decided_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_review_pending ON review_queue(state, created_at);

-- ── 这一轮：一次回答 = 一个 trace_id；这一轮召回/选中/砍掉了什么，全绑在它下面 ──
-- 由来（她 2026-11-20 22:11）：「本轮被召回的所有东西，有一个页面可以看到吗？」
-- 判据：**召回不留账，等于没发生。** 页面上的"最后召回"只能说明单条被想起过，
--       说不出那一轮一共想起了哪几条 —— 这一张就是那个缺口。
CREATE TABLE IF NOT EXISTS turn (
  trace_id    TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  asked       TEXT,                    -- 这一轮问的是什么（她的原话摘要）
  scope       TEXT NOT NULL DEFAULT 'default',
  lanes       TEXT,                    -- JSON：这一轮跑了哪几路
  recalled    TEXT,                    -- JSON 数组：[{slot,id,text,ref,score}]
  selected    TEXT,                    -- JSON 数组：真进上下文的（通常是前 N 条）
  dropped     TEXT,                    -- JSON 数组：召回了但被砍的，附砍的理由
  injected    INTEGER NOT NULL DEFAULT 0,  -- 真的注进去了几条
  note        TEXT
);
CREATE INDEX IF NOT EXISTS ix_turn_at ON turn(at DESC);
