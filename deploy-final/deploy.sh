#!/bin/bash

# Deploy automatizado PIX Service
set -e

echo "🚀 Iniciando deploy PIX Service..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "======================================"
echo "   PIX SERVICE - IGREJA EM MOSSORO"
echo "======================================"
echo -e "${NC}"

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não está instalado!${NC}"
    exit 1
fi

# Verificar Docker Compose (v1 ou v2)
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo -e "${GREEN}✅ Docker Compose v1 encontrado${NC}"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    echo -e "${GREEN}✅ Docker Compose v2 encontrado${NC}"
else
    echo -e "${RED}❌ Docker Compose não está instalado!${NC}"
    echo -e "${YELLOW}📋 Para instalar: apt install docker-compose-plugin${NC}"
    exit 1
fi

# Verificar arquivos necessários
echo -e "${YELLOW}📋 Verificando arquivos necessários...${NC}"

required_files=("docker-compose.yml" "nginx.conf" "pix-service.js" "pix-package.json" "whatsapp-service.js" "whatsapp-package.json" ".env")
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Arquivo $file não encontrado!${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ $file${NC}"
    fi
done

# Verificar certificados
echo -e "${YELLOW}🔐 Verificando certificados...${NC}"
if [ ! -d "certs" ]; then
    echo -e "${YELLOW}⚠️ Diretório 'certs' não encontrado, criando...${NC}"
    mkdir -p certs
    echo -e "${YELLOW}📋 IMPORTANTE: Coloque os certificados Sicredi no diretório 'certs/':${NC}"
    echo -e "${YELLOW}   - cert.cer${NC}"
    echo -e "${YELLOW}   - api.key${NC}"
    echo -e "${YELLOW}   - ca-homolog-sicredi.pem${NC}"
fi

cert_files=("cert.cer" "api.key")
for cert in "${cert_files[@]}"; do
    if [ ! -f "certs/$cert" ]; then
        echo -e "${YELLOW}⚠️ Certificado certs/$cert não encontrado${NC}"
    else
        echo -e "${GREEN}✅ certs/$cert${NC}"
    fi
done

# Verificar configuração .env
echo -e "${YELLOW}⚙️ Verificando configuração...${NC}"
if grep -q "SUAS_CREDENCIAIS_AQUI" .env; then
    echo -e "${RED}❌ Configure suas credenciais no arquivo .env antes de continuar!${NC}"
    echo -e "${YELLOW}📝 Edite o arquivo .env e substitua 'SUAS_CREDENCIAIS_AQUI' pelas credenciais reais${NC}"
    exit 1
fi

# Parar containers existentes
echo -e "${YELLOW}🛑 Parando containers existentes...${NC}"
$DOCKER_COMPOSE down --remove-orphans 2>/dev/null || true

# Limpar imagens antigas (opcional)
echo -e "${YELLOW}🧹 Limpando recursos Docker antigos...${NC}"
docker system prune -f

# Verificar espaço em disco
echo -e "${YELLOW}💽 Verificando espaço em disco...${NC}"
df -h . | tail -1

# Build e iniciar containers
echo -e "${YELLOW}🔨 Iniciando containers...${NC}"
$DOCKER_COMPOSE up -d

# Aguardar inicialização
echo -e "${YELLOW}⏳ Aguardando inicialização dos serviços...${NC}"
sleep 30

# Verificar status dos containers
echo -e "${YELLOW}🔍 Verificando status dos containers...${NC}"
$DOCKER_COMPOSE ps

# Health checks
echo -e "${YELLOW}🏥 Executando health checks...${NC}"

# Verificar PIX Service
echo -e "${BLUE}📋 Testando PIX Service...${NC}"
PIX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health || echo "000")
if [ "$PIX_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ PIX Service: Healthy (HTTP $PIX_HEALTH)${NC}"
else
    echo -e "${RED}❌ PIX Service: Unhealthy (HTTP $PIX_HEALTH)${NC}"
    echo -e "${YELLOW}📋 Verificando logs do PIX Service:${NC}"
    $DOCKER_COMPOSE logs pix-service --tail=10
fi

# Verificar WhatsApp Service
echo -e "${BLUE}📋 Testando WhatsApp Service...${NC}"
WHATSAPP_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/whatsapp-status || echo "000")
if [ "$WHATSAPP_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ WhatsApp Service: Healthy (HTTP $WHATSAPP_HEALTH)${NC}"
else
    echo -e "${RED}❌ WhatsApp Service: Unhealthy (HTTP $WHATSAPP_HEALTH)${NC}"
    echo -e "${YELLOW}📋 Verificando logs do WhatsApp Service:${NC}"
    $DOCKER_COMPOSE logs whatsapp-service --tail=10
fi

# Verificar Nginx
echo -e "${BLUE}📋 Testando Nginx Proxy...${NC}"
NGINX_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ping || echo "000")
if [ "$NGINX_HEALTH" = "200" ]; then
    echo -e "${GREEN}✅ Nginx Proxy: Healthy (HTTP $NGINX_HEALTH)${NC}"
else
    echo -e "${RED}❌ Nginx Proxy: Unhealthy (HTTP $NGINX_HEALTH)${NC}"
    echo -e "${YELLOW}📋 Verificando logs do Nginx:${NC}"
    $DOCKER_COMPOSE logs nginx-proxy --tail=10
fi

# Teste de debug payload
echo -e "${BLUE}📋 Testando endpoint debug...${NC}"
DEBUG_TEST=$(curl -s -X POST http://localhost/debug-payload \
  -H "Content-Type: application/json" \
  -d '{"pagamento":{"Row ID":"test","Pagador":"Teste","Valor Pix":"10.50"}}' \
  -w "%{http_code}")

if [[ "$DEBUG_TEST" == *"200" ]]; then
    echo -e "${GREEN}✅ Debug endpoint: OK${NC}"
else
    echo -e "${YELLOW}⚠️ Debug endpoint: Verificar logs${NC}"
fi

# Mostrar informações de acesso
echo -e "${GREEN}"
echo "🎉 Deploy concluído com sucesso!"
echo ""
echo "📋 INFORMAÇÕES DE ACESSO:"
echo "🌐 Health Check PIX: http://$(hostname -I | awk '{print $1}')/health"
echo "🏓 Ping: http://$(hostname -I | awk '{print $1}')/ping"
echo "🐛 Debug PIX: http://$(hostname -I | awk '{print $1}')/debug-payload"
echo "📱 Status WhatsApp: http://$(hostname -I | awk '{print $1}')/whatsapp-status"
echo "🚀 AppSheet Integrado: http://$(hostname -I | awk '{print $1}')/appsheet-whatsapp"
echo ""
echo "📋 ENDPOINTS WHATSAPP:"
echo "💬 Enviar Mensagem: http://$(hostname -I | awk '{print $1}')/enviar-mensagem"
echo "🔄 PIX + WhatsApp: http://$(hostname -I | awk '{print $1}')/processar-pix-whatsapp"
echo ""
echo "🔧 COMANDOS ÚTEIS:"
echo "$DOCKER_COMPOSE logs -f                    # Ver logs em tempo real"
echo "$DOCKER_COMPOSE restart pix-service        # Reiniciar PIX service"
echo "$DOCKER_COMPOSE restart whatsapp-service   # Reiniciar WhatsApp service"
echo "$DOCKER_COMPOSE restart nginx-proxy        # Reiniciar Nginx"
echo "$DOCKER_COMPOSE down                       # Parar todos os containers"
echo "$DOCKER_COMPOSE up -d                      # Iniciar containers"
echo ""
echo "📊 MONITORAMENTO:"
echo "$DOCKER_COMPOSE ps                   # Status dos containers"
echo "curl http://localhost/health        # Health check"
echo ""
echo -e "${NC}"

# Verificar se há problemas
echo -e "${YELLOW}📋 Verificação final...${NC}"
CONTAINERS_UP=$($DOCKER_COMPOSE ps --services --filter "status=running" | wc -l)
TOTAL_CONTAINERS=3

if [ "$CONTAINERS_UP" -eq "$TOTAL_CONTAINERS" ]; then
    echo -e "${GREEN}✅ Todos os containers estão rodando ($CONTAINERS_UP/$TOTAL_CONTAINERS)${NC}"
else
    echo -e "${YELLOW}⚠️ Apenas $CONTAINERS_UP de $TOTAL_CONTAINERS containers estão rodando${NC}"
    echo -e "${YELLOW}📋 Verificar logs: $DOCKER_COMPOSE logs${NC}"
fi

# Logs recentes
echo -e "${YELLOW}📋 Logs recentes (últimas 10 linhas):${NC}"
$DOCKER_COMPOSE logs --tail=10

echo -e "${GREEN}🏁 Deploy finalizado!${NC}"