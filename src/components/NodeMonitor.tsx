import React, { useState } from 'react';
import { ESP32Node, PinMode } from '../types';
import { Wifi, Plus, Search, Server, Power, Activity, HardDrive, RefreshCw, Layers } from 'lucide-react';

interface NodeMonitorProps {
  nodes: ESP32Node[];
  onAddNode: (node: ESP32Node) => void;
  onUpdateNodePin: (nodeIp: string, gpio: number, newValue: number) => void;
  onAddLog: (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => void;
}

export default function NodeMonitor({ nodes, onAddNode, onUpdateNodePin, onAddLog }: NodeMonitorProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form values
  const [newHostname, setNewHostname] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newRole, setNewRole] = useState<'COORDINATOR' | 'NODE'>('NODE');

  const getRssiColor = (rssi: number) => {
    if (rssi >= -50) return 'text-emerald-400';
    if (rssi >= -70) return 'text-amber-400';
    return 'text-rose-450';
  };

  const getRssiLabel = (rssi: number) => {
    if (rssi >= -50) return 'Excelente';
    if (rssi >= -70) return 'Regular';
    return 'Fraco';
  };

  const handleScan = () => {
    setIsScanning(true);
    onAddLog('WIFI', 'Iniciando escaneamento de rede mDNS local...');
    
    setTimeout(() => {
      setIsScanning(false);
      onAddLog('WIFI', `Escanemaneto concluído! Encontrados ${nodes.length} nós ESP32 ativos na rede.`);
      onAddLog('HTTP', 'Atualizado mapeamento de nós da malha P2P.');
    }, 2000);
  };

  const handleCreateNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHostname || !newIp) {
      onAddLog('ERROR', 'Falha ao adicionar nó: Preencha todos os campos!');
      return;
    }

    // Basic IP validation
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (!ipRegex.test(newIp)) {
      onAddLog('ERROR', 'Falha ao adicionar nó: formato de IP inválido!');
      return;
    }

    const newNode: ESP32Node = {
      ip: newIp,
      hostname: newHostname.toLowerCase().replace(/\s+/g, '-'),
      isOnline: false, // Starts offline until polled
      rssi: 0, 
      role: newRole,
      lastSeen: "Aguardando conexão...",
      pinStates: {}
    };

    onAddNode(newNode);
    onAddLog('SYSTEM', `Novo nó cadastrado: ${newNode.hostname} em [http://${newNode.ip}]`);
    
    // Clear state
    setNewHostname('');
    setNewIp('');
    setNewRole('NODE');
    setShowAddForm(false);
  };

  const handleToggleRemotePin = (ip: string, gpio: number, currentVal: number) => {
    const newVal = currentVal === 0 ? 1 : 0;
    onUpdateNodePin(ip, gpio, newVal);
    onAddLog('HTTP', `HTTP GET http://${ip}/api/toggle?pin=${gpio}&val=${newVal} -> Respondido 200 OK`);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Network Header with dynamic stats */}
      <div className="glass-card p-5 rounded-3xl border border-white/5 shadow-inner backdrop-blur-sm">
        <div className="flex justify-between items-center glass-panel p-4 rounded-2xl border border-[#252833]/60">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-cyan-500/15 bg-cyan-500/5 text-cyan-400 rounded-xl">
              <Layers className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Malha de Dispositivos</span>
              <span className="text-[10px] font-mono text-slate-500">{nodes.filter(n => n.isOnline).length} Dispositivos Online</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleScan}
              disabled={isScanning}
              className={`p-2 rounded-xl text-slate-400 border border-white/5 hover:border-slate-705 hover:text-white transition-all ${isScanning ? 'animate-spin border-cyan-500/30 text-cyan-400 bg-cyan-950/20' : 'glass-panel'}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10.5px] font-bold border transition-all ${showAddForm ? 'bg-[#252936] border-white/5 text-slate-300' : 'bg-cyan-500 border-cyan-400/80 text-slate-950 shadow-md shadow-cyan-500/10 active:bg-cyan-600 hover:bg-cyan-400'}`}
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar Nó
            </button>
          </div>
        </div>

        {/* Dynamic add new device form */}
        {showAddForm && (
          <form onSubmit={handleCreateNode} className="mt-4 p-4 rounded-2xl border border-[#252833]/80 glass-panel flex flex-col gap-3">
            <h5 className="text-[10.5px] font-bold uppercase tracking-widest text-slate-300 font-mono">Conectar novo ESP32</h5>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">Hostname mDNS</label>
                <input 
                  type="text" 
                  value={newHostname}
                  onChange={(e) => setNewHostname(e.target.value)}
                  placeholder="Ex: esp32-corredor"
                  className="bg-[#090A0D] border border-[#252833] text-xs px-2.5 py-2 rounded-xl text-slate-200 outline-none focus:border-cyan-500/50"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">Endereço IP Fixo</label>
                <input 
                  type="text" 
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="Ex: 192.168.4.45"
                  className="bg-[#090A0D] border border-[#252833] text-xs px-2.5 py-2 rounded-xl text-slate-200 outline-none focus:border-cyan-500/50"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-4">
                <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">Função na Rede:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10.5px] text-slate-300 select-none">
                  <input 
                    type="radio" 
                    name="role" 
                    checked={newRole === 'NODE'} 
                    onChange={() => setNewRole('NODE')}
                    className="accent-cyan-500" 
                  />
                  Nó Regular
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[10.5px] text-slate-300 select-none">
                  <input 
                    type="radio" 
                    name="role" 
                    checked={newRole === 'COORDINATOR'} 
                    onChange={() => setNewRole('COORDINATOR')}
                    className="accent-cyan-500" 
                  />
                  Coordenador
                </label>
              </div>

              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowAddForm(false)}
                  className="px-2.5 py-1.5 rounded-lg text-[10.5px] text-slate-450 hover:text-slate-200 transition-all font-mono"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-[10.5px]"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Nodes list cards view */}
      <div className="flex flex-col gap-3.5">
        {nodes.map((node) => {
          return (
            <div 
              key={node.ip} 
              className={`glass-card p-4.5 rounded-3xl border transition-all shadow-inner ${
                node.role === 'COORDINATOR' 
                  ? 'border-[#252833] border-l-4 border-l-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                  : 'border-[#252833]/60'
              }`}
            >
              {/* Card Header information */}
              <div className="flex justify-between items-start gap-2 border-b border-[#252833]/60 pb-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-2xl border ${node.role === 'COORDINATOR' ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-400 animate-pulse' : 'glass-panel border-[#252833] text-slate-400'}`}>
                    <Server className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{node.hostname}.local</span>
                      <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full uppercase ${node.role === 'COORDINATOR' ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400' : 'glass-panel' + ' border border-[#252833] text-slate-500'}`}>
                        {node.role === 'COORDINATOR' ? 'Coord / AP' : 'Nó Wifi'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">{node.ip}</span>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end gap-1 font-mono text-[9.5px]">
                  {node.isOnline ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Wifi className={`w-3.5 h-3.5 ${getRssiColor(node.rssi)}`} />
                        <span className={`font-bold ${getRssiColor(node.rssi)}`}>{node.rssi} dBm</span>
                      </div>
                      <span className="text-[8px] text-slate-500">Sinal: {getRssiLabel(node.rssi)}</span>
                    </>
                  ) : (
                    <span className="text-rose-500 font-bold uppercase tracking-wider">OFFLINE</span>
                  )}
                </div>
              </div>

              {/* Node Remote Pin Controllers */}
              <div className="flex flex-col gap-2.5">
                <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 font-bold block mb-1">
                  Controles e Sensores Remotos
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(node.pinStates).length === 0 && (
                    <div className="col-span-2 text-center text-xs text-slate-500 py-2">
                      Sem dados do nó.
                    </div>
                  )}
                  {Object.entries(node.pinStates).map(([gpioStr, pin]) => {
                    const gpio = parseInt(gpioStr, 10);
                    const isOutput = pin.mode === 'DIGITAL_OUTPUT';
                    const isAnalog = pin.mode === 'ANALOG_INPUT';

                    return (
                      <div 
                        key={gpio} 
                        className="glass-panel border border-[#252833] p-2.5 rounded-2xl flex items-center justify-between text-xs"
                      >
                        <div className="truncate pr-1">
                          <p className="font-semibold text-[11px] truncate text-slate-350">
                            {pin.customLabel}
                          </p>
                          <span className="text-[8.5px] font-mono text-slate-500 font-medium">
                            GPIO {gpio} • {pin.mode === 'DIGITAL_OUTPUT' ? 'OUT' : 'ADC'}
                          </span>
                        </div>

                        {/* Interactive toggle for remote digital outputs */}
                        {isOutput ? (
                          <button 
                            onClick={() => handleToggleRemotePin(node.ip, gpio, pin.value)}
                            className={`p-1.5 rounded-full border transition-all cursor-pointer ${
                              pin.value === 1 
                                ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400' 
                                : 'glass-card border-white/5 text-slate-500 hover:text-slate-300'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        ) : isAnalog ? (
                          <span className="bg-purple-950/30 border border-purple-900/50 px-2 py-0.5 rounded-lg text-[9.5px] text-purple-400 font-mono">
                            {pin.value}
                          </span>
                        ) : (
                          <span className="bg-cyan-950/30 border border-cyan-900/50 px-2 py-0.5 rounded-lg text-[9.5px] text-cyan-400 font-mono">
                            {pin.value}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Node signal details footer */}
              <div className="flex justify-between items-center text-[8.5px] font-mono text-slate-550 mt-3 pt-2.5 border-t border-[#252833]/40">
                <span>Servidor HTTP Interno: Ativo</span>
                <span>Último Ping mDNS: {node.lastSeen}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
