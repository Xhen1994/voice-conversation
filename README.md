# Voice Conversation Assistant
专为 Linux 系统设计的智能语音对话系统。项目结合了 Node.js 的逻辑控制与 Python 的语音处理能力，并深度集成了 GPT-SoVITS 语音克隆技术。

## ⚠️ 启动前必读（关键配置）
### 1. 运行环境与 GPT-SoVITS
本项目建议在激活 GPT-SoVITS 环境的状态下运行，以确保语音合成（TTS）的质量。
推荐做法：在启动前进入你的 conda 或虚拟环境：
```bash
conda activate GPT-SoVITS
```

### 2. Telegram 冲突处理
由于 Telegram 协议限制同一个机器人 ID 只能有一个活跃的轮询（Polling）实例，直接启动本项目可能会导致冲突。
操作顺序：请务必先关闭你现有的内置 Telegram 机器人服务或进程，然后再启动 voice-conversation 服务。

## 🛠️ 安装与配置
### 环境准备
- 操作系统：Linux (推荐 Ubuntu 物理机)
- 基础依赖：Node.js (v16+), Python 3.8+, ffmpeg

### 未使用虚拟环境的配置方案
如果你不想使用虚拟环境（如直接在 Ubuntu 系统环境下运行），请按照以下步骤配置依赖：
1. 全局安装 Python 依赖：
```bash
sudo pip3 install openai-whisper edge-tts
```
2. 设置软链接：确保 python3 命令指向正确的版本，且 ffmpeg 已加入系统 PATH。
3. 权限检查：确保当前用户对项目目录有读写权限。

### 安装步骤
```bash
git clone https://github.com/Xhen1994/voice-conversation.git
cd voice-conversation
npm install  # 安装 Node.js 依赖 
cp .env.example .env # 配置文件 
```

## 🚀 启动与稳定性保障
### 1. 手动启动
```bash
chmod +x start.sh
./start.sh
```

### 2. 自动重启与进程保护 (Linux)
为了防止进程崩溃导致服务中断，建议使用以下两种方案之一实现自动重启：

#### 方案 A：使用 PM2 (推荐)
PM2 是专业的 Node.js 进程管理器，崩溃后会自动秒级重启。
```bash
# 安装 PM2
sudo npm install pm2 -g
# 启动并命名
pm2 start index.js --name "voice-bot"
# 设置开机自启
pm2 save
pm2 startup
```

#### 方案 B：Systemd 服务脚本
在 `/etc/systemd/system/voice-conversation.service` 创建服务文件：
```ini
[Unit]
Description=Voice Conversation Service
After=network.target

[Service]
Type=simple
User=xhen
WorkingDirectory=/path/to/voice-conversation
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
然后执行 `systemctl start voice-conversation`。

## 🌟 核心特性
- **多模型支持**：支持灵活切换不同的 LLM 后端（详见 MODEL_SWITCH.md）。
- **语音识别 (ASR)**：利用 whisper-transcribe.py 实现基于 OpenAI Whisper 的精准离线/在线语音转义。
- **语音合成 (TTS)**：集成 edge-tts 库，提供接近真人的语音反馈。
- **多模态处理**：具备图像识别与处理能力（详见 IMAGE_HANDLING.md）。
- **技能扩展**：支持自定义 Skill 插件扩展（详见 SKILL.md）。

## 🛠️ 技术栈
- 前端/逻辑控制：JavaScript (Node.js) - 占比 95.2%
- 语音处理：Python (Whisper)
- 环境部署：Shell 脚本 (start.sh)

## 📂 项目结构
```plaintext
.
├── index.js                # 项目核心入口逻辑 
├── whisper-transcribe.py   # Python 语音识别脚本 
├── start.sh                # Ubuntu 环境启动脚本 
├── .env.example            # 环境变量配置模板 
├── IMAGE_HANDLING.md       # 图像处理功能说明 
├── MODEL_SWITCH.md         # 模型切换指南 
└── SKILL.md                # 技能扩展说明 
```

## 📝 待办事项 (Roadmap)
- [ ] 上下文摘要化：在清理历史记录前，自动生成对话总结以保留关键记忆。
- [ ] 多音色并发支持：集成更多基于 edge-tts 的预设音色。

## 开源协议
本项目采用 MIT 协议。
