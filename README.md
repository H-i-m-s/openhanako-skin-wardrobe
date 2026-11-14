# 衣橱 · 皮肤库 (Skin Wardrobe)

衣橱 · 皮肤库 —— Hana 的第三方皮肤管理器：导入、预览、应用 SKINPACK 皮肤包；工作台从零做新皮肤。
A skin manager for Hana — import, preview and apply SKINPACK theme packs, or compose new skins from scratch in the built-in workbench.

## 功能 / Features

- **皮肤墙** — 搜索、分组、标签、收藏置顶；每张卡片带真实封面预览
- **界面亮/暗** — 面板自身三态切换（跟随宿主 / 亮 / 暗），存在本地，不动宿主设置
- **暗/亮双套（v3）** — 一张包带两套配色与两张背景；导出后注册成两条主题，用户在设置里各取所需
- **动图壁纸（v3）** — 背景可放 animated WebP / GIF / APNG，`background-image` 直接播（零脚本注入）；带 poster 与 `prefers-reduced-motion` 降级
- **动图壁纸管线** — `node scripts/wallpaper/make-wallpaper-pack.mjs --video <文件> --pack-id <id> --name-zh <名> --credit <出处> --enqueue`：裁顶去水印 → 抽帧 → 溶解循环 → WebP → 组包入库存（依赖 ffmpeg + Python/Pillow）
- **主题 Tokens 导出（v1）** — `GET /api/apps/skin-wardrobe/routes/tokens[?packId=]`：只读、带版本的主题描述 JSON（skinId / 浅深 / 颜色 / 字体 / 圆角 / 背景与材质元数据），供其他插件消费；`source: "pack-config"` 标注为原始配置值
- **工作台** — 从零做皮肤：背景图（自动压缩）、四色派生配色、五套明暗预设、双套联动派生（同色相 / 互补 / 反相）、圆角 / 描边 / 毛玻璃滑杆、字体栈、终端 ANSI 16 色
- **内置主题** — 安装即预装成品主题，开箱可用
- **启停链路** — App 管库存与待办；「执行待办」由随包内置的执行器落宿主注册表（需 `app/process.spawn`），重启 Hana 生效

## SKINPACK v2 格式

一包一主题，四层结构，图片全部 data URI 内联（单文件分发）：

| 层 | 包内存什么 |
|---|---|
| 配色 | 宿主词表变量（核心 8 项必须，其余自由） |
| 背景 | 图片 + 遮罩强度 + 位置 |
| 材质 | 仅参数（tier / rim / blur / edge），CSS 由通用层提供 |
| 取景框 | 内置名或动效文件 |

单文件 JSON 分发，`schema` 字段标识版本。

## 安装 / Install

1. 下载 Release 里的 `app-skin-wardrobe-<ver>.zip`
2. Hana → 扩展 → 安装本地包
3. 打开「衣橱 · 皮肤库」卡片

## 架构 / Architecture

```
App (Node child process)                内置执行器 (spawned node)
├─ app-data/skins/    皮肤库存          ├─ assets/exec/wardrobe-exec.mjs  读待办
├─ app-data/pending   待办队列  ──────► ├─ assets/exec/registry-ops.mjs   三处注册表增删
└─ routes/*           前端 /execute    └─ 写宿主 themes/*.css + 注册表
```

> App 进程受 Node Permission Model 限制，默认不能 spawn。本 App 在 manifest 里声明
> `app/process.spawn`，安装时需用户授权；获准后才能运行内置执行器。执行器是独立 node
> 进程，负责字符串级手术（不重序列化压缩 bundle），写盘前过 `node --check` 语法闸。
> 仓库开发布局下自动回落到 `../patch/scripts/wardrobe-exec.mjs`，无需改路径。
> 注意：子进程会继承 `--permission`，且 fs 授权不会自动传给孙进程——所以执行器、
> `registry-ops`、`node --check` 每一层都显式带 `--allow-fs-read/write`。

## 致谢 / Credits

SKINPACK 单包格式的设计参考了社区分享的 hana-skin 系列皮肤包（pack-luna5 / hana-skin-v0.1.5 等），仅作格式参考，未随本仓库分发。

## License

[AGPL-3.0](LICENSE)
