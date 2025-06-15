import librosa
import numpy as np
import tempfile
import os
from fastapi import UploadFile

async def analyze_bpm(audio: UploadFile):
    suffix = os.path.splitext(audio.filename)[-1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        y, sr = librosa.load(tmp_path, sr=None, mono=True)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, onset_envelope=onset_env, units='time')
        if len(beats) < 2:
            return {"times": [], "bpms": []}
        intervals = np.diff(beats)
        inst_bpms = 60.0 / intervals
        if len(inst_bpms) > 2:
            smooth_bpms = np.convolve(inst_bpms, np.ones(3)/3, mode='same')
        else:
            smooth_bpms = inst_bpms
        times = beats[1:]
        return {"times": times.tolist(), "bpms": smooth_bpms.tolist()}
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
