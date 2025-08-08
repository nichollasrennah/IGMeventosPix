#!/bin/bash

# Testar página web do WhatsApp
set -e

echo "🌐 Testando Página Web WhatsApp"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar se estamos no servidor ou local
if [ -f "/root/.ssh/authorized_keys" ] || [ -d "/home/ubuntu" ]; then
    # Estamos no servidor
    SERVER_MODE=true
    echo -e "${BLUE}🖥️ Executando no servidor VPS${NC}"
else
    # Estamos localmente, vamos usar SSH
    SERVER_MODE=false
    SERVER_IP="31.97.95.100"
    echo -e "${BLUE}💻 Executando via SSH para $SERVER_IP${NC}"
fi

# Verificar Docker Compose apenas se estivermos no servidor
if [ "$SERVER_MODE" = true ]; then
    if command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    elif docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        echo -e "${RED}❌ Docker Compose não encontrado!${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}🛑 Parando WhatsApp Service atual...${NC}"
docker stop whatsapp-service || true
docker rm whatsapp-service || true

echo -e "${YELLOW}🚀 Iniciando WhatsApp Service com página web...${NC}"

# Criar container com página web habilitada
docker run -d \
  --name whatsapp-service \
  --network pix-service_pix-network \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e PIX_SERVICE_URL=http://pix-service:3000 \
  -e WHATSAPP_ENABLED=true \
  -e DEBUG_MODE=true \
  -e SIMULATE_MODE=false \
  -e AUTO_FALLBACK=true \
  -v $(pwd)/whatsapp-service.js:/app/index.js \
  -v $(pwd)/whatsapp-package.json:/app/package.json \
  -v whatsapp-data:/app/data \
  --restart unless-stopped \
  --workdir /app \
  node:18 sh -c "apt-get update && apt-get install -y wget gnupg ca-certificates && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && echo 'deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google.list && apt-get update && apt-get install -y google-chrome-stable && npm install --omit=dev && node index.js"

echo -e "${YELLOW}⏳ Aguardando inicialização (30s)...${NC}"
sleep 30

echo -e "${BLUE}🔍 Verificando se página web está funcionando...${NC}"

# Testar página web
PAGE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/whatsapp-auth || echo "000")
if [ "$PAGE_RESPONSE" = "200" ]; then
    echo -e "${GREEN}✅ Página web funcionando!${NC}"
else
    echo -e "${RED}❌ Página web não responde (HTTP $PAGE_RESPONSE)${NC}"
    exit 1
fi

# Testar endpoint de status
STATUS_RESPONSE=$(curl -s http://localhost/whatsapp-status || echo "ERROR")
if [[ "$STATUS_RESPONSE" == *"status"* ]]; then
    echo -e "${GREEN}✅ Endpoint de status funcionando!${NC}"
    echo -e "${BLUE}📋 Status atual:${NC}"
    echo "$STATUS_RESPONSE" | head -5
else
    echo -e "${RED}❌ Endpoint de status com problema${NC}"
    echo "$STATUS_RESPONSE"
fi

# Obter IP do servidor
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "\n${GREEN}🌐 Página Web WhatsApp Disponível!${NC}"
echo -e "\n${BLUE}📋 ACESSE A PÁGINA:${NC}"
echo -e "${YELLOW}🔗 http://${SERVER_IP}/whatsapp-auth${NC}"
echo -e "\n${BLUE}📱 COMO USAR:${NC}"
echo -e "1. Acesse a URL acima no seu navegador"
echo -e "2. A página irá mostrar o status em tempo real"
echo -e "3. Quando aparecer o QR Code, escaneie com seu WhatsApp"
echo -e "4. A página irá atualizar automaticamente quando conectar"

echo -e "\n${YELLOW}💡 ENDPOINTS DISPONÍVEIS:${NC}"
echo -e "• 🌐 Página QR: http://${SERVER_IP}/whatsapp-auth"
echo -e "• 📊 Status JSON: http://${SERVER_IP}/whatsapp-status"
echo -e "• 📱 QR Code JSON: http://${SERVER_IP}/whatsapp-qr"

echo -e "\n${BLUE}📋 Logs em tempo real:${NC}"
echo -e "${YELLOW}Para monitorar: docker logs whatsapp-service -f${NC}"
echo ""

# Mostrar alguns logs iniciais
echo -e "${BLUE}📋 Logs recentes (últimas 15 linhas):${NC}"
docker logs whatsapp-service --tail=15

echo -e "\n${GREEN}🎉 Página Web WhatsApp configurada!${NC}"
echo -e "${YELLOW}👀 Acesse http://${SERVER_IP}/whatsapp-auth para ver o QR Code!${NC}"