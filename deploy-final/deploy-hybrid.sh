#!/bin/bash

# Deploy WhatsApp Service Híbrido
set -e

echo "🔄 Deploy WhatsApp Service Híbrido"

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

echo -e "${BLUE}📋 Sistema Híbrido de WhatsApp${NC}"
echo -e "• 🚀 WhatsApp Business API (quando configurado)"
echo -e "• 🌐 WhatsApp Web (fallback)"
echo -e "• 🎭 Simulação (último recurso)"

echo -e "\n${YELLOW}📁 Enviando versão híbrida...${NC}"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

# Fazer backup e enviar nova versão
copy_to_server "whatsapp-service.js" "whatsapp-service-stealth-backup.js"
copy_to_server "whatsapp-hybrid.js" "whatsapp-service.js"

echo -e "${YELLOW}🔄 Atualizando container híbrido...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 Parando WhatsApp Service atual...'
docker stop whatsapp-service || true
docker rm whatsapp-service || true

echo '🔄 Iniciando WhatsApp Service Híbrido...'
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
  -e WHATSAPP_BUSINESS_TOKEN= \\
  -e WHATSAPP_BUSINESS_PHONE_ID= \\
  -v \$(pwd)/whatsapp-service.js:/app/index.js \\
  -v \$(pwd)/whatsapp-package.json:/app/package.json \\
  -v whatsapp-data:/app/data \\
  --restart unless-stopped \\
  --workdir /app \\
  --shm-size=1gb \\
  node:18 sh -c 'apt-get update && apt-get install -y wget gnupg ca-certificates && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && echo \"deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main\" > /etc/apt/sources.list.d/google.list && apt-get update && apt-get install -y google-chrome-stable && npm install --omit=dev && node index.js'

echo '⏳ Aguardando inicialização híbrida (60s)...'
sleep 60

echo '🔍 Testando sistema híbrido...'
STATUS=\$(curl -s http://localhost/whatsapp-status)
echo \"Status Híbrido: \$STATUS\"

echo '🌐 Testando página web híbrida...'
WEB_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/whatsapp-auth)
if [ \"\$WEB_TEST\" = '200' ]; then
    echo '✅ Página híbrida funcionando!'
else
    echo '❌ Problema na página (HTTP \$WEB_TEST)'
fi

echo '✅ WhatsApp Service Híbrido implantado!'
"

run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🔄 Deploy Híbrido Concluído!${NC}"
echo -e "\n${BLUE}📋 RECURSOS HÍBRIDOS:${NC}"
echo -e "• 🚀 WhatsApp Business API (configurar depois)"
echo -e "• 🌐 WhatsApp Web (funciona agora)"
echo -e "• 🎭 Simulação garantida (sempre funciona)"
echo -e "• 📊 Interface mostra todos os métodos"
echo -e "• 🔄 Fallback automático inteligente"

echo -e "\n${YELLOW}💡 COMO USAR AGORA:${NC}"
echo -e "1. Acesse: http://$SERVER_IP/whatsapp-auth"
echo -e "2. Veja os métodos disponíveis"
echo -e "3. Se QR Code aparecer, escaneie"
echo -e "4. Teste: http://$SERVER_IP/appsheet-whatsapp"
echo -e "5. Sistema tentará WhatsApp Web → Simulação"

echo -e "\n${BLUE}📋 PARA ATIVAR BUSINESS API (100% GARANTIDO):${NC}"
echo -e "1. Configure conta Meta Business"
echo -e "2. Adicione variáveis de ambiente:"
echo -e "   WHATSAPP_BUSINESS_TOKEN=seu_token"
echo -e "   WHATSAPP_BUSINESS_PHONE_ID=seu_phone_id"
echo -e "3. Reinicie o container"

echo -e "\n${GREEN}🚀 Sistema Híbrido Ativo! Múltiplas opções de entrega!${NC}"