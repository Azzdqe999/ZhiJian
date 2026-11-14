# 纸间 · 本地小说阅读器

Windows（Electron）+ Android（Capacitor）共用一个 Web 构建。

- 源码：`app/`
- 构建产物：`app/dist/`
- 设计/进度：`docs/`
- 截图/APK：`build/`

## 功能

- TXT / EPUB 导入与阅读，自动识别 UTF-8 / GBK / UTF-16 / Big5
- 书架、收藏夹、系列共享、多选批量归入
- 笔记、划线、导出
- 人物 / 地名卡片、别名、插画、正文自动标记
- 世界观地图、地图图钉、插图点击放大
- 软链同步：坚果云 WebDAV，多设备快照合并
- AI 人物/地名抽取（Gemini / Ollama / OpenAI 兼容）

## 桌面

```powershell
cd app
node build-all.mjs
```

双击根目录 `纸间.cmd` 启动。

## Android

```powershell
cd app
node build-all.mjs
node node_modules\@capacitor\cli\bin\capacitor sync android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:ANDROID_HOME = "E:\NovelReader\.android-sdk"
cd android
.\gradlew.bat assembleDebug
```

## 发布与更新

固定 release 签名、GitHub Actions 自动出包、Obtainium/应用内更新方案见
[docs/发布与更新.md](docs/发布与更新.md)。

## 测试

```powershell
cd app
node test/m1.test.mjs
node test/m2.test.mjs
node test/m3.test.mjs
```
