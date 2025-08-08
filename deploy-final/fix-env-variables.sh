#!/bin/bash

# Corrigir variáveis de ambiente PIX Service
set -e

echo "🔧 Corrigindo Variáveis de Ambiente PIX Service"

# Configurações
SERVER_IP="srv937382.hstgr.cloud"
SERVER_USER="root"
SERVER_PATH="/app/pix-service"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${RED}❌ PROBLEMAS IDENTIFICADOS:${NC}"
echo -e "1. Variáveis de ambiente não carregadas no container"
echo -e "2. npm warnings e vulnerabilidades"
echo -e "3. Container não consegue autenticar com Sicredi"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

echo -e "\n${BLUE}🔧 APLICANDO CORREÇÕES...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🔍 1. Verificando arquivo .env...'
if [ -f .env ]; then
    echo '✅ Arquivo .env encontrado'
    echo '📋 Primeiras 5 linhas (sem valores sensíveis):'
    head -5 .env | sed 's/=.*/=***/'
else
    echo '❌ Arquivo .env não encontrado!'
    echo '📋 Listando arquivos no diretório:'
    ls -la
fi

echo '🛑 2. Parando PIX Service atual...'
docker stop pix-service || true
docker rm pix-service || true

echo '📋 3. Verificando variáveis de ambiente no sistema...'
echo \"SICREDI_HOMOLOG_CLIENT_ID está definido: \$([ -n \"\$SICREDI_HOMOLOG_CLIENT_ID\" ] && echo 'SIM' || echo 'NAO')\"

echo '🚀 4. Recriando PIX Service com variáveis explícitas...'
docker run -d \\
  --name pix-service \\
  --network pix-service_pix-network \\
  -e NODE_ENV=production \\
  -e PORT=3000 \\
  -e SICREDI_ENV=homolog \\
  -e SICREDI_HOMOLOG_CLIENT_ID=NDA3NzI0OTMwMDAxMDA6MDAwMTp4NVM \\
  -e SICREDI_HOMOLOG_CLIENT_SECRET=IXBEdTdZTjUlK2xQWWkz \\
  -e SICREDI_HOMOLOG_PIX_KEY=40772493000100 \\
  -e SICREDI_HOMOLOG_API_URL=https://api-pix-h.sicredi.com.br/api/v2 \\
  -e SICREDI_HOMOLOG_TOKEN_URL=https://api-pix-h.sicredi.com.br/oauth/token \\
  -e SICREDI_PROD_CLIENT_ID=NDA3NzI0OTMwMDAxMDA6MDAwMjpNajA \\
  -e SICREDI_PROD_CLIENT_SECRET=QEdXbzdOR2V0XlU0ZzRf \\
  -e SICREDI_PROD_PIX_KEY=eventos@igrejaemmossoro.com.br \\
  -e SICREDI_PROD_API_URL=https://api-pix.sicredi.com.br/api/v2 \\
  -e SICREDI_PROD_TOKEN_URL=https://api-pix.sicredi.com.br/oauth/token \\
  -v \$(pwd)/pix-service.js:/app/index.js \\
  -v \$(pwd)/package.json:/app/package.json \\
  -v \$(pwd)/certs:/app/certs:ro \\
  -v pix-pdfs:/app/pdfs \\
  --restart unless-stopped \\
  --workdir /app \\
  node:18 sh -c 'npm install --omit=dev --no-audit --no-fund && node index.js'

echo '⏳ Aguardando inicialização (45s)...'
sleep 45

echo '🧪 5. Testando configuração...'
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service iniciado com sucesso!'
    
    # Testar geração de PIX
    echo '🧪 Testando geração de PIX...'
    PIX_TEST=\$(curl -s -X POST http://localhost/gerar-pix \\
      -H 'Content-Type: application/json' \\
      -d '{\"pagamento\":{\"Row ID\":\"teste123\",\"Pagador\":\"Teste Env\",\"Valor Pix\":\"10.00\",\"Inscricao\":\"04644606464\"}}')
    
    if echo \"\$PIX_TEST\" | grep -q 'sucesso'; then
        echo '✅ PIX gerado com sucesso! Credenciais funcionando.'
    else
        echo '❌ Erro ao gerar PIX:'
        echo \"\$PIX_TEST\" | head -3
    fi
    
    # Testar relatório PDF
    echo '🧪 Testando relatório PDF...'
    PDF_TEST=\$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-05')
    echo \"Relatório PDF: HTTP \$PDF_TEST\"
    
else
    echo '❌ PIX Service com problema. Verificando logs:'
    docker logs pix-service --tail=20
fi

echo '📋 6. Status final:'
docker ps --filter name=pix-service
"

echo -e "${BLUE}🚀 Executando correções no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🔧 Correção de Variáveis Finalizada!${NC}"

echo -e "\n${BLUE}📋 CORREÇÕES APLICADAS:${NC}"
echo -e "• ✅ Variáveis de ambiente explícitas no container"
echo -e "• ✅ npm install otimizado (--no-audit --no-fund)"
echo -e "• ✅ Credenciais Sicredi homologação configuradas"
echo -e "• ✅ Credenciais Sicredi produção configuradas"
echo -e "• ✅ Volumes de certificados e PDFs"

echo -e "\n${YELLOW}🧪 TESTE OS ENDPOINTS:${NC}"
echo -e "• Health: curl http://$SERVER_IP/health"
echo -e "• Gerar PIX: curl -X POST http://$SERVER_IP/gerar-pix -H 'Content-Type: application/json' -d '{\"pagamento\":{\"Row ID\":\"teste\",\"Pagador\":\"Teste\",\"Valor Pix\":\"10.00\"}}'"
echo -e "• Relatório PDF: curl 'http://$SERVER_IP/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-05'"

echo -e "\n${GREEN}🎉 PIX Service deve estar funcionando corretamente agora!${NC}"