# AI钢琴MIDI转五线谱Web工具

一个智能的钢琴MIDI文件处理工具，专为AI生成的钢琴MIDI优化，提供分手逻辑、BPM检测、音符清理等功能，帮助音乐爱好者快速生成高质量的钢琴五线谱。

## 主要功能

### 核心处理功能
- **智能分手逻辑**：自动分离左右手音符，支持Logic Pro等DAW的MIDI习惯
- **BPM自动检测**：从音频文件自动检测BPM，修复AI生成MIDI的节奏问题
- **音符智能清理**：过滤过短、过轻、超出音域的无效音符
- **重叠音符处理**：清理不合理的音符重叠，优化演奏效果
- **踏板事件修复**：修复AI生成的不自然踏板控制

### Web界面特性
- **现代化UI**：基于Tailwind CSS的响应式设计
- **拖拽上传**：支持MIDI文件和音频文件的便捷上传
- **实时处理**：异步处理，实时显示处理进度
- **详细说明**：内置分手逻辑和BPM处理的详细说明
- **多格式支持**：支持.mid、.mp3、.wav、.flac、.m4a等格式

## 快速开始

### 环境要求
- Python 3.7+
- 现代浏览器（Chrome、Firefox、Safari、Edge）

### 安装依赖
```bash
pip install -r requirements.txt
```

### 启动服务
```bash
# Linux/macOS
./start_server.sh

# Windows
start_server.bat

访问 `http://localhost:8080/index.html` 即可使用Web界面。

## 项目结构

**核心文件：**
- `index.html` - Web前端界面
- `main.css` - 样式文件  
- `main.js` - 前端交互逻辑
- `main.py` - FastAPI后端服务
- `requirements.txt` - Python依赖
- `LICENSE` - 开源许可证
- `hand_splitting_logic.md` - 分手逻辑说明

**核心处理模块 (`modules/`)：**
- `bpm_estimator.py` - BPM检测
- `hand_splitter.py` - 分手逻辑
- `midi_rescaler.py` - MIDI重新缩放
- `note_filter.py` - 音符过滤
- `midi_writer.py` - MIDI输出

**API接口 (`apis/`)：**
- `midi_upload_api.py` - MIDI上传API
- `audio_bpm_api.py` - BPM检测API

**数据目录 (`data/`)：**
- `input_audio/` - 音频输入
- `input_midi/` - MIDI输入
- `output_midi/` - 处理结果

**其他目录和脚本：**
- `uploads/` - 上传缓存
- `test/` - 测试文件
- `start_server.sh` - Linux/macOS启动脚本
- `start_server.bat` - Windows启动脚本
- `stop_server.sh` - 停止服务脚本

## 使用方法
1. 启动服务后访问 `http://localhost:8080/index.html`
2. 上传MIDI文件（.mid格式）
3. 可选：上传对应的音频文件用于BPM检测
4. 配置处理参数（BPM、分手设置等）
5. 点击"开始处理"，等待处理完成
6. 下载处理后的MIDI文件

## 智能分手逻辑

本工具采用基于规则的分手算法，特别针对以下情况进行优化：

- **Logic Pro兼容性**：自动识别Logic Pro等DAW的MIDI音符命名差异
- **和弦智能分配**：一个八度内的音符自动分配到同一只手
- **中央C规则**：包含中央C且最低音≤A3的音符组优先分配左手
- **音域分析**：基于音符分布自动判断左右手区域

详细说明请参考 [hand_splitting_logic.md](hand_splitting_logic.md)

## API接口

### MIDI处理接口
```
POST /process_midi
Content-Type: multipart/form-data

参数：
- midi_file: MIDI文件
- audio_file: 音频文件（可选）
- target_bpm: 目标BPM（可选）
- split_hands: 是否分手（默认true）
```

### BPM检测接口
```
POST /detect_bpm
Content-Type: multipart/form-data

参数：
- audio_file: 音频文件
```

## 配置选项

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `target_bpm` | 自动检测 | 目标BPM，留空则自动检测 |
| `split_hands` | true | 是否启用分手逻辑 |
| `filter_notes` | true | 是否过滤无效音符 |
| `min_note_duration` | 0.1 | 最小音符时长（秒） |
| `min_velocity` | 20 | 最小力度值 |

## 贡献指南

欢迎提交Issue和Pull Request！

1. Fork本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 更新日志

### v2.0.0 (2025-06-16)
- 全新Web界面，支持拖拽上传
- 优化分手逻辑，兼容Logic Pro等DAW
- 响应式设计，支持移动端
- 重构CSS架构，提升可维护性
- 增加详细的功能说明面板

### v1.0.0
- 基础MIDI处理功能
- 分手逻辑实现
- BPM检测功能

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 致谢

- [librosa](https://librosa.org/) - 音频分析
- [mido](https://mido.readthedocs.io/) - MIDI处理
- [FastAPI](https://fastapi.tiangolo.com/) - Web框架
- [Tailwind CSS](https://tailwindcss.com/) - UI框架

---

如有问题或建议，欢迎创建Issue或联系项目维护者。
