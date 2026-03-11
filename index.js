#!/usr/bin/env node
/**
 * Voice & Text Handler - 修正版 (已修复崩溃隐患 & 并发优化)
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const FormData = require('form-data');

// 添加 PATH 环境变量，让 Whisper 能找到 ffmpeg
const env = {
 ...process.env,
 PATH: (process.env.PATH || '/usr/local/bin:/usr/bin:/bin')
};

const CONFIG = {
 // Telegram 配置 (必需)
 TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'your-bot-token-here', 
 CHAT_ID: process.env.TELEGRAM_CHAT_ID || 'your-chat-id-here',
 
 // Agent API (必需)
 OPENCLAW_HOST: process.env.OPENCLAW_HOST || '127.0.0.1',
 OPENCLAW_PORT: process.env.OPENCLAW_PORT || 18789,
 OPENCLAW_TOKEN: process.env.OPENCLAW_TOKEN || 'your-openclaw-token-here',
 
 // 模型配置 (默认从 Gateway 获取，可被环境变量覆盖)
 MODEL: null, // 运行时从 Gateway 获取
 
 // 本地应用路径 (可选，有默认值)
 FFmpeg: process.env.FFmpeg_PATH || '/usr/bin/ffmpeg',
 Python: process.env.PYTHON_PATH || '/home/xhen/miniconda3/envs/GPTSoVits/bin/python',
 
 // Edge TTS 配置 (可选)
 EDGE_VOICE: process.env.EDGE_VOICE || 'zh-CN-XiaoxiaoNeural',
 AUDIO_DIR: process.env.AUDIO_DIR || path.join(process.env.HOME || '/home/xhen', '.openclaw', 'media', 'voice'),
 STATE_FILE: process.env.STATE_FILE || path.join(process.env.HOME || '/home/xhen', '.openclaw', 'media', 'voice', '.last_update_id')
};

// 模型别名映射（用户可以用简短的别名）
const MODEL_ALIASES = {
 'minimax-m2.5': 'minimax-portal/MiniMax-M2.5',
 'minimax-m2.5-highspeed': 'minimax-portal/MiniMax-M2.5-highspeed',
 'minimax-m2.5-lightning': 'minimax-portal/MiniMax-M2.5-Lightning',
 'qwen3.5-plus': 'qwen/qwen3.5-plus',
 'qwen3.5': 'qwen/qwen3.5-plus',
 'qwen': 'qwen/qwen3.5-plus',
 'deepseek': 'deepseek/deepseek-chat',
 'gpt-4o': 'openai/gpt-4o',
 'gpt-4': 'openai/gpt-4',
 'claude': 'anthropic/claude-3-5-sonnet'
};

// 解析模型别名
function resolveModel(alias) {
 const lower = alias.toLowerCase().trim();
 return MODEL_ALIASES[lower] || alias;
}

// 从 Gateway 获取当前模型配置
async function fetchCurrentModel() {
 return new Promise((resolve) => {
   const options = {
     hostname: CONFIG.OPENCLAW_HOST,
     port: CONFIG.OPENCLAW_PORT,
     path: '/config',
     method: 'GET',
     headers: {
       'Authorization': `Bearer ${CONFIG.OPENCLAW_TOKEN}`
     }
   };
   
   const req = http.request(options, (res) => {
     let data = '';
     res.on('data', (chunk) => data += chunk);
     res.on('end', () => {
       try {
         // 检查是否是 HTML 响应（Gateway Web UI）
         if (data.trim().startsWith('<!doctype') || data.trim().startsWith('<html')) {
           console.log('⚠️ Gateway /config 返回 HTML，使用默认模型');
           resolve('bailian/qwen3.5-plus');
           return;
         }
         const config = JSON.parse(data);
         // 尝试获取当前模型 (支持不同的配置路径)
         // 优先级：model > defaultModel > runtime.model
         const model = config?.model || config?.defaultModel || config?.runtime?.model;
         if (model) {
           resolve(model);
         } else {
           console.log('⚠️ Gateway 配置中未找到 model 字段，使用默认模型');
           resolve('bailian/qwen3.5-plus');
         }
       } catch (e) {
         console.log('⚠️ 配置解析失败，使用默认模型:', e.message);
         resolve('bailian/qwen3.5-plus');
       }
     });
   });
   req.on('error', (err) => {
     console.log('⚠️ 无法连接 Gateway，使用默认模型:', err.message);
     resolve('bailian/qwen3.5-plus');
   });
   req.end();
 });
}

// 同步模型从 Gateway (每次请求前调用)
let cachedModel = null;
let lastFetchTime = 0;
const MODEL_CACHE_TTL = 60000; // 缓存1分钟

async function syncModelFromGateway() {
  const now = Date.now();
  // 缓存有效期内直接返回
  if (cachedModel && (now - lastFetchTime) < MODEL_CACHE_TTL) {
    return cachedModel;
  }
  
  try {
    const model = await fetchCurrentModel();
    cachedModel = model;
    lastFetchTime = now;
    console.log(`🔄 模型已同步: ${model}`);
    return model;
  } catch (e) {
    console.error('模型同步失败:', e.message);
    if (cachedModel) {
      console.log('⚠️ 使用缓存的模型:', cachedModel);
      return cachedModel;
    }
    // 没有缓存时返回默认值，不抛出错误
    console.log('⚠️ 使用默认模型：bailian/qwen3.5-plus');
    return 'bailian/qwen3.5-plus';
  }
}

if (!fs.existsSync(CONFIG.AUDIO_DIR)) {
 fs.mkdirSync(CONFIG.AUDIO_DIR, { recursive: true });
}

// ==================== 1. Telegram API 请求 ====================
function telegramRequest(method, data) {
 return new Promise((resolve, reject) => {
 const postData = JSON.stringify(data);
 const options = {
 hostname: 'api.telegram.org',
 path: `/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${method}`,
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Content-Length': Buffer.byteLength(postData)
 }
 };
 const req = https.request(options, (res) => {
 let body = '';
 res.on('data', (chunk) => body += chunk);
 res.on('end', () => {
 try {
 const result = JSON.parse(body);
 if (result.ok) resolve(result.result);
 else reject(new Error(result.description));
 } catch(e) { reject(e); }
 });
 });
 req.on('error', reject);
 req.write(postData);
 req.end();
 });
}

async function sendText(text, replyToMessageId = null) {
 if (!text || !text.trim()) return;
 const data = { chat_id: CONFIG.CHAT_ID, text };
 if (replyToMessageId) data.reply_to_message_id = replyToMessageId;
 return telegramRequest('sendMessage', data);
}

async function sendChatAction(action = 'typing') {
 return telegramRequest('sendChatAction', { chat_id: CONFIG.CHAT_ID, action });
}

// ==================== 2.2 发送文件（文档） ====================
async function sendDocument(filePath, caption = null, replyToMessageId = null) {
 if (!fs.existsSync(filePath)) {
  throw new Error(`文件不存在：${filePath}`);
 }
 
 const form = new FormData();
 form.append('chat_id', CONFIG.CHAT_ID);
 form.append('document', fs.createReadStream(filePath));
 if (caption) form.append('caption', caption);
 if (replyToMessageId) form.append('reply_to_message_id', replyToMessageId);

 return new Promise((resolve, reject) => {
  const options = {
   hostname: 'api.telegram.org',
   path: `/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendDocument`,
   method: 'POST',
   headers: form.getHeaders()
  };
  const req = https.request(options, (res) => {
   let body = '';
   res.on('data', (chunk) => body += chunk);
   res.on('end', () => {
    try {
     const result = JSON.parse(body);
     if (result.ok) resolve(result.result);
     else reject(new Error(result.description));
    } catch (e) { reject(e); }
   });
  });
  form.pipe(req);
  req.on('error', reject);
 });
}

// ==================== 2.1 下载图片 ====================
async function downloadPhoto(fileId) {
  const file = await telegramRequest('getFile', { file_id: fileId });
  const photoUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const destPath = path.join(CONFIG.AUDIO_DIR, `photo_${Date.now()}.jpg`);
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    // ✅ 新增：监听流错误，防止崩溃
    fileStream.on('error', (err) => reject(new Error(`图片写入失败: ${err.message}`)));
    
    https.get(photoUrl, (response) => {
      response.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(destPath); });
    }).on('error', reject);
  });
}

// ==================== 2. 下载语音 ====================
async function downloadVoice(fileId) {
 const file = await telegramRequest('getFile', { file_id: fileId });
 const voiceUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
 const destPath = path.join(CONFIG.AUDIO_DIR, `voice_${Date.now()}.ogg`);
 return new Promise((resolve, reject) => {
 const fileStream = fs.createWriteStream(destPath);
 // ✅ 新增：监听流错误，防止崩溃
 fileStream.on('error', (err) => reject(new Error(`语音写入失败: ${err.message}`)));
 
 https.get(voiceUrl, (response) => {
 response.pipe(fileStream);
 fileStream.on('finish', () => { fileStream.close(); resolve(destPath); });
 }).on('error', reject);
 });
}

// ==================== 3. FFmpeg 转换格式 (给 Whisper 用) ====================
async function convertToWav(inputPath, outputPath) {
 return new Promise((resolve, reject) => {
 const ffmpeg = spawn(CONFIG.FFmpeg, [
 '-i', inputPath,
 '-ar', '16000',
 '-ac', '1',
 '-c:a', 'pcm_s16le',
 '-y', outputPath
 ]);
 // ✅ 新增：监听子进程启动或运行错误
 ffmpeg.on('error', (err) => reject(new Error(`启动 FFmpeg 失败: ${err.message}`)));
 ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
 });
}

// ==================== 4. 调用常驻 Whisper API ====================
async function transcribeWithWhisperAPI(audioPath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));

  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8000,  // FastAPI 默认端口
      path: '/transcribe',
      method: 'POST',
      headers: form.getHeaders()
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode === 200 && result.text !== undefined) {
            resolve(result.text);
          } else {
            reject(new Error(`Whisper API 报错: ${body}`));
          }
        } catch (e) {
          reject(new Error(`解析 Whisper 响应失败: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    form.pipe(req); // 将文件流 pipe 过去
  });
}

// ==================== 5. 调用 Agent API (手动维护消息历史) ====================
// 维护消息历史
const messageHistory = [];
const MAX_HISTORY_LENGTH = 20;
// 辅助函数：裁剪历史记录，确保不会超出限制，且始终以 'user' 角色开头
function trimMessageHistory() {
  if (messageHistory.length > MAX_HISTORY_LENGTH) {
    // 计算需要剔除的消息数量
    let removeCount = messageHistory.length - MAX_HISTORY_LENGTH;
    // 很多大模型 API (如 Claude/Qwen) 严格要求历史记录必须以 user 开头
    // 如果剔除后第一条变成了 assistant，我们就多删一条
    if (messageHistory[removeCount] && messageHistory[removeCount].role === 'assistant') {
      removeCount++;
    }
    messageHistory.splice(0, removeCount);
  }
}
async function getCurrentModel() {
  // 优先使用用户手动设置的模型，其次从 Gateway 同步
  if (CONFIG._manualModel) {
    return CONFIG._manualModel;
  }
  return await syncModelFromGateway();
}

function sendToAgent(message) {
 return new Promise(async (resolve, reject) => {
 // 获取当前模型
 const currentModel = await getCurrentModel();
 
 // 添加用户消息到历史
 messageHistory.push({ role: 'user', content: message });
 
 const body = JSON.stringify({
 model: currentModel,
 messages: messageHistory,
 stream: false
 });
 const options = {
 hostname: CONFIG.OPENCLAW_HOST,
 port: CONFIG.OPENCLAW_PORT,
 path: '/v1/chat/completions',
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Content-Length': Buffer.byteLength(body),
 'Authorization': `Bearer ${CONFIG.OPENCLAW_TOKEN}`
 }
 };
 const req = http.request(options, (res) => {
 let data = '';
 res.on('data', (chunk) => data += chunk);
 res.on('end', () => {
 try {
 const result = JSON.parse(data);
 if (result.choices && result.choices[0]) {
 const reply = result.choices[0].message.content;
 // 添加助手回复到历史
 messageHistory.push({ role: 'assistant', content: reply });
 // ✅ 触发滑动窗口清理
trimMessageHistory();
 resolve(reply);
 } else if (result.error) {
 reject(new Error(result.error.message));
 } else {
 reject(new Error('Unknown response'));
 }
 } catch (e) { reject(e); }
 });
 });
 req.on('error', reject);
 req.write(body);
 req.end();
 });
}

// ==================== 6. 移除 emoji ====================
function removeEmojis(text) {
 if (!text) return '';
 const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2640}-\u{2642}\u{2600}-\u{2B55}\u{200D}\u{23CF}\u{23E9}\u{231A}\u{FE0F}\u{3299}\u{3297}\u{303D}\u{3030}]/gu;
 return text.replace(emojiRegex, '').trim();
}

// ==================== 6.1 移除 Markdown 加粗 ** ====================
function removeBoldMarkdown(text) {
 if (!text) return '';
 return text.replace(/\*\*(.+?)\*\*/g, '$1').trim();
}

// ==================== 7. Edge TTS ====================
async function textToSpeech(text, outputPath, voice = CONFIG.EDGE_VOICE) {
 // 使用 node-edge-tts
 const { EdgeTTS } = require('node-edge-tts'); 
 const tts = new EdgeTTS({
 voice: voice,
 lang: 'zh-CN',
 outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
 });
 await tts.ttsPromise(text, outputPath);
}

// ==================== 8. 发送语音 (修正为 OGG OPUS) ====================
async function sendVoice(mp3Path, replyToMessageId = null) {
 // Telegram Voice Message 必须是 OGG/OPUS
 const oggPath = mp3Path.replace('.mp3', '.ogg');
 await new Promise((resolve, reject) => {
 const ffmpeg = spawn(CONFIG.FFmpeg, [
 '-i', mp3Path,
 '-c:a', 'libopus',
 '-b:a', '32k',
 '-vbr', 'on',
 '-y', oggPath
 ]);
 // ✅ 新增：监听子进程启动或运行错误
 ffmpeg.on('error', (err) => reject(new Error(`启动 FFmpeg (ogg转换) 失败: ${err.message}`)));
 ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg convert to ogg failed')));
 });

 const form = new FormData();
 form.append('chat_id', CONFIG.CHAT_ID);
 form.append('voice', fs.createReadStream(oggPath));
 if (replyToMessageId) form.append('reply_to_message_id', replyToMessageId);

 return new Promise((resolve, reject) => {
 const options = {
 hostname: 'api.telegram.org',
 path: `/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendVoice`,
 method: 'POST',
 headers: form.getHeaders()
 };
 const req = https.request(options, (res) => {
 let body = '';
 res.on('data', (chunk) => body += chunk);
 res.on('end', () => {
 try {
 const result = JSON.parse(body);
 if (result.ok) resolve(result.result);
 else reject(new Error(result.description));
 } catch (e) { reject(e); }
 });
 });
 form.pipe(req);
 req.on('error', reject);
 });
}

// ==================== 9. 清理临时文件 ====================
function cleanupFiles(files) {
 files.forEach(f => {
 try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch(e) {}
 });
}

// ==================== 10. 主逻辑 ====================
async function handleVoiceMessage(message) {
 const voiceFileId = message.voice.file_id;
 const messageId = message.message_id;
 const tempFiles = [];
 try {
 console.log(`🎤 收到语音消息 (ID: ${messageId})`);
 await sendChatAction('record_audio');

 console.log('⬇️ 下载语音...');
 const voicePath = await downloadVoice(voiceFileId);
 tempFiles.push(voicePath);

 console.log('🔄 转换格式...');
 const wavPath = voicePath.replace('.ogg', '.wav');
 tempFiles.push(wavPath);
 await convertToWav(voicePath, wavPath);

 console.log('📝 转录中 (调用常驻Whisper API)...');
 await sendChatAction('typing');
 const transcribedText = await transcribeWithWhisperAPI(wavPath);
 console.log(`📝 转录结果: ${transcribedText}`);

 console.log('🤖 发送给Agent...');
 await sendChatAction('typing');
 const agentReply = await sendToAgent(transcribedText);
 console.log(`🤖 Agent回复: ${agentReply.substring(0, 50)}...`);

 console.log('🎤 生成语音回复...');
 await sendChatAction('record_audio');
 // 语音回复：移除 emoji 和 Markdown 加粗 **
 const cleanReplyText = removeBoldMarkdown(removeEmojis(agentReply));
 const voiceReplyPath = path.join(CONFIG.AUDIO_DIR, `reply_${Date.now()}.mp3`);
 tempFiles.push(voiceReplyPath);
 // 生成出来的 ogg 也放进清理列表
 tempFiles.push(voiceReplyPath.replace('.mp3', '.ogg')); 
 
 await textToSpeech(cleanReplyText, voiceReplyPath);

 console.log('📤 发送语音回复...');
 await sendVoice(voiceReplyPath, messageId);
 console.log('✅ 语音回复已发送');
 } catch (error) {
 console.error('❌ 处理语音失败:', error.message);
 await sendText(`处理失败: ${error.message}`, messageId);
 } finally {
 cleanupFiles(tempFiles);
 }
}


// ==================== 检测文件路径 ====================
function detectFilePath(text) {
 // 匹配常见的文件路径模式
 const patterns = [
  // 绝对路径：/home/user/file.txt 或 ~/file.txt
  /((?:\/[^\/\s]+)+\/[^\/\s]+\.[a-zA-Z0-9]+)/g,
  // Windows 路径：C:\Users\file.txt
  /([A-Za-z]:\\(?:[^\\\/\s]+\\)*[^\\\/\s]+\.[a-zA-Z0-9]+)/g,
  // 相对路径：./file.txt 或 ../file.txt
  /(\.\/[^\/\s]+\.[a-zA-Z0-9]+)/g,
 ];
 
 const foundPaths = [];
 for (const pattern of patterns) {
  const matches = text.match(pattern);
  if (matches) {
   foundPaths.push(...matches);
  }
 }
 
 // 过滤掉明显不是文件的路径
 return foundPaths.filter(p => {
  // 排除 URL
  if (p.startsWith('http://') || p.startsWith('https://')) return false;
  // 排除太短的路径
  if (p.length < 5) return false;
  return true;
 });
}

// ==================== 检测文件发送意图 ====================
function hasFileSendIntent(text) {
 const keywords = [
  '发送文件', '发文件', '发给我', '发我', '发送这个',
  'send file', 'send me', 'send this',
  '把这个发', '把这个文件', '把这个发给我',
  '/file', '/send'
 ];
 return keywords.some(kw => text.toLowerCase().includes(kw));
}

async function handleTextMessage(message) {
 const userText = message.text;
 const messageId = message.message_id;
 
 // 检查是否是命令
 if (userText.startsWith('/')) {
  await handleCommand(userText, messageId);
  return;
 }
 
 try {
 console.log(`💬 收到文字消息：${userText}`);
 await sendChatAction('typing');
 
 // 检测是否包含文件路径且有发送意图
 const detectedPaths = detectFilePath(userText);
 const hasIntent = hasFileSendIntent(userText);
 
 if (detectedPaths.length > 0 && hasIntent) {
  // 用户想要发送文件
  const filePath = detectedPaths[0]; // 使用第一个检测到的路径
  const caption = userText.replace(filePath, '').trim() || '这是你要的文件';
  
  console.log(`📎 检测到文件发送请求：${filePath}`);
  await sendChatAction('upload_document');
  
  if (!fs.existsSync(filePath)) {
   await sendText(`❌ 文件不存在：${filePath}`, messageId);
   return;
  }
  
  await sendText(`📤 正在发送文件：${path.basename(filePath)}`, messageId);
  const result = await sendDocument(filePath, caption, messageId);
  
  if (result) {
   console.log(`✅ 文件已发送：${path.basename(filePath)}`);
   return; // 发送文件后直接返回，不调用 Agent
  }
 }
 
 // 普通文字消息，调用 Agent
 const agentReply = await sendToAgent(userText);
 console.log(`🤖 Agent 回复：${agentReply.substring(0, 50)}...`);

 console.log('📤 发送文字回复...');
 await sendText(agentReply, messageId);
 console.log('✅ 文字回复已发送');
 } catch (error) {
 console.error('❌ 处理文字失败:', error.message);
 await sendText(`处理失败：${error.message}`, messageId);
 }
}

// ==================== 12. 命令处理 ====================
async function handleCommand(command, messageId) {
 const parts = command.trim().split(/\s+/);
 const cmd = parts[0].toLowerCase();
 const args = parts.slice(1);
 
 try {
  if (cmd === '/model' || cmd === '/models') {
   if (args.length === 0) {
    // 显示当前模型（从 Gateway 同步 + 手动设置）
    const currentModel = await getCurrentModel();
    const aliasList = Object.entries(MODEL_ALIASES)
     .map(([alias, full]) => `• \`${alias}\` → ${full}`)
     .join('\n');
    
    await sendText(
`🎋 **当前模型**: \`${currentModel}\`

${CONFIG._manualModel ? '(手动设置模式)' : '(自动同步 Gateway)'}

**可用模型别名**:
${aliasList}

**使用方法**:
\`/model <别名或完整路径>\` - 手动设置
\`/model auto\` - 恢复自动同步 Gateway

例如：
\`/model qwen3.5-plus\`
\`/model minimax-m2.5-lightning\``,
     messageId
    );
   } else if (args[0].toLowerCase() === 'auto') {
    // 恢复自动同步
    CONFIG._manualModel = null;
    cachedModel = null;
    lastFetchTime = 0;
    const model = await syncModelFromGateway();
    
    await sendText(
`✅ **已恢复自动同步**

当前模型：\`${model}\`

模型将自动与 Gateway 保持同步。`,
     messageId
    );
   } else {
    // 手动设置模型
    const newModel = resolveModel(args.join(' '));
    CONFIG._manualModel = newModel;
    messageHistory.length = 0;
    
    await sendText(
`✅ **模型已手动切换**

当前模型：\`${newModel}\`

消息历史已清空，开始新的对话。
使用 \`/model auto\` 可恢复自动同步 Gateway。`,
     messageId
    );
    console.log(`🔄 模型已手动切换：${newModel}`);
   }
    } else if (cmd === '/file' || cmd === '/send') {
   // 发送本地文件
   if (args.length === 0) {
    await sendText(
`📎 **文件发送命令**

**用法**: \`/file <文件路径> [说明文字]\`

**示例**:
\`/file /home/xhen/.openclaw/workspace/screenshot.png\`
\`/file /home/xhen/document.pdf 这是你要的 PDF\`

**支持**: 图片、PDF、文档、音频等任意文件格式`,
     messageId
    );
   } else {
    const filePath = args[0];
    const caption = args.slice(1).join(' ') || null;
    
    await sendChatAction('upload_document');
    await sendText(`📤 正在发送文件：${filePath}`, messageId);
    
    const result = await sendDocument(filePath, caption, messageId);
    
    if (result) {
     const fileName = path.basename(filePath);
     const fileSize = result.document?.file_size || 0;
     console.log(`✅ 文件已发送：${fileName} (${fileSize} bytes)`);
    }
   }
} else if (cmd === '/clear') {
    // 手动清空上下文
    messageHistory.length = 0;
    await sendText('🧹 **对话历史已清空**\n现在我们可以开始全新的话题了。', messageId);
    console.log('🔄 对话历史已手动清空');
} else if (cmd === '/help') {
   await sendText(
`🎋 **Voice Agent 帮助**

**可用命令**:
• \`/model\` - 查看当前模型和可用模型列表
• \`/model <名称>\` - 切换模型（使用别名或完整路径）
• \`/file <路径> [说明]\` - 发送本地文件
• \`/clear\` - 🧹 清空当前对话的记忆
• \`/help\` - 显示此帮助信息

**发送语音或文字消息**即可与我对话！`,
    messageId
   );
  } else {
   await sendText(`❓ 未知命令：${cmd}\n使用 /help 查看可用命令`, messageId);
  }
 } catch (error) {
  console.error('❌ 命令处理失败:', error.message);
  await sendText(`命令执行失败：${error.message}`, messageId);
 }
}

// ==================== 11. 图片处理 ====================
// 获取 Telegram 图片的公开 URL
async function getPhotoUrl(fileId) {
  const file = await telegramRequest('getFile', { file_id: fileId });
  return `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}

async function handlePhotoMessage(message) {
 const photo = message.photo;
 const photoFileId = photo[photo.length - 1].file_id;
 const messageId = message.message_id;
 const tempFiles = [];

 try {
 console.log(`🖼️ 收到图片消息 (ID: ${messageId})`);
 await sendChatAction('typing');

 // 检查是否有附带的文字说明
 const caption = message.caption || '';
 console.log('📝 图片附带文字:', caption || '(无)');

 console.log('⬇️ 下载图片到本地...');
 const photoPath = await downloadPhoto(photoFileId);
 tempFiles.push(photoPath);
 console.log('📷 图片已保存到:', photoPath);

 console.log('🤖 发送给Agent识别图片...');
 await sendChatAction('typing');

 // 获取当前模型
 const currentModel = await getCurrentModel();

 // 构建消息内容：使用本地文件路径（纯文本格式）
 let userMessage;
 if (caption && caption.trim()) {
  // 有文字说明：文字说明 + 图片地址
  userMessage = `${caption}\n\n这是图片的地址${photoPath}`;
 } else {
  // 无文字说明：直接让Agent看图
  userMessage = `请告诉我${photoPath}这张图片是什么`;
 }

 // 添加到消息历史
 messageHistory.push({
  role: 'user',
  content: userMessage
 });

 const body = JSON.stringify({
  model: currentModel,
  messages: messageHistory,
  stream: false
 });

 const options = {
  hostname: CONFIG.OPENCLAW_HOST,
  port: CONFIG.OPENCLAW_PORT,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
   'Content-Type': 'application/json',
   'Content-Length': Buffer.byteLength(body),
   'Authorization': `Bearer ${CONFIG.OPENCLAW_TOKEN}`
  }
 };

 const agentReply = await new Promise((resolve, reject) => {
  const req = http.request(options, (res) => {
   let data = '';
   res.on('data', (chunk) => data += chunk);
   res.on('end', () => {
    try {
     const result = JSON.parse(data);
     if (result.choices && result.choices[0]) {
      const reply = result.choices[0].message.content;
      messageHistory.push({ role: 'assistant', content: reply });
	  // ✅ 触发滑动窗口清理
	  trimMessageHistory();
      resolve(reply);
     } else if (result.error) {
      reject(new Error(result.error.message));
     } else {
      reject(new Error('Unknown response'));
     }
    } catch (e) { reject(e); }
   });
  });
  req.on('error', reject);
  req.write(body);
  req.end();
 });

 console.log(`🤖 Agent图片识别: ${agentReply.substring(0, 50)}...`);

 console.log('📤 发送文字回复...');
 await sendText(agentReply, messageId);
 console.log('✅ 图片识别回复已发送');
 } catch (error) {
  console.error('❌ 处理图片失败:', error.message);
  await sendText(`处理失败: ${error.message}`, messageId);
 } finally {
  cleanupFiles(tempFiles);
  console.log('🗑️ 临时文件已清理');
 }
}

// ==================== 12. 轮询循环 ====================
async function processUpdates() {
 let lastUpdateId = 0;
 if (fs.existsSync(CONFIG.STATE_FILE)) {
  lastUpdateId = parseInt(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
 }
 try {
  const updates = await telegramRequest('getUpdates', {
   offset: lastUpdateId + 1,
   timeout: 30
  });
  
  for (const update of updates) {
   lastUpdateId = update.update_id;
   const msg = update.message;
   
   if (!msg) continue;
   // 限制只能自己使用
   if (msg.chat.id.toString() !== CONFIG.CHAT_ID) continue;
   
   // 【核心优化】：去掉 await，并在后面加上 .catch 捕获异常
   // 这样轮询循环会瞬间过掉，消息会在后台并发处理
   if (msg.voice) {
    handleVoiceMessage(msg).catch(e => console.error('❌ 后台处理语音失败:', e));
   } else if (msg.text) {
    handleTextMessage(msg).catch(e => console.error('❌ 后台处理文字失败:', e));
   } else if (msg.photo) {
    handlePhotoMessage(msg).catch(e => console.error('❌ 后台处理图片失败:', e));
   }
  }
  
  if (updates.length > 0) {
   fs.writeFileSync(CONFIG.STATE_FILE, lastUpdateId.toString());
  }
 } catch (error) {
  console.error('❌ 轮询出错:', error.message);
  console.error('错误堆栈:', error.stack);
  console.error('CHAT_ID 配置:', CONFIG.CHAT_ID);
  console.error('lastUpdateId:', lastUpdateId);
 }
}

async function startPolling() {
 await processUpdates();
 setTimeout(startPolling, 1000);
}

// ==================== 启动 ====================
async function main() {
 console.log('🚀 Voice & Text Handler 已启动');
 
 // 启动时同步模型
 try {
   const initialModel = await syncModelFromGateway();
   console.log(`📡 初始模型：${initialModel}`);
 } catch (e) {
   console.error('❌ 启动时模型同步失败，将使用 Gateway 的 defaultModel 配置');
   console.error('错误详情:', e.message);
   // 不阻塞启动，让后续请求时继续尝试同步
 }
 
 await processUpdates();
 setTimeout(startPolling, 1000);
}

// ✅ 新增：拦截全局未捕获的 Promise 异常，防止进程退出
main().catch(err => {
  console.error('💥 致命错误，主程序异常退出:', err);
  process.exit(1);
});
