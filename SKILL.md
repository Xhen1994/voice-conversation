---
name: Voice Conversation
slug: voice-conversation
version: 1.1.0
description: 处理语音消息 - Whisper 转录 + Agent 回复 + Edge TTS 语音回复。支持语音→语音、文字→文字的对话模式，并支持图片识别和文件发送。
metadata:
  author: Bamboo
  tags: [voice, telegram, whisper, tts, image, file]
---

## When to Use

用户通过 Telegram 发送消息时自动触发此技能：
- **语音消息** → Whisper 转录 → Agent 回复 → Edge TTS 语音回复
- **文字消息** → Agent 回复 → 文字回复
- **图片消息** → Agent 识别图片 → 文字回复
- **文件发送请求** → 检测文件路径 → 发送文件

## Requirements

- Node.js 环境
- FFmpeg (系统安装)
- Python with Whisper (`pip install whisper`)
- node-edge-tts (`npm install node-edge-tts form-data`)
- Telegram Bot Token

## Flow

```
用户发送消息
    │
    ├── 语音 → 下载 → FFmpeg 转换 → Whisper 转录 → Agent → Edge TTS → 语音回复
    ├── 文字 → Agent → 文字回复
    ├── 图片 → 下载 → Agent 识别 → 文字回复
    └── 文件请求 → 检测路径 → 发送文件
```

## Commands

### `/model` - 模型管理
```
/model                    # 查看当前模型和可用模型列表
/model <别名或路径>        # 手动切换模型
/model auto               # 恢复自动同步 Gateway
```

**可用模型别名:**
- `minimax-m2.5` → `minimax-portal/MiniMax-M2.5`
- `minimax-m2.5-highspeed` → `minimax-portal/MiniMax-M2.5-highspeed`
- `minimax-m2.5-lightning` → `minimax-portal/MiniMax-M2.5-Lightning`
- `qwen3.5-plus` / `qwen3.5` / `qwen` → `qwen/qwen3.5-plus`
- `deepseek` → `deepseek/deepseek-chat`
- `gpt-4o` → `openai/gpt-4o`
- `gpt-4` → `openai/gpt-4`
- `claude` → `anthropic/claude-3-5-sonnet`

### `/file` - 发送文件
```
/file <文件路径> [说明文字]
/file /home/xhen/document.pdf 这是你要的 PDF
```

### `/help` - 显示帮助信息

## Features

### 1. 语音对话
- 自动下载 Telegram 语音消息 (.ogg)
- FFmpeg 转换为 WAV (16kHz, 单声道)
- 本地 Whisper 转录为文字
- 调用 Agent API 获取回复
- Edge TTS 生成语音回复 (自动过滤 emoji 和 Markdown 加粗)
- 转换为 OGG/OPUS 格式发送

### 2. 文字对话
- 直接调用 Agent API
- 维护消息历史实现对话记忆
- 自动检测文件发送意图

### 3. 图片识别
- 自动下载 Telegram 图片
- 保存为本地文件
- 调用 Agent API 进行图片识别
- 支持附带文字说明

### 4. 文件发送
- 自动检测文字中的文件路径
- 识别发送意图关键词（"发给我"、"发送文件"等）
- 支持任意文件格式（图片、PDF、文档、音频等）
- 可通过 `/file` 命令手动发送

### 5. 模型管理
- 自动从 Gateway 同步当前模型配置
- 支持手动切换模型（使用别名或完整路径）
- 模型缓存（60 秒 TTL）避免频繁请求
- 消息历史在切换模型时自动清空

## Configuration

此 Skill 需要配置以下环境变量才能正常运行：

### 必需配置

| 环境变量 | 说明 | 获取方式 |
|---------|------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | @BotFather 创建机器人获取 |
| `TELEGRAM_CHAT_ID` | 你的 Telegram Chat ID | @userinfobot 获取 |
| `OPENCLAW_TOKEN` | OpenClaw API Token | OpenClaw 配置中获取 |

### 可选配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `OPENCLAW_HOST` | `127.0.0.1` | OpenClaw 主机地址 |
| `OPENCLAW_PORT` | `18789` | OpenClaw 端口 |
| `FFmpeg_PATH` | `/usr/bin/ffmpeg` | FFmpeg 路径 |
| `PYTHON_PATH` | `/home/xhen/miniconda3/envs/GPTSoVits/bin/python` | Python 路径 |
| `EDGE_VOICE` | `zh-CN-XiaoxiaoNeural` | Edge TTS 语音 |
| `AUDIO_DIR` | `~/.openclaw/media/voice` | 音频存储目录 |
| `STATE_FILE` | `~/.openclaw/media/voice/.last_update_id` | Telegram 轮询状态文件 |

### 配置示例

```bash
# 在运行前设置环境变量
export TELEGRAM_BOT_TOKEN="your-bot-token"
export TELEGRAM_CHAT_ID="your-chat-id"
export OPENCLAW_TOKEN="your-openclaw-token"

# 然后启动 skill
node index.js
```

或创建 `.env` 文件：
```bash
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
OPENCLAW_TOKEN=your-openclaw-token
```

## Usage

### 启动方式

```bash
# 方式 1: 直接运行
node index.js

# 方式 2: 使用启动脚本
./start.sh

# 方式 3: 后台运行
nohup node index.js > voice.log 2>&1 &
```

### 对话示例

**语音对话:**
```
用户: [发送语音] "今天天气怎么样？"
Bot: [语音回复] "今天天气晴朗，气温适宜..."
```

**图片识别:**
```
用户: [发送图片] "这是什么花？"
Bot: [文字回复] "这是一朵玫瑰花..."
```

**文件发送:**
```
用户: "把 /home/xhen/report.pdf 发给我"
Bot: [发送文件] report.pdf
```

**模型切换:**
```
用户: "/model minimax-m2.5-lightning"
Bot: "✅ 模型已手动切换：minimax-portal/MiniMax-M2.5-Lightning"
```

## ⚠️ 安全注意

**发布到 ClawHub 前请务必：**
1. 移除所有硬编码的 tokens、API keys
2. 使用环境变量或用户输入代替
3. 在 SKILL.md 中说明需要用户配置哪些参数
4. 不要提交 `.env` 文件到版本控制

## Notes

- 语音回复不包含 emoji (自动过滤)
- 语音回复不包含 Markdown 加粗 `**` (自动移除)
- 维护消息历史以实现对话记忆
- 使用递归轮询避免请求重叠
- 仅响应配置的 Chat ID，防止他人使用
- 模型配置自动从 Gateway 同步，保持全局一致

## Project Structure

```
voice-conversation/
├── index.js              # 主程序
├── whisper-transcribe.py # Whisper 转录脚本
├── start.sh              # 启动脚本
├── package.json          # Node.js 依赖
├── .env                  # 环境变量配置 (不要提交)
├── .env.example          # 环境变量示例
├── SKILL.md              # 技能文档
├── IMAGE_HANDLING.md     # 图片处理说明
└── MODEL_SWITCH.md       # 模型切换说明
```
