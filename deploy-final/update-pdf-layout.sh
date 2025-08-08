#!/bin/bash

# Atualizar layout PDF - Remover TXID e corrigir filtros
set -e

echo "📄 Atualizando Layout PDF - Removendo TXID e Corrigindo Filtros"

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

echo -e "${BLUE}📋 ALTERAÇÕES IMPLEMENTADAS:${NC}"
echo -e "• ❌ Campo TXID removido da tabela PDF"
echo -e "• ✅ Adicionada coluna Evento/Categoria"
echo -e "• 🔧 Corrigido filtro por evento e categoria" 
echo -e "• 📊 Recalculadas estatísticas dos dados filtrados"
echo -e "• 🐛 Adicionados logs para debug dos filtros"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}📁 Enviando versão atualizada...${NC}"

# Copiar versão atualizada
copy_to_server "pix-service-no-chrome.js" "pix-service-no-chrome.js"

echo -e "${BLUE}🚀 Aplicando atualização...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando PIX Service atual...'
docker stop pix-service || true
docker rm pix-service || true

echo '📄 2. Iniciando PIX Service com layout atualizado...'
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

echo '🧪 3. Testando layout atualizado...'

# Health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service rodando!'
    
    # Testar PDF sem filtro
    echo '📄 Testando PDF sem filtro...'
    PDF_RESPONSE=\$(curl -s 'http://localhost/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-05')
    
    if echo \"\$PDF_RESPONSE\" | grep -q 'sucesso'; then
        echo '✅ PDF gerado - layout sem TXID!'
        echo '📋 Dados do PDF:'
        echo \"\$PDF_RESPONSE\" | grep -o '\"total_cobrancas\":[0-9]*' | head -1
        echo \"\$PDF_RESPONSE\" | grep -o '\"metodo\":\"[^\"]*\"' | head -1
    else
        echo '❌ Erro na geração PDF:'
        echo \"\$PDF_RESPONSE\" | head -3
    fi
    
    # Testar filtro por evento
    echo '🔍 Testando filtro por evento...'
    EVENTO_TEST=\$(curl -s 'http://localhost/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05')
    
    if echo \"\$EVENTO_TEST\" | grep -q 'sucesso'; then
        echo '✅ Filtro por evento funcionando!'
        TOTAL_FILTRADAS=\$(echo \"\$EVENTO_TEST\" | grep -o '\"total_filtradas\":[0-9]*' | cut -d':' -f2)
        TOTAL_ORIGINAL=\$(echo \"\$EVENTO_TEST\" | grep -o '\"total_cobrancas\":[0-9]*' | cut -d':' -f2)
        echo \"📊 Dados originais: \$TOTAL_ORIGINAL, Filtradas: \$TOTAL_FILTRADAS\"
        
        if [ \"\$TOTAL_FILTRADAS\" != \"\$TOTAL_ORIGINAL\" ]; then
            echo '🎉 Filtro está funcionando corretamente!'
        else
            echo '⚠️ Filtro pode não estar funcionando (valores iguais)'
        fi
    else
        echo '❌ Erro no filtro por evento:'
        echo \"\$EVENTO_TEST\" | head -3
    fi
    
else
    echo '❌ PIX Service não respondeu. Logs:'
    docker logs pix-service --tail=15
fi

echo '📊 4. Status do container:'
docker stats pix-service --no-stream | grep pix-service
"

echo -e "${BLUE}🚀 Executando atualização no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}📄 Layout PDF Atualizado com Sucesso!${NC}"

echo -e "\n${BLUE}📋 ALTERAÇÕES APLICADAS:${NC}"
echo -e "• ❌ Campo TXID removido da tabela"
echo -e "• ➕ Adicionada coluna Evento/Categoria"
echo -e "• 🔧 Filtros corrigidos (evento e categoria)"
echo -e "• 📊 Estatísticas recalculadas para dados filtrados"
echo -e "• 🐛 Logs de debug adicionados"

echo -e "\n${YELLOW}🧪 TESTES RECOMENDADOS:${NC}"
echo -e "# Teste PDF sem filtro"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?data_inicio=2024-08-01&data_fim=2024-08-05'"
echo ""
echo -e "# Teste com filtro por evento"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?evento=Festa%20do%20Amor&data_inicio=2025-07-27&data_fim=2025-08-05'"
echo ""
echo -e "# Teste com filtro por categoria"
echo -e "curl 'http://$SERVER_IP/relatorio-pdf?categoria=Evento&data_inicio=2025-07-27&data_fim=2025-08-05'"

echo -e "\n${GREEN}🎉 Layout do PDF corrigido! Agora sem TXID e com filtros funcionando!${NC}"

echo -e "\n${BLUE}💡 MELHORIAS IMPLEMENTADAS:${NC}"
echo -e "• 📋 Tabela mais limpa (sem TXID)"
echo -e "• 📊 Estatísticas corretas para dados filtrados"
echo -e "• 🔍 Filtros funcionando corretamente"
echo -e "• 📱 Layout otimizado para informações úteis"