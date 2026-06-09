import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ESP32Pin, PinMode } from '../types';
import { ToggleLeft, ToggleRight, RotateCcw, Sliders, Activity, Info, Tag, Bolt } from 'lucide-react';

interface PinControllerProps {
  pins: ESP32Pin[];
  selectedPin: ESP32Pin;
  onUpdatePin: (updatedPin: ESP32Pin) => void;
  onSelectPinByGpio: (gpio: number) => void;
  onSavePin: (pin: ESP32Pin) => void;
  onDeletePin: (gpio: number) => void;
  onAddLog: (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => void;
}

export default function PinController({ pins, selectedPin, onUpdatePin, onSelectPinByGpio, onSavePin, onDeletePin, onAddLog }: PinControllerProps) {
  // No simulation state needed, fully physical.

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as PinMode;
    let defValue = 0;
    if (newMode === 'PWM_OUTPUT') defValue = 128; // Default half brightness
    if (newMode === 'ANALOG_INPUT') defValue = 2048; // Default half scale

    const updated: ESP32Pin = {
      ...selectedPin,
      mode: newMode,
      value: defValue,
      blinkInterval: 0
    };

    onUpdatePin(updated);
    onAddLog('GPIO', `Configurado GPIO ${selectedPin.gpio} para o modo [${newMode.replace('_', ' ')}]`);
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdatePin({
      ...selectedPin,
      customLabel: e.target.value
    });
  };

  const handleToggleDigitalValue = () => {
    const newValue = selectedPin.value === 0 ? 1 : 0;
    onUpdatePin({
      ...selectedPin,
      value: newValue
    });
    onAddLog('GPIO', `GPIO ${selectedPin.gpio} (${selectedPin.customLabel || selectedPin.name}) ajustado para [${newValue === 1 ? 'LIGADO' : 'DESLIGADO'}]`);
    
    // Simulate hitting simulated local Web server
    fetch(`/api/toggle?pin=${selectedPin.gpio}&val=${newValue}`)
      .catch(() => {}); // Eat error silently in purely client load
  };

  const handlePwmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    onUpdatePin({
      ...selectedPin,
      value: val
    });
  };

  const handlePwmRelease = () => {
    onAddLog('GPIO', `GPIO ${selectedPin.gpio} PWM ajustado para ${selectedPin.value}`);
    fetch(`/api/toggle?pin=${selectedPin.gpio}&val=${selectedPin.value}`).catch(() => {});
  };

  const handleAnalogChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    onUpdatePin({
      ...selectedPin,
      value: val
    });
  };

  const handleDigitalInputToggle = () => {
    const newVal = selectedPin.value === 0 ? 1 : 0;
    onUpdatePin({
      ...selectedPin,
      value: newVal
    });
    onAddLog('GPIO', `Leitura de Entrada Digital GPIO ${selectedPin.gpio} (Aguardando refresh)`);
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* SECTION 1: Active Pins Quick Switch Board */}
      <div id="quick-controls" className="glass-card p-5 rounded-3xl border border-white/5 shadow-inner backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3.5">
          <Bolt className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Controles Rápidos</h4>
        </div>

        <div className="grid grid-cols-2 gap-2.5 max-h-[160px] overflow-y-auto pr-1">
          <AnimatePresence>
            {pins.filter(p => p.mode !== 'UNUSED').length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-2 text-center py-6 text-slate-500 text-xs">
                Nenhuma GPIO em uso. Selecione um pino no ESP32 para configurá-lo.
              </motion.div>
            ) : (
              pins.filter(p => p.mode !== 'UNUSED').map(pin => {
                const isSelected = selectedPin.gpio === pin.gpio;
                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ scale: 1.02 }}
                    key={pin.gpio} 
                    onClick={() => onSelectPinByGpio(pin.gpio)}
                    className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer text-xs border transition-all relative overflow-hidden group ${
                      isSelected 
                        ? 'bg-cyan-600/10 border-cyan-500/50 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                        : 'bg-white/5 backdrop-blur-md border-white/5 text-slate-400 hover:border-slate-700/80'
                    }`}
                  >
                    {/* Mouse Glow Effect Background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/0 to-cyan-500/0 group-hover:from-cyan-500/5 group-hover:via-cyan-500/10 group-hover:to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                    <div className="truncate flex flex-col gap-0.5 justify-center min-w-0 pr-1.5 relative z-10">
                      <span className="font-semibold truncate text-[11px] text-slate-200">
                        {pin.customLabel || pin.name}
                      </span>
                      <span className="text-[9px] font-mono opacity-65 scale-90 origin-left text-cyan-500">
                        G{pin.gpio} • {pin.mode === 'DIGITAL_OUTPUT' ? 'OUT' : pin.mode === 'PWM_OUTPUT' ? 'PWM' : pin.mode === 'ANALOG_INPUT' ? 'ADC' : pin.mode === 'DIGITAL_INPUT' ? 'IN' : 'SENS'}
                      </span>
                    </div>

                    {/* Quick Control Toggle/Output state display */}
                    <div onClick={(e) => { e.stopPropagation(); onSelectPinByGpio(pin.gpio); }} className="flex-shrink-0 relative z-10">
                      {pin.mode === 'DIGITAL_OUTPUT' && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newValue = pin.value === 0 ? 1 : 0;
                            onUpdatePin({ ...pin, value: newValue });
                            onAddLog('GPIO', `GPIO ${pin.gpio} (${pin.customLabel}) alternado para [${newValue ? 'ON' : 'OFF'}]`);
                            fetch(`/api/toggle?pin=${pin.gpio}&val=${newValue}`).catch(() => {});
                          }}
                          className={`p-1.5 rounded-full transition-all ${pin.value === 1 ? 'text-emerald-450 bg-emerald-950/40' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                          {pin.value === 1 ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                      )}
                      {pin.mode === 'PWM_OUTPUT' && (
                        <span className="bg-cyan-950/40 border border-cyan-900/35 text-cyan-400 text-[9px] py-0.5 px-2 rounded-full font-mono">
                          {Math.round((pin.value / 255) * 100)}%
                        </span>
                      )}
                      {(pin.mode === 'ANALOG_INPUT' || pin.mode.startsWith('SENSOR_')) && (
                        <span className="bg-purple-950/40 border border-purple-900/35 text-purple-400 text-[9px] py-0.5 px-2 rounded-full font-mono animate-pulse">
                          {pin.value}
                        </span>
                      )}
                      {pin.mode === 'DIGITAL_INPUT' && (
                        <span className={`px-2 py-0.5 text-[9px] font-mono rounded-full border ${
                          pin.value === 1 
                            ? 'bg-amber-950/40 border-amber-900/50 text-amber-400 font-bold' 
                            : 'glass-panel border-[#252833] text-slate-500'
                        }`}>
                          {pin.value === 1 ? 'HIGH' : 'LOW'}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* SECTION 2: GPIO Settings Panel */}
      <div id="pin-settings" className="glass-card p-5 rounded-3xl border border-white/5 backdrop-blur-sm flex-1 flex flex-col justify-between shadow-inner">
        <div>
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#252833]/60">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Ajuste de GPIO</h4>
            </div>
            <span className="font-mono text-[10px] glass-panel px-2.5 py-1 rounded-full border border-white/5 text-cyan-400 font-bold">
              {selectedPin.name}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {/* PIN MODE SELECTION */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-500" /> Modo de Operação
              </label>
              <select 
                value={selectedPin.mode} 
                onChange={handleModeChange}
                className="w-full glass-panel border border-[#252833] hover:border-slate-700 text-xs px-3 py-2.5 rounded-2xl text-slate-200 outline-none focus:border-cyan-500/80 transition-all cursor-pointer font-medium"
              >
                <option value="UNUSED">Não Selecionado (Inativo)</option>
                <option value="DIGITAL_OUTPUT">Saída Digital (Controle Lig/Desl)</option>
                <option value="DIGITAL_INPUT">Entrada Digital (Leitura Sensores/Botão)</option>
                <option value="ANALOG_INPUT">Entrada Analógica (Sensor ADC genérico)</option>
                <option value="PWM_OUTPUT">Saída PWM (Dimmer / Motor / Fita LED)</option>
                <option value="SENSOR_WATER_FLOW">Sensor de Fluxo de Água</option>
                <option value="SENSOR_WATER_EC">Sensor de Condutividade Elétrica da Água</option>
                <option value="SENSOR_WATER_PH">Sensor de PH da Água</option>
                <option value="SENSOR_WATER_LEVEL">Sensor de Nível de Água</option>
                <option value="SENSOR_WATER_TEMP">Sensor de Temperatura da Água</option>
                <option value="SENSOR_HUMIDITY">Sensor de Umidade</option>
                <option value="SENSOR_CO2">Sensor de CO2</option>
                <option value="SENSOR_TEMP">Sensor de Temperatura</option>
              </select>
            </div>

            {/* PIN CUSTOM LABEL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-cyan-500" /> Etiqueta Personalizada
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  value={selectedPin.customLabel} 
                  onChange={handleLabelChange}
                  disabled={selectedPin.mode === 'UNUSED'}
                  placeholder="Ex: Sensor de Solo, LED Sala.."
                  className="w-full glass-panel border border-[#252833] hover:border-slate-700 text-xs pl-3 pr-8 py-2.5 rounded-2xl text-slate-200 outline-none focus:border-cyan-500/80 transition-all disabled:opacity-45 disabled:pointer-events-none font-medium"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-650 pointer-events-none text-[11px] font-mono">
                  G{selectedPin.gpio}
                </span>
              </div>
            </div>

            {/* INVERT LOGIC (Only for digital inputs and outputs) */}
            {(selectedPin.mode === 'DIGITAL_OUTPUT' || selectedPin.mode === 'DIGITAL_INPUT') && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-500" /> Inverter Lógica
                  </div>
                  <button
                    onClick={() => {
                      onUpdatePin({
                        ...selectedPin,
                        invertLogic: !selectedPin.invertLogic
                      });
                    }}
                    className={`w-10 h-5 rounded-full relative transition-all ${selectedPin.invertLogic ? 'bg-cyan-500' : 'bg-[#252833]'}`}
                  >
                    <div className={`absolute top-0.5 bottom-0.5 w-4 bg-white rounded-full transition-all ${selectedPin.invertLogic ? 'left-[22px]' : 'left-[2px]'}`} />
                  </button>
                </label>
                <p className="text-[9px] text-slate-500 leading-tight">
                  Ative para inverter o sinal físico (0V/3.3V) em relação à tela.
                </p>
              </div>
            )}

            {/* SENSOR CALIBRATION INPUTS */}
            {selectedPin.mode.startsWith('SENSOR_') && (
              <div className="flex flex-col gap-3 p-3 glass-panel border border-[#252833] rounded-2xl">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sliders className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 font-mono">Calibração do Sensor</span>
                </div>
                
                {selectedPin.mode === 'SENSOR_WATER_FLOW' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-slate-400 font-mono">Fator de Calibração (Pulsos/Litro)</label>
                    <input type="number" step="0.1"
                      value={selectedPin.calibMultiplier || ''} 
                      onChange={e => onUpdatePin({ ...selectedPin, calibMultiplier: parseFloat(e.target.value) || 0 })}
                      className="w-full glass-card border border-[#252833] text-xs px-2.5 py-1.5 rounded-xl text-slate-200 outline-none" placeholder="Ex: 7.5" />
                  </div>
                )}
                
                {['SENSOR_WATER_PH', 'SENSOR_WATER_EC'].includes(selectedPin.mode) && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] text-slate-400 font-mono">Offset (Zero)</label>
                      <input type="number" step="0.01"
                        value={selectedPin.calibOffset || ''} 
                        onChange={e => onUpdatePin({ ...selectedPin, calibOffset: parseFloat(e.target.value) || 0 })}
                        className="w-full glass-card border border-[#252833] text-xs px-2.5 py-1.5 rounded-xl text-slate-200 outline-none" placeholder="Ex: 0.0" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] text-slate-400 font-mono">Multiplicador</label>
                      <input type="number" step="0.001"
                        value={selectedPin.calibMultiplier || ''} 
                        onChange={e => onUpdatePin({ ...selectedPin, calibMultiplier: parseFloat(e.target.value) || 0 })}
                        className="w-full glass-card border border-[#252833] text-xs px-2.5 py-1.5 rounded-xl text-slate-200 outline-none" placeholder="Ex: 1.0" />
                    </div>
                  </div>
                )}
                
                {!['SENSOR_WATER_FLOW', 'SENSOR_WATER_PH', 'SENSOR_WATER_EC'].includes(selectedPin.mode) && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] text-slate-400 font-mono">Ajuste Fino (Offset)</label>
                    <input type="number" step="0.1"
                      value={selectedPin.calibOffset || ''} 
                      onChange={e => onUpdatePin({ ...selectedPin, calibOffset: parseFloat(e.target.value) || 0 })}
                      className="w-full glass-card border border-[#252833] text-xs px-2.5 py-1.5 rounded-xl text-slate-200 outline-none" placeholder="Ex: -1.5" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Dynamic Interactors based on selected mode */}
        <div className="mt-6 pt-5 border-t border-[#252833]/65">
          {selectedPin.mode === 'UNUSED' && (
            <div className="text-center py-6 px-4 glass-panel rounded-2xl border border-dashed border-[#252833]">
              <p className="text-[11px] text-slate-400 leading-normal">
                Este pino está <span className="text-slate-500 font-bold">Inativo</span> no momento.
              </p>
              <p className="text-[9.5px] text-slate-500 mt-1 font-mono">
                Altere o modo acima para começar a monitorar ou controlar
              </p>
            </div>
          )}

          {selectedPin.mode === 'DIGITAL_OUTPUT' && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between glass-panel p-3.5 rounded-2xl border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-200">Estado Local do Pino</span>
                  <span className="text-[9.5px] text-slate-500">Valor enviado ao pino físico</span>
                </div>
                <button 
                  onClick={handleToggleDigitalValue}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tracking-tight transition-all shadow-md ${
                    selectedPin.value === 1 
                      ? 'bg-[#252936] text-white border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.15)] active:glass-card' 
                      : 'bg-[#252936] text-slate-400 border border-white/5 hover:glass-card'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${selectedPin.value === 1 ? 'bg-cyan-400 animate-ping' : 'bg-neutral-600'}`} />
                  {selectedPin.value === 1 ? 'LIGADO (HIGH)' : 'DESLIGADO (LOW)'}
                </button>
              </div>

            </div>
          )}
          
          {selectedPin.mode.startsWith('SENSOR_') && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-center justify-between glass-panel p-3.5 rounded-2xl border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-200">Leitura do Sensor</span>
                  <span className="text-[9.5px] text-slate-500">Valor com calibração aplicada</span>
                </div>
                <div className="px-4 py-2 bg-purple-900/20 text-purple-400 border border-purple-500/30 rounded-xl text-xs font-mono font-bold animate-pulse shadow-inner">
                  {selectedPin.value}
                </div>
              </div>
            </div>
          )}

          {selectedPin.mode === 'DIGITAL_INPUT' && (
            <div className="glass-panel p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold text-slate-200">Leitura de Entrada</span>
                <span className="text-[9.5px] text-slate-500">Valor reportado pelo ESP32</span>
              </div>
              <div
                className={`py-2 px-4 rounded-xl text-xs font-bold tracking-tight border transition-all ${
                  selectedPin.value === 1 
                    ? 'bg-cyan-500 border-cyan-400 text-white shadow-lg shadow-cyan-500/20' 
                    : 'glass-panel border-[#252833] text-slate-400'
                }`}
              >
                {selectedPin.value === 1 ? 'ALTO (HIGH)' : 'BAIXO (LOW)'}
              </div>
            </div>
          )}

          {selectedPin.mode === 'ANALOG_INPUT' && (
            <div className="flex flex-col gap-3.5">
              <div className="glass-panel p-3.5 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-1 font-mono text-[10px]">
                  <span className="text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-purple-400" /> Leitura ADC (12-bit)
                  </span>
                  <span className="text-purple-400 font-bold">{selectedPin.value} / 4095</span>
                </div>

                {/* Progress bar visualizer */}
                <div className="w-full h-3 bg-[#090A0D] rounded-full overflow-hidden border border-[#252833] p-[1.5px] mt-2">
                  <div 
                    style={{ width: `${(selectedPin.value / 4095) * 100}%` }}
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                  />
                </div>

                {/* Volts Indicator */}
                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-2">
                  <span>0V</span>
                  <span>Equivalente: {((selectedPin.value / 4095) * 3.3).toFixed(2)} Volts</span>
                  <span>3.3V</span>
                </div>
              </div>
            </div>
          )}

          {selectedPin.mode === 'PWM_OUTPUT' && (
            <div className="flex flex-col gap-3.5">
              <div className="glass-panel p-3.5 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-1 font-mono text-[10px]">
                  <span className="text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-cyan-450" /> Duty Cycle (8-bit)
                  </span>
                  <span className="text-cyan-400 font-bold">{selectedPin.value} / 255</span>
                </div>

                <div className="w-full h-3 bg-[#090A0D] rounded-full overflow-hidden border border-[#252833] p-[1.5px] mt-2">
                  <div 
                    style={{ width: `${(selectedPin.value / 255) * 100}%` }}
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded-full transition-all duration-300"
                  />
                </div>

                <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-2">
                  <span>0% (Off)</span>
                  <span>Largura do Pulso: {Math.round((selectedPin.value / 255) * 100)}%</span>
                  <span>100% (On)</span>
                </div>
              </div>

              {/* PWM Adjust input */}
              <div className="flex flex-col gap-1.5 glass-panel/40 p-3 rounded-2xl border border-white/5">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">Ajustar Potência</span>
                <input 
                  type="range"
                  min="0"
                  max="255"
                  value={selectedPin.value}
                  onChange={handlePwmChange}
                  onMouseUp={handlePwmRelease}
                  onTouchEnd={handlePwmRelease}
                  className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-[#252936] rounded-lg appearance-none mt-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: Persistence Controls */}
        <div className="mt-4 pt-4 flex items-center justify-between gap-3 border-t border-[#252833]/65">
          <button
            onClick={() => onSavePin(selectedPin)}
            disabled={selectedPin.mode === 'UNUSED'}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(6,182,212,0.2)]"
          >
            Salvar na Memória (NVS)
          </button>
          
          <button
            onClick={() => onDeletePin(selectedPin.gpio)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:text-white border border-red-500/30 hover:bg-red-500 hover:border-red-500 transition-all"
          >
            Excluir Configuração
          </button>
        </div>
      </div>
    </div>
  );
}
