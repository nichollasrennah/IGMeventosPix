#!/bin/bash

# Script para atualizar apenas o serviço PIX sem restart completo
set -e

echo "🔄 Atualizando PIX Service..."

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

# Verificar se o arquivo existe
if [ ! -f "pix-service.js" ]; then
    echo -e "${RED}❌ Arquivo pix-service.js não encontrado!${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Parando PIX Service...${NC}"
$DOCKER_COMPOSE stop pix-service

echo -e "${YELLOW}🔄 Atualizando arquivo...${NC}"
# O volume já está mapeado, então o arquivo será atualizado automaticamente

echo -e "${YELLOW}🚀 Iniciando PIX Service...${NC}"
$DOCKER_COMPOSE start pix-service

echo -e "${YELLOW}⏳ Aguardando inicialização...${NC}"
sleep 10

echo -e "${YELLOW}🏥 Verificando saúde do serviço...${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")

if [ "$HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ PIX Service atualizado e funcionando!${NC}"
else
    echo -e "${RED}❌ Serviço com problemas. Verificando logs...${NC}"
    $DOCKER_COMPOSE logs pix-service --tail=20
fi

echo -e "${GREEN}🏁 Atualização concluída!${NC}"