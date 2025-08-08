# 📅 PIX com Vencimento - Endpoints CobV e LoteCobV

Documentação dos novos endpoints implementados para PIX com vencimento baseados na especificação do Banco Central.

## 📋 Endpoints Implementados

### 1. 📄 POST /gerar-pix-vencimento
Gerar PIX individual com vencimento (CobV)

**Formato da Requisição:**
```json
{
  "Row ID": "PAG_001",
  "Pagador": "João Silva", 
  "Valor Pix": "100.00",
  "cpf": "12345678901",
  "data_vencimento": "2025-08-30",
  "evento": "Festa de Agosto",
  "categoria": "Evento", 
  "tag_evento": "festa2025",
  "multa": "5.00",
  "juros": "2.00", 
  "desconto": "10.00",
  "validade_apos_vencimento": 30,
  "descricao": "Pagamento personalizado"
}
```

**Campos Obrigatórios:**
- `Row ID`: Identificador único
- `Pagador`: Nome do pagador
- `Valor Pix`: Valor da cobrança
- `data_vencimento`: Data de vencimento (YYYY-MM-DD, deve ser futura)

**Campos Opcionais:**
- `cpf`: CPF do pagador (padrão: 00000000000)
- `evento`: Nome do evento
- `categoria`: Categoria da cobrança
- `tag_evento`: Tag adicional
- `multa`: Valor da multa após vencimento
- `juros`: Valor de juros mensal
- `desconto`: Desconto até a data de vencimento
- `validade_apos_vencimento`: Dias válidos após vencimento (padrão: 30)
- `descricao`: Descrição personalizada

**Resposta de Sucesso:**
```json
{
  "sucesso": true,
  "tipo": "cobv",
  "txid": "abc123def456",
  "pixCopiaECola": "00020126...",
  "qrCode": {
    "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "base64": "iVBORw0KGgoAAAANSUhEUgAA..."
  },
  "valor": "100.00",
  "pagador": "João Silva",
  "data_vencimento": "2025-08-30",
  "ambiente": "homolog",
  "evento": "Festa de Agosto",
  "tag_evento": "festa2025",
  "categoria": "Evento",
  "multa": "5.00",
  "juros": "2.00",
  "desconto": "10.00",
  "dados_completos": { /* resposta completa da API Sicredi */ }
}
```

### 2. 📦 POST /gerar-lote-pix-vencimento
Gerar lote de PIX com vencimento (LoteCobV)

**Formato da Requisição:**
```json
{
  "descricao": "Mensalidades Agosto 2025",
  "cobsv": [
    {
      "Row ID": "MES_001",
      "Pagador": "Maria Santos",
      "Valor Pix": "50.00",
      "cpf": "11111111111",
      "data_vencimento": "2025-08-31",
      "evento": "Mensalidade",
      "categoria": "Recorrente",
      "multa": "2.50",
      "juros": "1.00"
    },
    {
      "Row ID": "MES_002", 
      "Pagador": "José Oliveira",
      "Valor Pix": "75.00",
      "cpf": "22222222222",
      "data_vencimento": "2025-08-31",
      "evento": "Mensalidade",
      "categoria": "Recorrente"
    }
  ]
}
```

**Limites:**
- Máximo: 1000 cobranças por lote
- Cada cobrança segue as mesmas regras do endpoint individual

**Resposta de Sucesso:**
```json
{
  "sucesso": true,
  "tipo": "lotecobv",
  "lote_id": "lote1691234567890",
  "total_solicitadas": 2,
  "total_processadas": 2,
  "total_erros": 0,
  "qr_codes_gerados": 2,
  "ambiente": "homolog",
  "erros": null,
  "qrCodes": {
    "lote1691234567890_000": {
      "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "base64": "iVBORw0KGgoAAAANSUhEUgAA..."
    },
    "lote1691234567890_001": {
      "dataURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "base64": "iVBORw0KGgoAAAANSUhEUgAA..."
    }
  },
  "dados_completos": { /* resposta completa da API Sicredi */ },
  "timestamp": "2025-08-05T10:30:00.000Z"
}
```

### 3. 🔍 GET /consultar-pix-vencimento/:txid
Consultar PIX individual com vencimento

**Exemplo:**
```bash
GET /consultar-pix-vencimento/abc123def456
```

**Resposta:**
```json
{
  "sucesso": true,
  "tipo": "cobv",
  "txid": "abc123def456",
  "ambiente": "homolog",
  "dados": {
    "status": "ATIVA",
    "calendario": {
      "dataDeVencimento": "2025-08-30",
      "validadeAposVencimento": 30
    },
    "devedor": {
      "nome": "João Silva",
      "cpf": "12345678901"
    },
    "valor": {
      "original": "100.00"
    }
    /* outros dados da consulta */
  },
  "timestamp": "2025-08-05T10:30:00.000Z"
}
```

### 4. 📋 GET /consultar-lote-pix-vencimento/:loteId
Consultar lote de PIX com vencimento

**Exemplo:**
```bash
GET /consultar-lote-pix-vencimento/lote1691234567890
```

**Resposta:**
```json
{
  "sucesso": true,
  "tipo": "lotecobv", 
  "lote_id": "lote1691234567890",
  "ambiente": "homolog",
  "dados": {
    "descricao": "Mensalidades Agosto 2025",
    "status": "EM_PROCESSAMENTO",
    "cobsv": {
      /* detalhes de cada cobrança do lote */
    }
  },
  "timestamp": "2025-08-05T10:30:00.000Z"
}
```

### 5. 📱 GET /qrcode/:txid
Obter QR Code como imagem PNG

**Parâmetros de Query:**
- `width`: Largura da imagem (padrão: 300px)
- `tipo`: Tipo da cobrança ('cobv' ou 'lotecobv', padrão: 'cobv')

**Exemplo:**
```bash
GET /qrcode/abc123def456?width=400&tipo=cobv
```

**Resposta:** Imagem PNG do QR Code

### 6. 🌐 GET /visualizar-qr/:txid
Página HTML interativa com QR Code

**Parâmetros de Query:**
- `tipo`: Tipo da cobrança ('cobv' ou 'lotecobv', padrão: 'cobv')

**Exemplo:**
```bash
GET /visualizar-qr/abc123def456?tipo=cobv
```

**Resposta:** Página HTML completa com:
- QR Code visual
- Informações da cobrança
- Código PIX Copia e Cola
- Botão para copiar código
- Layout responsivo

## 📱 Recursos de QR Code

### Geração Automática
- ✅ QR Codes gerados automaticamente para todos os PIX
- ✅ Qualidade alta (error correction level M)
- ✅ Formato PNG otimizado
- ✅ Base64 para integração fácil

### Formatos Disponíveis
- **dataURL**: Imagem completa base64 (`data:image/png;base64,...`)
- **base64**: Apenas dados base64 (sem prefixo)
- **buffer**: Buffer de imagem para endpoints diretos

### Endpoints de Visualização
- **QR Code Direto**: `/qrcode/:txid` - Retorna PNG puro
- **Página Interativa**: `/visualizar-qr/:txid` - Interface web completa

## 🔧 Características Técnicas

### Validações Implementadas
- ✅ Data de vencimento obrigatória e futura
- ✅ Campos obrigatórios validados
- ✅ CPF formatado automaticamente
- ✅ Valores monetários com 2 casas decimais
- ✅ Limite de 1000 cobranças por lote

### Integração com Campos Customizados
Todos os endpoints mantém compatibilidade com os campos customizados existentes:
- `evento`: Nome do evento
- `categoria`: Categoria da cobrança  
- `tag_evento`: Tag adicional

### Recursos Financeiros
- **Multa**: Valor fixo aplicado após vencimento
- **Juros**: Valor mensal aplicado após vencimento
- **Desconto**: Valor de desconto até a data de vencimento

### Modalidades de Multa/Juros/Desconto
- Multa: Modalidade "2" (Valor fixo)
- Juros: Modalidade "2" (Valor mensal) 
- Desconto: Modalidade "1" (Valor fixo até data)

## 🧪 Exemplos de Teste

### PIX Individual Simples
```bash
curl -X POST http://srv937382.hstgr.cloud/gerar-pix-vencimento \
  -H 'Content-Type: application/json' \
  -d '{
    "Row ID": "TESTE_001",
    "Pagador": "João Teste",
    "Valor Pix": "25.50", 
    "data_vencimento": "2025-09-15",
    "evento": "Teste Sistema"
  }'
```

### PIX com Multa e Desconto
```bash
curl -X POST http://srv937382.hstgr.cloud/gerar-pix-vencimento \
  -H 'Content-Type: application/json' \
  -d '{
    "Row ID": "TESTE_002",
    "Pagador": "Maria Exemplo",
    "Valor Pix": "100.00",
    "cpf": "12345678901", 
    "data_vencimento": "2025-09-30",
    "evento": "Pagamento Premium",
    "categoria": "Serviço",
    "multa": "10.00",
    "juros": "5.00",
    "desconto": "15.00"
  }'
```

### Lote Pequeno
```bash
curl -X POST http://srv937382.hstgr.cloud/gerar-lote-pix-vencimento \
  -H 'Content-Type: application/json' \
  -d '{
    "descricao": "Teste Lote Pequeno",
    "cobsv": [
      {
        "Row ID": "LOTE_A1",
        "Pagador": "Cliente A",
        "Valor Pix": "50.00",
        "data_vencimento": "2025-09-10",
        "evento": "Lote Teste"
      },
      {
        "Row ID": "LOTE_A2", 
        "Pagador": "Cliente B",
        "Valor Pix": "75.00",
        "data_vencimento": "2025-09-10",
        "evento": "Lote Teste"
      }
    ]
  }'
```

### Visualizar QR Code
```bash
# Acessar página interativa
http://srv937382.hstgr.cloud/visualizar-qr/TXID_AQUI

# Obter QR Code como imagem PNG
http://srv937382.hstgr.cloud/qrcode/TXID_AQUI?width=500

# QR Code de lote
http://srv937382.hstgr.cloud/visualizar-qr/LOTE_ID_AQUI?tipo=lotecobv
```

## 🌐 Configuração Nginx

Os novos endpoints foram automaticamente incluídos na configuração do Nginx:

```nginx
location ~* ^/(gerar-pix|gerar-pix-vencimento|gerar-lote-pix-vencimento|consultar-pix|consultar-pix-vencimento|consultar-lote-pix-vencimento|qrcode|visualizar-qr|debug-payload) {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://pix-backend;
    # ... outras configurações
}
```

## 📊 Compatibilidade

### AppSheet
✅ Totalmente compatível com formato AppSheet  
✅ Campos diretos no body da requisição  
✅ Conversão automática de vírgula para ponto

### Sistema Existente
✅ Mantém todos os campos customizados existentes  
✅ Mesma autenticação OAuth2  
✅ Mesmos ambientes (homolog/prod)  
✅ Logs padronizados

## 🔐 Segurança

- ✅ Rate limiting configurado (20 requests/burst)
- ✅ Validação rigorosa de entrada
- ✅ Logs detalhados para auditoria
- ✅ Tratamento seguro de erros
- ✅ Timeouts configurados

## 🐛 Tratamento de Erros

### Erros Comuns
- **400**: Dados inválidos ou campos obrigatórios faltando
- **400**: Data de vencimento inválida ou no passado  
- **400**: Lote excede 1000 cobranças
- **404**: PIX ou lote não encontrado na consulta
- **500**: Erro interno ou falha na API Sicredi

### Logs de Debug
Todos os endpoints incluem logs detalhados:
- 📥 Payload recebido
- 📋 Dados processados
- ✅ Sucesso na geração
- ❌ Erros detalhados

## 🚀 Deploy

Para aplicar os novos endpoints no servidor:

```bash
./deploy-pix-vencimento.sh
```

Este script irá:
1. Parar serviços atuais
2. Atualizar PIX Service com novos endpoints
3. Atualizar Nginx com novas rotas
4. Executar testes automatizados
5. Exibir exemplos de uso

## 📱 Vantagens dos QR Codes Implementados

### Para Desenvolvedores
- ✅ **Geração Automática**: QR Codes criados automaticamente em todos os endpoints
- ✅ **Múltiplos Formatos**: dataURL, base64 e buffer disponíveis
- ✅ **Integração Fácil**: Dados prontos para uso em apps/web
- ✅ **Fallback Robusto**: Sistema continua funcionando mesmo se QR Code falhar

### Para Usuários Finais
- 📱 **Escaneamento Rápido**: QR Codes otimizados para leitura por apps bancários
- 🌐 **Visualização Web**: Páginas HTML interativas para facilitar acesso
- 📋 **Copia e Cola**: Código PIX disponível para cópia manual
- 📊 **Informações Completas**: Dados da cobrança visíveis na página

### Para Integrações
- 🔗 **URLs Diretas**: Links diretos para QR Codes como imagens
- 📱 **Embedding**: QR Codes podem ser incorporados em qualquer sistema
- 🎨 **Customização**: Tamanho ajustável via parâmetros
- 🔄 **APIs RESTful**: Endpoints padronizados para todas as operações

---

✅ **Sistema PIX com Vencimento + QR Codes Totalmente Implementado e Documentado!**