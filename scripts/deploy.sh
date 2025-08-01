#!/bin/bash

# Deploy script para VPS com Docker
set -e

echo "🚀 Iniciando deploy Docker..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não está instalado!${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose não está instalado!${NC}"
    exit 1
fi

# Verificar se arquivo .env existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️ Arquivo .env não encontrado!${NC}"
    echo "Copiando .env.example para .env..."
    cp .env.example .env
    echo -e "${YELLOW}📝 Configure suas variáveis em .env antes de continuar!${NC}"
    exit 1
fi

# Verificar se certificados existem
if [ ! -d "certs" ]; then
    echo -e "${YELLOW}⚠️ Diretório 'certs' não encontrado!${NC}"
    mkdir -p certs
    echo -e "${YELLOW}📋 Coloque seus certificados Sicredi no diretório 'certs/'${NC}"
    exit 1
fi

# Pull das mudanças do Git (se estiver em repositório)
if [ -d ".git" ]; then
    echo -e "${YELLOW}📥 Atualizando código do repositório...${NC}"
    git pull origin main || echo -e "${YELLOW}⚠️ Falha ao fazer git pull (continuando...)${NC}"
fi

# Parar containers existentes
echo -e "${YELLOW}🛑 Parando containers existentes...${NC}"
docker-compose down --remove-orphans

# Limpar imagens antigas (opcional)
echo -e "${YELLOW}🧹 Limpando imagens Docker antigas...${NC}"
docker system prune -f

# Build das novas imagens
echo -e "${YELLOW}🔨 Construindo imagens Docker...${NC}"
docker-compose build --no-cache

# Iniciar serviços
echo -e "${YELLOW}▶️ Iniciando containers...${NC}"
docker-compose up -d

# Aguardar inicialização
echo -e "${YELLOW}⏳ Aguardando inicialização dos serviços...${NC}"
sleep 30

# Verificar status dos services
echo -e "${YELLOW}🔍 Verificando status dos containers...${NC}"
docker-compose ps

# Health checks
echo -e "${YELLOW}🏥 Executando health checks...${NC}"

# Verificar PIX Service
PIX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health?service=pix || echo "000")
if [ "$PIX_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ PIX Service: Healthy${NC}"
else
    echo -e "${RED}❌ PIX Service: Unhealthy (HTTP $PIX_HEALTH)${NC}"
fi

# Verificar WhatsApp Service  
WA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health?service=whatsapp || echo "000")
if [ "$WA_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ WhatsApp Service: Healthy${NC}"
else
    echo -e "${RED}❌ WhatsApp Service: Unhealthy (HTTP $WA_HEALTH)${NC}"
fi

# Verificar Nginx
NGINX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ping || echo "000")
if [ "$NGINX_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Nginx Proxy: Healthy${NC}"
else
    echo -e "${RED}❌ Nginx Proxy: Unhealthy (HTTP $NGINX_HEALTH)${NC}"
fi

# Mostrar logs recentes
echo -e "${YELLOW}📋 Logs recentes:${NC}"
docker-compose logs --tail=20

echo -e "${GREEN}🎉 Deploy concluído!${NC}"
echo -e "${GREEN}🌐 Aplicação disponível em: http://$(hostname -I | awk '{print $1}')${NC}"
echo -e "${GREEN}📱 Interface WhatsApp: http://$(hostname -I | awk '{print $1}')/whatsapp-qr${NC}"

# Comandos úteis
echo -e "${YELLOW}📋 Comandos úteis:${NC}"
echo "  docker-compose logs -f              # Ver logs em tempo real"
echo "  docker-compose restart pix-service  # Reiniciar PIX service"
echo "  docker-compose restart whatsapp-service # Reiniciar WhatsApp service"
echo "  docker-compose down                 # Parar todos os containers"
echo "  docker-compose up -d                # Iniciar containers"