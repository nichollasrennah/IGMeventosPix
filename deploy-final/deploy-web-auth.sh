#!/bin/bash

# Deploy da página web de autenticação WhatsApp
set -e

echo "🌐 Implantando Página Web WhatsApp QR Code"

# Configurações
SERVER_IP="srv937382.hstgr.cloud"
SERVER_USER="root"  # ou ubuntu, conforme sua configuração SSH
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

echo -e "${YELLOW}📁 Enviando arquivos atualizados...${NC}"

# Copiar arquivos atualizados
copy_to_server "whatsapp-service.js" "whatsapp-service.js"
copy_to_server "nginx.conf" "nginx.conf"

echo -e "${YELLOW}🔄 Atualizando containers no servidor...${NC}"

# Comandos para executar no servidor
SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 Parando containers existentes...'
docker stop whatsapp-service nginx-proxy || true
docker rm whatsapp-service nginx-proxy || true

echo '🌐 Atualizando configuração Nginx...'
docker run -d \\
  --name nginx-proxy \\
  --network pix-service_pix-network \\
  -p 80:80 \\
  -v \$(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \\
  --restart unless-stopped \\
  nginx:alpine

echo '📱 Iniciando WhatsApp Service com página web...'
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

echo '⏳ Aguardando inicialização...'
sleep 300

echo '🔍 Testando página web...'
PAGE_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/whatsapp-auth || echo '000')
if [ \"\$PAGE_TEST\" = '200' ]; then
    echo '✅ Página web funcionando!'
else
    echo '❌ Página web com problema (HTTP \$PAGE_TEST)'
fi

echo '📋 Status atual:'
curl -s http://localhost/whatsapp-status | head -5

echo '🌐 Página disponível em: http://$SERVER_IP/whatsapp-auth'
"

echo -e "${BLUE}🚀 Executando comandos no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🎉 Deploy da Página Web Concluído!${NC}"
echo -e "\n${BLUE}📋 ACESSE A PÁGINA:${NC}"
echo -e "${YELLOW}🔗 http://$SERVER_IP/whatsapp-auth${NC}"
echo -e "\n${BLUE}📱 COMO USAR:${NC}"
echo -e "1. Acesse a URL acima no navegador"
echo -e "2. A página mostrará o status em tempo real"
echo -e "3. Quando aparecer o QR Code, escaneie com WhatsApp"
echo -e "4. A página atualizará automaticamente quando conectar"

echo -e "\n${YELLOW}💡 ENDPOINTS DISPONÍVEIS:${NC}"
echo -e "• 🌐 Página QR: http://$SERVER_IP/whatsapp-auth"
echo -e "• 📊 Status JSON: http://$SERVER_IP/whatsapp-status"
echo -e "• 📱 QR Code JSON: http://$SERVER_IP/whatsapp-qr"

echo -e "\n${BLUE}📋 Para monitorar logs:${NC}"
echo -e "${YELLOW}ssh $SERVER_USER@$SERVER_IP 'docker logs whatsapp-service -f'${NC}"

echo -e "\n${GREEN}✅ Sistema pronto! Acesse http://$SERVER_IP/whatsapp-auth${NC}"
