const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const htmlPdf = require("html-pdf-node");

const app = express();
app.use(bodyParser.json());

// Configurar diretório de PDFs
const PDF_PATH = path.join(__dirname, "pdfs");

// Servir arquivos PDF estaticamente
app.use('/pdfs', express.static(PDF_PATH));

// Criar diretório de PDFs se não existir
if (!fs.existsSync(PDF_PATH)) {
  fs.mkdirSync(PDF_PATH, { recursive: true });
  console.log("📁 Diretório de PDFs criado:", PDF_PATH);
}

console.log(`
🚀 PIX Service Sicredi - Iniciando
📅 Data: ${new Date().toLocaleString('pt-BR')}
🌍 Ambiente: ${process.env.NODE_ENV || 'development'}
`);

// =====================================================
// CONFIGURAÇÃO MULTI-AMBIENTE
// =====================================================

const AMBIENTE_ATUAL = process.env.SICREDI_ENV || "homolog";
const isProducao = AMBIENTE_ATUAL === "prod";

console.log(`🌍 Ambiente atual: ${isProducao ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}`);

const CONFIG = {
  homolog: {
    api_url: process.env.SICREDI_HOMOLOG_API_URL || "https://api-pix-h.sicredi.com.br/api/v2",
    token_url: process.env.SICREDI_HOMOLOG_TOKEN_URL || "https://api-pix-h.sicredi.com.br/oauth/token",
    client_id: process.env.SICREDI_HOMOLOG_CLIENT_ID,
    client_secret: process.env.SICREDI_HOMOLOG_CLIENT_SECRET,
    pix_key: process.env.SICREDI_HOMOLOG_PIX_KEY,
    ssl_verify: false,
    timeout: 15000,
    retry_attempts: 3
  },
  prod: {
    api_url: process.env.SICREDI_PROD_API_URL || "https://api-pix.sicredi.com.br/api/v2",
    token_url: process.env.SICREDI_PROD_TOKEN_URL || "https://api-pix.sicredi.com.br/oauth/token",
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
  console.error(`🔐 Client ID: ${CONFIG.client_id ? 'OK' : 'FALTANDO'}`);
  console.error(`🔐 Client Secret: ${CONFIG.client_secret ? 'OK' : 'FALTANDO'}`);
  process.exit(1);
}

if (isProducao && !CONFIG.pix_key) {
  console.error(`❌ PIX Key obrigatória em produção`);
  process.exit(1);
}

console.log("✅ Configuração do ambiente validada com sucesso");

// =====================================================
// FUNÇÕES DE TEMPLATE PDF
// =====================================================

function gerarTemplateRelatorioPDF(dados, estatisticas, periodo) {
  const dataAtual = new Date().toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const dataInicio = new Date(periodo.inicio).toLocaleDateString('pt-BR');
  const dataFim = new Date(periodo.fim).toLocaleDateString('pt-BR');
  
  const template = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Relatório de Cobranças PIX - Sicredi</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; background: #fff; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #00a651; padding-bottom: 20px; }
        .header h1 { color: #00a651; font-size: 22px; margin-bottom: 8px; }
        .header .subtitle { color: #666; font-size: 14px; }
        .periodo { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 25px; text-align: center; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
        .stat-card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
        .stat-card .number { font-size: 18px; font-weight: bold; color: #00a651; margin-bottom: 5px; }
        .stat-card .label { font-size: 12px; color: #666; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #00a651; color: white; font-weight: bold; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .status-ativa { background-color: #d1ecf1; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
        .status-paga { background-color: #d4edda; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
        .status-expirada { background-color: #f8d7da; padding: 2px 6px; border-radius: 4px; font-size: 10px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        .ambiente { background: ${AMBIENTE_ATUAL === 'prod' ? '#d4edda' : '#fff3cd'}; color: ${AMBIENTE_ATUAL === 'prod' ? '#155724' : '#856404'}; padding: 8px; border-radius: 4px; text-align: center; margin-bottom: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Relatório de Cobranças PIX</h1>
          <div class="subtitle">Igreja em Mossoró - Sistema Sicredi</div>
        </div>
        
        <div class="ambiente">Ambiente: ${AMBIENTE_ATUAL === 'prod' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}</div>
        
        <div class="periodo">
          <strong>Período:</strong> ${dataInicio} até ${dataFim}<br>
          <small>Gerado em: ${dataAtual}</small>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card"><div class="number">${estatisticas.total_cobrancas}</div><div class="label">Total de<br>Cobranças</div></div>
          <div class="stat-card"><div class="number">R$ ${estatisticas.valor_total.toFixed(2)}</div><div class="label">Valor Total<br>Solicitado</div></div>
          <div class="stat-card"><div class="number">${estatisticas.cobrancas_pagas}</div><div class="label">Cobranças<br>Pagas</div></div>
          <div class="stat-card"><div class="number">R$ ${estatisticas.valor_recebido.toFixed(2)}</div><div class="label">Valor<br>Recebido</div></div>
          <div class="stat-card"><div class="number">${estatisticas.taxa_conversao}</div><div class="label">Taxa de<br>Conversão</div></div>
          <div class="stat-card"><div class="number">${estatisticas.cobrancas_ativas}</div><div class="label">Cobranças<br>Ativas</div></div>
        </div>
        
        <div class="table-container">
          <h3 style="margin-bottom: 15px; color: #00a651;">Detalhes das Cobranças</h3>
          <table>
            <thead>
              <tr><th>Devedor</th><th>Valor</th><th>Status</th><th>Data Criação</th><th>Data Pagamento</th><th>Evento</th></tr>
            </thead>
            <tbody>
              ${dados.map(cob => `
                <tr>
                  <td>${cob.devedor || 'N/A'}</td>
                  <td>R$ ${cob.valor || '0.00'}</td>
                  <td><span class="${cob.pago ? 'status-paga' : cob.status === 'ATIVA' ? 'status-ativa' : 'status-expirada'}">${cob.pago ? 'PAGA' : cob.status || 'N/A'}</span></td>
                  <td>${cob.data_criacao ? new Date(cob.data_criacao).toLocaleDateString('pt-BR') : 'N/A'}</td>
                  <td>${cob.data_pagamento ? new Date(cob.data_pagamento).toLocaleDateString('pt-BR') : '-'}</td>
                  <td>${cob.evento || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="footer">
          <div>Igreja em Mossoró - Sistema de Cobranças PIX</div>
          <div>Relatório gerado automaticamente pelo sistema Sicredi</div>
          <div style="margin-top: 10px; font-size: 10px;">Ambiente: ${AMBIENTE_ATUAL.toUpperCase()} | API: ${CONFIG.api_url}</div>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return template;
}

// =====================================================
// CONFIGURAÇÃO DE CERTIFICADOS
// =====================================================

let certificates = {};

function carregarCertificados() {
  try {
    const certDir = "/app/certs";
    
    console.log(`🔐 Carregando certificados para ${AMBIENTE_ATUAL}:`);
    
    certificates.cert = fs.readFileSync(path.join(certDir, "cert.cer"));
    certificates.key = fs.readFileSync(path.join(certDir, "api.key"));
    
    console.log("✅ Certificado e chave carregados");

    // Tentar carregar CA específico do ambiente
    try {
      const caFile = `ca-${AMBIENTE_ATUAL}-sicredi.pem`;
      certificates.ca = fs.readFileSync(path.join(certDir, caFile));
      console.log(`✅ Certificado CA carregado: ${caFile}`);
    } catch (caError) {
      console.log(`⚠️ CA específico não encontrado, continuando sem CA`);
    }

  } catch (error) {
    console.error("❌ Erro ao carregar certificados:", error.message);
    console.log("⚠️ Continuando sem certificados SSL");
  }
}

carregarCertificados();

console.log(`
🏦 PIX Service Multi-Ambiente Configurado
📍 Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}
🌐 API URL: ${CONFIG.api_url}
🔐 Client ID: ${CONFIG.client_id?.substring(0, 10)}...
🔑 PIX Key: ${CONFIG.pix_key || "NÃO CONFIGURADA"}
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
  if (!certificates.cert || !certificates.key) {
    console.log("⚠️ Certificados não disponíveis, usando configuração básica");
    return new https.Agent({
      rejectUnauthorized: CONFIG.ssl_verify
    });
  }

  const baseConfig = {
    cert: certificates.cert,
    key: certificates.key,
  };

  if (CONFIG.ssl_verify === false && !isProducao) {
    console.warn("⚠️ SSL verification disabled (homologação apenas)");
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
        console.warn("⚠️ Tentativa sem verificação SSL - HOMOLOGAÇÃO");
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
      scope: "cob.write+cob.read+cobv.write+cobv.read+pix.write+pix.read",
      expires_in: 604800 // 48 horas
    };

    console.log(`🔐 Obtendo token (tentativa ${tentativa})...`);

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
      await new Promise(resolve => setTimeout(resolve, 1000 * tentativa));
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
  // TXID PIX deve ter entre 26-35 caracteres alfanuméricos
  // Formato: prefixo + timestamp + random para garantir unicidade
  const prefixo = 'PIX';
  const timestamp = Date.now().toString(36).toUpperCase(); // Base36 timestamp
  const random = crypto.randomBytes(10).toString('hex').toUpperCase(); // 20 chars hex
  const txid = `${prefixo}${timestamp}${random}`.substring(0, 32);
  
  // Garantir que tem pelo menos 26 caracteres
  const txidFinal = txid.length >= 26 ? txid : txid.padEnd(26, '0');
  
  console.log(`🔑 TXID gerado: ${txidFinal} (${txidFinal.length} chars)`);
  return txidFinal;
}

function validarCPF(cpf) {
  // Remove caracteres não numéricos
  cpf = cpf.toString().replace(/\D/g, "");
  
  // Verifica se tem 11 dígitos
  if (cpf.length !== 11) {
    return false;
  }
  
  // Verifica se não são todos iguais (ex: 11111111111)
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  
  return true;
}

function formatarCPF(cpf) {
  // Remove caracteres não numéricos e garante 11 dígitos
  const cpfLimpo = cpf.toString().replace(/\D/g, "");
  
  if (cpfLimpo.length === 11 && validarCPF(cpfLimpo)) {
    return cpfLimpo;
  }
  
  // Se CPF inválido, usa um CPF de teste válido para homologação
  return "00000000000";
}

function validarPagamento(pagamento) {
  if (!pagamento["Row ID"] || !pagamento.Pagador || !pagamento["Valor Pix"]) {
    return {
      valido: false,
      erro: "Campos obrigatórios: Row ID, Pagador, Valor Pix"
    };
  }

  // Converter vírgula para ponto se necessário
  let valorStr = pagamento["Valor Pix"].toString().replace(",", ".");
  const valor = parseFloat(valorStr);
  
  if (isNaN(valor) || valor <= 0) {
    return {
      valido: false,
      erro: `Valor Pix deve ser um número positivo. Recebido: "${pagamento["Valor Pix"]}"`
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
// ENDPOINTS
// =====================================================

// Health check
app.get("/health", (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    status: "ok",
    service: "pix-service",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    uptime_formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    environment: AMBIENTE_ATUAL,
    config: {
      api_url: CONFIG.api_url,
      client_id_configured: !!CONFIG.client_id,
      client_secret_configured: !!CONFIG.client_secret,
      pix_key_configured: !!CONFIG.pix_key,
      ssl_verify: CONFIG.ssl_verify
    },
    certificates: {
      cert_loaded: !!certificates.cert,
      key_loaded: !!certificates.key,
      ca_loaded: !!certificates.ca
    }
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
    console.log(`📥 Payload recebido no /gerar-pix:`, JSON.stringify(req.body, null, 2));
    
    let pagamento, evento, tag_evento, categoria;
    
    // Detectar formato AppSheet (dados diretos) vs formato antigo (objeto pagamento)
    if (req.body.pagamento) {
      // Formato antigo: { pagamento: {...}, evento: "...", ... }
      ({ pagamento, evento, tag_evento, categoria } = req.body);
    } else if (req.body["Row ID"] || req.body.Pagador || req.body["Valor Pix"]) {
      // Formato AppSheet: dados diretos no body
      pagamento = {
        "Row ID": req.body["Row ID"],
        "Pagador": req.body.Pagador,
        "Valor Pix": req.body["Valor Pix"]?.replace(",", "."), // Converter vírgula para ponto
        "Inscricao": req.body.cpf || req.body.Inscricao // Priorizar campo 'cpf' se disponível
      };
      evento = req.body.evento;
      tag_evento = req.body.tag_evento;
      categoria = req.body.categoria;
    } else {
      return res.status(400).json({
        erro: "Formato de dados inválido. Esperado: campos 'Row ID', 'Pagador', 'Valor Pix'",
        ambiente: AMBIENTE_ATUAL,
        payload_recebido: req.body
      });
    }

    console.log(`📋 Dados processados - Pagamento:`, pagamento);
    console.log(`📋 Evento: ${evento}, Tag: ${tag_evento}, Categoria: ${categoria}`);
    console.log(`📋 CPF processado: ${pagamento.Inscricao} → ${formatarCPF(pagamento.Inscricao || "00000000000")}`);

    const validacao = validarPagamento(pagamento);
    if (!validacao.valido) {
      return res.status(400).json({
        erro: validacao.erro,
        ambiente: AMBIENTE_ATUAL,
        dados_processados: pagamento
      });
    }

    const txid = gerarTxid();
    const valor = parseFloat(pagamento["Valor Pix"].toString().replace(",", ".")).toFixed(2);

    const pixPayload = {
      calendario: {
        expiracao: 604800
      },
      devedor: {
        nome: pagamento.Pagador.trim(),
        cpf: formatarCPF(pagamento.Inscricao || "00000000000")
      },
      valor: {
        original: valor
      },
      chave: CONFIG.pix_key,
      solicitacaoPagador: pagamento.descricao_pagador || `Pag ${evento} ${pagamento.Inscricao}`
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
    
    // Log detalhado do erro
    if (error.response) {
      console.error(`📋 Status: ${error.response.status}`);
      console.error(`📋 Data:`, JSON.stringify(error.response.data, null, 2));
    }
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao gerar PIX";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      ambiente: AMBIENTE_ATUAL,
      detalhes: error.response?.data || error.message
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
    
    // Calcular data de expiração (data de criação + expiracao em segundos)
    let dataExpiracao = null;
    let expirado = false;
    
    if (dadosCobranca.calendario?.criacao && dadosCobranca.calendario?.expiracao) {
      const dataCriacao = new Date(dadosCobranca.calendario.criacao);
      const expiracaoSegundos = dadosCobranca.calendario.expiracao;
      
      dataExpiracao = new Date(dataCriacao.getTime() + (expiracaoSegundos * 1000));
      expirado = new Date() > dataExpiracao;
      
      console.log(`📅 PIX expira em: ${dataExpiracao.toLocaleString('pt-BR')} - ${expirado ? 'EXPIRADO' : 'VÁLIDO'}`);
    }

    console.log(`✅ PIX consultado: ${txid} - Status: ${dadosCobranca.status}`);

    res.json({
      txid: txid,
      status: dadosCobranca.status,
      pago: foiPago,
      expirado: expirado,
      dados: {
        valor: dadosCobranca.valor,
        devedor: dadosCobranca.devedor,
        data_criacao: dadosCobranca.calendario?.criacao,
        data_expiracao: dataExpiracao ? dataExpiracao.toISOString() : null,
        data_expiracao_formatada: dataExpiracao ? dataExpiracao.toLocaleString('pt-BR') : null,
        expiracao_segundos: dadosCobranca.calendario?.expiracao || null,
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

// Endpoint para debug do payload
app.post("/debug-payload", async (req, res) => {
  try {
    const { pagamento, evento, tag_evento, categoria } = req.body;
    
    console.log("🐛 Debug - Payload recebido:", JSON.stringify(req.body, null, 2));
    
    if (!pagamento) {
      return res.status(400).json({
        erro: "Objeto 'pagamento' é obrigatório",
        payload_recebido: req.body
      });
    }

    const validacao = validarPagamento(pagamento);
    if (!validacao.valido) {
      return res.status(400).json({
        erro: validacao.erro,
        pagamento_recebido: pagamento
      });
    }

    const txid = gerarTxid();
    const valor = parseFloat(pagamento["Valor Pix"]).toFixed(2);

    const pixPayload = {
      calendario: { expiracao: 604800 },
      devedor: {
        nome: pagamento.Pagador,
        cpf: pagamento.Inscricao?.replace(/\D/g, "") || "00000000000"
      },
      valor: { original: valor },
      chave: CONFIG.pix_key,
      solicitacaoPagador: pagamento.descricao_pagador || `Pagamento ${pagamento["Row ID"]}`
    };

    if (evento || tag_evento || categoria) {
      pixPayload.infoAdicionais = [];
      if (evento) pixPayload.infoAdicionais.push({ nome: "evento", valor: evento });
      if (tag_evento) pixPayload.infoAdicionais.push({ nome: "tag_evento", valor: tag_evento });
      if (categoria) pixPayload.infoAdicionais.push({ nome: "categoria", valor: categoria });
    }

    res.json({
      debug: true,
      ambiente: AMBIENTE_ATUAL,
      config: {
        api_url: CONFIG.api_url,
        pix_key: CONFIG.pix_key,
        client_id: CONFIG.client_id ? CONFIG.client_id.substring(0, 10) + "..." : "NÃO CONFIGURADO"
      },
      payload_recebido: req.body,
      payload_a_enviar: pixPayload,
      url_destino: `${CONFIG.api_url}/cob/${txid}`,
      txid_gerado: txid,
      validacao: validacao
    });

  } catch (error) {
    console.error("❌ Erro no debug:", error.message);
    res.status(500).json({
      erro: "Erro no debug",
      detalhes: error.message
    });
  }
});

// Endpoint AppSheet integrado - Será chamado via Nginx redirect para WhatsApp Service
app.post("/appsheet-whatsapp", async (req, res) => {
  try {
    console.log('📱 AppSheet request recebido no PIX Service (deve ser redirecionado para WhatsApp Service)');
    
    // Este endpoint será chamado apenas se o Nginx não conseguir redirecionar
    res.status(503).json({
      erro: "Este endpoint deve ser processado pelo WhatsApp Service",
      message: "Verifique se o WhatsApp Service está funcionando",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ Erro AppSheet:", error.message);
    res.status(500).json({
      erro: "Falha no processamento AppSheet",
      detalhes: error.message
    });
  }
});

// =====================================================
// ENDPOINTS DE RELATÓRIOS E PDFS
// =====================================================

// Endpoint específico para AppSheet - retorna objeto com arrays simples
app.get("/relatorio-appsheet", async (req, res) => {
  try {
    const { 
      data_inicio, 
      data_fim, 
      status_filtro 
    } = req.query;
    
    const token = await obterToken();
    
    // Definir período (padrão: últimos 7 dias)
    const fim = data_fim ? new Date(data_fim) : new Date();
    const inicio = data_inicio ? new Date(data_inicio) : new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const inicioISO = inicio.toISOString();
    const fimISO = fim.toISOString();
    
    console.log(`📊 Gerando relatório AppSheet: ${inicioISO} até ${fimISO}`);
    
    // Buscar cobranças do período
    const cobrancas = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob?inicio=${inicioISO}&fim=${fimISO}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    const dados = cobrancas.data.cobs || [];
    
    // Retornar array simples para AppSheet
    const cobrancasFormatadas = dados.map(cob => ({
      txid: cob.txid,
      valor: cob.valor?.original || "0.00",
      devedor: cob.devedor?.nome || "Sem nome",
      status: cob.status || "DESCONHECIDO",
      data_criacao: cob.calendario?.criacao || null,
      pago: cob.pix?.length > 0 ? "SIM" : "NAO",
      data_pagamento: cob.pix?.[0]?.horario || null,
      ambiente: AMBIENTE_ATUAL,
      tipo: "cobranca_imediata"
    }));
    
    console.log(`📋 Retornando ${cobrancasFormatadas.length} cobranças para AppSheet`);
    
    // Retornar objeto simples com as cobranças
    const resultado = {
      cobrancas: cobrancasFormatadas,
      total: cobrancasFormatadas.length
    };
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(resultado);
    
  } catch (error) {
    console.error("❌ Erro no relatório AppSheet:", error);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      cobrancas: [{
        txid: "erro_sistema",
        valor: "0.00",
        devedor: "Erro ao buscar dados",
        status: "ERRO",
        data_criacao: new Date().toISOString(),
        pago: "NAO",
        data_pagamento: null,
        ambiente: AMBIENTE_ATUAL,
        tipo: "erro"
      }],
      total: 0
    });
  }
});

// Endpoint alternativo para AppSheet com estrutura mais simples
app.get("/appsheet-cobrancas", async (req, res) => {
  try {
    const { 
      data_inicio, 
      data_fim 
    } = req.query;
    
    const token = await obterToken();
    
    // Definir período (padrão: últimos 7 dias)
    const fim = data_fim ? new Date(data_fim) : new Date();
    const inicio = data_inicio ? new Date(data_inicio) : new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const inicioISO = inicio.toISOString();
    const fimISO = fim.toISOString();
    
    console.log(`📊 AppSheet: Buscando cobranças de ${inicioISO} até ${fimISO}`);
    
    // Buscar cobranças do período
    const cobrancas = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob?inicio=${inicioISO}&fim=${fimISO}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    const dados = cobrancas.data.cobs || [];
    console.log(`📊 Encontradas ${dados.length} cobranças`);
    
    // Estrutura muito simples para o AppSheet
    const response = {
      sucesso: true,
      total_encontrado: dados.length,
      primeiro_devedor: dados.length > 0 ? dados[0].devedor?.nome || "N/A" : "Nenhum",
      primeiro_valor: dados.length > 0 ? dados[0].valor?.original || "0.00" : "0.00",
      primeiro_status: dados.length > 0 ? dados[0].status || "N/A" : "N/A",
      primeiro_pago: dados.length > 0 ? (dados[0].pix?.length > 0 ? "SIM" : "NAO") : "NAO",
      // Colocar dados como string para evitar problemas de parsing
      dados_json: JSON.stringify(dados.map(cob => ({
        txid: cob.txid,
        valor: cob.valor?.original || "0.00",
        devedor: cob.devedor?.nome || "Sem nome",
        status: cob.status || "DESCONHECIDO",
        data_criacao: cob.calendario?.criacao || null,
        pago: cob.pix?.length > 0 ? "SIM" : "NAO"
      })))
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
    
  } catch (error) {
    console.error("❌ Erro AppSheet cobranças:", error);
    res.status(500).json({
      sucesso: false,
      erro: error.message,
      total_encontrado: 0,
      primeiro_devedor: "ERRO",
      primeiro_valor: "0.00",
      primeiro_status: "ERRO",
      primeiro_pago: "NAO",
      dados_json: "[]"
    });
  }
});

// Endpoint para gerar relatório em PDF
app.get("/relatorio-pdf", async (req, res) => {
  try {
    const { 
      data_inicio, 
      data_fim, 
      nome_arquivo,
      evento,
      categoria,
      status
    } = req.query;
    
    const token = await obterToken();
    
    // Definir período (padrão: últimos 7 dias)
    const fim = data_fim ? new Date(data_fim) : new Date();
    const inicio = data_inicio ? new Date(data_inicio) : new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const inicioISO = inicio.toISOString();
    const fimISO = fim.toISOString();
    
    console.log(`📄 Gerando relatório PDF: ${inicioISO} até ${fimISO}`);
    
    // Buscar cobranças do período
    const cobrancas = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob?inicio=${inicioISO}&fim=${fimISO}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    const dados = cobrancas.data.cobs || [];
    
    // Processar estatísticas
    const stats = {
      total_cobrancas: dados.length,
      valor_total: dados.reduce((acc, cob) => acc + parseFloat(cob.valor?.original || 0), 0),
      cobrancas_pagas: dados.filter(cob => cob.pix?.length > 0).length,
      cobrancas_ativas: dados.filter(cob => cob.status === 'ATIVA').length,
      cobrancas_expiradas: dados.filter(cob => cob.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR').length,
      valor_recebido: dados
        .filter(cob => cob.pix?.length > 0)
        .reduce((acc, cob) => acc + parseFloat(cob.valor?.original || 0), 0),
      taxa_conversao: dados.length > 0 ? 
        ((dados.filter(cob => cob.pix?.length > 0).length / dados.length) * 100).toFixed(1) + '%' : '0%'
    };
    
    // Formatar dados para o template
    let dadosFormatados = dados.map(cob => {
      // Extrair informações de evento das informações adicionais
      const infoEvento = cob.infoAdicionais?.find(info => info.nome === 'evento');
      const infoCategoria = cob.infoAdicionais?.find(info => info.nome === 'categoria');
      
      return {
        txid: cob.txid,
        valor: cob.valor?.original,
        devedor: cob.devedor?.nome,
        status: cob.status,
        data_criacao: cob.calendario?.criacao,
        pago: cob.pix?.length > 0,
        data_pagamento: cob.pix?.[0]?.horario,
        evento: infoEvento?.valor || null,
        categoria: infoCategoria?.valor || null
      };
    });
    
    // Aplicar filtros por evento/categoria se informados
    if (evento) {
      dadosFormatados = dadosFormatados.filter(cob => 
        cob.evento && cob.evento.toLowerCase().includes(evento.toLowerCase())
      );
      console.log(`🔍 Filtro por evento "${evento}": ${dadosFormatados.length} cobranças encontradas`);
    }
    
    if (categoria) {
      dadosFormatados = dadosFormatados.filter(cob => 
        cob.categoria && cob.categoria.toLowerCase().includes(categoria.toLowerCase())
      );
      console.log(`🔍 Filtro por categoria "${categoria}": ${dadosFormatados.length} cobranças encontradas`);
    }
    
    if (status) {
      dadosFormatados = dadosFormatados.filter(cob => {
        if (status.toLowerCase() === 'paga') {
          return cob.pago === true;
        } else if (status.toLowerCase() === 'ativa') {
          return cob.status === 'ATIVA' && !cob.pago;
        } else if (status.toLowerCase() === 'expirada') {
          return cob.status === 'EXPIRADA' && !cob.pago;
        } else {
          return cob.status && cob.status.toLowerCase().includes(status.toLowerCase());
        }
      });
      console.log(`🔍 Filtro por status "${status}": ${dadosFormatados.length} cobranças encontradas`);
    }
    
    // Gerar HTML
    const html = gerarTemplateRelatorioPDF(dadosFormatados, stats, {
      inicio: inicioISO,
      fim: fimISO
    });
    
    // Gerar nome do arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    let sufixoFiltro = '';
    if (evento) sufixoFiltro += `-evento-${evento.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (categoria) sufixoFiltro += `-cat-${categoria.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (status) sufixoFiltro += `-status-${status.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    const nomeArquivo = nome_arquivo || 
      `relatorio-cobrancas-${AMBIENTE_ATUAL}-${timestamp}${sufixoFiltro}-${Date.now()}.pdf`;
    
    const caminhoArquivo = path.join(PDF_PATH, nomeArquivo);
    
    console.log(`📄 Gerando PDF: ${nomeArquivo}`);
    
    // Configurações do PDF
    const options = {
      format: 'A4',
      border: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px"
      },
      paginationOffset: 1,
      height: "297mm",
      width: "210mm",
      timeout: 30000
    };
    
    const file = { content: html };
    
    // Gerar PDF
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    
    // Salvar PDF no servidor
    fs.writeFileSync(caminhoArquivo, pdfBuffer);
    
    console.log(`✅ PDF gerado com sucesso: ${nomeArquivo}`);
    
    // URL para acessar o PDF
    const urlPdf = `${req.protocol}://${req.get('host')}/pdfs/${nomeArquivo}`;
    
    res.json({
      sucesso: true,
      message: "Relatório PDF gerado com sucesso",
      arquivo: {
        nome: nomeArquivo,
        url: urlPdf,
        caminho: caminhoArquivo,
        tamanho: fs.statSync(caminhoArquivo).size
      },
      periodo: {
        inicio: inicioISO,
        fim: fimISO,
        inicio_formatado: inicio.toLocaleDateString('pt-BR'),
        fim_formatado: fim.toLocaleDateString('pt-BR')
      },
      estatisticas: stats,
      total_cobrancas: dados.length,
      total_filtradas: dadosFormatados.length,
      filtros_aplicados: {
        evento: evento || null,
        categoria: categoria || null
      },
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      },
      gerado_em: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Erro ao gerar relatório PDF:", error);
    res.status(500).json({
      erro: "Falha ao gerar relatório PDF",
      detalhes: error.message,
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para listar PDFs disponíveis
app.get("/listar-pdfs", (req, res) => {
  try {
    const arquivos = fs.readdirSync(PDF_PATH)
      .filter(arquivo => arquivo.endsWith('.pdf'))
      .map(arquivo => {
        const caminhoCompleto = path.join(PDF_PATH, arquivo);
        const stats = fs.statSync(caminhoCompleto);
        
        return {
          nome: arquivo,
          url: `${req.protocol}://${req.get('host')}/pdfs/${arquivo}`,
          tamanho: stats.size,
          tamanho_formatado: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          data_criacao: stats.birthtime.toISOString(),
          data_modificacao: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
    
    console.log(`📋 Listando ${arquivos.length} PDFs disponíveis`);
    
    res.json({
      sucesso: true,
      total: arquivos.length,
      arquivos: arquivos,
      diretorio: PDF_PATH,
      ambiente: AMBIENTE_ATUAL
    });
    
  } catch (error) {
    console.error("❌ Erro ao listar PDFs:", error);
    res.status(500).json({
      erro: "Falha ao listar PDFs",
      detalhes: error.message
    });
  }
});

// Endpoint para deletar PDF específico
app.delete("/pdfs/:nome", (req, res) => {
  try {
    const nomeArquivo = req.params.nome;
    const caminhoArquivo = path.join(PDF_PATH, nomeArquivo);
    
    if (!fs.existsSync(caminhoArquivo)) {
      return res.status(404).json({
        erro: "PDF não encontrado",
        arquivo: nomeArquivo
      });
    }
    
    fs.unlinkSync(caminhoArquivo);
    console.log(`🗑️ PDF deletado: ${nomeArquivo}`);
    
    res.json({
      sucesso: true,
      message: "PDF deletado com sucesso",
      arquivo: nomeArquivo
    });
    
  } catch (error) {
    console.error("❌ Erro ao deletar PDF:", error);
    res.status(500).json({
      erro: "Falha ao deletar PDF",
      detalhes: error.message
    });
  }
});

// Endpoint de relatório/dashboard
app.get("/relatorio-cobrancas", async (req, res) => {
  try {
    const { 
      data_inicio, 
      data_fim, 
      status_filtro 
    } = req.query;
    
    const token = await obterToken();
    
    // Definir período (padrão: últimos 7 dias)
    const fim = data_fim ? new Date(data_fim) : new Date();
    const inicio = data_inicio ? new Date(data_inicio) : new Date(fim.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const inicioISO = inicio.toISOString();
    const fimISO = fim.toISOString();
    
    console.log(`📊 Gerando relatório: ${inicioISO} até ${fimISO}`);
    
    // Buscar cobranças do período
    const cobrancas = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob?inicio=${inicioISO}&fim=${fimISO}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    const dados = cobrancas.data.cobs || [];
    
    // Processar estatísticas
    const stats = {
      total_cobrancas: dados.length,
      valor_total: dados.reduce((acc, cob) => acc + parseFloat(cob.valor?.original || 0), 0),
      cobrancas_pagas: dados.filter(cob => cob.pix?.length > 0).length,
      cobrancas_ativas: dados.filter(cob => cob.status === 'ATIVA').length,
      cobrancas_expiradas: dados.filter(cob => cob.status === 'REMOVIDA_PELO_USUARIO_RECEBEDOR').length,
      valor_recebido: dados
        .filter(cob => cob.pix?.length > 0)
        .reduce((acc, cob) => acc + parseFloat(cob.valor?.original || 0), 0),
      taxa_conversao: dados.length > 0 ? 
        ((dados.filter(cob => cob.pix?.length > 0).length / dados.length) * 100).toFixed(1) + '%' : '0%'
    };
    
    res.json({
      sucesso: true,
      periodo: {
        inicio: inicioISO,
        fim: fimISO
      },
      estatisticas: stats,
      cobrancas: dados.map(cob => ({
        txid: cob.txid,
        valor: cob.valor?.original,
        devedor: cob.devedor?.nome,
        status: cob.status,
        data_criacao: cob.calendario?.criacao,
        pago: cob.pix?.length > 0,
        data_pagamento: cob.pix?.[0]?.horario,
        ambiente: AMBIENTE_ATUAL
      })),
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      }
    });
    
  } catch (error) {
    console.error("❌ Erro no relatório:", error);
    res.status(500).json({
      erro: "Falha ao gerar relatório",
      detalhes: error.message,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// =====================================================
// INICIALIZAÇÃO DO SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 PIX Service iniciado com sucesso!
📍 Porta: ${PORT}
🌐 Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}
🏥 Health: http://localhost:${PORT}/health
📋 Endpoints principais:
   • POST /gerar-pix - Cobrança PIX imediata
   • GET  /consultar-pix/:txid - Consultar cobrança
   • POST /debug-payload - Debug de payload
   • POST /appsheet-whatsapp - Endpoint AppSheet
   • GET  /health - Health check
   • GET  /ping - Ping
   
📊 Endpoints de relatórios:
   • GET  /relatorio-appsheet - Relatório para AppSheet
   • GET  /appsheet-cobrancas - AppSheet estrutura simples
   • GET  /relatorio-pdf - Gerar relatório PDF (params: data_inicio, data_fim, evento, categoria, status)
   • GET  /listar-pdfs - Listar PDFs disponíveis
   • DELETE /pdfs/:nome - Deletar PDF específico
   • GET  /pdfs/:nome - Acessar PDF gerado
   • GET  /relatorio-cobrancas - Relatório completo JSON
  `);
});