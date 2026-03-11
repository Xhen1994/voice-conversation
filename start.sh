#!/bin/bash

# 激活 GPTSoVits conda 环境（包含 Whisper）
source ~/miniconda3/etc/profile.d/conda.sh 2>/dev/null || true
conda activate GPTSoVits 2>/dev/null || true

# 显式导出环境变量（确保 node 进程能继承）
export TELEGRAM_BOT_TOKEN="8700456913:AAEJJYewXQV0IiPp5bO6rcwbezx8xng0-Go"
export TELEGRAM_CHAT_ID="6867855688"
export OPENCLAW_TOKEN="0e37e4885c4900df4d7f3d9033a2f545a8d401d99b76b78d"
export OPENCLAW_HOST="127.0.0.1"
export OPENCLAW_PORT="18789"

# 验证环境变量是否加载成功
echo "🔍 检查环境变量..."
echo "TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:0:20}..."
echo "TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}"
echo "OPENCLAW_TOKEN: ${OPENCLAW_TOKEN:0:20}..."
echo "Python: $(which python)"

# 验证 Whisper 是否可用
echo "📝 检查 Whisper..."
python -c "import whisper; print('Whisper 版本:', whisper.__version__)"

# 切换到脚本目录
cd "$(dirname "$0")"

# 启动 Voice Agent
echo "🚀 启动 Voice Agent..."
exec node index.js
