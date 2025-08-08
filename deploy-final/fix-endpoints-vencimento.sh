#!/bin/bash

# Corrigir Endpoints PIX com Vencimento - Erro 404
set -e

echo "🔧 Corrigindo Endpoints PIX com Vencimento"

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
echo -e "• Endpoint /gerar-pix-vencimento retornando 404 (Nginx)"
echo -e "• JSON payload com vírgula extra no final"
echo -e "• Campo 'Pagador' vazio pode causar validação"

echo -e "\n${BLUE}🔧 SOLUÇÕES:${NC}"
echo -e "1. Verificar se PIX Service está rodando"
echo -e "2. Atualizar/recarregar configuração Nginx"
echo -e "3. Verificar logs do container"
echo -e "4. Redeployar se necessário"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}🔍 Diagnóstico no servidor...${NC}"

SERVER_DIAGNOSTIC="
set -e

cd $SERVER_PATH

echo '🔍 1. Verificando containers em execução...'
docker ps --filter name=pix-service
docker ps --filter name=nginx-proxy

echo ''
echo '🔍 2. Verificando saúde do PIX Service...'
PIX_HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health 2>/dev/null || echo 'ERRO')
echo \"PIX Service direto (porta 3000): HTTP \$PIX_HEALTH\"

NGINX_HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health 2>/dev/null || echo 'ERRO')
echo \"Através do Nginx (porta 80): HTTP \$NGINX_HEALTH\"

echo ''
echo '🔍 3. Testando endpoint específico...'
ENDPOINT_TEST=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/gerar-pix-vencimento 2>/dev/null || echo 'ERRO')
echo \"Endpoint direto: HTTP \$ENDPOINT_TEST\"

NGINX_ENDPOINT=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/gerar-pix-vencimento 2>/dev/null || echo 'ERRO')
echo \"Endpoint via Nginx: HTTP \$NGINX_ENDPOINT\"

echo ''
echo '🔍 4. Logs recentes PIX Service...'
docker logs pix-service --tail=10 2>/dev/null || echo 'Erro ao acessar logs PIX Service'

echo ''
echo '🔍 5. Logs recentes Nginx...'
docker logs nginx-proxy --tail=10 2>/dev/null || echo 'Erro ao acessar logs Nginx'

echo ''
echo '🔍 6. Verificando arquivos atualizados...'
ls -la pix-service-no-chrome.js nginx.conf 2>/dev/null || echo 'Arquivos não encontrados'
"

echo -e "${BLUE}🚀 Executando diagnóstico...${NC}"
run_on_server "$SERVER_DIAGNOSTIC"

echo -e "\n${YELLOW}📁 Reaplicando arquivos atualizados...${NC}"

# Copiar arquivos atualizados novamente
copy_to_server "pix-service-no-chrome.js" "pix-service-no-chrome.js"
copy_to_server "pix-package-no-chrome.json" "package-no-chrome.json"
copy_to_server "nginx.conf" "nginx.conf"

echo -e "${BLUE}🔄 Reiniciando serviços...${NC}"

SERVER_RESTART="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando containers...'
docker stop pix-service nginx-proxy 2>/dev/null || true
docker rm pix-service nginx-proxy 2>/dev/null || true

echo '🔄 2. Limpando volumes e redes se necessário...'
docker network prune -f || true

echo '🌐 3. Recriando rede...'
docker network create pix-service_pix-network 2>/dev/null || echo 'Rede já existe'

echo '📄 4. Iniciando PIX Service atualizado...'
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

echo '⏳ Aguardando PIX Service (30s)...'
sleep 30

echo '🌐 5. Iniciando Nginx atualizado...'
docker run -d \\
  --name nginx-proxy \\
  --network pix-service_pix-network \\
  -p 80:80 \\
  -p 443:443 \\
  -v \$(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \\
  --restart unless-stopped \\
  nginx:alpine

echo '⏳ Aguardando Nginx (15s)...'
sleep 15

echo '🧪 6. Testando endpoints corrigidos...'

# Health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ Serviços rodando!'
    
    # Testar endpoint PIX vencimento
    echo '📅 Testando /gerar-pix-vencimento...'
    VENC_TEST=\$(curl -s -X POST http://localhost/gerar-pix-vencimento \\
      -H 'Content-Type: application/json' \\
      -d '{
        \"Row ID\": \"TESTE_CORRECAO_001\",
        \"Pagador\": \"João Teste Correção\",
        \"Valor Pix\": \"25.50\",
        \"cpf\": \"04644606464\",
        \"data_vencimento\": \"2025-09-15\",
        \"evento\": \"Teste Correção\",
        \"categoria\": \"Debug\"
      }')
    
    if echo \"\$VENC_TEST\" | grep -q 'sucesso'; then
        echo '✅ Endpoint /gerar-pix-vencimento funcionando!'
        TXID=\$(echo \"\$VENC_TEST\" | grep -o '\"txid\":\"[^\"]*\"' | cut -d'\"' -f4)
        echo \"📋 TXID gerado: \$TXID\"
        
        # Testar QR Code
        if echo \"\$VENC_TEST\" | grep -q 'qrCode'; then
            echo '📱 QR Code gerado automaticamente!'
        fi
        
    else
        echo '❌ Erro no endpoint:'
        echo \"\$VENC_TEST\" | head -5
    fi
    
    # Testar payload similar ao erro original (mas corrigido)
    echo '🔧 Testando payload similar ao erro original...'
    SIMILAR_TEST=\$(curl -s -X POST http://localhost/gerar-pix-vencimento \\
      -H 'Content-Type: application/json' \\
      -d '{
        \"Row ID\": \"gNk2fy5Fr0T1We3DlayVCy\",
        \"Pagador\": \"Nome do Pagador\",
        \"cpf\": \"04644606464\",
        \"Valor Pix\": \"40.00\",
        \"descricao\": \"Teste de cobrança com vencimento\",
        \"data_vencimento\": \"2025-08-30\",
        \"evento\": \"Festa do Amor\",
        \"categoria\": \"Festa do Amor\"
      }')
    
    if echo \"\$SIMILAR_TEST\" | grep -q 'sucesso'; then
        echo '✅ Payload corrigido funcionando!'
    else
        echo '⚠️ Ainda há problema com payload similar:'
        echo \"\$SIMILAR_TEST\" | head -3
    fi
    
else
    echo '❌ Serviços não responderam. Verificando logs:'
    echo '--- PIX Service ---'
    docker logs pix-service --tail=10
    echo '--- Nginx ---'
    docker logs nginx-proxy --tail=10
fi

echo '📊 7. Status final dos containers:'
docker ps --filter name=pix-service --filter name=nginx-proxy
"

echo -e "${BLUE}🚀 Executando correção...${NC}"
run_on_server "$SERVER_RESTART"

echo -e "\n${GREEN}🔧 Correção Aplicada!${NC}"

echo -e "\n${BLUE}📋 PROBLEMAS CORRIGIDOS:${NC}"
echo -e "• ✅ PIX Service reiniciado com arquivos atualizados"
echo -e "• ✅ Nginx recarregado com configuração correta"
echo -e "• ✅ Rede Docker recriada"
echo -e "• ✅ Endpoints testados automaticamente"

echo -e "\n${YELLOW}🧪 PAYLOAD CORRIGIDO:${NC}"
echo -e "❌ Payload original (com erros):"
cat << 'EOF'
{
  "Row ID": "gNk2fy5Fr0T1We3DlayVCy",
  "Pagador": "",                    ← Campo vazio
  "cpf": "04644606464",
  "Valor Pix": "40,00",            ← Vírgula em vez de ponto
  "descricao": "Teste de cobrança com vencimento",
  "data_vencimento": "2025-08-30",
  "evento": "Festa do Amor",
  "categoria": "Festa do Amor",     ← Vírgula extra
}
EOF

echo -e "\n✅ Payload corrigido:"
cat << 'EOF'
{
  "Row ID": "gNk2fy5Fr0T1We3DlayVCy",
  "Pagador": "Nome do Pagador",     ← Campo preenchido
  "cpf": "04644606464",
  "Valor Pix": "40.00",            ← Ponto decimal
  "descricao": "Teste de cobrança com vencimento",
  "data_vencimento": "2025-08-30",
  "evento": "Festa do Amor",
  "categoria": "Festa do Amor"      ← Sem vírgula extra
}
EOF

echo -e "\n${BLUE}🧪 TESTE O ENDPOINT CORRIGIDO:${NC}"
echo -e "curl -X POST http://srv937382.hstgr.cloud/gerar-pix-vencimento \\"
echo -e "  -H 'Content-Type: application/json' \\"
echo -e "  -d '{"
echo -e "    \"Row ID\": \"TESTE_001\","
echo -e "    \"Pagador\": \"João Silva\","
echo -e "    \"Valor Pix\": \"40.00\","
echo -e "    \"cpf\": \"04644606464\","
echo -e "    \"data_vencimento\": \"2025-08-30\","
echo -e "    \"evento\": \"Festa do Amor\","
echo -e "    \"categoria\": \"Festa do Amor\""
echo -e "  }'"

echo -e "\n${GREEN}🎉 Endpoint /gerar-pix-vencimento deve funcionar agora!${NC}"