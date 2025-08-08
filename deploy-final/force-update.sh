#!/bin/bash

# Script para forçar atualização do PIX Service
set -e

echo "🔄 Forçando atualização do PIX Service..."

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

echo -e "${YELLOW}🛑 Parando PIX Service...${NC}"
$DOCKER_COMPOSE stop pix-service

echo -e "${YELLOW}🗑️ Removendo container...${NC}"
$DOCKER_COMPOSE rm -f pix-service

echo -e "${YELLOW}🚀 Recriando PIX Service...${NC}"
$DOCKER_COMPOSE up -d pix-service

echo -e "${YELLOW}⏳ Aguardando inicialização (30s)...${NC}"
sleep 30

echo -e "${YELLOW}🏥 Verificando saúde do serviço...${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")

if [ "$HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ PIX Service atualizado e funcionando!${NC}"
    echo -e "${GREEN}🌐 Testando endpoint: http://localhost/health${NC}"
    curl -s http://localhost/health | head -3
else
    echo -e "${RED}❌ Serviço com problemas (HTTP $HEALTH)${NC}"
    echo -e "${YELLOW}📋 Verificando logs...${NC}"
    $DOCKER_COMPOSE logs pix-service --tail=30
fi

echo -e "${GREEN}🏁 Processo concluído!${NC}"