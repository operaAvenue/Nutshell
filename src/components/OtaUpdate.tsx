import React, { useState, useRef, useEffect } from 'react';
import { ESP32Node } from '../types';
import { 
  UploadCloud, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Cpu, 
  Server, 
  Play, 
  Trash2, 
  Check,
  Terminal,
  Activity
} from 'lucide-react';

interface OtaUpdateProps {
  nodes: ESP32Node[];
  onAddLog: (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => void;
}

export default function OtaUpdate({ nodes, onAddLog }: OtaUpdateProps) {
  // OTA states
  const [selectedNodeIp, setSelectedNodeIp] = useState<string>('local');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(0); // in KB/s
  const [eta, setEta] = useState<number>(0); // in seconds
  const [statusText, setStatusText] = useState<string>('');
  const [otaLogs, setOtaLogs] = useState<string[]>([]);
  const [updateSuccess, setUpdateSuccess] = useState<boolean>(false);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-select node names
  const getSelectedNodeLabel = () => {
    if (selectedNodeIp === 'local') return 'ESP32 Servidor Principal (mDNS Local)';
    const node = nodes.find(n => n.ip === selectedNodeIp);
    return node ? `${node.hostname}.local (${node.ip})` : 'Nó Wifi Desconhecido';
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      // Accept general files but ideal is .bin
      setFile(droppedFile);
      setUpdateSuccess(false);
      onAddLog('SYSTEM', `Arquivo carregado para OTA: ${droppedFile.name} (${(droppedFile.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setUpdateSuccess(false);
      onAddLog('SYSTEM', `Arquivo carregado para OTA: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const clearFile = () => {
    setFile(null);
    setUpdateSuccess(false);
    setProgress(0);
    setOtaLogs([]);
  };

  // Start Simulation
  const startOtaUpdate = () => {
    if (!file) return;

    setIsUpdating(true);
    setProgress(0);
    setUpdateSuccess(false);
    setOtaLogs([]);

    const nodeLabel = getSelectedNodeLabel();
    const targetIp = selectedNodeIp === 'local' ? '192.168.4.1' : selectedNodeIp;
    const fileSizeStr = (file.size / 1024 / 1024).toFixed(2) + ' MB';

    // Logging initial update trigger
    onAddLog('SYSTEM', `Iniciando upload OTA para [${nodeLabel}] com ${file.name}`);

    // OTA Simulation phases & speeds
    const phases = [
      { prg: 0, text: `[OTA] Estabelecendo conexão segura com host http://${targetIp}/update...` },
      { prg: 5, text: `[OTA] Resposta HTTP 200 OK recebida do ESPAsyncWebServer` },
      { prg: 10, text: `[OTA] Autenticação de Hash MD5 de firmware autorizada` },
      { prg: 15, text: `[OTA] Iniciando escrita na partição SPI do Chipset ESP32 (Tamanho: ${file.size} bytes)...` },
      { prg: 30, text: `[OTA] Gravando bloco secundário: partição app0 em execução.` },
      { prg: 50, text: `[OTA] Upload executado com sucesso até 50%. Velocidade média alta.` },
      { prg: 70, text: `[OTA] Gravação das bibliotecas estáticas e sistema de arquivos no Flash ROM.` },
      { prg: 85, text: `[OTA] Executando verificação de checksum cíclico (CRC-32)...` },
      { prg: 95, text: `[OTA] Assinatura do firmware verificada e homologada pelo bootloader.` },
      { prg: 100, text: `[OTA] Sucesso! Programação terminada. Solicitando reinicialização (Soft Reboot)...` }
    ];

    addOtaLog(phases[0].text);

    let progressCounter = 0;
    const intervalTime = 120; // total duration ~ 6 seconds
    
    const timer = setInterval(() => {
      progressCounter += 2;
      if (progressCounter > 100) progressCounter = 100;

      setProgress(progressCounter);

      // Simulate download speed: fluctuations around 150-180 KB/s
      const simulatedSpeed = Math.floor(150 + Math.random() * 35);
      setSpeed(simulatedSpeed);

      // Calculate ETA
      const remainingBytes = (file.size * (100 - progressCounter)) / 100;
      const remainingSeconds = remainingBytes / (simulatedSpeed * 1024);
      setEta(progressCounter === 100 ? 0 : Math.max(0, Math.round(remainingSeconds * 10) / 10));

      // Append specific logs at specific intervals
      const phase = phases.find(p => p.prg === progressCounter);
      if (phase) {
        addOtaLog(phase.text);
        
        // System wide logs only for major checkpoints
        if ([15, 50, 85, 100].includes(phase.prg)) {
          let category: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR' = 'HTTP';
          let msg = phase.text.replace('[OTA] ', '');
          if (phase.prg === 100) {
            category = 'SYSTEM';
          }
          onAddLog(category, `[OTA @ ${targetIp}] ${msg}`);
        }
      } else if (progressCounter % 16 === 0 && progressCounter > 15 && progressCounter < 85) {
        // Continuous intermediate flash feedback
        const percentageStr = `${progressCounter}%`;
        const writtenStr = ((file.size * progressCounter) / 100 / 1024).toFixed(0);
        const totalStr = (file.size / 1024).toFixed(0);
        addOtaLog(`[OTA] Upload do Binário: ${percentageStr} (${writtenStr}KB de ${totalStr}KB escritos...)`);
      }

      if (progressCounter === 100) {
        clearInterval(timer);
        setIsUpdating(false);
        setUpdateSuccess(true);
        addOtaLog(`\x1b[32m[SYSTEM] ESP32 com IP ${targetIp} focado reiniciando agora. Tempo offline estimado: 1.5s\x1b[0m`);
        
        // Simulate device rebooting lag
        setTimeout(() => {
          onAddLog('SYSTEM', `[OTA] Dispositivo ${targetIp} reconectado. Firmware v2.0.1 em execução.`);
        }, 1800);
      }
    }, intervalTime);
  };

  const addOtaLog = (msg: string) => {
    setOtaLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  return (
    <div className="flex flex-col gap-5 mt-5">
      {/* OTA Status Header Card */}
      <div className="bg-[#1C1F2B] p-5 rounded-3xl border border-white/5 shadow-inner backdrop-blur-sm">
        <div className="flex justify-between items-center pb-3 border-b border-[#252833]/60 mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 border border-cyan-500/15 bg-cyan-500/5 text-cyan-400 rounded-xl">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: isUpdating ? '3s' : '12s' }} />
            </div>
            <div className="flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Atualização de Firmware OTA</h4>
              <p className="text-[10px] text-slate-500 font-mono">Flasheamento de arquivos binários compilados via Wi-Fi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Alvo:</span>
            <select 
              value={selectedNodeIp}
              onChange={(e) => setSelectedNodeIp(e.target.value)}
              disabled={isUpdating}
              className="bg-[#12141C] border border-[#252833] hover:border-slate-700 text-xs px-2.5 py-1.5 rounded-xl text-slate-200 outline-none transition-all font-mono"
            >
              <option value="local">ESP32 Principal (Local • 192.168.4.1)</option>
              {nodes.filter(n => n.isOnline).map(n => (
                <option key={n.ip} value={n.ip}>
                  {n.hostname}.local ({n.ip})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drag and Drop Zone Container */}
        {!file ? (
          <div 
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3 transition-all duration-350 cursor-pointer select-none ${
              dragActive 
                ? 'border-cyan-400 bg-cyan-950/20 text-cyan-300 scale-[0.99] shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                : 'border-[#252833] bg-[#12141C]/40 hover:border-slate-700 walk:bg-[#12141C] text-slate-400 hover:text-slate-200'
            }`}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".bin" 
              onChange={handleFileInputChange}
              className="hidden" 
            />
            <div className="p-3 border border-dashed border-cyan-500/10 bg-cyan-500/5 text-cyan-400 rounded-full mb-1">
              <UploadCloud className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-200 block md:inline font-sans">Arrastar e soltar arquivo .bin</span>
              <span className="text-xs text-slate-450 font-sans"> ou clique para navegar nos dados locais</span>
            </div>
            <p className="text-[9.5px] font-mono text-slate-500 max-w-sm mt-0.5 leading-relaxed">
              Arraste um binário compilado do Arduino IDE or PlatformIO (ex: <code className="bg-[#1C1F2B] px-1 py-0.5 rounded text-cyan-400">firmware.bin</code>).
            </p>
          </div>
        ) : (
          <div className="bg-[#12141C] p-4.5 rounded-2xl border border-white/5 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
                  <Cpu className="w-5 h-5 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold font-mono text-slate-200 truncate max-w-xs md:max-w-md">{file.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Tamanho: <strong className="text-slate-400">{(file.size / 1024).toFixed(1)} KB</strong> • Tipo: <strong className="text-cyan-500">ESP32 Firmware Bin</strong>
                  </span>
                </div>
              </div>

              {!isUpdating && (
                <button 
                  type="button"
                  onClick={clearFile}
                  className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                  title="Remover arquivo"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              )}
            </div>

            {/* Simulated Action triggers */}
            {!isUpdating && !updateSuccess && (
              <div className="flex justify-end gap-3.5 pt-1">
                <button 
                  type="button"
                  onClick={clearFile}
                  className="px-4 py-2 hover:bg-[#252936] rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all font-mono cursor-pointer"
                >
                  Substituir Arquivo...
                </button>
                <button 
                  type="button"
                  onClick={startOtaUpdate}
                  className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/10 active:scale-95 transition-all cursor-pointer font-sans"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950 text-slate-950" /> Iniciar Atualização OTA
                </button>
              </div>
            )}

            {/* Dynamic upload simulation telemetry */}
            {(isUpdating || updateSuccess) && (
              <div className="flex flex-col gap-3">
                {/* Custom glowing linear progress bar */}
                <div className="flex justify-between items-center font-mono text-[10.5px]">
                  <span className="font-bold uppercase tracking-wider text-slate-450 block">Status: {updateSuccess ? 'Gravação Completa' : 'Flasheando em Lote...'}</span>
                  <span className={`font-bold ${updateSuccess ? 'text-emerald-400' : 'text-cyan-400 animate-pulse'}`}>{progress}%</span>
                </div>

                <div className="w-full bg-[#1C1F2B] h-2.5 rounded-full overflow-hidden border border-white/5 relative">
                  <div 
                    className={`h-full rounded-full transition-all duration-120 ${
                      updateSuccess 
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.35)]' 
                        : 'bg-gradient-to-r from-cyan-500 to-blue-400 shadow-[0_0_10px_rgba(6,182,212,0.35)]'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {isUpdating && (
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono text-slate-450 bg-[#1C1F2B]/60 p-2 rounded-xl border border-white/5 shadow-inner leading-normal">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Taxa Banda</span>
                      <span className="text-cyan-400 font-bold">{speed} KB/s</span>
                    </div>
                    <div className="flex flex-col border-x border-[#252833]/60">
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Transmitido</span>
                      <span className="text-slate-300 font-bold">{((file.size * progress) / 100 / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Tempo restante</span>
                      <span className="text-amber-400 font-bold">{eta === 0 ? 'Concluindo' : `${eta}s`}</span>
                    </div>
                  </div>
                )}

                {updateSuccess && (
                  <div className="flex items-center gap-2 bg-emerald-950/15 border border-emerald-500/20 p-3 rounded-xl">
                    <div className="p-1 rounded-full bg-emerald-500/10 text-emerald-400">
                      <Check className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col leading-snug">
                      <span className="text-[11px] font-bold text-emerald-400 font-sans">Firmware Atualizado com Sucesso!</span>
                      <span className="text-[9.5px] text-slate-400 font-mono">
                        Nó [<strong>{getSelectedNodeLabel()}</strong>] está reiniciando para carregar a nova imagem de boot.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live OTA local logs terminal feedback */}
        {(otaLogs.length > 0) && (
          <div className="mt-4.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[9.5px] font-mono text-slate-500 font-bold uppercase tracking-wider select-none">
              <span className="flex items-center gap-1">
                <Terminal className="w-3.5 h-3.5 text-cyan-500 animate-pulse" /> Telemetria de Partição OTA local
              </span>
              <span>Conexão Wi-Fi Direta</span>
            </div>
            <div className="bg-[#090A0D] border border-white/5 p-3 rounded-2xl max-h-[140px] overflow-y-auto font-mono text-[9px] text-slate-400 leading-relaxed shadow-inner scrollbar-thin select-text">
              {otaLogs.map((log, index) => (
                <div 
                  key={index} 
                  className={log.includes('Sucesso!') || log.includes('reconectado') || log.includes('Completa') ? 'text-emerald-400' : log.includes('Erro') ? 'text-red-400 font-bold' : ''}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Safety instructions warning cards */}
      <div className="mb-1 flex items-start gap-2.5 bg-cyan-950/5 border border-cyan-500/10 p-3.5 rounded-2xl shadow-inner">
        <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5 animate-pulse" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold text-cyan-400 font-mono">SEGURANÇA DOS DADOS & PARTIÇÕES OTA</span>
          <p className="text-[9.5px] text-slate-505 leading-relaxed font-sans">
            Ao simular ou implementar atualizações Over-the-Air no ESP32, certifique-se de configurar a tabela de partições (<code className="bg-[#12141C] text-slate-400 px-1.5 py-0.5 rounded font-mono">OTA Partition Table</code>) com ao menos duas partições de aplicativo (<code className="bg-[#12141C] text-slate-400 px-1.5 py-0.5 rounded font-mono">app0</code> e <code className="bg-[#12141C] text-slate-400 px-1.5 py-0.5 rounded font-mono">app1</code>). Se o upload falhar no meio, o ESP32 reverte automaticamente para a imagem de fábrica íntegra!
          </p>
        </div>
      </div>
    </div>
  );
}
