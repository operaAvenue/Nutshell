import React, { useState } from 'react';
import { ESP32Pin, WiFiSettings, ESP32Node } from '../types';
import { FileCode, Clipboard, Check, BookOpen, AlertTriangle, Cpu, HelpCircle, HardDrive, Terminal } from 'lucide-react';
import OtaUpdate from './OtaUpdate';

interface FirmwareExporterProps {
  pins: ESP32Pin[];
  wifiSettings: WiFiSettings;
  onAddLog: (source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR', message: string) => void;
  nodes: ESP32Node[];
}

export default function FirmwareExporter({ pins, wifiSettings, onAddLog, nodes }: FirmwareExporterProps) {
  const [subTab, setSubTab] = useState<'CODE' | 'OTA'>('CODE');
  const [copied, setCopied] = useState(false);
  const [exportMethod, setExportMethod] = useState<'PROGMEM' | 'LITTLEFS'>('PROGMEM');

  const copyCodeToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    onAddLog('SYSTEM', 'Código C++ copiado para a Área de Transferência.');
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate Arduino C++ code matching dynamically configured pins
  const generateArduinoCode = () => {
    const outputPins = pins.filter(p => p.mode === 'DIGITAL_OUTPUT');
    const inputPins = pins.filter(p => p.mode === 'DIGITAL_INPUT');
    const analogPins = pins.filter(p => p.mode === 'ANALOG_INPUT');
    const pwmPins = pins.filter(p => p.mode === 'PWM_OUTPUT');

    return `/**
 * ESP32 Wi-Fi Control Hub - Firmware Gerado Automaticamente
 * Autor: ESP32 IoT Controller - React Native Web Interface
 * 
 * Dependências requeridas:
 * - Arduino-ESP32 Core
 * - ESPAsyncWebServer (https://github.com/me-no-dev/ESPAsyncWebServer)
 * - AsyncTCP (https://github.com/me-no-dev/AsyncTCP)
 * - ArduinoJson (https://github.com/bblanchon/ArduinoJson)
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>

// Configurações de Wi-Fi
const char* AP_SSID = "${wifiSettings.apSsid || "ESP32_Controler_P2P"}";
const char* AP_PASS = "${wifiSettings.password || "admin_esp_smart"}";
const char* STA_SSID = "${wifiSettings.ssid}";
const char* STA_PASS = "DIGITE_SUA_SENHA_AQUI";

// Definições GLOBAIS de Pinos em Uso
${outputPins.map(p => `const int PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')} = ${p.gpio}; // ${p.customLabel}`).join('\n')}
${inputPins.map(p => `const int PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')} = ${p.gpio}; // Input: ${p.customLabel}`).join('\n')}
${analogPins.map(p => `const int PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')} = ${p.gpio}; // ADC Analog: ${p.customLabel}`).join('\n')}
${pwmPins.map(p => `const int PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')} = ${p.gpio}; // PWM Output: ${p.customLabel}`).join('\n')}

// canais PWM do LED Control (LEDC)
${pwmPins.map((p, idx) => `const int PWM_CHAN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')} = ${idx}; // Canal ${idx}`).join('\n')}

AsyncWebServer server(80);

${exportMethod === 'PROGMEM' ? `
// Interface Web comprimida em PROGMEM (HTML + CSS + JS inline)
// Esse arquivo index_html_gz é enviado diretamente da memória flash
const uint8_t index_html_gz[] PROGMEM = {
  // Código binário do seu App React compactado em gzip
  // Para fins didáticos, as respostas do servidor estão ativas
  // Substitua este array com seu binário ou use o LittleFS.
  0x1f, 0x8b, 0x08, 0x08, 0xbd, 0x5c, 0x4a, 0x5e, 0x00, 0x03, 0x69, 0x6e, 0x64, 0x65, 0x78, 0x2e,
  0x68, 0x74, 0x6d, 0x6c, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff
};
const size_t index_html_gz_len = sizeof(index_html_gz);
` : `
// O arquivo HTML React deve ser armazenado na partição LittleFS
#include <LittleFS.h>
`}

void setup() {
  Serial.begin(115205);
  Serial.println("\\n--- ESP32 IoT Controller Iniciado ---");

  // Configuração dos Pinos
  ${outputPins.map(p => `pinMode(PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}, OUTPUT);\n  digitalWrite(PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}, LOW);`).join('\n  ')}
  ${inputPins.map(p => `pinMode(PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}, INPUT_PULLUP;`).join('\n  ')}
  
  // Setup PWM do ESP32 (LEDC)
  ${pwmPins.map(p => `ledcSetup(PWM_CHAN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}, 5000, 8); // canal, freq 5KHz, res 8 bits\n  ledcAttachPin(PIN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}, PWM_CHAN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')});\n  ledcWrite(PWM_CHAN_${p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}, ${p.value});`).join('\n  ')}

  ${exportMethod === 'LITTLEFS' ? `
  // Inicialização do Sistema de Arquivos
  if(!LittleFS.begin(true)){
    Serial.println("Erro ao montar o LittleFS!");
    return;
  }
  Serial.println("LittleFS montado com sucesso!");
  ` : ''}

  // Estabelecer modo Wi-Fi (Duplo: Access Point + Station)
  WiFi.mode(WIFI_AP_STA);
  
  // 1. Iniciar Access Point Local
  WiFi.softAP(AP_SSID, AP_PASS);
  Serial.print("Access Point Ativo. SSID: ");
  Serial.print(AP_SSID);
  Serial.print(" | IP: ");
  Serial.println(WiFi.softAPIP());

  // 2. Tentar Conexão em Roteador Local
  WiFi.begin(STA_SSID, STA_PASS);
  Serial.print("Suporte Wi-Fi: Conectando a ");
  Serial.println(STA_SSID);
  
  // Tenta por 8 segundos, senão continua em modo Access Point autônomo
  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 16) {
    delay(500);
    Serial.print(".");
    timeout++;
  }
  
  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\\nWi-Fi Conectado!");
    Serial.print("IP na Rede Local: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\\nNão foi possível conectar ao Roteador. Operando apenas em Access Point.");
  }

  // Configuração MDNS para Descoberta na rede local (.local)
  if (!MDNS.begin("esp32-controller")) {
    Serial.println("Erro ao configurar mDNS!");
  } else {
    Serial.println("mDNS iniciado: http://esp32-controller.local");
    MDNS.addService("http", "tcp", 80);
  }

  // ---- ROTAS DA API REST DO DASHBOARD ----

  // ROTA: Obter Status Geral (GET /api/status)
  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request){
    AsyncResponseStream *response = request->beginResponseStream("application/json");
    DynamicJsonDocument doc(1536);
    
    doc["hostname"] = "esp32-controller";
    doc["ip"] = WiFi.localIP().toString();
    doc["rssi"] = WiFi.RSSI();
    doc["wifiMode"] = (WiFi.status() == WL_CONNECTED) ? "STA" : "AP";
    
    JsonArray pinsArray = doc.createNestedArray("pins");
    
    ${pins.filter(p => p.mode !== 'UNUSED').map(p => {
      const isOutput = p.mode === 'DIGITAL_OUTPUT';
      const isInput = p.mode === 'DIGITAL_INPUT';
      const isAnalog = p.mode === 'ANALOG_INPUT';
      const isPwm = p.mode === 'PWM_OUTPUT';
      const safeLabel = p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

      let valGetter = `0`;
      if (isOutput) valGetter = `digitalRead(PIN_${safeLabel})`;
      if (isInput) valGetter = `digitalRead(PIN_${safeLabel})`;
      if (isAnalog) valGetter = `analogRead(PIN_${safeLabel})`;
      if (isPwm) valGetter = `ledcRead(PWM_CHAN_${safeLabel})`;

      return `
    {
      JsonObject p = pinsArray.createNestedObject();
      p["gpio"] = ${p.gpio};
      p["mode"] = "${p.mode}";
      p["customLabel"] = "${p.customLabel}";
      p["value"] = ${valGetter};
    }`;
    }).join('\n    ')}

    serializeJson(doc, *response);
    request->send(response);
  });

  // ROTA: Controle de Saída Digital/PWM (GET /api/toggle)
  server.on("/api/toggle", HTTP_GET, [](AsyncWebServerRequest *request){
    if (request->hasParam("pin") && request->hasParam("val")) {
      int pinNum = request->getParam("pin")->value().toInt();
      int valueNum = request->getParam("val")->value().toInt();
      
      // Valida qual pino alterar
      ${outputPins.map(p => {
        const safeLabel = p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        return `if (pinNum == ${p.gpio}) {
        digitalWrite(PIN_${safeLabel}, valueNum ? HIGH : LOW);
        Serial.printf("GPIO %d alternado para: %d\\n", pinNum, valueNum);
      }`;
      }).join('\n      else ')}
      ${pwmPins.map(p => {
        const safeLabel = p.customLabel.toUpperCase().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
        return `if (pinNum == ${p.gpio}) {
        ledcWrite(PWM_CHAN_${safeLabel}, valueNum);
        Serial.printf("GPIO %d PWM ajustado para: %d\\n", pinNum, valueNum);
      }`;
      }).join('\n      else ')}
      
      request->send(200, "application/json", "{\\"status\\":\\"success\\"}");
    } else {
      request->send(400, "application/json", "{\\"status\\":\\"bad_request\\"}");
    }
  });

  // CORS Headers para permitir controle distribuído mDNS P2P direto
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Origin", "*");
  DefaultHeaders::Instance().addHeader("Access-Control-Allow-Headers", "*");

  // --- SERVIR INTERFACE REACT ---
  ${exportMethod === 'PROGMEM' ? `
  // Servir SPA React compactada diretamente da Flash (PROGMEM)
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse_P(200, "text/html", index_html_gz, index_html_gz_len);
    response->addHeader("Content-Encoding", "gzip");
    request->send(response);
  });
  ` : `
  // Servir arquivos estáticos do LittleFS
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");
  `}

  server.begin();
  Serial.println("Servidor Web HTTP ativo na Porta 80!");
}

void loop() {
  delay(1);
}
`;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-Tab Navigation Bar */}
      <div className="flex glass-panel p-1.5 rounded-2xl border border-white/5 shadow-inner w-full max-w-sm md:max-w-md mx-auto mb-1">
        <button
          type="button"
          onClick={() => setSubTab('CODE')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            subTab === 'CODE'
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span>Esquemas & Código</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('OTA')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            subTab === 'OTA'
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Cpu className="w-4 h-4 animate-pulse" />
          <span>Atualização OTA (Simulador)</span>
        </button>
      </div>

      {subTab === 'CODE' ? (
        <>
          {/* Introduction Card */}
          <div className="glass-card p-5 rounded-3xl border border-white/5 shadow-inner backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">Como instalar no ESP32</h4>
            </div>
            <p className="text-neutral-400 text-xs leading-relaxed max-w-2xl">
              Como este app React é focado em <strong className="text-neutral-200">baixo consumo de memória</strong>, ele pode ser gravado inteiramente no ESP32. Quando o seu ESP32 inicializa em modo Wi-Fi, ele cria a sua rede ou se conecta ao roteador, servindo esta mesma página aos celulares e computadores conectados na mesma rede local!
            </p>

            {/* Steps Guide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-5">
              <div className="glass-panel p-3.5 rounded-2xl border border-white/5 shadow-inner">
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-[#252936] border border-white/5 rounded-lg text-cyan-400">PASSO 1</span>
                <h5 className="font-bold text-[11px] text-slate-200 mt-2">Compilar a Interface</h5>
                <p className="text-[9.5px] text-slate-500 mt-1 leading-normal">
                  Execute <code className="glass-card text-slate-400 px-1 py-0.5 rounded">npm run build</code> para gerar arquivos unificados de baixo footprint na pasta <code className="text-slate-400">dist/</code>.
                </p>
              </div>
              <div className="glass-panel p-3.5 rounded-2xl border border-white/5 shadow-inner">
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-[#252936] border border-white/5 rounded-lg text-cyan-400">PASSO 2</span>
                <h5 className="font-bold text-[11px] text-slate-200 mt-2">Gzip & Preparação</h5>
                <p className="text-[9.5px] text-slate-550 mt-1 leading-normal">
                  Comprima o HTML buildado para <code className="text-slate-450 font-mono">.gz</code>. Isso reduz seu peso para cerca de <strong className="text-cyan-400 font-bold">22KB</strong>, ocupando pouquíssimo espaço!
                </p>
              </div>
              <div className="glass-panel p-3.5 rounded-2xl border border-white/5 shadow-inner">
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-[#252936] border border-white/5 rounded-lg text-cyan-400">PASSO 3</span>
                <h5 className="font-bold text-[11px] text-slate-200 mt-2">Gravação Arduino</h5>
                <p className="text-[9.5px] text-slate-500 mt-1 leading-normal">
                  Copie o código C++ abaixo e faça o upload no seu ESP32 usando a IDE clássica ou VSCode PlatformIO.
                </p>
              </div>
            </div>
          </div>

          {/* Code exporter container */}
          <div className="glass-card p-5 rounded-3xl border border-white/5 flex flex-col shadow-inner">
            <div className="flex justify-between items-center pb-3 border-b border-[#252833]/60 mb-4 flex-wrap gap-2">
              {/* Tabs for select flashing architecture */}
              <div className="flex items-center gap-3">
                <FileCode className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mr-2">Código Firmware Arduino</h4>
                
                <div className="flex glass-panel p-1 rounded-xl border border-white/5">
                  <button 
                    type="button"
                    onClick={() => setExportMethod('PROGMEM')}
                    className={`text-[9.5px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer ${exportMethod === 'PROGMEM' ? 'bg-cyan-500 text-slate-950 font-mono font-bold' : 'text-slate-500 hover:text-slate-350'}`}
                  >
                    PROGMEM (Inline Flash)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setExportMethod('LITTLEFS')}
                    className={`text-[9.5px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer ${exportMethod === 'LITTLEFS' ? 'bg-cyan-500 text-slate-950 font-mono font-bold' : 'text-slate-500 hover:text-slate-355'}`}
                  >
                    LittleFS Partition
                  </button>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => copyCodeToClipboard(generateArduinoCode())}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10.5px] font-bold glass-panel hover:bg-[#252936] border border-white/5 hover:border-slate-700 text-slate-300 transition-all active:scale-95 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5 text-cyan-400" />}
                {copied ? 'Copiado!' : 'Copiar C++'}
              </button>
            </div>

            {/* Warning panel about mDNS and CORS */}
            <div className="mb-4 flex items-start gap-2.5 bg-yellow-950/10 border border-yellow-800/30 p-3 rounded-2xl">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-yellow-500 font-mono">DICA DE ARQUITETURA MULTI-NÓ (P2P Wi-Fi)</span>
                <p className="text-[9px] text-slate-400 leading-relaxed font-mono">
                  O firmware gerado habilita automaticamente os cabeçalhos de <strong className="text-slate-300">CORS (*)</strong> para o ESPAsyncWebServer. Isso possibilita que os nós troquem dados diretamente em chamadas AJAX transparentes no navegador dos usuários, descobrindo uns aos outros nativamente no Wi-Fi sem a necessidade de um servidor de nuvem externo!
                </p>
              </div>
            </div>

            {/* Code display window */}
            <div className="relative glass-panel rounded-2xl border border-white/5 max-h-[380px] overflow-auto shadow-inner">
              <pre className="p-4 text-[10px] font-mono text-slate-400 leading-normal whitespace-pre selection:bg-cyan-500 selection:text-slate-950">
                {generateArduinoCode()}
              </pre>
            </div>

            <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-3">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3 text-cyan-500 animate-pulse" />
                Configuração Dinâmica baseada nos pinos em uso
              </span>
              <span>BaudRate sugerido: 115200 bps</span>
            </div>
          </div>
        </>
      ) : (
        <OtaUpdate nodes={nodes} onAddLog={onAddLog} />
      )}
    </div>
  );
}
