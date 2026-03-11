# 图片处理改进说明

## 🎉 最新改进

Voice Agent 的图片处理功能已升级，现在支持：

1. ✅ **使用公开 URL 而非 base64**
2. ✅ **支持图片 + 文字混合消息**

---

## 📊 改进对比

| 特性 | 旧版本 | 新版本 |
|------|--------|--------|
| **图片传输方式** | 下载 → 转 base64 → data URL | 直接使用 Telegram 公开 URL |
| **Token 消耗** | 高（base64 编码增加 33%） | 低（URL 仅几十字符） |
| **处理速度** | 慢（需下载 + 编码） | 快（直接获取 URL） |
| **临时文件** | 需要下载并清理 | 无需下载 |
| **文字说明支持** | ❌ 不支持 | ✅ 支持 caption |
| **自定义问题** | ❌ 固定提示词 | ✅ 使用用户文字 |

---

## 🔧 技术实现

### 1. 公开 URL 方式

**旧代码（base64）：**
```javascript
// 下载图片到本地
const photoPath = await downloadPhoto(photoFileId);

// 读取文件并转 base64
const imageBuffer = fs.readFileSync(photoPath);
const base64String = imageBuffer.toString('base64');
const dataUrl = `data:image/jpeg;base64,${base64String}`;

// 发送给 AI
messageHistory.push({
  role: 'user',
  content: [
   { type: 'text', text: '请详细描述这张图片的内容。' },
   { type: 'image_url', image_url: { url: dataUrl } }
  ]
});
```

**新代码（URL）：**
```javascript
// 直接获取公开 URL
const photoUrl = await getPhotoUrl(photoFileId);

// 检查是否有文字说明
const caption = message.caption || '';

// 构建消息内容
let userContent;
if (caption && caption.trim()) {
  // 使用用户的问题
  userContent = [
   { type: 'text', text: caption },
   { type: 'image_url', image_url: { url: photoUrl } }
  ];
} else {
  // 使用默认提示词
  userContent = [
   { type: 'text', text: '请详细描述这张图片的内容。' },
   { type: 'image_url', image_url: { url: photoUrl } }
  ];
}

messageHistory.push({
  role: 'user',
  content: userContent
});
```

---

## 📱 使用场景

### 场景 1：仅发送图片
```
（发送一张风景照片）
```
**AI 回复：**
> 这张图片展示了一幅美丽的自然风光。画面中可以看到连绵的山脉，山顶覆盖着白雪...

### 场景 2：图片 + 问题
```
（发送一张植物照片）
这是什么植物？
```
**AI 回复：**
> 这是薰衣草（Lavandula）。它是一种常见的芳香植物...

### 场景 3：图片 + 指令
```
（发送一张代码截图）
找出这段代码的 bug
```
**AI 回复：**
> 这段代码有几个问题：
> 1. 第 3 行缺少分号
> 2. 变量未定义...

### 场景 4：图片 + 翻译
```
（发送一张外文菜单照片）
翻译成中文
```
**AI 回复：**
> 这份菜单的中文翻译如下：
> - Tomato Soup → 番茄汤
> - Grilled Chicken → 烤鸡肉...

---

## 🔍 工作流程

```
用户发送图片（可选附带文字）
        ↓
Telegram 接收消息
        ↓
Voice Agent 获取图片公开 URL
        ↓
检查是否有 caption 文字
        ↓
构建多模态消息（text + image_url）
        ↓
发送给 AI 模型（使用 CONFIG.MODEL）
        ↓
接收 AI 回复
        ↓
以文字形式发送给用户
```

---

## ⚠️ 注意事项

### 1. URL 有效期
Telegram 的文件 URL 是临时的，但 AI 模型会立即处理，所以不会影响使用。

### 2. 模型支持
确保使用的 AI 模型支持多模态输入（图片理解）。以下模型支持：
- ✅ qwen/qwen3.5-plus
- ✅ qwen/qwen-vl-max
- ✅ openai/gpt-4o
- ✅ openai/gpt-4-vision
- ✅ anthropic/claude-3-5-sonnet
- ❌ minimax-portal/MiniMax-M2.5（纯文本模型）

**注意**：如果切换到不支持图片的模型，图片识别会失败。

### 3. 隐私考虑
Telegram 的公开 URL 需要 Bot Token 才能访问，所以只有你的 Bot 能访问这些图片。

---

## 🎋 相关文件

- `index.js` - 主程序（已更新 `handlePhotoMessage` 函数）
- `MODEL_SWITCH.md` - 模型切换说明（已更新图片处理部分）
- `IMAGE_HANDLING.md` - 本文档

---

## 📝 更新日志

**2024-XX-XX** - v2.0 图片处理改进
- ✅ 使用公开 URL 替代 base64 编码
- ✅ 支持图片附带文字说明（caption）
- ✅ 减少 token 消耗和临时文件
- ✅ 提高处理速度

**2024-XX-XX** - v1.0 初始版本
- ✅ 支持图片识别
- ✅ 使用 base64 编码传输图片
