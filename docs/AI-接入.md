# AI 接入方案（M4/M5 之后，可选）

状态：未实现，仅定方向。M3 人物系统不依赖它。

## 默认：Gemini 免费 API

- 用 Gemini API 的 **OpenAI 兼容端点**（`https://generativelanguage.googleapis.com/v1beta/openai/`），
  这样客户端只写一套 OpenAI 协议，Base URL / Key / 模型名可换。
- 免费层有限速与每日额度；超了会 429，需要退避或切备用。
- **隐私**：免费层的数据可能被用于改进服务。只发当前章节、用户手动点“抽取”才发，默认关闭。
- Key 存 Windows 凭据管理器（或加密配置），不进代码、不进日志、不写进仓库。

## 备选：本地 Ollama（不打包）

- 不随安装包分发（模型 5–9GB），只做“检测到本机 11434 端口就用”。
- 资源占用：
  - 空闲：Ollama 后台进程约 100–200MB 内存，**不占 GPU**。
  - 生成时：7B Q4 约 5GB 显存，14B Q4 约 9GB（RTX 3060 12GB 可跑）。
  - 默认 5 分钟无请求自动卸载模型，显存释放；`ollama stop` 立即释放；退出程序零占用。
- 适合离线/隐私敏感场景，用户自己启动，阅读器不负责拉起。

## 接口抽象

```
AiProvider {
  id: 'gemini' | 'ollama' | 'openai-compatible'
  baseUrl, apiKey, model
  chat(messages): Promise<string>
}
```

设置页：Provider 下拉 + Base URL + Key + 模型名 + “测试连接”。
默认预设 Gemini；本地 Ollama 预设 `http://127.0.0.1:11434/v1`。

## 成本

- Gemini 免费层：0 元（限速内）。
- 本地：0 元，电费忽略。
- DeepSeek 付费兜底：一本 100 万字按章抽取约 ¥2–5。

## 用途（按优先级）

1. 抽取本章人物与别名（JSON）
2. 生成人物一句话简介
3. 章节摘要
4. 人物关系抽取

全部手动触发、按章发送、可关闭；不做全书上传。
