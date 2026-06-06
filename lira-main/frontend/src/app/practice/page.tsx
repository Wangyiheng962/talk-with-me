"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Scenario, SessionResponse, FeedbackMode } from "@/types/session";
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

interface HistoryEntry {
  session_id: string;
  mode: string;
  level: string;
  started_at: string;
  turns: number;
}

interface ConversationEntry {
  type: "session_start" | "turn" | "session_end";
  session_id: string;
  user_text?: string;
  agent_text?: string;
  correction?: boolean;
  timestamp?: string;
  started_at?: string;
  ended_at?: string;
}

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "job_interview", label: "面试" },
  { value: "restaurant", label: "点餐" },
  { value: "meeting", label: "会议" },
];

const FEEDBACK_MODES: { value: FeedbackMode; label: string }[] = [
  { value: "real_time", label: "实时纠错" },
  { value: "batch", label: "结束后评分" },
];

function ConversationView({ sessionId, onEndSession }: { sessionId: string; onEndSession: () => void }) {
  const room = useRoomContext();
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isConnected } = useSessionWebSocket({
    sessionId,
    onTranscription: (text, isFinal) => {
      console.log("[WS] Transcription:", text, isFinal);
      if (isFinal) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", text, timestamp: new Date() },
        ]);
        setCurrentTranscript("");
      } else {
        setCurrentTranscript(text);
      }
    },
    onResponse: (text) => {
      console.log("[WS] Response:", text);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text, timestamp: new Date() },
      ]);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    room.localParticipant.setMicrophoneEnabled(true);
  }, [room]);

  const toggleMute = useCallback(async () => {
    const enabled = !isMuted;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setIsMuted(enabled);
  }, [room, isMuted]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Status Bar */}
        <div className="flex items-center justify-between border-b bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-3 h-3 rounded-full",
                isConnected ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" : "bg-red-500"
              )}
            />
            <span className="text-sm font-medium text-slate-700">
              {isConnected ? "已连接" : "连接中..."}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={isMuted ? "secondary" : "default"}
              className={cn(
                "px-3 py-1",
                !isMuted && "bg-emerald-500 hover:bg-emerald-600"
              )}
            >
              {isMuted ? "已静音" : "录音中"}
            </Badge>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full max-w-4xl mx-auto p-6 overflow-y-auto">
            {messages.length === 0 && !currentTranscript && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-xl">
                  <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <p className="text-lg text-slate-600 mb-2">开始说话</p>
                <p className="text-sm text-slate-400">您的对话将显示在这里</p>
              </div>
            )}

            <div className="space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-5 py-4 shadow-sm",
                      msg.role === "user"
                        ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md"
                        : "bg-white text-slate-800 rounded-bl-md border border-slate-100"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium",
                          msg.role === "user"
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {msg.role === "user" ? "我" : "AI"}
                      </div>
                      <span className="text-xs opacity-70">
                        {msg.role === "user" ? "你" : "教练"}
                      </span>
                    </div>
                    <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}

              {currentTranscript && (
                <div className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-blue-400/90 px-5 py-4 text-white">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium">我</div>
                      <span className="text-xs opacity-70">你 (说话中...)</span>
                    </div>
                    <p className="text-base leading-relaxed">{currentTranscript}</p>
                    <div className="flex gap-1 mt-3">
                      <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
                      <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse delay-75" />
                      <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse delay-150" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Control Bar */}
        <div className="border-t bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500">
                {messages.length} 条消息
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onEndSession}
                className="text-slate-400 hover:text-red-500"
              >
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
                结束会话
              </Button>
            </div>
            <Button
              variant={isMuted ? "outline" : "destructive"}
              size="lg"
              className="rounded-full px-8 h-12 shadow-lg"
              onClick={toggleMute}
            >
              {isMuted ? (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l22" />
                  </svg>
                  取消静音
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  静音
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

export default function PracticePage() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>("real_time");
  const [historySessions, setHistorySessions] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<ConversationEntry[] | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/history`);
      if (res.ok) {
        const data = await res.json();
        setHistorySessions(data.sessions || []);
      }
    } catch {
      // History not available
    }
  };

  const loadConversation = async (sessionId: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/${sessionId}/conversation`);
      if (res.ok) {
        const data = await res.json();
        setSelectedConversation(data.entries || []);
      }
    } catch {
      setSelectedConversation([]);
    }
  };

  const startSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.createSession({ mode: scenario ? "roleplay" : "free_talk", scenario: scenario || undefined, feedback_mode: feedbackMode });
      setSession(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动会话失败");
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async () => {
    if (session) {
      const sessionId = session.session_id;
      try {
        await api.endSession(sessionId);
        // Fetch report
        const reportRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/${sessionId}/report`);
        if (reportRes.ok) {
          const reportData = await reportRes.json();
          if (reportData.report) {
            setReport(reportData.report);
            setShowReport(true);
          }
        }
      } catch (err) {
        console.error("Failed to end session:", err);
      }
    }
    setSession(null);
    loadHistory();
  };

  if (session) {
    return (
      <LiveKitRoom
        serverUrl={session.livekit_url}
        token={session.livekit_token}
        connect={true}
        audio={true}
        video={false}
        onDisconnected={endSession}
      >
        <div className="flex h-screen">
          <ConversationView sessionId={session.session_id} onEndSession={endSession} />

          {showHistory && (
            <div className="w-80 border-l bg-gradient-to-b from-slate-50 to-white flex flex-col">
              <div className="border-b px-4 py-4 bg-white">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-slate-700">历史记录</h2>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {historySessions.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">暂无会话记录</p>
                ) : (
                  <div className="space-y-3">
                    {historySessions.map((s) => (
                      <div
                        key={s.session_id}
                        className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-slate-400">
                            {s.session_id.slice(0, 8)}
                          </span>
                          <Badge variant="outline" className="text-xs">{s.turns} 轮</Badge>
                        </div>
                        <div className="text-sm text-slate-600">
                          {new Date(s.started_at).toLocaleDateString()} {new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="flex gap-1 mt-2">
                          <Badge variant="secondary" className="text-xs">{s.mode}</Badge>
                          <Badge variant="outline" className="text-xs">{s.level}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!showHistory && (
            <button
              onClick={() => setShowHistory(true)}
              className="absolute right-4 top-4 p-3 rounded-xl bg-white border shadow-lg hover:bg-slate-50 transition-colors"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </div>
      </LiveKitRoom>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-8">
      {/* Logo Area */}
      <div className="mb-10 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-xl">
          <span className="text-3xl font-bold text-white">L</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-800">LIRA</h1>
        <p className="mt-2 text-slate-500">智能英语口语陪练</p>
      </div>

      {/* Main Card */}
      <Card className="w-full max-w-lg shadow-2xl border-0 bg-white/90 backdrop-blur">
        <CardContent className="p-8 space-y-6">
          {/* Mode Description */}
          <div className="text-center pb-4 border-b border-slate-100">
            <Badge className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-4 py-1">
              纠错模式
            </Badge>
            <p className="mt-3 text-sm text-slate-500">
              练习英语口语，实时获得语法和表达纠正
            </p>
          </div>

          {/* Scenario Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.94 23.94 0 0112 15c-3.183 0-6.175-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 1h8a2 2 0 0122v8a2 2 0 01-2 2H8a2 2 0 01-2-2v-2a2 2 0 012-2h2" />
              </svg>
              选择场景 (可选)
            </label>
            <Select value={scenario || ""} onValueChange={(v) => setScenario(v as Scenario || null)}>
              <SelectTrigger className="w-full h-12 bg-slate-50 border-slate-200">
                <SelectValue placeholder="不选择则自由对话" />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Feedback Mode Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              纠错模式
            </label>
            <Select value={feedbackMode} onValueChange={(v) => setFeedbackMode(v as FeedbackMode)}>
              <SelectTrigger className="w-full h-12 bg-slate-50 border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_MODES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm text-center border border-red-100">
              {error}
            </div>
          )}

          {/* Start Button */}
          <Button
            className="w-full h-14 text-lg font-medium bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg shadow-blue-500/30"
            onClick={startSession}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 01412H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                连接中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                开始练习
              </span>
            )}
          </Button>

          {/* History Button */}
          <Button
            variant="ghost"
            className="w-full text-slate-500 hover:text-slate-700"
            onClick={() => setShowHistory(!showHistory)}
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showHistory ? "隐藏历史记录" : "查看历史记录"}
          </Button>
        </CardContent>
      </Card>

      {/* History Panel */}
      {showHistory && !session && (
        <Card className="w-full max-w-lg mt-4 shadow-xl border-0 bg-white/90 backdrop-blur">
          <CardContent className="p-6">
            <h3 className="font-semibold text-slate-700 mb-4">历史记录</h3>
            {historySessions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">暂无会话记录</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {historySessions.map((s) => (
                  <div
                    key={s.session_id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => loadConversation(s.session_id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-slate-400">
                        {s.session_id.slice(0, 8)}
                      </span>
                      <Badge variant="outline" className="text-xs">{s.turns} 轮</Badge>
                    </div>
                    <div className="text-sm text-slate-600">
                      {new Date(s.started_at).toLocaleDateString()}{" "}
                      {new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Badge variant="secondary" className="text-xs">{s.mode}</Badge>
                      <Badge variant="outline" className="text-xs">{s.level}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer Tips */}
      <div className="mt-8 text-center text-sm text-slate-400 max-w-md">
        <p>纠错模式帮助您在对话中实时改善语法和表达</p>
      </div>

      {/* Conversation Detail Modal */}
      {selectedConversation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedConversation(null)}>
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h3 className="font-semibold text-slate-700">对话详情</h3>
                <Button variant="ghost" size="sm" onClick={() => setSelectedConversation(null)}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
              <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
                {selectedConversation.map((entry, idx) => (
                  <div key={idx}>
                    {entry.type === "session_start" && (
                      <div className="text-xs text-slate-400 text-center">
                        会话开始于 {new Date(entry.started_at || "").toLocaleString()}
                      </div>
                    )}
                    {entry.type === "turn" && (
                      <div className="space-y-3">
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-500 text-white px-4 py-3">
                            <div className="text-xs opacity-70 mb-1">你</div>
                            <div className="text-base">{entry.user_text}</div>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-slate-100 text-slate-800 px-4 py-3">
                            <div className="text-xs opacity-70 mb-1">AI 教练</div>
                            <div className="text-base">{entry.agent_text}</div>
                            {entry.correction && (
                              <Badge variant="destructive" className="text-xs mt-2">纠错</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {entry.type === "session_end" && (
                      <div className="text-xs text-slate-400 text-center">
                        会话结束于 {new Date(entry.ended_at || "").toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report Modal */}
      {showReport && report && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowReport(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-700">练习报告</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowReport(false)}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              {/* Score Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <div className="text-3xl font-bold text-blue-600">{report.avg_grammar_score}</div>
                  <div className="text-xs text-slate-500 mt-1">语法分数</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <div className="text-3xl font-bold text-green-600">{report.avg_scenario_score}</div>
                  <div className="text-xs text-slate-500 mt-1">场景分数</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <div className="text-3xl font-bold text-purple-600">{report.avg_overall_score}</div>
                  <div className="text-xs text-slate-500 mt-1">综合分数</div>
                </div>
              </div>

              {/* Stats */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">对话轮数</span>
                  <span className="font-medium">{report.turn_count}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">纠错次数</span>
                  <span className="font-medium">{report.total_corrections}</span>
                </div>
              </div>

              {/* Corrections List */}
              {report.corrections && report.corrections.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-3">主要问题</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {report.corrections.map((correction: any, idx: number) => (
                      <div key={idx} className="text-sm p-2 bg-slate-50 rounded-lg">
                        <div className="text-slate-500 line-through">{correction.original}</div>
                        <div className="text-green-600 font-medium">{correction.suggestion}</div>
                        <div className="text-xs text-slate-400 mt-1">{correction.issue}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <Button className="w-full mt-6" onClick={() => setShowReport(false)}>
                完成
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}