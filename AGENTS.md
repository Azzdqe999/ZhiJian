# 纸间 · 工程约定

## 位置
- 源码：`E:\NovelReader\app`
- 设计/任务：`E:\NovelReader\docs`
- 截图/APK：`E:\NovelReader\build`

## 桌面（Electron）
```powershell
cd E:\NovelReader\app
node build-all.mjs
```
启动：双击 `E:\NovelReader\纸间.cmd`。直接跑 electron 前必须清 `ELECTRON_RUN_AS_NODE`（环境默认=1）。

## Android（Capacitor）
```powershell
cd E:\NovelReader\app
node build-all.mjs
node node_modules\@capacitor\cli\bin\capacitor sync android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
$env:ANDROID_HOME = "E:\NovelReader\.android-sdk"
cd android
.\gradlew.bat assembleDebug
```
APK：`app/android/app/build/outputs/apk/debug/app-debug.apk`

## 约束
- 不要引入 Vite/esbuild 等依赖子进程管道的构建工具；tsc + Rollup 可用。
- 渲染层不要用 Node API，保持可移植到 Android WebView。
- 正文/图片数据用 IndexedDB，不要塞 localStorage。
- 视觉基线：纸色 #F6F2E9、夜间 #1B1A18、强调 #A4552F、正文衬线 19px/1.95、侧栏 232px、正文列 720px。
- 手机断点 760px：底部四标签导航，阅读时隐藏侧栏。

## 测试
```powershell
cd E:\NovelReader\app
node test/m1.test.mjs    # 51
node test/m2.test.mjs    # 53
node test/m3.test.mjs    # 41
```

## 当前状态
M0 原型、M1 TXT、M2 EPUB+笔记、M3 人物、M4 Android 壳、M5 WebDAV 同步 均完成。
M6：Android 同步已打通（GET/PUT/HEAD + 注册表 + base64）。下一步去重、凭据加密、自动同步。详见 `docs/M6-交付.md`。