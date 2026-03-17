/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Play, Volume2, Loader2, Baby, User, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CHARACTERS = [
  { id: 'sophie', voiceId: 'Zephyr', name: 'Sophie', age: '5', gender: 'Girl', icon: '👧' },
  { id: 'toby', voiceId: 'Kore', name: 'Toby', age: '6', gender: 'Boy', icon: '👦' },
  { id: 'lily', voiceId: 'Kore', name: 'Lily', age: '7', gender: 'Girl', icon: '👧' },
  { id: 'leo', voiceId: 'Puck', name: 'Leo', age: '8', gender: 'Boy', icon: '👦' },
  { id: 'oliver', voiceId: 'Puck', name: 'Oliver', age: '9', gender: 'Boy', icon: '👦' },
  { id: 'emma', voiceId: 'Puck', name: 'Emma', age: '10', gender: 'Girl', icon: '👧' },
  { id: 'mia', voiceId: 'Zephyr', name: 'Mia', age: '11', gender: 'Girl', icon: '👧' },
  { id: 'jack', voiceId: 'Charon', name: 'Jack', age: '12', gender: 'Boy', icon: '👦' },
  { id: 'ava', voiceId: 'Kore', name: 'Ava', age: '13', gender: 'Girl', icon: '👧' },
  { id: 'noah', voiceId: 'Fenrir', name: 'Noah', age: '16', gender: 'Boy', icon: '🧑' },
];

export default function App() {
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [text, setText] = useState('Hello! I am so happy to meet you. Let\'s learn English together!');
  const [toneInstruction, setToneInstruction] = useState('cheerful and high-pitched');
  
  // Single mode state
  const [selectedCharId, setSelectedCharId] = useState('lily');
  const [showCharList, setShowCharList] = useState(false);
  
  // Multi mode state
  const [dialogueLines, setDialogueLines] = useState([
    { id: '1', charId: 'lily', text: 'Hi Leo, how are you today?' },
    { id: '2', charId: 'leo', text: 'I am great, Lily! Do you want to play?' }
  ]);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedChar = CHARACTERS.find(c => c.id === selectedCharId) || CHARACTERS[0];

  const addDialogueLine = () => {
    const lastCharId = dialogueLines[dialogueLines.length - 1]?.charId || 'lily';
    const nextCharId = lastCharId === 'lily' ? 'leo' : 'lily';
    setDialogueLines([...dialogueLines, { id: Date.now().toString(), charId: nextCharId, text: '' }]);
  };

  const removeDialogueLine = (id: string) => {
    if (dialogueLines.length > 1) {
      setDialogueLines(dialogueLines.filter(line => line.id !== id));
    }
  };

  const updateDialogueLine = (id: string, updates: any) => {
    setDialogueLines(dialogueLines.map(line => line.id === id ? { ...line, ...updates } : line));
  };

  const generateSpeech = async (isManualPreview = false, previewCharId?: string) => {
    if (cooldownSeconds > 0) {
      alert(`Vui lòng đợi ${cooldownSeconds} giây để hệ thống hồi phục hạn mức.`);
      return;
    }

    if (isManualPreview) {
      const charToUse = CHARACTERS.find(c => c.id === previewCharId)!;
      const previewText = `Hi! My name is ${charToUse.name} and I am ${charToUse.age} years old.`;
      setIsPreviewing(charToUse.id);
      try {
        const audio = await fetchAudioWithRetry(charToUse, previewText, 'friendly and cute');
        if (audio) {
          const wavBlob = pcmToWav(audio, 24000);
          const url = URL.createObjectURL(wavBlob);
          const previewAudio = new Audio(url);
          previewAudio.play();
          previewAudio.onended = () => setIsPreviewing(null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsPreviewing(null);
      }
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    
    try {
      const linesToProcess = mode === 'single' 
        ? [{ charId: selectedCharId, text: text }] 
        : dialogueLines;

      const allPcmData: Uint8Array[] = [];
      
      for (let i = 0; i < linesToProcess.length; i++) {
        const line = linesToProcess[i];
        if (!line.text.trim()) continue;

        const char = CHARACTERS.find(c => c.id === line.charId)!;
        setGenerationProgress(Math.round(((i) / linesToProcess.length) * 100));
        
        // Add a delay between requests to avoid hitting rate limits
        if (i > 0) await new Promise(resolve => setTimeout(resolve, 3000));

        const pcmBase64 = await fetchAudioWithRetry(char, line.text, toneInstruction);
        if (pcmBase64) {
          const binaryString = atob(pcmBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          allPcmData.push(bytes);
        }
      }

      setGenerationProgress(100);

      if (allPcmData.length > 0) {
        // Concatenate all PCM data
        const totalLength = allPcmData.reduce((acc, curr) => acc + curr.length, 0);
        const combinedPcm = new Uint8Array(totalLength);
        let offset = 0;
        for (const data of allPcmData) {
          combinedPcm.set(data, offset);
          offset += data.length;
        }

        const wavBlob = pcmToWavFromBytes(combinedPcm, 24000);
        const url = URL.createObjectURL(wavBlob);
        
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);
        
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play().catch(e => console.error("Playback failed:", e));
          }
        }, 100);
      }
    } catch (error: any) {
      console.error("Error generating speech:", error);
      let errorMessage = "Đã xảy ra lỗi khi tạo giọng nói. Vui lòng thử lại.";
      
      const errorStr = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      const isQuota = errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED") || error.status === 429;
      
      if (isQuota) {
        errorMessage = "Hệ thống đã hết hạn mức (Quota Exceeded). Vui lòng nghỉ ngơi 1 phút rồi quay lại nhé!";
        startCooldown(60);
      }
      
      alert(errorMessage);
    } finally {
      setIsGenerating(false);
      setIsRetrying(false);
    }
  };

  const startCooldown = (seconds: number) => {
    setCooldownSeconds(seconds);
    const interval = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const fetchAudioWithRetry = async (char: any, content: string, tone: string, retries = 2): Promise<string | undefined> => {
    try {
      return await fetchAudio(char, content, tone);
    } catch (error: any) {
      const errorStr = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      const isQuotaError = errorStr.includes("429") || error.status === 429 || errorStr.includes("quota") || errorStr.includes("RESOURCE_EXHAUSTED");
      
      if (isQuotaError && retries > 0) {
        setIsRetrying(true);
        // Wait 10 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 10000));
        setIsRetrying(false);
        return fetchAudioWithRetry(char, content, tone, retries - 1);
      }
      throw error;
    }
  };

  const fetchAudio = async (char: any, content: string, tone: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = "gemini-2.5-flash-preview-tts";
    
    const prompt = `Roleplay as a ${char.age}-year-old ${char.gender.toLowerCase()} named ${char.name}.
    CRITICAL: You MUST sound like a real ${char.age}-year-old child. Use a youthful, high-pitched, and innocent tone.
    Tone/Mood: ${tone}.
    Say this exactly: ${content}`;

    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: char.voiceId as any },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  };

  const pcmToWav = (base64Pcm: string, sampleRate: number) => {
    const binaryString = atob(base64Pcm);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return pcmToWavFromBytes(bytes, sampleRate);
  };

  const pcmToWavFromBytes = (bytes: Uint8Array, sampleRate: number) => {
    const len = bytes.length;
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + len, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, len, true);

    return new Blob([wavHeader, bytes], { type: 'audio/wav' });
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                <Sparkles className="w-6 h-6 text-yellow-300" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">English Kid Voice</h1>
            </div>
            <p className="text-indigo-100 opacity-90">Chuyển văn bản thành giọng nói trẻ em sinh động</p>
          </div>
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500 rounded-full opacity-50 blur-3xl"></div>
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-indigo-700 rounded-full opacity-50 blur-3xl"></div>
        </div>

        <div className="p-8 space-y-8">
          {/* Mode Selection */}
          <div className="flex p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setMode('single')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                mode === 'single' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <User className="w-4 h-4" />
              Nói đơn
            </button>
            <button
              onClick={() => setMode('multi')}
              className={`flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                mode === 'multi' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Baby className="w-4 h-4" />
              Giao tiếp (Nhiều người)
            </button>
          </div>

          {/* Tone Instruction */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Yêu cầu giọng điệu chung
            </label>
            <input
              type="text"
              value={toneInstruction}
              onChange={(e) => setToneInstruction(e.target.value)}
              placeholder="Ví dụ: cheerful, whispering, excited..."
              className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
            />
          </div>

          {mode === 'single' ? (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Nhân vật</label>
                <CharacterDropdown 
                  selectedChar={selectedChar} 
                  isOpen={showCharList} 
                  setIsOpen={setShowCharList} 
                  onSelect={setSelectedCharId}
                  onPreview={(id) => generateSpeech(true, id)}
                  isPreviewing={isPreviewing}
                />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Văn bản tiếng Anh</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Nhập văn bản..."
                  className="w-full h-40 p-5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none text-lg outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Kịch bản hội thoại</label>
                <div className="space-y-4">
                  {dialogueLines.map((line, index) => (
                    <motion.div 
                      key={line.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-3 items-start"
                    >
                      <div className="w-48 shrink-0">
                        <CharacterDropdown 
                          selectedChar={CHARACTERS.find(c => c.id === line.charId)} 
                          isOpen={activeDropdownId === line.id} 
                          setIsOpen={(open) => setActiveDropdownId(open ? line.id : null)} 
                          onSelect={(charId) => updateDialogueLine(line.id, { charId })}
                          onPreview={(id) => generateSpeech(true, id)}
                          isPreviewing={isPreviewing}
                          compact
                        />
                      </div>
                      <div className="flex-1 relative">
                        <textarea
                          value={line.text}
                          onChange={(e) => updateDialogueLine(line.id, { text: e.target.value })}
                          placeholder={`Lời thoại ${index + 1}...`}
                          className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none outline-none min-h-[80px]"
                        />
                        {dialogueLines.length > 1 && (
                          <button
                            onClick={() => removeDialogueLine(line.id)}
                            className="absolute -right-2 -top-2 bg-white border border-slate-200 text-slate-400 hover:text-red-500 p-1 rounded-full shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
                <button
                  onClick={addDialogueLine}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-indigo-300 hover:text-indigo-500 transition-all font-medium flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Thêm lời thoại
                </button>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="pt-4 space-y-4">
            {isGenerating && (
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-indigo-600 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${generationProgress}%` }}
                />
              </div>
            )}
            <button
              onClick={() => generateSpeech(false)}
              disabled={isGenerating || cooldownSeconds > 0 || (mode === 'single' ? !text.trim() : dialogueLines.every(l => !l.text.trim()))}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {cooldownSeconds > 0 ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Hồi phục hạn mức ({cooldownSeconds}s)...
                </>
              ) : isGenerating ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  {isRetrying ? "Đang đợi hạn mức API..." : `Đang tạo (${generationProgress}%)...`}
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" />
                  Tạo & Phát {mode === 'single' ? 'giọng nói' : 'hội thoại'}
                </>
              )}
            </button>
          </div>

          {/* Audio Player */}
          <AnimatePresence>
            {audioUrl && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-4 border-t border-slate-100"
              >
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="w-full h-12 rounded-xl"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <footer className="mt-8 text-slate-400 text-sm flex items-center gap-2">
        Sử dụng Gemini 2.5 Flash TTS <Sparkles className="w-3 h-3" />
      </footer>
    </div>
  );
}

function CharacterDropdown({ selectedChar, isOpen, setIsOpen, onSelect, onPreview, isPreviewing, compact }: any) {
  return (
    <div className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition-all shadow-sm cursor-pointer ${compact ? 'p-3' : 'p-4'}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsOpen(!isOpen);
          }
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className={compact ? 'text-xl' : 'text-2xl'}>{selectedChar.icon}</span>
          <div className="text-left truncate">
            <p className={`font-bold text-slate-800 truncate ${compact ? 'text-xs' : 'text-sm'}`}>{selectedChar.name}</p>
            <p className={`text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{selectedChar.age}t • {selectedChar.gender === 'Girl' ? 'Nữ' : 'Nam'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview(selectedChar.id);
            }}
            disabled={isPreviewing !== null}
            className={`rounded-full transition-all ${compact ? 'p-1.5' : 'p-2'} ${
              isPreviewing === selectedChar.id 
                ? 'bg-indigo-500 text-white animate-pulse' 
                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white'
            }`}
          >
            {isPreviewing === selectedChar.id ? <Loader2 className={compact ? 'w-3 h-3 animate-spin' : 'w-4 h-4 animate-spin'} /> : <Volume2 className={compact ? 'w-3 h-3' : 'w-4 h-4'} />}
          </button>
          {!compact && (
            <div className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-64 overflow-y-auto"
          >
            {CHARACTERS.map((char: any) => (
              <div
                key={char.id}
                onClick={() => {
                  onSelect(char.id);
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${
                  selectedChar.id === char.id ? 'bg-indigo-50/50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{char.icon}</span>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">{char.name}</p>
                    <p className="text-[10px] text-slate-500">{char.age} tuổi • {char.gender}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(char.id);
                  }}
                  disabled={isPreviewing !== null}
                  className={`p-1.5 rounded-full transition-all ${
                    isPreviewing === char.id 
                      ? 'bg-indigo-500 text-white animate-pulse' 
                      : 'text-indigo-600 hover:bg-indigo-100'
                  }`}
                >
                  {isPreviewing === char.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
