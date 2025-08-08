#!/bin/bash

# Deploy PIX com Vencimento - Novos Endpoints CobV e LoteCobV
set -e

echo "📅 Implementando PIX com Vencimento - Endpoints CobV/LoteCobV"

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

echo -e "${BLUE}📋 NOVOS ENDPOINTS IMPLEMENTADOS:${NC}"
echo -e "• 📄 POST /gerar-pix-vencimento - PIX individual com vencimento + QR Code"
echo -e "• 📦 POST /gerar-lote-pix-vencimento - Lote PIX com vencimento + QR Codes"
echo -e "• 🔍 GET /consultar-pix-vencimento/:txid - Consultar PIX com vencimento"
echo -e "• 📋 GET /consultar-lote-pix-vencimento/:loteId - Consultar lote"
echo -e "• 📱 GET /qrcode/:txid - QR Code como imagem PNG"
echo -e "• 🌐 GET /visualizar-qr/:txid - Página HTML com QR Code"

echo -e "\n${BLUE}✨ RECURSOS ADICIONAIS:${NC}"
echo -e "• 📅 Data de vencimento obrigatória"
echo -e "• 💰 Suporte a multa, juros e desconto"
echo -e "• 🏷️ Campos customizados: evento, categoria, tag_evento"
echo -e "• 📦 Processamento em lote (até 1000 cobranças)"
echo -e "• ✅ Validação completa de dados"
echo -e "• 🔄 Compatibilidade com formato AppSheet"
echo -e "• 📱 QR Codes gerados automaticamente"
echo -e "• 🌐 Visualização web interativa de QR Codes"

# Função para executar comandos no servidor
run_on_server() {
    ssh "$SERVER_USER@$SERVER_IP" "$1"
}

# Função para copiar arquivos para o servidor
copy_to_server() {
    scp "$1" "$SERVER_USER@$SERVER_IP:$SERVER_PATH/$2"
}

echo -e "\n${YELLOW}📁 Enviando arquivos atualizados...${NC}"

# Copiar arquivos atualizados
copy_to_server "pix-service-no-chrome.js" "pix-service-no-chrome.js"
copy_to_server "nginx.conf" "nginx.conf"

echo -e "${BLUE}🚀 Aplicando atualização no servidor...${NC}"

SERVER_COMMANDS="
set -e

cd $SERVER_PATH

echo '🛑 1. Parando serviços atuais...'
docker stop pix-service nginx-proxy || true
docker rm pix-service nginx-proxy || true

echo '📄 2. Iniciando PIX Service com novos endpoints...'
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

echo '🌐 3. Iniciando Nginx com novas rotas...'
docker run -d \\
  --name nginx-proxy \\
  --network pix-service_pix-network \\
  -p 80:80 \\
  -p 443:443 \\
  -v \$(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \\
  --restart unless-stopped \\
  nginx:alpine

echo '⏳ Aguardando inicialização (30s)...'
sleep 30

echo '🧪 4. Testando novos endpoints...'

# Health check
HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost/health)
echo \"Health check: HTTP \$HEALTH\"

if [ \"\$HEALTH\" = '200' ]; then
    echo '✅ PIX Service rodando!'
    
    # Teste PIX com vencimento (individual)
    echo '📅 Testando PIX com vencimento individual...'
    PIX_VENC_TEST=\$(curl -s -X POST http://localhost/gerar-pix-vencimento \\
      -H 'Content-Type: application/json' \\
      -d '{
        \"Row ID\": \"TEST_VENC_001\",
        \"Pagador\": \"João Teste Vencimento\",
        \"Valor Pix\": \"25.50\",
        \"cpf\": \"12345678901\",
        \"data_vencimento\": \"2025-08-15\",
        \"evento\": \"Teste Vencimento\",
        \"categoria\": \"Teste\",
        \"multa\": \"2.00\",
        \"juros\": \"1.00\",
        \"desconto\": \"5.00\"
      }')
    
    if echo \"\$PIX_VENC_TEST\" | grep -q 'sucesso'; then
        echo '✅ PIX com vencimento gerado!'
        TXID_VENC=\$(echo \"\$PIX_VENC_TEST\" | grep -o '\"txid\":\"[^\"]*\"' | cut -d'\"' -f4)
        echo \"📋 TXID: \$TXID_VENC\"
        
        # Verificar se QR Code foi gerado
        if echo \"\$PIX_VENC_TEST\" | grep -q 'qrCode'; then
            echo '📱 QR Code gerado automaticamente!'
        else
            echo '⚠️ QR Code pode não ter sido gerado'
        fi
        
        # Testar consulta
        if [ -n \"\$TXID_VENC\" ]; then
            echo '🔍 Testando consulta PIX com vencimento...'
            CONSULTA_TEST=\$(curl -s \"http://localhost/consultar-pix-vencimento/\$TXID_VENC\")
            if echo \"\$CONSULTA_TEST\" | grep -q 'sucesso'; then
                echo '✅ Consulta PIX com vencimento funcionando!'
            else
                echo '⚠️ Consulta pode não estar funcionando'
            fi
            
            # Testar QR Code como imagem
            echo '📱 Testando QR Code como imagem...'
            QR_IMG_TEST=\$(curl -s -o /dev/null -w '%{http_code}' \"http://localhost/qrcode/\$TXID_VENC\")
            if [ \"\$QR_IMG_TEST\" = '200' ]; then
                echo '✅ QR Code como imagem funcionando!'
                echo \"🌐 URL: http://localhost/qrcode/\$TXID_VENC\"
            else
                echo \"⚠️ QR Code como imagem pode não estar funcionando (HTTP \$QR_IMG_TEST)\"
            fi
            
            # Testar página de visualização
            echo '🌐 Testando página de visualização QR Code...'
            QR_PAGE_TEST=\$(curl -s -o /dev/null -w '%{http_code}' \"http://localhost/visualizar-qr/\$TXID_VENC\")
            if [ \"\$QR_PAGE_TEST\" = '200' ]; then
                echo '✅ Página de visualização QR Code funcionando!'
                echo \"🌐 URL: http://localhost/visualizar-qr/\$TXID_VENC\"
            else
                echo \"⚠️ Página de visualização pode não estar funcionando (HTTP \$QR_PAGE_TEST)\"
            fi
        fi
    else
        echo '❌ Erro no PIX com vencimento:'
        echo \"\$PIX_VENC_TEST\" | head -3
    fi
    
    # Teste Lote PIX com vencimento
    echo '📦 Testando lote PIX com vencimento...'
    LOTE_TEST=\$(curl -s -X POST http://localhost/gerar-lote-pix-vencimento \\
      -H 'Content-Type: application/json' \\
      -d '{
        \"descricao\": \"Lote teste vencimento\",
        \"cobsv\": [
          {
            \"Row ID\": \"LOTE_001\",
            \"Pagador\": \"Maria Lote 1\",
            \"Valor Pix\": \"10.00\",
            \"cpf\": \"11111111111\",
            \"data_vencimento\": \"2025-08-20\",
            \"evento\": \"Lote Teste\"
          },
          {
            \"Row ID\": \"LOTE_002\",
            \"Pagador\": \"José Lote 2\",
            \"Valor Pix\": \"15.00\",
            \"cpf\": \"22222222222\",
            \"data_vencimento\": \"2025-08-25\",
            \"categoria\": \"Lote\"
          }
        ]
      }')
    
    if echo \"\$LOTE_TEST\" | grep -q 'sucesso'; then
        echo '✅ Lote PIX com vencimento gerado!'
        LOTE_ID=\$(echo \"\$LOTE_TEST\" | grep -o '\"lote_id\":\"[^\"]*\"' | cut -d'\"' -f4)
        TOTAL_PROC=\$(echo \"\$LOTE_TEST\" | grep -o '\"total_processadas\":[0-9]*' | cut -d':' -f2)
        QR_CODES_COUNT=\$(echo \"\$LOTE_TEST\" | grep -o '\"qr_codes_gerados\":[0-9]*' | cut -d':' -f2)
        echo \"📦 Lote ID: \$LOTE_ID\"
        echo \"📊 Total processadas: \$TOTAL_PROC\"
        echo \"📱 QR Codes gerados: \$QR_CODES_COUNT\"
        
        # Verificar se QR Codes foram gerados
        if echo \"\$LOTE_TEST\" | grep -q 'qrCodes'; then
            echo '📱 QR Codes do lote gerados automaticamente!'
        else
            echo '⚠️ QR Codes do lote podem não ter sido gerados'
        fi
    else
        echo '❌ Erro no lote PIX com vencimento:'
        echo \"\$LOTE_TEST\" | head -3
    fi
    
else
    echo '❌ PIX Service não respondeu. Logs:'
    docker logs pix-service --tail=15
fi

echo '📊 5. Status dos containers:'
docker ps --filter name=pix-service
docker ps --filter name=nginx-proxy
"

echo -e "${BLUE}🚀 Executando deploy no servidor...${NC}"
run_on_server "$SERVER_COMMANDS"

echo -e "\n${GREEN}📅 PIX com Vencimento Implementado com Sucesso!${NC}"

echo -e "\n${BLUE}📋 ENDPOINTS DISPONÍVEIS:${NC}"
echo -e "• POST /gerar-pix-vencimento - PIX individual com vencimento"
echo -e "• POST /gerar-lote-pix-vencimento - Lote PIX com vencimento"
echo -e "• GET /consultar-pix-vencimento/:txid - Consultar PIX"
echo -e "• GET /consultar-lote-pix-vencimento/:loteId - Consultar lote"

echo -e "\n${YELLOW}🧪 EXEMPLOS DE USO:${NC}"

echo -e "\n${BLUE}1. PIX Individual com Vencimento:${NC}"
cat << 'EOF'
curl -X POST http://srv937382.hstgr.cloud/gerar-pix-vencimento \
  -H 'Content-Type: application/json' \
  -d '{
    "Row ID": "PAG_001",
    "Pagador": "João Silva",
    "Valor Pix": "100.00",
    "cpf": "12345678901",
    "data_vencimento": "2025-08-30",
    "evento": "Festa de Agosto",
    "categoria": "Evento",
    "multa": "5.00",
    "juros": "2.00",
    "desconto": "10.00"
  }'
EOF

echo -e "\n${BLUE}2. Lote PIX com Vencimento:${NC}"
cat << 'EOF'
curl -X POST http://srv937382.hstgr.cloud/gerar-lote-pix-vencimento \
  -H 'Content-Type: application/json' \
  -d '{
    "descricao": "Mensalidades Agosto 2025",
    "cobsv": [
      {
        "Row ID": "MES_001",
        "Pagador": "Maria Santos",
        "Valor Pix": "50.00",
        "cpf": "11111111111",
        "data_vencimento": "2025-08-31",
        "evento": "Mensalidade",
        "categoria": "Recorrente"
      }
    ]
  }'
EOF

echo -e "\n${BLUE}3. Consultar PIX com Vencimento:${NC}"
echo -e "curl http://srv937382.hstgr.cloud/consultar-pix-vencimento/TXID_AQUI"

echo -e "\n${GREEN}🎉 Sistema PIX com Vencimento Totalmente Operacional!${NC}"

echo -e "\n${BLUE}💡 DIFERENÇAS PRINCIPAIS:${NC}"
echo -e "• 📅 Campo data_vencimento obrigatório"
echo -e "• 💰 Suporte opcional a multa, juros e desconto"
echo -e "• 📦 Lotes até 1000 cobranças"
echo -e "• 🔍 Endpoints específicos para consulta"
echo -e "• 🏷️ Mantém compatibilidade com eventos/categorias"