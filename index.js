#!/usr/bin/env node
/**
 * Voice & Text Handler - 修正版
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
 
 // 本地应用路径 (可选，有默认值)
 FFmpeg: process.env.FFmpeg_PATH || '/usr/bin/ffmpeg',
 Python: process.env.PYTHON_PATH || '/usr/bin/python',
 
 // Edge TTS 配置 (可选)
 EDGE_VOICE: process.env.EDGE_VOICE || 'zh-CN-XiaoxiaoNeural',
 AUDIO_DIR: process.env.AUDIO_DIR || path.join(process.env.HOME || '/home/xhen', '.openclaw', 'media', 'voice'),
 STATE_FILE: process.env.STATE_FILE || path.join(process.env.HOME || '/home/xhen', '.openclaw', 'media', 'voice', '.last_update_id')
};

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

// ==================== 2. 下载语音 ====================
async function downloadVoice(fileId) {
 const file = await telegramRequest('getFile', { file_id: fileId });
 const voiceUrl = `https://api.telegram.org/file/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
 const destPath = path.join(CONFIG.AUDIO_DIR, `voice_${Date.now()}.ogg`);
 return new Promise((resolve, reject) => {
 const fileStream = fs.createWriteStream(destPath);
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
 ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
 });
}

// ==================== 4. 本地 Whisper 转录 ====================
async function transcribeWithWhisperAPI(audioPath) {
  return new Promise((resolve, reject) => {
    // 使用 Python wrapper 脚本调用 whisper
    const scriptPath = path.join(path.dirname(__filename), 'whisper-transcribe.py');
    const proc = spawn(CONFIG.Python, [scriptPath, audioPath]);
    let output = '';
    let error = '';
    proc.stdout.on('data', (d) => output += d);
    proc.stderr.on('data', (d) => error += d);
    proc.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(error || 'Whisper failed: ' + code));
    });
  });
}

// ==================== 5. 调用 Agent API (手动维护消息历史) ====================
// 维护消息历史
const messageHistory = [];

function sendToAgent(message) {
 return new Promise((resolve, reject) => {
 // 添加用户消息到历史
 messageHistory.push({ role: 'user', content: message });
 
 const body = JSON.stringify({
 model: 'minimax-portal/MiniMax-M2.5',
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

 console.log('📝 转录中 (本地Whisper)...');
 await sendChatAction('typing');
 const transcribedText = await transcribeWithWhisperAPI(wavPath);
 console.log(`📝 转录结果: ${transcribedText}`);

 console.log('🤖 发送给Agent...');
 await sendChatAction('typing');
 const agentReply = await sendToAgent(transcribedText);
 console.log(`🤖 Agent回复: ${agentReply.substring(0, 50)}...`);

 console.log('🎤 生成语音回复...');
 await sendChatAction('record_audio');
 const cleanReplyText = removeEmojis(agentReply);
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

async function handleTextMessage(message) {
 const userText = message.text;
 const messageId = message.message_id;
 try {
 console.log(`💬 收到文字消息: ${userText}`);
 await sendChatAction('typing');

 const agentReply = await sendToAgent(userText);
 console.log(`🤖 Agent回复: ${agentReply.substring(0, 50)}...`);

 console.log('📤 发送文字回复...');
 await sendText(agentReply, messageId);
 console.log('✅ 文字回复已发送');
 } catch (error) {
 console.error('❌ 处理文字失败:', error.message);
 await sendText(`处理失败: ${error.message}`, messageId);
 }
}

// ==================== 11. 轮询循环 ====================
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
 
 if (msg.voice) {
 await handleVoiceMessage(msg);
 } else if (msg.text) {
 await handleTextMessage(msg);
 }
 }
 if (lastUpdateId > 0) {
 fs.writeFileSync(CONFIG.STATE_FILE, lastUpdateId.toString());
 }
 } catch (error) {
 console.error('❌ 轮询出错:', error.message);
 }
}

async function startPolling() {
 await processUpdates();
 setTimeout(startPolling, 1000);
}

// ==================== 启动 ====================
console.log('🚀 Voice & Text Handler 已启动');
startPolling();
