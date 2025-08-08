#!/bin/bash

# Deploy WhatsApp Service Stealth
set -e

echo "🥷 Deploy WhatsApp Service Stealth"

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

echo -e "${YELLOW}📁 Enviando WhatsApp Service Stealth...${NC}"

# Fazer backup do arquivo atual
copy_to_server "whatsapp-service.js" "whatsapp-service-backup.js"

# Copiar nova versão stealth
copy_to_server "whatsapp-service-stealth.js" "whatsapp-service.js"

echo -e "${YELLOW}🔄 Atualizando container com modo stealth...${NC}"

# Comandos para executar no servidor
SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 Parando WhatsApp Service atual...'
docker stop whatsapp-service || true
docker rm whatsapp-service || true

echo '🥷 Iniciando WhatsApp Service Stealth...'
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
  --shm-size=1gb \\
  node:18 sh -c 'apt-get update && apt-get install -y wget gnupg ca-certificates && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && echo \"deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main\" > /etc/apt/sources.list.d/google.list && apt-get update && apt-get install -y google-chrome-stable && npm install --omit=dev && node index.js'

echo '⏳ Aguardando inicialização stealth (90s)...'
sleep 90

echo '🔍 Testando modo stealth...'
STATUS=\$(curl -s http://localhost/whatsapp-status)
echo \"Status Stealth: \$STATUS\"

echo '🌐 Testando página web...'
WEB_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/whatsapp-auth)
if [ \"\$WEB_TEST\" = '200' ]; then
    echo '✅ Página web stealth funcionando!'
else
    echo '❌ Problema na página web (HTTP \$WEB_TEST)'
fi

echo '✅ WhatsApp Service Stealth implantado!'
"

echo -e "${BLUE}🚀 Executando deploy stealth no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🥷 Deploy Stealth Concluído!${NC}"
echo -e "\n${BLUE}📋 RECURSOS STEALTH:${NC}"
echo -e "• 🥷 Anti-detecção extremo"
echo -e "• 🌐 Navegação natural via Google"
echo -e "• 🤖 Digitação ultra humanizada"
echo -e "• 🎯 Múltiplos métodos de envio"
echo -e "• ✅ Verificação de entrega real"
echo -e "• 🔄 Fallback automático inteligente"

echo -e "\n${YELLOW}💡 COMO USAR:${NC}"
echo -e "1. Acesse: http://$SERVER_IP/whatsapp-auth"
echo -e "2. Escaneie o QR Code quando aparecer"
echo -e "3. Teste: http://$SERVER_IP/appsheet-whatsapp"
echo -e "4. Monitore: ssh $SERVER_USER@$SERVER_IP 'docker logs whatsapp-service -f'"

echo -e "\n${GREEN}🚀 Sistema Stealth Ativo! Agora as mensagens devem chegar!${NC}"