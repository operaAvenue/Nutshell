#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <AsyncJson.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <vector>
#include <HTTPUpdate.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <ESPmDNS.h>

#define FIRMWARE_VERSION "v1.0.4"

// Default network credentials
const char* DEFAULT_WIFI_SSID = "";
const char* DEFAULT_WIFI_PASS = "";

// Access Point credentials (fallback)
const char* AP_SSID = "ESP32-Dashboard";
const char* AP_PASS = "12345678"; // Min 8 characters

AsyncWebServer server(80);
Preferences preferences;

WiFiClient espClient;
PubSubClient mqttClient(espClient);
unsigned long lastMqttReconnectAttempt = 0;
unsigned long lastSensorPublishTime = 0;
String mqttServer = "";
int mqttPort = 1883;
String mqttUser = "";
String mqttPass = "";
String macStr = "";
String deviceHostname = "nutshell";

bool shouldRestart = false;
unsigned long restartTime = 0;

bool shouldUpdateOta = false;
String otaFirmwareUrl = "";
String otaFsUrl = "";

bool autoUpdateEnabled = false;
unsigned long lastAutoUpdateCheck = 0;
const unsigned long AUTO_UPDATE_INTERVAL = 12 * 60 * 60 * 1000; // 12 horas

bool ddnsEnabled = false;
String ddnsDomain = "";
String ddnsToken = "";
int ddnsExternalPort = 80;
unsigned long lastDdnsUpdate = 0;
const unsigned long DDNS_INTERVAL = 600000; // 10 minutes
bool pendingDdnsSave = false;
String globalAdminPass = "admin";

struct DdnsTemp {
  bool received = false;
  bool error = false;
  String errStr = "";
  bool enabled = false;
  String domain = "";
  String token = "";
  int port = 80;
} ddnsTemp;

struct PinState {
  int gpio;
  String name;
  String mode;
  String customLabel;
  int value;
  bool invertLogic;
  float calibOffset;
  float calibMultiplier;
  bool isSimulated;
  String cameraUrl;
  std::vector<int> linkedPins;
  bool timerEnabled;
  int timerDurationOn;
  int timerDurationOff;
  String timerWindowStart;
  String timerWindowEnd;
  unsigned long lastTimerToggle;
  bool currentTimerState;
};

std::vector<PinState> pins;

void savePinsToNVS() {
  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  for (const auto& p : pins) {
    JsonObject obj = arr.add<JsonObject>();
    obj["gpio"] = p.gpio;
    obj["name"] = p.name;
    obj["mode"] = p.mode;
    obj["customLabel"] = p.customLabel;
    obj["value"] = p.value;
    obj["invertLogic"] = p.invertLogic;
    obj["calibOffset"] = p.calibOffset;
    obj["calibMultiplier"] = p.calibMultiplier;
    obj["isSimulated"] = p.isSimulated;
    obj["cameraUrl"] = p.cameraUrl;
    JsonArray linkedArr = obj["linkedPins"].to<JsonArray>();
    for (int lPin : p.linkedPins) {
      linkedArr.add(lPin);
    }
    if (p.mode == "VIRTUAL_BOOLEAN") {
      obj["timerEnabled"] = p.timerEnabled;
      obj["timerDurationOn"] = p.timerDurationOn;
      obj["timerDurationOff"] = p.timerDurationOff;
      obj["timerWindowStart"] = p.timerWindowStart;
      obj["timerWindowEnd"] = p.timerWindowEnd;
    }
  }
  String jsonString;
  serializeJson(doc, jsonString);
  preferences.begin("gpios", false);
  preferences.putString("config", jsonString);
  preferences.end();
}

void loadPinsFromNVS() {
  preferences.begin("gpios", true);
  String jsonString = preferences.getString("config", "[]");
  preferences.end();
  
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, jsonString);
  if (!error && doc.is<JsonArray>()) {
    JsonArray arr = doc.as<JsonArray>();
    pins.clear();
    for (JsonObject obj : arr) {
      PinState p;
      p.gpio = obj["gpio"].as<int>();
      p.name = obj["name"].as<String>();
      p.mode = obj["mode"].as<String>();
      p.customLabel = obj["customLabel"].as<String>();
      p.value = obj["value"].as<int>();
      p.invertLogic = obj["invertLogic"] | false;
      p.calibOffset = obj["calibOffset"] | 0.0f;
      p.calibMultiplier = obj["calibMultiplier"] | 1.0f;
      p.isSimulated = obj["isSimulated"] | false;
      p.cameraUrl = obj["cameraUrl"] | "";
      p.linkedPins.clear();
      if (obj.containsKey("linkedPins") && obj["linkedPins"].is<JsonArray>()) {
        for (int lPin : obj["linkedPins"].as<JsonArray>()) {
          p.linkedPins.push_back(lPin);
        }
      }
      if (p.mode == "VIRTUAL_BOOLEAN") {
        p.timerEnabled = obj["timerEnabled"] | false;
        p.timerDurationOn = obj["timerDurationOn"] | 0;
        p.timerDurationOff = obj["timerDurationOff"] | 0;
        p.timerWindowStart = obj["timerWindowStart"] | "";
        p.timerWindowEnd = obj["timerWindowEnd"] | "";
      } else {
        p.timerEnabled = false;
        p.timerDurationOn = 0;
        p.timerDurationOff = 0;
        p.timerWindowStart = "";
        p.timerWindowEnd = "";
      }
      p.lastTimerToggle = 0;
      p.currentTimerState = false;
      pins.push_back(p);
    }
  }
}

void saveDdnsConfig() {
  preferences.begin("ddns", false);
  preferences.putBool("enabled", ddnsEnabled);
  preferences.putString("domain", ddnsDomain);
  preferences.putString("token", ddnsToken);
  preferences.putInt("port", ddnsExternalPort);
  preferences.end();
}

void loadDdnsConfig() {
  preferences.begin("ddns", true);
  ddnsEnabled = preferences.getBool("enabled", false);
  ddnsDomain = preferences.getString("domain", "");
  ddnsToken = preferences.getString("token", "");
  ddnsExternalPort = preferences.getInt("port", 80);
  preferences.end();
}

String getSlug(String name) {
  if (name == "") return "";
  String slug = "";
  for (size_t i = 0; i < name.length(); i++) {
    char c = name[i];
    if (isalnum(c)) {
      slug += (char)tolower(c);
    } else if (c == ' ' || c == '-' || c == '_') {
      slug += '_';
    }
  }
  // Remove duplicate underscores
  String cleanSlug = "";
  bool lastWasUnderscore = false;
  for (size_t i = 0; i < slug.length(); i++) {
    if (slug[i] == '_') {
      if (!lastWasUnderscore) {
        cleanSlug += '_';
        lastWasUnderscore = true;
      }
    } else {
      cleanSlug += slug[i];
      lastWasUnderscore = false;
    }
  }
  // Trim leading/trailing underscores
  if (cleanSlug.startsWith("_")) cleanSlug = cleanSlug.substring(1);
  if (cleanSlug.endsWith("_")) cleanSlug = cleanSlug.substring(0, cleanSlug.length() - 1);
  return cleanSlug;
}

String getPinStateTopic(int gpio) {
  for (auto& p : pins) {
    if (p.gpio == gpio) {
      String nameSlug = getSlug(p.customLabel);
      String pinId = (nameSlug != "") ? (nameSlug + "_" + String(gpio)) : ("gpio" + String(gpio));
      return "openagro/" + deviceHostname + "/" + pinId + "/state";
    }
  }
  return "openagro/" + deviceHostname + "/gpio" + String(gpio) + "/state";
}

void publishAutoDiscovery() {
  if (!mqttClient.connected()) return;
  for (auto& p : pins) {
    JsonDocument doc;
    String component = "";
    String nameSlug = getSlug(p.customLabel);
    String pinId = (nameSlug != "") ? (nameSlug + "_" + String(p.gpio)) : ("gpio" + String(p.gpio));
    String topicPrefix = "openagro/" + deviceHostname + "/" + pinId;
    String discoveryTopic = "";

    JsonObject dev = doc["device"].to<JsonObject>();
    dev["identifiers"].add(macStr);
    dev["name"] = "openAgro - " + deviceHostname;
    dev["manufacturer"] = "openAgro";

    doc["name"] = p.customLabel != "" ? p.customLabel : ("Pin " + String(p.gpio));
    doc["unique_id"] = macStr + "_gpio" + String(p.gpio);

    if (p.mode == "DIGITAL_OUTPUT") {
      component = "switch";
      doc["command_topic"] = topicPrefix + "/set";
      doc["state_topic"] = topicPrefix + "/state";
      doc["payload_on"] = "ON";
      doc["payload_off"] = "OFF";
      mqttClient.subscribe((topicPrefix + "/set").c_str());
    } else if (p.mode.startsWith("SENSOR_") || p.mode == "ANALOG_INPUT") {
      component = "sensor";
      doc["state_topic"] = topicPrefix + "/state";
      if (p.mode == "SENSOR_PH") { doc["unit_of_measurement"] = "pH"; }
      else if (p.mode == "SENSOR_TEMPERATURE" || p.mode == "SENSOR_WATER_TEMP") { doc["unit_of_measurement"] = "°C"; doc["device_class"] = "temperature"; }
      else if (p.mode == "SENSOR_HUMIDITY") { doc["unit_of_measurement"] = "%"; doc["device_class"] = "humidity"; }
    } else if (p.mode == "DIGITAL_INPUT") {
      component = "binary_sensor";
      doc["state_topic"] = topicPrefix + "/state";
      doc["payload_on"] = "ON";
      doc["payload_off"] = "OFF";
    }

    if (component != "") {
      discoveryTopic = "homeassistant/" + component + "/openagro_" + macStr + "/gpio" + String(p.gpio) + "/config";
      String payload;
      serializeJson(doc, payload);
      mqttClient.publish(discoveryTopic.c_str(), payload.c_str(), true);
      
      if (component == "switch" || component == "binary_sensor") {
        String stateStr = p.value ? "ON" : "OFF";
        mqttClient.publish((topicPrefix + "/state").c_str(), stateStr.c_str(), true);
      } else if (component == "sensor") {
        mqttClient.publish((topicPrefix + "/state").c_str(), String(p.value).c_str(), true);
      }
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String msg = "";
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  
  String expectedPrefix = "openagro/" + deviceHostname + "/";
  if (topicStr.startsWith(expectedPrefix) && topicStr.endsWith("/set")) {
    int pinIdStart = expectedPrefix.length();
    int pinIdEnd = topicStr.lastIndexOf("/set");
    String pinId = topicStr.substring(pinIdStart, pinIdEnd);
    
    for (auto& p : pins) {
      String nameSlug = getSlug(p.customLabel);
      String currentPinId = (nameSlug != "") ? (nameSlug + "_" + String(p.gpio)) : ("gpio" + String(p.gpio));
      if (currentPinId == pinId) {
        if (p.mode == "DIGITAL_OUTPUT") {
          int valueNum = (msg == "ON") ? 1 : 0;
          p.value = valueNum;
          int physicalVal = p.invertLogic ? !valueNum : valueNum;
          digitalWrite(p.gpio, physicalVal);
          savePinsToNVS();
          
          String stateTopic = getPinStateTopic(p.gpio);
          mqttClient.publish(stateTopic.c_str(), valueNum ? "ON" : "OFF", true);
        }
        break;
      }
    }
  }
}

void setupPins() {
  loadPinsFromNVS();
  for (auto& p : pins) {
    if (p.mode == "DIGITAL_OUTPUT") {
      pinMode(p.gpio, OUTPUT);
      int physicalVal = p.invertLogic ? !p.value : p.value;
      digitalWrite(p.gpio, physicalVal);
    } else if (p.mode == "PWM_OUTPUT") {
      ledcAttach(p.gpio, 5000, 8);
      ledcWrite(p.gpio, p.value);
    } else if (p.mode == "ANALOG_INPUT" || p.mode.startsWith("SENSOR_")) {
      pinMode(p.gpio, INPUT);
    } else if (p.mode == "DIGITAL_INPUT") {
      pinMode(p.gpio, INPUT);
    }
  }
}

void setupWiFi() {
  preferences.begin("wifi", true);
  String ssid = preferences.getString("ssid", DEFAULT_WIFI_SSID);
  String pass = preferences.getString("pass", DEFAULT_WIFI_PASS);
  String role = preferences.getString("role", "principal");
  int servoIndex = preferences.getInt("servo_index", 1);
  preferences.end();

  String apSsid = "Nutshell-Setup";
  if (role == "servo") {
    char indexStr[16];
    sprintf(indexStr, "%03d", servoIndex);
    deviceHostname = "melkweg" + String(indexStr);
    apSsid = "Melkweg" + String(indexStr) + "-Setup";
  } else {
    deviceHostname = "nutshell";
    apSsid = "Nutshell-Setup";
  }

  WiFi.setHostname(deviceHostname.c_str());

  // If the SSID is empty or the default placeholder, do not connect to STA
  if (ssid == "" || ssid == "YOUR_WIFI_SSID") {
    Serial.println("No WiFi credentials configured. Starting AP mode only.");
    WiFi.disconnect(true, true); // Erase SDK cached credentials to prevent auto-reconnection
    WiFi.mode(WIFI_AP);
    WiFi.softAP(apSsid.c_str(), AP_PASS);
    Serial.print("AP SSID: ");
    Serial.println(apSsid);
    Serial.print("AP IP Address: ");
    Serial.println(WiFi.softAPIP());
  } else {
    // Start in AP_STA mode so we have a fallback AP while trying to connect
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(apSsid.c_str(), AP_PASS);

    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.print("Connecting to WiFi: ");
    Serial.println(ssid);
    
    int retries = 0;
    // Wait up to 15 seconds for initial connection
    while (WiFi.status() != WL_CONNECTED && retries < 30) {
      delay(500);
      Serial.print(".");
      retries++;
    }
    
    Serial.println();
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Connected to WiFi!");
      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());
      // NTP Setup
      configTime(-3 * 3600, 0, "pool.ntp.org", "time.nist.gov");
      // Disable AP since we successfully connected
      WiFi.mode(WIFI_STA);
    } else {
      Serial.println("Failed to connect to WiFi quickly. Continuing in AP_STA mode to allow reconfiguration.");
      Serial.print("AP SSID: ");
      Serial.println(apSsid);
      Serial.print("AP IP Address: ");
      Serial.println(WiFi.softAPIP());
    }
  }
}

bool checkAuth(AsyncWebServerRequest *request) {
  if (request->hasHeader("Authorization")) {
    String authHeader = request->header("Authorization");
    if (authHeader.startsWith("Bearer ")) {
      String token = authHeader.substring(7);
      if (token == globalAdminPass) return true;
    }
  }
  return false;
}

bool isTimeInWindow(const String& startStr, const String& endStr) {
  if (startStr.length() < 5 || endStr.length() < 5) return true;
  struct tm timeinfo;
  if(!getLocalTime(&timeinfo)){
    return true;
  }
  int currentMins = timeinfo.tm_hour * 60 + timeinfo.tm_min;
  int startMins = startStr.substring(0,2).toInt() * 60 + startStr.substring(3,5).toInt();
  int endMins = endStr.substring(0,2).toInt() * 60 + endStr.substring(3,5).toInt();

  if (startMins <= endMins) {
    return currentMins >= startMins && currentMins <= endMins;
  } else {
    return currentMins >= startMins || currentMins <= endMins;
  }
}

void setup() {
  Serial.begin(115200);
  
  if(!LittleFS.begin(true)){
    Serial.println("An Error has occurred while mounting LittleFS");
    return;
  }
  
  preferences.begin("auth", true);
  globalAdminPass = preferences.getString("pass", "admin");
  preferences.end();

  setupPins();
  
  setupWiFi();
  
  if (!MDNS.begin(deviceHostname.c_str())) {
    Serial.println("Error setting up MDNS responder!");
  } else {
    Serial.printf("mDNS responder started: %s.local\n", deviceHostname.c_str());
    MDNS.addService("http", "tcp", 80);
  }

  macStr = WiFi.macAddress();
  macStr.replace(":", "");
  
  preferences.begin("mqtt", true);
  mqttServer = preferences.getString("server", "");
  mqttPort = preferences.getInt("port", 1883);
  mqttUser = preferences.getString("user", "");
  mqttPass = preferences.getString("pass", "");
  preferences.end();
  
  if (mqttServer != "") {
    mqttClient.setServer(mqttServer.c_str(), mqttPort);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(1024); // Necessário para enviar os JSONs grandes do HA Auto-Discovery
  }

  preferences.begin("ota", true);
  autoUpdateEnabled = preferences.getBool("autoUpdate", false);
  preferences.end();

  loadDdnsConfig();

  // CORS handlers for OPTIONS preflight
  server.on("/api/pins", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });
  
  server.on("/api/pins/reorder", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });
  
  server.on("/api/wifi", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  server.on("/api/mqtt", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  server.on("/api/ddns", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  server.on("/api/auth", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  server.on("/api/version", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  server.on("/api/update", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  // Route: POST /api/auth
  server.on("/api/auth", HTTP_POST, [](AsyncWebServerRequest *request){
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      JsonDocument doc;
      if(!deserializeJson(doc, data, len)) {
         if(doc.containsKey("pass")) {
            String attempt = doc["pass"].as<String>();
            if (attempt == globalAdminPass) {
               AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\",\"token\":\"" + globalAdminPass + "\"}");
               response->addHeader("Access-Control-Allow-Origin", "*");
               request->send(response);
            } else {
               AsyncWebServerResponse *response = request->beginResponse(401, "application/json", "{\"error\":\"Invalid password\"}");
               response->addHeader("Access-Control-Allow-Origin", "*");
               request->send(response);
            }
         } else {
            request->send(400, "application/json", "{\"error\":\"Missing pass\"}");
         }
      } else {
         request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      }
    }
  });

  // Route: /api/status
  server.on("/api/status", HTTP_GET, [](AsyncWebServerRequest *request){
    JsonDocument doc;
    doc["hostname"] = "esp32-native";
    doc["ssid"] = WiFi.SSID();
    doc["hostname"] = WiFi.getHostname();
    doc["ip"] = WiFi.localIP().toString();
    doc["heap"] = ESP.getFreeHeap();
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["wifiMode"] = (WiFi.getMode() == WIFI_AP) ? "AP" : "STA";
    
    // Injetar DDNS no status
    JsonObject ddnsObj = doc["ddns"].to<JsonObject>();
    ddnsObj["enabled"] = ddnsEnabled;
    ddnsObj["domain"] = ddnsDomain;
    ddnsObj["token"] = ddnsToken;
    ddnsObj["port"] = ddnsExternalPort;
    
    preferences.begin("wifi", true);
    doc["ssid"] = preferences.getString("ssid", DEFAULT_WIFI_SSID);
    doc["role"] = preferences.getString("role", "principal");
    doc["servoIndex"] = preferences.getInt("servo_index", 1);
    preferences.end();
    
    JsonArray pinsArray = doc["pins"].to<JsonArray>();
    for (size_t i = 0; i < pins.size(); i++) {
      JsonObject pObj = pinsArray.add<JsonObject>();
      pObj["gpio"] = pins[i].gpio;
      pObj["name"] = pins[i].name;
      pObj["mode"] = pins[i].mode;
      pObj["value"] = pins[i].value;
      pObj["customLabel"] = pins[i].customLabel;
      pObj["invertLogic"] = pins[i].invertLogic;
      pObj["calibOffset"] = pins[i].calibOffset;
      pObj["calibMultiplier"] = pins[i].calibMultiplier;
      pObj["isSimulated"] = pins[i].isSimulated;
      pObj["cameraUrl"] = pins[i].cameraUrl;
      JsonArray linkedArr = pObj["linkedPins"].to<JsonArray>();
      for (int lPin : pins[i].linkedPins) {
        linkedArr.add(lPin);
      }
      if (pins[i].mode == "VIRTUAL_BOOLEAN") {
        pObj["timerEnabled"] = pins[i].timerEnabled;
        pObj["timerDurationOn"] = pins[i].timerDurationOn;
        pObj["timerDurationOff"] = pins[i].timerDurationOff;
        pObj["timerWindowStart"] = pins[i].timerWindowStart;
        pObj["timerWindowEnd"] = pins[i].timerWindowEnd;
      }
      
      // Update values for inputs
      if (pins[i].mode == "ANALOG_INPUT" || pins[i].mode.startsWith("SENSOR_")) {
        pins[i].value = analogRead(pins[i].gpio);
      } else if (pins[i].mode == "DIGITAL_INPUT") {
        int phys = digitalRead(pins[i].gpio);
        pins[i].value = pins[i].invertLogic ? !phys : phys;
      }
      
      pObj["value"] = pins[i].value;
    }
    
    String responseStr;
    serializeJson(doc, responseStr);
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", responseStr);
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  });

  // Route: /api/toggle
  server.on("/api/toggle", HTTP_GET, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response;
    if(request->hasParam("pin") && request->hasParam("val")){
      int pinGpio = request->getParam("pin")->value().toInt();
      int valueNum = request->getParam("val")->value().toInt();
      
      bool found = false;
      for (size_t i = 0; i < pins.size(); i++) {
        if (pins[i].gpio == pinGpio) {
          pins[i].value = valueNum;
          if (pins[i].mode == "DIGITAL_OUTPUT") {
            int physicalVal = pins[i].invertLogic ? !valueNum : valueNum;
            digitalWrite(pinGpio, physicalVal);
          } else if (pins[i].mode == "PWM_OUTPUT") {
            ledcWrite(pinGpio, valueNum);
          } else if (pins[i].mode == "VIRTUAL_BOOLEAN") {
            bool shouldToggleChildren = true;
            if (pins[i].timerEnabled && valueNum == 1) {
              shouldToggleChildren = false;
            }
            if (shouldToggleChildren) {
              for (int lPin : pins[i].linkedPins) {
                for (size_t j = 0; j < pins.size(); j++) {
                  if (pins[j].gpio == lPin && (pins[j].mode == "DIGITAL_OUTPUT" || pins[j].mode == "PWM_OUTPUT")) {
                    pins[j].value = valueNum;
                    if (pins[j].mode == "DIGITAL_OUTPUT") {
                      int physicalVal = pins[j].invertLogic ? !valueNum : valueNum;
                      digitalWrite(lPin, physicalVal);
                    } else if (pins[j].mode == "PWM_OUTPUT") {
                      ledcWrite(lPin, valueNum);
                    }
                    
                    if (mqttClient.connected()) {
                      String subStateTopic = getPinStateTopic(lPin);
                      mqttClient.publish(subStateTopic.c_str(), valueNum ? "ON" : "OFF", true);
                    }
                    break;
                  }
                }
              }
            }
          }
          
          // Save the state change to NVS so it persists across reboots
          savePinsToNVS();
          
          if (mqttClient.connected()) {
             String stateTopic = getPinStateTopic(pinGpio);
             mqttClient.publish(stateTopic.c_str(), valueNum ? "ON" : "OFF", true);
          }
          
          JsonDocument doc;
          doc["status"] = "success";
          doc["pin"] = pinGpio;
          doc["val"] = valueNum;
          String responseStr;
          serializeJson(doc, responseStr);
          response = request->beginResponse(200, "application/json", responseStr);
          found = true;
          break;
        }
      }
      if(!found){
        response = request->beginResponse(404, "application/json", "{\"error\":\"Pin not configured\"}");
      }
    } else {
      response = request->beginResponse(400, "application/json", "{\"error\":\"Missing params\"}");
    }
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  });

  // Route: DELETE /api/pins
  // Route: POST /api/pins/reorder
  server.on("/api/pins/reorder", HTTP_POST, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response;
    if (request->_tempObject) {
      response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
    } else {
      response = request->beginResponse(400, "application/json", "{\"error\":\"Failed\"}");
    }
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      request->_tempObject = NULL;
      if (!checkAuth(request)) {
        return;
      }
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, data, len);
      if(!error && doc.is<JsonArray>()) {
        std::vector<PinState> newOrder;
        JsonArray arr = doc.as<JsonArray>();
        for (int gpio : arr) {
          for (auto& p : pins) {
            if (p.gpio == gpio) {
              newOrder.push_back(p);
              break;
            }
          }
        }
        // If some pins were missing in the request, add them at the end
        for (auto& p : pins) {
          bool found = false;
          for (auto& newP : newOrder) {
            if (newP.gpio == p.gpio) { found = true; break; }
          }
          if (!found) {
            newOrder.push_back(p);
          }
        }
        pins = newOrder;
        savePinsToNVS();
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
      } else {
        request->send(400, "application/json", "{\"error\":\"Invalid JSON array\"}");
      }
    }
  });

  server.on("/api/pins", HTTP_DELETE, [](AsyncWebServerRequest *request){
    if (!checkAuth(request)) {
      request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
      return;
    }
    AsyncWebServerResponse *response;
    if(request->hasParam("gpio")){
      int pinGpio = request->getParam("gpio")->value().toInt();
      bool found = false;
      for (auto it = pins.begin(); it != pins.end(); ++it) {
        if (it->gpio == pinGpio) {
          // Restore to safe state
          if (it->mode == "DIGITAL_OUTPUT" || it->mode == "PWM_OUTPUT") {
             pinMode(it->gpio, INPUT); // Default to safe input
          }
          pins.erase(it);
          savePinsToNVS();
          found = true;
          break;
        }
      }
      if (found) {
        response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
      } else {
        response = request->beginResponse(404, "application/json", "{\"error\":\"Pin not found\"}");
      }
    } else {
      response = request->beginResponse(400, "application/json", "{\"error\":\"Missing gpio param\"}");
    }
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  });

  // Route: POST /api/pins
  server.on("/api/pins", HTTP_POST, [](AsyncWebServerRequest *request){
    // Request handled in body callback
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) { // Small payloads fit in one chunk
      if (!checkAuth(request)) {
        request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
      }
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, data, len);
      if(!error) {
        if(doc.containsKey("gpio") && doc.containsKey("mode")) {
          int gpio = doc["gpio"].as<int>();
          String name = doc["name"].as<String>();
          String mode = doc["mode"].as<String>();
          String customLabel = doc["customLabel"].as<String>();
          int value = doc["value"] | 0;
          bool invertLogic = doc["invertLogic"] | false;
          float calibOffset = doc["calibOffset"] | 0.0f;
          float calibMultiplier = doc["calibMultiplier"] | 1.0f;
          bool isSimulated = doc["isSimulated"] | false;
          String cameraUrl = doc["cameraUrl"] | "";
          std::vector<int> reqLinkedPins;
          if (doc.containsKey("linkedPins") && doc["linkedPins"].is<JsonArray>()) {
            for (int lPin : doc["linkedPins"].as<JsonArray>()) {
              reqLinkedPins.push_back(lPin);
            }
          }
          bool timerEnabled = doc["timerEnabled"] | false;
          int timerDurationOn = doc["timerDurationOn"] | 0;
          int timerDurationOff = doc["timerDurationOff"] | 0;
          String timerWindowStart = doc["timerWindowStart"] | "";
          String timerWindowEnd = doc["timerWindowEnd"] | "";

          bool found = false;
          for (auto& p : pins) {
            if (p.gpio == gpio) {
              p.name = name;
              p.mode = mode;
              p.customLabel = customLabel;
              p.value = value;
              p.invertLogic = invertLogic;
              p.calibOffset = calibOffset;
              p.calibMultiplier = calibMultiplier;
              p.isSimulated = isSimulated;
              p.cameraUrl = cameraUrl;
              p.linkedPins = reqLinkedPins;
              p.timerEnabled = timerEnabled;
              p.timerDurationOn = timerDurationOn;
              p.timerDurationOff = timerDurationOff;
              p.timerWindowStart = timerWindowStart;
              p.timerWindowEnd = timerWindowEnd;
              if (!p.timerEnabled || p.value == 0) {
                 p.currentTimerState = false;
                 p.lastTimerToggle = 0;
              }
              found = true;
              break;
            }
          }
          if (!found) {
            PinState newPin = {gpio, name, mode, customLabel, value, invertLogic, calibOffset, calibMultiplier, isSimulated, cameraUrl, reqLinkedPins, timerEnabled, timerDurationOn, timerDurationOff, timerWindowStart, timerWindowEnd, 0, false};
            pins.push_back(newPin);
          }

          if (mode == "DIGITAL_OUTPUT") {
            pinMode(gpio, OUTPUT);
            int physicalVal = invertLogic ? !value : value;
            digitalWrite(gpio, physicalVal);
          } else if (mode == "PWM_OUTPUT") {
            ledcAttach(gpio, 5000, 8);
            ledcWrite(gpio, value);
          } else if (mode == "ANALOG_INPUT" || mode == "DIGITAL_INPUT" || mode.startsWith("SENSOR_")) {
            pinMode(gpio, INPUT);
          }
          savePinsToNVS();
          
          if (mqttClient.connected()) {
            publishAutoDiscovery();
          }

          AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
          response->addHeader("Access-Control-Allow-Origin", "*");
          request->send(response);
        } else {
          AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"error\":\"Missing parameters\"}");
          response->addHeader("Access-Control-Allow-Origin", "*");
          request->send(response);
        }
      } else {
        request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      }
    }
  });

  // Route: POST /api/wifi
  server.on("/api/wifi", HTTP_POST, [](AsyncWebServerRequest *request){
    // Handled in body
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      if (!checkAuth(request)) {
        request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
      }
      JsonDocument doc;
      if(!deserializeJson(doc, data, len)) {
        if(doc.containsKey("ssid") && doc.containsKey("pass")) {
          String ssid = doc["ssid"].as<String>();
          String pass = doc["pass"].as<String>();
          String role = doc["role"] | "principal";
          int servo_index = doc["servo_index"] | 1;
          
          preferences.begin("wifi", false);
          preferences.putString("ssid", ssid);
          preferences.putString("pass", pass);
          preferences.putString("role", role);
          preferences.putInt("servo_index", servo_index);
          preferences.end();
          
          AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
          response->addHeader("Access-Control-Allow-Origin", "*");
          request->send(response);
          
          Serial.println("WiFi credentials updated. Restarting...");
          shouldRestart = true;
          restartTime = millis();
        } else {
          AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"error\":\"Missing ssid or pass\"}");
          response->addHeader("Access-Control-Allow-Origin", "*");
          request->send(response);
        }
      } else {
        request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      }
    }
  });

  // Route: GET /api/mqtt
  server.on("/api/mqtt", HTTP_GET, [](AsyncWebServerRequest *request){
    if (!checkAuth(request)) {
      request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
      return;
    }
    JsonDocument doc;
    preferences.begin("mqtt", true);
    doc["server"] = preferences.getString("server", "");
    doc["port"] = preferences.getInt("port", 1883);
    doc["user"] = preferences.getString("user", "");
    doc["pass"] = preferences.getString("pass", "");
    preferences.end();
    
    String responseStr;
    serializeJson(doc, responseStr);
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", responseStr);
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  });

  // Route: POST /api/mqtt
  server.on("/api/mqtt", HTTP_POST, [](AsyncWebServerRequest *request){
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      if (!checkAuth(request)) {
        request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
      }
      JsonDocument doc;
      if(!deserializeJson(doc, data, len)) {
        preferences.begin("mqtt", false);
        if(doc["server"].is<String>()) preferences.putString("server", doc["server"].as<String>());
        if(doc["port"].is<int>()) preferences.putInt("port", doc["port"].as<int>());
        if(doc["user"].is<String>()) preferences.putString("user", doc["user"].as<String>());
        if(doc["pass"].is<String>()) preferences.putString("pass", doc["pass"].as<String>());
        preferences.end();
        
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
        
        Serial.println("MQTT credentials updated. Restarting...");
        shouldRestart = true;
        restartTime = millis();
      } else {
        request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      }
    }
  });

  // Route: POST /api/ddns
  server.on("/api/ddns", HTTP_POST, [](AsyncWebServerRequest *request){
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      if (!checkAuth(request)) {
        AsyncWebServerResponse *response = request->beginResponse(401, "application/json", "{\"error\":\"Unauthorized\"}");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
        return;
      }
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, data, len);
      if(!error) {
        ddnsEnabled = doc["enabled"] | false;
        if(doc["domain"].is<String>()) ddnsDomain = doc["domain"].as<String>();
        if(doc["token"].is<String>()) ddnsToken = doc["token"].as<String>();
        if(doc["port"].is<int>()) ddnsExternalPort = doc["port"].as<int>();
        
        pendingDdnsSave = true; // Defer NVS save to main loop()
        
        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
      } else {
        String errStr = error.c_str();
        AsyncWebServerResponse *response = request->beginResponse(400, "application/json", "{\"error\":\"Invalid JSON: " + errStr + "\"}");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
      }
    }
  });

  server.on("/api/version", HTTP_GET, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"version\":\"" + String(FIRMWARE_VERSION) + "\"}");
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  });

  server.on("/api/update", HTTP_POST, [](AsyncWebServerRequest *request){
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      if (!checkAuth(request)) {
        request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
      }
      JsonDocument doc;
      if(!deserializeJson(doc, data, len)) {
        extern bool shouldUpdateOta;
        extern String otaFirmwareUrl;
        extern String otaFsUrl;
        
        otaFirmwareUrl = doc["firmwareUrl"].as<String>();
        otaFsUrl = doc["fsUrl"].as<String>();
        shouldUpdateOta = true;

        AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"updating\"}");
        response->addHeader("Access-Control-Allow-Origin", "*");
        request->send(response);
      } else {
        request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      }
    }
  });

  // Route: GET /api/autoupdate
  server.on("/api/autoupdate", HTTP_GET, [](AsyncWebServerRequest *request){
    if (!checkAuth(request)) {
      request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
      return;
    }
    String responseStr = "{\"enabled\":";
    responseStr += autoUpdateEnabled ? "true" : "false";
    responseStr += "}";
    AsyncWebServerResponse *response = request->beginResponse(200, "application/json", responseStr);
    response->addHeader("Access-Control-Allow-Origin", "*");
    request->send(response);
  });

  // Route: POST /api/autoupdate
  server.on("/api/autoupdate", HTTP_POST, [](AsyncWebServerRequest *request){
  }, NULL, [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total){
    if(index == 0) {
      if (!checkAuth(request)) {
        request->send(401, "application/json", "{\"error\":\"Unauthorized\"}");
        return;
      }
      JsonDocument doc;
      if(!deserializeJson(doc, data, len)) {
        if(doc.containsKey("enabled")) {
          extern bool autoUpdateEnabled;
          autoUpdateEnabled = doc["enabled"].as<bool>();
          Preferences prefs;
          prefs.begin("ota", false);
          prefs.putBool("autoUpdate", autoUpdateEnabled);
          prefs.end();
          
          AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\"}");
          response->addHeader("Access-Control-Allow-Origin", "*");
          request->send(response);
        } else {
          request->send(400, "application/json", "{\"error\":\"Missing enabled\"}");
        }
      } else {
        request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      }
    }
  });

  server.on("/api/autoupdate", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    request->send(response);
  });

  // Serve static files from LittleFS
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

  server.onNotFound([](AsyncWebServerRequest *request) {
    if (request->method() == HTTP_OPTIONS) {
      request->send(200);
    } else {
      // Return index.html for client-side routing like /admin
      request->send(LittleFS, "/index.html", "text/html");
    }
  });

  server.begin();
  Serial.println("Server started!");
}

void loop() {
  if (mqttServer != "" && WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      unsigned long now = millis();
      if (now - lastMqttReconnectAttempt > 5000) {
        lastMqttReconnectAttempt = now;
        String clientId = "openAgro-" + macStr;
        bool connected = false;
        if (mqttUser.length() > 0) {
          connected = mqttClient.connect(clientId.c_str(), mqttUser.c_str(), mqttPass.c_str());
        } else {
          connected = mqttClient.connect(clientId.c_str());
        }
        if (connected) {
          lastMqttReconnectAttempt = 0;
          publishAutoDiscovery();
        }
      }
    } else {
      mqttClient.loop();
      
      unsigned long now = millis();
      if (now - lastSensorPublishTime > 5000) {
        lastSensorPublishTime = now;
        for (auto& p : pins) {
          if (p.mode.startsWith("SENSOR_") || p.mode == "ANALOG_INPUT") {
            p.value = analogRead(p.gpio);
            String stateTopic = getPinStateTopic(p.gpio);
            mqttClient.publish(stateTopic.c_str(), String(p.value).c_str(), true);
          } else if (p.mode == "DIGITAL_INPUT") {
            int phys = digitalRead(p.gpio);
            int val = p.invertLogic ? !phys : phys;
            if (val != p.value) {
              p.value = val;
              String stateTopic = getPinStateTopic(p.gpio);
              mqttClient.publish(stateTopic.c_str(), val ? "ON" : "OFF", true);
            }
          }
        }
      }
    }
  }
  
  // Virtual Boolean Timer Logic
  for (auto& p : pins) {
    if (p.mode == "VIRTUAL_BOOLEAN" && p.value == 1 && p.timerEnabled) {
      if (!isTimeInWindow(p.timerWindowStart, p.timerWindowEnd)) {
        if (p.currentTimerState || p.lastTimerToggle != 0) {
          p.currentTimerState = false;
          p.lastTimerToggle = 0;
          for (int lPin : p.linkedPins) {
            for (auto& tg : pins) {
              if (tg.gpio == lPin && (tg.mode == "DIGITAL_OUTPUT" || tg.mode == "PWM_OUTPUT")) {
                int physicalVal = tg.invertLogic ? 1 : 0;
                tg.value = 0;
                if (tg.mode == "DIGITAL_OUTPUT") digitalWrite(lPin, physicalVal);
                else ledcWrite(lPin, 0);
                if (mqttClient.connected()) {
                  mqttClient.publish(getPinStateTopic(lPin).c_str(), "OFF", true);
                }
              }
            }
          }
        }
      } else {
        unsigned long now = millis();
        if (p.lastTimerToggle == 0) {
          p.currentTimerState = true;
          p.lastTimerToggle = now;
          for (int lPin : p.linkedPins) {
            for (auto& tg : pins) {
              if (tg.gpio == lPin && (tg.mode == "DIGITAL_OUTPUT" || tg.mode == "PWM_OUTPUT")) {
                int physicalVal = tg.invertLogic ? 0 : 1;
                tg.value = 1;
                if (tg.mode == "DIGITAL_OUTPUT") digitalWrite(lPin, physicalVal);
                else ledcWrite(lPin, 255);
                if (mqttClient.connected()) {
                  mqttClient.publish(getPinStateTopic(lPin).c_str(), "ON", true);
                }
              }
            }
          }
        } else {
          unsigned long elapsed = now - p.lastTimerToggle;
          if (p.currentTimerState) {
            if (elapsed > (unsigned long)p.timerDurationOn * 1000) {
              p.currentTimerState = false;
              p.lastTimerToggle = now;
              for (int lPin : p.linkedPins) {
                for (auto& tg : pins) {
                  if (tg.gpio == lPin && (tg.mode == "DIGITAL_OUTPUT" || tg.mode == "PWM_OUTPUT")) {
                    int physicalVal = tg.invertLogic ? 1 : 0;
                    tg.value = 0;
                    if (tg.mode == "DIGITAL_OUTPUT") digitalWrite(lPin, physicalVal);
                    else ledcWrite(lPin, 0);
                    if (mqttClient.connected()) {
                      mqttClient.publish(getPinStateTopic(lPin).c_str(), "OFF", true);
                    }
                  }
                }
              }
            }
          } else {
            if (elapsed > (unsigned long)p.timerDurationOff * 60 * 1000) {
              p.currentTimerState = true;
              p.lastTimerToggle = now;
              for (int lPin : p.linkedPins) {
                for (auto& tg : pins) {
                  if (tg.gpio == lPin && (tg.mode == "DIGITAL_OUTPUT" || tg.mode == "PWM_OUTPUT")) {
                    int physicalVal = tg.invertLogic ? 0 : 1;
                    tg.value = 1;
                    if (tg.mode == "DIGITAL_OUTPUT") digitalWrite(lPin, physicalVal);
                    else ledcWrite(lPin, 255);
                    if (mqttClient.connected()) {
                      mqttClient.publish(getPinStateTopic(lPin).c_str(), "ON", true);
                    }
                  }
                }
              }
            }
          }
        }
      }
    } else if (p.mode == "VIRTUAL_BOOLEAN" && p.value == 0 && (p.currentTimerState || p.lastTimerToggle != 0)) {
      p.currentTimerState = false;
      p.lastTimerToggle = 0;
    }
  }

  if (shouldRestart && millis() - restartTime > 1000) {
    ESP.restart();
  }

  // Logica DuckDNS
  if (pendingDdnsSave) {
    saveDdnsConfig();
    lastDdnsUpdate = 0;
    pendingDdnsSave = false;
    Serial.println("DDNS config saved successfully from loop task.");
  }

  // DDNS DuckDNS check
  if (ddnsEnabled && ddnsDomain != "" && ddnsToken != "" && WiFi.status() == WL_CONNECTED) {
    if (millis() - lastDdnsUpdate > DDNS_INTERVAL || lastDdnsUpdate == 0) {
      lastDdnsUpdate = millis();
      Serial.println("Updating DuckDNS...");
      HTTPClient http;
      String url = "http://www.duckdns.org/update?domains=" + ddnsDomain + "&token=" + ddnsToken + "&ip=";
      http.begin(url);
      int httpCode = http.GET();
      if (httpCode > 0) {
        String payload = http.getString();
        Serial.println("DuckDNS Response: " + payload);
      } else {
        Serial.printf("DuckDNS update failed, error: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    }
  }

  // Auto-update background check
  if (autoUpdateEnabled && WiFi.status() == WL_CONNECTED) {
    if (millis() - lastAutoUpdateCheck > AUTO_UPDATE_INTERVAL || lastAutoUpdateCheck == 0) {
      lastAutoUpdateCheck = millis();
      Serial.println("Checando por atualizações OTA (Auto-Update)...");
      
      HTTPClient http;
      http.begin("https://api.github.com/repos/operaAvenue/Nutshell/releases/latest");
      int httpCode = http.GET();
      if (httpCode > 0) {
        String payload = http.getString();
        JsonDocument doc;
        if (!deserializeJson(doc, payload)) {
          String tagName = doc["tag_name"].as<String>();
          if (tagName > String(FIRMWARE_VERSION)) {
            Serial.println("Nova versão encontrada: " + tagName + " (Atual: " + FIRMWARE_VERSION + ")");
            JsonArray assets = doc["assets"].as<JsonArray>();
            for (JsonObject asset : assets) {
              String name = asset["name"].as<String>();
              String url = asset["browser_download_url"].as<String>();
              if (name == "firmware.bin") otaFirmwareUrl = url;
              if (name == "littlefs.bin") otaFsUrl = url;
            }
            if (otaFirmwareUrl.length() > 0 && otaFsUrl.length() > 0) {
              shouldUpdateOta = true;
            }
          } else {
            Serial.println("Firmware já está na última versão.");
          }
        }
      } else {
        Serial.printf("Falha na checagem automática: %s\n", http.errorToString(httpCode).c_str());
      }
      http.end();
    }
  }

  if (shouldUpdateOta) {
    shouldUpdateOta = false;
    Serial.println("Iniciando processo de OTA...");
    
    WiFiClientSecure client;
    client.setInsecure(); // Necessário para baixar releases do GitHub sem checar o root CA
    
    if (otaFsUrl.length() > 0) {
      Serial.print("Atualizando LittleFS de: ");
      Serial.println(otaFsUrl);
      t_httpUpdate_return retFS = httpUpdate.updateSpiffs(client, otaFsUrl);
      if(retFS == HTTP_UPDATE_OK) {
         Serial.println("LittleFS atualizado com sucesso!");
      } else {
         Serial.printf("Erro na atualização do FS: %s\n", httpUpdate.getLastErrorString().c_str());
      }
    }
    
    if (otaFirmwareUrl.length() > 0) {
      Serial.print("Atualizando Firmware de: ");
      Serial.println(otaFirmwareUrl);
      t_httpUpdate_return retFW = httpUpdate.update(client, otaFirmwareUrl);
      if(retFW == HTTP_UPDATE_OK) {
         Serial.println("Firmware atualizado com sucesso!");
      } else {
         Serial.printf("Erro na atualização do FW: %s\n", httpUpdate.getLastErrorString().c_str());
      }
    }
    
    Serial.println("OTA Finalizado. Reiniciando em breve...");
    shouldRestart = true;
    restartTime = millis();
  }
}
