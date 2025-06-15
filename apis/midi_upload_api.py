import os
import uuid
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from mido import MidiFile
from typing import Optional

UPLOAD_DIR = 'uploads'
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/upload")
async def upload_files(
    midi: UploadFile = File(...),
    audio: UploadFile = File(...)
):
    task_id = str(uuid.uuid4())
    midi_path = os.path.join(UPLOAD_DIR, f"{task_id}.mid")
    audio_ext = os.path.splitext(audio.filename)[-1].lower()
    audio_path = os.path.join(UPLOAD_DIR, f"{task_id}{audio_ext}")

    # Save files
    with open(midi_path, 'wb') as f:
        f.write(await midi.read())
    with open(audio_path, 'wb') as f:
        f.write(await audio.read())

    # Parse MIDI
    try:
        mid = MidiFile(midi_path)
        note_count = 0
        earliest = None
        latest = None
        for track in mid.tracks:
            abs_time = 0
            for msg in track:
                abs_time += msg.time
                if msg.type == 'note_on' and msg.velocity > 0:
                    note_count += 1
                    ms_time = int(mido.tick2second(abs_time, mid.ticks_per_beat, 500000) * 1000)
                    if earliest is None or ms_time < earliest:
                        earliest = ms_time
                if msg.type in ('note_off', 'note_on') and msg.velocity == 0:
                    ms_time = int(mido.tick2second(abs_time, mid.ticks_per_beat, 500000) * 1000)
                    if latest is None or ms_time > latest:
                        latest = ms_time
        multi_track = len(mid.tracks) > 1
        midi_info = {
            'note_count': note_count,
            'earliest_ms': earliest if earliest is not None else 0,
            'latest_ms': latest if latest is not None else 0,
            'multi_track': multi_track
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={
            'success': False,
            'error': f'MIDI解析失敗: {str(e)}'
        })

    return {
        'success': True,
        'task_id': task_id,
        'midi_info': midi_info,
        'audio_path': audio_path
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
