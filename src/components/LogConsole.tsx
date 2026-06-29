import React, { useState, useEffect, useRef } from 'react';
import { SerialLog } from '../types';
import { Terminal, Trash2, Filter, AlertCircle, PlayCircle, EyeOff } from 'lucide-react';

interface LogConsoleProps {
  logs: SerialLog[];
  onClearLogs: () => void;
  onAddLog: (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => void;
}

export default function LogConsole({ logs, onClearLogs, onAddLog }: LogConsoleProps) {
  const [filter, setFilter] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter(log => {
    if (filter === 'ALL') return true;
    return log.source === filter;
  });

  const getSourceStyle = (source: string) => {
    switch (source) {
      case 'WIFI':
        return 'text-accent-400 bg-accent-950/40 border border-accent-900/40';
      case 'HTTP':
        return 'text-blue-400 bg-blue-950/40 border border-blue-900/40';
      case 'GPIO':
        return 'text-emerald-400 bg-emerald-950/40 border border-emerald-900/40';
      case 'ERROR':
        return 'text-rose-450 bg-rose-950/40 border border-rose-900/40';
      default:
        return 'text-neutral-400 bg-neutral-950 border border-neutral-850';
    }
  };

  const simulateButtonPress = () => {
    const messages = [
      { source: 'GPIO' as const, msg: `Simulado clique em Botão Externo GPIO 15 -> Entrada Ativada [HIGH]` },
      { source: 'WIFI' as const, msg: `RSSI flutuou para ${-55 - Math.floor(Math.random() * 20)} dBm` },
      { source: 'HTTP' as const, msg: 'GET /api/status - Retornado JSON com sucesso de 192.168.4.10' },
      { source: 'SYSTEM' as const, msg: `Ciclo livre de CPU: heap interna livre: ${284 - Math.floor(Math.random() * 4)} KB` }
    ];
    const picked = messages[Math.floor(Math.random() * messages.length)];
    onAddLog(picked.source, picked.msg);
  };

  return (
    <div className="glass-card p-5 rounded-3xl border border-white/5 shadow-inner backdrop-blur-sm flex flex-col h-[320px]">
      {/* Console Header */}
      <div className="flex justify-between items-center pb-3 border-b border-[#252833]/60 mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Terminal Monitor Serial (115200)</h4>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick simulation helper */}
          <button 
            type="button"
            onClick={simulateButtonPress}
            title="Simular alguma atividade no ESP32"
            className="flex items-center gap-1 text-[9px] font-mono px-2.5 py-1.5 glass-panel hover:bg-[#252936] border border-white/5 text-slate-400 hover:text-white rounded-lg transition-all"
          >
            <PlayCircle className="w-3 h-3 text-accent-400" /> Simular atividade
          </button>
          
          <button 
            type="button" 
            onClick={onClearLogs}
            className="p-1.5 px-2 rounded-lg glass-panel hover:bg-[#252936] text-slate-500 hover:text-rose-400 transition-all border border-white/5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[#252833]/30 text-[9px] font-mono">
        {['ALL', 'SYSTEM', 'WIFI', 'HTTP', 'GPIO', 'ERROR'].map(src => {
          return (
            <button 
              key={src} 
              onClick={() => setFilter(src)}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                filter === src 
                  ? 'bg-accent-500 text-slate-950 font-bold' 
                  : 'glass-panel text-slate-500 hover:text-slate-300'
              }`}
            >
              {src}
            </button>
          );
        })}
      </div>

      {/* Monitor Display Screen */}
      <div 
        ref={scrollRef}
        className="flex-1 glass-panel p-3 mt-3 rounded-2xl border border-white/5 font-mono text-[9.5px] leading-relaxed overflow-y-auto max-h-[195px]"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-650 gap-1.5 py-6">
            <EyeOff className="w-5 h-5 opacity-40" />
            <span>Nenhum log correspondente no buffer</span>
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            return (
              <div key={index} className="flex gap-2 items-start py-0.5 hover:bg-white/5 rounded transition-all">
                <span className="text-slate-650 select-none">[{log.timestamp}]</span>
                <span className={`text-[8px] font-bold px-1.5 py-[0.5px] rounded select-none scale-90 ${getSourceStyle(log.source)}`}>
                  {log.source}
                </span>
                <span className="text-slate-300 break-all">{log.message}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between items-center text-[8px] font-mono text-slate-550 mt-2 select-none">
        <span>Pronto para receber buffer UART</span>
        <span>Velocidade física: 115200 bps</span>
      </div>
    </div>
  );
}
