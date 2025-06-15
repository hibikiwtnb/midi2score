import os
import uuid
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from mido import MidiFile
from typing import Optional
import uvicorn
from modules import bpm_estimator
import mido
import logging
from logging.handlers import RotatingFileHandler
import traceback

UPLOAD_DIR = 'uploads'
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()

# Configure logging (這部分已在你的檔案中，確保它是有效的)
log_formatter = logging.Formatter('%(asctime)s - %(levelname)s - [%(name)s] - %(message)s')
backend_log_file = 'backend.log'
file_handler = RotatingFileHandler(backend_log_file, maxBytes=1024*1024*5, backupCount=2)
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.DEBUG)
# 將 handler 添加到 root logger，並設定 root logger 的級別
logging.getLogger().addHandler(file_handler)
logging.getLogger().setLevel(logging.DEBUG)

# 添加靜態文件支持
app.mount("/static", StaticFiles(directory="."), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_first_tempo(midi_file):
    """取得MIDI檔案的第一個set_tempo，若無則回傳500000 (120BPM)"""
    for track in midi_file.tracks:
        for msg in track:
            if msg.type == 'set_tempo':
                return msg.tempo
    return 500000

@app.post("/upload")
async def upload_files(
    midi: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None)
):
    task_id = str(uuid.uuid4())
    midi_path = None
    audio_path = None
    midi_info = None
    # Save MIDI
    if midi is not None:
        midi_path = os.path.join(UPLOAD_DIR, f"{task_id}.mid")
        with open(midi_path, 'wb') as f:
            f.write(await midi.read())
        # Parse MIDI
        try:
            mid = MidiFile(midi_path)
            note_count = 0
            earliest = None
            latest = None
            channel_set = set()
            bpm = None
            tempo = get_first_tempo(mid)
            for track in mid.tracks:
                abs_time = 0
                for msg in track:
                    abs_time += msg.time
                    if msg.type == 'note_on' and msg.velocity > 0:
                        note_count += 1
                        if hasattr(msg, 'channel'):
                            channel_set.add(msg.channel)
                        ms_time = int(mido.tick2second(abs_time, mid.ticks_per_beat, tempo) * 1000)
                        if earliest is None or ms_time < earliest:
                            earliest = ms_time
                    if msg.type in ('note_off', 'note_on') and msg.velocity == 0:
                        ms_time = int(mido.tick2second(abs_time, mid.ticks_per_beat, tempo) * 1000)
                        if latest is None or ms_time > latest:
                            latest = ms_time
                    if msg.type == 'set_tempo' and bpm is None:
                        # 只取第一個 tempo
                        bpm = mido.tempo2bpm(msg.tempo)
            multi_track = len(mid.tracks) > 1
            midi_info = {
                'note_count': note_count,
                'earliest_ms': earliest if earliest is not None else 0,
                'latest_ms': latest if latest is not None else 0,
                'multi_track': multi_track,
                'track_count': len(mid.tracks),
                'channel_count': len(channel_set),
                'bpm': round(bpm, 2) if bpm else None
            }
        except Exception as e:
            return JSONResponse(status_code=400, content={
                'success': False,
                'error': f'MIDI解析失敗: {str(e)}'
            })
    # Save Audio
    if audio is not None:
        audio_ext = os.path.splitext(audio.filename)[-1].lower()
        audio_path = os.path.join(UPLOAD_DIR, f"{task_id}{audio_ext}")
        with open(audio_path, 'wb') as f:
            f.write(await audio.read())
    # 回傳
    if midi_info is not None or audio is not None:
        return {
            'success': True,
            'task_id': task_id,
            'midi_info': midi_info,
            'audio_path': audio_path
        }
    else:
        return JSONResponse(status_code=400, content={
            'success': False,
            'error': '未收到任何檔案'
        })

@app.post("/analyze-bpm")
async def analyze_bpm(audio: UploadFile = File(...)):
    # 調用 bpm_estimator 處理音訊
    result = await bpm_estimator.analyze_bpm(audio)
    return result

@app.post("/change-bpm")
async def change_bpm_api(
    midi: UploadFile = File(...),
    bpm: float = Form(...)
):
    import shutil
    import tempfile
    # 保存臨時MIDI
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mid') as tmp:
        tmp.write(await midi.read())
        midi_path = tmp.name
    midi_file = mido.MidiFile(midi_path)
    # 取得原BPM
    original_tempo = None
    original_bpm = 90
    for msg in midi_file:
        if msg.type == 'set_tempo':
            original_tempo = msg.tempo
            original_bpm = mido.tempo2bpm(original_tempo)
            break
    # 調整BPM
    for track in midi_file.tracks:
        for msg in track:
            if hasattr(msg, 'time'):
                msg.time = int(msg.time * bpm / original_bpm)
            if msg.type == 'set_tempo':
                msg.tempo = mido.bpm2tempo(bpm)
    # 另存新檔
    out_path = midi_path.replace('.mid', '_bpm.mid')
    midi_file.save(out_path)
    # 回傳新檔案
    return FileResponse(out_path, filename=os.path.basename(out_path), media_type='audio/midi')

@app.post("/analyze-midi")
async def analyze_midi(midi: UploadFile = File(...)):
    try:
        # 保存上傳的 MIDI 文件
        task_id = str(uuid.uuid4())
        midi_path = os.path.join(UPLOAD_DIR, f"{task_id}.mid")
        with open(midi_path, 'wb') as f:
            f.write(await midi.read())

        # 解析 MIDI 文件
        mid = MidiFile(midi_path)
        tempo = get_first_tempo(mid)
        note_times = []  # 音符開始時間
        durations = []   # 音符持續時間
        velocities = []  # 音符力度值
        pitches = []    # 音符音高
        for track in mid.tracks:
            abs_time = 0
            notes_on = {}
            for msg in track:
                abs_time += msg.time
                current_time = mido.tick2second(abs_time, mid.ticks_per_beat, tempo)
                if msg.type == 'note_on' and msg.velocity > 0:
                    notes_on[msg.note] = {
                        'start_time': current_time,
                        'velocity': msg.velocity
                    }
                elif (msg.type == 'note_off' or 
                      (msg.type == 'note_on' and msg.velocity == 0)):
                    if msg.note in notes_on:
                        note_start = notes_on[msg.note]
                        duration = current_time - note_start['start_time']
                        note_times.append(note_start['start_time'])
                        durations.append(duration)
                        velocities.append(note_start['velocity'])
                        pitches.append(msg.note)
                        del notes_on[msg.note]

        # 按照時間順序排序
        sorted_indices = sorted(range(len(note_times)), key=lambda k: note_times[k])
        note_times = [note_times[i] for i in sorted_indices]
        durations = [durations[i] for i in sorted_indices]
        velocities = [velocities[i] for i in sorted_indices]
        pitches = [pitches[i] for i in sorted_indices]  # 同樣需要排序

        # 返回結果
        return {
            "success": True,
            "note_times": note_times,
            "durations": durations,
            "velocities": velocities,
            "pitches": pitches  # 添加音高資訊到返回值
        }
    except Exception as e:
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"MIDI解析失敗: {str(e)}"
        })

@app.post("/filter-notes")
async def filter_notes(
    midi_file: UploadFile = File(...),
    filter_params: str = Form(...)
):
    import json
    import tempfile
    import base64
    
    try:
        # 解析過濾參數
        params = json.loads(filter_params)
        
        # 保存上傳的 MIDI 文件
        task_id = str(uuid.uuid4())
        input_path = os.path.join(UPLOAD_DIR, f"{task_id}_input.mid")
        with open(input_path, 'wb') as f:
            f.write(await midi_file.read())
        
        # 載入 MIDI 文件
        mid = MidiFile(input_path)
        
        # 計算原始音符數
        original_notes = count_notes(mid)
        
        # 應用音符過濾
        filtered_mid = apply_note_filters(mid, params)
        
        # 計算過濾後音符數
        filtered_notes = count_notes(filtered_mid)
        
        # 保存過濾後的文件
        output_path = os.path.join(UPLOAD_DIR, f"{task_id}_filtered.mid")
        filtered_mid.save(output_path)
        
        # 讀取文件並轉換為base64
        with open(output_path, 'rb') as f:
            file_content = f.read()
            file_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # 清理臨時文件
        try:
            os.remove(input_path)
            os.remove(output_path)
        except:
            pass
        
        return JSONResponse(content={
            "success": True,
            "filtered_file": file_base64,
            "stats": {
                "original_notes": original_notes,
                "filtered_notes": filtered_notes
            }
        })
        
    except Exception as e:
        return JSONResponse(status_code=400, content={
            "success": False,
            "error": f"音符過濾失敗: {str(e)}"
        })

def count_notes(midi_file):
    """計算MIDI文件中的音符數量"""
    note_count = 0
    for track in midi_file.tracks:
        for msg in track:
            if msg.type == 'note_on' and msg.velocity > 0:
                note_count += 1
    return note_count

def apply_note_filters(midi_file, params):
    """應用音符過濾邏輯，保留正確時序與速度，動態追蹤tempo，保證所有保留事件的時間軸不變"""
    import copy
    filtered_midi = copy.deepcopy(midi_file)
    ticks_per_beat = filtered_midi.ticks_per_beat
    default_tempo = get_first_tempo(filtered_midi)
    for track_idx, track in enumerate(filtered_midi.tracks):
        abs_time = 0
        messages_to_remove = set()
        notes_on = {}
        tempo_changes = []  # (abs_time, tempo)
        current_tempo = default_tempo
        for i, msg in enumerate(track):
            abs_time += msg.time
            if msg.type == 'set_tempo':
                current_tempo = msg.tempo
                tempo_changes.append((abs_time, current_tempo))
            if msg.type == 'note_on' and msg.velocity > 0:
                if params.get('filter_velocity', False):
                    min_velocity = params.get('min_velocity', 0)
                    if msg.velocity < min_velocity:
                        messages_to_remove.add(i)
                        continue
                if params.get('filter_range', False):
                    if not is_note_in_range(msg.note, params):
                        messages_to_remove.add(i)
                        continue
                notes_on[msg.note] = {'start_tick': abs_time, 'msg_index': i, 'tempo': current_tempo}
            elif (msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0)):
                if msg.note in notes_on:
                    note_start = notes_on[msg.note]
                    start_tick = note_start['start_tick']
                    end_tick = abs_time
                    tempo = note_start['tempo']
                    duration = mido.tick2second(end_tick - start_tick, ticks_per_beat, tempo)
                    if params.get('filter_duration', False):
                        min_duration = params.get('min_duration', 0) / 1000.0
                        if duration < min_duration:
                            messages_to_remove.add(note_start['msg_index'])
                            messages_to_remove.add(i)
                    del notes_on[msg.note]
        # 正確重建track，確保所有保留事件的時間軸不變
        events = []
        pending_time = 0
        for i, msg in enumerate(track):
            if i in messages_to_remove:
                pending_time += msg.time
            else:
                msg_copy = msg.copy()
                msg_copy.time = pending_time + msg.time
                events.append(msg_copy)
                pending_time = 0
        # 確保end_of_track事件存在
        if not any(msg.type == 'end_of_track' for msg in events):
            from mido import Message
            eot = Message('end_of_track', time=0)
            events.append(eot)
        # 重建track
        new_track = mido.MidiTrack()
        for msg in events:
            new_track.append(msg)
        filtered_midi.tracks[track_idx] = new_track
    return filtered_midi

def is_note_in_range(note, params):
    """檢查音符是否在指定音域範圍內"""
    range_min = params.get('range_min')
    range_max = params.get('range_max')
    
    if range_min is not None and range_max is not None:
        return range_min <= note <= range_max
    
    return True

def note_name_to_midi(note_name):
    """將音符名稱轉換為 MIDI 音符號碼"""
    if not note_name or len(note_name) < 2:
        return 60  # 默認 C4
    
    # 音符名稱映射
    note_map = {
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
        'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    }
    
    try:
        # 提取音符和八度
        if len(note_name) >= 3 and note_name[1] in ['#', 'b']:
            note = note_name[:2]
            octave = int(note_name[2:])
        else:
            note = note_name[0]
            octave = int(note_name[1:])
        
        # 計算 MIDI 音符號碼
        midi_note = note_map.get(note.upper(), 0) + (octave + 1) * 12
        return max(0, min(127, midi_note))  # 限制在有效範圍內
    except:
        return 60  # 默認 C4

@app.post("/process-midi")
async def process_midi(
    midi: UploadFile = File(...),
    process_params: str = Form(...)
):
    """
    處理MIDI文件：左右手分離、踏板補全、音符重疊調整
    """
    import json
    
    print(f"Received midi filename: {midi.filename if midi else 'No MIDI file'}")
    print(f"Received process_params (raw string): {process_params}")

    try:
        # 生成唯一文件名，這個 task_id 用於文件名
        task_id_for_files = str(uuid.uuid4())
        input_path = os.path.join(UPLOAD_DIR, f"{task_id_for_files}_input.mid")
        output_path = os.path.join(UPLOAD_DIR, f"{task_id_for_files}_processed.mid")

        print(f"Inside TRY. Task ID for files: {task_id_for_files}")
        logging.debug(f"Inside TRY. Task ID for files: {task_id_for_files}")

        # 解析處理參數
        params = json.loads(process_params)
        
        # 生成唯一文件名
        task_id = str(uuid.uuid4())
        input_path = os.path.join(UPLOAD_DIR, f"{task_id}_input.mid")
        output_path = os.path.join(UPLOAD_DIR, f"{task_id}_processed.mid")
        
        # 保存上傳的MIDI文件
        with open(input_path, 'wb') as f:
            f.write(await midi.read())
        
        # 載入MIDI文件
        mid = mido.MidiFile(input_path)
        
        # 根據參數執行處理
        processed_mid = mid
        
        # 1. 左右手分離處理
        if params.get('handSplit', False):
            processed_mid = apply_hand_split(
                processed_mid,
                left_track=params.get('leftHandTrack', 1),
                left_channel=params.get('leftHandChannel', 1),
                right_track=params.get('rightHandTrack', 1),
                right_channel=params.get('rightHandChannel', 3)
            )
        
        # 2. 音符重疊調整
        if params.get('overlapClean', False):
            processed_mid = apply_overlap_clean(processed_mid)
        
        # 保存處理後的文件
        processed_mid.save(output_path)
        
        # 返回處理後的文件
        return FileResponse(
            output_path,
            media_type='audio/midi',
            filename=f"processed_{midi.filename}"
        )
        
    except Exception as e:
        tb_str = traceback.format_exc() 
        
        print(f"Exception Type: {type(e)}")
        print(f"Exception Message: {str(e)}")
        print(f"Traceback:\n{tb_str}")
        print(f"--- END OF EXCEPTION ---")
        
        logging.error(f"Exception in /process-midi (Task ID: {task_id_for_files}): {str(e)}\n{tb_str}")
        
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )

def apply_hand_split(midi_file, left_track=1, left_channel=1, right_track=1, right_channel=3):
    """
    應用左右手分離邏輯
    """
    from modules.hand_splitter import split_hands
    
    # 使用規則性左右手分離算法
    return split_hands(midi_file, left_track, left_channel, right_track, right_channel)

def apply_overlap_clean(midi_file):
    """
    應用音符重疊調整邏輯，針對每個track內的每個channel分別處理
    """
    import copy
    new_midi = copy.deepcopy(midi_file)
    ticks_per_beat = new_midi.ticks_per_beat
    grouping_threshold_ticks = ticks_per_beat // 4  # 一個16分音符的tick數，隨BPM自適應

    for track in new_midi.tracks:
        # 先根據channel分組收集note事件
        channel_events = {}
        abs_time = 0
        for msg in track:
            abs_time += msg.time
            if msg.type in ['note_on', 'note_off']:
                ch = getattr(msg, 'channel', 0)
                if ch not in channel_events:
                    channel_events[ch] = []
                channel_events[ch].append((abs_time, msg.type, msg.note, msg.velocity, msg))
        # 對每個channel分別處理
        channel_note_events = {}
        for ch, note_events in channel_events.items():
            # 匹配note_on/note_off配對，建立音符清單
            notes = []
            active = {}
            for idx, (t, typ, note, vel, msg) in enumerate(note_events):
                if typ == 'note_on' and vel > 0:
                    active[note] = {'note': note, 'on_time': t, 'velocity': vel, 'on_idx': idx}
                elif (typ == 'note_off' or (typ == 'note_on' and vel == 0)) and note in active:
                    n = active.pop(note)
                    n['off_time'] = t
                    n['off_idx'] = idx
                    notes.append(n)
            notes.sort(key=lambda x: x['on_time'])
            # 分組：on_time在grouping_threshold_ticks內的音符為一組
            groups = []
            i = 0
            n_notes = len(notes)
            while i < n_notes:
                group = [notes[i]]
                group_start_time = notes[i]['on_time']
                j = i + 1
                while j < n_notes and notes[j]['on_time'] - group_start_time <= grouping_threshold_ticks:
                    group.append(notes[j])
                    j += 1
                groups.append(group)
                i = j
            # 重疊消除：每組的off_time不能超過下一組的on_time
            for gidx, group in enumerate(groups[:-1]):
                next_on_time = groups[gidx+1][0]['on_time']
                for n in group:
                    if n['off_time'] > next_on_time:
                        n['off_time'] = next_on_time
            # 將調整後的off_time寫回note_events
            for n in notes:
                off_idx = n['off_idx']
                orig_off_time = note_events[off_idx][0]
                if n['off_time'] < orig_off_time:
                    delta = n['off_time'] - note_events[off_idx-1][0] if off_idx > 0 else n['off_time']
                    note_events[off_idx] = (n['off_time'], note_events[off_idx][1], note_events[off_idx][2], note_events[off_idx][3], note_events[off_idx][4].copy(time=delta))
            channel_note_events[ch] = note_events
        # 重新生成track
        # 收集所有非音符事件
        other_msgs = []
        abs_time = 0
        for msg in track:
            if msg.type not in ['note_on', 'note_off']:
                other_msgs.append((abs_time, msg))
            abs_time += msg.time
        # 合併所有channel的note_events
        all_note_events = []
        for note_events in channel_note_events.values():
            all_note_events.extend(note_events)
        all_events = all_note_events + other_msgs
        all_events.sort(key=lambda x: x[0])
        # 重新計算delta time並覆蓋track
        track.clear()
        prev_time = 0
        for event in all_events:
            if len(event) == 5:
                abs_time, _, _, _, msg = event
            elif len(event) == 2:
                abs_time, msg = event
            else:
                continue  # 不合法，跳過
            msg.time = abs_time - prev_time
            track.append(msg)
            prev_time = abs_time
    return new_midi

@app.post('/cleanup-uploads')
async def cleanup_uploads():
    import glob
    import os
    base_dirs = [
        'data/input_midi',
        'data/input_audio',
        'uploads',
    ]
    deleted = []
    for d in base_dirs:
        if not os.path.exists(d):
            continue
        for f in os.listdir(d):
            if f == '.gitkeep':
                continue
            fp = os.path.join(d, f)
            try:
                if os.path.isfile(fp):
                    os.remove(fp)
                    deleted.append(fp)
            except Exception as e:
                pass
    return {"deleted": deleted}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
