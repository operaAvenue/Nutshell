#!/bin/bash

# Script para construir e publicar uma nova versão OTA no GitHub
# Uso: ./release.sh v1.0.1 "Notas da versão"

VERSION=$1
NOTES=$2

if [ -z "$VERSION" ]; then
  echo "Erro: Forneça a versão (ex: v1.0.1)"
  echo "Uso: ./release.sh v1.0.1 \"Notas da versão\""
  exit 1
fi

echo "Compilando Frontend..."
npm run build

echo "Compilando Firmware e LittleFS..."
~/.platformio/penv/bin/pio run || { echo "❌ Falha na compilação do firmware. Release abortado."; exit 1; }
~/.platformio/penv/bin/pio run -t buildfs || { echo "❌ Falha na compilação do FS. Release abortado."; exit 1; }

echo "Criando Release no GitHub..."
# Fazer commit se houver mudanças pendentes
git add .
git commit -m "Release $VERSION"
git push

# Criar release via gh CLI
gh release create "$VERSION" \
  .pio/build/esp32dev/firmware.bin \
  .pio/build/esp32dev/littlefs.bin \
  --title "Release $VERSION" \
  --notes "${NOTES:-"Atualização automática"}"
  
echo "✅ Versão $VERSION publicada com sucesso no GitHub!"
