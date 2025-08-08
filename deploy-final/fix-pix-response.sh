#!/bin/bash

# Correção rápida para resposta PIX
set -e

echo "🔧 Aplicando correção para resposta PIX"

# Configurações
SERVER_IP="srv937382.hstgr.cloud"
SERVER_USER="root"
SERVER_PATH="/app/pix-service"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "${YELLOW}📁 Enviando correção...${NC}"
copy_to_server "whatsapp-service-stealth.js" "whatsapp-service.js"

echo -e "${YELLOW}🔄 Reiniciando container...${NC}"

SERVER_COMMANDS="
cd $SERVER_PATH
docker restart whatsapp-service
sleep 300
echo '✅ Container reiniciado com correção PIX'
"

run_on_server "$SERVER_COMMANDS"

echo -e "${GREEN}🔧 Correção aplicada! Teste novamente o endpoint.${NC}"
