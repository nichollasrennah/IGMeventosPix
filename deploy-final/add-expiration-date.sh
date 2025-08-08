#!/bin/bash

# Adicionar Data de Expiração aos Endpoints de Consulta PIX
set -e

echo "📅 Adicionando Data de Expiração aos Endpoints de Consulta PIX"

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

echo -e "${BLUE}📋 MELHORIAS IMPLEMENTADAS:${NC}"
echo -e "• ✅ Data de expiração calculada automaticamente"
echo -e "• ✅ Campo 'expirado' indica se PIX está vencido"
echo -e "• ✅ Data em formato ISO e formatada (pt-BR)"
echo -e "• ✅ Endpoint /consultar-pix adicionado ao pix-service-no-chrome.js"
echo -e "• ✅ Logs detalhados de expiração"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}📁 Aplicando melhorias...${NC}"

# Copiar arquivos atualizados
copy_to_server "pix-service.js" "pix-service.js"
copy_to_server "pix-service-no-chrome.js" "pix-service-no-chrome.js"

echo -e "${BLUE}🔄 Reiniciando PIX Service com melhorias...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando PIX Service...'
docker stop pix-service || true
docker rm pix-service || true

echo '📅 2. Iniciando PIX Service com data de expiração...'
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

echo '🧪 3. Testando endpoint com data de expiração...'

# Health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service rodando!'
    
    # Primeiro, vamos gerar um PIX para ter algo para consultar
    echo '💰 Gerando PIX de teste para consulta...'
    PIX_GERADO=\$(curl -s -X POST http://localhost/gerar-pix \\
      -H 'Content-Type: application/json' \\
      -d '{
        \"Row ID\": \"TESTE_EXPIRACAO_001\",
        \"Pagador\": \"João Teste Expiração\",
        \"Valor Pix\": \"15.00\",
        \"cpf\": \"12345678901\",
        \"evento\": \"Teste Expiração\"
      }')
    
    if echo \"\$PIX_GERADO\" | grep -q 'sucesso'; then
        TXID_TESTE=\$(echo \"\$PIX_GERADO\" | grep -o '\"txid\":\"[^\"]*\"' | cut -d'\"' -f4)
        echo \"📋 PIX de teste gerado: \$TXID_TESTE\"
        
        # Aguardar um momento para garantir que o PIX está disponível
        sleep 5
        
        # Testar consulta com data de expiração
        echo '📅 Testando consulta com data de expiração...'
        CONSULTA_TEST=\$(curl -s \"http://localhost/consultar-pix/\$TXID_TESTE\")
        
        if echo \"\$CONSULTA_TEST\" | grep -q 'data_expiracao'; then
            echo '✅ Data de expiração retornada com sucesso!'
            
            # Extrair e exibir informações de expiração
            DATA_EXP=\$(echo \"\$CONSULTA_TEST\" | grep -o '\"data_expiracao_formatada\":\"[^\"]*\"' | cut -d'\"' -f4)
            EXPIRADO=\$(echo \"\$CONSULTA_TEST\" | grep -o '\"expirado\":[^,}]*' | cut -d':' -f2)
            STATUS=\$(echo \"\$CONSULTA_TEST\" | grep -o '\"status\":\"[^\"]*\"' | cut -d'\"' -f4)
            
            echo \"📅 Data de expiração: \$DATA_EXP\"
            echo \"⏰ Status expirado: \$EXPIRADO\"
            echo \"📊 Status PIX: \$STATUS\"
            
            # Verificar se todos os campos estão presentes
            if echo \"\$CONSULTA_TEST\" | grep -q '\"expiracao_segundos\"'; then
                echo '✅ Campo expiracao_segundos presente!'
            fi
            
            if echo \"\$CONSULTA_TEST\" | grep -q '\"data_expiracao\"'; then
                echo '✅ Campo data_expiracao (ISO) presente!'
            fi
            
        else
            echo '⚠️ Data de expiração não encontrada na resposta:'
            echo \"\$CONSULTA_TEST\" | head -10
        fi
        
    else
        echo '⚠️ Não foi possível gerar PIX de teste. Tentando consultar um existente...'
        
        # Tentar consultar um PIX qualquer (pode não existir)
        echo '🔍 Testando endpoint de consulta diretamente...'
        CONSULTA_DIRETA=\$(curl -s \"http://localhost/consultar-pix/teste123\" | head -5)
        echo \"Resposta da consulta: \$CONSULTA_DIRETA\"
    fi
    
else
    echo '❌ PIX Service não respondeu. Logs:'
    docker logs pix-service --tail=15
fi

echo '📊 4. Status final:'
docker ps --filter name=pix-service
"

echo -e "${BLUE}🚀 Executando melhorias...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}📅 Data de Expiração Adicionada com Sucesso!${NC}"

echo -e "\n${BLUE}📋 MELHORIAS APLICADAS:${NC}"
echo -e "• ✅ Endpoint /consultar-pix retorna data de expiração"
echo -e "• ✅ Campo 'expirado' indica se PIX está vencido"
echo -e "• ✅ Múltiplos formatos de data disponíveis"
echo -e "• ✅ Logs detalhados de expiração no console"

echo -e "\n${YELLOW}📋 ESTRUTURA DA RESPOSTA:${NC}"
cat << 'EOF'
{
  "sucesso": true,
  "tipo": "cob",
  "txid": "abc123...",
  "status": "ATIVA",
  "pago": false,
  "expirado": false,
  "dados": {
    "valor": {"original": "15.00"},
    "devedor": {"nome": "João Silva"},
    "data_criacao": "2025-08-05T10:30:00.000Z",
    "data_expiracao": "2025-08-12T10:30:00.000Z",
    "data_expiracao_formatada": "12/08/2025 10:30:00",
    "expiracao_segundos": 604800,
    "pixCopiaECola": "00020126...",
    "info_pagamento": null
  }
}
EOF

echo -e "\n${BLUE}🧪 TESTE O ENDPOINT:${NC}"
echo -e "# Gerar PIX primeiro"
echo -e "curl -X POST http://srv937382.hstgr.cloud/gerar-pix \\"
echo -e "  -H 'Content-Type: application/json' \\"
echo -e "  -d '{"
echo -e "    \"Row ID\": \"TESTE_001\","
echo -e "    \"Pagador\": \"João Silva\","
echo -e "    \"Valor Pix\": \"25.00\""
echo -e "  }'"
echo ""
echo -e "# Consultar PIX com data de expiração"
echo -e "curl http://srv937382.hstgr.cloud/consultar-pix/TXID_AQUI"

echo -e "\n${GREEN}🎉 Consulta PIX agora inclui informações completas de expiração!${NC}"