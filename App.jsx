import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, SkipForward, Coffee, BookOpen, RotateCcw, Calendar, CheckCircle, Edit3, Plus, Minus, Save, X, Bot, Send, Sparkles, LayoutGrid, Clock, ListPlus, Trash2, CheckSquare, Square as SquareIcon, Cloud, CloudCheck } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- SETUP SUPABASE CLIENT ---
// Replace these with your actual Supabase Project URL and anon public key from Settings > API
const SUPABASE_URL = 'https://lkltuvpdrebexvoekywb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrbHR1dnBkcmViZXh2b2VreXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTIzMTksImV4cCI6MjEwNDAyODMxOX0.cCgvCZ7eZFqefAEp3aiEzqFfI3bBsZMN4fd1ujsdBNE';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Constants for timer durations (in seconds)
const STUDY_DURATION = 50 * 60;
const BREAK_DURATION = 10 * 60;

const initialSchedule = {
  day1: [
    { id: 'm1', name: 'Medicine', target: 4, completed: 0, subtopics: [{ id: 'st1', name: 'Cardiology Basics', completed: false }, { id: 'st2', name: 'Pulmonology Notes', completed: false }] },
    { id: 's1', name: 'Surgery', target: 4, completed: 0, subtopics: [{ id: 'st3', name: 'General Principles', completed: false }] },
    { id: 'c1', name: 'Commed', target: 4, completed: 0, subtopics: [] },
    { id: 'p1', name: 'Psychiatry', target: 2, completed: 0, subtopics: [] },
  ],
  day2: [
    { id: 'pe1', name: 'Pediatrics', target: 4, completed: 0, subtopics: [] },
    { id: 'g1', name: 'Gyn & Obs', target: 4, completed: 0, subtopics: [] },
    { id: 'f1', name: 'Forensic', target: 4, completed: 0, subtopics: [] },
    { id: 'p2', name: 'Psychiatry', target: 2, completed: 0, subtopics: [] },
  ]
};

export default function App() {
  const getTodayString = () => new Date().toISOString().split('T')[0];
  
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [currentDay, setCurrentDay] = useState('day1');
  const [activeTab, setActiveTab] = useState('tracker'); // 'tracker', 'history', or 'coach'
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  
  // State: Schedule Data mapped by date
  const [scheduleData, setScheduleData] = useState({});
  const [activeSubjectsMap, setActiveSubjectsMap] = useState({});

  // Subtopic input state
  const [newSubtopicText, setNewSubtopicText] = useState({});
  const [editingSubtopicId, setEditingSubtopicId] = useState(null);
  const [editSubtopicText, setEditSubtopicText] = useState('');

  // AI Chat State
  const [chatMessages, setChatMessages] = useState([
    { role: 'model', text: 'Hello! I am your AI Medical Study Coach powered by Gemini. Ask me for study tips, quick summaries, or motivation for your 50/10 sessions!' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Fetch data from Supabase on load or date change
  useEffect(() => {
    fetchDataFromSupabase();
  }, [selectedDate]);

  const fetchDataFromSupabase = async () => {
    setIsCloudSyncing(true);
    try {
      const { data, error } = await supabase
        .from('study_records')
        .select('*')
        .eq('date_key', selectedDate);

      if (error) {
        console.error('Error fetching from Supabase:', error.message);
      } else if (data && data.length > 0) {
        // Load record for this date
        const record = data[0].data;
        setScheduleData(prev => ({ ...prev, [selectedDate]: record.schedule || initialSchedule }));
        if (record.activeSubject) {
          setActiveSubjectsMap(prev => ({ ...prev, [selectedDate]: record.activeSubject }));
        }
      } else {
        // Default if not in cloud yet
        setScheduleData(prev => ({ ...prev, [selectedDate]: initialSchedule }));
      }
    } catch (err) {
      console.error('Supabase connection error:', err);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Save changes to Supabase
  const saveToSupabase = async (updatedSchedule, activeSubId) => {
    setIsCloudSyncing(true);
    try {
      const payloadData = {
        schedule: updatedSchedule,
        activeSubject: activeSubId || null
      };

      // Check if record already exists for date_key
      const { data: existing } = await supabase
        .from('study_records')
        .select('id')
        .eq('date_key', selectedDate);

      if (existing && existing.length > 0) {
        // Update
        await supabase
          .from('study_records')
          .update({ data: payloadData })
          .eq('date_key', selectedDate);
      } else {
        // Insert
        await supabase
          .from('study_records')
          .insert([{ date_key: selectedDate, data: payloadData }]);
      }
    } catch (err) {
      console.error('Error saving to Supabase:', err);
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const schedule = scheduleData[selectedDate] || initialSchedule;
  const activeSubjectId = activeSubjectsMap[selectedDate] || null;

  const setActiveSubjectId = (id) => {
    setActiveSubjectsMap(prev => {
      const updated = { ...prev, [selectedDate]: id };
      saveToSupabase(schedule, id);
      return updated;
    });
  }
  
  // Timer State
  const [timerMode, setTimerMode] = useState('idle'); // 'idle', 'study', 'break'
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // Timer Countdown Logic
  useEffect(() => {
    let interval = null;
    
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeRemaining === 0) {
      handleTimerComplete();
    }
    
    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const handleTimerComplete = () => {
    if (timerMode === 'study') {
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log("Audio play blocked"));
      } catch (e) {}

      if (activeSubjectId) {
        const currentSchedule = scheduleData[selectedDate] || initialSchedule;
        const updatedDay = currentSchedule[currentDay].map(subject => 
          subject.id === activeSubjectId 
            ? { ...subject, completed: subject.completed + 1 }
            : subject
        );
        const newSchedule = { ...currentSchedule, [currentDay]: updatedDay };
        
        setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
        saveToSupabase(newSchedule, activeSubjectId);
      }
      
      setTimerMode('break');
      setTimeRemaining(BREAK_DURATION);
      setIsRunning(true);
      
    } else if (timerMode === 'break') {
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => console.log("Audio play blocked"));
      } catch (e) {}
      
      setTimerMode('idle');
      setActiveSubjectId(null);
      setIsRunning(false);
    }
  };

  const startStudySession = (subjectId) => {
    if (isRunning) {
      const confirmSwitch = window.confirm("A timer is already running. Switch subjects?");
      if (!confirmSwitch) return;
    }
    
    setActiveSubjectId(subjectId);
    setTimerMode('study');
    setTimeRemaining(STUDY_DURATION);
    setIsRunning(true);
  };

  const toggleTimer = () => {
    if (timerMode === 'idle') return;
    setIsRunning(!isRunning);
  };

  const stopTimer = () => {
    setIsRunning(false);
    setTimerMode('idle');
    setActiveSubjectId(null);
    setTimeRemaining(0);
  };

  const skipTimer = () => {
    setTimeRemaining(0);
  };

  const resetProgress = () => {
    if (window.confirm(`Are you sure you want to reset all progress for ${selectedDate}?`)) {
      const newSchedule = { ...schedule, [currentDay]: initialSchedule[currentDay] };
      setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
      saveToSupabase(newSchedule, null);
      stopTimer();
    }
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    stopTimer();
  }

  const updateCompletedHours = (subjectId, delta) => {
    const currentSchedule = scheduleData[selectedDate] || initialSchedule;
    const updatedDay = currentSchedule[currentDay].map(subject => {
      if (subject.id === subjectId) {
        const newCompleted = Math.max(0, subject.completed + delta);
        return { ...subject, completed: newCompleted };
      }
      return subject;
    });
    const newSchedule = { ...currentSchedule, [currentDay]: updatedDay };
    
    setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
    saveToSupabase(newSchedule, activeSubjectId);
  };

  // Subtopic Management Handlers
  const addSubtopic = (subjectId) => {
    const text = (newSubtopicText[subjectId] || '').trim();
    if (!text) return;

    const currentSchedule = scheduleData[selectedDate] || initialSchedule;
    const updatedDay = currentSchedule[currentDay].map(subject => {
      if (subject.id === subjectId) {
        const newSub = { id: 'sub_' + Date.now(), name: text, completed: false };
        return { ...subject, subtopics: [...(subject.subtopics || []), newSub] };
      }
      return subject;
    });
    const newSchedule = { ...currentSchedule, [currentDay]: updatedDay };

    setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
    saveToSupabase(newSchedule, activeSubjectId);
    setNewSubtopicText(prev => ({ ...prev, [subjectId]: '' }));
  };

  const toggleSubtopic = (subjectId, subtopicId) => {
    const currentSchedule = scheduleData[selectedDate] || initialSchedule;
    const updatedDay = currentSchedule[currentDay].map(subject => {
      if (subject.id === subjectId) {
        const updatedSubs = (subject.subtopics || []).map(sub => 
          sub.id === subtopicId ? { ...sub, completed: !sub.completed } : sub
        );
        return { ...subject, subtopics: updatedSubs };
      }
      return subject;
    });
    const newSchedule = { ...currentSchedule, [currentDay]: updatedDay };

    setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
    saveToSupabase(newSchedule, activeSubjectId);
  };

  const deleteSubtopic = (subjectId, subtopicId) => {
    const currentSchedule = scheduleData[selectedDate] || initialSchedule;
    const updatedDay = currentSchedule[currentDay].map(subject => {
      if (subject.id === subjectId) {
        const updatedSubs = (subject.subtopics || []).filter(sub => sub.id !== subtopicId);
        return { ...subject, subtopics: updatedSubs };
      }
      return subject;
    });
    const newSchedule = { ...currentSchedule, [currentDay]: updatedDay };

    setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
    saveToSupabase(newSchedule, activeSubjectId);
  };

  const saveEditedSubtopic = (subjectId, subtopicId) => {
    if (!editSubtopicText.trim()) return;
    const currentSchedule = scheduleData[selectedDate] || initialSchedule;
    const updatedDay = currentSchedule[currentDay].map(subject => {
      if (subject.id === subjectId) {
        const updatedSubs = (subject.subtopics || []).map(sub => 
          sub.id === subtopicId ? { ...sub, name: editSubtopicText.trim() } : sub
        );
        return { ...subject, subtopics: updatedSubs };
      }
      return subject;
    });
    const newSchedule = { ...currentSchedule, [currentDay]: updatedDay };

    setScheduleData(prev => ({ ...prev, [selectedDate]: newSchedule }));
    saveToSupabase(newSchedule, activeSubjectId);
    setEditingSubtopicId(null);
    setEditSubtopicText('');
  };

  // Call Gemini API for AI Study Coach
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isAiLoading) return;

    const question = userInput.trim();
    setUserInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setIsAiLoading(true);

    try {
      const systemPrompt = "You are an encouraging and knowledgeable medical study coach helping a student preparing for board exams or medical school rotations. Give concise, highly educational, and motivating advice tailored to subjects like Medicine, Surgery, Pediatrics, and Gyn & Obs.";
      
      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

      const payload = {
        contents: [
          { role: 'user', parts: [{ text: `Context: The student is following a strict study schedule including Medicine, Surgery, Commed, Psychiatry, Pediatrics, Gyn & Obs, and Forensic Medicine in 50-minute blocks.\n\nStudent question: ${question}` }] }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        }
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      const candidate = result.candidates?.[0];

      if (candidate && candidate.content?.parts?.[0]?.text) {
        const aiReply = candidate.content.parts[0].text;
        setChatMessages(prev => [...prev, { role: 'model', text: aiReply }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'model', text: "Sorry, I couldn't process that right now. Keep up the great study grind!" }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Network error connecting to the AI Coach. Please try again." }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentSubjects = schedule[currentDay] || [];
  const activeSubject = currentSubjects.find(s => s.id === activeSubjectId);
  const totalTarget = currentSubjects.reduce((acc, curr) => acc + curr.target, 0);
  const totalCompleted = currentSubjects.reduce((acc, curr) => acc + curr.completed, 0);
  const isDayCompleted = totalCompleted >= totalTarget;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-900 p-6 rounded-3xl shadow-lg border border-slate-800">
          <div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 flex items-center gap-2">
              Med-Study Tracker <Sparkles className="text-cyan-400" size={24} />
            </h1>
            <p className="text-slate-400 mt-1 font-medium flex items-center gap-2">
              Cloud Synced via Supabase 
              {isCloudSyncing ? <span className="text-xs text-amber-400 animate-pulse">Syncing...</span> : <span className="text-xs text-emerald-400 flex items-center gap-1">● Online</span>}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800">
              <button 
                onClick={() => setActiveTab('tracker')}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${activeTab === 'tracker' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Study Timer
              </button>
              <button 
                onClick={() => setActiveTab('coach')}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 ${activeTab === 'coach' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <Bot size={16} /> AI Coach
              </button>
            </div>

            {activeTab === 'tracker' && (
              <>
                <div className="relative group">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-cyan-400 transition-colors">
                      <Calendar size={18} />
                   </div>
                   <input 
                      type="date" 
                      value={selectedDate}
                      onChange={handleDateChange}
                      className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-xl focus:ring-cyan-500 focus:border-cyan-500 block w-full pl-10 p-2.5 transition-all outline-none hover:border-slate-600 cursor-pointer"
                   />
                </div>

                <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
                  <button 
                    onClick={() => { setCurrentDay('day1'); stopTimer(); }}
                    className={`px-5 py-2 rounded-xl font-bold transition-all ${currentDay === 'day1' ? 'bg-slate-800 shadow-md text-violet-400 scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Day 1
                  </button>
                  <button 
                    onClick={() => { setCurrentDay('day2'); stopTimer(); }}
                    className={`px-5 py-2 rounded-xl font-bold transition-all ${currentDay === 'day2' ? 'bg-slate-800 shadow-md text-violet-400 scale-105' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    Day 2
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {activeTab === 'coach' ? (
          <div className="bg-slate-900 p-6 md:p-8 rounded-3xl shadow-lg border border-slate-800 flex flex-col h-[600px]">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
              <div className="bg-violet-600/20 p-3 rounded-2xl border border-violet-500/30 text-violet-400">
                <Bot size={28} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Gemini Medical AI Coach</h2>
                <p className="text-sm text-slate-400">Ask questions, request mnemonics, or test your knowledge.</p>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto space-y-4 py-4 pr-2">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-violet-600 text-white rounded-br-none shadow-md' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 text-slate-400 p-4 rounded-2xl text-sm animate-pulse border border-slate-700">
                    Coach Gemini is thinking...
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="pt-4 border-t border-slate-800 flex gap-3">
              <input 
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="e.g. Give me high-yield facts for Surgery or Medicine..."
                className="bg-slate-950 border border-slate-700 text-slate-200 text-sm rounded-2xl px-4 py-3 flex-grow outline-none focus:border-violet-500 transition-all"
              />
              <button 
                type="submit"
                disabled={isAiLoading || !userInput.trim()}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-violet-900/50 flex items-center gap-2"
              >
                <Send size={18} /> Send
              </button>
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Timer */}
            <div className="lg:col-span-5 bg-slate-900 p-6 md:p-8 rounded-3xl shadow-lg border border-slate-800 flex flex-col items-center justify-center text-center h-full relative overflow-hidden">
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl opacity-10 pointer-events-none transition-all duration-1000 ${timerMode === 'study' ? 'bg-violet-500' : timerMode === 'break' ? 'bg-cyan-500' : 'bg-transparent'}`}></div>

              {timerMode === 'idle' ? (
                <div className="mb-6 text-slate-500 relative z-10">
                  <div className="bg-slate-800/80 text-slate-400 p-6 rounded-full inline-block mb-4 border border-slate-700/50">
                    <BookOpen size={48} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-300">Ready to Focus?</h2>
                  <p className="text-sm mt-2 font-medium">Select a subject to start a 50m session.</p>
                </div>
              ) : (
                <div className="mb-8 flex flex-col items-center relative z-10">
                  <div className={`flex items-center gap-2 font-bold px-5 py-2 rounded-full mb-4 shadow-sm border ${timerMode === 'study' ? 'bg-violet-900/40 border-violet-700/50 text-violet-300' : 'bg-cyan-900/40 border-cyan-700/50 text-cyan-300'}`}>
                    {timerMode === 'study' ? <BookOpen size={18} /> : <Coffee size={18} />}
                    {timerMode === 'study' ? 'Focus Session' : 'Break Time'}
                  </div>
                  
                  {timerMode === 'study' && activeSubject && (
                    <h3 className="text-2xl font-extrabold text-slate-100 mb-2 drop-shadow-sm">{activeSubject.name}</h3>
                  )}
                  {timerMode === 'break' && (
                    <h3 className="text-2xl font-extrabold text-slate-100 mb-2 drop-shadow-sm">Take a breather ☕</h3>
                  )}
                </div>
              )}

              <div className={`relative z-10 text-7xl md:text-8xl font-black tabular-nums tracking-tight mb-8 drop-shadow-lg ${timerMode === 'study' ? 'text-transparent bg-clip-text bg-gradient-to-br from-violet-400 to-fuchsia-400' : timerMode === 'break' ? 'text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 to-teal-400' : 'text-slate-700'}`}>
                {timerMode === 'idle' ? "50:00" : formatTime(timeRemaining)}
              </div>

              <div className="flex items-center gap-4 relative z-10">
                <button 
                  onClick={toggleTimer}
                  disabled={timerMode === 'idle'}
                  className={`p-5 rounded-full flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 ${
                    timerMode === 'idle' 
                      ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-700/50' 
                      : isRunning
                        ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-orange-900/50'
                        : 'bg-gradient-to-r from-cyan-600 via-violet-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/50'
                  }`}
                >
                  {isRunning ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                </button>
                
                <button 
                  onClick={stopTimer}
                  disabled={timerMode === 'idle'}
                  className={`p-4 rounded-full flex items-center justify-center transition-all ${timerMode === 'idle' ? 'bg-slate-800/30 text-slate-700 cursor-not-allowed' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-rose-400 shadow-md border border-slate-700'}`}
                  title="Stop Timer"
                >
                  <Square size={24} fill="currentColor" />
                </button>
                
                <button 
                  onClick={skipTimer}
                  disabled={timerMode === 'idle'}
                  className={`p-4 rounded-full flex items-center justify-center transition-all ${timerMode === 'idle' ? 'bg-slate-800/30 text-slate-700 cursor-not-allowed' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-cyan-400 shadow-md border border-slate-700'}`}
                  title="Skip to end"
                >
                  <SkipForward size={24} />
                </button>
              </div>
            </div>

            {/* Right Column: Schedule, Progress & Subtopics */}
            <div className="lg:col-span-7 bg-slate-900 p-6 md:p-8 rounded-3xl shadow-lg border border-slate-800 flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-3">
                  {currentDay === 'day1' ? 'Day 1 Schedule' : 'Day 2 Schedule'}
                  {isDayCompleted && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      <CheckCircle size={14} /> Completed
                    </span>
                  )}
                </h2>
                <button 
                  onClick={resetProgress}
                  className="text-sm flex items-center gap-1.5 font-semibold text-slate-400 hover:text-rose-400 transition-colors bg-slate-800 px-3 py-1.5 rounded-lg shadow-sm border border-slate-700/50"
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>

              <div className="space-y-4 flex-grow">
                {currentSubjects.map((subject) => {
                  const progressPercentage = Math.min(100, (subject.completed / subject.target) * 100);
                  const isComplete = subject.completed >= subject.target;
                  const isActive = activeSubjectId === subject.id && timerMode === 'study';

                  return (
                    <div 
                      key={subject.id} 
                      className={`p-5 rounded-2xl border-2 transition-all ${isActive ? 'border-violet-500 bg-violet-900/20 shadow-lg shadow-violet-900/20' : isComplete ? 'border-cyan-800/50 bg-cyan-900/10' : 'border-slate-800 bg-slate-900 hover:border-slate-700'}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className={`font-bold text-lg flex items-center gap-2 ${isActive ? 'text-violet-300' : isComplete ? 'text-cyan-400' : 'text-slate-200'}`}>
                            {subject.name}
                            {isComplete && <CheckCircle size={16} className="text-cyan-500" />}
                          </h3>
                          
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-sm font-medium text-slate-400">
                              {subject.completed} / {subject.target} sessions completed
                            </p>
                            
                            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                              <button 
                                onClick={() => updateCompletedHours(subject.id, -1)}
                                disabled={subject.completed <= 0}
                                className="px-2 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 transition-colors"
                              >
                                <Minus size={12} />
                              </button>
                              <span className="text-xs px-2 text-slate-300 font-semibold">{subject.completed}h</span>
                              <button 
                                onClick={() => updateCompletedHours(subject.id, 1)}
                                className="px-2 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {!isComplete ? (
                          <button
                            onClick={() => startStudySession(subject.id)}
                            disabled={isActive}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm
                              ${isActive 
                                ? 'bg-violet-900/30 text-violet-500 cursor-not-allowed shadow-none' 
                                : 'bg-slate-800 text-violet-400 border border-violet-800/50 hover:bg-gradient-to-r hover:from-violet-600 hover:to-fuchsia-600 hover:text-white hover:border-transparent hover:shadow-lg hover:shadow-violet-900/50 transform hover:-translate-y-0.5'
                              }`}
                          >
                            {isActive ? 'In Progress' : 'Start 50m'}
                          </button>
                        ) : (
                          <span className="px-4 py-2 rounded-xl font-bold text-sm bg-cyan-900/30 text-cyan-400 border border-cyan-800/50 shadow-sm flex items-center gap-1">
                            Done
                          </span>
                        )}
                      </div>
                      
                      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden shadow-inner border border-slate-800 mb-4">
                        <div 
                          className={`h-full transition-all duration-700 ease-out rounded-full ${isComplete ? 'bg-gradient-to-r from-cyan-500 to-teal-400' : 'bg-gradient-to-r from-violet-500 to-fuchsia-400'}`}
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>

                      {/* Subtopics Section */}
                      <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Subtopics / Checklist</p>
                        
                        {subject.subtopics && subject.subtopics.length > 0 ? (
                          <div className="space-y-1.5">
                            {subject.subtopics.map(sub => (
                              <div key={sub.id} className="flex items-center justify-between bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800/60 group">
                                {editingSubtopicId === sub.id ? (
                                  <div className="flex items-center gap-2 flex-grow mr-2">
                                    <input 
                                      type="text"
                                      value={editSubtopicText}
                                      onChange={(e) => setEditSubtopicText(e.target.value)}
                                      className="bg-slate-900 border border-slate-700 text-xs text-slate-200 px-2 py-1 rounded-lg flex-grow outline-none focus:border-cyan-500"
                                    />
                                    <button onClick={() => saveEditedSubtopic(subject.id, sub.id)} className="text-xs bg-cyan-600 text-white px-2 py-1 rounded-lg">Save</button>
                                    <button onClick={() => setEditingSubtopicId(null)} className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-lg">Cancel</button>
                                  </div>
                                ) : (
                                  <>
                                    <div 
                                      onClick={() => toggleSubtopic(subject.id, sub.id)}
                                      className="flex items-center gap-2.5 cursor-pointer flex-grow select-none"
                                    >
                                      {sub.completed ? (
                                        <CheckSquare size={16} className="text-cyan-400 shrink-0" />
                                      ) : (
                                        <SquareIcon size={16} className="text-slate-600 shrink-0" />
                                      )}
                                      <span className={`text-xs ${sub.completed ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                                        {sub.name}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => { setEditingSubtopicId(sub.id); setEditSubtopicText(sub.name); }}
                                        className="p-1 text-slate-500 hover:text-slate-300"
                                        title="Edit subtopic"
                                      >
                                        <Edit3 size={12} />
                                      </button>
                                      <button 
                                        onClick={() => deleteSubtopic(subject.id, sub.id)}
                                        className="p-1 text-slate-500 hover:text-rose-400"
                                        title="Delete subtopic"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No subtopics added yet.</p>
                        )}

                        {/* Add Subtopic Input */}
                        <div className="flex gap-2 pt-1">
                          <input 
                            type="text" 
                            value={newSubtopicText[subject.id] || ''}
                            onChange={(e) => setNewSubtopicText({ ...newSubtopicText, [subject.id]: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') addSubtopic(subject.id); }}
                            placeholder="Add subtopic (e.g. Chapter 3, ECG basics)..."
                            className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-xl px-3 py-1.5 flex-grow outline-none focus:border-cyan-500"
                          />
                          <button 
                            onClick={() => addSubtopic(subject.id)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 border border-slate-700/50 transition-colors"
                          >
                            <Plus size={14} /> Add
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Daily Summary */}
              <div className="mt-8 pt-6 border-t border-slate-800">
                <div className="flex items-center justify-between text-sm text-slate-400 mb-3">
                  <span className="font-bold">Daily Total Progress</span>
                  <span className={`font-extrabold px-3 py-1 rounded-lg border ${isDayCompleted ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-slate-800 text-slate-200 border-slate-700'}`}>
                    {totalCompleted} / {totalTarget} hrs
                  </span>
                </div>
                <div className="h-4 w-full bg-slate-950 rounded-full overflow-hidden shadow-inner p-0.5 border border-slate-800 relative">
                  <div 
                    className={`h-full transition-all duration-1000 ease-out rounded-full ${isDayCompleted ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 shadow-[0_0_15px_rgba(251,191,36,0.5)]' : 'bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500'}`}
                    style={{ width: `${(totalCompleted / totalTarget) * 100}%` }}
                  ></div>
                  {isDayCompleted && (
                     <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></div>
                  )}
                </div>
                {isDayCompleted && (
                   <p className="text-center text-amber-400 font-bold mt-4 animate-bounce">
                      🎉 Outstanding! You've completed your schedule for today! 🎉
                   </p>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
