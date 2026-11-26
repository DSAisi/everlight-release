# Everlight 长明 · RC6 Beta 13

面向 AI 的独立记忆系统，支持十二库、历史导入、精准召回、CRSI、自然联想、梦境整理、人物关系、任务与备份更新。**个人非商业公开测试候选，非生产版。**

## 安装
从本仓库 Releases 下载正式发行 ZIP，解压到独立目录；交给有终端和文件权限的 AI，先读 [AGENTS.md](source/AGENTS.md) 和 [安装说明](source/README_先读.md)。Node.js 22，Python 3（发行构建与安全解包）。不要覆盖已有宿主或数据库。

- [完整部署手册](source/说明书/01_AI零基础部署接入手册.md)
- [十二库写入字典](source/说明书/02_十二库写入字典.md)
- [接口索引](source/说明书/03_接口索引.md)
- [开关联动](source/说明书/04_开关按钮与宿主联动.md)
- [接线示例](source/说明书/05_接口接线与调用示例.md)
- [发行与更新](source/发行与更新.md)
- [本版复验](source/verification/RELEASE_CANDIDATE.md)

本版不包含独立认知运行服务；保留通用十二库、任务、梦境与记忆机制。真实宿主唤醒、自动更新与完整手机验收仍待验证。

## 发行
`python3 tools/build_release.py` 构建发行 ZIP；维护者先确认 LICENSE.txt 与第三方素材权利，再配置正式 Ed25519 信任根、签名发行资产及公开仓库地址。不要发布任何用户数据库、密钥、配置、备份或原话。

个人测试许可见 [LICENSE.txt](LICENSE.txt)，不是开源许可。
