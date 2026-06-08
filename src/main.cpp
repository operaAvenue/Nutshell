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

#define FIRMWARE_VERSION "v1.0.0"

// Default network credentials
const char* DEFAULT_WIFI_SSID = "YOUR_WIFI_SSID";
const char* DEFAULT_WIFI_PASS = "YOUR_WIFI_PASSWORD";

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

bool shouldRestart = false;
unsigned long restartTime = 0;

bool shouldUpdateOta = false;
String otaFirmwareUrl = "";
String otaFsUrl = "";

struct PinState {
  int gpio;
  String name;
  String mode;
  String customLabel;
  int value;
  bool invertLogic;
  float calibOffset;
  float calibMultiplier;
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
      p.calibMultiplier = obj["calibMultiplier"] | 0.0f;
      pins.push_back(p);
    }
  }
}

void publishAutoDiscovery() {
  if (!mqttClient.connected()) return;
  for (auto& p : pins) {
    JsonDocument doc;
    String component = "";
    String objectId = "gpio" + String(p.gpio);
    String topicPrefix = "openagro/" + objectId;
    String discoveryTopic = "";

    JsonObject dev = doc["device"].to<JsonObject>();
    dev["identifiers"].add(macStr);
    dev["name"] = "openAgro.ai Node";
    dev["manufacturer"] = "openAgro";

    doc["name"] = p.name != "" ? p.name : ("Pin " + String(p.gpio));
    doc["unique_id"] = macStr + "_" + objectId;

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
      discoveryTopic = "homeassistant/" + component + "/openagro_" + macStr + "/" + objectId + "/config";
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
  
  if (topicStr.startsWith("openagro/gpio") && topicStr.endsWith("/set")) {
    int gpioStart = topicStr.indexOf("gpio") + 4;
    int gpioEnd = topicStr.lastIndexOf("/set");
    int gpio = topicStr.substring(gpioStart, gpioEnd).toInt();
    
    for (auto& p : pins) {
      if (p.gpio == gpio) {
        if (p.mode == "DIGITAL_OUTPUT") {
          int valueNum = (msg == "ON") ? 1 : 0;
          p.value = valueNum;
          int physicalVal = p.invertLogic ? !valueNum : valueNum;
          digitalWrite(gpio, physicalVal);
          savePinsToNVS();
          
          String stateTopic = "openagro/gpio" + String(gpio) + "/state";
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
  preferences.end();

  // Start in AP_STA mode so we have a fallback AP while trying to connect
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID, AP_PASS);

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
    // Disable AP since we successfully connected
    WiFi.mode(WIFI_STA);
  } else {
    Serial.println("Failed to connect to WiFi quickly. Continuing in AP_STA mode.");
    Serial.print("AP IP Address: ");
    Serial.println(WiFi.softAPIP());
    // Do NOT disconnect! The ESP32 will automatically keep retrying to connect in the background.
    // This handles the case where the router takes longer to boot than the ESP32 after a power outage.
  }
}

bool checkAuth(AsyncWebServerRequest *request) {
  preferences.begin("auth", true);
  String adminPass = preferences.getString("pass", "admin");
  preferences.end();

  if (request->hasHeader("Authorization")) {
    String authHeader = request->header("Authorization");
    if (authHeader.startsWith("Bearer ")) {
      String token = authHeader.substring(7);
      if (token == adminPass) return true;
    }
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  
  if(!LittleFS.begin(true)){
    Serial.println("An Error has occurred while mounting LittleFS");
    return;
  }
  
  setupPins();
  setupWiFi();

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

  // CORS handlers for OPTIONS preflight
  server.on("/api/pins", HTTP_OPTIONS, [](AsyncWebServerRequest *request){
    AsyncWebServerResponse *response = request->beginResponse(204);
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
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
            preferences.begin("auth", true);
            String adminPass = preferences.getString("pass", "admin");
            preferences.end();
            if (attempt == adminPass) {
               AsyncWebServerResponse *response = request->beginResponse(200, "application/json", "{\"status\":\"success\",\"token\":\"" + adminPass + "\"}");
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
    doc["ip"] = WiFi.getMode() == WIFI_AP ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
    doc["heap"] = ESP.getFreeHeap() / 1024;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["wifiMode"] = WiFi.getMode() == WIFI_AP ? "AP" : "STA";
    
    preferences.begin("wifi", true);
    doc["ssid"] = preferences.getString("ssid", DEFAULT_WIFI_SSID);
    preferences.end();
    
    JsonArray pinsArray = doc["pins"].to<JsonArray>();
    for (size_t i = 0; i < pins.size(); i++) {
      JsonObject pinObj = pinsArray.add<JsonObject>();
      pinObj["gpio"] = pins[i].gpio;
      pinObj["name"] = pins[i].name;
      pinObj["mode"] = pins[i].mode;
      pinObj["customLabel"] = pins[i].customLabel;
      pinObj["invertLogic"] = pins[i].invertLogic;
      pinObj["calibOffset"] = pins[i].calibOffset;
      pinObj["calibMultiplier"] = pins[i].calibMultiplier;
      
      // Update values for inputs
      if (pins[i].mode == "ANALOG_INPUT" || pins[i].mode.startsWith("SENSOR_")) {
        pins[i].value = analogRead(pins[i].gpio);
      } else if (pins[i].mode == "DIGITAL_INPUT") {
        int phys = digitalRead(pins[i].gpio);
        pins[i].value = pins[i].invertLogic ? !phys : phys;
      }
      
      pinObj["value"] = pins[i].value;
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
          }
          
          // Save the state change to NVS so it persists across reboots
          savePinsToNVS();
          
          if (mqttClient.connected()) {
             String stateTopic = "openagro/gpio" + String(pinGpio) + "/state";
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
          float calibMultiplier = doc["calibMultiplier"] | 0.0f;

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
              found = true;
              break;
            }
          }
          if (!found) {
            PinState newPin = {gpio, name, mode, customLabel, value, invertLogic, calibOffset, calibMultiplier};
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
          
          preferences.begin("wifi", false);
          preferences.putString("ssid", ssid);
          preferences.putString("pass", pass);
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

  // Serve static files from LittleFS
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html");

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
            String stateTopic = "openagro/gpio" + String(p.gpio) + "/state";
            mqttClient.publish(stateTopic.c_str(), String(p.value).c_str(), true);
          } else if (p.mode == "DIGITAL_INPUT") {
            int phys = digitalRead(p.gpio);
            int val = p.invertLogic ? !phys : phys;
            if (val != p.value) {
              p.value = val;
              String stateTopic = "openagro/gpio" + String(p.gpio) + "/state";
              mqttClient.publish(stateTopic.c_str(), val ? "ON" : "OFF", true);
            }
          }
        }
      }
    }
  }
  
  if (shouldRestart && millis() - restartTime > 1000) {
    ESP.restart();
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
