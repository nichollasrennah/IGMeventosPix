# 🚀 PIX + WhatsApp Service - Deploy Completo

## 📋 Arquitetura

```
AppSheet → Nginx → WhatsApp Service → PIX Service → Sicredi API
                ↓
              WhatsApp Web
```

## 🐳 Containers

1. **PIX Service** (pix-service:3000)
   - Integração com API Sicredi
   - Geração de PIX imediatos
   - Multi-ambiente (homolog/prod)

2. **WhatsApp Service** (whatsapp-service:3001)
   - Automação WhatsApp Web via Puppeteer
   - Integração com PIX Service
   - Processamento completo PIX + WhatsApp

3. **Nginx Proxy** (nginx-proxy:80)
   - Reverse proxy
   - Rate limiting
   - Load balancing

## 🔧 Deploy

### 1. Preparar VPS
```bash
ssh root@31.97.95.100
apt update && apt upgrade -y
```

### 2. Instalar Docker
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose-plugin -y
```

### 3. Enviar Arquivos
Copie todos os arquivos para `/app/pix-service/`:
- docker-compose.yml
- nginx.conf
- pix-service.js + pix-package.json
- whatsapp-service.js + whatsapp-package.json
- .env
- deploy.sh
- force-update.sh

### 4. Certificados SSL
```bash
mkdir -p certs
# Coloque os certificados Sicredi:
# - cert.cer
# - api.key
# - ca-homolog-sicredi.pem (opcional)
```

### 5. Deploy
```bash
chmod +x deploy.sh
./deploy.sh
```

## 📱 Configuração WhatsApp

### Primeira Vez (QR Code)
1. Acesse logs: `docker compose logs -f whatsapp-service`
2. Se aparecer QR Code, escaneie com WhatsApp
3. Aguarde: "WhatsApp Web conectado com sucesso!"

### Reconexão Automática
- O serviço tenta reconectar automaticamente
- Máximo 5 tentativas
- Para forçar reconexão: `docker compose restart whatsapp-service`

## 🌐 Endpoints

### PIX Service
- `GET /health` - Status do PIX service
- `POST /gerar-pix` - Gerar PIX direto
- `GET /consultar-pix/:txid` - Consultar PIX
- `POST /debug-payload` - Debug de dados

### WhatsApp Service  
- `GET /whatsapp-status` - Status WhatsApp
- `POST /enviar-mensagem` - Enviar WhatsApp direto
- `POST /processar-pix-whatsapp` - PIX + WhatsApp integrado

### AppSheet Integrado
- `POST /appsheet-whatsapp` - **Endpoint principal do AppSheet**

## 📊 Monitoramento

### Status dos Containers
```bash
docker compose ps
```

### Logs em Tempo Real
```bash
docker compose logs -f
docker compose logs -f pix-service
docker compose logs -f whatsapp-service
docker compose logs -f nginx-proxy
```

### Health Checks
```bash
curl http://localhost/health          # PIX Service
curl http://localhost/whatsapp-status # WhatsApp Service
```

## 🔄 Comandos Úteis

### Reiniciar Serviços
```bash
docker compose restart pix-service
docker compose restart whatsapp-service
docker compose restart nginx-proxy
```

### Atualização Rápida
```bash
./force-update.sh  # Força recriação dos containers
```

### Parar/Iniciar
```bash
docker compose down    # Parar todos
docker compose up -d   # Iniciar todos
```

## 🧪 Teste Completo

### 1. Teste PIX Isolado
```bash
curl -X POST http://31.97.95.100/gerar-pix \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "test123",
    "Pagador": "Teste Usuario",
    "Valor Pix": "10.50",
    "cpf": "04644606464"
  }'
```

### 2. Teste WhatsApp Isolado
```bash
curl -X POST http://31.97.95.100/enviar-mensagem \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "85999999999",
    "mensagem": "Teste WhatsApp Service"
  }'
```

### 3. Teste AppSheet Completo
```bash
curl -X POST http://31.97.95.100/appsheet-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "test456",
    "Pagador": "Usuario Teste",
    "Valor Pix": "25.00",
    "cpf": "04644606464",
    "numero": "85999999999",
    "evento": "Teste Integração"
  }'
```

## ⚡ Variáveis de Ambiente

### PIX Service (.env)
```
SICREDI_ENV=homolog
SICREDI_HOMOLOG_CLIENT_ID=...
SICREDI_HOMOLOG_CLIENT_SECRET=...
# etc...
```

### WhatsApp Service (docker-compose.yml)
```
WHATSAPP_ENABLED=true     # Habilitar WhatsApp
DEBUG_MODE=false          # Debug mode
PIX_SERVICE_URL=http://pix-service:3000
```

## 🚨 Troubleshooting

### WhatsApp não conecta
1. Verificar logs: `docker compose logs whatsapp-service`
2. Reiniciar: `docker compose restart whatsapp-service`
3. Se necessário: `docker compose down && docker compose up -d`

### PIX falha
1. Verificar certificados em `/certs/`
2. Validar credenciais no `.env`
3. Testar ambiente: `curl http://localhost/health`

### AppSheet não funciona
1. Testar endpoint: `curl http://localhost/appsheet-whatsapp`
2. Verificar logs: `docker compose logs -f`
3. Validar formato dos dados do AppSheet

## 📞 Suporte

Para troubleshooting detalhado:
1. Coletar logs: `docker compose logs > logs.txt`
2. Verificar status: `docker compose ps`
3. Testar endpoints individualmente