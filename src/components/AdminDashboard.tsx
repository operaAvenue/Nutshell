import React, { useState, useEffect } from 'react';
import { INITIAL_PINS, INITIAL_NODES, DEFAULT_WIFI_SETTINGS } from '../data';
import { ESP32Pin, ESP32Node, WiFiSettings, SerialLog } from '../types';
import ESP32Visualizer from './ESP32Visualizer';
import PinController from './PinController';
import NodeMonitor from './NodeMonitor';
import FirmwareExporter from './FirmwareExporter';
import LogConsole from './LogConsole';
import { 
  Sliders, 
  Layers, 
  FileCode, 
  Sparkles, 
  Settings, 
  Wifi, 
  Radio, 
  Cpu, 
  Minimize2, 
  Maximize2,
  ChevronRight,
  Tv,
  Network
} from 'lucide-react';

import { MQTTSettings } from '../types';

export default function AdminDashboard() {
  // Core application States

  const [wifiSettings, setWifiSettings] = useState<WiFiSettings>(DEFAULT_WIFI_SETTINGS);
  const [mqttSettings, setMqttSettings] = useState<MQTTSettings>({ server: '', port: 1883, user: '', pass: '' });
  const [nodes, setNodes] = useState<ESP32Node[]>(INITIAL_NODES);
  const [activeTab, setActiveTab] = useState<'CONTROLS' | 'MESH' | 'FIRMWARE' | 'MQTT'>('CONTROLS');
  const [mobileDashboardView, setMobileDashboardView] = useState<'VISUAL' | 'CONTROLS'>('VISUAL');
  
  // Simulated logs buffer
  const [logs, setLogs] = useState<SerialLog[]>([
    { timestamp: "00:00:01", source: "SYSTEM", message: "Inicializando ESP32 Core chipset..." },
    { timestamp: "00:00:02", source: "SYSTEM", message: "CPU clock regulado para o máximo: 240 MHz (Dual Core)" },
    { timestamp: "00:00:03", source: "GPIO", message: "Registrados controladores GPIO nativos do mapa DevKit V1" },
    { timestamp: "00:00:04", source: "WIFI", message: "mDNS registrador preparado em http://esp32-controller.local" },
    { timestamp: "00:00:05", source: "WIFI", message: "Inicializando ponto de acesso local: [ESP32_Controler_P2P]" },
    { timestamp: "00:00:06", source: "HTTP", message: "Servidor Web HTTP ativo na porta 80. Respondendo endpoints REST" }
  ]);

  // Helper to push a new row to Console logs with proper timestamp formatting
  const addLog = (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => {
    const now = new Date();
    const timeFormatted = now.toTimeString().split(' ')[0];
    setLogs(prev => [...prev, { timestamp: timeFormatted, source, message }]);
  };

  const handleClearLogs = () => {
    setLogs([]);
    addLog('SYSTEM', 'Log de console resetado pelo usuário.');
  };

  const [pins, setPins] = useState<ESP32Pin[]>([]);
  // Pins that are currently being edited in the UI but not yet saved to backend
  const [uncommittedPins, setUncommittedPins] = useState<Record<number, ESP32Pin>>({});
  const [selectedGpio, setSelectedGpio] = useState<number | null>(null);

  // Find the currently focused pin
  const selectedPin = uncommittedPins[selectedGpio || 2] || pins.find(p => p.gpio === selectedGpio) || {
    gpio: selectedGpio || 2,
    name: `GPIO ${selectedGpio || 2}`,
    mode: 'UNUSED' as PinMode,
    customLabel: '',
    value: 0
  };

  // Callback to update a pin state in RAM (local UI update)
  const handleUpdatePin = (updatedPin: ESP32Pin) => {
    setUncommittedPins(prev => ({ ...prev, [updatedPin.gpio]: updatedPin }));
    // Optimistic UI update
    setPins(prev => {
      if (prev.some(p => p.gpio === updatedPin.gpio)) {
        return prev.map(p => p.gpio === updatedPin.gpio ? updatedPin : p);
      } else {
        return [...prev, updatedPin];
      }
    });
  };

  const handleSavePin = async (pin: ESP32Pin) => {
    try {
      const res = await fetch('/api/pins', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        },
        body: JSON.stringify(pin)
      });
      if (res.ok) {
        setUncommittedPins(prev => {
          const next = { ...prev };
          delete next[pin.gpio];
          return next;
        });
        addLog('SYSTEM', `GPIO ${pin.gpio} salva com sucesso na NVS.`);
      } else {
        const txt = await res.text().catch(() => '');
        addLog('ERROR', `Erro API ao salvar GPIO ${pin.gpio} (Status: ${res.status}). ${txt}`);
      }
    } catch(err: any) {
      addLog('ERROR', `Falha de rede ao salvar GPIO ${pin.gpio}: ${err.message}`);
    }
  };

  const handleDeletePin = async (gpio: number) => {
    try {
      const res = await fetch(`/api/pins?gpio=${gpio}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        }
      });
      if (res.ok) {
        setUncommittedPins(prev => {
          const next = { ...prev };
          delete next[gpio];
          return next;
        });
        setPins(prev => prev.filter(p => p.gpio !== gpio));
        addLog('SYSTEM', `GPIO ${gpio} removida da NVS.`);
      } else {
        const txt = await res.text().catch(() => '');
        addLog('ERROR', `Erro API ao excluir GPIO ${gpio} (Status: ${res.status}). ${txt}`);
      }
    } catch(err: any) {
      addLog('ERROR', `Falha de rede ao excluir GPIO ${gpio}: ${err.message}`);
    }
  };

  const handleSelectPinByGpio = (gpio: number) => {
    setSelectedGpio(gpio);
  };

  // Add peer node manually
  const handleAddNode = (newNode: ESP32Node) => {
    setNodes(prev => {
      // Avoid duplicate IPs
      if (prev.some(n => n.ip === newNode.ip)) return prev;
      return [...prev, newNode];
    });
  };

  // Toggle state of a remote node pin
  const handleUpdateNodePin = (nodeIp: string, gpio: number, newValue: number) => {
    fetch(`http://${nodeIp}/api/toggle?pin=${gpio}&val=${newValue}`).catch(() => {});
    
    setNodes(prev => prev.map(node => {
      if (node.ip === nodeIp) {
        return {
          ...node,
          pinStates: {
            ...node.pinStates,
            [gpio]: {
              ...node.pinStates[gpio],
              value: newValue
            }
          },
          lastSeen: "Agora mesmo"
        };
      }
      return node;
    }));
  };

  // Real API Polling
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error('API erro');
        const data = await response.json();
        
        setWifiSettings({
          ssid: data.ssid || 'Desconhecido',
          staIp: data.ip,
          apSsid: 'ESP32-Dashboard',
          apIp: '192.168.4.1',
          mode: data.wifiMode as 'STA' | 'AP'
        });
        
        if (data.pins && Array.isArray(data.pins)) {
          setPins(prevPins => {
            // Merge uncommitted changes with server state to prevent UI flicker
            return data.pins.map((serverPin: ESP32Pin) => {
              if (uncommittedPins[serverPin.gpio]) {
                return uncommittedPins[serverPin.gpio];
              }
              return serverPin;
            });
          });
        }
      } catch (err) {
        // console.error(err);
      }
    };

    const fetchMqtt = async () => {
      try {
        const res = await fetch('/api/mqtt', { headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` } });
        if (res.ok) {
          const data = await res.json();
          setMqttSettings(data);
        }
      } catch (e) {}
    };

    fetchStatus();
    fetchMqtt();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll mesh nodes
  useEffect(() => {
    const pollNodes = async () => {
      setNodes(prevNodes => [...prevNodes]); // triggers re-render, we map and fetch
      
      const newNodes = await Promise.all(nodes.map(async node => {
        try {
          const res = await fetch(`http://${node.ip}/api/status`);
          if (res.ok) {
            const data = await res.json();
            const newPinStates = { ...node.pinStates };
            if (data.pins) {
              data.pins.forEach((p: any) => {
                newPinStates[p.gpio] = { mode: p.mode, customLabel: p.customLabel, value: p.value };
              });
            }
            return { ...node, isOnline: true, lastSeen: "Agora mesmo", pinStates: newPinStates, hostname: data.hostname || node.hostname };
          }
        } catch (e) {
          return { ...node, isOnline: false };
        }
        return node;
      }));
      
      // Only update if changed to avoid massive re-renders
      setNodes(currentNodes => {
        let changed = false;
        newNodes.forEach((nn, i) => {
          if (nn.isOnline !== currentNodes[i].isOnline || nn.lastSeen !== currentNodes[i].lastSeen) changed = true;
          // (Deep check skipped for simplicity, will just update if online)
          if(nn.isOnline) changed = true;
        });
        return changed ? newNodes : currentNodes;
      });
    };

    if (nodes.length > 0) {
      const nodeInterval = setInterval(pollNodes, 2000);
      return () => clearInterval(nodeInterval);
    }
  }, [nodes.length]);

  const [showWifiModal, setShowWifiModal] = useState(false);
  const [wifiInputSsid, setWifiInputSsid] = useState('');
  const [wifiInputPass, setWifiInputPass] = useState('');

  const submitWifiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog('WIFI', `Enviando credenciais para ${wifiInputSsid}...`);
    try {
      const res = await fetch('/api/wifi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid: wifiInputSsid, pass: wifiInputPass })
      });
      if (res.ok) {
        addLog('WIFI', 'Credenciais salvas! O ESP32 irá reiniciar em 1 segundo.');
        setShowWifiModal(false);
        setWifiInputSsid('');
        setWifiInputPass('');
      } else {
        addLog('ERROR', 'Erro ao salvar credenciais.');
      }
    } catch (err) {
      addLog('ERROR', 'Falha na comunicação com /api/wifi');
    }
  };

  const submitMqttConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog('SYSTEM', `Salvando credenciais MQTT...`);
    try {
      const res = await fetch('/api/mqtt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        },
        body: JSON.stringify(mqttSettings)
      });
      if (res.ok) {
        addLog('SYSTEM', 'Credenciais MQTT salvas! O ESP32 irá reiniciar em 1 segundo.');
      } else {
        addLog('ERROR', 'Erro ao salvar credenciais MQTT.');
      }
    } catch (err) {
      addLog('ERROR', 'Falha na comunicação com /api/mqtt');
    }
  };

  return (
    <div id="main-panel" className="min-h-screen bg-[#090A0D] text-slate-200 font-sans flex flex-col justify-between antialiased">
      
      {/* BACKGROUND AMBIENT DETAILS */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-cyan-900/10 via-slate-900/5 to-transparent pointer-events-none select-none" />

      {/* HEADER BAR */}
      <header className="relative border-b border-[#252833]/60 bg-[#12141C]/80 backdrop-blur-md px-6 py-4.5 flex justify-between items-center z-20">
        <div className="flex items-center gap-2.5">
          <div className="p-2 border border-cyan-500/20 bg-cyan-600/10 text-cyan-400 rounded-2xl">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5 font-sans">
              openAgro.ai
              <span className="text-[9px] font-mono tracking-widest font-bold text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded uppercase select-none animate-pulse">ADMIN</span>
            </h1>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">Controlador Wi-Fi nativo de alta eficiência</p>
          </div>
        </div>

        {/* Dynamic network indicators */}
        <div className="flex items-center gap-3.5">
          <div className="hidden sm:flex items-center gap-2 bg-[#1C1F2B] border border-white/5 py-1.5 px-3.5 rounded-2xl font-mono text-[9.5px] select-none text-slate-400">
            <Radio className="w-3.5 h-3.5 text-slate-500" />
            <span>Pino selecionado: </span>
            <span className="font-bold text-cyan-400">G{selectedPin.gpio}</span>
          </div>
        </div>
      </header>

      {/* CORE WORKSPACE container */}
      <main className="flex-1 relative z-10 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full flex flex-col justify-start">
        <div className="transition-all duration-300 w-full">
            
            {/* NETWORK BANNER */}
            <div className="bg-[#1C1F2B] py-4 px-5 rounded-3xl border border-white/5 mb-5 flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl border select-none transition-all ${
                  wifiSettings.mode === 'AP' 
                    ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' 
                    : 'bg-cyan-950/40 border-cyan-900/50 text-cyan-400'
                }`}>
                  <Wifi className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex flex-col select-all">
                  <span className="text-xs font-bold text-slate-200">
                    SSID: {wifiSettings.mode === 'AP' ? wifiSettings.apSsid : wifiSettings.ssid}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 mt-0.5">
                    Endereço IP: <strong className="text-cyan-500 font-bold">{wifiSettings.mode === 'AP' ? wifiSettings.apIp : wifiSettings.staIp}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button 
                  onClick={() => setShowWifiModal(true)}
                  className="text-[9.5px] font-bold text-white hover:text-cyan-400 uppercase tracking-wider font-mono cursor-pointer py-1 px-3 bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 rounded-xl transition-all"
                >
                  Configurar Wi-Fi
                </button>
                <div className="text-[9.5px] font-bold text-cyan-500 uppercase tracking-wider font-mono py-1 px-3 bg-[#12141C] border border-white/5 rounded-xl">
                  Reg: {wifiSettings.mode}
                </div>
              </div>
            </div>

            {/* WIFI MODAL */}
            {showWifiModal && (
              <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <form onSubmit={submitWifiConfig} className="bg-[#1C1F2B] border border-cyan-500/30 p-5 rounded-2xl w-full max-w-sm shadow-2xl">
                  <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-cyan-400" /> Configurar Nova Rede
                  </h3>
                  <div className="flex flex-col gap-3 mb-4">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">SSID da Rede (Nome)</label>
                      <input 
                        type="text" 
                        value={wifiInputSsid}
                        onChange={(e) => setWifiInputSsid(e.target.value)}
                        className="w-full bg-[#12141C] border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-cyan-500/50"
                        placeholder="Minha_Casa_5G"
                        required 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Senha</label>
                      <input 
                        type="password" 
                        value={wifiInputPass}
                        onChange={(e) => setWifiInputPass(e.target.value)}
                        className="w-full bg-[#12141C] border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-cyan-500/50"
                        placeholder="••••••••"
                        required 
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-5">
                    <button type="button" onClick={() => setShowWifiModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all">Cancelar</button>
                    <button type="submit" className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-all">Salvar e Reiniciar</button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB SELECTOR NAV */}
            <nav className="grid grid-cols-4 gap-1 p-1 bg-[#1A1D27] rounded-2xl border border-white/5 mb-5 select-none">
              <button 
                onClick={() => setActiveTab('CONTROLS')}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'CONTROLS' 
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span className="text-[8.5px] font-mono whitespace-nowrap">Dashboard</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('MESH')}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'MESH' 
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span className="text-[8.5px] font-mono whitespace-nowrap">Malha</span>
              </button>
              
              <button 
                onClick={() => setActiveTab('MQTT')}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'MQTT' 
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Network className="w-4 h-4" />
                <span className="text-[8.5px] font-mono whitespace-nowrap">Home Assistant</span>
              </button>

              <button 
                onClick={() => setActiveTab('FIRMWARE')}
                className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'FIRMWARE' 
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span className="text-[8.5px] font-mono whitespace-nowrap">C++ Code</span>
              </button>
            </nav>

            {/* MAIN TAB SWITCHBOARD */}
            <div id="tab-content-frame" className="min-h-[460px] flex flex-col justify-start">
              {activeTab === 'CONTROLS' && (
                <div className="flex flex-col">
                  {/* Mobile Layout Switcher (Visible on real mobile) */}
                  <div className="flex lg:hidden bg-[#1A1D27] p-1 rounded-xl border border-white/5 mb-4">
                    <button 
                      onClick={() => setMobileDashboardView('VISUAL')}
                      className={`flex-1 py-2 text-[10.5px] uppercase tracking-wider font-bold rounded-lg transition-all ${mobileDashboardView === 'VISUAL' ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                    >
                      Placa / Visual
                    </button>
                    <button 
                      onClick={() => setMobileDashboardView('CONTROLS')}
                      className={`flex-1 py-2 text-[10.5px] uppercase tracking-wider font-bold rounded-lg transition-all ${mobileDashboardView === 'CONTROLS' ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.3)]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                    >
                      Configurações
                    </button>
                  </div>

                  <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
                    
                    {/* Left Column: Visual Map */}
                    <div className={`flex-col ${mobileDashboardView === 'VISUAL' ? 'flex' : 'hidden'} lg:flex`}>
                      <div className="w-full overflow-x-auto pb-2 -mx-2 px-2 sm:mx-0 sm:px-0">
                        <ESP32Visualizer 
                          pins={pins}
                          wifiMode={wifiSettings.mode}
                          selectedGpio={selectedGpio}
                          onSelectPin={(gpio) => {
                            handleSelectPinByGpio(gpio);
                            setMobileDashboardView('CONTROLS');
                          }}
                        />
                      </div>
                    </div>

                    {/* Right Column: Hardware Controllers */}
                    <div className={`flex-col ${mobileDashboardView === 'CONTROLS' ? 'flex' : 'hidden'} lg:flex`}>
                      <PinController 
                        pins={pins}
                        selectedPin={selectedPin}
                        onUpdatePin={handleUpdatePin}
                        onSelectPinByGpio={handleSelectPinByGpio}
                        onSavePin={handleSavePin}
                        onDeletePin={handleDeletePin}
                        onAddLog={addLog}
                      />
                    </div>

                  </div>
                </div>
              )}

              {activeTab === 'MESH' && (
                <NodeMonitor 
                  nodes={nodes}
                  onAddNode={handleAddNode}
                  onUpdateNodePin={handleUpdateNodePin}
                  onAddLog={addLog}
                />
              )}

              {activeTab === 'MQTT' && (
                <div className="bg-[#1C1F2B] p-6 rounded-2xl border border-white/5">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                    <Network className="w-6 h-6 text-cyan-500" />
                    Integração Home Assistant (MQTT)
                  </h2>
                  <p className="text-slate-400 text-sm mb-6">
                    Preencha com os dados do seu Mosquitto Broker. O openAgro.ai usa Auto-Discovery: todos os sensores e relés configurados aparecerão automaticamente na aba Dispositivos do seu Home Assistant!
                  </p>
                  <form onSubmit={submitMqttConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Servidor (IP)</label>
                      <input 
                        type="text" 
                        value={mqttSettings.server} 
                        onChange={(e) => setMqttSettings({...mqttSettings, server: e.target.value})}
                        className="bg-[#12141C] border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-cyan-500/50"
                        placeholder="Ex: 192.168.1.100"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Porta</label>
                      <input 
                        type="number" 
                        value={mqttSettings.port} 
                        onChange={(e) => setMqttSettings({...mqttSettings, port: parseInt(e.target.value) || 1883})}
                        className="bg-[#12141C] border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Usuário</label>
                      <input 
                        type="text" 
                        value={mqttSettings.user} 
                        onChange={(e) => setMqttSettings({...mqttSettings, user: e.target.value})}
                        className="bg-[#12141C] border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Senha</label>
                      <input 
                        type="password" 
                        value={mqttSettings.pass} 
                        onChange={(e) => setMqttSettings({...mqttSettings, pass: e.target.value})}
                        className="bg-[#12141C] border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-cyan-500/50"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end mt-4">
                      <button type="submit" className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all">
                        Salvar e Conectar
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'FIRMWARE' && (
                <FirmwareExporter 
                  pins={pins}
                  wifiSettings={wifiSettings}
                  nodes={nodes}
                  onAddLog={addLog}
                />
              )}
            </div>

          </div>
        <div className="mt-8.0 w-full">
          <LogConsole 
            logs={logs}
            onClearLogs={handleClearLogs}
            onAddLog={addLog}
          />
        </div>

      </main>

      {/* FOOTER */}
      <footer className="relative bg-[#090A0D] border-t border-[#252833]/60 py-4 px-6 text-center select-none z-20">
        <p className="text-[9.5px] font-mono text-slate-550 leading-normal">
          Designed for <strong className="text-slate-400 font-semibold">NodeMCU & ESP32-WROOM-32</strong> | Direct LAN Server Serviced
        </p>
        <p className="text-[8px] font-mono text-slate-600 mt-1">
          © 2026 ESP32 Control Group
        </p>
      </footer>

    </div>
  );
}
