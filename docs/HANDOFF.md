# 交接说明（给新会话）

## 一句话
「纸间」本地小说阅读器：Electron + Capacitor，TXT/EPUB，书架、笔记、人物/地名、世界观地图、WebDAV 同步、AI 人物抽取。
**M1–M7 已完成基础功能。**

## 先读
1. `AGENTS.md`
2. `docs/M7-地名与地图.md`
3. `docs/M6-补充.md`、`docs/M6-交付.md`
4. `app/src/lib/ai.ts`、`sync.ts`、`components/MapViewer.tsx`

## 状态
- 同步：桌面 + Android，GET/PUT/HEAD + 注册表 + base64
- AI：Gemini 3.8 / Ollama / OpenAI 兼容；EPUB + TXT 都可抽人物
- 地名：kind=place，人物页筛选
- 地图：每本书多图，阅读器「地图」按钮
- 测试：m1 51、m2 53、m3 41、m5 1

## 下一步
1. 图钉拖动、地图平移实测
2. 清理测试地图
3. 收尾

## 开场白
> 接手「纸间」。工作区 E:\NovelReader。先读 AGENTS.md、docs/HANDOFF.md、docs/M7-地名与地图.md；下一步做地图同步与拖拽平移。

## 注意
不要回归 m1/m2/m3/m5；桌面与 Android 共用 dist，改前端后两端都要重建。