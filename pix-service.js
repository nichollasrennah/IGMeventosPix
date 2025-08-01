const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(bodyParser.json());

// =====================================================
// CONFIGURAÇÃO MULTI-AMBIENTE
// =====================================================

const AMBIENTE_ATUAL = process.env.SICREDI_ENV || "homolog";
const isProducao = AMBIENTE_ATUAL === "prod";

console.log(`🌍 Ambiente atual: ${isProducao ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}`);

const CONFIG = {
  homolog: {
    api_url: "https://api-pix-h.sicredi.com.br/api/v2",
    token_url: "https://api-pix-h.sicredi.com.br/oauth/token",
    client_id: process.env.SICREDI_HOMOLOG_CLIENT_ID,
    client_secret: process.env.SICREDI_HOMOLOG_CLIENT_SECRET,
    pix_key: process.env.SICREDI_HOMOLOG_PIX_KEY,
    ssl_verify: false,
    timeout: 15000,
    retry_attempts: 3
  },
  prod: {
    api_url: "https://api-pix.sicredi.com.br/api/v2",
    token_url: "https://api-pix.sicredi.com.br/oauth/token",
    client_id: process.env.SICREDI_PROD_CLIENT_ID,
    client_secret: process.env.SICREDI_PROD_CLIENT_SECRET,
    pix_key: process.env.SICREDI_PROD_PIX_KEY,
    ssl_verify: true,
    timeout: 15000,
    retry_attempts: 3
  }
}[AMBIENTE_ATUAL];

// Validar configuração
if (!CONFIG.client_id || !CONFIG.client_secret) {
  console.error(`❌ Configuração incompleta para ambiente ${AMBIENTE_ATUAL}`);
  process.exit(1);
}

if (isProducao && !CONFIG.pix_key) {
  console.error(`❌ PIX Key obrigatória em produção`);
  process.exit(1);
}

console.log("✅ Configuração do ambiente validada com sucesso");

// =====================================================
// CONFIGURAÇÃO DE CERTIFICADOS
// =====================================================

const CERT_PATH = path.join(__dirname, "certs");
let certificates = {};

function carregarCertificados() {
  try {
    const certFile = isProducao ? "cert.cer" : "cert.cer";
    const keyFile = isProducao ? "api.key" : "api.key";
    const caFile = isProducao ? "ca-prod-sicredi.pem" : "ca-homolog-sicredi.pem";

    console.log(`🔐 Carregando certificados para ${AMBIENTE_ATUAL}:`);
    console.log(`   - Cert: ${certFile}`);
    console.log(`   - Key: ${keyFile}`);

    certificates.cert = fs.readFileSync(path.join(CERT_PATH, certFile));
    certificates.key = fs.readFileSync(path.join(CERT_PATH, keyFile));

    try {
      certificates.ca = fs.readFileSync(path.join(CERT_PATH, caFile));
      console.log(`✅ Certificado CA carregado: ${caFile}`);
    } catch (caError) {
      console.log(`⚠️ CA não encontrado: ${caFile} - Continuando sem CA específico`);
    }

  } catch (error) {
    console.error("❌ Erro ao carregar certificados:", error.message);
    process.exit(1);
  }
}

carregarCertificados();

console.log(`
🚀 PIX Service Multi-Ambiente
📍 Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}
🌐 API URL: ${CONFIG.api_url}
🔐 Client ID: ${CONFIG.client_id.substring(0, 10)}...
🔑 PIX Key: ${CONFIG.pix_key ? "CONFIGURADA" : "NÃO CONFIGURADA"}
⚙️  SSL Verify: ${CONFIG.ssl_verify}
⏱️  Timeout: ${CONFIG.timeout}ms
🔄 Retry Attempts: ${CONFIG.retry_attempts}
`);

// =====================================================
// VARIÁVEIS GLOBAIS
// =====================================================

let tokenCache = null;
let tokenExpiration = null;

// =====================================================
// FUNÇÕES DE UTILIDADE
// =====================================================

function criarAgentSSL(tentativa = 1) {
  const baseConfig = {
    cert: certificates.cert,
    key: certificates.key,
  };

  if (CONFIG.ssl_verify === false && !isProducao) {
    console.warn("⚠️  SSL verification disabled (homologação apenas)");
    return new https.Agent({
      ...baseConfig,
      rejectUnauthorized: false,
    });
  }

  switch (tentativa) {
    case 1:
      return new https.Agent({
        ...baseConfig,
        ca: certificates.ca,
        rejectUnauthorized: true,
      });
    
    case 2:
      return new https.Agent({
        ...baseConfig,
        rejectUnauthorized: true,
      });
    
    case 3:
      if (!isProducao) {
        console.warn("⚠️  Tentativa sem verificação SSL - HOMOLOGAÇÃO");
        return new https.Agent({
          ...baseConfig,
          rejectUnauthorized: false,
        });
      }
      throw new Error("SSL verification cannot be disabled in production");
    
    default:
      throw new Error("Todas as tentativas de conexão SSL falharam");
  }
}

async function obterToken(tentativa = 1) {
  try {
    const credentials = Buffer.from(`${CONFIG.client_id}:${CONFIG.client_secret}`).toString("base64");
    
    const payload = {
      grant_type: "client_credentials",
      scope: "cob.write cob.read cobv.write cobv.read pix.write pix.read",
      expires_in: 172800 // 48 horas
    };

    const response = await axios.post(CONFIG.token_url, payload, {
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      httpsAgent: criarAgentSSL(tentativa),
      timeout: CONFIG.timeout
    });

    const token = response.data.access_token;
    const expiresIn = response.data.expires_in || 172800;
    
    tokenCache = token;
    tokenExpiration = Date.now() + (expiresIn * 1000);
    
    console.log(`✅ Token obtido com sucesso (expira em ${Math.floor(expiresIn / 3600)}h)`);
    return token;

  } catch (error) {
    console.error(`❌ Erro ao obter token (tentativa ${tentativa}):`, error.response?.data || error.message);
    
    if (tentativa < CONFIG.retry_attempts) {
      console.log(`🔄 Tentando novamente... (${tentativa + 1}/${CONFIG.retry_attempts})`);
      return obterToken(tentativa + 1);
    }
    
    throw error;
  }
}

async function obterTokenValido() {
  if (tokenCache && tokenExpiration && Date.now() < tokenExpiration - 300000) {
    return tokenCache;
  }
  
  console.log("🔄 Token expirado ou inexistente, obtendo novo...");
  return await obterToken();
}

function gerarTxid() {
  return crypto.randomBytes(16).toString('hex').substring(0, 25);
}

function validarPagamento(pagamento) {
  if (!pagamento["Row ID"] || !pagamento.Pagador || !pagamento["Valor Pix"]) {
    return {
      valido: false,
      erro: "Campos obrigatórios: Row ID, Pagador, Valor Pix"
    };
  }

  const valor = parseFloat(pagamento["Valor Pix"]);
  if (isNaN(valor) || valor <= 0) {
    return {
      valido: false,
      erro: "Valor Pix deve ser um número positivo"
    };
  }

  return { valido: true };
}

async function fazerRequisicaoSicredi(url, options, tentativa = 1) {
  try {
    const token = await obterTokenValido();
    
    const config = {
      ...options,
      headers: {
        ...options.headers,
        "Authorization": `Bearer ${token}`
      },
      httpsAgent: criarAgentSSL(tentativa),
      timeout: CONFIG.timeout
    };

    const response = await axios(url, config);
    return response;

  } catch (error) {
    if (error.response?.status === 401 && tentativa === 1) {
      console.log("🔄 Token inválido, obtendo novo token...");
      tokenCache = null;
      tokenExpiration = null;
      return fazerRequisicaoSicredi(url, options, tentativa + 1);
    }

    if (tentativa < CONFIG.retry_attempts && (!error.response || error.response.status >= 500)) {
      console.log(`🔄 Tentativa ${tentativa + 1}/${CONFIG.retry_attempts} para ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * tentativa));
      return fazerRequisicaoSicredi(url, options, tentativa + 1);
    }

    throw error;
  }
}

// =====================================================
// ENDPOINTS PIX
// =====================================================

// Health check
app.get("/health", (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    service: "pix-service",
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    uptime_formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    environment: AMBIENTE_ATUAL,
    endpoints_count: app._router ? app._router.stack.length : 0
  });
});

app.get("/ping", (req, res) => {
  res.status(200).json({
    message: "pong",
    service: "pix-service",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Gerar PIX imediato
app.post("/gerar-pix", async (req, res) => {
  try {
    const { pagamento, evento, tag_evento, categoria } = req.body;
    
    console.log(`📥 Solicitação PIX imediato no ambiente ${AMBIENTE_ATUAL.toUpperCase()}:`, pagamento);

    if (!pagamento) {
      return res.status(400).json({
        erro: "Objeto 'pagamento' é obrigatório no body",
        ambiente: AMBIENTE_ATUAL
      });
    }

    const validacao = validarPagamento(pagamento);
    if (!validacao.valido) {
      return res.status(400).json({
        erro: validacao.erro,
        ambiente: AMBIENTE_ATUAL
      });
    }

    const txid = gerarTxid();
    const valor = parseFloat(pagamento["Valor Pix"]).toFixed(2);

    const pixPayload = {
      calendario: {
        expiracao: 3600
      },
      devedor: {
        nome: pagamento.Pagador,
        cpf: pagamento.Inscricao?.replace(/\D/g, "") || "00000000000"
      },
      valor: {
        original: valor
      },
      chave: CONFIG.pix_key,
      solicitacaoPagador: pagamento.descricao_pagador || `Pagamento ${pagamento["Row ID"]}`
    };

    // Adicionar informações de evento se fornecidas
    if (evento || tag_evento || categoria) {
      pixPayload.infoAdicionais = [];
      
      if (evento) pixPayload.infoAdicionais.push({ nome: "evento", valor: evento });
      if (tag_evento) pixPayload.infoAdicionais.push({ nome: "tag_evento", valor: tag_evento });
      if (categoria) pixPayload.infoAdicionais.push({ nome: "categoria", valor: categoria });
      
      console.log(`🏷️ Evento adicionado: ${evento || 'N/A'}, Tag: ${tag_evento || 'N/A'}, Categoria: ${categoria || 'N/A'}`);
    }

    const url = `${CONFIG.api_url}/cob/${txid}`;
    
    const response = await fazerRequisicaoSicredi(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      data: pixPayload
    });

    console.log(`✅ PIX gerado com sucesso no ambiente ${AMBIENTE_ATUAL.toUpperCase()}: ${txid}`);

    res.json({
      sucesso: true,
      txid: txid,
      pixCopiaECola: response.data.pixCopiaECola,
      valor: valor,
      pagador: pagamento.Pagador,
      ambiente: AMBIENTE_ATUAL,
      evento: evento || null,
      tag_evento: tag_evento || null,
      categoria: categoria || null,
      dados_completos: response.data
    });

  } catch (error) {
    console.error(`❌ Erro ao gerar PIX no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao gerar PIX";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// Gerar PIX com vencimento
app.post("/gerar-pix-vencimento", async (req, res) => {
  try {
    const { pagamento, dataVencimento, evento, tag_evento, categoria } = req.body;
    
    console.log(`📥 Solicitação PIX com vencimento no ambiente ${AMBIENTE_ATUAL.toUpperCase()}:`, pagamento);

    if (!pagamento || !dataVencimento) {
      return res.status(400).json({
        erro: "Objetos 'pagamento' e 'dataVencimento' são obrigatórios",
        ambiente: AMBIENTE_ATUAL
      });
    }

    const validacao = validarPagamento(pagamento);
    if (!validacao.valido) {
      return res.status(400).json({
        erro: validacao.erro,
        ambiente: AMBIENTE_ATUAL
      });
    }

    const txid = gerarTxid();
    const valor = parseFloat(pagamento["Valor Pix"]).toFixed(2);

    const pixPayload = {
      calendario: {
        dataDeVencimento: dataVencimento,
        validadeAposVencimento: 30
      },
      devedor: {
        nome: pagamento.Pagador,
        cpf: pagamento.Inscricao?.replace(/\D/g, "") || "00000000000"
      },
      valor: {
        original: valor
      },
      chave: CONFIG.pix_key,
      solicitacaoPagador: pagamento.descricao_pagador || `Pagamento com vencimento ${pagamento["Row ID"]}`
    };

    // Adicionar informações de evento se fornecidas
    if (evento || tag_evento || categoria) {
      pixPayload.infoAdicionais = [];
      
      if (evento) pixPayload.infoAdicionais.push({ nome: "evento", valor: evento });
      if (tag_evento) pixPayload.infoAdicionais.push({ nome: "tag_evento", valor: tag_evento });
      if (categoria) pixPayload.infoAdicionais.push({ nome: "categoria", valor: categoria });
      
      console.log(`🏷️ Evento adicionado: ${evento || 'N/A'}, Tag: ${tag_evento || 'N/A'}, Categoria: ${categoria || 'N/A'}`);
    }

    const url = `${CONFIG.api_url}/cobv/${txid}`;
    
    const response = await fazerRequisicaoSicredi(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      data: pixPayload
    });

    console.log(`✅ PIX com vencimento gerado com sucesso no ambiente ${AMBIENTE_ATUAL.toUpperCase()}: ${txid}`);

    res.json({
      sucesso: true,
      txid: txid,
      pixCopiaECola: response.data.pixCopiaECola,
      valor: valor,
      pagador: pagamento.Pagador,
      dataVencimento: dataVencimento,
      ambiente: AMBIENTE_ATUAL,
      evento: evento || null,
      tag_evento: tag_evento || null,
      categoria: categoria || null,
      dados_completos: response.data
    });

  } catch (error) {
    console.error(`❌ Erro ao gerar PIX com vencimento no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao gerar PIX com vencimento";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// Consultar PIX imediato
app.get("/consultar-pix/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    console.log(`🔍 Consultando PIX imediato: ${txid} no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);

    const url = `${CONFIG.api_url}/cob/${txid}`;
    
    const response = await fazerRequisicaoSicredi(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const dadosCobranca = response.data;
    const foiPago = dadosCobranca.status === "CONCLUIDA";

    console.log(`✅ PIX consultado: ${txid} - Status: ${dadosCobranca.status}`);

    res.json({
      txid: txid,
      status: dadosCobranca.status,
      pago: foiPago,
      dados: {
        valor: dadosCobranca.valor,
        devedor: dadosCobranca.devedor,
        data_criacao: dadosCobranca.calendario?.criacao,
        pixCopiaECola: dadosCobranca.pixCopiaECola,
        info_pagamento: foiPago ? dadosCobranca.pix[0] : null
      },
      ambiente: AMBIENTE_ATUAL
    });
    
  } catch (error) {
    console.error(`❌ Erro ao consultar PIX no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao consultar PIX";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      tipo: "cobranca_imediata",
      txid: req.params.txid,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// Consultar PIX com vencimento
app.get("/consultar-pix-vencimento/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    console.log(`🔍 Consultando PIX com vencimento: ${txid} no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);

    const url = `${CONFIG.api_url}/cobv/${txid}`;
    
    const response = await fazerRequisicaoSicredi(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });

    const dadosCobranca = response.data;
    const foiPago = dadosCobranca.status === "CONCLUIDA";
    
    const hoje = new Date();
    const dataVencimento = new Date(dadosCobranca.calendario?.dataDeVencimento);
    const vencido = hoje > dataVencimento;

    console.log(`✅ PIX com vencimento consultado: ${txid} - Status: ${dadosCobranca.status}`);

    res.json({
      txid: txid,
      status: foiPago ? 'CONCLUIDA' : dadosCobranca.status,
      pago: foiPago,
      vencido: vencido,
      dados: {
        valor: dadosCobranca.valor,
        devedor: dadosCobranca.devedor,
        vencimento: {
          data: dadosCobranca.calendario?.dataDeVencimento,
          dias_para_vencer: vencido ? 0 : Math.ceil((dataVencimento - hoje) / (1000 * 60 * 60 * 24)),
          dias_vencidos: vencido ? Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24)) : 0,
          validade_apos_vencimento: dadosCobranca.calendario?.validadeAposVencimento
        },
        data_criacao: dadosCobranca.calendario?.criacao,
        pixCopiaECola: dadosCobranca.pixCopiaECola,
        info_pagamento: foiPago ? dadosCobranca.pix[0] : null
      },
      ambiente: AMBIENTE_ATUAL
    });
    
  } catch (error) {
    console.error(`❌ Erro ao consultar PIX com vencimento no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao consultar PIX com vencimento";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      tipo: "cobranca_com_vencimento",
      txid: req.params.txid,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// Endpoint integrado PIX + WhatsApp (para AppSheet)
app.post("/appsheet-whatsapp", async (req, res) => {
  try {
    const { pagamento, numero, evento, tag_evento, categoria } = req.body;
    
    console.log('📱 AppSheet WhatsApp request recebido (PIX Service)');
    
    // Resposta imediata para AppSheet
    res.status(200).json({
      status: "recebido",
      timestamp: new Date().toISOString(),
      processando: true
    });

    // Processar assincronamente
    if (pagamento && numero) {
      processarPixWhatsApp(pagamento, numero, null, evento, tag_evento, categoria);
    }

  } catch (error) {
    console.error("❌ Erro AppSheet WhatsApp:", error.message);
    res.status(500).json({
      erro: "Falha no processamento AppSheet",
      detalhes: error.message
    });
  }
});

// Endpoint para solicitar envio de WhatsApp (integração com WhatsApp Service)
app.post("/solicitar-whatsapp", async (req, res) => {
  try {
    const { numero, pixData } = req.body;
    
    if (!numero || !pixData) {
      return res.status(400).json({
        erro: "Campos 'numero' e 'pixData' são obrigatórios"
      });
    }

    // URL do WhatsApp Service (será configurada via env var)
    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || "http://whatsapp-service:3001";
    
    const mensagem = `💰 *Informações de Pagamento PIX*

📋 *Dados do Pagamento:*
💵 Valor: R$ ${pixData.valor}
👤 Pagador: ${pixData.pagador}
🆔 ID: ${pixData.txid}
${pixData.dataVencimento ? `📅 Vencimento: ${pixData.dataVencimento}` : '⚡ Pagamento Imediato'}

📱 *PIX Copia e Cola:*
\`${pixData.pixCopiaECola}\`

✅ Pagamento gerado com sucesso!
🏦 Via Sicredi PIX`;

    // Chamar WhatsApp Service
    const response = await axios.post(`${whatsappServiceUrl}/enviar-mensagem`, {
      numero: numero,
      mensagem: mensagem
    }, {
      timeout: 30000
    });

    res.json({
      sucesso: true,
      whatsapp_enviado: response.data.sucesso || false,
      mensagem_id: response.data.mensagem_id || null,
      pixData: pixData
    });

  } catch (error) {
    console.error("❌ Erro ao solicitar envio WhatsApp:", error.message);
    
    res.status(500).json({
      sucesso: false,
      erro: "Falha ao enviar mensagem WhatsApp",
      detalhes: error.response?.data || error.message
    });
  }
});

// Função assíncrona para processar PIX + WhatsApp integrado
async function processarPixWhatsApp(pagamento, numero, dataVencimento, evento, tag_evento, categoria) {
  try {
    console.log('🔗 Processando PIX + WhatsApp integrado...');
    
    // 1. Gerar PIX (já estamos no PIX service)
    const validacao = validarPagamento(pagamento);
    if (!validacao.valido) {
      throw new Error('Validação PIX falhou: ' + validacao.erro);
    }

    const txid = gerarTxid();
    const valor = parseFloat(pagamento["Valor Pix"]).toFixed(2);

    const pixPayload = {
      calendario: dataVencimento ? {
        dataDeVencimento: dataVencimento,
        validadeAposVencimento: 30
      } : {
        expiracao: 3600
      },
      devedor: {
        nome: pagamento.Pagador,
        cpf: pagamento.Inscricao?.replace(/\D/g, "") || "00000000000"
      },
      valor: {
        original: valor
      },
      chave: CONFIG.pix_key,
      solicitacaoPagador: pagamento.descricao_pagador || `Pagamento ${pagamento["Row ID"]}`
    };

    // Adicionar informações de evento
    if (evento || tag_evento || categoria) {
      pixPayload.infoAdicionais = [];
      
      if (evento) pixPayload.infoAdicionais.push({ nome: "evento", valor: evento });
      if (tag_evento) pixPayload.infoAdicionais.push({ nome: "tag_evento", valor: tag_evento });
      if (categoria) pixPayload.infoAdicionais.push({ nome: "categoria", valor: categoria });
    }

    const endpoint = dataVencimento ? 'cobv' : 'cob';
    const url = `${CONFIG.api_url}/${endpoint}/${txid}`;
    
    const pixResponse = await fazerRequisicaoSicredi(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      data: pixPayload
    });

    console.log(`✅ PIX gerado: ${txid}`);

    // 2. Enviar WhatsApp
    const whatsappServiceUrl = process.env.WHATSAPP_SERVICE_URL || "http://whatsapp-service:3001";
    
    const mensagem = `💰 *Informações de Pagamento PIX*

📋 *Dados do Pagamento:*
💵 Valor: R$ ${valor}
👤 Pagador: ${pagamento.Pagador}
🆔 ID: ${txid}
${dataVencimento ? `📅 Vencimento: ${dataVencimento}` : '⚡ Pagamento Imediato'}
${evento ? `🏷️ Evento: ${evento}` : ''}
${categoria ? `📂 Categoria: ${categoria}` : ''}

📱 *PIX Copia e Cola:*
\`${pixResponse.data.pixCopiaECola}\`

✅ Pagamento gerado com sucesso!
🏦 Via Sicredi PIX`;

    const whatsappResponse = await axios.post(`${whatsappServiceUrl}/enviar-mensagem`, {
      numero: numero,
      mensagem: mensagem
    }, {
      timeout: 30000
    });

    if (whatsappResponse.data.sucesso) {
      console.log('✅ WhatsApp enviado com sucesso');
    } else {
      console.log('⚠️ Falha no envio WhatsApp:', whatsappResponse.data.erro);
    }

    console.log('🎉 Operação PIX + WhatsApp concluída');

  } catch (error) {
    console.error('❌ Erro na operação PIX + WhatsApp:', error.message);
  }
}

// =====================================================
// INICIALIZAÇÃO DO SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 PIX Service iniciado!
📍 Porta: ${PORT}
🌐 URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health

📋 Endpoints disponíveis:
   • POST /gerar-pix - Cobrança PIX imediata
   • POST /gerar-pix-vencimento - Cobrança PIX com vencimento
   • GET  /consultar-pix/:txid - Consultar cobrança imediata
   • GET  /consultar-pix-vencimento/:txid - Consultar cobrança com vencimento
   • POST /solicitar-whatsapp - Solicitar envio de mensagem WhatsApp
   • GET  /health - Health check
   • GET  /ping - Ping
  `);
  
  // Verificar se os certificados estão presentes
  const requiredFiles = ['cert.cer', 'api.key'];
  requiredFiles.forEach(file => {
    const filePath = path.join(CERT_PATH, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file} encontrado`);
    } else {
      console.log(`❌ ${file} NÃO encontrado em ${filePath}`);
    }
  });
});