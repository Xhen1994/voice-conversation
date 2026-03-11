import os
import whisper
import tempfile
from fastapi import FastAPI, UploadFile, File

app = FastAPI()

# 启动时加载模型并常驻内存
# 你可以根据机器配置选择 "base", "small", "medium"
print("⏳ 正在加载 Whisper 模型...")
model = whisper.load_model("small")  # 统一使用 small 模型，缓存位置：~/.cache/whisper/small.pt 
print("✅ 模型加载完成，准备就绪！")

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # 1. 将收到的音频流写入临时文件
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        temp_audio.write(await file.read())
        temp_path = temp_audio.name

    try:
        # 2. 调用常驻内存的模型进行转录
        result = model.transcribe(temp_path)
        return {"text": result["text"].strip()}
    finally:
        # 3. 无论成功失败，务必清理临时文件，防止塞满硬盘
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    import uvicorn
    # 默认跑在 8000 端口
    uvicorn.run(app, host="127.0.0.1", port=8000)
