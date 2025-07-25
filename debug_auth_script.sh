#!/bin/bash

# Script para debug de autenticação PIX Sicredi

BASE_URL="http://localhost:3000"

echo "🔐 Debug de Autenticação PIX Sicredi"
echo "===================================="

# Verificar se o servidor está rodando
echo "1️⃣ Verificando se o servidor está ativo..."
if curl -s "$BASE_URL/health" > /dev/null; then
    echo "✅ Servidor está rodando"
else
    echo "❌ Servidor não está respondendo. Execute: npm start"
    exit 1
fi

echo ""

# Verificar variáveis de ambiente
echo "2️⃣ Verificando configuração..."
if [ -f ".env" ]; then
    echo "✅ Arquivo .env encontrado"
    
    if grep -q "CLIENT_ID=" .env && grep -q "CLIENT_SECRET=" .env; then
        echo "✅ CLIENT_ID e CLIENT_SECRET configurados"
    else
        echo "❌ CLIENT_ID ou CLIENT_SECRET não encontrados no .env"
        echo "💡 Adicione suas credenciais no arquivo .env:"
        echo "   CLIENT_ID=seu_client_id"
        echo "   CLIENT_SECRET=seu_client_secret"
        echo "   PIX_KEY=sua_chave_pix"
    fi
else
    echo "❌ Arquivo .env não encontrado"
    echo "💡 Crie um arquivo .env com suas credenciais"
fi

echo ""

# Testar autenticação
echo "3️⃣ Testando autenticação..."
echo "Isso pode demorar alguns segundos enquanto testa diferentes escopos..."
echo ""

response=$(curl -s "$BASE_URL/test-auth")
echo "$response" | jq '.' 2>/dev/null || echo "$response"

echo ""
echo "================================="

# Verificar logs do servidor
echo "💡 Dicas para resolver problemas:"
echo ""
echo "🔍 Se ainda há erro de escopo:"
echo "   1. Verifique se CLIENT_ID e CLIENT_SECRET estão corretos"
echo "   2. Confirme se a conta tem permissões PIX habilitadas"
echo "   3. Entre em contato com o suporte do Sicredi para verificar escopos"
echo ""
echo "📞 Contato Sicredi:"
echo "   - Ambiente de homologação pode ter configurações específicas"
echo "   - Verifique a documentação da API PIX Sicredi"
echo ""
echo "🔄 Para ver logs em tempo real:"
echo "   Olhe o terminal onde está rodando 'npm start'"