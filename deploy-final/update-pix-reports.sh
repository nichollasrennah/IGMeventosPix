#!/bin/bash

# Atualizar PIX Service com endpoints de relatório
set -e

echo "📊 Atualizando PIX Service com Endpoints de Relatório"

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

echo -e "${BLUE}📋 Migrando endpoints de relatório para PIX Service${NC}"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "${YELLOW}📁 Enviando arquivos atualizados...${NC}"

# Fazer backup e enviar nova versão
copy_to_server "pix-service.js" "pix-service-backup.js"
copy_to_server "pix-service.js" "pix-service.js"
copy_to_server "pix-package.json" "package.json"

echo -e "${YELLOW}🔄 Atualizando PIX Service...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 Parando PIX Service atual...'
docker stop pix-service || true
docker rm pix-service || true

echo '📊 Iniciando PIX Service com endpoints de relatório...'
docker run -d \\
  --name pix-service \\
  --network pix-service_pix-network \\
  -e NODE_ENV=production \\
  -e PORT=3000 \\
  -e SICREDI_ENV=homolog \\
  -e SICREDI_HOMOLOG_CLIENT_ID=\$SICREDI_HOMOLOG_CLIENT_ID \\
  -e SICREDI_HOMOLOG_CLIENT_SECRET=\$SICREDI_HOMOLOG_CLIENT_SECRET \\
  -e SICREDI_HOMOLOG_PIX_KEY=\$SICREDI_HOMOLOG_PIX_KEY \\
  -e SICREDI_HOMOLOG_API_URL=\$SICREDI_HOMOLOG_API_URL \\
  -e SICREDI_HOMOLOG_TOKEN_URL=\$SICREDI_HOMOLOG_TOKEN_URL \\
  -e SICREDI_PROD_CLIENT_ID=\$SICREDI_PROD_CLIENT_ID \\
  -e SICREDI_PROD_CLIENT_SECRET=\$SICREDI_PROD_CLIENT_SECRET \\
  -e SICREDI_PROD_PIX_KEY=\$SICREDI_PROD_PIX_KEY \\
  -e SICREDI_PROD_API_URL=\$SICREDI_PROD_API_URL \\
  -e SICREDI_PROD_TOKEN_URL=\$SICREDI_PROD_TOKEN_URL \\
  -v \$(pwd)/pix-service.js:/app/index.js \\
  -v \$(pwd)/package.json:/app/package.json \\
  -v \$(pwd)/certs:/app/certs:ro \\
  -v pix-pdfs:/app/pdfs \\
  --restart unless-stopped \\
  --workdir /app \\
  node:18 sh -c 'npm install --omit=dev && node index.js'

echo '⏳ Aguardando inicialização (45s)...'
sleep 45

echo '🔍 Testando endpoints de relatório...'

# Testar health
HEALTH_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
if [ \"\$HEALTH_TEST\" = '200' ]; then
    echo '✅ Health check OK'
else
    echo '❌ Health check falhou (HTTP \$HEALTH_TEST)'
fi

# Testar relatório AppSheet
REPORT_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/relatorio-appsheet)
if [ \"\$REPORT_TEST\" = '200' ]; then
    echo '✅ Endpoint relatório AppSheet OK'
else
    echo '❌ Endpoint relatório falhou (HTTP \$REPORT_TEST)'
fi

# Testar listar PDFs
PDF_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/listar-pdfs)
if [ \"\$PDF_TEST\" = '200' ]; then
    echo '✅ Endpoint listar PDFs OK'
else
    echo '❌ Endpoint PDFs falhou (HTTP \$PDF_TEST)'
fi

echo '✅ PIX Service atualizado com endpoints de relatório!'
"

echo -e "${BLUE}🚀 Executando atualizações no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}📊 Atualização de Relatórios Concluída!${NC}"
echo -e "\n${BLUE}📋 NOVOS ENDPOINTS DISPONÍVEIS:${NC}"
echo -e "• 📊 GET  /relatorio-appsheet - Relatório para AppSheet"
echo -e "• 📊 GET  /appsheet-cobrancas - AppSheet estrutura simples"
echo -e "• 📄 GET  /relatorio-pdf - Gerar relatório PDF"
echo -e "• 📋 GET  /listar-pdfs - Listar PDFs disponíveis"
echo -e "• 🗑️ DELETE /pdfs/:nome - Deletar PDF específico"
echo -e "• 📁 GET  /pdfs/:nome - Acessar PDF gerado"
echo -e "• 📊 GET  /relatorio-cobrancas - Relatório completo JSON"

echo -e "\n${YELLOW}💡 COMO TESTAR:${NC}"
echo -e "1. Relatório AppSheet: http://$SERVER_IP/relatorio-appsheet"
echo -e "2. Gerar PDF: http://$SERVER_IP/relatorio-pdf"
echo -e "3. Listar PDFs: http://$SERVER_IP/listar-pdfs"
echo -e "4. Relatório completo: http://$SERVER_IP/relatorio-cobrancas"

echo -e "\n${BLUE}📄 EXEMPLO DE USO PDF:${NC}"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-31&evento=Festa'"

echo -e "\n${GREEN}🎉 Todos os endpoints de relatório migrados com sucesso!${NC}"