# 中文 TTS 音色与方案对比

用 Re:Zero 风格的一段旁白+对白生成了试听，文件在 `build/`：

| 文件 | 音色 | 特点 |
| --- | --- | --- |
| tts-Xiaoxiao.mp3 | 晓晓（女） | 温暖、自然，默认旁白 |
| tts-Xiaoxiao-slow.mp3 | 晓晓 -8% | 更慢，适合小说 |
| tts-Xiaoyi.mp3 | 晓伊（女） | 活泼、轻小说/少女 |
| tts-Yunxi.mp3 | 云希（男） | 年轻、阳光 |
| tts-Yunjian.mp3 | 云健（男） | 热血、旁白 |
| tts-Yunjian-slow.mp3 | 云健 -8% | 男声小说节奏 |
| tts-Yunyang.mp3 | 云扬（男） | 新闻、沉稳 |

## 方案

### 1. Edge TTS（推荐先试）
- 微软 Edge 朗读同款神经音色
- 免费、无需 Key
- 中文音色自然度明显高于系统 TTS
- 支持逐词/逐句时间轴，可做精确高亮
- 需要联网
- 非官方接口，端点可能变化

试听就是用它生成的。

### 2. Azure 语音服务（稳定版）
- 和 Edge TTS 同一批音色
- 官方 API，免费层每月 50 万字符
- 需要 Azure Key 和区域
- 适合不想依赖非官方接口的情况

### 3. Qwen3-TTS（本地开源）
- 阿里 Qwen3-TTS 已开源，支持音色设计/克隆
- 质量高，但需要 Python/PyTorch，通常要 GPU
- 可完全离线，适合后续做“本地高音质”
- 参考：https://qwen.ai/blog?id=qwen3tts-0115

### 4. CosyVoice2 / IndexTTS2 / GPT-SoVITS
- 开源、可克隆音色，质量高
- 部署重，需要 GPU
- 适合做本地语音服务，不适合直接塞进手机 App

### 5. MeloTTS
- CPU 可跑、快
- 中文自然度一般，比系统 TTS 好，但不如 Edge

### 6. Piper
- 完全离线、体积小
- 中文音色偏机械，不建议作为主朗读

## 已接入

当前桌面端使用 **Edge TTS / zh-CN-XiaoyiNeural（晓伊）**，默认语速 -10%，通过 `resources/tts-helper.exe` 本地辅助进程合成，再交给 Electron 播放。手机端不显示朗读入口。

## 建议

- **在线优先**：Edge TTS，女声旁白用晓晓，男声/热血用云健，语速 -5% ~ -8%
- **离线兜底**：保留系统 TTS
- **后续进阶**：如果电脑有 GPU，可加 Qwen3-TTS/CosyVoice2 本地服务

## 接入方式

桌面 Electron 和 Android 都可以走 WebSocket 拉 Edge TTS 的 MP3 流，同时接收 WordBoundary 时间轴做逐句高亮。Android 端需要处理音频流播放和断网回退。

下一步需要你选一个默认音色，我再把它接进朗读。
