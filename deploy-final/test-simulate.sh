#!/bin/bash

# Script para testar WhatsApp Service em modo simulação
set -e

echo "🎭 Testando WhatsApp Service em Modo Simulação"

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

echo -e "${YELLOW}🛑 Parando containers atuais...${NC}"
$DOCKER_COMPOSE down

echo -e "${YELLOW}📋 Verificando arquivos necessários...${NC}"
required_files=("whatsapp-package-simulate.json" "docker-compose-simulate.yml" "whatsapp-service.js")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Arquivo $file não encontrado!${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ $file${NC}"
    fi
done

echo -e "${YELLOW}🎭 Iniciando em modo simulação...${NC}"
$DOCKER_COMPOSE -f docker-compose-simulate.yml up -d

echo -e "${YELLOW}⏳ Aguardando inicialização (30s)...${NC}"
sleep 30

echo -e "${BLUE}🔍 Verificando status dos serviços...${NC}"

# PIX Service
PIX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")
if [ "$PIX_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ PIX Service: OK${NC}"
else
    echo -e "${RED}❌ PIX Service: Falha${NC}"
fi

# WhatsApp Service
WA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/whatsapp-status || echo "000")
if [ "$WA_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ WhatsApp Service: OK${NC}"
    
    # Mostrar status
    echo -e "${BLUE}📱 Status WhatsApp:${NC}"
    curl -s http://localhost/whatsapp-status | head -5
    
else
    echo -e "${RED}❌ WhatsApp Service: Falha${NC}"
fi

echo -e "\n${BLUE}🧪 Testando endpoint completo...${NC}"

# Teste completo PIX + WhatsApp
TEST_RESPONSE=$(curl -s -X POST http://localhost/appsheet-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "simulate123",
    "Pagador": "Teste Simulação",
    "Valor Pix": "15.50",
    "cpf": "04644606464",
    "numero": "85999999999",
    "evento": "Teste Modo Simulação"
  }' || echo "ERROR")

if [[ "$TEST_RESPONSE" == *"sucesso"* ]]; then
    echo -e "${GREEN}✅ Teste completo: SUCESSO${NC}"
    echo -e "${BLUE}📋 Resposta:${NC}"
    echo "$TEST_RESPONSE" | head -10
else
    echo -e "${RED}❌ Teste completo: FALHA${NC}"
    echo -e "${YELLOW}📋 Resposta:${NC}"
    echo "$TEST_RESPONSE"
fi

echo -e "\n${BLUE}📋 Logs recentes do WhatsApp Service:${NC}"
$DOCKER_COMPOSE -f docker-compose-simulate.yml logs whatsapp-service --tail=10

echo -e "\n${GREEN}🎭 Teste em modo simulação concluído!${NC}"
echo -e "${YELLOW}💡 Para voltar ao modo normal: ./deploy.sh${NC}"