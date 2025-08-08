# 📅 Melhorias no Endpoint /consultar-pix

Documentação das melhorias implementadas no endpoint de consulta PIX para incluir informações de data de expiração.

## 🔧 Melhorias Implementadas

### ✅ **Data de Expiração Calculada Automaticamente**
- Calcula data de expiração baseada em: `data_criacao + expiracao_segundos`
- Verifica automaticamente se o PIX está expirado
- Disponível em múltiplos formatos

### ✅ **Novos Campos na Resposta**
- `expirado`: Boolean indicando se PIX está vencido
- `data_expiracao`: Data de expiração em formato ISO
- `data_expiracao_formatada`: Data formatada em português brasileiro
- `expiracao_segundos`: Tempo de expiração original em segundos

### ✅ **Logs Detalhados**
- Console mostra data de expiração e status (VÁLIDO/EXPIRADO)
- Facilita debugging e monitoramento

## 📋 Estrutura da Resposta Atualizada

### **Resposta de Sucesso:**
```json
{
  "sucesso": true,
  "tipo": "cob",
  "txid": "abc123def456",
  "status": "ATIVA",
  "pago": false,
  "expirado": false,
  "ambiente": "homolog",
  "dados": {
    "valor": {
      "original": "25.00"
    },
    "devedor": {
      "nome": "João Silva",
      "cpf": "12345678901"
    },
    "data_criacao": "2025-08-05T10:30:00.000Z",
    "data_expiracao": "2025-08-12T10:30:00.000Z",
    "data_expiracao_formatada": "12/08/2025 10:30:00",
    "expiracao_segundos": 604800,
    "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
    "info_pagamento": null
  },
  "timestamp": "2025-08-05T14:20:00.000Z"
}
```

### **Exemplo com PIX Pago:**
```json
{
  "sucesso": true,
  "tipo": "cob",
  "txid": "def456ghi789",
  "status": "CONCLUIDA",
  "pago": true,
  "expirado": false,
  "ambiente": "homolog",
  "dados": {
    "valor": {
      "original": "50.00"
    },
    "devedor": {
      "nome": "Maria Santos",
      "cpf": "98765432100"
    },
    "data_criacao": "2025-08-04T15:00:00.000Z",
    "data_expiracao": "2025-08-11T15:00:00.000Z",
    "data_expiracao_formatada": "11/08/2025 15:00:00",
    "expiracao_segundos": 604800,
    "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
    "info_pagamento": {
      "horario": "2025-08-04T16:30:00.000Z",
      "txid": "E12345678202508041630123456789",
      "valor": "50.00"
    }
  },
  "timestamp": "2025-08-05T14:20:00.000Z"
}
```

### **Exemplo com PIX Expirado:**
```json
{
  "sucesso": true,
  "tipo": "cob",
  "txid": "ghi789jkl012",
  "status": "REMOVIDA_PELO_USUARIO_RECEBEDOR",
  "pago": false,
  "expirado": true,
  "ambiente": "homolog",
  "dados": {
    "valor": {
      "original": "75.00"
    },
    "devedor": {
      "nome": "Pedro Oliveira",
      "cpf": "11122233344"
    },
    "data_criacao": "2025-07-28T10:00:00.000Z",
    "data_expiracao": "2025-08-04T10:00:00.000Z",
    "data_expiracao_formatada": "04/08/2025 10:00:00",
    "expiracao_segundos": 604800,
    "pixCopiaECola": "00020126580014br.gov.bcb.pix...",
    "info_pagamento": null
  },
  "timestamp": "2025-08-05T14:20:00.000Z"
}
```

## 🔍 Lógica de Cálculo da Expiração

### **Algoritmo Implementado:**
```javascript
// Calcular data de expiração
if (dadosCobranca.calendario?.criacao && dadosCobranca.calendario?.expiracao) {
  const dataCriacao = new Date(dadosCobranca.calendario.criacao);
  const expiracaoSegundos = dadosCobranca.calendario.expiracao;
  
  dataExpiracao = new Date(dataCriacao.getTime() + (expiracaoSegundos * 1000));
  expirado = new Date() > dataExpiracao;
}
```

### **Casos Cobertos:**
- ✅ PIX com tempo de expiração padrão (7 dias)
- ✅ PIX com tempo de expiração customizado
- ✅ PIX sem informações de calendário (não calcula expiração)
- ✅ Verificação de expiração em tempo real

## 📊 Status Possíveis

### **Status da API Sicredi:**
- `ATIVA`: PIX ativo, aguardando pagamento
- `CONCLUIDA`: PIX pago com sucesso
- `REMOVIDA_PELO_USUARIO_RECEBEDOR`: PIX cancelado/expirado

### **Campos Adicionais:**
- `pago`: `true` se status for "CONCLUIDA"
- `expirado`: `true` se data atual > data de expiração

## 🧪 Exemplos de Teste

### **1. Consultar PIX Ativo:**
```bash
curl http://srv937382.hstgr.cloud/consultar-pix/abc123def456
```

### **2. Gerar e Consultar PIX:**
```bash
# Primeiro gerar um PIX
PIX_RESPONSE=$(curl -X POST http://srv937382.hstgr.cloud/gerar-pix \
  -H 'Content-Type: application/json' \
  -d '{
    "Row ID": "TESTE_001",
    "Pagador": "João Silva",
    "Valor Pix": "25.00"
  }')

# Extrair TXID
TXID=$(echo $PIX_RESPONSE | grep -o '"txid":"[^"]*"' | cut -d'"' -f4)

# Consultar PIX com data de expiração
curl http://srv937382.hstgr.cloud/consultar-pix/$TXID
```

### **3. Verificar PIX Expirado:**
```bash
# Consultar PIX antigo que pode estar expirado
curl http://srv937382.hstgr.cloud/consultar-pix/PIX_ANTIGO_TXID
```

## 🔧 Implementação Técnica

### **Arquivos Modificados:**
- `pix-service.js`: Endpoint original atualizado
- `pix-service-no-chrome.js`: Novo endpoint adicionado (estava ausente)

### **Compatibilidade:**
- ✅ Mantém compatibilidade com integração existente
- ✅ Adiciona campos sem quebrar estrutura atual
- ✅ Funciona em ambientes homolog e produção

### **Performance:**
- ✅ Cálculo de expiração é local (não requer chamadas adicionais)
- ✅ Cache de token mantido para eficiência
- ✅ Logs otimizados para debugging

## 📱 Integração com Apps

### **Para Developers:**
```javascript
// Verificar se PIX está expirado
const response = await fetch('/consultar-pix/TXID');
const data = await response.json();

if (data.expirado) {
  console.log('PIX expirado em:', data.dados.data_expiracao_formatada);
} else if (data.pago) {
  console.log('PIX pago em:', data.dados.info_pagamento.horario);
} else {
  console.log('PIX ativo até:', data.dados.data_expiracao_formatada);
}
```

### **Para AppSheet:**
```javascript
// Usar campo 'expirado' para lógica condicional
if (expirado == true) {
  // Mostrar status "Expirado"
} else if (pago == true) {
  // Mostrar status "Pago"  
} else {
  // Mostrar status "Aguardando pagamento"
}
```

## 🚀 Deploy das Melhorias

Para aplicar as melhorias no servidor:

```bash
./add-expiration-date.sh
```

Este script irá:
1. Parar o PIX Service atual
2. Aplicar arquivos atualizados
3. Reiniciar com as melhorias
4. Executar testes automatizados
5. Exibir exemplos de uso

---

✅ **Endpoint /consultar-pix Melhorado com Informações Completas de Expiração!**