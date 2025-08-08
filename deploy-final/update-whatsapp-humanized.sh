#!/bin/bash

# Atualizar WhatsApp Service com envio humanizado
set -e

echo "🤖 Atualizando WhatsApp com Envio Humanizado"

# Configurações
SERVER_IP="srv937382.hstgr.cloud"
SERVER_USER="root"
SERVER_PATH="/app/pix-service"

# Cores 
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}📋 Conectando ao servidor $SERVER_IP...${NC}"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "${YELLOW}📁 Enviando WhatsApp Service atualizado...${NC}"

# Copiar arquivo atualizado
copy_to_server "whatsapp-service.js" "whatsapp-service.js"

echo -e "${YELLOW}🔄 Reiniciando WhatsApp Service...${NC}"

# Comandos para executar no servidor
SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 Parando WhatsApp Service atual...'
docker stop whatsapp-service || true
docker rm whatsapp-service || true

echo '🤖 Iniciando WhatsApp com envio humanizado...'
docker run -d \\
  --name whatsapp-service \\
  --network pix-service_pix-network \\
  -e NODE_ENV=production \\
  -e PORT=3001 \\
  -e PIX_SERVICE_URL=http://pix-service:3000 \\
  -e WHATSAPP_ENABLED=true \\
  -e DEBUG_MODE=true \\
  -e SIMULATE_MODE=false \\
  -e AUTO_FALLBACK=true \\
  -v \$(pwd)/whatsapp-service.js:/app/index.js \\
  -v \$(pwd)/whatsapp-package.json:/app/package.json \\
  -v whatsapp-data:/app/data \\
  --restart unless-stopped \\
  --workdir /app \\
  node:18 sh -c 'apt-get update && apt-get install -y wget gnupg ca-certificates && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && echo \"deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main\" > /etc/apt/sources.list.d/google.list && apt-get update && apt-get install -y google-chrome-stable && npm install --omit=dev && node index.js'

echo '⏳ Aguardando inicialização (60s)...'
sleep 60

echo '🔍 Testando serviço...'
STATUS=\$(curl -s http://localhost/whatsapp-status | head -3)
echo \"Status: \$STATUS\"

echo '✅ WhatsApp Service atualizado com sucesso!'
"

echo -e "${BLUE}🚀 Executando atualizações no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🎉 Atualização Concluída!${NC}"
echo -e "\n${BLUE}📋 MELHORIAS IMPLEMENTADAS:${NC}"
echo -e "• 🤖 Movimento de mouse humanizado"
echo -e "• ⌨️ Digitação com delays naturais"
echo -e "• 🔄 Múltiplos métodos de envio"
echo -e "• 🎯 Detecção avançada de campos"
echo -e "• 🛡️ Anti-detecção de bot"

echo -e "\n${YELLOW}💡 COMO TESTAR:${NC}"
echo -e "1. Acesse: http://$SERVER_IP/whatsapp-auth"
echo -e "2. Aguarde conectar (se necessário)"
echo -e "3. Teste endpoint: http://$SERVER_IP/appsheet-whatsapp"
echo -e "4. Monitore logs: ssh $SERVER_USER@$SERVER_IP 'docker logs whatsapp-service -f'"

echo -e "\n${GREEN}🚀 Sistema pronto para teste real!${NC}"