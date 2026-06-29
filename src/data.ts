import { ESP32Pin, ESP32Node, WiFiSettings } from './types';

export const INITIAL_PINS: ESP32Pin[] = [];

export const INITIAL_NODES: ESP32Node[] = [];

export const AVAILABLE_GPIOS = [
  2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 39
];

export const DEFAULT_WIFI_SETTINGS: WiFiSettings = {
  ssid: "ESP32-Smart-Network",
  password: "admin_esp_smart",
  mode: "AP",
  apSsid: "ESP32_Controler_P2P",
  apIp: "192.168.4.1",
  staIp: "192.168.1.100",
  role: "principal",
  servoIndex: 1
};

export const LEFT_PIN_RAIL = [
  { pin: "EN", desc: "Reset" },
  { pin: "GPIO 36", desc: "VP / ADC1_CH0" },
  { pin: "GPIO 39", desc: "VN / ADC1_CH3" },
  { pin: "GPIO 34", desc: "ADC1_CH6" },
  { pin: "GPIO 35", desc: "ADC1_CH7" },
  { pin: "GPIO 32", desc: "ADC1_CH4 / TOUCH9" },
  { pin: "GPIO 33", desc: "ADC1_CH5 / TOUCH8" },
  { pin: "GPIO 25", desc: "DAC1" },
  { pin: "GPIO 26", desc: "DAC2" },
  { pin: "GPIO 27", desc: "ADC2_CH7" },
  { pin: "GPIO 14", desc: "ADC2_CH6 / HSPI" },
  { pin: "GPIO 12", desc: "ADC2_CH5 / HSPI" },
  { pin: "GPIO 13", desc: "ADC2_CH4 / HSPI" },
  { pin: "GND", desc: "Ground" },
  { pin: "VIN", desc: "Power 5V In" }
];

export const RIGHT_PIN_RAIL = [
  { pin: "GPIO 23", desc: "VSPI MOSI" },
  { pin: "GPIO 22", desc: "I2C SCL" },
  { pin: "TX0", desc: "GPIO 1 / UART TX" },
  { pin: "RX0", desc: "GPIO 3 / UART RX" },
  { pin: "GPIO 21", desc: "I2C SDA" },
  { pin: "GPIO 19", desc: "VSPI MISO" },
  { pin: "GPIO 18", desc: "VSPI SCK" },
  { pin: "GPIO 5", desc: "VSPI CS" },
  { pin: "GPIO 17", desc: "TX2 / UART2 TX" },
  { pin: "GPIO 16", desc: "RX2 / UART2 RX" },
  { pin: "GPIO 4", desc: "ADC2_CH0 / TOUCH0" },
  { pin: "GPIO 2", desc: "ADC2_CH2 / Onboard LED" },
  { pin: "GPIO 15", desc: "ADC2_CH3 / HSPI CS" },
  { pin: "GND", desc: "Ground" },
  { pin: "3V3", desc: "Power 3.3V Out" }
];
