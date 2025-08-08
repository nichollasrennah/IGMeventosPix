# 📱 Guia Completo: WhatsApp Business API
## Igreja em Mossoró - Configuração Passo a Passo

---

### 🎯 **Por que WhatsApp Business API?**

- ✅ **100% de entrega garantida** - Oficial do Meta/WhatsApp
- ✅ **Sem detecção de bot** - Sistema oficial e profissional
- ✅ **Primeiras 1000 mensagens GRÁTIS** por mês
- ✅ **Custo baixíssimo** - ~R$ 0,15 por mensagem após limite
- ✅ **Para uso comercial** - Ideal para igrejas e organizações
- ✅ **Recursos extras** - Templates, botões, mídia

---

## 📋 **REQUISITOS OBRIGATÓRIOS**

### 1. **Número de Telefone Dedicado**
- ❌ **NÃO PODE** usar número pessoal existente
- ✅ **DEVE SER** um número novo ou comercial
- ✅ **Sugestão:** Comprar chip específico para a igreja
- 📱 **Recomendação:** TIM, Vivo ou Claro (boa cobertura)

### 2. **Conta Meta Business**
- ✅ Conta empresarial verificada
- ✅ Documentos da igreja (CNPJ, comprovantes)
- ✅ Informações bancárias para pagamento

### 3. **Verificação Empresarial**
- ⏱️ **Tempo:** 3-5 dias úteis
- 📄 **Documentos:** CNPJ, comprovante endereço, estatuto

---

## 🚀 **PASSO A PASSO COMPLETO**

### **ETAPA 1: Preparação (30 minutos)**

#### 1.1 **Adquirir Número Dedicado**
```
📞 AÇÃO: Comprar chip novo
💡 DICA: Use operadora com boa cobertura na região
⚠️ IMPORTANTE: NÃO use este número para WhatsApp pessoal
```

#### 1.2 **Reunir Documentos da Igreja**
- 📄 CNPJ da igreja
- 🏠 Comprovante de endereço atual
- 📜 Estatuto ou ata de fundação
- 🆔 RG/CPF do representante legal
- 🏛️ Comprovante bancário da igreja

---

### **ETAPA 2: Criar Conta Meta Business (45 minutos)**

#### 2.1 **Acessar Meta Business**
1. Vá para: https://business.facebook.com/
2. Clique em **"Criar conta"**
3. Escolha **"Criar conta comercial"**

#### 2.2 **Informações da Igreja**
```
Nome da empresa: igreja em Mossoró
Setor: Organizações religiosas
Site: www.igrejaemmossoro.com.br (se tiver)
Endereço: Endereço completo da igreja
Telefone: Número fixo da igreja (se tiver)
```

#### 2.3 **Verificação de Identidade**
1. Upload do RG do representante
2. Upload do CNPJ da igreja
3. Aguardar aprovação (1-3 dias)

---

### **ETAPA 3: Configurar WhatsApp Business (30 minutos)**

#### 3.1 **Adicionar WhatsApp à Conta Business**
1. No painel Meta Business, clique **"Adicionar ativos"**
2. Selecione **"WhatsApp"**
3. Clique **"Adicionar número do WhatsApp"**

#### 3.2 **Cadastrar Número Dedicado**
```
📱 Número: +55 (84) XXXXX-XXXX (seu número novo)
🏢 Nome comercial: Igreja em Mossoró
📊 Categoria: Organização religiosa
📍 Endereço: Endereço completo da igreja
```

#### 3.3 **Verificação do Número**
1. Meta enviará SMS com código
2. Digite o código recebido
3. Confirme a verificação

---

### **ETAPA 4: Configurar Conta WhatsApp Business (20 minutos)**

#### 4.1 **Perfil da Igreja**
```
Nome: Igreja em Mossoró
Descrição: Conectando Vidas ao Reino de Deus
Categoria: Organização religiosa
Site: www.igrejaemmossoro.com.br
Email: contato@igrejaemmossoro.com.br
Endereço: [Endereço completo]
```

#### 4.2 **Foto do Perfil**
- ✅ Logo da igreja (formato quadrado)
- ✅ Resolução mínima: 640x640px
- ✅ Formato: JPG ou PNG

---

### **ETAPA 5: Obter Credenciais da API (15 minutos)**

#### 5.1 **Acessar Configurações de API**
1. No painel WhatsApp Business, vá em **"Configurações"**
2. Clique em **"API"**
3. Selecione **"Começar"**

#### 5.2 **Gerar Token de Acesso**
1. Clique **"Gerar token"**
2. Defina permissões: `whatsapp_business_messaging`
3. Copie e guarde o token (nunca expire)

#### 5.3 **Obter Phone Number ID**
1. Em **"Números de telefone"**
2. Clique no número cadastrado
3. Copie o **Phone Number ID**

#### 5.4 **Anotar Credenciais**
```
🔑 Access Token: EAAG... (muito longo)
📱 Phone Number ID: 123456789012345
📊 WhatsApp Business Account ID: 987654321098765
```

---

### **ETAPA 6: Verificação Comercial (3-5 dias)**

#### 6.1 **Enviar Documentação**
1. No Meta Business, vá em **"Verificação comercial"**
2. Upload dos documentos:
   - CNPJ da igreja
   - Comprovante de endereço
   - Estatuto (se solicitado)
   - RG do representante

#### 6.2 **Aguardar Aprovação**
- ⏱️ **Tempo:** 3-5 dias úteis
- 📧 **Comunicação:** Via email cadastrado
- ✅ **Status:** Acompanhar no painel Meta Business

---

### **ETAPA 7: Configurar Sistema da Igreja (30 minutos)**

#### 7.1 **Adicionar Credenciais no Servidor**
```bash
# Conectar ao servidor
ssh root@srv937382.hstgr.cloud

# Editar variáveis de ambiente
cd /app/pix-service
nano .env

# Adicionar linhas:
WHATSAPP_BUSINESS_TOKEN=EAAG... (seu token)
WHATSAPP_BUSINESS_PHONE_ID=123456789012345 (seu phone id)
```

#### 7.2 **Reiniciar Sistema**
```bash
# Reiniciar container WhatsApp
docker restart whatsapp-service

# Verificar logs
docker logs whatsapp-service -f
```

#### 7.3 **Testar Integração**
```bash
# Testar endpoint
curl -X POST http://localhost/appsheet-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "Row ID": "TESTE123",
    "numero": "84999758144",
    "Pagador": "Teste Business API",
    "Valor Pix": "10.00",
    "cpf": "04644606464",
    "evento": "Teste Configuração"
  }'
```

---

## 📊 **VERIFICAÇÃO DE FUNCIONAMENTO**

### ✅ **Checklist de Validação**
- [ ] Número dedicado ativo
- [ ] Conta Meta Business criada
- [ ] WhatsApp Business configurado
- [ ] Verificação comercial aprovada
- [ ] Token de acesso gerado
- [ ] Phone Number ID obtido
- [ ] Credenciais configuradas no sistema
- [ ] Sistema reiniciado
- [ ] Teste de envio realizado
- [ ] Mensagem chegou ao destinatário

### 🔍 **Como Verificar se Está Funcionando**
1. **Logs do Sistema:** `docker logs whatsapp-service -f`
2. **Status da API:** http://srv937382.hstgr.cloud/whatsapp-status
3. **Teste Manual:** Endpoint `/appsheet-whatsapp`
4. **Confirmação:** Mensagem chegou no celular

---

## 💰 **CUSTOS E LIMITES**

### 📈 **Estrutura de Preços (2024)**
- **Primeiras 1000 mensagens/mês:** GRÁTIS
- **1001 - 10.000 mensagens:** R$ 0,15 cada
- **10.001 - 100.000 mensagens:** R$ 0,12 cada
- **Acima de 100.000:** R$ 0,08 cada

### 📊 **Estimativa para Igreja**
```
📱 50 mensagens/mês: R$ 0,00 (grátis)
📱 200 mensagens/mês: R$ 0,00 (grátis)
📱 500 mensagens/mês: R$ 0,00 (grátis)
📱 1500 mensagens/mês: R$ 75,00 (500 x R$ 0,15)
📱 3000 mensagens/mês: R$ 300,00 (2000 x R$ 0,15)
```

---

## 🛠️ **CONFIGURAÇÕES AVANÇADAS**

### 🔄 **Templates de Mensagem (Opcional)**
- Criar templates pré-aprovados
- Envio em massa mais eficiente
- Buttons e quick replies
- Templates com variáveis

### 📊 **Webhooks (Opcional)**
- Receber status de entrega
- Confirmações de leitura
- Respostas dos usuários
- Integração completa

### 🔐 **Segurança**
- Tokens com rotação automática
- Permissões específicas
- Logs de auditoria
- Backup das configurações

---

## 🆘 **RESOLUÇÃO DE PROBLEMAS**

### ⚠️ **Problemas Comuns**

#### "Token inválido"
```
❌ Problema: Token expirou ou está incorreto
✅ Solução: Gerar novo token no Meta Business
```

#### "Phone Number não encontrado"
```
❌ Problema: Phone Number ID incorreto
✅ Solução: Verificar ID no painel WhatsApp Business
```

#### "Verificação pendente"
```
❌ Problema: Conta ainda não verificada
✅ Solução: Aguardar aprovação (3-5 dias)
```

#### "Limite de mensagens atingido"
```
❌ Problema: Passou do limite gratuito
✅ Solução: Adicionar método de pagamento
```

### 📞 **Suporte Oficial**
- **Meta Business Help:** https://business.facebook.com/help
- **WhatsApp Business API Docs:** https://developers.facebook.com/docs/whatsapp
- **Suporte técnico:** Via painel Meta Business

---

## 📋 **RESUMO EXECUTIVO**

### ⏱️ **Timeline Completa**
- **Dia 1:** Preparação + Conta Meta Business (2 horas)
- **Dia 2-5:** Aguardar verificação comercial
- **Dia 6:** Configurar API + Testar (1 hora)
- **Total:** ~3 horas de trabalho em 6 dias

### 💡 **Benefícios Imediatos**
- ✅ **100% de entrega** - Mensagens sempre chegam
- ✅ **Sem bloqueios** - Sistema oficial
- ✅ **Custo baixo** - Primeiras 1000 grátis
- ✅ **Profissional** - Perfil verificado
- ✅ **Confiável** - Suporte oficial Meta

### 🎯 **Resultado Final**
```
📱 Sistema híbrido funcionando:
1. WhatsApp Business API (100% entrega)
2. WhatsApp Web (backup)
3. Simulação (último recurso)

🎉 Mensagens da igreja chegando sempre!
```

---

## 📞 **CONTATOS PARA SUPORTE**

### 🔧 **Suporte Técnico**
- **Sistema da Igreja:** Desenvolvedor responsável
- **Meta Business:** Suporte oficial via painel
- **WhatsApp API:** Documentação oficial

### 📧 **Documentação Oficial**
- **Meta Business:** https://business.facebook.com/help
- **WhatsApp Business API:** https://developers.facebook.com/docs/whatsapp
- **Graph API:** https://developers.facebook.com/docs/graph-api

---

**🙏 Igreja em Mossoró - Conectando Vidas ao Reino**

*Documento criado em: Agosto 2024*  
*Versão: 1.0*  
*Sistema: WhatsApp Business API Integration*