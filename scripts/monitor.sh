#!/bin/bash

# Script de monitoramento Docker
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}📊 Monitoramento PIX + WhatsApp Docker${NC}"
echo "==============================================="

# Status dos containers
echo -e "${YELLOW}🐳 Status dos Containers:${NC}"
docker-compose ps

echo ""

# Uso de recursos
echo -e "${YELLOW}💾 Uso de Recursos:${NC}"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}"

echo ""

# Health checks
echo -e "${YELLOW}🏥 Health Checks:${NC}"

# PIX Service
PIX_HEALTH=$(curl -s http://localhost/health?service=pix | jq -r '.status' 2>/dev/null || echo "error")
if [ "$PIX_HEALTH" = "ok" ]; then
    echo -e "${GREEN}✅ PIX Service: Healthy${NC}"
else
    echo -e "${RED}❌ PIX Service: $PIX_HEALTH${NC}"
fi

# WhatsApp Service
WA_HEALTH=$(curl -s http://localhost/health?service=whatsapp | jq -r '.status' 2>/dev/null || echo "error")
if [ "$WA_HEALTH" = "ok" ]; then
    echo -e "${GREEN}✅ WhatsApp Service: Healthy${NC}"
else
    echo -e "${RED}❌ WhatsApp Service: $WA_HEALTH${NC}"
fi

# WhatsApp Connection Status
WA_CONNECTED=$(curl -s http://localhost/whatsapp-status | jq -r '.ready' 2>/dev/null || echo "false")
if [ "$WA_CONNECTED" = "true" ]; then
    echo -e "${GREEN}✅ WhatsApp: Conectado${NC}"
else
    echo -e "${RED}❌ WhatsApp: Desconectado${NC}"
fi

echo ""

# Logs recentes com errors
echo -e "${YELLOW}📋 Erros Recentes:${NC}"
docker-compose logs --tail=50 | grep -i error | tail -10

echo ""

# Espaço em disco
echo -e "${YELLOW}💽 Uso de Disco:${NC}"
df -h / | tail -1

# Volumes Docker
echo ""
echo -e "${YELLOW}📁 Volumes Docker:${NC}"
docker volume ls | grep -E "(whatsapp|pix|nginx)"

echo ""

# Rede Docker
echo -e "${YELLOW}🌐 Rede Docker:${NC}"
docker network ls | grep pix

# Comandos úteis
echo ""
echo -e "${YELLOW}🔧 Comandos Úteis:${NC}"
echo "  ./scripts/restart-pix.sh       # Reiniciar PIX service"
echo "  ./scripts/restart-whatsapp.sh  # Reiniciar WhatsApp service"
echo "  docker-compose logs -f         # Logs em tempo real"
echo "  docker-compose exec pix-service sh  # Acessar container PIX"
echo "  docker-compose exec whatsapp-service sh  # Acessar container WhatsApp"