#!/bin/bash

# Script para testar o middleware PIX

BASE_URL="http://localhost:3000"

echo "🧪 Testando middleware PIX Sicredi"
echo "=================================="

# Teste 1: Health Check
echo "1️⃣ Testando health check..."
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || curl -s "$BASE_URL/health"
echo -e "\n"

# Teste 2: Gerar PIX
echo "2️⃣ Gerando PIX de teste..."
curl -X POST "$BASE_URL/gerar-pix" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João da Silva",
    "cpf": "12345678909", 
    "valor": "15.00",
    "descricao": "Pagamento de teste - $(date)"
  }' | jq '.' 2>/dev/null || curl -X POST "$BASE_URL/gerar-pix" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João da Silva",
    "cpf": "12345678909",
    "valor": "15.00", 
    "descricao": "Pagamento de teste"
  }'
echo -e "\n"

# Teste 3: Teste com dados inválidos
echo "3️⃣ Testando validação (dados inválidos)..."
curl -X POST "$BASE_URL/gerar-pix" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "",
    "valor": "abc"
  }' | jq '.' 2>/dev/null || curl -X POST "$BASE_URL/gerar-pix" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "",
    "valor": "abc"
  }'
echo -e "\n"

echo "✅ Testes concluídos!"
echo "💡 Para consultar um PIX específico, use:"
echo "   curl $BASE_URL/consultar-pix/SEU_TXID_AQUI"