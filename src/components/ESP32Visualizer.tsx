import React, { useState } from 'react';
import { LEFT_PIN_RAIL, RIGHT_PIN_RAIL } from '../data';
import { ESP32Pin, PinMode } from '../types';
import { HelpCircle, Cpu, Radio, Zap } from 'lucide-react';

interface ESP32VisualizerProps {
  pins: ESP32Pin[];
  wifiMode: 'AP' | 'STA';
  onSelectPin?: (gpio: number) => void;
  selectedGpio?: number;
}

export default function ESP32Visualizer({ pins, wifiMode, onSelectPin, selectedGpio }: ESP32VisualizerProps) {
  const [hoveredPin, setHoveredPin] = useState<{ pin: string; desc: string } | null>(null);

  // Map modes to cute colors
  const getModeColorClass = (mode: PinMode, value: number) => {
    switch (mode) {
      case 'DIGITAL_OUTPUT':
        return value > 0 
          ? 'bg-emerald-500 text-white ring-4 ring-emerald-400/30' 
          : 'bg-emerald-850 border border-emerald-500/50 text-emerald-300';
      case 'DIGITAL_INPUT':
        return 'bg-amber-500 text-white ring-4 ring-amber-400/30';
      case 'ANALOG_INPUT':
        return 'bg-purple-600 text-white ring-4 ring-purple-500/30';
      case 'PWM_OUTPUT':
        return 'bg-cyan-500 text-white ring-4 ring-cyan-400/30';
      default:
        return 'bg-neutral-800 text-neutral-450 hover:bg-neutral-750';
    }
  };

  const getPinStatus = (pinName: string) => {
    const gpioMatch = pinName.match(/GPIO\s+(\d+)/);
    if (!gpioMatch) return null;
    const gpioNum = parseInt(gpioMatch[1], 10);
    return pins.find(p => p.gpio === gpioNum);
  };

  return (
    <div id="esp32-visual-board" className="relative flex flex-col items-center select-none py-6 px-4 bg-[#1C1F2B] rounded-3xl border border-white/5 shadow-inner backdrop-blur-md">
      {/* Wifi & Power Status Bar on the board */}
      <div className="absolute top-4 left-6 right-6 flex justify-between text-[10px] uppercase font-mono tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5 font-bold">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          ESP32-PWR
        </span>
        <span className="flex items-center gap-1.5 font-bold">
          <span className="h-2 w-2 rounded-full bg-cyan-500" />
          Wi-Fi: {wifiMode === 'AP' ? 'A.P.' : 'STATION'}
        </span>
      </div>

      {/* Board Header Container with interactive helper */}
      <div className="mb-4 mt-2 text-center">
        <h3 className="text-sm font-semibold tracking-wide text-white">ESP32 DevKit V1</h3>
        <p className="text-[10px] font-mono text-slate-500 mt-0.5">Clique em uma GPIO para configurar ou controlar</p>
      </div>

      {/* Grid containing Left Rail, Core Chip, and Right Rail */}
      <div className="grid grid-cols-[minmax(80px,1fr)_auto_minmax(80px,1fr)] sm:grid-cols-[140px_130px_140px] items-stretch gap-0.5 sm:gap-1 w-full max-w-[430px] mx-auto text-[10px] font-mono">
        
        {/* LEFT RAIL */}
        <div className="flex flex-col justify-between py-10 pr-0.5 sm:pr-2 border-r border-[#252833]/60">
          {LEFT_PIN_RAIL.map((item) => {
            const status = getPinStatus(item.pin);
            const isSelected = status && selectedGpio === status.gpio;
            const hasGpio = item.pin.startsWith("GPIO");
            
            return (
              <div 
                key={item.pin} 
                className={`flex items-center justify-end gap-1.5 my-0.5 h-6 transition-all duration-150 ${hasGpio ? 'cursor-pointer hover:bg-white/5 rounded-l' : ''}`}
                onMouseEnter={() => setHoveredPin({ pin: item.pin, desc: item.desc })}
                onMouseLeave={() => setHoveredPin(null)}
                onClick={() => {
                  if (hasGpio && onSelectPin) {
                    const match = item.pin.match(/GPIO\s+(\d+)/);
                    if (match) onSelectPin(parseInt(match[1], 10));
                  }
                }}
              >
                <div className="text-right flex flex-col min-w-0 flex-1 px-1">
                  <span className={`font-semibold tracking-tight leading-none text-[8.5px] sm:text-[9.5px] truncate ${status ? 'text-slate-200' : 'text-slate-500'}`}>
                    {status?.customLabel ? status.customLabel : item.pin}
                  </span>
                  {status && (
                    <span className="text-[7.5px] sm:text-[8px] opacity-75 text-slate-400 mt-0.5 scale-90 origin-right truncate">
                      {status.mode === 'DIGITAL_OUTPUT' ? (status.value ? 'ON' : 'OFF') : 
                       status.mode === 'PWM_OUTPUT' ? `PWM ${status.value}` :
                       status.mode === 'ANALOG_INPUT' ? `ADC ${status.value}` : status.mode.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <div className={`w-9 sm:w-14 shrink-0 text-center py-1 rounded text-[7px] sm:text-[8px] font-bold tracking-tighter ${
                  isSelected ? 'ring-2 ring-cyan-500 bg-cyan-600/30 text-white' : 
                  status ? getModeColorClass(status.mode, status.value) : 'bg-[#12141C] border border-white/5 text-slate-500'
                }`}>
                  {item.pin.replace("GPIO ", "G")}
                </div>
              </div>
            );
          })}
        </div>

        {/* CORE CHIP BODY */}
        <div className="relative bg-[#12141C] rounded-xl border border-[#252833] shadow-xl flex flex-col items-center py-4 px-1.5 sm:px-2 my-2 min-h-[360px] sm:min-h-[380px] w-[100px] sm:w-auto mx-auto">
          {/* Microcontroller CPU Module (ESP-WROOM-32) */}
          <div className="w-20 sm:w-24 bg-[#252936] border border-white/5 p-2 rounded-lg flex flex-col items-center mt-3 text-slate-400 text-center shadow-inner">
            <Radio className="w-5 h-5 text-slate-500 animate-pulse mb-1 mt-1" />
            <span className="text-[8px] font-bold text-slate-300">ESP-WROOM-32</span>
            <div className="w-16 h-0.5 bg-[#12141C] my-1 rounded" />
            <Cpu className="w-4 h-4 text-cyan-500/60 mb-0.5" />
            <span className="text-[6px] tracking-tight text-slate-500 font-mono">Dual Core 240MHz</span>
          </div>

          {/* USB Port Detail at the bottom */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-7 bg-[#090A0D] border-t border-x border-[#252833] rounded-t-md flex items-center justify-center">
            <div className="w-6 h-3 bg-[#12141C] border border-[#252833] rounded-sm flex items-center justify-center">
              <span className="text-[5px] text-slate-600 font-bold">USB</span>
            </div>
          </div>

          {/* Active LED Indicators */}
          <div className="flex flex-col gap-2.5 items-center mt-12 w-full">
            {/* Built-in Blue LED (GPIO 2) status */}
            <div className="flex items-center gap-1.5">
              <span className="text-[7px] text-slate-400">LED D2</span>
              {(() => {
                const ledPin = pins.find(p => p.gpio === 2);
                const isOn = ledPin && ledPin.value > 0;
                return (
                  <div className={`w-2.5 h-2.5 rounded-full shadow-md transition-all duration-300 ${isOn ? 'bg-cyan-500 shadow-cyan-500/60 animate-pulse scale-110' : 'bg-neutral-800'}`} />
                );
              })()}
            </div>

            {/* Custom On-board red activity indicator */}
            <div className="flex items-center gap-1.5">
              <span className="text-[7px] text-slate-400 font-mono">STATUS</span>
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 shadow-md animate-pulse shadow-red-500/50" />
            </div>
          </div>

          {/* Central Logo Accents */}
          <div className="mt-8 flex flex-col items-center opacity-35 select-none">
            <Zap className="w-6 h-6 text-yellow-500" />
            <span className="text-[6px] uppercase tracking-widest text-[#252833] font-bold mt-1">SILI-CHIP</span>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="flex flex-col justify-between py-10 pl-0.5 sm:pl-2 border-l border-[#252833]/60">
          {RIGHT_PIN_RAIL.map((item) => {
            const status = getPinStatus(item.pin);
            const isSelected = status && selectedGpio === status.gpio;
            const hasGpio = item.pin.startsWith("GPIO");
            
            return (
              <div 
                key={item.pin} 
                className={`flex items-center justify-start gap-1.5 my-0.5 h-6 transition-all duration-150 ${hasGpio ? 'cursor-pointer hover:bg-white/5 rounded-r' : ''}`}
                onMouseEnter={() => setHoveredPin({ pin: item.pin, desc: item.desc })}
                onMouseLeave={() => setHoveredPin(null)}
                onClick={() => {
                  if (hasGpio && onSelectPin) {
                    const match = item.pin.match(/GPIO\s+(\d+)/);
                    if (match) onSelectPin(parseInt(match[1], 10));
                  }
                }}
              >
                <div className={`w-9 sm:w-14 shrink-0 text-center py-1 rounded text-[7px] sm:text-[8px] font-bold tracking-tighter ${
                  isSelected ? 'ring-2 ring-cyan-500 bg-cyan-600/30 text-white' : 
                  status ? getModeColorClass(status.mode, status.value) : 'bg-[#12141C] border border-white/5 text-slate-500'
                }`}>
                  {item.pin.replace("GPIO ", "G")}
                </div>
                <div className="text-left flex flex-col min-w-0 flex-1 px-1">
                  <span className={`font-semibold tracking-tight leading-none text-[8.5px] sm:text-[9.5px] truncate ${status ? 'text-slate-200' : 'text-slate-500'}`}>
                    {status?.customLabel ? status.customLabel : item.pin}
                  </span>
                  {status && (
                    <span className="text-[7.5px] sm:text-[8px] opacity-75 text-slate-400 mt-0.5 scale-90 origin-left truncate">
                      {status.mode === 'DIGITAL_OUTPUT' ? (status.value ? 'ON' : 'OFF') : 
                       status.mode === 'PWM_OUTPUT' ? `PWM ${status.value}` :
                       status.mode === 'ANALOG_INPUT' ? `ADC ${status.value}` : status.mode.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Floating Info Tooltip */}
      <div className="mt-4 w-full text-center h-5">
        {hoveredPin ? (
          <p className="text-[9.5px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 py-0.5 px-3 rounded-md inline-block">
            <span className="font-bold">{hoveredPin.pin}:</span> {hoveredPin.desc}
          </p>
        ) : (
          <p className="text-[9.5px] text-slate-500 font-mono">
            Passe o mouse ou toque nos pinos para ver o diagrama de pinouts
          </p>
        )}
      </div>

      {/* Mode Legenda */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-neutral-900 w-full text-[8.5px]">
        <div className="flex items-center gap-1 text-emerald-450">
          <span className="w-2 h-2 rounded bg-emerald-500 inline-block" /> Output
        </div>
        <div className="flex items-center gap-1 text-amber-450">
          <span className="w-2 h-2 rounded bg-amber-500 inline-block" /> Input
        </div>
        <div className="flex items-center gap-1 text-purple-450">
          <span className="w-2 h-2 rounded bg-purple-600 inline-block" /> Analog (ADC)
        </div>
        <div className="flex items-center gap-1 text-cyan-450">
          <span className="w-2 h-2 rounded bg-cyan-500 inline-block" /> PWM Reg
        </div>
      </div>
    </div>
  );
}
