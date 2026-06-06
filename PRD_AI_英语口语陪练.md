# AI 英语口语陪练 - 产品需求文档 (PRD)

> 本文档作为任务执行指引，基于七牛云实训营题目一要求编写。

---

## 一、项目概述

### 1.1 项目名称
**AI Speak** - 英语口语陪练助手

### 1.2 项目目标
开发一款英语口语练习工具，帮助用户在指定场景下进行真实对话训练，综合提升口语能力。

### 1.3 题目要求对照

| 题目要求 | 实现说明 |
|----------|----------|
| 场景选择（面试/点餐/会议等） | ✅ 实现至少3个预置场景 |
| 实时语音对话 | ✅ 基于LIRA已有能力 |
| 发音评测 | ✅ 实现评分系统 |
| 语法/表达纠错 | ✅ 纠错 + 时机控制 |
| 课后总结 | ✅ 练习报告 |
| 对话交互的自然度 | ✅ 场景角色 + 引导式纠错 |
| 语音端到端流畅性和延迟性 | ✅ 保持低延迟 |
| 纠错的精准度与时机 | ✅ 精准度提升 + 时机选择 |
| 口语能力提升的可量化反馈 | ✅ 评分指标 + 可视化 |

---

## 二、功能需求

### 2.1 场景选择系统

**功能：** 用户可选择不同场景进行练习

**预置场景（至少3个）：**

| 场景 | 角色设定 | 评分维度 |
|------|----------|----------|
| **面试 (Interview)** | 面试官角色，考察专业表达 | 词汇专业度、表达逻辑、礼貌用语 |
| **点餐 (Restaurant)** | 服务员角色，考察日常交流 | 常用词汇、流利度、表达清晰度 |
| **会议 (Meeting)** | 会议参与者，考察商务英语 | 观点表达、听力理解、回应准确性 |

**场景定义格式：**
```yaml
scenario:
  id: interview
  name: 面试
  name_en: Interview
  description: 模拟工作面试场景，练习自我介绍和回答问题

  role:
    name: 面试官
    prompt: |
      你是一位专业的面试官，用友好但专业的方式与候选人对话。
      你会问一些关于背景、技能和职业目标的问题。

  levels:
    beginner:
      vocabulary_level: A2-B1
      complexity: simple
    intermediate:
      vocabulary_level: B1-B2
      complexity: medium
    advanced:
      vocabulary_level: B2-C1
      complexity: complex

  evaluation:
    dimensions:
      - pronunciation
      - fluency
      - vocabulary
      - grammar
      - expression

  typical_topics:
    - 自我介绍
    - 工作经历
    - 职业目标
    - 优势劣势
```

**UI要求：**
- 场景选择页面展示所有预置场景
- 每个场景显示：名称、描述、难度等级
- 用户选择场景后进入对话界面

---

### 2.2 实时语音对话

**基于LIRA已有能力实现：**
- WebRTC 实时语音传输
- Deepgram STT（语音转文字）
- Deepgram TTS（文字转语音）
- LiveKit 作为通信层
- Filler音频掩盖延迟

**技术参数：**
- 端到端延迟目标：< 2秒
- 音频格式：16kHz/16bit PCM
- TTS延迟：< 500ms

---

### 2.3 发音评测

**评测维度：**

| 维度 | 说明 | 评分范围 |
|------|------|----------|
| 发音准确性 | 音素级准确度 | 0-100 |
| 流利度 | 语速、停顿、连贯性 | 0-100 |
| 语法 | 语法正确性 | 0-100 |
| 词汇 | 词汇复杂度与正确使用 | 0-100 |
| 表达 | 表达的流畅与地道程度 | 0-100 |

**技术实现：**
1. 使用Whisper提取用户语音的音素序列
2. 对比标准发音计算准确率
3. 基于LLM评估表达的地道程度

**输出格式：**
```json
{
  "session_id": "uuid",
  "timestamp": "2026-06-05T20:00:00Z",
  "scenario": "interview",
  "overall_score": 78,
  "dimensions": {
    "pronunciation": 82,
    "fluency": 75,
    "grammar": 72,
    "vocabulary": 80,
    "expression": 75
  },
  "errors": [
    {"type": "pronunciation", "word": "comfortable", "suggestion": "KAM-fort-uh-bul"},
    {"type": "grammar", "original": "I goed", "corrected": "I went", "reason": "past tense"}
  ]
}
```

---

### 2.4 语法/表达纠错

**纠错层次：**

| 层次 | 说明 | 实现方式 |
|------|------|----------|
| 语法层 | 时态、单复数、介词、主谓一致等 | 规则 + LLM |
| 表达层 | 用词地道性、词序、表达习惯 | LLM场景判断 |

**纠错时机选项（用户可选）：**

| 模式 | 说明 | 用户体验 |
|------|------|----------|
| 实时 | 关键错误立即轻微提示（不打断对话） | 音效提示，可忽略 |
| 结束后 | 对话结束后统一显示 | 不打断，完整对话 |
| 仅总结 | 不显示，只在总结报告里体现 | 完全沉浸 |

**引导式纠错示例：**

生硬方式：
```
用户：I am agree with this.
AI：❌ 错误："I am agree" 应改为 "I agree" (主系表不需要重复be动词)
```

引导方式：
```
用户：I am agree with this.
AI：Hmm, how do we usually say this? Try: "I ___ with this." (留空引导)
```

**纠错格式：**
```json
{
  "corrections": [
    {
      "type": "grammar",
      "original": "I am agree",
      "corrected": "I agree",
      "reason": "不需要重复be动词",
      "guide": "Try saying: 'I agree' instead"
    },
    {
      "type": "expression",
      "original": "I think maybe",
      "corrected": "I think",
      "reason": "更简洁直接",
      "guide": "Native speakers often skip 'maybe' in this context"
    }
  ]
}
```

---

### 2.5 课后总结

**总结报告包含：**

| 内容 | 说明 |
|------|------|
| 基本信息 | 场景、时长、练习日期 |
| 综合评分 | 5维度评分 + 总分 |
| 错误统计 | 错误类型分布 |
| 改进建议 | 针对薄弱点的具体建议 |
| 历史对比 | vs上次练习（如果有） |

**报告示例：**
```json
{
  "summary": {
    "scenario": "面试",
    "duration": "8分钟",
    "date": "2026-06-05",
    "overall_score": 78,

    "dimensions": {
      "pronunciation": {"score": 82, "change": "+3"},
      "fluency": {"score": 75, "change": "+5"},
      "grammar": {"score": 72, "change": "+2"},
      "vocabulary": {"score": 80, "change": "-1"},
      "expression": {"score": 75, "change": "+4"}
    },

    "error_summary": {
      "grammar": 5,
      "pronunciation": 3,
      "expression": 4
    },

    "top_errors": [
      "介词误用：in the morning → at night",
      "时态错误：goed → went",
      "表达不地道：maybe → (直接表达)"
    ],

    "suggestions": [
      "面试场景中多用正式表达",
      "注意一般过去时的使用",
      "减少思考性停顿"
    ]
  }
}
```

---

### 2.6 可量化反馈

**数据采集：**
- 每次练习记录完整评分数据
- 错误类型分类统计
- 时间戳记录

**可视化：**

| 组件 | 说明 |
|------|------|
| 能力雷达图 | 5维度同时展示 |
| 进步趋势 | 最近N次练习分数曲线 |
| 本次评分 | 练习结束后的即时反馈 |

**雷达图数据格式：**
```json
{
  "radar": {
    "labels": ["发音", "流利度", "语法", "词汇", "表达"],
    "scores": [82, 75, 72, 80, 75],
    "max": 100
  }
}
```

---

## 三、技术方案

### 3.1 技术栈（基于LIRA）

| 组件 | 技术 | 说明 |
|------|------|------|
| 实时语音 | LiveKit | WebRTC通信 |
| STT | Deepgram | 语音转文字 |
| TTS | Deepgram | 文字转语音 |
| LLM | GPT-4o-mini | 对话生成、纠错、总结 |
| Agent | LangGraph | 对话流程编排 |
| 发音分析 | Whisper | 音素提取 |
| 后端 | FastAPI | API服务 |
| 前端 | React | 用户界面 |

### 3.2 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                    │
│  场景选择 → 对话界面 → 评分展示 → 总结报告              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                     │
│                                                         │
│  ┌─────────┐   ┌──────────────┐   ┌─────────┐         │
│  │ LiveKit │ → │ LangGraph    │ → │ Deepgram│         │
│  │ Server  │   │ Agent        │   │ TTS     │         │
│  └─────────┘   └──────────────┘   └─────────┘         │
│                    │                                    │
│         ┌─────────┴─────────┐                          │
│         ▼                   ▼                          │
│  ┌─────────────┐    ┌─────────────┐                   │
│  │ Pronunciation│    │ Grammar     │                   │
│  │ Evaluator   │    │ Corrector   │                   │
│  └─────────────┘    └─────────────┘                   │
│                          │                              │
│         ┌────────────────┴─────────────┐              │
│         ▼                               ▼              │
│  ┌─────────────┐               ┌─────────────┐       │
│  │ Summary     │               │ Progress    │       │
│  │ Generator   │               │ Tracker     │       │
│  └─────────────┘               └─────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### 3.3 数据模型

**练习记录 (Practice Session)：**
```python
class PracticeSession:
    id: str
    user_id: str
    scenario: str  # interview/restaurant/meeting
    start_time: datetime
    end_time: datetime
    messages: List[Message]
    evaluation: Evaluation
    corrections: List[Correction]
    summary: Summary
```

**评分 (Evaluation)：**
```python
class Evaluation:
    overall_score: int
    dimensions: Dict[str, int]  # pronunciation/fluency/grammar/vocabulary/expression
    error_count: int
```

---

## 四、实现计划

### Phase 1: 基础能力（Day 1）

**目标：** 场景选择 + 实时语音对话

- [ ] 场景模板系统（至少3场景）
- [ ] 场景选择UI
- [ ] 场景切换逻辑
- [ ] LIRA实时语音集成

### Phase 2: 核心功能（Day 2）

**目标：** 发音评测 + 语法纠错

- [ ] 发音评分系统（5维度）
- [ ] 纠错Prompt设计
- [ ] 纠错时机控制
- [ ] 引导式纠错实现

### Phase 3: 增值功能（Day 3）

**目标：** 课后总结 + 可量化反馈

- [ ] Summary Agent
- [ ] 能力雷达图
- [ ] 进步趋势
- [ ] 薄弱点分析

---

## 五、验收标准

### 5.1 功能验收

| 功能 | 验收条件 |
|------|----------|
| 场景选择 | 可选择至少3个场景，切换流畅 |
| 实时语音 | 端到端延迟 < 2秒，声音清晰 |
| 发音评测 | 练习后显示5维度评分 |
| 语法纠错 | 纠错准确，时机可选 |
| 课后总结 | 显示总结报告含改进建议 |
| 可量化反馈 | 显示能力雷达图 |

### 5.2 体验验收

| 维度 | 验收条件 |
|------|----------|
| 自然度 | AI对话流畅，角色真实 |
| 延迟感 | Filler音频有效，无明显等待 |
| 纠错体验 | 引导式纠错自然，不生硬 |

---

## 六、场景详细定义

### 6.1 面试场景 (Interview)

```yaml
scenario:
  id: interview
  name: 面试
  name_en: Interview
  description: 模拟工作面试，练习自我介绍和常见面试问题

  role:
    name: 面试官
    name_en: Interviewer
    prompt: |
      你是一位友善但专业的面试官。
      你会问一些经典的面试问题：
      - 自我介绍
      - 工作经历
      - 职业目标
      - 优势劣势

      用友好但正式的语气，保持对话自然。

  evaluation:
    dimensions:
      pronunciation: 20%
      fluency: 20%
      grammar: 20%
      vocabulary: 20%
      expression: 20%

  typical_questions:
    - "请做一个简单的自我介绍"
    - "你为什么想应聘这个职位"
    - "你最大的优势是什么"
    - "你有什么问题想问我吗"

  tips:
    - 使用正式用语
    - 回答要有逻辑（STAR法则）
    - 注意眼神交流
    - 准备反问问题
```

### 6.2 点餐场景 (Restaurant)

```yaml
scenario:
  id: restaurant
  name: 点餐
  name_en: Restaurant
  description: 在餐厅用英语点餐，练习日常交流

  role:
    name: 服务员
    name_en: Waiter/Waitress
    prompt: |
      你是一位餐厅服务员，友好且乐于助人。
      你会用英语与顾客交流：
      - 问候并介绍招牌菜
      - 回答关于菜品的问题
      - 记录点单内容
      - 处理结账

      语气轻松友好，语速适中。

  evaluation:
    dimensions:
      pronunciation: 25%
      fluency: 30%
      grammar: 15%
      vocabulary: 15%
      expression: 15%

  typical_topics:
    - 推荐菜品
    - 食物过敏/忌口
    - 点单结账
    - 评论菜品

  tips:
    - 使用礼貌用语 (Could I..., Would you...)
    - 不确定时可以说 "Let me check"
    - 注意听力理解
```

### 6.3 会议场景 (Meeting)

```yaml
scenario:
  id: meeting
  name: 会议
  name_en: Meeting
  description: 模拟商务会议，练习表达观点和讨论

  role:
    name: 主持人
    name_en: Meeting Facilitator
    prompt: |
      你是会议主持人，引导讨论并确保每个人都有机会发言。
      你会：
      - 开场介绍议题
      - 邀请参与者发言
      - 总结要点
      - 推动决策

      语气专业，组织清晰。

  evaluation:
    dimensions:
      pronunciation: 15%
      fluency: 25%
      grammar: 20%
      vocabulary: 20%
      expression: 20%

  typical_topics:
    - 项目进度汇报
    - 问题讨论
    - 方案对比
    - 行动计划

  tips:
    - 表达观点要清晰 (In my opinion..., I suggest...)
    - 同意/不同意要明确 (I agree, however...)
    - 做好笔记总结
```

---

## 七、附录

### 7.1 评分算法

**发音准确性：**
```
score = (correct_phonemes / total_phonemes) * 100
```

**流利度：**
```
score = base_score - (pause_count * 5) - (speed_penalty)
其中 speed_penalty = 0 if 80 < wpm < 160
```

**综合评分：**
```
overall = weighted_average(
    pronunciation * 0.2,
    fluency * 0.2,
    grammar * 0.2,
    vocabulary * 0.2,
    expression * 0.2
)
```

### 7.2 纠错时机说明

| 时机 | 触发条件 | 实现方式 |
|------|----------|----------|
| 实时 | 严重语法错误（时态、主谓一致） | 轻微音效，不打断 |
| 结束后 | 所有错误 | 统一显示在总结 |
| 仅总结 | 可选 | 不提示，记录在报告 |

---

**文档版本：** v1.0
**创建日期：** 2026-06-05
**状态：** 进行中