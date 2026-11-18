# 本地 AI 部署

纸间的 AI 抽取、章节摘要等功能走 OpenAI 兼容协议，可以直接接本地模型，不需要云端 Key。

## 1. 安装 Ollama

Windows 安装包：https://ollama.com/download

安装后确认服务在跑：

```powershell
ollama serve
```

默认地址：`http://127.0.0.1:11434`

## 2. 拉一个模型

按机器配置选：

```powershell
ollama pull qwen2.5:3b     # 约 2GB，8GB 内存可用
ollama pull qwen2.5:7b     # 约 4.7GB，16GB 内存推荐
ollama pull qwen3:4b       # 约 2.5GB，较新
```

查看已安装：

```powershell
ollama list
```

## 3. 在纸间里配置

设置 → AI 设置：

- 服务：本地 Ollama
- Base URL：`http://127.0.0.1:11434/v1`
- 模型：`qwen2.5:3b`（或你拉下来的名字）
- API Key：留空
- 点「读取模型」确认能列出模型
- 点「测试 AI」，应回复「可用」

## 4. 手机连电脑的本地模型

手机上的 `127.0.0.1` 是手机自己，连不到电脑。需要：

1. 电脑设置环境变量后重启 Ollama：

```powershell
setx OLLAMA_HOST 0.0.0.0
```

2. 手机和电脑同一 Wi-Fi
3. 手机设置里 Base URL 改成电脑局域网 IP：

```
http://192.168.x.x:11434/v1
```

4. Windows 防火墙放行 11434 端口

只建议在可信局域网这样用；不要把 11434 暴露到公网。

## 5. 模型建议

| 模型 | 大小 | 适合 |
| --- | --- | --- |
| qwen2.5:3b | ~2GB | 8GB 内存，抽取人名/地名够用 |
| qwen2.5:7b | ~4.7GB | 16GB 内存，质量和速度平衡 |
| qwen3:4b | ~2.5GB | 较新，推理稍好 |
| llama3.2:3b | ~2GB | 英文为主的书 |

## 6. 常见问题

- **连接失败**：先浏览器打开 `http://127.0.0.1:11434/api/tags`，能返回 JSON 才说明服务正常。
- **读取模型为空**：Base URL 要带 `/v1`；Ollama 原生地址是 11434，不要填成 11435。
- **很慢**：3B 在 CPU 上也能跑，7B 建议有独显；首次加载模型会慢几十秒。
- **手机连不上**：检查 OLLAMA_HOST、防火墙、是否同一网段。
