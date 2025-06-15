import os
import tempfile
import shutil
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import librosa
import numpy as np

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze-bpm")
async def analyze_bpm(audio: UploadFile = File(...)):
    # 保存到臨時文件
    suffix = os.path.splitext(audio.filename)[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        # 讀取音訊
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        # 節拍分析
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, onset_envelope=onset_env, units='time')
        # beats: 每個節拍的時間戳
        # 計算相鄰節拍的BPM
        if len(beats) < 2:
            return JSONResponse(status_code=200, content={"times": [], "bpms": []})
        intervals = np.diff(beats)
        inst_bpms = 60.0 / intervals
        # 平滑（滑動平均，窗口3）
        if len(inst_bpms) > 2:
            smooth_bpms = np.convolve(inst_bpms, np.ones(3)/3, mode='same')
        else:
            smooth_bpms = inst_bpms
        # 對齊時間戳（取每個節拍對應的時間）
        times = beats[1:]
        # 返回
        return {"times": times.tolist(), "bpms": smooth_bpms.tolist()}
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
