export type PinMode = 
  | 'UNUSED' 
  | 'DIGITAL_OUTPUT' 
  | 'DIGITAL_INPUT' 
  | 'ANALOG_INPUT' 
  | 'PWM_OUTPUT'
  | 'SENSOR_WATER_FLOW'
  | 'SENSOR_WATER_EC'
  | 'SENSOR_WATER_PH'
  | 'SENSOR_WATER_LEVEL'
  | 'SENSOR_WATER_TEMP'
  | 'SENSOR_HUMIDITY'
  | 'SENSOR_CO2'
  | 'SENSOR_TEMP';

export interface ESP32Pin {
  gpio: number;          // e.g. 2, 4, 15
  name: string;          // e.g. "GPIO 2"
  alternativeLabel?: string; // e.g. "D2 / LED"
  mode: PinMode;
  customLabel: string;   // e.g. "Lâmpada do Quarto"
  value: number;         // 0 or 1 for digital, 0-4095 for analog (ADC), 0-255 for PWM
  pwmDuty?: number;      // 0-255
  blinkInterval?: number; // ms, 0 for off
  invertLogic?: boolean;
  calibOffset?: number;
  calibMultiplier?: number;
}

export interface ESP32Node {
  ip: string;
  hostname: string;
  isOnline: boolean;
  rssi: number;          // e.g. -65 dBm
  role: 'COORDINATOR' | 'NODE';
  lastSeen: string;
  pinStates: {
    [gpio: number]: {
      mode: PinMode;
      customLabel: string;
      value: number;
    }
  };
}

export interface WiFiSettings {
  ssid: string;
  password?: string;
  mode: 'AP' | 'STA'; // Access Point or Station
  apSsid: string;
  apIp: string;
  staIp?: string;
}

export interface MQTTSettings {
  server: string;
  port: number;
  user: string;
  pass: string;
}

export interface SerialLog {
  timestamp: string;
  source: 'SYSTEM' | 'WIFI' | 'HTTP' | 'GPIO' | 'ERROR';
  message: string;
}
