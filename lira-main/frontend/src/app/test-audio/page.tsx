"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface WordAnalysis {
  word: string;
  match_tag: number;  // 0=正确, 1=多词, 2=漏读, 3=错读, 4=未录入
  accuracy: number;
  begin_time: number;
  end_time: number;
}

interface SOEResult {
  pronunciation: number;
  fluency: number;
  integrity: number;
  rhythm: number;
  total: number;
  words: WordAnalysis[];
}

export default function TestAudioPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [soeResult, setSoeResult] = useState<SOEResult | null>(null);
  const [refText, setRefText] = useState("Hello, how are you?");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        lastBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setSoeResult(null);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err) {
      console.error("录音失败:", err);
      alert("无法访问麦克风，请检查权限设置");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Convert webm audio to WAV format (16kHz, 16bit, mono)
  const convertToWav = async (blob: Blob): Promise<ArrayBuffer> => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Convert to mono if stereo
    let monoBuffer = audioBuffer;
    if (audioBuffer.numberOfChannels > 1) {
      monoBuffer = audioContext.createBuffer(
        1,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      monoBuffer.copyFromChannel(audioBuffer.getChannelData(0), 0);
    }

    // Encode as WAV (16kHz, 16bit, mono)
    const numChannels = 1;
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = monoBuffer.length * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    // fmt chunk
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // data chunk
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);

    // Write audio samples
    const channelData = monoBuffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < monoBuffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    audioContext.close();
    return buffer;
  };

  const writeString = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  const uploadForSOE = async () => {
    if (!lastBlobRef.current) return;
    setIsUploading(true);
    setSoeResult(null);

    try {
      const wavBuffer = await convertToWav(lastBlobRef.current);
      const sessionId = "test-session-" + Date.now();
      const turnIndex = 0;

      const response = await fetch(
        `http://localhost:8020/api/sessions/${sessionId}/audio/${turnIndex}?ref_text=${encodeURIComponent(refText)}`,
        {
          method: "POST",
          body: wavBuffer,
          headers: {
            "Content-Type": "audio/wav",
          },
        }
      );

      if (response.ok) {
        // Poll for result
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const resultRes = await fetch(
            `http://localhost:8020/api/sessions/${sessionId}/soe/${turnIndex}`
          );
          if (resultRes.ok) {
            const data = await resultRes.json();
            if (data.status === "completed") {
              setSoeResult(data.result);
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("上传失败:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-8">
      <Card className="w-full max-w-lg shadow-2xl">
        <CardContent className="p-8">
          <h1 className="text-2xl font-bold text-center mb-2">音频收集测试</h1>
          <p className="text-slate-500 text-center mb-8">测试麦克风录音和回放功能</p>

          <div className="text-center mb-8">
            <div className={`text-6xl font-mono ${isRecording ? "text-red-500 animate-pulse" : "text-slate-300"}`}>
              {formatTime(duration)}
            </div>
            {isRecording && (
              <div className="flex justify-center gap-1 mt-4">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-3 h-3 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-3 h-3 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">评测文本 (Reference Text)</label>
            <input
              type="text"
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Enter text you said..."
            />
          </div>

                    <div className="flex gap-4">
            <Button
              onClick={startRecording}
              disabled={isRecording}
              className="flex-1 h-12 text-lg bg-emerald-500 hover:bg-emerald-600"
            >
              {isRecording ? "录音中..." : "开始录音"}
            </Button>
            <Button
              onClick={stopRecording}
              disabled={!isRecording}
              variant="destructive"
              className="flex-1 h-12 text-lg"
            >
              停止
            </Button>
          </div>

          {audioUrl && (
            <div className="mt-6 flex gap-4">
              <Button
                onClick={uploadForSOE}
                disabled={isUploading || !refText.trim()}
                className="flex-1 h-12 text-lg bg-blue-500 hover:bg-blue-600"
              >
                {isUploading ? "评测中..." : "上传并评测"}
              </Button>
            </div>
          )}

          {audioUrl && (
            <div className="mt-8 p-4 bg-slate-50 rounded-xl">
              <h2 className="font-semibold mb-2">录音预览</h2>
              <audio src={audioUrl} controls className="w-full" />
              <Button
                onClick={() => setAudioUrl(null)}
                variant="ghost"
                className="mt-2 w-full"
              >
                清除录音
              </Button>
            </div>
          )}

                   {soeResult && (
            <div className="mt-8 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <h2 className="font-semibold mb-4 text-emerald-800">评测结果</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-3xl font-bold text-emerald-600">{Math.round(soeResult.pronunciation)}</div>
                  <div className="text-sm text-slate-500">发音得分</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-3xl font-bold text-blue-600">{Math.round(soeResult.fluency)}</div>
                  <div className="text-sm text-slate-500">流利度</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-3xl font-bold text-purple-600">{Math.round(soeResult.integrity)}</div>
                  <div className="text-sm text-slate-500">完整度</div>
                </div>
                <div className="text-center p-3 bg-white rounded-lg">
                  <div className="text-3xl font-bold text-amber-600">{Math.round(soeResult.rhythm)}</div>
                  <div className="text-sm text-slate-500">节奏感</div>
                </div>
              </div>
              <div className="mt-4 text-center p-3 bg-white rounded-lg">
                <div className="text-4xl font-bold text-slate-800">{Math.round(soeResult.total)}</div>
                <div className="text-sm text-slate-500">综合评分</div>
              </div>

              {soeResult.words && soeResult.words.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-medium text-slate-700 mb-2">逐词分析</h3>
                  <div className="flex flex-wrap gap-2">
                    {soeResult.words.map((w, i) => {
                      const tagColors: Record<number, string> = {
                        0: "bg-emerald-100 text-emerald-700 border-emerald-300",   // 正确
                        1: "bg-amber-100 text-amber-700 border-amber-300",        // 多词
                        2: "bg-orange-100 text-orange-700 border-orange-300",    // 漏读
                        3: "bg-red-100 text-red-700 border-red-300",             // 错读
                        4: "bg-gray-100 text-gray-500 border-gray-300",          // 未录入
                      };
                      const tagLabels: Record<number, string> = {
                        0: "✓",
                        1: "+",
                        2: "-",
                        3: "✗",
                        4: "?",
                      };
                      const colorClass = tagColors[w.match_tag] || tagColors[4];
                      return (
                        <span
                          key={i}
                          className={`px-3 py-1 rounded-full border ${colorClass} text-sm font-medium`}
                          title={`得分: ${Math.round(w.accuracy)}`}
                        >
                          {w.word} {tagLabels[w.match_tag]}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    ✓=正确 +=多词 -=漏读 ✗=错读 ?=未录入
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 text-sm text-slate-400 text-center">
            <p>1. 点击"开始录音"按钮</p>
            <p>2. 对着麦克风说话</p>
            <p>3. 点击"停止"结束录音</p>
            <p>4. 播放录音确认收集效果</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}