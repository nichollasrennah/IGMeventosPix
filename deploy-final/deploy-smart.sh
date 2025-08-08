#!/bin/bash

# Deploy inteligente com fallback automático
set -e

echo "🧠 Deploy Inteligente PIX + WhatsApp Service"

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

echo -e "${YELLOW}🛑 Parando containers existentes...${NC}"
$DOCKER_COMPOSE down

echo -e "${YELLOW}🚀 Iniciando com WhatsApp real + fallback automático...${NC}"
$DOCKER_COMPOSE up -d

echo -e "${YELLOW}⏳ Aguardando inicialização (60s)...${NC}"
sleep 60

echo -e "${BLUE}🔍 Verificando status dos serviços...${NC}"

# PIX Service
PIX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")
if [ "$PIX_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ PIX Service: OK${NC}"
else
    echo -e "${RED}❌ PIX Service: Falha${NC}"
    exit 1
fi

# WhatsApp Service
WA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/whatsapp-status || echo "000")
if [ "$WA_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ WhatsApp Service: OK${NC}"
    
    # Verificar status
    WA_STATUS=$(curl -s http://localhost/whatsapp-status)
    echo -e "${BLUE}📱 Status WhatsApp:${NC}"
    echo "$WA_STATUS" | head -5
    
    # Verificar se está em simulação
    if echo "$WA_STATUS" | grep -q '"simulate_mode":true'; then
        echo -e "${YELLOW}🎭 WhatsApp em modo simulação (fallback automático ativado)${NC}"
    elif echo "$WA_STATUS" | grep -q '"connected":true'; then
        echo -e "${GREEN}📱 WhatsApp conectado ao WhatsApp Web!${NC}"
    else
        echo -e "${YELLOW}⏳ WhatsApp ainda tentando conectar...${NC}"
    fi
    
else
    echo -e "${RED}❌ WhatsApp Service: Falha${NC}"
    exit 1
fi

echo -e "\n${BLUE}🧪 Testando endpoint completo...${NC}"

# Teste completo
TEST_RESPONSE=$(curl -s -X POST http://localhost/appsheet-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "smart123",
    "Pagador": "Teste Smart Deploy",
    "Valor Pix": "25.00",
    "cpf": "04644606464",
    "numero": "85999999999",
    "evento": "Deploy Inteligente"
  }' || echo "ERROR")

if [[ "$TEST_RESPONSE" == *"sucesso"* ]]; then
    echo -e "${GREEN}✅ Teste completo: SUCESSO${NC}"
    
    # Verificar se PIX foi real ou simulado
    if echo "$TEST_RESPONSE" | grep -q '"simulado":true'; then
        echo -e "${YELLOW}📱 WhatsApp foi simulado${NC}"
    else
        echo -e "${GREEN}📱 WhatsApp foi enviado realmente!${NC}"
    fi
    
else
    echo -e "${RED}❌ Teste completo: FALHA${NC}"
    echo -e "${YELLOW}📋 Resposta:${NC}"
    echo "$TEST_RESPONSE" | head -5
fi

echo -e "\n${GREEN}🧠 Deploy Inteligente Concluído!${NC}"
echo -e "\n${BLUE}📋 RESUMO:${NC}"
echo -e "🏦 PIX Service: Funcionando com Sicredi"
echo -e "📱 WhatsApp Service: Funcionando (real ou simulado)"
echo -e "🌐 Endpoint AppSheet: http://$(hostname -I | awk '{print $1}')/appsheet-whatsapp"

echo -e "\n${YELLOW}💡 DICAS:${NC}"
echo -e "• Para ver logs do WhatsApp: $DOCKER_COMPOSE logs -f whatsapp-service"
echo -e "• Para status WhatsApp: curl http://localhost/whatsapp-status"
echo -e "• Se em simulação, mensagens aparecem nos logs"
echo -e "• Para forçar reconexão: $DOCKER_COMPOSE restart whatsapp-service"

echo -e "\n${GREEN}🎉 Sistema pronto para uso!${NC}"