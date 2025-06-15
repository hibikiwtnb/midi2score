# 基於規則的左右手分離模組
import mido
import sys
from collections import defaultdict

def group_simultaneous_notes(note_events, threshold_ticks):
    """
    將note事件按時間分組（視為同時按下的和弦）
    """
    groups = []
    group = []
    prev_time = None

    for e in note_events:
        if prev_time is None or abs(e['time'] - prev_time) <= threshold_ticks:
            group.append(e)
        else:
            groups.append(group)
            group = [e]
        prev_time = e['time']
    if group:
        groups.append(group)
    return groups

def split_hands(midi, left_track=1, left_channel=1, right_track=1, right_channel=3):
    """
    智能左右手分離邏輯：
    1. 檢測同手可彈音符組（32分音符時間差內 + 音域不超過八度）
    2. 以組為單位分手，按組中心音高相對於中央C分配
    """
    print('=== split_hands called ===', file=sys.stderr, flush=True)
    print(f'Parameters: left_channel={left_channel}, right_channel={right_channel}', file=sys.stderr, flush=True)
    
    new_midi = mido.MidiFile(type=1, ticks_per_beat=midi.ticks_per_beat)
    
    # 常數設定
    # 注意：MIDI音高60是Middle C，但命名約定有兩種：
    # - MIDI標準：Middle C = C3 (Logic Pro默認)
    # - Roland/Korg約定：Middle C = C4 (本程序使用)
    pivot = 60  # 中央C (MIDI標準稱C3，Roland/Korg約定稱C4)
    max_time_diff = midi.ticks_per_beat // 8  # 32分音符的時間差
    max_pitch_span = 12  # 一個八度的半音數
    
    # 收集所有音符事件
    all_events = []
    note_events = []
    
    for track in midi.tracks:
        abs_time = 0
        for msg in track:
            abs_time += msg.time
            all_events.append({
                'time': abs_time,
                'msg': msg
            })
            
            # 只收集 note_on 事件用於分組
            if msg.type == 'note_on' and msg.velocity > 0:
                note_events.append({
                    'time': abs_time,
                    'note': msg.note,
                    'msg': msg
                })
    
    print(f"Total note_on events: {len(note_events)}", file=sys.stderr, flush=True)
    
    # 按時間排序
    note_events.sort(key=lambda x: x['time'])
    
    # 步驟1: 檢測同手可彈音符組
    groups = []
    processed = set()  # 追蹤已處理的音符索引
    
    for i, note_event in enumerate(note_events):
        if i in processed:
            continue
            
        # 開始新組
        current_group = [note_event]
        processed.add(i)
        group_start_time = note_event['time']
        
        # 查找所有可以加入這個組的音符
        changed = True
        while changed:
            changed = False
            for j, candidate in enumerate(note_events):
                if j in processed:
                    continue
                    
                # 檢查時間差（必須在32分音符時間差內）
                time_diff = abs(candidate['time'] - group_start_time)
                if time_diff > max_time_diff:
                    continue
                
                # 檢查音域跨度（加入後不能超過一個八度）
                group_notes = [e['note'] for e in current_group] + [candidate['note']]
                pitch_span = max(group_notes) - min(group_notes)
                
                if pitch_span <= max_pitch_span:
                    # 可以加入組
                    current_group.append(candidate)
                    processed.add(j)
                    changed = True
        
        groups.append(current_group)
    
    print(f"Detected {len(groups)} note groups", file=sys.stderr, flush=True)
    
    # 步驟2: 為每個組分配左右手
    hand_assignment = {}
    
    for group_idx, group in enumerate(groups):
        notes_in_group = [event['note'] for event in group]
        min_note = min(notes_in_group)
        max_note = max(notes_in_group)
        
        # 智能分手邏輯
        if max_note < pivot:
            # 組內所有音符都低於中央C -> 左手
            group_hand = 'left'
            reason = "all below C4"
        elif min_note >= pivot:
            # 組內所有音符都高於等於中央C -> 右手
            group_hand = 'right'
            reason = "all above/at C4"
        else:
            # 組內音符跨越中央C，比較最外側音符與中央C的距離
            low_distance = abs(min_note - pivot)   # 最低音與中央C的距離
            high_distance = abs(max_note - pivot)  # 最高音與中央C的距離
            
            # 考慮Logic Pro使用MIDI標準命名約定(Middle C = C3)的情況
            # 在MIDI標準中，音高57,60,65對應A2,C3,F3，應分配給左手
            # 包含中央C(60)且最低音在A3(57)或以下的組，優先分配給左手
            if 60 in notes_in_group and min_note <= 57:
                group_hand = 'left'
                reason = f"contains Middle C(60) with low note <= 57 -> MIDI standard naming compatibility (A2,C3,F3 in Logic Pro)"
            elif min_note < 49:  # 原有的強左手偏置邏輯
                group_hand = 'left'
                reason = f"min_note {min_note} (<49) -> strong left bias."
            elif high_distance > low_distance:
                # 高音離中央C更遠 -> 右手
                group_hand = 'right'
                reason = f"high note {max_note} (dist_h={high_distance}) farther from C4 than low note {min_note} (dist_l={low_distance})"
            else: # high_distance <= low_distance
                # 低音離中央C更遠或等距 -> 左手
                group_hand = 'left'
                reason = f"high note {max_note} (dist_h={high_distance}) not farther from C4 than low note {min_note} (dist_l={low_distance}) -> left hand"
        
        print(f"Group {group_idx}: notes={notes_in_group}, range=[{min_note}-{max_note}], hand={group_hand.upper()}, reason={reason}", file=sys.stderr, flush=True)
        
        # 為組內所有音符分配相同的手
        for event in group:
            key = (event['time'], event['note'])
            hand_assignment[key] = group_hand
    
    # 步驟3: 處理所有音符事件（包括 note_off）
    # 確保 note_off 與對應的 note_on 在同一手
    active_notes = {}  # {note: (time, hand)}
    
    for event in all_events:
        msg = event['msg']
        if msg.type in ['note_on', 'note_off']:
            key = (event['time'], msg.note)
            
            if msg.type == 'note_on' and msg.velocity > 0:
                # 從分組結果獲取手部分配
                hand = hand_assignment.get(key, 'right')  # 預設右手
                active_notes[msg.note] = (event['time'], hand)
                
            elif msg.type == 'note_off' or (msg.type == 'note_on' and msg.velocity == 0):
                # note_off 使用對應 note_on 的手
                if msg.note in active_notes:
                    _, hand = active_notes[msg.note]
                    hand_assignment[key] = hand
                    del active_notes[msg.note]
                else:
                    # 找不到對應的 note_on，使用預設分配
                    hand_assignment[key] = 'left' if msg.note < pivot else 'right'
    
    # 步驟4: 重建MIDI軌道 - 使用用戶指定的track和channel配置
    # 檢查左右手是否使用同一個track
    use_same_track = (left_track == right_track)
    
    if use_same_track:
        # 左右手在同一個track，使用不同channel
        print(f"Using same track ({left_track}) with different channels: left={left_channel}, right={right_channel}", file=sys.stderr, flush=True)
        
        combined_events = []
        
        for event in all_events:
            msg = event['msg']
            if msg.type in ['note_on', 'note_off']:
                key = (event['time'], msg.note)
                hand = hand_assignment.get(key, 'right')
                
                print(f"Final: note={msg.note}, hand={hand}", file=sys.stderr, flush=True)
                
                new_msg = msg.copy()
                if hasattr(new_msg, 'channel'):
                    # MIDI channels are 0-based
                    if hand == 'left':
                        new_msg.channel = left_channel - 1
                    else:
                        new_msg.channel = right_channel - 1
                    
                    print(f"Channel set to {new_msg.channel} for {hand} hand", file=sys.stderr, flush=True)
                    combined_events.append((event['time'], new_msg))
            else:
                # 非音符事件
                if msg.type != 'end_of_track':
                    combined_events.append((event['time'], msg.copy()))
        
        # 創建單一軌道
        main_track = mido.MidiTrack()
        add_events_to_track(main_track, combined_events)
        new_midi.tracks.append(main_track)
        
        # 如果指定的track不是1，需要創建空的前置軌道
        for i in range(1, left_track):
            empty_track = mido.MidiTrack()
            empty_track.append(mido.MetaMessage('end_of_track', time=0))
            new_midi.tracks.insert(-1, empty_track)
            
        print(f"分手完成: 左右手合併在track {left_track}，共 {len(combined_events)} 事件", file=sys.stderr, flush=True)
            
    else:
        # 左右手使用不同track（保留原有邏輯以防需要）
        print(f"Using different tracks: left={left_track}, right={right_track}", file=sys.stderr, flush=True)
        
        left_events = []
        right_events = []
        
        for event in all_events:
            msg = event['msg']
            if msg.type in ['note_on', 'note_off']:
                key = (event['time'], msg.note)
                hand = hand_assignment.get(key, 'right')
                
                print(f"Final: note={msg.note}, hand={hand}", file=sys.stderr, flush=True)
                
                new_msg = msg.copy()
                if hasattr(new_msg, 'channel'):
                    # MIDI channels are 0-based
                    if hand == 'left':
                        new_msg.channel = left_channel - 1
                        left_events.append((event['time'], new_msg))
                    else:
                        new_msg.channel = right_channel - 1
                        right_events.append((event['time'], new_msg))
                    print(f"Channel set to {new_msg.channel} for {hand} hand", file=sys.stderr, flush=True)
            else:
                # 非音符事件加入到兩個軌道
                if msg.type != 'end_of_track':
                    left_events.append((event['time'], msg.copy()))
                    right_events.append((event['time'], msg.copy()))
        
        # 創建左右手軌道
        left_track_obj = mido.MidiTrack()
        right_track_obj = mido.MidiTrack()
        
        # 使用輔助函數添加事件
        add_events_to_track(left_track_obj, left_events)
        add_events_to_track(right_track_obj, right_events)
        
        new_midi.tracks.append(left_track_obj)
        new_midi.tracks.append(right_track_obj)
        
        print(f"分手完成: 左手 {len(left_events)} 事件, 右手 {len(right_events)} 事件", file=sys.stderr, flush=True)
    
    return new_midi

def group_simultaneous_notes(note_events, eighth_note_duration):
    """
    將同時按下的音符（在八分音符時長內）分組
    """
    groups = []
    current_group = []
    group_start_time = None
    
    for event in note_events:
        if event['type'] != 'note_on' or event['velocity'] == 0:
            continue
            
        if group_start_time is None:
            group_start_time = event['time']
            current_group = [event]
        elif event['time'] - group_start_time <= eighth_note_duration:
            # 在同一組內
            current_group.append(event)
        else:
            # 開始新組
            if current_group:
                groups.append(current_group)
            group_start_time = event['time']
            current_group = [event]
    
    # 添加最後一組
    if current_group:
        groups.append(current_group)
    
    return groups

def add_events_to_track(track, events):
    """
    將事件添加到軌道，處理相對時間
    """
    if not events:
        track.append(mido.MetaMessage('end_of_track', time=0))
        return
    
    # 按時間排序
    events.sort(key=lambda x: x[0])
    
    last_time = 0
    for abs_time, msg in events:
        # 計算相對時間
        relative_time = abs_time - last_time
        
        # 創建新消息並設置相對時間
        new_msg = msg.copy()
        new_msg.time = relative_time
        track.append(new_msg)
        
        last_time = abs_time
    
    # 添加軌道結束標記
    track.append(mido.MetaMessage('end_of_track', time=0))
