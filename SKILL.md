---
name: Voice Conversation
slug: voice-conversation
version: 1.0.0
description: 处理语音消息 - Whisper转录 + Agent回复 + Edge TTS语音回复。支持语音→语音、文字→文字的对话模式。
metadata:
  author: Bamboo
  tags: [voice, telegram, whisper, tts]
---

## When to Use

用户通过 Telegram 发送语音消息时自动触发此技能：
- 语音消息 → Whisper转录 → Agent回复 → Edge TTS语音回复
- 文字消息 → Agent回复 → 文字回复

## Requirements

- Node.js 环境
- FFmpeg (系统安装)
- Python with Whisper (`pip install whisper`)
- node-edge-tts (`npm install node-edge-tts form-data`)
- Telegram Bot Token

## Flow

```
用户发送语音
    │
    ▼
下载语音文件 (.ogg)
    │
    ▼
FFmpeg 转换格式 → .wav
    │
    ▼
Whisper 转录 → 文字
    │
    ▼
调用 Agent API → 回复文字
    │
    ├── 用户发语音 → Edge TTS → 语音回复
    └── 用户发文字 → 文字回复
```

## Tools

### voice:transcribe
转录音频文件为文字。

**Input:**
- `file_path`: 音频文件路径 (ogg/wav/mp3)

**Output:** 转录文字

### voice:speak
将文字转换为语音 (Edge TTS)。

**Input:**
- `text`: 要转换的文字
- `voice`: 语音名称 (默认: zh-CN-XiaoxiaoNeural)

**Output:** 生成的音频文件路径

### voice:remove_emoji
移除文字中的 emoji。

**Input:**
- `text`: 包含 emoji 的文字

**Output:** 移除 emoji 后的文字

## Configuration

需要在脚本中配置以下参数：

```javascript
const CONFIG = {
  TELEGRAM_BOT_TOKEN: 'your-bot-token',
  CHAT_ID: 'your-chat-id',
  OPENCLAW_HOST: '127.0.0.1',
  OPENCLAW_PORT: 18789,
  OPENCLAW_TOKEN: 'your-token',
  FFmpeg: '/usr/bin/ffmpeg',
  EDGE_VOICE: 'zh-CN-XiaoxiaoNeural'
};
```

## Notes

- 语音回复不包含 emoji (自动过滤)
- 维护消息历史以实现对话记忆
- 使用递归轮询避免请求重叠
