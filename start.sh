#!/bin/bash

# ============================================
# Voice Conversation 启动脚本
# - 激活 GPTSoVits 环境
# - 启动 Whisper 服务器 (FastAPI)
# - 启动 Voice Agent (Node.js)
# ============================================

# 激活 GPTSoVits conda 环境（包含 Whisper）
source ~/miniconda3/etc/profile.d/conda.sh 2>/dev/null || true
conda activate GPTSoVits 2>/dev/null || true

# 显式导出环境变量（确保 node 进程能继承）
export TELEGRAM_BOT_TOKEN="8700456913:AAEJJYewXQV0IiPp5bO6rcwbezx8xng0-Go"
export TELEGRAM_CHAT_ID="6867855688"
export OPENCLAW_TOKEN="0e37e4885c4900df4d7f3d9033a2f545a8d401d99b76b78d"
export OPENCLAW_HOST="127.0.0.1"
export OPENCLAW_PORT="18789"
export EDGE_VOICE="zh-CN-XiaoxiaoNeural"
export AUDIO_DIR="/home/xhen/.openclaw/media/voice"

# 验证环境变量是否加载成功
echo "🔍 检查环境变量..."
echo "TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:0:20}..."
echo "TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}"
echo "OPENCLAW_TOKEN: ${OPENCLAW_TOKEN:0:20}..."
echo "Python: $(which python)"

# 验证 Whisper 是否可用
echo "📝 检查 Whisper..."
python -c "import whisper; print('Whisper 版本:', whisper.__version__)"

# 验证 FastAPI 和 uvicorn 是否可用
echo "🌐 检查 FastAPI..."
python -c "import fastapi; import uvicorn; print('FastAPI:', fastapi.__version__)"

# 切换到脚本目录
cd "$(dirname "$0")"

# ============================================
# 启动 Whisper 服务器 (FastAPI)
# ============================================
echo "🚀 启动 Whisper 服务器 (FastAPI :8000)..."

# 后台启动 Whisper 服务器
nohup python whisper_server.py > /tmp/whisper-server.log 2>&1 &
WHISPER_PID=$!

# 等待服务器启动（最多等待 60 秒，因为首次需要下载模型）
echo "⏳ 等待 Whisper 服务器启动 (首次启动需要下载模型，请耐心等待)..."
for i in {1..60}; do
    if curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
        echo "✅ Whisper 服务器已启动 (PID: $WHISPER_PID)"
        break
    fi
    sleep 1
done

# 检查服务器是否成功启动
if ! curl -s http://127.0.0.1:8000/docs > /dev/null 2>&1; then
    echo "❌ Whisper 服务器启动失败！"
    tail -20 /tmp/whisper-server.log
    exit 1
fi

# ============================================
# 启动 Voice Agent (Node.js)
# ============================================
echo "🚀 启动 Voice Agent..."
exec node index.js
