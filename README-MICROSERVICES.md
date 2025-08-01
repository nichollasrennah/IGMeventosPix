# 🏗️ Arquitetura Microserviços - PIX + WhatsApp

## 📋 Visão Geral

Para resolver problemas de uso excessivo de memória, o middleware foi dividido em **3 serviços independentes**:

### 1. 🏦 PIX Service (`pix-service.js`)
- **Responsabilidade**: Integração com API Sicredi PIX
- **Memória**: ~50-80MB
- **Porta**: 3000
- **Dependências**: axios, express, body-parser, dotenv

### 2. 📱 WhatsApp Service (`whatsapp-service.js`) 
- **Responsabilidade**: Envio de mensagens WhatsApp
- **Memória**: ~200-300MB (Puppeteer + Chrome)
- **Porta**: 3001  
- **Dependências**: whatsapp-web.js, puppeteer, express

### 3. 🔗 Gateway Service (`gateway-service.js`)
- **Responsabilidade**: Coordenar PIX + WhatsApp, proxy requests
- **Memória**: ~20-30MB
- **Porta**: 3002
- **Dependências**: axios, express

## 🚀 Deploy no Render

### Opção 1: 3 Web Services Separados
```bash
# PIX Service
render.yaml: pix-render.yaml
Dockerfile: pix-dockerfile

# WhatsApp Service  
render.yaml: whatsapp-render.yaml
Dockerfile: whatsapp-dockerfile

# Gateway Service (opcional)
render.yaml: gateway-render.yaml
```

### Opção 2: 2 Web Services + URLs de integração
```bash
# PIX Service (principal)
# WhatsApp Service (separado) 
# Gateway integrado via variáveis de ambiente
```

## 🔧 Configuração

### PIX Service
```bash
# Variáveis obrigatórias
SICREDI_ENV=homolog
SICREDI_HOMOLOG_CLIENT_ID=xxx
SICREDI_HOMOLOG_CLIENT_SECRET=xxx  
SICREDI_HOMOLOG_PIX_KEY=xxx
WHATSAPP_SERVICE_URL=https://whatsapp-service.onrender.com
```

### WhatsApp Service
```bash
# Variáveis obrigatórias
WHATSAPP_ENABLED=true
NODE_ENV=production
```

### Gateway Service
```bash
# URLs dos serviços
PIX_SERVICE_URL=https://pix-service.onrender.com
WHATSAPP_SERVICE_URL=https://whatsapp-service.onrender.com
```

## 📡 Endpoints

### PIX Service (Porta 3000)
- `POST /gerar-pix` - Cobrança PIX imediata
- `POST /gerar-pix-vencimento` - Cobrança PIX com vencimento  
- `GET /consultar-pix/:txid` - Consultar cobrança
- `POST /solicitar-whatsapp` - Solicitar envio WhatsApp

### WhatsApp Service (Porta 3001)
- `POST /enviar-mensagem` - Enviar mensagem WhatsApp
- `GET /whatsapp-status` - Status da conexão
- `GET /whatsapp-qr` - Interface QR Code
- `POST /whatsapp-reconnect` - Forçar reconexão

### Gateway Service (Porta 3002)
- `POST /gerar-pix-whatsapp` - Operação integrada
- `POST /appsheet-whatsapp` - Endpoint AppSheet otimizado
- `GET /health` - Health check combinado
- Todos os endpoints como proxy

## 🔄 Fluxo de Integração

### Cenário 1: PIX + WhatsApp Integrado
```javascript
// Request para Gateway
POST /gerar-pix-whatsapp
{
  "pagamento": {...},
  "numero": "84999999999",
  "evento": "Evento XYZ"
}

// Gateway coordena:
// 1. PIX Service: gerar PIX
// 2. WhatsApp Service: enviar mensagem
// 3. Resposta imediata (assíncrono)
```

### Cenário 2: PIX com WhatsApp posterior
```javascript
// 1. Gerar PIX
POST pix-service/gerar-pix

// 2. Enviar WhatsApp
POST whatsapp-service/enviar-mensagem
```

## 💾 Vantagens da Arquitetura

### ✅ Benefícios
- **Isolamento de Memória**: Cada serviço tem seu próprio limite
- **Escalabilidade**: Escalar PIX e WhatsApp independentemente  
- **Confiabilidade**: Falha em um serviço não afeta o outro
- **Deploy Separado**: Updates independentes
- **Debugging**: Logs isolados por serviço

### 📊 Uso de Memória
```
PIX Service:      ~80MB  (sem Puppeteer)
WhatsApp Service: ~300MB (com Puppeteer + Chrome)
Gateway Service:  ~30MB  (apenas proxy)
TOTAL:           ~410MB (vs 600MB+ do monolito)
```

## 🚀 Como Executar Localmente

```bash
# Terminal 1: PIX Service
cp pix-package.json package.json
npm install
node pix-service.js

# Terminal 2: WhatsApp Service  
cp whatsapp-package.json package.json
npm install
node whatsapp-service.js

# Terminal 3: Gateway Service (opcional)
node gateway-service.js
```

## 🔍 Monitoramento

### Health Checks
- PIX Service: `GET /health`
- WhatsApp Service: `GET /health` 
- Gateway Service: `GET /health` (combinado)

### Logs Importantes
- PIX: Autenticação Sicredi, geração de PIX
- WhatsApp: Conexão, QR Code, envio de mensagens
- Gateway: Coordenação entre serviços

## 🛠️ Troubleshooting

### PIX Service não conecta
- Verificar certificados em `/certs`
- Validar credenciais Sicredi
- Checar variáveis de ambiente

### WhatsApp Service não conecta
- Acessar `/whatsapp-qr` para escanear QR Code
- Verificar se Chrome está instalado
- Checar memória disponível (mín. 300MB)

### Gateway não encontra serviços
- Verificar URLs dos serviços
- Testar conectividade entre serviços
- Validar health checks individuais

## 📝 Migration Guide

### Do Monolito para Microserviços
1. Deploy PIX Service primeiro
2. Deploy WhatsApp Service  
3. Atualizar URLs de integração
4. Testar endpoints individualmente
5. Migrar tráfego gradualmente

### Rollback
- Manter `index.js` original como backup
- Usar feature flags para alternar
- Monitorar uso de memória