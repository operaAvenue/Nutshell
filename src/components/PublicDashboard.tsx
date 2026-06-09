import { useState, useEffect } from 'react';
import { Activity, Power, Cpu } from 'lucide-react';
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

export default function PublicDashboard() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [sensorHistory, setSensorHistory] = useState<Record<number, any[]>>({});

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const hostname = window.location.hostname === 'localhost' ? '192.168.1.145' : window.location.hostname;
        const res = await fetch(`http://${hostname}/api/status`);
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
                  if (!newHistory[p.gpio]) newHistory[p.gpio] = [];
                  newHistory[p.gpio] = [...newHistory[p.gpio], { time: now, value: p.value }].slice(-20); // Keep last 20 points
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
    const interval = setInterval(fetchStatus, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleToggle = async (gpio: number, currentValue: number) => {
    try {
      const newValue = currentValue ? 0 : 1;
      // Optimistic UI update
      setStatus(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pins: prev.pins.map(p => p.gpio === gpio ? { ...p, value: newValue } : p)
        };
      });
      
      const hostname = window.location.hostname === 'localhost' ? '192.168.1.145' : window.location.hostname;
      await fetch(`http://${hostname}/api/toggle?pin=${gpio}&val=${newValue}`);
    } catch (err) {
      console.error("Erro ao alternar pino", err);
    }
  };

  const outputPins = status?.pins.filter(p => p.mode === 'DIGITAL_OUTPUT' || p.mode === 'PWM_OUTPUT') || [];
  const sensorPins = status?.pins.filter(p => p.mode === 'ANALOG_INPUT' || p.mode.startsWith('SENSOR_')) || [];

  return (
    <div className="min-h-screen text-slate-300 font-sans selection:bg-cyan-500/30">
      <header className="glass-panel border-b border-white/5 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 glass-panel rounded-xl border border-white/10 flex justify-center items-center shadow-inner">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                openAgro.ai
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
          <a href="#/admin" className="text-xs font-bold text-slate-500 hover:text-cyan-400 transition-colors uppercase tracking-wider flex items-center gap-1">
            Configurar
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {!status ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Activity className="w-8 h-8 animate-spin text-cyan-500 mb-4" />
            <p>Conectando ao Controlador...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            
            {/* SWITCHES / OUTPUTS */}
            {outputPins.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Power className="w-4 h-4 text-cyan-500" /> Atuadores
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {outputPins.map(pin => (
                    <div key={pin.gpio} className="glass-panel border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 shadow-lg hover:border-white/10 transition-colors">
                      <span className="text-xs font-bold text-slate-400 text-center truncate w-full">
                        {pin.customLabel || pin.name}
                      </span>
                      <button 
                        onClick={() => handleToggle(pin.gpio, pin.value)}
                        className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${pin.value ? 'bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-[#252936]'} relative`}
                      >
                        <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${pin.value ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${pin.value ? 'text-cyan-400' : 'text-slate-500'}`}>
                        {pin.value ? 'Ligado' : 'Desligado'}
                      </span>
                    </div>
                  ))}
                </div>
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
                    const data = sensorHistory[pin.gpio] || [];
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

            {outputPins.length === 0 && sensorPins.length === 0 && (
              <div className="text-center text-slate-500 py-12">
                Nenhum pino configurado ainda. Acesse as Configurações para adicionar pinos.
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
