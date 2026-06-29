import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { INITIAL_PINS, INITIAL_NODES, DEFAULT_WIFI_SETTINGS } from '../data';
import { ESP32Pin, ESP32Node, WiFiSettings, SerialLog, PinMode } from '../types';
import ESP32Visualizer from './ESP32Visualizer';
import PinController from './PinController';
import NodeMonitor from './NodeMonitor';
import FirmwareExporter from './FirmwareExporter';
import OtaUpdate from './OtaUpdate';
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
  Network,
  CloudDownload,
  Palette,
  Home
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { MQTTSettings } from '../types';

import { applyCustomTheme, applyFullCustomTheme, resetTheme } from '../utils/theme';

export default function AdminDashboard() {
  // Core application States

  const [wifiSettings, setWifiSettings] = useState<WiFiSettings>(DEFAULT_WIFI_SETTINGS);
  const [mqttSettings, setMqttSettings] = useState<MQTTSettings>({ server: '', port: 1883, user: '', pass: '' });
  const [ddnsSettings, setDdnsSettings] = useState({ enabled: false, domain: '', token: '', port: 80 });
  const [nodes, setNodes] = useState<ESP32Node[]>(() => {
    try {
      const saved = localStorage.getItem('esp32_nodes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<'CONTROLS' | 'MESH' | 'FIRMWARE' | 'MQTT' | 'OTA' | 'DDNS' | 'THEME'>('CONTROLS');
  const [mobileDashboardView, setMobileDashboardView] = useState<'VISUAL' | 'CONTROLS'>('VISUAL');
  const lastReorderTime = useRef<number>(0);
  const ddnsLoaded = useRef<boolean>(false);

  const [customTheme, setCustomTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme_custom_config');
      return saved ? JSON.parse(saved) : {
        accent: '#06b6d4',
        mesh1: '#0f172a',
        mesh2: '#1e1b4b',
        mesh3: '#113854',
        mesh4: '#210f36',
        glassOpacity: 0.08,
        glowOpacity: 0.4
      };
    } catch (e) {
      return {
        accent: '#06b6d4',
        mesh1: '#0f172a',
        mesh2: '#1e1b4b',
        mesh3: '#113854',
        mesh4: '#210f36',
        glassOpacity: 0.08,
        glowOpacity: 0.4
      };
    }
  });

  const [bgEffect, setBgEffect] = useState(() => localStorage.getItem('background_effect') || 'particles');
  const [logoScale, setLogoScale] = useState(() => parseFloat(localStorage.getItem('logo_scale') || '1.0'));

  useEffect(() => {
    localStorage.setItem('esp32_nodes', JSON.stringify(nodes));
  }, [nodes]);
  
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

  const handleReorderPins = async (newPins: ESP32Pin[]) => {
    lastReorderTime.current = Date.now();
    // Optimistic UI update
    setPins(newPins);
    
    const gpioOrder = newPins.map(p => p.gpio);
    try {
      const res = await fetch('/api/pins/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        },
        body: JSON.stringify(gpioOrder)
      });
      if (res.ok) {
        addLog('SYSTEM', 'Ordem dos pinos salva com sucesso.');
      } else {
        const txt = await res.text().catch(() => '');
        addLog('ERROR', `Erro ao salvar a ordem dos pinos (Status: ${res.status}). ${txt}`);
      }
    } catch(err: any) {
      addLog('ERROR', `Falha de rede ao salvar a nova ordem: ${err.message}`);
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
          mode: data.wifiMode as 'STA' | 'AP',
          role: data.role || 'principal',
          servoIndex: data.servoIndex || 1
        });
        
        if (data.pins && Array.isArray(data.pins)) {
          setPins(prevPins => {
            const isRecentReorder = Date.now() - lastReorderTime.current < 5000;
            const orderToUse = isRecentReorder ? prevPins.map(p => p.gpio) : data.pins.map((p: any) => p.gpio);
            const pinMap = new Map(data.pins.map((p: any) => [p.gpio, p]));

            return orderToUse.map(gpio => {
              const serverPin = pinMap.get(gpio) || prevPins.find(p => p.gpio === gpio);
              if (serverPin && uncommittedPins[serverPin.gpio]) {
                return uncommittedPins[serverPin.gpio];
              }
              return serverPin;
            }).filter(Boolean) as ESP32Pin[];
          });
        }
        
        if (data.ddns && !ddnsLoaded.current) {
          setDdnsSettings({
            enabled: data.ddns.enabled || false,
            domain: data.ddns.domain || '',
            token: data.ddns.token || '',
            port: data.ddns.port || 80
          });
          ddnsLoaded.current = true;
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
  const [wifiInputRole, setWifiInputRole] = useState<'principal' | 'servo'>('principal');
  const [wifiInputServoIndex, setWifiInputServoIndex] = useState<number>(1);

  const handleOpenWifiModal = () => {
    setWifiInputSsid(wifiSettings.ssid === 'Desconhecido' ? '' : wifiSettings.ssid);
    setWifiInputRole(wifiSettings.role || 'principal');
    setWifiInputServoIndex(wifiSettings.servoIndex || 1);
    setWifiInputPass('');
    setShowWifiModal(true);
  };

  const submitWifiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog('WIFI', `Enviando credenciais para ${wifiInputSsid}...`);
    try {
      const res = await fetch('/api/wifi', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        },
        body: JSON.stringify({ 
          ssid: wifiInputSsid, 
          pass: wifiInputPass,
          role: wifiInputRole,
          servo_index: wifiInputServoIndex
        })
      });
      if (res.ok) {
        addLog('WIFI', 'Credenciais salvas! O ESP32 irá reiniciar em 1 segundo.');
        setShowWifiModal(false);
        setWifiInputSsid('');
        setWifiInputPass('');
      } else {
        addLog('ERROR', 'Erro ao salvar credenciais.');
      }
    } catch(err: any) {
      addLog('ERROR', `Falha de rede ao salvar WiFi: ${err.message}`);
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

  const submitDdnsConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    addLog('SYSTEM', `Salvando configuração DDNS...`);
    try {
      const res = await fetch('/api/ddns', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        },
        body: JSON.stringify(ddnsSettings)
      });
      if (res.ok) {
        addLog('SYSTEM', 'Configuração DDNS salva com sucesso!');
      } else {
        const text = await res.text();
        addLog('ERROR', `Erro ao salvar DDNS (${res.status}): ${text}`);
      }
    } catch (err: any) {
      addLog('ERROR', `Falha na comunicação com /api/ddns: ${err.message}`);
    }
  };

  return (
    <div id="main-panel" className="min-h-screen text-slate-200 font-sans flex flex-col justify-between antialiased">
      
      {/* BACKGROUND AMBIENT DETAILS */}
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-accent-900/10 via-slate-900/5 to-transparent pointer-events-none select-none" />

      {/* HEADER BAR */}
      <header className="relative border-b border-[#252833]/60 glass-panel backdrop-blur-md px-6 py-4.5 flex justify-between items-center z-20">
        <div className="flex items-center gap-2.5">
          <svg 
            viewBox="0 0 128.38 168.24" 
            className="fill-current text-white flex-shrink-0 animate-pulse"
            style={{
              width: 'calc(1.25rem * var(--logo-scale))',
              height: 'calc(1.25rem * var(--logo-scale))'
            }}
          >
            <path d="M105.41,132.58h0v-6.99c0-1.28-2.1-6.84-2.8-8.28-9.04-18.66-35.46-16.44-46.77-1.28-8.66,11.62-11.28,28.4-1.03,39.92,4.68,5.26,14.22,5.98,19.27,11.34-12.46-4.63-25.99-6.6-39.04-3.13-3.7.98-7.09,2.67-10.61,4.09,3.87-4.86,10.57-7.39,16.47-8.84,2.4-.59,5.07-.56,7.42-1.27.36-.11,1.04.17.69-.73-.77-1.95-4.69-5.72-5.21-7.85-.23-.96.47-3.61.26-5.52-.23-2.2-1.08-4.46-2.51-6.16-.08,1.62,1.01,2.79,1.21,4.58.18,1.6.15,4.43-.32,5.95-.82,2.64-5.54,5.32-7.34,2.67-2.77-7.38-10.82-24.23-20.3-14.4-.78.81-1,2.23-1.93,2.65.44-6.95,3.82-10.96,11.08-10.36-14.91-13.69-32.89-36.11-18.91-56.52,2.91-4.25,7.54-8.59,12.16-10.74.35-1.35-1.03-.98-1.9-1.7-4.97-4.14-4.29-10.9.45-14.93,5.07-4.32,22.25-8.78,21.68-16.81-.37-5.16-6.82-9.45-10.11-12.83,5.83-.32,11.59-.93,17.35.47-4.38-3.95-9.1-8.34-10.12-14.46,2.56,1.92,5.15,2.62,8.14,1.15C43.57,2.16,45.5-.14,45.63,0c.09.09.24.98.71,1.46,3.46,3.58,7.67,4.6,11.83,1.43.77,6.44,5.19,8.59,11.09,6.27.27,4.65,4.54,6.42,8.68,6.51-5.68,6.06-14.25,7.98-22.17,5.55.94,2.04,1.87,3.69,2.53,5.9,5.31,17.77-5.14,31.41-10.11,47.02-1.96,6.16-4.79,17.48,3.95,19.4l4.59-1.71c-1.7,3.18-2.99,6.24-6.09,8.37l-3.54,1.51c11.16-.98,11.28-14,13.63-22.27,10.65-37.52,58.19-30.79,66.06,5.98,5.93,27.7-5.06,55.06-27.15,71.96-.38.29-.93,1.3-1.44.49,15.59-14.76,26.98-40.3,19.17-61.59-6.76-18.42-26.04-20.48-42.79-15.29-.12.85,1.09.48,1.62.42,8.12-.88,14.38-1.86,22.46.8,19.21,6.33,19.5,29.87,14.34,46.12-2.21,6.94-5.72,13.63-9.75,19.66l4.82-13.01c2.63-10.65,2.02-23.1-4.19-32.45-7.57-11.41-20.6-12.86-31.72-5.39,2.42-.09,4.53-1.5,7.13-2.03,20.41-4.14,28.54,15.88,27.11,32.9l-.98,4.56h0ZM43.07,25.01c3.28,1.09,4.4-3.78,1.25-4.21-2.39-.32-3.41,3.49-1.25,4.21ZM22.99,61.22h0c-.11.85,1.09.45,1.68.48,14.78.66,19.8-12.51,20.97-25.06l-3.76,11.42c-3.63,7.73-10.07,12.93-18.89,13.17h0ZM13.35,81.47c-2.92,12.71-2,26.63,8.67,35.44,4.55,3.75,11.46,6.93,17.37,7.22-10.19-3.37-18.92-9.63-23.23-19.68-.96-2.24-2.81-7.47-2.81-9.72,0-3.61-.21-7.53,0-11.09,0-.33,1.27-2.07,0-2.17Z" />
          </svg>
          <div>
            <h1 
              className="font-bold tracking-tight text-white flex items-center gap-1.5"
              style={{ 
                fontFamily: "'Berkshire Swash', serif",
                fontSize: 'calc(1.125rem * var(--logo-scale))'
              }}
            >
              GrowinStones
              <span className="text-[9px] font-mono tracking-widest font-bold text-accent-500 bg-accent-500/10 px-2 py-0.5 rounded uppercase select-none animate-pulse">ADMIN</span>
            </h1>
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">Controlador Wi-Fi nativo de alta eficiência</p>
          </div>
        </div>

        {/* Dynamic network indicators */}
        <div className="flex items-center gap-3.5">
          <Link 
            to="/" 
            className="flex items-center gap-1.5 text-[9.5px] font-bold text-slate-400 hover:text-white uppercase tracking-wider font-mono cursor-pointer py-1.5 px-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 rounded-xl transition-all"
          >
            <Home className="w-3.5 h-3.5 text-accent-500" />
            Página Inicial
          </Link>

          <div className="hidden sm:flex items-center gap-2 glass-panel border border-white/5 py-1.5 px-3.5 rounded-2xl font-mono text-[9.5px] select-none text-slate-400">
            <Radio className="w-3.5 h-3.5 text-slate-500" />
            <span>Pino selecionado: </span>
            <span className="font-bold text-accent-400">G{selectedPin.gpio}</span>
          </div>
        </div>
      </header>

      {/* CORE WORKSPACE container */}
      <main className="flex-1 relative z-10 px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full flex flex-col justify-start">
        <div className="transition-all duration-300 w-full">
            
            {/* NETWORK BANNER */}
            <div className="glass-card py-4 px-5 rounded-3xl border border-white/5 mb-5 flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl border select-none transition-all ${
                  wifiSettings.mode === 'AP' 
                    ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' 
                    : 'bg-accent-950/40 border-accent-900/50 text-accent-400'
                }`}>
                  <Wifi className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex flex-col select-all">
                  <span className="text-xs font-bold text-slate-200">
                    {wifiSettings.role === 'servo' ? `Servo Melkweg-${String(wifiSettings.servoIndex).padStart(3, '0')}` : 'Principal Nutshell'}
                    <span className="text-slate-500 font-normal ml-2">({wifiSettings.mode === 'AP' ? wifiSettings.apSsid : wifiSettings.ssid})</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 mt-0.5">
                    Endereço IP: <strong className="text-accent-500 font-bold">{wifiSettings.mode === 'AP' ? wifiSettings.apIp : wifiSettings.staIp}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button 
                  onClick={handleOpenWifiModal}
                  className="text-[9.5px] font-bold text-white hover:text-accent-400 uppercase tracking-wider font-mono cursor-pointer py-1 px-3 bg-accent-600/20 hover:bg-accent-600/40 border border-accent-500/50 rounded-xl transition-all"
                >
                  Configurar Wi-Fi
                </button>
                <div className="text-[9.5px] font-bold text-accent-500 uppercase tracking-wider font-mono py-1 px-3 glass-panel border border-white/5 rounded-xl">
                  Reg: {wifiSettings.mode}
                </div>
              </div>
            </div>

            {/* WIFI MODAL */}
            {showWifiModal && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <form onSubmit={submitWifiConfig} className="glass-panel border border-accent-500/30 p-5 rounded-2xl w-full max-w-sm shadow-2xl">
                  <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-accent-400" /> Configurar Nova Rede
                  </h3>
                  <div className="flex flex-col gap-3 mb-4">
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">SSID da Rede (Nome)</label>
                      <input 
                        type="text" 
                        value={wifiInputSsid}
                        onChange={(e) => setWifiInputSsid(e.target.value)}
                        className="w-full glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50 bg-[#15171e]"
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
                        className="w-full glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50 bg-[#15171e]"
                        placeholder="••••••••"
                        required 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-1">Função do Dispositivo</label>
                      <select 
                        value={wifiInputRole}
                        onChange={(e) => setWifiInputRole(e.target.value as 'principal' | 'servo')}
                        className="w-full glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50 bg-[#15171e]"
                      >
                        <option value="principal" className="bg-[#15171e] text-white">Principal (Nutshell)</option>
                        <option value="servo" className="bg-[#15171e] text-white">Servo (Melkweg)</option>
                      </select>
                    </div>
                    {wifiInputRole === 'servo' && (
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-1">Índice do Servo</label>
                        <input 
                          type="number" 
                          min="1"
                          max="999"
                          value={wifiInputServoIndex}
                          onChange={(e) => setWifiInputServoIndex(parseInt(e.target.value) || 1)}
                          className="w-full glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50 bg-[#15171e]"
                          required 
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-5">
                    <button type="button" onClick={() => setShowWifiModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all">Cancelar</button>
                    <button type="submit" className="px-4 py-2 rounded-xl text-xs font-bold bg-accent-500 text-black hover:bg-accent-400 transition-all">Salvar e Reiniciar</button>
                  </div>
                </form>
              </div>
            )}

            {/* TAB SELECTOR NAV */}
            <nav className="grid grid-cols-7 gap-1 p-1 glass-card rounded-2xl border border-white/5 mb-5 select-none relative z-0 shadow-inner">
              {[
                { id: 'CONTROLS', icon: Sliders, label: 'Dashboard' },
                { id: 'MESH', icon: Layers, label: 'Malha' },
                { id: 'MQTT', icon: Network, label: 'Home Assistant' },
                { id: 'DDNS', icon: Tv, label: 'Acesso Remoto' },
                { id: 'THEME', icon: Palette, label: 'Tema & Cores' },
                { id: 'FIRMWARE', icon: FileCode, label: 'C++ Code' },
                { id: 'OTA', icon: CloudDownload, label: 'OTA' },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`relative py-2 px-1 rounded-xl flex flex-col items-center gap-1 transition-colors cursor-pointer z-10 ${
                      isActive ? 'text-accent-400 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTabBackground"
                        className="absolute inset-0 glass-panel rounded-xl shadow-[0_0_15px_var(--color-accent-glow)] border border-accent-500/20 -z-10"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <Icon className="w-4 h-4" />
                    <span className="text-[8.5px] font-mono whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* MAIN TAB SWITCHBOARD */}
            <div id="tab-content-frame" className="min-h-[460px] flex flex-col justify-start">
              {activeTab === 'CONTROLS' && (
                <div className="flex flex-col">
                  {/* Mobile Layout Switcher (Visible on real mobile) */}
                  <div className="flex lg:hidden glass-panel p-1 rounded-xl border border-white/5 mb-4">
                    <button 
                      onClick={() => setMobileDashboardView('VISUAL')}
                      className={`flex-1 py-2 text-[10.5px] uppercase tracking-wider font-bold rounded-lg transition-all ${mobileDashboardView === 'VISUAL' ? 'bg-accent-500 text-slate-950 shadow-[0_0_12px_var(--color-accent-glow)]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
                    >
                      Placa / Visual
                    </button>
                    <button 
                      onClick={() => setMobileDashboardView('CONTROLS')}
                      className={`flex-1 py-2 text-[10.5px] uppercase tracking-wider font-bold rounded-lg transition-all ${mobileDashboardView === 'CONTROLS' ? 'bg-accent-500 text-slate-950 shadow-[0_0_12px_var(--color-accent-glow)]' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
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
                        onReorderPins={handleReorderPins}
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
                <div className="glass-card p-6 rounded-2xl border border-white/5">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                    <Network className="w-6 h-6 text-accent-500" />
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
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                        placeholder="Ex: 192.168.1.100"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Porta</label>
                      <input 
                        type="number" 
                        value={mqttSettings.port} 
                        onChange={(e) => setMqttSettings({...mqttSettings, port: parseInt(e.target.value) || 1883})}
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Usuário</label>
                      <input 
                        type="text" 
                        value={mqttSettings.user} 
                        onChange={(e) => setMqttSettings({...mqttSettings, user: e.target.value})}
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Senha</label>
                      <input 
                        type="password" 
                        value={mqttSettings.pass} 
                        onChange={(e) => setMqttSettings({...mqttSettings, pass: e.target.value})}
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end mt-4">
                      <button type="submit" className="px-6 py-2 bg-accent-500 hover:bg-accent-400 text-slate-950 font-bold rounded-xl shadow-[0_0_15px_var(--color-accent-glow)] transition-all">
                        Salvar e Conectar
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'DDNS' && (
                <div className="glass-card p-6 rounded-2xl border border-white/5">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                    <Tv className="w-6 h-6 text-accent-500" />
                    DuckDNS & Acesso Remoto
                  </h2>
                  <p className="text-slate-400 text-sm mb-6">
                    Mantenha o seu ESP32 acessível globalmente configurando a atualização dinâmica de IP via DuckDNS.
                  </p>
                  <form onSubmit={submitDdnsConfig} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                    <div className="md:col-span-2 flex items-center gap-3 mb-4">
                      <button 
                        type="button"
                        onClick={() => setDdnsSettings({...ddnsSettings, enabled: !ddnsSettings.enabled})}
                        className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 ${ddnsSettings.enabled ? 'bg-accent-500 shadow-[0_0_15px_var(--color-accent-glow)]' : 'bg-[#252936]'} relative`}
                      >
                        <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300 ${ddnsSettings.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                      <span className="text-sm font-bold uppercase tracking-wider text-slate-300">
                        Ativar DuckDNS
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">DuckDNS Domain</label>
                      <input 
                        type="text" 
                        value={ddnsSettings.domain} 
                        onChange={(e) => setDdnsSettings({...ddnsSettings, domain: e.target.value})}
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                        placeholder="meuprojeto (sem .duckdns.org)"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Token DuckDNS</label>
                      <input 
                        type="password" 
                        value={ddnsSettings.token} 
                        onChange={(e) => setDdnsSettings({...ddnsSettings, token: e.target.value})}
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                        placeholder="a1b2c3d4-..."
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">Porta Externa (Visual)</label>
                      <input 
                        type="number" 
                        value={ddnsSettings.port} 
                        onChange={(e) => setDdnsSettings({...ddnsSettings, port: parseInt(e.target.value) || 80})}
                        className="glass-panel border border-[#252833] text-sm px-3 py-2 rounded-xl text-white outline-none focus:border-accent-500/50"
                        placeholder="80"
                      />
                    </div>
                    
                    <div className="md:col-span-2 bg-[#0A0C10] p-4 rounded-xl border border-white/5 mt-2 flex flex-col gap-1">
                      <span className="text-xs text-slate-500 font-mono">Endereço Público Gerado:</span>
                      <a 
                        href={`http://${ddnsSettings.domain ? ddnsSettings.domain + '.duckdns.org' : 'meuprojeto.duckdns.org'}${ddnsSettings.port !== 80 ? ':' + ddnsSettings.port : ''}`}
                        target="_blank" rel="noreferrer"
                        className="text-sm font-bold text-accent-400 hover:text-accent-300 break-all"
                      >
                        http://{ddnsSettings.domain ? ddnsSettings.domain + '.duckdns.org' : 'meuprojeto.duckdns.org'}{ddnsSettings.port !== 80 ? ':' + ddnsSettings.port : ''}
                      </a>
                    </div>

                    <div className="md:col-span-2 flex justify-end mt-4">
                      <button type="submit" className="px-6 py-2 bg-accent-500 hover:bg-accent-400 text-slate-950 font-bold rounded-xl shadow-[0_0_15px_var(--color-accent-glow)] transition-all">
                        Salvar DuckDNS
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'THEME' && (
                <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2">
                      <Palette className="w-6 h-6 text-accent-500" />
                      Personalização do Painel (Temas e Cores)
                    </h2>
                    <p className="text-slate-400 text-sm">
                      Personalize a estética visual do painel GrowinStones. Ajuste cores de destaque, planos de fundo dinâmicos e efeitos de animação!
                    </p>
                  </div>

                  {/* 1. GENERAL THEME PRESETS */}
                  <div className="border-t border-white/5 pt-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">1. Modos de Visualização Geral</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'escuro', name: 'Modo Escuro (Padrão)', desc: 'Design escuro com profundidade e brilhos', className: '' },
                        { id: 'claro', name: 'Modo Claro (Light)', desc: 'Interface clara ideal para ambientes iluminados', className: 'theme-light' },
                        { id: 'mono', name: 'Monocromático (Mono)', desc: 'Visual minimalista em tons de cinza', className: 'theme-mono' }
                      ].map(item => (
                        <button
                          key={item.id}
                          onClick={() => {
                            resetTheme();
                            if (item.className) {
                              localStorage.setItem('theme', item.className);
                              document.documentElement.className = item.className;
                              addLog('SYSTEM', `Tema alterado para Modo ${item.name}.`);
                            } else {
                              localStorage.removeItem('theme');
                              localStorage.removeItem('theme_custom_config');
                              addLog('SYSTEM', 'Tema resetado para o Modo Escuro Padrão.');
                            }
                          }}
                          className="flex flex-col p-3 rounded-xl border border-white/5 hover:border-accent-500/30 bg-slate-950/20 hover:bg-slate-900/30 text-left transition-all cursor-pointer"
                        >
                          <span className="text-xs font-bold text-slate-200">{item.name}</span>
                          <span className="text-[10px] text-slate-500 mt-1">{item.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. ACCENT COLOR PRESETS */}
                  <div className="border-t border-white/5 pt-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">2. Presets de Cores de Destaque</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-[10px] font-mono text-slate-500 uppercase mb-2">Moderno & Neon</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { name: 'Ciano Cyber', color: '#06b6d4' },
                            { name: 'Indigo Estelar', color: '#6366f1' },
                            { name: 'Violeta Neon', color: '#8b5cf6' },
                            { name: 'Rosa Vibrante', color: '#ec4899' },
                          ].map(item => (
                            <button
                              key={item.color}
                              onClick={() => {
                                localStorage.setItem('theme', item.color);
                                applyCustomTheme(item.color);
                                addLog('SYSTEM', `Tema alterado para ${item.name} (${item.color}).`);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg border border-white/5 hover:border-accent-500/30 bg-slate-950/10 hover:bg-slate-900/20 text-slate-300 hover:text-white transition-all text-left cursor-pointer text-[11px]"
                            >
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="truncate">{item.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-mono text-slate-500 uppercase mb-2">Cultivos & Orgânico</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { name: 'Menta Fresca', color: '#10b981' },
                            { name: 'Verde Esmeralda', color: '#059669' },
                            { name: 'Verde Floresta', color: '#15803d' },
                            { name: 'Lima Volt', color: '#84cc16' },
                          ].map(item => (
                            <button
                              key={item.color}
                              onClick={() => {
                                localStorage.setItem('theme', item.color);
                                applyCustomTheme(item.color);
                                addLog('SYSTEM', `Tema alterado para ${item.name} (${item.color}).`);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg border border-white/5 hover:border-accent-500/30 bg-slate-950/10 hover:bg-slate-900/20 text-slate-300 hover:text-white transition-all text-left cursor-pointer text-[11px]"
                            >
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="truncate">{item.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-mono text-slate-500 uppercase mb-2">Tons Quentes</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { name: 'Laranja Solar', color: '#f59e0b' },
                            { name: 'Amarelo Ouro', color: '#ffb703' },
                            { name: 'Fogo Carmesim', color: '#ef4444' },
                            { name: 'Rosa Coral', color: '#f43f5e' },
                          ].map(item => (
                            <button
                              key={item.color}
                              onClick={() => {
                                localStorage.setItem('theme', item.color);
                                applyCustomTheme(item.color);
                                addLog('SYSTEM', `Tema alterado para ${item.name} (${item.color}).`);
                              }}
                              className="flex items-center gap-2 p-2 rounded-lg border border-white/5 hover:border-accent-500/30 bg-slate-950/10 hover:bg-slate-900/20 text-slate-300 hover:text-white transition-all text-left cursor-pointer text-[11px]"
                            >
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                              <span className="truncate">{item.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. BACKGROUND EFFECTS SELECTOR */}
                  <div className="border-t border-white/5 pt-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">3. Efeitos de Fundo (Background Animations)</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        { id: 'particles', name: 'Partículas', desc: 'Pontos brilhantes' },
                        { id: 'leaves', name: 'Folhas Cannabis', desc: 'Folhas flutuando' },
                        { id: 'rain', name: 'Chuva Digital', desc: 'Linhas caindo' },
                        { id: 'orbs', name: 'Apenas Globos', desc: 'Globos estáticos' },
                        { id: 'none', name: 'Sem Efeito', desc: 'Sólido' }
                      ].map(item => {
                        const isActive = bgEffect === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              localStorage.setItem('background_effect', item.id);
                              setBgEffect(item.id);
                              addLog('SYSTEM', `Efeito de fundo alterado para ${item.name}.`);
                            }}
                            className={`flex flex-col p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              isActive
                                ? 'bg-accent-500/10 border-accent-500/30 text-accent-400 shadow-[0_0_12px_var(--color-accent-glow)]'
                                : 'glass-panel border-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span className="text-[11px] font-bold">{item.name}</span>
                            <span className="text-[9px] text-slate-500 mt-0.5">{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. ADVANCED CUSTOM COLOR CONFIGURATOR */}
                  <div className="border-t border-white/5 pt-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">4. Criador de Tema Personalizado</h3>
                    <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-4">
                      
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-mono text-slate-400 uppercase">Cor Destaque</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="color" 
                              value={customTheme.accent}
                              onChange={(e) => setCustomTheme({ ...customTheme, accent: e.target.value })}
                              className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                            />
                            <span className="text-xs font-mono text-white select-all">{customTheme.accent}</span>
                          </div>
                        </div>

                        {[
                          { key: 'mesh1', label: 'Mesh Fundo 1' },
                          { key: 'mesh2', label: 'Mesh Fundo 2' },
                          { key: 'mesh3', label: 'Mesh Fundo 3' },
                          { key: 'mesh4', label: 'Mesh Fundo 4' }
                        ].map(item => (
                          <div key={item.key} className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-mono text-slate-400 uppercase">{item.label}</label>
                            <div className="flex items-center gap-2">
                              <input 
                                type="color" 
                                value={(customTheme as any)[item.key]}
                                onChange={(e) => setCustomTheme({ ...customTheme, [item.key]: e.target.value })}
                                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                              />
                              <span className="text-xs font-mono text-white select-all">{(customTheme as any)[item.key]}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 uppercase">
                            <span>Opacidade do Vidro (Glass)</span>
                            <span className="text-accent-400 font-bold">{(customTheme.glassOpacity * 100).toFixed(0)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={customTheme.glassOpacity}
                            onChange={(e) => setCustomTheme({ ...customTheme, glassOpacity: parseFloat(e.target.value) })}
                            className="w-full accent-accent-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 uppercase">
                            <span>Intensidade do Brilho (Glow)</span>
                            <span className="text-accent-400 font-bold">{(customTheme.glowOpacity * 100).toFixed(0)}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.01" 
                            value={customTheme.glowOpacity}
                            onChange={(e) => setCustomTheme({ ...customTheme, glowOpacity: parseFloat(e.target.value) })}
                            className="w-full accent-accent-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2.5 pt-3">
                        <button
                          onClick={() => {
                            resetTheme();
                            localStorage.removeItem('theme');
                            localStorage.removeItem('theme_custom_config');
                            setCustomTheme({
                              accent: '#06b6d4',
                              mesh1: '#0f172a',
                              mesh2: '#1e1b4b',
                              mesh3: '#113854',
                              mesh4: '#210f36',
                              glassOpacity: 0.08,
                              glowOpacity: 0.4
                            });
                            addLog('SYSTEM', 'Tema de cores redefinido para as configurações padrão.');
                          }}
                          className="px-4 py-2 border border-white/5 hover:border-slate-700/50 bg-[#141620] text-slate-400 hover:text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
                        >
                          Restaurar Padrões
                        </button>
                        <button
                          onClick={() => {
                            localStorage.setItem('theme', 'custom');
                            localStorage.setItem('theme_custom_config', JSON.stringify(customTheme));
                            applyFullCustomTheme(customTheme);
                            addLog('SYSTEM', 'Tema customizado personalizado aplicado com sucesso!');
                          }}
                          className="px-5 py-2 bg-accent-500 hover:bg-accent-400 text-slate-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-[0_0_12px_var(--color-accent-glow)]"
                        >
                          Aplicar Tema Customizado
                        </button>
                      </div>

                    </div>
                  </div>

                  {/* 5. LOGO AND TITLE SIZE SELECTOR */}
                  <div className="border-t border-white/5 pt-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">5. Tamanho do Logo & Título</h3>
                    <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 uppercase">
                        <span>Escala do Cabeçalho</span>
                        <span className="text-accent-400 font-bold">{(logoScale * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">Pequeno</span>
                        <input 
                          type="range" 
                          min="0.70" 
                          max="1.80" 
                          step="0.05" 
                          value={logoScale}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setLogoScale(val);
                            localStorage.setItem('logo_scale', val.toString());
                            document.documentElement.style.setProperty('--logo-scale', val.toString());
                          }}
                          className="w-full accent-accent-500 cursor-pointer h-1 bg-slate-900 rounded-lg appearance-none"
                        />
                        <span className="text-[10px] text-slate-500 font-mono uppercase font-bold">Grande</span>
                      </div>
                    </div>
                  </div>

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

              {activeTab === 'OTA' && (
                <OtaUpdate 
                  nodes={nodes}
                  onAddLog={addLog}
                />
              )}
            </div>

          </div>
        <div className="mt-28 w-full">
          <LogConsole 
            logs={logs}
            onClearLogs={handleClearLogs}
            onAddLog={addLog}
          />
        </div>

      </main>

      {/* FOOTER */}
      <footer className="relative glass-panel border-t border-[#252833]/60 py-4 px-6 text-center select-none z-20">
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
