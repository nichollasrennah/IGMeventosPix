#!/bin/bash

# Reativar WhatsApp Web Real
set -e

echo "📱 Reativando WhatsApp Web Real"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar Docker Compose
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo -e "${RED}❌ Docker Compose não encontrado!${NC}"
    exit 1
fi

echo -e "${YELLOW}🛑 Parando WhatsApp Service atual...${NC}"
docker stop whatsapp-service || true
docker rm whatsapp-service || true

echo -e "${YELLOW}🚀 Iniciando WhatsApp Service com modo real...${NC}"

# Criar container com SIMULATE_MODE=false
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

echo -e "${YELLOW}⏳ Aguardando inicialização (60s)...${NC}"
sleep 30

echo -e "${BLUE}📱 Verificando logs para QR Code...${NC}"
echo -e "${YELLOW}👀 MONITORE OS LOGS ABAIXO PARA QR CODE:${NC}"
echo ""

# Mostrar logs em tempo real por 60 segundos
timeout 60s docker logs whatsapp-service -f 2>/dev/null || echo -e "\n${YELLOW}⏰ Timeout dos logs atingido${NC}"

echo -e "\n${BLUE}🔍 Verificando status atual...${NC}"

# Verificar status
WA_STATUS=$(curl -s http://localhost/whatsapp-status || echo "ERROR")
echo -e "${BLUE}📱 Status WhatsApp:${NC}"
echo "$WA_STATUS" | head -5

if echo "$WA_STATUS" | grep -q '"connected":true'; then
    if echo "$WA_STATUS" | grep -q '"simulate_mode":false'; then
        echo -e "${GREEN}🎉 WhatsApp Web conectado e ativo!${NC}"
        
        echo -e "\n${BLUE}🧪 Testando envio real...${NC}"
        
        # Teste de mensagem real
        TEST_MSG=$(curl -s -X POST http://localhost/enviar-mensagem \
          -H "Content-Type: application/json" \
          -d '{
            "numero": "84999758144",
            "mensagem": "🎉 WhatsApp Web REAL funcionando!\n\n⏰ '$(date)'\n\n✅ Mensagem enviada via WhatsApp Web oficial!"
          }' || echo "ERROR")
        
        if [[ "$TEST_MSG" == *"sucesso"* ]]; then
            if echo "$TEST_MSG" | grep -q '"simulado":false'; then
                echo -e "${GREEN}✅ Mensagem REAL enviada!${NC}"
                echo -e "${GREEN}📱 Verifique o WhatsApp no número 84999758144${NC}"
            else
                echo -e "${YELLOW}🎭 Ainda em simulação${NC}"
            fi
        else
            echo -e "${RED}❌ Teste de envio falhou${NC}"
        fi
        
    else
        echo -e "${YELLOW}🎭 WhatsApp em modo simulação (fallback ativo)${NC}"
    fi
else
    echo -e "${RED}❌ WhatsApp não conectado${NC}"
    echo -e "${YELLOW}📋 Últimos logs:${NC}"
    docker logs whatsapp-service --tail=10
fi

echo -e "\n${YELLOW}💡 COMANDOS ÚTEIS:${NC}"
echo -e "• Ver logs QR Code: docker logs whatsapp-service -f"
echo -e "• Status WhatsApp: curl http://localhost/whatsapp-status"
echo -e "• Reiniciar: docker restart whatsapp-service"
echo -e "• Voltar simulação: ./force-simulate.sh"

echo -e "\n${BLUE}📋 Se viu QR CODE nos logs acima:${NC}"
echo -e "1. Abra WhatsApp no seu celular"
echo -e "2. Vá em Configurações > Aparelhos conectados"
echo -e "3. Toque em 'Conectar um aparelho'"
echo -e "4. Escaneie o QR Code que apareceu nos logs"
echo -e "5. Aguarde mensagem '✅ WhatsApp Web conectado com sucesso!'"

echo -e "\n${GREEN}🚀 Processo de reativação concluído!${NC}"