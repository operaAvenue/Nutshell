import { useState, useEffect } from 'react';
import { Activity, Power, Cpu, Grid, List, Layers, Server } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PinState {
  gpio: number;
  name: string;
  mode: string;
  customLabel?: string;
  value: number;
  invertLogic?: boolean;
}

interface NodeStatus {
  hostname: string;
  ip: string;
  heap: number;
  wifi_rssi: number;
  wifiMode: string;
  ssid: string;
  pins: PinState[];
}

interface ESP32Node {
  ip: string;
  hostname: string;
  isOnline: boolean;
  rssi: number;
  role: 'COORDINATOR' | 'NODE';
  lastSeen: string;
  pinStates: Record<number, { mode: string; customLabel: string; value: number }>;
}

export default function PublicDashboard() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [nodes, setNodes] = useState<ESP32Node[]>(() => {
    try {
      const saved = localStorage.getItem('esp32_nodes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activeTabId, setActiveTabId] = useState<string>('principal');
  const [sensorHistory, setSensorHistory] = useState<Record<string, any[]>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Fetch Principal status
  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setStatus(data);
            
            // Update sensor history
            setSensorHistory(prev => {
              const newHistory = { ...prev };
              const now = new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              
              data.pins.forEach((p: PinState) => {
                if (p.mode === 'ANALOG_INPUT' || p.mode.startsWith('SENSOR_')) {
                  const key = `principal_${p.gpio}`;
                  if (!newHistory[key]) newHistory[key] = [];
                  newHistory[key] = [...newHistory[key], { time: now, value: p.value }].slice(-20);
                }
              });
              
              return newHistory;
            });
          }
        }
      } catch (err) {
        console.error("Erro ao buscar status", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Discover and Poll Servos
  useEffect(() => {
    let mounted = true;

    const discoverAndPoll = async () => {
      // 1. Quick scanning of melkweg001 to 005
      let updatedList = [...nodes];
      let listChanged = false;

      for (let i = 1; i <= 5; i++) {
        const hostname = `melkweg${String(i).padStart(3, '0')}`;
        const ip = `${hostname}.local`;
        
        if (!updatedList.some(n => n.hostname === hostname || n.ip === ip)) {
          try {
            const res = await fetch(`http://${ip}/api/status`);
            if (res.ok) {
              const data = await res.json();
              const pinStates: Record<number, any> = {};
              if (data.pins) {
                data.pins.forEach((p: any) => {
                  pinStates[p.gpio] = { mode: p.mode, customLabel: p.customLabel, value: p.value };
                });
              }
              const newNode: ESP32Node = {
                ip,
                hostname,
                isOnline: true,
                rssi: data.wifi_rssi || 0,
                role: 'NODE',
                lastSeen: new Date().toLocaleTimeString(),
                pinStates
              };
              updatedList.push(newNode);
              listChanged = true;
            }
          } catch (e) {}
        }
      }

      // 2. Poll existing nodes in the list
      const polledNodes = await Promise.all(updatedList.map(async (node) => {
        try {
          const res = await fetch(`http://${node.ip}/api/status`);
          if (res.ok) {
            const data = await res.json();
            const pinStates: Record<number, any> = {};
            if (data.pins) {
              data.pins.forEach((p: any) => {
                pinStates[p.gpio] = { mode: p.mode, customLabel: p.customLabel, value: p.value };
              });
            }

            // Update sensor history for this remote node
            setSensorHistory(prev => {
              const newHistory = { ...prev };
              const now = new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              
              if (data.pins) {
                data.pins.forEach((p: any) => {
                  if (p.mode === 'ANALOG_INPUT' || p.mode.startsWith('SENSOR_')) {
                    const key = `${node.hostname}_${p.gpio}`;
                    if (!newHistory[key]) newHistory[key] = [];
                    newHistory[key] = [...newHistory[key], { time: now, value: p.value }].slice(-20);
                  }
                });
              }
              return newHistory;
            });

            return {
              ...node,
              isOnline: true,
              rssi: data.wifi_rssi || 0,
              lastSeen: new Date().toLocaleTimeString(),
              pinStates
            };
          }
        } catch (e) {
          return { ...node, isOnline: false };
        }
        return node;
      }));

      // Compare list differences
      let hasDiff = listChanged;
      if (polledNodes.length !== nodes.length) {
        hasDiff = true;
      } else {
        polledNodes.forEach((pn, idx) => {
          const cn = nodes[idx];
          if (!cn || pn.isOnline !== cn.isOnline || JSON.stringify(pn.pinStates) !== JSON.stringify(cn.pinStates)) {
            hasDiff = true;
          }
        });
      }

      if (mounted && hasDiff) {
        setNodes(polledNodes);
        localStorage.setItem('esp32_nodes', JSON.stringify(polledNodes));
      }
    };

    discoverAndPoll();
    const interval = setInterval(discoverAndPoll, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [nodes]);

  const handleToggle = async (gpio: number, currentValue: number) => {
    const newValue = currentValue ? 0 : 1;
    
    if (activeTabId === 'principal') {
      // Optimistic UI update
      setStatus(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pins: prev.pins.map(p => p.gpio === gpio ? { ...p, value: newValue } : p)
        };
      });
      try {
        await fetch(`/api/toggle?pin=${gpio}&val=${newValue}`);
      } catch (err) {
        console.error("Erro ao alternar pino principal", err);
      }
    } else {
      const activeNode = nodes.find(n => n.hostname === activeTabId);
      if (activeNode) {
        // Optimistic UI update for remote node
        setNodes(prev => prev.map(n => {
          if (n.hostname === activeNode.hostname) {
            return {
              ...n,
              pinStates: {
                ...n.pinStates,
                [gpio]: { ...n.pinStates[gpio], value: newValue }
              }
            };
          }
          return n;
        }));
        try {
          await fetch(`http://${activeNode.ip}/api/toggle?pin=${gpio}&val=${newValue}`);
        } catch (err) {
          console.error("Erro ao alternar pino remoto", err);
        }
      }
    }
  };

  const activeNode = nodes.find(n => n.hostname === activeTabId);

  let outputPins: PinState[] = [];
  let sensorPins: PinState[] = [];
  let cameraPins: PinState[] = [];

  if (activeTabId === 'principal') {
    outputPins = status?.pins.filter(p => p.mode === 'DIGITAL_OUTPUT' || p.mode === 'PWM_OUTPUT' || p.mode === 'VIRTUAL_BOOLEAN') || [];
    sensorPins = status?.pins.filter(p => p.mode === 'ANALOG_INPUT' || p.mode.startsWith('SENSOR_')) || [];
    cameraPins = status?.pins.filter(p => p.mode === 'CAMERA_STREAM') || [];
  } else if (activeNode && activeNode.isOnline) {
    const pinsList: PinState[] = Object.entries(activeNode.pinStates).map(([gpioStr, p]: [string, any]) => ({
      gpio: parseInt(gpioStr),
      name: `GPIO ${gpioStr}`,
      mode: p.mode,
      customLabel: p.customLabel,
      value: p.value
    }));
    outputPins = pinsList.filter(p => p.mode === 'DIGITAL_OUTPUT' || p.mode === 'PWM_OUTPUT' || p.mode === 'VIRTUAL_BOOLEAN');
    sensorPins = pinsList.filter(p => p.mode === 'ANALOG_INPUT' || p.mode.startsWith('SENSOR_'));
    cameraPins = pinsList.filter(p => p.mode === 'CAMERA_STREAM');
  }

  return (
    <div className="min-h-screen text-slate-300 font-sans selection:bg-accent-500/30">
      <header className="glass-panel border-b border-white/5 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <svg 
              viewBox="0 0 128.38 168.24" 
              className="fill-current text-white flex-shrink-0 animate-pulse"
              style={{
                width: 'calc(1.5rem * var(--logo-scale))',
                height: 'calc(1.5rem * var(--logo-scale))'
              }}
            >
              <path d="M105.41,132.58h0v-6.99c0-1.28-2.1-6.84-2.8-8.28-9.04-18.66-35.46-16.44-46.77-1.28-8.66,11.62-11.28,28.4-1.03,39.92,4.68,5.26,14.22,5.98,19.27,11.34-12.46-4.63-25.99-6.6-39.04-3.13-3.7.98-7.09,2.67-10.61,4.09,3.87-4.86,10.57-7.39,16.47-8.84,2.4-.59,5.07-.56,7.42-1.27.36-.11,1.04.17.69-.73-.77-1.95-4.69-5.72-5.21-7.85-.23-.96.47-3.61.26-5.52-.23-2.2-1.08-4.46-2.51-6.16-.08,1.62,1.01,2.79,1.21,4.58.18,1.6.15,4.43-.32,5.95-.82,2.64-5.54,5.32-7.34,2.67-2.77-7.38-10.82-24.23-20.3-14.4-.78.81-1,2.23-1.93,2.65.44-6.95,3.82-10.96,11.08-10.36-14.91-13.69-32.89-36.11-18.91-56.52,2.91-4.25,7.54-8.59,12.16-10.74.35-1.35-1.03-.98-1.9-1.7-4.97-4.14-4.29-10.9.45-14.93,5.07-4.32,22.25-8.78,21.68-16.81-.37-5.16-6.82-9.45-10.11-12.83,5.83-.32,11.59-.93,17.35.47-4.38-3.95-9.1-8.34-10.12-14.46,2.56,1.92,5.15,2.62,8.14,1.15C43.57,2.16,45.5-.14,45.63,0c.09.09.24.98.71,1.46,3.46,3.58,7.67,4.6,11.83,1.43.77,6.44,5.19,8.59,11.09,6.27.27,4.65,4.54,6.42,8.68,6.51-5.68,6.06-14.25,7.98-22.17,5.55.94,2.04,1.87,3.69,2.53,5.9,5.31,17.77-5.14,31.41-10.11,47.02-1.96,6.16-4.79,17.48,3.95,19.4l4.59-1.71c-1.7,3.18-2.99,6.24-6.09,8.37l-3.54,1.51c11.16-.98,11.28-14,13.63-22.27,10.65-37.52,58.19-30.79,66.06,5.98,5.93,27.7-5.06,55.06-27.15,71.96-.38.29-.93,1.3-1.44.49,15.59-14.76,26.98-40.3,19.17-61.59-6.76-18.42-26.04-20.48-42.79-15.29-.12.85,1.09.48,1.62.42,8.12-.88,14.38-1.86,22.46.8,19.21,6.33,19.5,29.87,14.34,46.12-2.21,6.94-5.72,13.63-9.75,19.66l4.82-13.01c2.63-10.65,2.02-23.1-4.19-32.45-7.57-11.41-20.6-12.86-31.72-5.39,2.42-.09,4.53-1.5,7.13-2.03,20.41-4.14,28.54,15.88,27.11,32.9l-.98,4.56h0ZM43.07,25.01c3.28,1.09,4.4-3.78,1.25-4.21-2.39-.32-3.41,3.49-1.25,4.21ZM22.99,61.22h0c-.11.85,1.09.45,1.68.48,14.78.66,19.8-12.51,20.97-25.06l-3.76,11.42c-3.63,7.73-10.07,12.93-18.89,13.17h0ZM13.35,81.47c-2.92,12.71-2,26.63,8.67,35.44,4.55,3.75,11.46,6.93,17.37,7.22-10.19-3.37-18.92-9.63-23.23-19.68-.96-2.24-2.81-7.47-2.81-9.72,0-3.61-.21-7.53,0-11.09,0-.33,1.27-2.07,0-2.17Z" />
            </svg>
            <div>
              <h1 
                className="font-bold tracking-tight text-white flex items-center gap-2"
                style={{ 
                  fontFamily: "'Berkshire Swash', serif",
                  fontSize: 'calc(1.25rem * var(--logo-scale))'
                }}
              >
                GrowinStones
                <span className="text-[10px] font-mono tracking-widest font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded uppercase select-none flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                  ONLINE
                </span>
              </h1>
              {status && (
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  IP: {status.ip} | WiFi: {status.ssid} ({status.wifi_rssi}dBm)
                </p>
              )}
            </div>
          </div>
          <a href="#/admin" className="text-xs font-bold text-slate-500 hover:text-accent-400 transition-colors uppercase tracking-wider flex items-center gap-1">
            Configurar
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {!status ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Activity className="w-8 h-8 animate-spin text-accent-500 mb-4" />
            <p>Conectando ao Controlador...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* TABS SELECTOR */}
            <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
              {[
                { id: 'principal', label: status.role === 'principal' ? 'Principal (Nutshell)' : status.hostname, ip: status.ip, isOnline: true },
                ...nodes.map(n => ({ id: n.hostname, label: `Servo ${n.hostname.replace('melkweg', '')}`, ip: n.ip, isOnline: n.isOnline }))
              ].map((tab) => {
                const isActive = activeTabId === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer select-none ${
                      isActive
                        ? 'bg-accent-500/10 border-accent-500/30 text-accent-400 shadow-[0_0_15px_var(--color-accent-glow)]'
                        : 'glass-panel border-white/5 text-slate-400 hover:text-slate-200 hover:border-slate-750/50'
                    }`}
                  >
                    <Server className={`w-3.5 h-3.5 ${isActive ? 'text-accent-400' : 'text-slate-500'}`} />
                    <span>{tab.label}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${tab.isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  </button>
                );
              })}
            </div>

            {activeTabId !== 'principal' && activeNode && !activeNode.isOnline && (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 glass-card p-6 rounded-3xl border border-white/5 mt-4">
                <Activity className="w-8 h-8 text-rose-500 mb-4 animate-pulse" />
                <p className="font-bold text-slate-300 mb-1">Nó Offline</p>
                <p className="text-xs text-slate-550">Não foi possível conectar a http://{activeNode.ip}/api/status</p>
              </div>
            )}

            {(activeTabId === 'principal' || (activeNode && activeNode.isOnline)) && (
              <>
                {/* SWITCHES / OUTPUTS */}
                {outputPins.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <Power className="w-4 h-4 text-accent-500" /> Atuadores
                      </h2>
                      <div className="flex items-center gap-2 glass-panel p-1 rounded-xl border border-white/5 shadow-inner">
                        <button 
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-accent-500/20 text-accent-400' : 'text-slate-500 hover:text-slate-300'}`}
                          title="Visão em Grade"
                        >
                          <Grid className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-accent-500/20 text-accent-400' : 'text-slate-500 hover:text-slate-300'}`}
                          title="Visão em Lista"
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {viewMode === 'grid' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {outputPins.map(pin => (
                          <div key={pin.gpio} className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 shadow-lg hover:border-white/10 transition-colors">
                            <span className="text-xs font-bold text-slate-400 text-center truncate w-full">
                              {pin.customLabel || pin.name}
                            </span>
                            <button 
                              onClick={() => handleToggle(pin.gpio, pin.value)}
                              className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${pin.value ? 'bg-accent-500 shadow-[0_0_15px_var(--color-accent-glow)]' : 'bg-[#252936]'} relative`}
                            >
                              <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${pin.value ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${pin.value ? 'text-accent-400' : 'text-slate-500'}`}>
                              {pin.value ? 'Ligado' : 'Desligado'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {outputPins.map(pin => (
                          <div key={pin.gpio} className="glass-panel border border-white/5 rounded-2xl p-4 flex items-center justify-between shadow-lg hover:border-white/10 transition-colors">
                            <div className="flex flex-col gap-1 flex-1 min-w-0 pr-4">
                              <span className="text-sm font-bold text-slate-300 truncate">
                                {pin.customLabel || pin.name}
                              </span>
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${pin.value ? 'text-accent-400' : 'text-slate-500'}`}>
                                {pin.value ? 'Status: Ligado' : 'Status: Desligado'}
                              </span>
                            </div>
                            <button 
                              onClick={() => handleToggle(pin.gpio, pin.value)}
                              className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 shrink-0 ${pin.value ? 'bg-accent-500 shadow-[0_0_15px_var(--color-accent-glow)]' : 'bg-[#252936]'} relative`}
                            >
                              <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${pin.value ? 'translate-x-6' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* SENSORS & CHARTS */}
                {sensorPins.length > 0 && (
                  <section>
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-purple-500" /> Sensores em Tempo Real
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {sensorPins.map(pin => {
                        const data = sensorHistory[`${activeTabId}_${pin.gpio}`] || [];
                        return (
                          <div key={pin.gpio} className="glass-panel border border-white/5 rounded-3xl p-5 shadow-lg flex flex-col hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h3 className="text-sm font-bold text-slate-300">{pin.customLabel || pin.name}</h3>
                                <p className="text-[10px] font-mono text-slate-500 mt-1">GPIO {pin.gpio} • {pin.mode.replace('SENSOR_', '')}</p>
                              </div>
                              <div className="glass-panel px-3 py-1.5 rounded-xl border border-white/5 shadow-inner">
                                <span className="text-lg font-bold text-purple-400 font-mono">{pin.value.toFixed(1)}</span>
                              </div>
                            </div>
                            
                            <div className="h-40 w-full mt-auto">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#252936" vertical={false} />
                                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickMargin={8} minTickGap={20} />
                                  <YAxis stroke="#475569" fontSize={10} tickFormatter={(v) => Math.round(v).toString()} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#1A1D27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                                    itemStyle={{ color: '#A855F7' }}
                                    labelStyle={{ color: '#94A3B8', marginBottom: '4px' }}
                                  />
                                  <Line 
                                    type="monotone" 
                                    dataKey="value" 
                                    stroke="#A855F7" 
                                    strokeWidth={2} 
                                    dot={false} 
                                    activeDot={{ r: 4, fill: '#A855F7', stroke: '#12141C', strokeWidth: 2 }}
                                    isAnimationActive={false}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* CAMERA STREAMS */}
                {cameraPins.length > 0 && (
                  <section>
                    <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-500" /> Câmeras & Streams
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {cameraPins.map(pin => (
                        <div key={pin.gpio} className="glass-panel border border-white/5 rounded-3xl p-5 shadow-lg flex flex-col hover:border-white/10 transition-colors overflow-hidden">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-sm font-bold text-slate-300">{pin.customLabel || pin.name || "Câmera"}</h3>
                              <p className="text-[10px] font-mono text-slate-550 mt-1">
                                {pin.cameraUrl ? 'Stream Online' : 'Sem URL Configurada'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-950/40 rounded-full border border-cyan-900/50">
                              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                              <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider">AO VIVO</span>
                            </div>
                          </div>
                          
                          <div className="w-full aspect-video bg-[#0B0C10] rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center relative">
                            {pin.cameraUrl ? (
                              <img 
                                src={pin.cameraUrl} 
                                alt="Camera Stream" 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  const parent = (e.target as HTMLImageElement).parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="text-xs text-slate-550 font-mono text-center px-4">Erro ao carregar stream.<br/>Verifique se a câmera está na mesma rede ou se permite Cross-Origin (CORS).</div>';
                                  }
                                }}
                              />
                            ) : (
                              <div className="text-slate-500 text-xs font-mono">
                                Nenhuma URL de stream configurada.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {outputPins.length === 0 && sensorPins.length === 0 && cameraPins.length === 0 && (
                  <div className="text-center text-slate-550 py-12">
                    Nenhum pino configurado ainda. Acesse as Configurações para adicionar pinos.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
