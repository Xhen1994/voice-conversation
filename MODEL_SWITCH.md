# Voice Agent 模型切换功能

## ✅ 已实现功能

现在 Voice Agent 支持通过 Telegram 命令动态切换模型，无需硬编码。

## 📋 使用方法

### 1. 查看当前模型和可用模型

发送：
```
/model
```
或
```
/models
```

会显示当前使用的模型和所有可用的模型别名。

### 2. 切换模型

发送：
```
/model <模型别名或完整路径>
```

**使用别名（推荐）：**
```
/model qwen3.5-plus
/model minimax-m2.5-lightning
/model gpt-4o
/model claude
```

**使用完整路径：**
```
/model qwen/qwen3.5-plus
/model openai/gpt-4o
```

### 3. 查看帮助

发送：
```
/help
```

## 🔧 配置选项

### 环境变量（可选）

可以通过环境变量设置默认模型：

```bash
export VOICE_AGENT_MODEL="qwen/qwen3.5-plus"
```

然后重启 Voice Agent。

### 内置模型别名

| 别名 | 完整模型路径 |
|------|-------------|
| `minimax-m2.5` | minimax-portal/MiniMax-M2.5 |
| `minimax-m2.5-highspeed` | minimax-portal/MiniMax-M2.5-highspeed |
| `minimax-m2.5-lightning` | minimax-portal/MiniMax-M2.5-Lightning |
| `qwen3.5-plus` / `qwen3.5` / `qwen` | qwen/qwen3.5-plus |
| `deepseek` | deepseek/deepseek-chat |
| `gpt-4o` | openai/gpt-4o |
| `gpt-4` | openai/gpt-4 |
| `claude` | anthropic/claude-3-5-sonnet |

## ⚠️ 注意事项

1. **切换模型会清空消息历史** - 为了避免不同模型之间的上下文混乱，切换模型时会自动清空对话历史

2. **模型必须可用** - 确保你切换的模型在 OpenClaw 中已配置且可用

3. **语音回复同样生效** - 模型切换后，语音和文字回复都会使用新模型

## 🎋 示例对话

```
你：/model qwen3.5-plus

Bot: ✅ **模型已切换**
     当前模型：`qwen/qwen3.5-plus`
     消息历史已清空，开始新的对话。

你：（发送语音或文字）
Bot: （使用 qwen3.5-plus 回复）
```

## 🖼️ 图片处理改进

### ✅ 已实现（最新版本）

1. **使用公开 URL 而非 base64**
   - 不再下载图片到本地并转换为 base64
   - 直接使用 Telegram 的公开 URL 发送给 AI 模型
   - **优势**：减少 token 消耗，提高处理速度

2. **支持图片 + 文字混合消息**
   - 如果发送图片时附带文字说明（caption），会使用该文字作为问题
   - 如果没有文字说明，使用默认提示词"请详细描述这张图片的内容。"
   - **示例**：
     - 发送图片 + 文字"这是什么植物？" → AI 会回答植物名称
     - 仅发送图片 → AI 会详细描述图片内容

### 使用示例

**场景 1：仅发送图片**
```
（发送一张图片，无文字）
```
→ AI 回复："这张图片展示了一个..."

**场景 2：图片 + 问题**
```
（发送一张图片）
这个代码有什么问题？
```
→ AI 回复："这段代码的问题在于..."

**场景 3：图片 + 指令**
```
（发送一张截图）
用中文解释这个界面
```
→ AI 回复："这个界面显示的是..."

## 📝 修改内容

### 模型切换功能
- ✅ 添加 `CONFIG.MODEL` 配置（支持 `VOICE_AGENT_MODEL` 环境变量）
- ✅ 添加 `MODEL_ALIASES` 映射表
- ✅ 添加 `/model` 命令支持
- ✅ 添加 `/help` 命令支持
- ✅ 修改 `sendToAgent()` 使用动态模型
- ✅ 修改图片处理使用动态模型

### 图片处理改进（最新）
- ✅ 使用 `getPhotoUrl()` 获取公开 URL，不再下载转 base64
- ✅ 支持读取 `message.caption` 获取用户附带的文字
- ✅ 根据是否有 caption 动态选择提示词
- ✅ 减少临时文件创建和清理
