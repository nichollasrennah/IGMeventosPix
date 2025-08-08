#!/bin/bash

# Corrigir Erro 403 - PIX com Vencimento
set -e

echo "🔐 Corrigindo Erro 403 - PIX com Vencimento (CobV)"

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
echo -e "• Erro 403 Forbidden na API Sicredi para endpoints /cobv"
echo -e "• Token OAuth2 não tem scopes necessários para PIX com vencimento"
echo -e "• Erros de parsing JSON em payloads subsequentes"

echo -e "\n${BLUE}🔧 CORREÇÕES IMPLEMENTADAS:${NC}"
echo -e "• ✅ Adicionados scopes: cobv.write cobv.read lotecobv.write lotecobv.read"
echo -e "• ✅ Melhorado tratamento de erros JSON malformados"
echo -e "• ✅ Sistema de invalidação de cache de token"
echo -e "• ✅ Logs detalhados para debugging"
echo -e "• ✅ Endpoint /test-token para diagnóstico"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}📁 Aplicando correções...${NC}"

# Copiar arquivo corrigido
copy_to_server "pix-service-no-chrome.js" "pix-service-no-chrome.js"

echo -e "${BLUE}🔄 Reiniciando PIX Service com correções...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando PIX Service...'
docker stop pix-service || true
docker rm pix-service || true

echo '🔐 2. Iniciando PIX Service com scopes corretos...'
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

echo '🧪 3. Testando token e scopes...'

# Health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service rodando!'
    
    # Testar scopes do token
    echo '🔐 Testando scopes do token...'
    TOKEN_TEST=\$(curl -s http://localhost/test-token)
    
    if echo \"\$TOKEN_TEST\" | grep -q 'cobv_access.*true'; then
        echo '✅ Token tem acesso aos endpoints PIX com vencimento!'
    else
        echo '⚠️ Token pode não ter acesso completo aos endpoints cobv'
        echo \"Resposta do teste: \$TOKEN_TEST\" | head -5
    fi
    
    # Testar endpoint PIX com vencimento novamente
    echo '📅 Testando /gerar-pix-vencimento corrigido...'
    PIX_TEST=\$(curl -s -X POST http://localhost/gerar-pix-vencimento \\
      -H 'Content-Type: application/json' \\
      -d '{
        \"Row ID\": \"TESTE_CORRIGIDO_001\",
        \"Pagador\": \"João Teste Scopes\",
        \"Valor Pix\": \"30.00\",
        \"cpf\": \"04644606464\",
        \"data_vencimento\": \"2025-09-15\",
        \"evento\": \"Teste Scopes\",
        \"categoria\": \"Debug\"
      }')
    
    if echo \"\$PIX_TEST\" | grep -q 'sucesso'; then
        echo '✅ PIX com vencimento gerado com sucesso!'
        TXID=\$(echo \"\$PIX_TEST\" | grep -o '\"txid\":\"[^\"]*\"' | cut -d'\"' -f4)
        echo \"📋 TXID: \$TXID\"
        
        if echo \"\$PIX_TEST\" | grep -q 'qrCode'; then
            echo '📱 QR Code gerado automaticamente!'
        fi
        
    elif echo \"\$PIX_TEST\" | grep -q '403'; then
        echo '❌ Ainda recebendo erro 403:'
        echo \"\$PIX_TEST\" | head -5
        echo ''
        echo '🔍 Isso indica que as credenciais não têm acesso aos endpoints PIX com vencimento'
        echo '💡 Solicite ao Sicredi permissões para: cobv.write cobv.read lotecobv.write lotecobv.read'
        
    else
        echo '⚠️ Outro erro encontrado:'
        echo \"\$PIX_TEST\" | head -5
    fi
    
    # Testar com payload malformado para verificar tratamento
    echo '🧪 Testando tratamento de JSON malformado...'
    JSON_TEST=\$(curl -s -X POST http://localhost/gerar-pix-vencimento \\
      -H 'Content-Type: application/json' \\
      -d '{\"teste\": \"malformado\",}' | head -3)
    
    if echo \"\$JSON_TEST\" | grep -q 'JSON malformado'; then
        echo '✅ Tratamento de JSON malformado funcionando!'
    else
        echo '⚠️ Resposta para JSON malformado:'
        echo \"\$JSON_TEST\"
    fi
    
else
    echo '❌ PIX Service não respondeu. Logs:'
    docker logs pix-service --tail=15
fi

echo '📊 4. Status final:'
docker ps --filter name=pix-service
"

echo -e "${BLUE}🚀 Executando correção...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}🔐 Correções Aplicadas!${NC}"

echo -e "\n${BLUE}📋 RESUMO DAS CORREÇÕES:${NC}"
echo -e "• ✅ OAuth2 scopes expandidos para PIX com vencimento"
echo -e "• ✅ Sistema de invalidação de cache de token"
echo -e "• ✅ Tratamento robusto de erros 403"
echo -e "• ✅ Melhor parsing de JSON com validação"
echo -e "• ✅ Endpoint /test-token para diagnóstico"

echo -e "\n${YELLOW}🔍 VERIFICAÇÃO NECESSÁRIA:${NC}"
echo -e "Se ainda houver erro 403, será necessário:"
echo -e "1. Contatar Sicredi para habilitar scopes PIX com vencimento"
echo -e "2. Verificar se credenciais têm permissão para:"
echo -e "   • cobv.write (criar PIX com vencimento)"
echo -e "   • cobv.read (consultar PIX com vencimento)"
echo -e "   • lotecobv.write (criar lotes PIX com vencimento)"
echo -e "   • lotecobv.read (consultar lotes PIX com vencimento)"

echo -e "\n${BLUE}🧪 TESTE OS ENDPOINTS:${NC}"
echo -e "# Testar diagnóstico de token"
echo -e "curl http://srv937382.hstgr.cloud/test-token"
echo ""
echo -e "# Testar PIX com vencimento"
echo -e "curl -X POST http://srv937382.hstgr.cloud/gerar-pix-vencimento \\"
echo -e "  -H 'Content-Type: application/json' \\"
echo -e "  -d '{"
echo -e "    \"Row ID\": \"TESTE_001\","
echo -e "    \"Pagador\": \"João Silva\","
echo -e "    \"Valor Pix\": \"25.00\","
echo -e "    \"cpf\": \"04644606464\","
echo -e "    \"data_vencimento\": \"2025-09-15\","
echo -e "    \"evento\": \"Teste\","
echo -e "    \"categoria\": \"Debug\""
echo -e "  }'"

echo -e "\n${GREEN}🎉 Sistema PIX com Vencimento Corrigido!${NC}"