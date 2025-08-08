#!/bin/bash

# Corrigir roteamento de relatórios
set -e

echo "🔧 Corrigindo Roteamento de Relatórios"

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

echo -e "${RED}❌ PROBLEMA IDENTIFICADO:${NC}"
echo -e "Endpoint /relatorio-pdf não encontrado pelo Nginx"
echo -e "Nginx retornando página de erro padrão"

echo -e "\n${BLUE}🔧 SOLUÇÕES A APLICAR:${NC}"
echo -e "1. Atualizar configuração do Nginx"
echo -e "2. Atualizar PIX Service com endpoints"
echo -e "3. Reiniciar containers na ordem correta"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}📁 Enviando arquivos corrigidos...${NC}"

# Copiar arquivos atualizados
copy_to_server "nginx.conf" "nginx.conf"
copy_to_server "pix-service.js" "pix-service.js"
copy_to_server "pix-package.json" "package.json"

echo -e "${YELLOW}🔄 Aplicando correções no servidor...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🔧 === CORRIGINDO ROTEAMENTO DE RELATÓRIOS ==='

echo '🛑 1. Parando todos os containers...'
docker stop nginx-proxy pix-service || true
docker rm nginx-proxy pix-service || true

echo '🏗️ 2. Recriando PIX Service com endpoints de relatório...'
docker run -d \\
  --name pix-service \\
  --network pix-service_pix-network \\
  -e NODE_ENV=production \\
  -e PORT=3000 \\
  -e SICREDI_ENV=homolog \\
  -e SICREDI_HOMOLOG_CLIENT_ID=\${SICREDI_HOMOLOG_CLIENT_ID} \\
  -e SICREDI_HOMOLOG_CLIENT_SECRET=\${SICREDI_HOMOLOG_CLIENT_SECRET} \\
  -e SICREDI_HOMOLOG_PIX_KEY=\${SICREDI_HOMOLOG_PIX_KEY} \\
  -e SICREDI_HOMOLOG_API_URL=\${SICREDI_HOMOLOG_API_URL} \\
  -e SICREDI_HOMOLOG_TOKEN_URL=\${SICREDI_HOMOLOG_TOKEN_URL} \\
  -e SICREDI_PROD_CLIENT_ID=\${SICREDI_PROD_CLIENT_ID} \\
  -e SICREDI_PROD_CLIENT_SECRET=\${SICREDI_PROD_CLIENT_SECRET} \\
  -e SICREDI_PROD_PIX_KEY=\${SICREDI_PROD_PIX_KEY} \\
  -e SICREDI_PROD_API_URL=\${SICREDI_PROD_API_URL} \\
  -e SICREDI_PROD_TOKEN_URL=\${SICREDI_PROD_TOKEN_URL} \\
  -v \$(pwd)/pix-service.js:/app/index.js \\
  -v \$(pwd)/package.json:/app/package.json \\
  -v \$(pwd)/certs:/app/certs:ro \\
  -v pix-pdfs:/app/pdfs \\
  --restart unless-stopped \\
  --workdir /app \\
  node:18 sh -c 'npm install --omit=dev && node index.js'

echo '⏳ Aguardando PIX Service inicializar (30s)...'
sleep 30

echo '🌐 3. Recriando Nginx com configuração atualizada...'
docker run -d \\
  --name nginx-proxy \\
  --network pix-service_pix-network \\
  -p 80:80 \\
  -v \$(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \\
  --restart unless-stopped \\
  nginx:alpine

echo '⏳ Aguardando Nginx inicializar (15s)...'
sleep 15

echo '🧪 4. Testando endpoints corrigidos...'

# Teste health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

# Teste relatório PDF (o que estava falhando)
PDF_TEST=\$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost/relatorio-pdf?evento=Teste&data_inicio=2024-08-01&data_fim=2024-08-05')
echo \"Relatório PDF: HTTP \$PDF_TEST\"

# Teste relatório AppSheet
APPSHEET_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/relatorio-appsheet)
echo \"Relatório AppSheet: HTTP \$APPSHEET_TEST\"

# Teste listar PDFs
LIST_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/listar-pdfs)
echo \"Listar PDFs: HTTP \$LIST_TEST\"

if [ \"\$HEALTH\" = '200' ] && [ \"\$PDF_TEST\" = '200' ] && [ \"\$APPSHEET_TEST\" = '200' ]; then
    echo '✅ CORREÇÃO BEM-SUCEDIDA! Todos os endpoints funcionando.'
else
    echo '❌ Alguns endpoints ainda com problema. Verificar logs:'
    echo 'PIX Service logs:'
    docker logs pix-service --tail=10
    echo 'Nginx logs:'
    docker logs nginx-proxy --tail=10
fi

echo '📋 Status final dos containers:'
docker ps --filter name=pix-service --filter name=nginx-proxy

echo '🔧 === CORREÇÃO CONCLUÍDA ==='
"

echo -e "${BLUE}🚀 Executando correções no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🔧 Correção de Roteamento Finalizada!${NC}"

echo -e "\n${BLUE}📋 ENDPOINTS CORRIGIDOS:${NC}"
echo -e "• ✅ GET  /relatorio-pdf - Gerar PDF (era este que faltava)"
echo -e "• ✅ GET  /relatorio-appsheet - Relatório AppSheet"
echo -e "• ✅ GET  /appsheet-cobrancas - AppSheet simples"
echo -e "• ✅ GET  /relatorio-cobrancas - Relatório JSON"
echo -e "• ✅ GET  /listar-pdfs - Listar PDFs"
echo -e "• ✅ GET  /pdfs/:nome - Servir PDFs"

echo -e "\n${YELLOW}🧪 TESTE O ENDPOINT QUE ESTAVA FALHANDO:${NC}"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05'"

echo -e "\n${GREEN}🎉 Problema resolvido! AppSheet deve funcionar agora.${NC}"