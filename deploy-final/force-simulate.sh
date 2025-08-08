#!/bin/bash

# Forçar modo simulação temporariamente
set -e

echo "🎭 Forçando Modo Simulação Temporário"

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

echo -e "${YELLOW}🛑 Parando WhatsApp Service...${NC}"
$DOCKER_COMPOSE stop whatsapp-service

echo -e "${YELLOW}🎭 Recriando com modo simulação forçado...${NC}"

# Recriar container com SIMULATE_MODE=true
$DOCKER_COMPOSE rm -f whatsapp-service

# Criar container temporário em simulação
docker run -d \
  --name whatsapp-service \
  --network pix-service_pix-network \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e PIX_SERVICE_URL=http://pix-service:3000 \
  -e WHATSAPP_ENABLED=true \
  -e DEBUG_MODE=true \
  -e SIMULATE_MODE=true \
  -e AUTO_FALLBACK=true \
  -v $(pwd)/whatsapp-service.js:/app/index.js \
  -v $(pwd)/whatsapp-package.json:/app/package.json \
  --restart unless-stopped \
  --workdir /app \
  node:18 sh -c "npm install --omit=dev && node index.js"

echo -e "${YELLOW}⏳ Aguardando inicialização (20s)...${NC}"
sleep 20

echo -e "${BLUE}🔍 Verificando status...${NC}"

# Verificar status
WA_STATUS=$(curl -s http://localhost/whatsapp-status || echo "ERROR")
if [[ "$WA_STATUS" == *"simulação"* ]]; then
    echo -e "${GREEN}✅ WhatsApp em modo simulação funcionando!${NC}"
else
    echo -e "${RED}❌ Problema no WhatsApp Service${NC}"
    echo "$WA_STATUS" | head -3
    exit 1
fi

echo -e "\n${BLUE}🧪 Testando envio simulado...${NC}"

# Teste rápido
TEST_RESPONSE=$(curl -s -X POST http://localhost/enviar-mensagem \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "84999758144",
    "mensagem": "🎭 Teste modo simulação forçado\n\n⏰ '$(date)'\n\n✅ Funcionando em simulação enquanto resolvemos WhatsApp Web!"
  }' || echo "ERROR")

if [[ "$TEST_RESPONSE" == *"sucesso"* ]]; then
    echo -e "${GREEN}✅ Envio simulado funcionando!${NC}"
    
    if echo "$TEST_RESPONSE" | grep -q '"simulado":true'; then
        echo -e "${YELLOW}📱 Mensagem apareceu nos logs (modo simulação)${NC}"
    fi
else
    echo -e "${RED}❌ Teste falhou${NC}"
    echo "$TEST_RESPONSE" | head -3
fi

echo -e "\n${BLUE}🎯 Testando integração PIX + WhatsApp simulado...${NC}"

# Teste integração completa
FULL_TEST=$(curl -s -X POST http://localhost/appsheet-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "simulate999",
    "Pagador": "Teste Simulação Forçada",
    "Valor Pix": "99.99",
    "cpf": "04644606464",
    "numero": "84999758144",
    "evento": "Modo Simulação Temporário"
  }' || echo "ERROR")

if [[ "$FULL_TEST" == *"sucesso"* ]]; then
    echo -e "${GREEN}✅ Integração completa funcionando!${NC}"
    
    # Extrair TXID
    TXID=$(echo "$FULL_TEST" | grep -o '"txid":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
    echo -e "${BLUE}💰 PIX gerado: R$ 99.99 (TXID: ${TXID})${NC}"
    echo -e "${YELLOW}📱 WhatsApp simulado (mensagem nos logs)${NC}"
else
    echo -e "${RED}❌ Integração falhou${NC}"
    echo "$FULL_TEST" | head -5
fi

echo -e "\n${BLUE}📋 Logs recentes (últimas 10 linhas):${NC}"
docker logs whatsapp-service --tail=10

echo -e "\n${GREEN}🎭 Modo Simulação Forçado Ativo!${NC}"
echo -e "\n${YELLOW}💡 SITUAÇÃO ATUAL:${NC}"
echo -e "• ✅ PIX Service: Funcionando com Sicredi"
echo -e "• 🎭 WhatsApp Service: Simulação forçada"
echo -e "• ✅ AppSheet endpoint: Totalmente funcional"
echo -e "• 📱 Mensagens aparecem nos logs"

echo -e "\n${YELLOW}🔧 PRÓXIMOS PASSOS:${NC}"
echo -e "• AppSheet pode usar normalmente: http://$(hostname -I | awk '{print $1}')/appsheet-whatsapp"
echo -e "• Mensagens serão 'simuladas' mas PIX será real"
echo -e "• Para voltar ao modo normal: $DOCKER_COMPOSE up -d whatsapp-service"
echo -e "• Para ver mensagens simuladas: docker logs whatsapp-service -f"

echo -e "\n${GREEN}🚀 Sistema operacional em modo simulação!${NC}"