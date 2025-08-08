#!/bin/bash

# Teste simples do WhatsApp
echo "📱 Teste Simples WhatsApp"

# Verificar status
echo "🔍 Status WhatsApp:"
curl -s http://localhost/whatsapp-status | head -3

echo -e "\n📱 Testando mensagem simples..."
curl -X POST http://localhost/enviar-mensagem \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "85999999999",
    "mensagem": "Teste simples WhatsApp\n\nHora: '$(date)'"
  }'

echo -e "\n📋 Logs recentes:"
docker compose logs whatsapp-service --tail=10