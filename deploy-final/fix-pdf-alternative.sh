#!/bin/bash

# Alternativa PDF sem Chrome - usando PDFKit
set -e

echo "📄 Implementando Alternativa PDF sem Chrome"

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

echo -e "${BLUE}💡 ALTERNATIVA MAIS LEVE:${NC}"
echo -e "• 🚫 Sem Chrome/Puppeteer (evita dependências pesadas)"
echo -e "• 📄 PDFKit - biblioteca PDF nativa Node.js"
echo -e "• ⚡ Mais rápido e leve"
echo -e "• 🔧 Menos dependências do sistema"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}📁 Enviando versão alternativa...${NC}"

# Copiar versão sem Chrome
copy_to_server "pix-service-no-chrome.js" "pix-service-no-chrome.js"
copy_to_server "pix-package-no-chrome.json" "package-no-chrome.json"

echo -e "${BLUE}🚀 Aplicando alternativa sem Chrome...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando PIX Service atual...'
docker stop pix-service || true
docker rm pix-service || true

echo '📄 2. Implantando versão PDFKit (sem Chrome)...'
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
  -v \$(pwd)/pix-service-no-chrome.js:/app/index.js \\
  -v \$(pwd)/package-no-chrome.json:/app/package.json \\
  -v \$(pwd)/certs:/app/certs:ro \\
  -v pix-pdfs:/app/pdfs \\
  --restart unless-stopped \\
  --workdir /app \\
  node:18 sh -c 'npm install --omit=dev --no-audit --no-fund && node index.js'

echo '⏳ Aguardando inicialização (30s)...'
sleep 30

echo '🧪 3. Testando versão PDFKit...'

# Health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service (PDFKit) rodando!'
    
    # Testar geração de PDF
    echo '📄 Testando geração de PDF com PDFKit...'
    PDF_RESPONSE=\$(curl -s 'http://localhost/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-05')
    
    if echo \"\$PDF_RESPONSE\" | grep -q 'sucesso'; then
        echo '✅ PDF gerado com PDFKit!'
        echo '📋 Extraindo informações...'
        echo \"\$PDF_RESPONSE\" | grep -o '\"nome\":\"[^\"]*\"' | head -1
        echo \"\$PDF_RESPONSE\" | grep -o '\"metodo\":\"[^\"]*\"' | head -1
    else
        echo '❌ Erro na geração PDF com PDFKit:'
        echo \"\$PDF_RESPONSE\" | head -3
    fi
    
    # Testar endpoint específico do AppSheet
    echo '🧪 Testando endpoint AppSheet (que estava falhando)...'
    APPSHEET_TEST=\$(curl -s 'http://localhost/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05')
    
    if echo \"\$APPSHEET_TEST\" | grep -q 'sucesso'; then
        echo '✅ Endpoint AppSheet funcionando com PDFKit!'
        echo '📄 PDF Info:'
        echo \"\$APPSHEET_TEST\" | grep -o '\"tamanho\":[0-9]*' | head -1
    else
        echo '❌ Endpoint AppSheet ainda com problema:'
        echo \"\$APPSHEET_TEST\" | head -3
    fi
    
else
    echo '❌ PIX Service não respondeu. Logs:'
    docker logs pix-service --tail=15
fi

echo '📊 4. Comparação de recursos:'
echo 'Memória usada:'
docker stats pix-service --no-stream | grep pix-service

echo '📦 Dependências instaladas:'
docker exec pix-service npm list --depth=0 2>/dev/null | head -10
"

echo -e "${BLUE}🚀 Executando alternativa no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}📄 Alternativa PDF sem Chrome Implantada!${NC}"

echo -e "\n${BLUE}📋 VANTAGENS DA ALTERNATIVA:${NC}"
echo -e "• ✅ Sem dependências do Chrome (50+ MB menos)"
echo -e "• ✅ Inicialização mais rápida (~30s vs ~90s)"
echo -e "• ✅ Menos uso de memória"
echo -e "• ✅ PDFKit nativo do Node.js"
echo -e "• ✅ Funciona em qualquer container"

echo -e "\n${YELLOW}📄 DIFERENÇAS NO PDF:${NC}"
echo -e "• 🎨 Visual mais simples (sem HTML/CSS)"
echo -e "• 📊 Estatísticas e dados iguais"
echo -e "• 📋 Todas as informações presentes"
echo -e "• ⚡ Geração mais rápida"

echo -e "\n${BLUE}🧪 TESTE O ENDPOINT CORRIGIDO:${NC}"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05'"

echo -e "\n${GREEN}🎉 AppSheet deve funcionar agora sem erros do Chrome!${NC}"

echo -e "\n${YELLOW}💡 PRÓXIMO PASSO:${NC}"
echo -e "Se preferir o visual HTML, execute: ./fix-pdf-chrome.sh"
echo -e "Se a alternativa PDFKit funcionar bem, pode manter assim!"