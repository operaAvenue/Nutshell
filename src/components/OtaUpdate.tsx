import React, { useState, useEffect } from 'react';
import { ESP32Node } from '../types';
import { 
  CloudDownload, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Play, 
  Github,
  Server
} from 'lucide-react';

interface OtaUpdateProps {
  nodes: ESP32Node[];
  onAddLog: (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => void;
}

export default function OtaUpdate({ nodes, onAddLog }: OtaUpdateProps) {
  const [selectedNodeIp, setSelectedNodeIp] = useState<string>('local');
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [latestRelease, setLatestRelease] = useState<any>(null);
  const [currentVersion, setCurrentVersion] = useState<string>("Desconhecida");
  const [updateSuccess, setUpdateSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(false);

  const fetchAutoUpdateState = async () => {
    try {
      const targetUrl = selectedNodeIp === 'local' ? '/api/autoupdate' : `http://${selectedNodeIp}/api/autoupdate`;
      const response = await fetch(targetUrl, { headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` } });
      if(response.ok) {
        const data = await response.json();
        setAutoUpdateEnabled(data.enabled);
      }
    } catch(err) {
      console.warn("Failed to fetch autoupdate state", err);
    }
  };

  const toggleAutoUpdate = async () => {
    const newState = !autoUpdateEnabled;
    setAutoUpdateEnabled(newState);
    try {
      const targetUrl = selectedNodeIp === 'local' ? '/api/autoupdate' : `http://${selectedNodeIp}/api/autoupdate`;
      await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` },
        body: JSON.stringify({ enabled: newState })
      });
      onAddLog('SYSTEM', `Atualizações automáticas ${newState ? 'ATIVADAS' : 'DESATIVADAS'}`);
    } catch(err) {
      onAddLog('ERROR', "Falha ao salvar preferência de autoupdate.");
    }
  };

  const fetchCurrentVersion = async () => {
    try {
      const targetUrl = selectedNodeIp === 'local' ? '/api/version' : `http://${selectedNodeIp}/api/version`;
      const response = await fetch(targetUrl, { headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` } });
      if(response.ok) {
        const data = await response.json();
        setCurrentVersion(data.version || "v1.0.0");
      }
    } catch(err) {
      console.warn("Failed to fetch current version", err);
    }
  };

  const checkGitHubUpdates = async () => {
    setIsChecking(true);
    setErrorMsg("");
    try {
      const response = await fetch('https://api.github.com/repos/operaAvenue/Nutshell/releases/latest');
      if (response.ok) {
        const data = await response.json();
        setLatestRelease(data);
        onAddLog('HTTP', `Versão ${data.tag_name} encontrada no GitHub (Repositório Nutshell).`);
      } else {
        setErrorMsg("Não foi possível buscar atualizações do GitHub.");
        onAddLog('ERROR', "Falha ao consultar API do GitHub.");
      }
    } catch (err) {
      setErrorMsg("Erro de rede ao buscar do GitHub.");
      onAddLog('ERROR', `Erro de rede OTA: ${err}`);
    }
    setIsChecking(false);
  };

  useEffect(() => {
    fetchCurrentVersion();
    fetchAutoUpdateState();
    checkGitHubUpdates();
  }, [selectedNodeIp]);

  const startOtaUpdate = async () => {
    if (!latestRelease) return;
    
    // Find asset URLs
    const firmwareAsset = latestRelease.assets?.find((a: any) => a.name === 'firmware.bin');
    const fsAsset = latestRelease.assets?.find((a: any) => a.name === 'littlefs.bin');

    const firmwareUrl = firmwareAsset ? firmwareAsset.browser_download_url : '';
    const fsUrl = fsAsset ? fsAsset.browser_download_url : '';

    if (!firmwareUrl && !fsUrl) {
      setErrorMsg("A release não contém os binários esperados (firmware.bin ou littlefs.bin).");
      return;
    }

    setIsUpdating(true);
    setUpdateSuccess(false);
    setErrorMsg("");
    
    onAddLog('SYSTEM', `Solicitando atualização via OTA para ${latestRelease.tag_name}...`);

    try {
      const targetUrl = selectedNodeIp === 'local' ? '/api/update' : `http://${selectedNodeIp}/api/update`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`
        },
        body: JSON.stringify({
          firmwareUrl: firmwareUrl,
          fsUrl: fsUrl
        })
      });

      if (response.ok) {
        setUpdateSuccess(true);
        onAddLog('SYSTEM', "Comando de OTA enviado com sucesso. O dispositivo baixará o firmware e reiniciará sozinho.");
      } else {
        setErrorMsg(`Falha no comando OTA: ${response.statusText}`);
        onAddLog('ERROR', `Falha OTA: ${response.statusText}`);
      }
    } catch (err) {
      setErrorMsg("Erro de rede ao enviar comando OTA.");
      onAddLog('ERROR', `Erro OTA: ${err}`);
    }
    setIsUpdating(false);
  };

  return (
    <div className="flex flex-col gap-5 mt-5">
      <div className="glass-card p-5 rounded-3xl border border-white/5 shadow-inner backdrop-blur-sm">
        <div className="flex justify-between items-center pb-3 border-b border-[#252833]/60 mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 border border-accent-500/15 bg-accent-500/5 text-accent-400 rounded-xl">
              <Github className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Atualização OTA via GitHub</h4>
              <p className="text-[10px] text-slate-500 font-mono">Repositório: operaAvenue/Nutshell</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">Alvo:</span>
            <select 
              value={selectedNodeIp}
              onChange={(e) => setSelectedNodeIp(e.target.value)}
              disabled={isUpdating}
              className="glass-panel border border-[#252833] hover:border-slate-700 text-xs px-2.5 py-1.5 rounded-xl text-slate-200 outline-none transition-all font-mono"
            >
              <option value="local">ESP32 Principal</option>
              {nodes.filter(n => n.isOnline).map(n => (
                <option key={n.ip} value={n.ip}>
                  {n.hostname}.local ({n.ip})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Auto Update Toggle */}
        <div className="glass-panel p-4.5 rounded-2xl border border-white/5 mb-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-200">Atualizações Automáticas</span>
            <span className="text-[10px] text-slate-500 font-mono mt-0.5">O ESP32 verificará a cada 12 horas.</span>
          </div>
          <button
            onClick={toggleAutoUpdate}
            className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${autoUpdateEnabled ? 'bg-accent-500' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ${autoUpdateEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="glass-panel p-4.5 rounded-2xl border border-white/5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold font-mono text-slate-200">Versão Atual Instalada</span>
                <span className="text-[10px] text-slate-500 font-mono">{currentVersion}</span>
              </div>
            </div>
            <button 
              type="button"
              onClick={checkGitHubUpdates}
              disabled={isChecking || isUpdating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#252936] hover:bg-[#323646] text-slate-300 transition-all font-mono disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} /> Verificar
            </button>
          </div>
          
          <hr className="border-[#252833]/60" />

          {latestRelease ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                   <span className="text-xs font-bold font-mono text-emerald-400">Última Versão: {latestRelease.tag_name}</span>
                   <span className="text-[10px] text-slate-500">Publicado em: {new Date(latestRelease.published_at).toLocaleString()}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-mono italic">"{latestRelease.name}"</p>
              
              {!isUpdating && !updateSuccess && latestRelease.tag_name !== currentVersion && (
                <div className="flex justify-end pt-2">
                  <button 
                    type="button"
                    onClick={startOtaUpdate}
                    className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-bold bg-accent-500 hover:bg-accent-400 text-slate-950 shadow-md shadow-accent-500/10 active:scale-95 transition-all cursor-pointer font-sans"
                  >
                    <CloudDownload className="w-4 h-4 fill-slate-950" /> Baixar e Instalar no ESP32
                  </button>
                </div>
              )}
              {latestRelease.tag_name === currentVersion && (
                <div className="mt-2 text-center text-[10px] text-emerald-500 font-bold bg-emerald-500/10 p-2 rounded-lg">
                  O dispositivo já está na versão mais recente.
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-[10px] text-slate-500 font-mono">
              {isChecking ? 'Buscando dados no GitHub...' : 'Nenhuma release encontrada ou verificada.'}
            </div>
          )}

          {errorMsg && (
            <div className="mt-2 text-[10px] text-red-400 bg-red-400/10 p-2 rounded-lg border border-red-400/20">
              {errorMsg}
            </div>
          )}

          {isUpdating && (
            <div className="mt-2 text-center text-[10px] text-accent-400 animate-pulse bg-accent-400/10 p-2 rounded-lg">
              Enviando comando para o ESP32...
            </div>
          )}

          {updateSuccess && (
            <div className="mt-2 flex items-center justify-center gap-2 bg-emerald-950/20 border border-emerald-500/20 p-3 rounded-xl">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-emerald-400 font-sans">Comando OTA enviado!</span>
                <span className="text-[9.5px] text-slate-400 font-mono">
                  O ESP32 está baixando os arquivos binários do GitHub e irá reiniciar automaticamente em seguida.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="mb-1 flex items-start gap-2.5 bg-accent-950/5 border border-accent-500/10 p-3.5 rounded-2xl shadow-inner">
        <AlertCircle className="w-4 h-4 text-accent-400 flex-shrink-0 mt-0.5 animate-pulse" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold text-accent-400 font-mono">FLUXO DE OTA REMOTO</span>
          <p className="text-[9.5px] text-slate-505 leading-relaxed font-sans">
            Ao clicar em instalar, o navegador enviará apenas o link de download direto do GitHub (<code className="glass-panel text-slate-400 px-1.5 py-0.5 rounded font-mono">browser_download_url</code>) para o ESP32. O ESP32 cuidará do download seguro em background através de HTTPS com cliente inseguro, fazendo validação automática do cabeçalho binário!
          </p>
        </div>
      </div>
    </div>
  );
}
