// 主 JS 腳本
// 全局變量
let currentMidiFile = null;
let fixedMidiBlob = null; // BPM修復後的MIDI文件
let fixedMidiFilename = null;
let filteredMidiBlob = null; // 音符過濾後的MIDI文件
let filteredMidiFilename = null;
let audioBpm = null; // 音頻解析出的BPM
let midiBpm = null;  // MIDI文件的BPM
let audioBpmAnalyzed = false; // 標記音頻BPM是否已經被成功解析

// 圖表相關變量
let bpmChart = null;
let velocityChart = null;
let durationChart = null;
let velocityTabBtn = null;

// 音符統計數據
let noteStats = {
  notes: [], // 存儲所有音符數據 {time, velocity, duration, pitch}
  totalNotes: 0,
  filteredNotes: 0
};

// 文件上傳狀態顯示
function setLog(msg, type = 'general') {
  var midiDiv = document.getElementById('midi-log');
  var audioDiv = document.getElementById('audio-log');
  if (!midiDiv || !audioDiv) return;
  if (type === 'midi') {
    midiDiv.innerHTML = msg || 'MIDI文件未上传';
  } else if (type === 'audio') {
    audioDiv.innerHTML = msg || '音频文件未上传';
  } else if (type === 'reset') {
    midiDiv.innerHTML = 'MIDI文件未上传';
    audioDiv.innerHTML = '音频文件未上传';
  }
  // 舊版兼容區塊（可移除）
  var logDiv = document.getElementById('upload-log');
  if (logDiv) logDiv.innerHTML = midiDiv.innerHTML + '<br>' + audioDiv.innerHTML;
}

// Tab切換邏輯
function setActiveTab(tab) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => {
    b.classList.remove('text-blue-600', 'border-blue-600');
    b.classList.add('text-gray-500', 'border-transparent');
  });
  tab.classList.add('text-blue-600', 'border-blue-600');
  tab.classList.remove('text-gray-500', 'border-transparent');
  
  if (tab.dataset.tab === 'duration') {
    document.getElementById('duration-container').classList.remove('hidden');
    document.getElementById('velocity-container').classList.add('hidden');
  } else {
    document.getElementById('duration-container').classList.add('hidden');
    document.getElementById('velocity-container').classList.remove('hidden');
  }
  
  // 切換後重新調整圖表大小
  if (tab.dataset.tab === 'duration') {
    if (window.durationChart) {
      window.durationChart.resize();
    }
  } else {
    if (window.velocityChart) {
      window.velocityChart.resize();
    }
  }
}

// 閾值線拖拽功能 ！！注意！容易出bug的功能，請勿輕易變更！！
function makeThresholdDraggable(lineId, chartId, tipId, options = {}) {
  let dragging = false;
  let currentValue = 0;
  
  const line = document.getElementById(lineId);
  const chartContainer = document.getElementById(chartId);
  
  if (!line || !chartContainer) return { setLinePosition: () => {} };
  
  function updateLineAndTip(value) {
    currentValue = value;
    if (options.onDrag) options.onDrag(value);
    
    const tip = document.getElementById(tipId);
    if (tip) {
      const isVelocity = options.type === 'velocity';
      tip.textContent = isVelocity ? `力度閾值: ${value}` : `時值閾值: ${value}ms`;
    }
  }
  
  function startDrag(e) {
    e.preventDefault();
    dragging = true;
    document.body.style.cursor = 'row-resize';
    
    const tip = document.getElementById(tipId);
    if (tip) tip.classList.remove('hidden');
  }
  
  line.addEventListener('mousedown', startDrag);
  
  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    
    const rect = chartContainer.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    // 圖表邊距設定（Chart.js 的實際數據區域邊距）
    const topMargin = 10;    // 頂部邊距（與圖表實際繪製區域一致）
    const bottomMargin = 30; // 底部邊距（與圖表實際繪製區域一致）
    
    // 計算有效的拖動範圍
    const effectiveHeight = height - topMargin - bottomMargin;
    const adjustedY = Math.max(topMargin, Math.min(height - bottomMargin, y));
    const percentage = (adjustedY - topMargin) / effectiveHeight;
    
    // 計算對應的數值（垂直位置越高，閾值越大）
    const maxValue = options.type === 'velocity' ? 127 : 1000;
    const value = Math.round((1 - percentage) * maxValue);
    
    updateLineAndTip(value);
    
    // 更新拖動線位置（相對於整個容器的百分比）
    const linePos = (adjustedY / height * 100) + '%';
    line.style.top = linePos;
  });
  
  document.addEventListener('mouseup', function() {
    if (dragging) {
      dragging = false;
      document.body.style.cursor = 'default';
      
      const tip = document.getElementById(tipId);
      if (tip) tip.classList.add('hidden');
    }
  });
  
  // 鼠標懸停顯示提示
  line.addEventListener('mouseenter', function() {
    const tip = document.getElementById(tipId);
    if (tip) tip.classList.remove('hidden');
  });
  
  line.addEventListener('mouseleave', function() {
    if (!dragging) {
      const tip = document.getElementById(tipId);
      if (tip) tip.classList.add('hidden');
    }
  });
  
  return {
    setLinePosition: function(value, type) {
      const maxValue = type === 'velocity' ? 127 : 1000;
      const valuePercentage = 1 - Math.max(0, Math.min(1, value / maxValue));
      
      // 圖表邊距設定（與拖動函數中相同）
      const topMargin = 10;
      const bottomMargin = 30;
      const rect = chartContainer.getBoundingClientRect();
      const height = rect.height;
      const effectiveHeight = height - topMargin - bottomMargin;
      
      // 計算在有效範圍內的位置，然後轉換為相對於整個容器的位置
      const adjustedY = topMargin + (valuePercentage * effectiveHeight);
      const linePos = (adjustedY / height * 100) + '%';
      
      line.style.top = linePos;
      updateLineAndTip(value);
    }
  };
}

// 動態載入 Chart.js
function loadChartJs(callback) {
  if (typeof Chart !== 'undefined') {
    callback();
    return;
  }
  
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  script.onload = callback;
  document.head.appendChild(script);
}

// 在 DOM 加載完成後初始化所有事件監聽器
document.addEventListener('DOMContentLoaded', function() {
  // 初始化訊息
  setLog('', 'reset');
  
  // 音頻上傳事件
  const audioUpload = document.getElementById('audio-upload');
  if (audioUpload) {
    audioUpload.addEventListener('change', function(e) {
      const file = e.target.files[0];
      const audioStatus = document.getElementById('audio-status');
      if (audioStatus) {
        audioStatus.textContent = file ? `已選擇：${file.name}` : '未選擇檔案';
      }
      if (file) {
        setLog('正在上傳音訊...', 'audio');
        uploadAudioOnly();
        analyzeAudioBpm(file);
      } else {
        setLog('音频文件未上传', 'audio');
      }
    });
  }
  
  // MIDI上傳事件
  const midiUpload = document.getElementById('midi-upload');
  if (midiUpload) {
    midiUpload.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      currentMidiFile = file; // 保存文件引用
      
      // 重置所有處理後的文件狀態
      fixedMidiBlob = null;
      fixedMidiFilename = null;
      filteredMidiBlob = null;
      filteredMidiFilename = null;
      
      const midiStatus = document.getElementById('midi-status');
      if (midiStatus) {
        midiStatus.textContent = file ? `已選擇：${file.name}` : '未選擇檔案';
      }
      
      if (file) {
        setLog('正在上傳並解析MIDI...', 'midi');
        
        // 重置結果區域
        const resultFilenameElement = document.getElementById('result-filename');
        if (resultFilenameElement) {
          resultFilenameElement.textContent = '修正後的MIDI檔案.mid';
        }
        
        // 禁用下載按鈕
        const downloadBtn = document.getElementById('download-result-btn');
        if (downloadBtn) {
          downloadBtn.disabled = true;
        }
        
        await uploadMidiOnly();
        // 繪製散點圖
        await drawVelocityScatterPlot(file);
        await drawDurationScatterPlot(file);
      } else {
        setLog('MIDI文件未上傳', 'midi');
        currentMidiFile = null;
        // 重置結果區域
        const resultFilenameElement = document.getElementById('result-filename');
        if (resultFilenameElement) {
          resultFilenameElement.textContent = '修正後的MIDI檔案.mid';
        }
        
        // 禁用下載按鈕
        const downloadBtn = document.getElementById('download-result-btn');
        if (downloadBtn) {
          downloadBtn.disabled = true;
        }
      }
    });
  }
  
  // BPM修復按鈕
  const fixBpmBtn = document.getElementById('fix-bpm-btn');
  if (fixBpmBtn) {
    fixBpmBtn.addEventListener('click', function() {
      const input = document.getElementById('bpm-input');
      if (input) {
        input.disabled = !input.disabled;
        if (!input.disabled) input.focus();
      }
    });
  }
  
  // Tab按鈕事件
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() { 
      setActiveTab(this); 
    });
    
    // 設置velocity tab按鈕引用
    if (btn.dataset.tab === 'velocity') {
      velocityTabBtn = btn;
    }
  });
  
  // 初始化拖拽功能  ！！注意！容易出bug的功能，請勿輕易變更！！
  const velocityDrag = makeThresholdDraggable('velocity-threshold', 'velocity-container', 'velocity-tip', {
    type: 'velocity',
    onDrag: v => { 
      const minVelocityInput = document.getElementById('min-velocity-input');
      if (minVelocityInput) {
        minVelocityInput.value = v;
      }
      updateNoteStats();
    }
  });
  
  const durationDrag = makeThresholdDraggable('duration-threshold', 'duration-container', 'duration-tip', {
    type: 'duration',
    onDrag: v => { 
      const minDurationInput = document.getElementById('min-duration-input');
      if (minDurationInput) {
        minDurationInput.value = v;
      }
      updateNoteStats();
    }
  });
  
  // 輸入框事件監聽器  ！！注意！容易出bug的功能，請勿輕易變更！！
  const minVelocityInput = document.getElementById('min-velocity-input');
  if (minVelocityInput) {
    minVelocityInput.addEventListener('input', function() {
      if (velocityTabBtn) setActiveTab(velocityTabBtn);
      velocityDrag.setLinePosition(this.value, 'velocity');
      updateNoteStats();
    });
  }
  
  const minDurationInput = document.getElementById('min-duration-input');
  if (minDurationInput) {
    minDurationInput.addEventListener('input', function() {
      const durationTab = document.querySelector('[data-tab="duration"]');
      if (durationTab) setActiveTab(durationTab);
      durationDrag.setLinePosition(this.value, 'duration');
      updateNoteStats();
    });
  }
  
  // 範圍選擇器
  const rangeLimitSelect = document.getElementById('range-limit-select');
  if (rangeLimitSelect) {
    rangeLimitSelect.addEventListener('change', function() {
      var custom = document.getElementById('custom-range-inputs');
      if (custom) {
        if (this.value === 'custom') {
          custom.classList.remove('hidden');
        } else {
          custom.classList.add('hidden');
        }
      }
      updateNoteStats();
    });
  }
  
  // 過濾條件複選框
  const filterCheckboxes = [
    'filter-velocity-checkbox',
    'filter-duration-checkbox',
    'filter-range-checkbox'
  ];
  
  filterCheckboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', updateNoteStats);
    }
  });
  
  // 自定義範圍輸入框
  const customRangeMin = document.getElementById('custom-range-min');
  const customRangeMax = document.getElementById('custom-range-max');
  
  if (customRangeMin) customRangeMin.addEventListener('input', updateNoteStats);
  if (customRangeMax) customRangeMax.addEventListener('input', updateNoteStats);
  
  // 推薦值按鈕事件監聽器
  const durationRecommendBtn = document.getElementById('duration-recommend-btn');
  if (durationRecommendBtn) {
    durationRecommendBtn.addEventListener('click', function() {
      const recommendedDuration = calculateRecommendedDuration();
      if (recommendedDuration !== null) {
        const minDurationInput = document.getElementById('min-duration-input');
        if (minDurationInput) {
          minDurationInput.value = recommendedDuration;
          const durationTab = document.querySelector('[data-tab="duration"]');
          if (durationTab) setActiveTab(durationTab);
          durationDrag.setLinePosition(recommendedDuration, 'duration');
          updateNoteStats();
        }
      }
    });
  }
  
  // 「執行清理」按鈕事件監聽器
  const filterBtn = document.getElementById('filter-notes-btn');
  if (filterBtn) {
    filterBtn.addEventListener('click', async function() {
      // 檢查是否有可用的MIDI文件（優先使用BPM修復後的文件）
      const hasBpmFixedFile = fixedMidiBlob && fixedMidiFilename;
      const hasOriginalFile = currentMidiFile;
      
      if (!hasBpmFixedFile && !hasOriginalFile) {
        alert('請先上傳 MIDI 文件');
        return;
      }
      
      // 如果有BPM修復後的文件，提示用戶
      if (hasBpmFixedFile) {
        console.log('使用BPM修復後的MIDI文件進行音符清理');
      }
      
      // 禁用按鈕，顯示加載狀態
      filterBtn.disabled = true;
      filterBtn.textContent = '處理中...';
      
      try {
        await executeNoteFiltering();
      } catch (error) {
        console.error('音符過濾失敗:', error);
        alert('音符過濾失敗: ' + error.message);
      } finally {
        // 恢復按鈕狀態
        filterBtn.disabled = false;
        filterBtn.textContent = '執行清理';
      }    });
  }

  // 「執行處理」按鈕事件監聽器（左右手分離、踏板補全、重疊調整）
  const processMidiBtn = document.getElementById('process-midi-btn');
  if (processMidiBtn) {
    processMidiBtn.addEventListener('click', async function() {
      // 檢查是否有可用的MIDI文件（優先使用過濾後的文件）
      const hasFilteredFile = filteredMidiBlob && filteredMidiFilename;
      const hasBpmFixedFile = fixedMidiBlob && fixedMidiFilename;
      const hasOriginalFile = currentMidiFile;
      
      if (!hasFilteredFile && !hasBpmFixedFile && !hasOriginalFile) {
        alert('請先上傳 MIDI 文件');
        return;
      }
      
      // 禁用按鈕，顯示加載狀態
      processMidiBtn.disabled = true;
      processMidiBtn.textContent = '處理中...';
      
      try {
        await executeMidiProcessing();
      } catch (error) {
        console.error('MIDI處理失敗:', error);
        alert('MIDI處理失敗: ' + error.message);
      } finally {
        // 恢復按鈕狀態
        processMidiBtn.disabled = false;
        processMidiBtn.textContent = '執行處理';
      }
    });
  }

  // 下載結果按鈕事件監聽器
  const downloadBtn = document.getElementById('download-result-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      let fileToDownload, filenameToDownload;
      
      // 優先級：過濾後的文件 > BPM修復後的文件 > 原始文件
      if (filteredMidiBlob && filteredMidiFilename) {
        fileToDownload = filteredMidiBlob;
        filenameToDownload = filteredMidiFilename;
      } else if (fixedMidiBlob && fixedMidiFilename) {
        fileToDownload = fixedMidiBlob;
        filenameToDownload = fixedMidiFilename;
      } else if (currentMidiFile) {
        // 如果沒有處理後的文件，直接下載原始文件
        const url = URL.createObjectURL(currentMidiFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentMidiFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      } else {
        alert('沒有可下載的文件');
        return;
      }
      
      // 下載處理後的文件
      const url = URL.createObjectURL(fileToDownload);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameToDownload;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
  
  // 初始化BPM圖表容器
  const bpmChartDiv = document.getElementById('bpm-chart-container');
  if (bpmChartDiv) {
    bpmChartDiv.innerHTML = '<canvas id="bpm-chart-canvas" height="180" style="width:100%"></canvas>';
  }
  
  // 初始化BPM修復功能
  executeBpmFixing();
  
  window.addEventListener('beforeunload', async function () {
    try {
      await fetch('http://localhost:8000/cleanup-uploads', { method: 'POST' });
    } catch (e) {
      // 靜默失敗即可
    }
  });
});

// 文件上傳和服務器通信函數
async function uploadToServer() {
  const midiInput = document.getElementById('midi-upload');
  const audioInput = document.getElementById('audio-upload');
  if (!midiInput.files[0]) {
    setLog('請先選擇MIDI檔案');
    return;
  }
  const formData = new FormData();
  formData.append('midi', midiInput.files[0]);
  if (audioInput.files[0]) formData.append('audio', audioInput.files[0]);
  setLog('正在上傳並解析MIDI...', 'midi');
  try {
    const resp = await fetch('http://localhost:8000/upload', {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.success) {
      setLog('上傳成功！音符數：' + data.note_count, 'midi');
      if (data.audio_info) {
        setLog('音頻解析成功！BPM：' + data.audio_info.bpm, 'audio');
      }
    } else {
      setLog('上傳失敗：' + (data.error || '未知錯誤'), 'midi');
    }
  } catch (e) {
    setLog('上傳或解析過程出現錯誤：' + e);
  }
}

async function uploadMidiOnly() {
  const midiInput = document.getElementById('midi-upload');
  if (!midiInput.files[0]) {
    setLog('請先選擇MIDI檔案');
    return;
  }
  const formData = new FormData();
  formData.append('midi', midiInput.files[0]);
  setLog('正在上傳並解析MIDI...', 'midi');
  try {
    const resp = await fetch('http://localhost:8000/upload', {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.success) {
      let midiMsg = 'MIDI上傳成功！';
      if (data.midi_info) {
        const noteCount = data.midi_info.note_count;
        const trackCount = data.midi_info.track_count || (data.midi_info.multi_track ? 2 : 1);
        const channelCount = data.midi_info.channel_count ? `，Channel數：${data.midi_info.channel_count}` : '';
        const bpm = data.midi_info.bpm ? `，BPM：${data.midi_info.bpm}` : '';
        midiMsg += ` 音符數：${noteCount}，音軌數：${trackCount}${channelCount}${bpm}`;
        
        // 保存MIDI BPM用於推薦值計算
        if (data.midi_info.bpm) {
          midiBpm = data.midi_info.bpm;
        }
      }
      setLog(midiMsg, 'midi');
    } else {
      setLog('MIDI上傳失敗：' + (data.error || '未知錯誤'), 'midi');
    }
  } catch (e) {
    setLog('MIDI上傳或解析過程出現錯誤：' + e);
  }
}

async function uploadAudioOnly() {
  const audioInput = document.getElementById('audio-upload');
  if (!audioInput.files[0]) {
    setLog('請先選擇音訊檔案');
    return;
  }
  const formData = new FormData();
  formData.append('audio', audioInput.files[0]);
  setLog('正在上傳並解析音訊...', 'audio');
  audioBpmAnalyzed = false; // 每次上傳重置
  try {
    const resp = await fetch('http://localhost:8000/upload', {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.success) {
      if (data.audio_info) {
        setLog('音頻解析成功！BPM：' + data.audio_info.bpm, 'audio');
      } else if (!audioBpmAnalyzed) {
        setLog('音頻上傳成功，但無法解析BPM', 'audio');
      }
    } else {
      setLog('音頻上傳失敗：' + (data.error || '未知錯誤'), 'audio');
    }
  } catch (e) {
    setLog('音頻上傳或解析過程出現錯誤：' + e, 'audio');
  }
}

// BPM分析函數
async function analyzeAudioBpm(file) {
  const formData = new FormData();
  formData.append('audio', file);
  try {
    const resp = await fetch('http://localhost:8000/analyze-bpm', {
      method: 'POST',
      body: formData
    });
    const data = await resp.json();
    if (data.times && data.bpms && data.bpms.length > 0) {
      audioBpmAnalyzed = true;
      // 計算平均BPM
      audioBpm = data.bpms.reduce((sum, bpm) => sum + bpm, 0) / data.bpms.length;
      renderBpmChart(data.times, data.bpms);
      // 更新音訊狀態欄
      const audioStatusElement = document.getElementById('audio-status');
      if (audioStatusElement) {
        audioStatusElement.textContent = `已選擇：${file.name} (BPM: ${audioBpm.toFixed(1)})`;
      }
      // 更新音訊log欄
      const audioLog = document.getElementById('audio-log');
      if (audioLog) {
        audioLog.textContent = `音訊節奏分析完成！BPM: ${audioBpm.toFixed(2)}`;
      }
      // 自動填入bpm-input欄位
      const bpmInput = document.getElementById('bpm-input');
      if (bpmInput) {
        bpmInput.value = audioBpm.toFixed(2);
      }
      audioBpmAnalyzed = true; // 標記音頻BPM已成功解析
    } else {
      const audioLog = document.getElementById('audio-log');
      if (audioLog) {
        audioLog.textContent = '音頻上傳成功，但無法解析BPM';
      }
      console.error('BPM 分析失敗:', data.error || '無效的響應格式');
    }
  } catch (error) {
    console.error('BPM 分析請求失敗:', error);
  }
}

function renderBpmChart(times, bpms) {
  loadChartJs(function() {
    let bpmChartDiv = document.getElementById('bpm-chart-container');
    let ctx = document.getElementById('bpm-chart-canvas');
    if (!ctx && bpmChartDiv) {
      bpmChartDiv.innerHTML = '<canvas id="bpm-chart-canvas" height="180" style="width:100%"></canvas>';
      ctx = document.getElementById('bpm-chart-canvas');
    }
    if (!ctx) return;
    if (bpmChart) { bpmChart.destroy(); }
    if (!bpms || bpms.length === 0) {
      ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
      return;
    }
    const avgBpm = bpms.length ? (bpms.reduce((a,b)=>a+b,0)/bpms.length).toFixed(2) : '';
    function drawChart() {
      bpmChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: times.map(t => {
            const m = Math.floor(t / 60);
            const s = Math.floor(t % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
          }),
          datasets: [{
            label: 'BPM',
            data: bpms,
            borderColor: 'rgb(99, 102, 241)',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { title: { display: false, text: '' } },
            y: { title: { display: true, text: 'BPM' } }
          }
        }
      });
    }
    if (typeof Chart === 'undefined') {
      setTimeout(drawChart, 100);
    } else {
      drawChart();
    }
  });
}

// MIDI 處理函數
function noteNameToMidi(noteName) {
  const noteMap = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
  };
  
  const match = noteName.match(/([A-G]#?)(\d+)/);
  if (!match) return null;
  
  const [, note, octave] = match;
  return noteMap[note] + (parseInt(octave) + 1) * 12;
}

function midiToNoteName(midiNumber) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNumber / 12) - 1;
  const note = noteNames[midiNumber % 12];
  return note + octave;
}

// 音符統計更新函數
function updateNoteStats() {
  if (!noteStats.notes || noteStats.notes.length === 0) {
    return;
  }
  
  // 獲取過濾條件
  const filterVelocityEnabled = document.getElementById('filter-velocity-checkbox')?.checked || false;
  const filterDurationEnabled = document.getElementById('filter-duration-checkbox')?.checked || false;
  const filterRangeEnabled = document.getElementById('filter-range-checkbox')?.checked || false;
  
  const minVelocity = parseInt(document.getElementById('min-velocity-input')?.value || 0);
  const minDuration = parseInt(document.getElementById('min-duration-input')?.value || 0);
  
  // 獲取音域過濾條件
  let rangeMin = null, rangeMax = null;
  if (filterRangeEnabled) {
    const rangeLimitSelect = document.getElementById('range-limit-select');
    const selectedRange = rangeLimitSelect?.value;
    
    if (selectedRange === 'custom') {
      const customMin = document.getElementById('custom-range-min')?.value;
      const customMax = document.getElementById('custom-range-max')?.value;
      if (customMin) rangeMin = noteNameToMidi(customMin);
      if (customMax) rangeMax = noteNameToMidi(customMax);
    } else if (selectedRange) {
      const ranges = {
        '88': [21, 108],    // A0-C8 (88鍵)
        '76': [28, 103],    // E1-G7 (76鍵)
        '61': [36, 96]      // C2-C7 (61鍵)
      };
      if (ranges[selectedRange]) {
        [rangeMin, rangeMax] = ranges[selectedRange];
      }
    }
  }
  
  // 計算過濾統計
  let filteredCount = 0;
  
  noteStats.notes.forEach(note => {
    let shouldFilter = false;
    
    // 力度過濾
    if (filterVelocityEnabled && note.velocity < minVelocity) {
      shouldFilter = true;
    }
    
    // 時值過濾 (minDuration是毫秒，note.duration是秒，需要轉換)
    if (filterDurationEnabled && note.duration * 1000 < minDuration) {
      shouldFilter = true;
    }
    
    // 音域過濾
    if (filterRangeEnabled) {
      if (rangeMin !== null && note.pitch < rangeMin) {
        shouldFilter = true;
      }
      if (rangeMax !== null && note.pitch > rangeMax) {
        shouldFilter = true;
      }
    }
    
    if (shouldFilter) {
      filteredCount++;
    }
  });
  
  noteStats.filteredNotes = filteredCount;
  
  // 更新顯示
  const statsElement = document.getElementById('note-stats');
  if (statsElement) {
    const totalNotes = noteStats.notes.length;
    const retainedNotes = totalNotes - filteredCount;
    const retainPercentage = totalNotes > 0 ? ((retainedNotes / totalNotes) * 100).toFixed(1) : '0';
    
    statsElement.innerHTML = `
        <span>總音符數：<b>${totalNotes}</b></span>
        <span>將被刪除：<b>${filteredCount}</b></span>
        <span>保留比例：<b>${retainPercentage}%</b></span>
    `;
  }
}

// 執行音符過濾
async function executeNoteFiltering() {
  // 檢查是否有音符數據
  if (!noteStats.notes || noteStats.notes.length === 0) {
    alert('請先上傳 MIDI 文件');
    return;
  }
  
  // 獲取過濾條件
  const filterVelocityEnabled = document.getElementById('filter-velocity-checkbox')?.checked || false;
  const filterDurationEnabled = document.getElementById('filter-duration-checkbox')?.checked || false;
  const filterRangeEnabled = document.getElementById('filter-range-checkbox')?.checked || false;
  
  const minVelocity = parseInt(document.getElementById('min-velocity-input')?.value || 0);
  const minDuration = parseInt(document.getElementById('min-duration-input')?.value || 0);
  
  // 獲取音域過濾條件
  let rangeMin = null, rangeMax = null;
  if (filterRangeEnabled) {
    const rangeLimitSelect = document.getElementById('range-limit-select');
    const selectedRange = rangeLimitSelect?.value;
    
    if (selectedRange === 'custom') {
      const customMin = document.getElementById('custom-range-min')?.value;
      const customMax = document.getElementById('custom-range-max')?.value;
      if (customMin) rangeMin = noteNameToMidi(customMin);
      if (customMax) rangeMax = noteNameToMidi(customMax);
    } else if (selectedRange) {
      const ranges = {
        '88': [21, 108],  // 88鍵（A0–C8）
        '76': [28, 103],  // 76鍵（E1–G7）
        '61': [36, 96]    // 61鍵（C2–C7）
      };
      if (ranges[selectedRange]) {
        [rangeMin, rangeMax] = ranges[selectedRange];
      }
    }
  }
  
  // 準備過濾參數
  const filterParams = {
    filter_velocity: filterVelocityEnabled,
    filter_duration: filterDurationEnabled,
    filter_range: filterRangeEnabled,
    min_velocity: minVelocity,
    min_duration: minDuration,
    range_min: rangeMin,
    range_max: rangeMax
  };
  
  try {
    // 準備要發送的文件
    let fileToFilter = null;
    let formData = new FormData();
    
    // 優先使用BPM修復後的文件
    if (fixedMidiBlob) {
      formData.append('midi_file', fixedMidiBlob, fixedMidiFilename || 'fixed.mid');
    } else if (currentMidiFile) {
      formData.append('midi_file', currentMidiFile);
    } else {
      throw new Error('沒有可用的MIDI文件');
    }
    
    // 添加過濾參數作為JSON字符串
    formData.append('filter_params', JSON.stringify(filterParams));
    
    console.log('發送音符過濾請求，參數:', filterParams);
    
    const response = await fetch('http://localhost:8000/filter-notes', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // 處理返回的過濾後文件
      if (data.filtered_file) {
        // 將base64數據轉換為Blob
        const binaryString = atob(data.filtered_file);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        filteredMidiBlob = new Blob([bytes], { type: 'audio/midi' });
        const originalName = currentMidiFile ? currentMidiFile.name : 'processed.mid';
        const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
        filteredMidiFilename = `${nameWithoutExt}_filtered.mid`;
        
        // 更新結果區域
        const resultFilenameElement = document.getElementById('result-filename');
        if (resultFilenameElement) {
          resultFilenameElement.textContent = filteredMidiFilename;
        }
        
        // 啟用下載按鈕
        const downloadBtn = document.getElementById('download-result-btn');
        if (downloadBtn) {
          downloadBtn.disabled = false;
        }
        
        console.log('音符過濾完成:', data.stats);
        alert(`音符過濾完成！\n原音符數：${data.stats.original_notes}\n過濾後音符數：${data.stats.filtered_notes}\n刪除比例：${((data.stats.original_notes - data.stats.filtered_notes) / data.stats.original_notes * 100).toFixed(1)}%`);
      } else {
        throw new Error('服務器沒有返回過濾後的文件');
      }
    } else {
      throw new Error(data.error || '音符過濾失敗');
    }
  } catch (error) {
    console.error('音符過濾錯誤:', error);
    throw error;
  }
}

// 計算推薦持續時間
function calculateRecommendedDuration() {
  // 使用固定的推薦值邏輯
  let recommendedMs = 100; // 默認推薦值
  
  // 如果有MIDI BPM，根據BPM計算推薦值
  if (midiBpm) {
    // 計算16分音符的毫秒數
    const sixteenthNoteMs = (60 / midiBpm / 4) * 1000;
    // 推薦值設為16分音符的一半，這樣可以過濾掉極短的雜音
    recommendedMs = Math.round(sixteenthNoteMs / 2);
    // 限制在合理範圍內
    recommendedMs = Math.max(50, Math.min(recommendedMs, 200));
  }
  
  console.log(`推薦持續時間: ${recommendedMs}ms (基於BPM: ${midiBpm || '未知'})`);
  return recommendedMs;
}

// 執行MIDI處理的主函數（左右手分離、踏板補全、重疊調整）
async function executeMidiProcessing() {
  // 收集處理參數
  const processParams = {
    handSplit: document.getElementById('hand-split-checkbox')?.checked || false,
    leftHandTrack: parseInt(document.getElementById('left-hand-track')?.value) || 1,
    leftHandChannel: parseInt(document.getElementById('left-hand-channel')?.value) || 1,
    rightHandTrack: parseInt(document.getElementById('right-hand-track')?.value) || 1,
    rightHandChannel: parseInt(document.getElementById('right-hand-channel')?.value) || 3,
    overlapClean: document.getElementById('overlap-clean-checkbox')?.checked || false,
    pedalFix: document.getElementById('pedal-fix-checkbox')?.checked || false,
    pedalGap: parseInt(document.getElementById('pedal-gap-input')?.value) || 80
  };

  // 創建 FormData，注意key必須為 midi（不是 midi_file）
  const formData = new FormData();
  let midiFileToProcess;
  let originalFilename;
  if (filteredMidiBlob && filteredMidiFilename) {
    midiFileToProcess = new File([filteredMidiBlob], filteredMidiFilename, { type: 'audio/midi' });
    originalFilename = filteredMidiFilename;
    formData.append('midi', midiFileToProcess);
    console.log('使用過濾後的MIDI文件:', filteredMidiFilename);
  } else if (fixedMidiBlob && fixedMidiFilename) {
    midiFileToProcess = new File([fixedMidiBlob], fixedMidiFilename, { type: 'audio/midi' });
    originalFilename = fixedMidiFilename;
    formData.append('midi', midiFileToProcess);
    console.log('使用BPM修復後的MIDI文件:', fixedMidiFilename);
  } else if (currentMidiFile) {
    midiFileToProcess = currentMidiFile;
    originalFilename = currentMidiFile.name;
    formData.append('midi', midiFileToProcess);
    console.log('使用原始MIDI文件:', currentMidiFile.name);
  } else {
    throw new Error('沒有可用的MIDI文件');
  }
  formData.append('process_params', JSON.stringify(processParams));

  // 發送到後端進行處理
  const response = await fetch('http://localhost:8000/process-midi', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // 檢查回應類型
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '未知錯誤');
    }
  } else {
    // 保存處理後的文件
    const blob = await response.blob();
    const processedFilename = 'processed_' + (originalFilename || 'output.mid');
    filteredMidiBlob = blob;
    filteredMidiFilename = processedFilename;
    // 更新結果區塊的文件名顯示
    const resultFilenameElement = document.getElementById('result-filename');
    if (resultFilenameElement) {
      resultFilenameElement.textContent = processedFilename;
    }
    // 啟用下載按鈕
    const downloadBtn = document.getElementById('download-result-btn');
    if (downloadBtn) {
      downloadBtn.disabled = false;
    }
    alert('MIDI處理完成！請到結果匯出區域下載文件。');
  }
}

// BPM修復處理函數
async function executeBpmFixing() {
  const fixBpmBtn = document.getElementById('fix-bpm-btn');
  const midiInput = document.getElementById('midi-upload');
  
  if (!fixBpmBtn || !midiInput) return;
  
  fixBpmBtn.addEventListener('click', async function() {
    // 檢查是否有可用的MIDI文件
    const hasOriginalFile = currentMidiFile;
    
    if (!hasOriginalFile) {
      alert('請先上傳 MIDI 文件');
      return;
    }
    
    const bpmInput = document.getElementById('bpm-input');
    const targetBpm = parseFloat(bpmInput.value);
    
    if (!targetBpm || targetBpm <= 0) {
      alert('請輸入有效的BPM值');
      return;
    }
    
    // 禁用按鈕，顯示加載狀態
    fixBpmBtn.disabled = true;
    fixBpmBtn.textContent = '處理中...';
    
    try {
      // 準備FormData
      const formData = new FormData();
      formData.append('midi_file', currentMidiFile);
      formData.append('target_bpm', targetBpm);
      
      console.log('發送BPM修復請求，目標BPM:', targetBpm);
      
      const response = await fetch('http://localhost:8000/change-bpm', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 處理返回的修復後文件
        if (data.fixed_file) {
          // 將base64數據轉換為Blob
          const binaryString = atob(data.fixed_file);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          fixedMidiBlob = new Blob([bytes], { type: 'audio/midi' });
          const originalName = currentMidiFile.name;
          const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
          fixedMidiFilename = `${nameWithoutExt}_bpm${targetBpm}.mid`;
          
          // 更新結果區域
          const resultFilenameElement = document.getElementById('result-filename');
          if (resultFilenameElement) {
            resultFilenameElement.textContent = fixedMidiFilename;
          }
          
          // 啟用下載按鈕
          const downloadBtn = document.getElementById('download-result-btn');
          if (downloadBtn) {
            downloadBtn.disabled = false;
          }
          
          console.log('BPM修復完成:', data.info);
          alert(`BPM修復完成！\n原BPM：${data.info.original_bpm}\n新BPM：${data.info.new_bpm}`);
        } else {
          throw new Error('服務器沒有返回修復後的文件');
        }
      } else {
        throw new Error(data.error || 'BPM修復失敗');
      }
    } catch (error) {
      console.error('BPM修復失敗:', error);
      alert('BPM修復失敗: ' + error.message);
    } finally {
      // 恢復按鈕狀態
      fixBpmBtn.disabled = false;
      fixBpmBtn.textContent = '修復BPM';
    }
  });
}

// 绘制力度散点图 ！！重要功能！请勿轻易变更！！
async function drawVelocityScatterPlot(midiFile) {
  try {
    const formData = new FormData();
    formData.append('midi', midiFile);
    
    const response = await fetch('http://localhost:8000/analyze-midi', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '分析MIDI失敗');
    }
    
    const ctx = document.getElementById('velocity-chart');
    if (!ctx) {
      console.error('找不到velocity-chart canvas元素');
      return;
    }
    
    // 销毁现有图表
    if (window.velocityChart) {
      window.velocityChart.destroy();
    }
    
    // 处理后端返回的数据结构
    const noteTimes = data.note_times || [];
    const velocities = data.velocities || [];
    const durations = data.durations || [];
    const pitches = data.pitches || [];
    
    // 保存音符数据到noteStats用于统计
    noteStats.notes = noteTimes.map((time, index) => ({
      time: time,
      velocity: velocities[index] || 0,
      duration: durations[index] || 0,
      pitch: pitches[index] || 60
    }));
    
    const chartData = noteTimes.map((time, index) => ({
      x: time * 1000, // 转换为毫秒
      y: velocities[index] || 0
    }));
    
    window.velocityChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data: chartData,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: 'rgba(59, 130, 246, 1)',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              callback: function(value, index, values) {
                // 只在最后一个刻度添加单位 (數據是毫秒，顯示為秒)
                if (index === values.length - 1) {
                  return (value / 1000).toFixed(1) + ' (s)';
                }
                return (value / 1000).toFixed(1);
              }
            }
          },
          y: {
            min: 0,
            max: 127
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
    
    // 更新统计信息
    updateNoteStats();
    
  } catch (error) {
    console.error('绘制力度散点图失败:', error);
  }
}

// 绘制持续时间散点图
async function drawDurationScatterPlot(midiFile) {
  try {
    const formData = new FormData();
    formData.append('midi', midiFile);
    
    const response = await fetch('http://localhost:8000/analyze-midi', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '分析MIDI失敗');
    }
    
    const ctx = document.getElementById('duration-chart');
    if (!ctx) {
      console.error('找不到duration-chart canvas元素');
      return;
    }
    
    // 销毁现有图表
    if (window.durationChart) {
      window.durationChart.destroy();
    }
    
    // 处理后端返回的数据结构
    const noteTimes = data.note_times || [];
    const durations = data.durations || [];
    const chartData = noteTimes.map((time, index) => ({
      x: time * 1000, // 转换为毫秒
      y: (durations[index] || 0) * 1000 // 转换为毫秒
    }));
    
    window.durationChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [{
          data: chartData,
          backgroundColor: 'rgba(34, 197, 94, 0.6)',
          borderColor: 'rgba(34, 197, 94, 1)',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              callback: function(value, index, values) {
                // 只在最后一个刻度添加单位 (數據是毫秒，顯示為秒)
                if (index === values.length - 1) {
                  return (value / 1000).toFixed(1) + ' (s)';
                }
                return (value / 1000).toFixed(1);
              }
            }
          },
          y: {
            min: 0,
            max: 1000
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
    
    // 更新统计信息
    updateNoteStats();
    
  } catch (error) {
    console.error('绘制持续时间散点图失败:', error);
  }
}