#!/bin/bash

# Corrigir geração de PDF - Chrome/Puppeteer
set -e

echo "🔧 Corrigindo Geração de PDF - Chrome Dependencies"

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
echo -e "html-pdf-node usa Puppeteer que precisa do Chrome"
echo -e "Container Node.js não tem dependências do Chrome"
echo -e "Erro: libnss3.so: cannot open shared object file"

echo -e "\n${BLUE}🔧 SOLUÇÕES:${NC}"
echo -e "1. Instalar Chrome e dependências no container"
echo -e "2. Ou usar biblioteca PDF sem Chrome (wkhtmltopdf)"
echo -e "3. Ou usar container com Chrome pré-instalado"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

echo -e "\n${YELLOW}🚀 Aplicando solução com Chrome...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando PIX Service atual...'
docker stop pix-service || true
docker rm pix-service || true

echo '🌐 2. Recriando PIX Service com Chrome completo...'
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
  --shm-size=1gb \\
  --workdir /app \\
  node:18 bash -c '
  echo \"📦 Instalando dependências do sistema...\"
  apt-get update
  apt-get install -y \\
    wget \\
    gnupg \\
    ca-certificates \\
    fonts-liberation \\
    libasound2 \\
    libatk-bridge2.0-0 \\
    libatk1.0-0 \\
    libatspi2.0-0 \\
    libcups2 \\
    libdbus-1-3 \\
    libdrm2 \\
    libgbm1 \\
    libgtk-3-0 \\
    libnspr4 \\
    libnss3 \\
    libwayland-client0 \\
    libxcomposite1 \\
    libxdamage1 \\
    libxfixes3 \\
    libxkbcommon0 \\
    libxrandr2 \\
    xdg-utils \\
    libu2f-udev \\
    libvulkan1
  
  echo \"🌐 Instalando Google Chrome...\"
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
  echo \"deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main\" > /etc/apt/sources.list.d/google.list
  apt-get update
  apt-get install -y google-chrome-stable
  
  echo \"📦 Instalando dependências Node.js...\"
  npm install --omit=dev --no-audit --no-fund
  
  echo \"🚀 Iniciando PIX Service...\"
  node index.js
  '

echo '⏳ Aguardando inicialização completa (90s)...'
sleep 90

echo '🧪 3. Testando geração de PDF...'

# Teste básico de saúde
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service rodando!'
    
    # Testar geração de PDF simples
    echo '📄 Testando geração de PDF...'
    PDF_RESPONSE=\$(curl -s 'http://localhost/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-05')
    
    if echo \"\$PDF_RESPONSE\" | grep -q 'sucesso'; then
        echo '✅ PDF gerado com sucesso!'
        echo '📋 Extraindo URL do PDF...'
        PDF_URL=\$(echo \"\$PDF_RESPONSE\" | grep -o '\"url\":\"[^\"]*\"' | cut -d'\"' -f4)
        echo \"📁 URL do PDF: \$PDF_URL\"
    else
        echo '❌ Erro na geração de PDF:'
        echo \"\$PDF_RESPONSE\" | head -5
    fi
    
    # Testar o endpoint que estava falhando
    echo '🧪 Testando endpoint específico do AppSheet...'
    APPSHEET_TEST=\$(curl -s 'http://localhost/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05')
    
    if echo \"\$APPSHEET_TEST\" | grep -q 'sucesso'; then
        echo '✅ Endpoint AppSheet funcionando!'
    else
        echo '❌ Endpoint AppSheet ainda com problema:'
        echo \"\$APPSHEET_TEST\" | head -3
    fi
    
else
    echo '❌ PIX Service não respondeu. Verificando logs:'
    docker logs pix-service --tail=20
fi

echo '📋 4. Status do container:'
docker ps --filter name=pix-service
docker stats pix-service --no-stream
"

echo -e "${BLUE}🚀 Executando correção no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🔧 Correção de PDF/Chrome Finalizada!${NC}"

echo -e "\n${BLUE}📋 CORREÇÕES APLICADAS:${NC}"
echo -e "• ✅ Google Chrome instalado no container"
echo -e "• ✅ Todas as dependências do Chromium"
echo -e "• ✅ Shared memory aumentada (--shm-size=1gb)"
echo -e "• ✅ Fontes e bibliotecas gráficas"
echo -e "• ✅ html-pdf-node deve funcionar agora"

echo -e "\n${YELLOW}🧪 TESTE O ENDPOINT CORRIGIDO:${NC}"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05'"

echo -e "\n${BLUE}📄 EXEMPLO DE RESPOSTA ESPERADA:${NC}"
echo -e '{"sucesso": true, "arquivo": {"nome": "relatorio-...", "url": "http://..."}}'

echo -e "\n${GREEN}🎉 Geração de PDF deve funcionar agora!${NC}"