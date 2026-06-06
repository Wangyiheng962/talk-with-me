# LIRA SOE 发音评测设计方案

## 概述

在 LIRA 英语口语陪练系统中集成腾讯云智聆口语评测（SOE），实现发音评测功能。

## 技术选型

### 架构方案

使用 **asyncio.Queue** 作为后台任务队列，实现实时后台处理：

```
用户说话 → STT 识别 → LLM 纠错 → 前端展示
              ↓
         音频 + 文本 丢队列
              ↓
         后台 SOE Worker
              ↓
         异步评测 → 结果存入 JSONL
```

### 为什么选 asyncio.Queue

| 方案 | 复杂度 | 依赖 | 适合场景 |
|------|--------|------|----------|
| asyncio.Queue | 低 | 无 | 单体应用、音频临时 |
| Celery | 高 | Redis | 分布式、生产环境 |
| ARQ | 中 | Redis | 需要重试、持久化 |

LIRA 场景：
- 单体应用
- 音频临时（评测后不需长期存储）
- 无需分布式
- **结论：asyncio.Queue 足够**

## 音频存储方案

### 目录结构

```
conversations/
  {session_id}/
    conversation.jsonl      # 对话记录
    audio/
      turn_0.wav            # 用户说的第1句
      turn_1.wav            # 用户说的第2句
      turn_2.wav            # ...
```

### 为什么用 turn 序号

- 简单、顺序清晰
- 前端可直接拼路径：`/api/sessions/{session_id}/audio/0`

### API 设计

```
GET /api/sessions/{session_id}/audio/{turn_index}
```

返回 WAV 文件，前端可直接播放：

```typescript
<audio src={`/api/sessions/${sessionId}/audio/${turnIndex}`} controls />
```

## 数据结构

### JSONL 记录扩展

```json
{
  "type": "turn",
  "session_id": "abc123",
  "turn_index": 0,
  "audio_path": "conversations/abc123/audio/turn_0.wav",
  "user_text": "Hello",
  "agent_text": "Hi! Try saying...",
  "correction": true,
  "soe_result": {
    "pronunciation": 85,
    "fluency": 78,
    "integrity": 92,
    "rhythm": 80
  }
}
```

### SOE 任务结构

```python
{
    "turn_index": 0,
    "session_id": "abc123",
    "ref_text": "Hello",
    "audio_path": "/path/to/turn_0.wav"
}
```

## 腾讯云 SOE API

### 接口类型

```
WebSocket: wss://soe.cloud.tencent.com/soe/api/?{参数}
```

### 音频要求

| 参数 | 要求 |
|------|------|
| 采样率 | 16000 Hz |
| 采样精度 | 16 bits |
| 声道 | 单声道 (mono) |
| 格式 | pcm / wav / mp3 / speex |

### 关键参数

| 参数 | 说明 |
|------|------|
| `eval_mode` | 0=单词, 1=句子, 2=段落, 3=自由说 |
| `ref_text` | 参考文本（标准发音内容） |
| `server_engine_type` | `16k_en`=英文, `16k_zh`=中文 |
| `voice_format` | 0=pcm, 1=wav, 2=mp3, 4=speex |
| `rec_mode` | 0=流式, 1=录音评测 |

### 签名鉴权

腾讯云 SOE 需要签名验证：
- SecretID: `YOUR_SECRET_ID`
- SecretKey: `YOUR_SECRET_KEY`

## 实现步骤

### Phase 1: 音频收集

1. 在 `voice_agent.py` 中添加音频 Buffer
2. 每帧音频存入 buffer
3. 用户说完一句话（STT final=True）时，保存为 WAV 文件

### Phase 2: SOE 队列

1. 创建 `soe_service.py` - SOE 客户端
2. 创建 `soe_queue.py` - asyncio.Queue + Worker

### Phase 3: SOE 客户端

实现腾讯云 SOE WebSocket 调用

### Phase 4: 结果存储

扩展 `conversation_logger.py`，支持写入 SOE 结果

### Phase 5: 前端展示

1. 新增 API 获取 SOE 结果
2. 在历史会话中展示发音评分
3. 添加音频播放按钮

## 延迟分析

| 阶段 | 延迟 |
|------|------|
| STT | 300-500ms |
| LLM 首 token | 500ms-1s |
| SOE 后台处理 | 不影响实时对话 |

**关键**：SOE 异步处理，不阻塞实时对话。

## 待验证

- [ ] 音频收集测试（LiveKit 流）
- [ ] WAV 文件生成
- [ ] SOE WebSocket 连接
- [ ] 签名生成
- [ ] 评测结果解析
- [ ] JSONL 结果写入
- [ ] 前端展示

## 参考文档

- [腾讯云智聆口语评测（新版）](https://cloud.tencent.com/document/product/1774/107497)