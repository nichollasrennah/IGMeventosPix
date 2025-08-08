#!/bin/bash

# Teste do WhatsApp Service em funcionamento real
set -e

echo "📱 Testando WhatsApp Service Real"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🔍 Verificando status do WhatsApp...${NC}"

# Status do WhatsApp
WA_STATUS=$(curl -s http://localhost/whatsapp-status)
echo -e "${BLUE}📱 Status WhatsApp:${NC}"
echo "$WA_STATUS" | jq '.' 2>/dev/null || echo "$WA_STATUS"

# Verificar se está conectado
if echo "$WA_STATUS" | grep -q '"connected":true'; then
    if echo "$WA_STATUS" | grep -q '"simulate_mode":true'; then
        echo -e "${YELLOW}🎭 WhatsApp em modo simulação${NC}"
        MODE="simulação"
    else
        echo -e "${GREEN}📱 WhatsApp conectado ao WhatsApp Web!${NC}"
        MODE="real"
    fi
else
    echo -e "${RED}❌ WhatsApp não conectado${NC}"
    exit 1
fi

echo -e "\n${BLUE}🧪 Testando envio de mensagem direta...${NC}"

# Teste de mensagem direta
MSG_RESPONSE=$(curl -s -X POST http://localhost/enviar-mensagem \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "85999999999",
    "mensagem": "🧪 Teste WhatsApp Service\n\n⏰ '$(date)'\n📡 Modo: '${MODE}'\n\n✅ Funcionando perfeitamente!"
  }' || echo "ERROR")

if [[ "$MSG_RESPONSE" == *"sucesso"* ]]; then
    echo -e "${GREEN}✅ Mensagem direta: SUCESSO${NC}"
    
    if echo "$MSG_RESPONSE" | grep -q '"simulado":true'; then
        echo -e "${YELLOW}📱 Mensagem simulada (apareceu nos logs)${NC}"
    else
        echo -e "${GREEN}📱 Mensagem enviada via WhatsApp Web!${NC}"
        echo -e "${GREEN}📲 Verifique seu WhatsApp no número 85999999999${NC}"
    fi
else
    echo -e "${RED}❌ Mensagem direta: FALHA${NC}"
    echo "$MSG_RESPONSE" | head -3
fi

echo -e "\n${BLUE}🎯 Testando integração completa PIX + WhatsApp...${NC}"

# Teste integração completa
FULL_RESPONSE=$(curl -s -X POST http://localhost/appsheet-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "realtest123",
    "Pagador": "Usuario Real WhatsApp",
    "Valor Pix": "50.00",
    "cpf": "04644606464",
    "numero": "85999999999",
    "evento": "Teste WhatsApp Real Funcionando"
  }' || echo "ERROR")

if [[ "$FULL_RESPONSE" == *"sucesso"* ]]; then
    echo -e "${GREEN}✅ Integração completa: SUCESSO${NC}"
    
    # Extrair dados do PIX
    TXID=$(echo "$FULL_RESPONSE" | grep -o '"txid":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
    VALOR=$(echo "$FULL_RESPONSE" | grep -o '"valor":"[^"]*"' | cut -d'"' -f4 || echo "N/A")
    
    echo -e "${BLUE}💰 PIX gerado: R$ ${VALOR}${NC}"
    echo -e "${BLUE}🔑 TXID: ${TXID}${NC}"
    
    if echo "$FULL_RESPONSE" | grep -q '"simulado":true'; then
        echo -e "${YELLOW}📱 WhatsApp simulado (mensagem nos logs)${NC}"
    else
        echo -e "${GREEN}📱 WhatsApp enviado para 85999999999${NC}"
        echo -e "${GREEN}📲 Verifique mensagem PIX no WhatsApp!${NC}"
    fi
    
else
    echo -e "${RED}❌ Integração completa: FALHA${NC}"
    echo "$FULL_RESPONSE" | head -5
fi

echo -e "\n${BLUE}📋 Logs recentes do WhatsApp (últimas 15 linhas):${NC}"
docker compose logs whatsapp-service --tail=15

echo -e "\n${GREEN}📱 Teste WhatsApp Real Concluído!${NC}"

if [ "$MODE" = "real" ]; then
    echo -e "\n${GREEN}🎉 WhatsApp Web conectado e funcionando!${NC}"
    echo -e "${GREEN}📲 Verifique as mensagens no número 85999999999${NC}"
    echo -e "${YELLOW}💡 AppSheet pode usar: http://$(hostname -I | awk '{print $1}')/appsheet-whatsapp${NC}"
else
    echo -e "\n${YELLOW}🎭 WhatsApp em modo simulação${NC}"
    echo -e "${YELLOW}📝 Mensagens aparecem nos logs do container${NC}"
    echo -e "${YELLOW}💡 Para forçar reconexão real: docker compose restart whatsapp-service${NC}"
fi