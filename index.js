// =====================================================
// CONFIGURAÇÃO MULTI-AMBIENTE - Substitua no início do seu middleware
// =====================================================

const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const CERT_PATH = path.join(__dirname, "certs");

// =====================================================
// CONFIGURAÇÃO DE AMBIENTES
// =====================================================

// Determinar ambiente atual
const AMBIENTE_ATUAL = process.env.SICREDI_ENV || 'homolog'; // 'prod' ou 'homolog'
const isProducao = AMBIENTE_ATUAL === 'prod';

console.log(`🌍 Ambiente atual: ${isProducao ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}`);

// Configurações por ambiente
const CONFIG_AMBIENTES = {
  homolog: {
    // URLs da API Sicredi - Homologação
    api_url: process.env.SICREDI_HOMOLOG_API_URL || "https://api-pix-h.sicredi.com.br/api/v2",
    token_url: process.env.SICREDI_HOMOLOG_TOKEN_URL || "https://api-pix-h.sicredi.com.br/oauth/token",
    
    // Credenciais - Homologação
    client_id: process.env.SICREDI_HOMOLOG_CLIENT_ID,
    client_secret: process.env.SICREDI_HOMOLOG_CLIENT_SECRET,
    
    // Chave PIX - Homologação
    pix_key: process.env.SICREDI_HOMOLOG_PIX_KEY,
    
    // Configurações específicas
    timeout: 15000,
    retry_attempts: 3,
    ssl_verify: false, // Homologação pode ter SSL mais flexível
    
    // Certificados específicos (opcional)
    cert_prefix: 'homolog_' // ex: homolog_cert.cer, homolog_api.key
  },
  
  prod: {
    // URLs da API Sicredi - Produção
    api_url: process.env.SICREDI_PROD_API_URL || "https://api-pix.sicredi.com.br/api/v2",
    token_url: process.env.SICREDI_PROD_TOKEN_URL || "https://api-pix.sicredi.com.br/oauth/token",
    
    // Credenciais - Produção
    client_id: process.env.SICREDI_PROD_CLIENT_ID,
    client_secret: process.env.SICREDI_PROD_CLIENT_SECRET,
    
    // Chave PIX - Produção
    pix_key: process.env.SICREDI_PROD_PIX_KEY,
    
    // Configurações específicas
    timeout: 10000,
    retry_attempts: 2,
    ssl_verify: true, // Produção sempre com SSL rigoroso
    
    // Certificados específicos (opcional)
    cert_prefix: 'prod_' // ex: prod_cert.cer, prod_api.key
  }
};

// Configuração ativa baseada no ambiente
const CONFIG = CONFIG_AMBIENTES[AMBIENTE_ATUAL];

// Validar configurações obrigatórias
function validarConfiguracao() {
  const erros = [];
  
  if (!CONFIG.client_id) {
    erros.push(`SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_CLIENT_ID não configurado`);
  }
  
  if (!CONFIG.client_secret) {
    erros.push(`SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_CLIENT_SECRET não configurado`);
  }
  
  if (isProducao && !CONFIG.pix_key) {
    erros.push(`SICREDI_PROD_PIX_KEY é obrigatória em produção`);
  }
  
  if (erros.length > 0) {
    console.error("❌ Erros de configuração:");
    erros.forEach(erro => console.error(`   - ${erro}`));
    console.error("\n📋 Variáveis necessárias no .env:");
    console.error(getExemploEnv());
    throw new Error("Configuração inválida para o ambiente " + AMBIENTE_ATUAL);
  }
  
  console.log("✅ Configuração do ambiente validada com sucesso");
}

// Gerar exemplo de .env
function getExemploEnv() {
  return `
# =====================================================
# CONFIGURAÇÃO SICREDI - HOMOLOGAÇÃO
# =====================================================
SICREDI_ENV=homolog
SICREDI_HOMOLOG_CLIENT_ID=seu_client_id_homolog
SICREDI_HOMOLOG_CLIENT_SECRET=seu_client_secret_homolog
SICREDI_HOMOLOG_PIX_KEY=sua_chave_pix_homolog@sicredi.com.br
SICREDI_HOMOLOG_API_URL=https://api-pix-h.sicredi.com.br/api/v2
SICREDI_HOMOLOG_TOKEN_URL=https://api-pix-h.sicredi.com.br/oauth/token

# =====================================================
# CONFIGURAÇÃO SICREDI - PRODUÇÃO
# =====================================================
# SICREDI_ENV=prod
# SICREDI_PROD_CLIENT_ID=seu_client_id_producao
# SICREDI_PROD_CLIENT_SECRET=seu_client_secret_producao
# SICREDI_PROD_PIX_KEY=sua_chave_pix_producao@sicredi.com.br
# SICREDI_PROD_API_URL=https://api-pix.sicredi.com.br/api/v2
# SICREDI_PROD_TOKEN_URL=https://api-pix.sicredi.com.br/oauth/token

# =====================================================
# OUTRAS CONFIGURAÇÕES
# =====================================================
PORT=3000
NODE_ENV=development
`;
}

// Executar validação na inicialização
try {
  validarConfiguracao();
} catch (error) {
  console.error("💥 Falha na inicialização:", error.message);
  process.exit(1);
}

// =====================================================
// FUNÇÃO PARA CARREGAR CERTIFICADOS POR AMBIENTE
// =====================================================
function carregarCertificados() {
  try {
    const certPrefix = CONFIG.cert_prefix || '';
    
    // Tentar carregar certificados específicos do ambiente primeiro
    let certPath = path.join(CERT_PATH, `${certPrefix}cert.cer`);
    let keyPath = path.join(CERT_PATH, `${certPrefix}api.key`);
    
    // Se não existir, usar certificados padrão
    if (!fs.existsSync(certPath)) {
      certPath = path.join(CERT_PATH, "cert.cer");
    }
    
    if (!fs.existsSync(keyPath)) {
      keyPath = path.join(CERT_PATH, "api.key");
    }
    
    console.log(`🔐 Carregando certificados para ${AMBIENTE_ATUAL}:`);
    console.log(`   - Cert: ${path.basename(certPath)}`);
    console.log(`   - Key: ${path.basename(keyPath)}`);
    
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    
    // Carregar CA específico do ambiente ou padrão
    let ca;
    const possiveisCAs = [
      `${certPrefix}ca-${AMBIENTE_ATUAL}-sicredi.pem`,
      `${certPrefix}ca.pem`,
      `ca-${AMBIENTE_ATUAL}-sicredi.pem`,
      "ca-homolog-sicredi.pem",
      "ca-homolog-sicredi.crt", 
      "ca.pem",
      "chain.pem"
    ];
    
    for (const caFile of possiveisCAs) {
      const caPath = path.join(CERT_PATH, caFile);
      if (fs.existsSync(caPath)) {
        ca = fs.readFileSync(caPath);
        console.log(`✅ Certificado CA carregado: ${caFile}`);
        break;
      }
    }
    
    if (!ca) {
      console.warn(`⚠️  Nenhum certificado CA encontrado para ${AMBIENTE_ATUAL}`);
    }
    
    return { cert, key, ca };
    
  } catch (error) {
    console.error("❌ Erro ao carregar certificados:", error.message);
    throw error;
  }
}

const certificates = carregarCertificados();

// =====================================================
// FUNÇÃO PARA CRIAR AGENTE HTTPS POR AMBIENTE
// =====================================================
function criarAgentHTTPS(tentativa = 1) {
  const baseConfig = {
    cert: certificates.cert,
    key: certificates.key,
  };

  // Configuração SSL baseada no ambiente
  if (CONFIG.ssl_verify === false && !isProducao) {
    console.warn("⚠️  SSL verification disabled (homologação apenas)");
    return new https.Agent({
      ...baseConfig,
      rejectUnauthorized: false,
    });
  }

  switch (tentativa) {
    case 1:
      // Primeira tentativa: com CA completo
      return new https.Agent({
        ...baseConfig,
        ca: certificates.ca,
        rejectUnauthorized: true,
      });
    
    case 2:
      // Segunda tentativa: sem CA específico, mas com verificação
      return new https.Agent({
        ...baseConfig,
        rejectUnauthorized: true,
      });
    
    case 3:
      // Terceira tentativa: sem verificação SSL (apenas para homologação)
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

// =====================================================
// FUNÇÃO PARA OBTER TOKEN POR AMBIENTE
// =====================================================
async function obterToken(tentativa = 1) {
  try {
    const credentials = Buffer.from(`${CONFIG.client_id}:${CONFIG.client_secret}`).toString("base64");
    const httpsAgent = criarAgentHTTPS(tentativa);
    
    console.log(`🔑 Obtendo token ${AMBIENTE_ATUAL} (tentativa ${tentativa})...`);
    console.log(`🔐 Client ID: ${CONFIG.client_id ? CONFIG.client_id.substring(0, 8) + '...' : 'NÃO CONFIGURADO'}`);
    
    // Escopos baseados no ambiente
    const escopos = isProducao ? [
      "cob.write+cob.read+webhook.read+webhook.write", // Produção: escopo completo
      "cob.read+cob.write+pix.read",
      "cob.write+cob.read"
    ] : [
      "cob.write+cob.read+webhook.read+webhook.write", // Homolog: pode tentar mais variações
      "cob.read+cob.write+pix.read",
      "cob.write+cob.read+pix.read",
      "cob.write+cob.read",
      "cob.read+cob.write"
    ];
    
    const escopo = escopos[Math.min(tentativa - 1, escopos.length - 1)];
    
    let url, body, headers;
    
    if (tentativa <= 3) {
      url = CONFIG.token_url;
      body = escopo ? 
        `grant_type=client_credentials&scope=${escopo}` : 
        `grant_type=client_credentials`;
      headers = {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        ...(escopo && { scope: escopo })
      });
      url = `${CONFIG.token_url}?${params.toString()}`;
      body = '';
      headers = {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      };
    }
    
    console.log(`📋 ${AMBIENTE_ATUAL.toUpperCase()} - Escopo: "${escopo || 'sem escopo'}" - Método: ${tentativa <= 3 ? 'BODY' : 'QUERY'}`);
    
    const response = await axios.post(
      url,
      body,
      {
        headers,
        httpsAgent,
        timeout: CONFIG.timeout,
      }
    );
    
    console.log(`✅ Token ${AMBIENTE_ATUAL} obtido com sucesso`);
    return response.data.access_token;
    
  } catch (error) {
    console.error(`❌ Erro token ${AMBIENTE_ATUAL} (tentativa ${tentativa}):`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    if (tentativa < CONFIG.retry_attempts && (
      error.response?.status === 400 ||
      error.response?.data?.detail?.includes('Escopo') ||
      error.response?.data?.detail?.includes('escopo') ||
      error.code === 'UNABLE_TO_GET_ISSUER_CERT' || 
      error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      error.code === 'CERT_UNTRUSTED'
    )) {
      console.log(`🔄 Tentando novamente token ${AMBIENTE_ATUAL} (${tentativa + 1})...`);
      return obterToken(tentativa + 1);
    }
    
    throw error;
  }
}

// =====================================================
// FUNÇÃO PARA FAZER REQUISIÇÕES POR AMBIENTE
// =====================================================
async function fazerRequisicaoSicredi(url, options, tentativa = 1) {
  try {
    const httpsAgent = criarAgentHTTPS(tentativa);
    const response = await axios({
      ...options,
      url,
      httpsAgent,
      timeout: CONFIG.timeout,
    });
    
    return response;
    
  } catch (error) {
    console.error(`❌ Erro requisição ${AMBIENTE_ATUAL} (tentativa ${tentativa}):`, error.message);
    
    if (tentativa < CONFIG.retry_attempts && (
      error.code === 'UNABLE_TO_GET_ISSUER_CERT' || 
      error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      error.code === 'CERT_UNTRUSTED'
    )) {
      console.log(`🔄 Tentando requisição ${AMBIENTE_ATUAL} novamente (${tentativa + 1})...`);
      return fazerRequisicaoSicredi(url, options, tentativa + 1);
    }
    
    throw error;
  }
}

// =====================================================
// ENDPOINT DE HEALTH CHECK ATUALIZADO
// =====================================================
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    ambiente: {
      atual: AMBIENTE_ATUAL,
      producao: isProducao
    },
    configuracao: {
      api_url: CONFIG.api_url,
      token_url: CONFIG.token_url,
      client_id_configurado: !!CONFIG.client_id,
      client_secret_configurado: !!CONFIG.client_secret,
      pix_key_configurado: !!CONFIG.pix_key,
      ssl_verify: CONFIG.ssl_verify,
      timeout: CONFIG.timeout,
      retry_attempts: CONFIG.retry_attempts
    },
    certificates: {
      cert: !!certificates.cert,
      key: !!certificates.key,
      ca: !!certificates.ca
    },
    validacao: {
      chave_pix_obrigatoria: isProducao,
      configuracao_valida: !!CONFIG.client_id && !!CONFIG.client_secret && (isProducao ? !!CONFIG.pix_key : true)
    }
  });
});

// =====================================================
// ENDPOINT PARA TROCAR AMBIENTE EM TEMPO DE EXECUÇÃO
// =====================================================
app.post("/trocar-ambiente", (req, res) => {
  try {
    const { novo_ambiente } = req.body;
    
    if (!novo_ambiente || !CONFIG_AMBIENTES[novo_ambiente]) {
      return res.status(400).json({
        erro: "Ambiente inválido",
        ambientes_disponiveis: Object.keys(CONFIG_AMBIENTES),
        ambiente_atual: AMBIENTE_ATUAL
      });
    }
    
    if (novo_ambiente === AMBIENTE_ATUAL) {
      return res.json({
        message: "Já está no ambiente solicitado",
        ambiente_atual: AMBIENTE_ATUAL
      });
    }
    
    // ⚠️ ATENÇÃO: Trocar ambiente em runtime é perigoso em produção
    if (isProducao) {
      return res.status(403).json({
        erro: "Troca de ambiente não permitida em produção",
        ambiente_atual: AMBIENTE_ATUAL,
        dica: "Reinicie o servidor com SICREDI_ENV diferente"
      });
    }
    
    console.log(`🔄 Trocando ambiente: ${AMBIENTE_ATUAL} → ${novo_ambiente}`);
    
    // Atualizar variável global (apenas em desenvolvimento)
    process.env.SICREDI_ENV = novo_ambiente;
    
    res.json({
      sucesso: true,
      message: `Ambiente trocado para ${novo_ambiente}`,
      ambiente_anterior: AMBIENTE_ATUAL,
      ambiente_novo: novo_ambiente,
      aviso: "⚠️ Reinicie o servidor para aplicar completamente a mudança"
    });
    
  } catch (error) {
    res.status(500).json({
      erro: "Falha ao trocar ambiente",
      detalhes: error.message
    });
  }
});

// =====================================================
// ENDPOINT PARA TESTAR CONFIGURAÇÃO DE AMBIENTES
// =====================================================
app.get("/testar-ambientes", async (req, res) => {
  const resultados = {};
  
  for (const [ambiente, config] of Object.entries(CONFIG_AMBIENTES)) {
    try {
      console.log(`🧪 Testando ambiente: ${ambiente}`);
      
      // Verificar se tem as configurações necessárias
      const temConfig = !!(config.client_id && config.client_secret);
      
      if (!temConfig) {
        resultados[ambiente] = {
          configurado: false,
          erro: "Client ID ou Client Secret não configurados"
        };
        continue;
      }
      
      // Tentar obter token (apenas teste de conectividade)
      try {
        const credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString("base64");
        
        const testResponse = await axios.post(
          config.token_url,
          'grant_type=client_credentials',
          {
            headers: {
              Authorization: `Basic ${credentials}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            httpsAgent: new https.Agent({
              cert: certificates.cert,
              key: certificates.key,
              rejectUnauthorized: ambiente === 'prod'
            }),
            timeout: 5000
          }
        );
        
        resultados[ambiente] = {
          configurado: true,
          conectividade: "OK",
          token_obtido: !!testResponse.data.access_token,
          api_url: config.api_url,
          pix_key: config.pix_key ? 'configurada' : 'não configurada'
        };
        
      } catch (tokenError) {
        resultados[ambiente] = {
          configurado: true,
          conectividade: "ERRO",
          erro: tokenError.response?.data?.detail || tokenError.message,
          status: tokenError.response?.status
        };
      }
      
    } catch (error) {
      resultados[ambiente] = {
        configurado: false,
        erro: error.message
      };
    }
  }
  
  res.json({
    ambiente_atual: AMBIENTE_ATUAL,
    testes: resultados,
    timestamp: new Date().toISOString()
  });
});

// =====================================================
// LOGS DE INICIALIZAÇÃO
// =====================================================
console.log(`
🚀 Middleware PIX Sicredi Multi-Ambiente
📍 Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}
🌐 API URL: ${CONFIG.api_url}
🔐 Client ID: ${CONFIG.client_id ? CONFIG.client_id.substring(0, 8) + '...' : 'NÃO CONFIGURADO'}
🔑 PIX Key: ${CONFIG.pix_key ? 'CONFIGURADA' : 'NÃO CONFIGURADA'}
⚙️  SSL Verify: ${CONFIG.ssl_verify}
⏱️  Timeout: ${CONFIG.timeout}ms
🔄 Retry Attempts: ${CONFIG.retry_attempts}
`);

// Exportar configurações para usar nos outros endpoints
module.exports = {
  CONFIG,
  AMBIENTE_ATUAL,
  isProducao,
  obterToken,
  fazerRequisicaoSicredi,
  certificates
};

// Endpoint para testar apenas a autenticação no ambiente ativo
app.get("/test-auth", async (req, res) => {
  try {
    console.log(`🧪 Testando autenticação no ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    if (!CONFIG.client_id || !CONFIG.client_secret) {
      return res.status(400).json({
        erro: `CLIENT_ID e CLIENT_SECRET devem estar configurados para ${AMBIENTE_ATUAL}`,
        variaveis_necessarias: [
          `SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_CLIENT_ID`,
          `SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_CLIENT_SECRET`
        ]
      });
    }
    
    const token = await obterToken();
    
    res.json({
      sucesso: true,
      message: `Autenticação realizada com sucesso no ambiente ${AMBIENTE_ATUAL.toUpperCase()}!`,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url,
        token_url: CONFIG.token_url
      },
      token_info: {
        length: token.length,
        preview: token.substring(0, 20) + "...",
        expires_info: "Verificar documentação Sicredi para TTL"
      },
      configuracao: {
        client_id: CONFIG.client_id.substring(0, 8) + '...',
        pix_key_configurada: !!CONFIG.pix_key,
        ssl_verify: CONFIG.ssl_verify,
        timeout: CONFIG.timeout
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro na autenticação ${AMBIENTE_ATUAL}:`, error.response?.data || error.message);
    
    res.status(500).json({
      erro: `Falha na autenticação do ambiente ${AMBIENTE_ATUAL.toUpperCase()}`,
      ambiente: AMBIENTE_ATUAL,
      detalhes: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        api_url: CONFIG.api_url
      },
      dicas: [
        "Verifique se as credenciais estão corretas no .env",
        "Confirme se o ambiente está acessível",
        "Verifique os certificados SSL na pasta /certs"
      ]
    });
  }
});

// Endpoint para gerar PIX (atualizado para usar configurações por ambiente)
app.post("/gerar-pix", async (req, res) => {
  try {
    const { nome, cpf, valor, chave_pix, descricao } = req.body;
    
    console.log(`💰 Gerando PIX no ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    // Validações básicas
    if (!nome || !cpf || !valor) {
      return res.status(400).json({ 
        erro: "Campos obrigatórios: nome, cpf, valor",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Validação do CPF
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ 
        erro: "CPF deve conter exatamente 11 dígitos numéricos",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Validação do valor
    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({ 
        erro: "Valor deve ser um número positivo",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Determinar chave PIX baseada no ambiente
    let chavePixFinal = chave_pix || CONFIG.pix_key;
    
    if (isProducao && !chavePixFinal) {
      return res.status(400).json({
        erro: "Chave PIX é obrigatória em produção",
        solucoes: [
          "Configure SICREDI_PROD_PIX_KEY no .env",
          "Ou envie chave_pix na requisição"
        ],
        ambiente: "produção"
      });
    }
    
    console.log(`💰 Gerando PIX para ${nome} - R$ ${valorNumerico.toFixed(2)} - Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    const token = await obterToken();

    // Payload seguindo a especificação PIX
    const payload = {
      calendario: { 
        expiracao: 3600 // 1 hora
      },
      devedor: { 
        cpf: cpfLimpo,
        nome: nome.trim()
      },
      valor: { 
        original: valorNumerico.toFixed(2)
      },
      solicitacaoPagador: (descricao || "Pagamento via PIX").substring(0, 140)
    };
    
    if (chavePixFinal) {
      payload.chave = chavePixFinal.trim();
      console.log(`🔑 Usando chave PIX: ${chavePixFinal}`);
    } else {
      console.log(`🧪 Gerando PIX sem chave específica (homologação)`);
    }

    console.log("📤 Payload a ser enviado:", JSON.stringify(payload, null, 2));
    console.log(`📤 Enviando cobrança para Sicredi ${AMBIENTE_ATUAL.toUpperCase()}...`);
    
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob`,
      {
        method: 'POST',
        data: payload,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      }
    );

    const { txid } = response.data;
    console.log(`✅ Cobrança criada - TXID: ${txid}`);
    
    // Aguarda antes de consultar a cobrança
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("📋 Buscando dados da cobrança...");
    const cobranca = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      }
    );

    console.log(`✅ PIX gerado com sucesso no ambiente ${AMBIENTE_ATUAL.toUpperCase()}!`);
    
    // Gerar URL do QR Code
    const pixCode = cobranca.data.pixCopiaECola;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`;
    
    res.json({
      sucesso: true,
      txid,
      pixCopiaECola: pixCode,
      qrCodeUrl: qrCodeUrl,
      valor: payload.valor.original,
      devedor: payload.devedor,
      expiracao: payload.calendario.expiracao,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      },
      chave_utilizada: chavePixFinal || 'nenhuma (homologação)',
      qrcode: cobranca.data.qrcode || null,
      data_criacao: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erro detalhado no ambiente ${AMBIENTE_ATUAL}:`, {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: error.config?.url
    });
    
    // Log das violações específicas se disponível
    if (error.response?.data?.violacoes) {
      console.error("📋 Violações do schema:", error.response.data.violacoes);
    }
    
    const statusCode = error.response?.status || 500;
    let errorMessage = "Falha ao gerar cobrança PIX";
    
    if (error.response?.data?.detail) {
      errorMessage = error.response.data.detail;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    const responseError = {
      erro: errorMessage,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      },
      timestamp: new Date().toISOString()
    };
    
    // Em desenvolvimento, adiciona mais detalhes
    if (process.env.NODE_ENV === 'development') {
      responseError.detalhes = {
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        violacoes: error.response?.data?.violacoes,
        config_ambiente: {
          client_id_ok: !!CONFIG.client_id,
          client_secret_ok: !!CONFIG.client_secret,
          pix_key_ok: !!CONFIG.pix_key,
          ssl_verify: CONFIG.ssl_verify
        }
      };
    }
    
    res.status(statusCode).json(responseError);
  }
});

// Endpoint para gerar PIX com vencimento (CobV)
app.post("/gerar-pix-vencimento", async (req, res) => {
  try {
    const { 
      nome, 
      cpf, 
      valor, 
      chave_pix, 
      descricao,
      data_vencimento,
      multa = {},
      juros = {},
      desconto = {},
      txid_customizado
    } = req.body;
    
    console.log(`💰 Gerando PIX com vencimento no ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    // Validações básicas
    if (!nome || !cpf || !valor || !data_vencimento) {
      return res.status(400).json({ 
        erro: "Campos obrigatórios: nome, cpf, valor, data_vencimento",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Validação do CPF
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ 
        erro: "CPF deve conter exatamente 11 dígitos numéricos",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Validação do valor
    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({ 
        erro: "Valor deve ser um número positivo",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Validação da data de vencimento
    const dataVencimento = new Date(data_vencimento);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (isNaN(dataVencimento.getTime())) {
      return res.status(400).json({
        erro: "Data de vencimento inválida. Use formato: YYYY-MM-DD",
        exemplo: "2024-12-31",
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    if (dataVencimento <= hoje) {
      return res.status(400).json({
        erro: "Data de vencimento deve ser posterior à data atual",
        data_informada: data_vencimento,
        data_minima: new Date(hoje.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        ambiente: AMBIENTE_ATUAL
      });
    }
    
    // Determinar chave PIX baseada no ambiente
    let chavePixFinal = chave_pix || CONFIG.pix_key;
    
    if (isProducao && !chavePixFinal) {
      return res.status(400).json({
        erro: "Chave PIX é obrigatória em produção",
        solucoes: [
          "Configure SICREDI_PROD_PIX_KEY no .env",
          "Ou envie chave_pix na requisição"
        ],
        ambiente: "produção"
      });
    }
    
    console.log(`💰 Gerando PIX com vencimento para ${nome} - R$ ${valorNumerico.toFixed(2)} - Vence: ${data_vencimento} - Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    const token = await obterToken();

    // Gerar TXID se não fornecido (formato específico para CobV)
    const txid = txid_customizado || `cobv${Date.now()}${Math.random().toString(36).substr(2, 4)}`;

    // Payload para cobrança com vencimento seguindo padrão PIX
    const payload = {
      calendario: { 
        dataDeVencimento: dataVencimento.toISOString().split('T')[0], // YYYY-MM-DD
        validadeAposVencimento: 30 // dias para pagamento após vencimento
      },
      devedor: { 
        cpf: cpfLimpo,
        nome: nome.trim()
      },
      valor: { 
        original: valorNumerico.toFixed(2)
      },
      solicitacaoPagador: (descricao || "Pagamento PIX com vencimento").substring(0, 140)
    };
    
    // Adicionar chave PIX se fornecida
    if (chavePixFinal) {
      payload.chave = chavePixFinal.trim();
      console.log(`🔑 Usando chave PIX: ${chavePixFinal}`);
    }
    
    // Adicionar multa se informada
    if (multa && (multa.modalidade || multa.valorPerc)) {
      payload.valor.multa = {
        modalidade: multa.modalidade || "2", // 1=Valor fixo, 2=Percentual
        valorPerc: multa.valorPerc ? parseFloat(multa.valorPerc).toFixed(2) : "2.00"
      };
      console.log(`⚖️ Multa configurada: ${multa.modalidade === "1" ? "R$ " + multa.valorPerc : multa.valorPerc + "%"}`);
    }
    
    // Adicionar juros se informados
    if (juros && (juros.modalidade || juros.valorPerc)) {
      payload.valor.juros = {
        modalidade: juros.modalidade || "2", // 1=Valor fixo, 2=Percentual
        valorPerc: juros.valorPerc ? parseFloat(juros.valorPerc).toFixed(2) : "1.00"
      };
      console.log(`💹 Juros configurados: ${juros.modalidade === "1" ? "R$ " + juros.valorPerc : juros.valorPerc + "%"}`);
    }
    
    // Adicionar desconto se informado
    if (desconto && desconto.descontos && Array.isArray(desconto.descontos)) {
      payload.valor.desconto = desconto;
      console.log(`💸 Desconto configurado: ${desconto.descontos.length} regra(s)`);
    }

    console.log("📤 Payload CobV a ser enviado:", JSON.stringify(payload, null, 2));
    console.log(`📤 Enviando cobrança com vencimento para Sicredi ${AMBIENTE_ATUAL.toUpperCase()}...`);
    
    // Criar cobrança com vencimento usando PUT
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cobv/${txid}`,
      {
        method: 'PUT',
        data: payload,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      }
    );

    console.log(`✅ Cobrança com vencimento criada - TXID: ${txid}`);
    
    // Aguarda antes de consultar a cobrança
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("📋 Buscando dados da cobrança com vencimento...");
    const cobranca = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cobv/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      }
    );

    console.log(`✅ PIX com vencimento gerado com sucesso no ambiente ${AMBIENTE_ATUAL.toUpperCase()}!`);
    
    // Gerar URL do QR Code
    const pixCode = cobranca.data.pixCopiaECola;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`;
    
    res.json({
      sucesso: true,
      tipo: "cobranca_com_vencimento",
      txid,
      pixCopiaECola: pixCode,
      qrCodeUrl: qrCodeUrl,
      valor: {
        original: payload.valor.original,
        multa: payload.valor.multa || null,
        juros: payload.valor.juros || null,
        desconto: payload.valor.desconto || null
      },
      devedor: payload.devedor,
      vencimento: {
        data: payload.calendario.dataDeVencimento,
        validade_apos_vencimento: payload.calendario.validadeAposVencimento
      },
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      },
      chave_utilizada: chavePixFinal || 'nenhuma (homologação)',
      qrcode: cobranca.data.qrcode || null,
      data_criacao: new Date().toISOString(),
      observacoes: {
        pagamento_ate_vencimento: `Valor original: R$ ${payload.valor.original}`,
        pagamento_apos_vencimento: payload.valor.multa || payload.valor.juros ? 
          "Valor com acréscimos será calculado automaticamente" : 
          "Mesmo valor após vencimento"
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro detalhado na cobrança com vencimento no ambiente ${AMBIENTE_ATUAL}:`, {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status,
      url: error.config?.url
    });
    
    // Log das violações específicas se disponível
    if (error.response?.data?.violacoes) {
      console.error("📋 Violações do schema CobV:", error.response.data.violacoes);
    }
    
    const statusCode = error.response?.status || 500;
    let errorMessage = "Falha ao gerar cobrança PIX com vencimento";
    
    if (error.response?.data?.detail) {
      errorMessage = error.response.data.detail;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    const responseError = {
      erro: errorMessage,
      tipo: "cobranca_com_vencimento",
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      },
      timestamp: new Date().toISOString()
    };
    
    // Em desenvolvimento, adiciona mais detalhes
    if (process.env.NODE_ENV === 'development') {
      responseError.detalhes = {
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        violacoes: error.response?.data?.violacoes,
        config_ambiente: {
          client_id_ok: !!CONFIG.client_id,
          client_secret_ok: !!CONFIG.client_secret,
          pix_key_ok: !!CONFIG.pix_key,
          ssl_verify: CONFIG.ssl_verify
        }
      };
    }
    
    res.status(statusCode).json(responseError);
  }
});

// Endpoint para debug do payload no ambiente atual
app.post("/debug-payload", (req, res) => {
  try {
    const { nome, cpf, valor, chave_pix, descricao } = req.body;
    
    console.log(`🐛 Debug payload no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    // Validações e processamento igual ao endpoint principal
    const cpfLimpo = cpf?.replace(/\D/g, '') || '';
    const valorNumerico = parseFloat(valor) || 0;
    const chavePixFinal = chave_pix || CONFIG.pix_key;
    
    const payload = {
      calendario: { 
        expiracao: 3600
      },
      devedor: { 
        cpf: cpfLimpo,
        nome: nome?.trim() || ''
      },
      valor: { 
        original: valorNumerico.toFixed(2)
      },
      solicitacaoPagador: (descricao || "Pagamento via PIX").substring(0, 140)
    };
    
    if (chavePixFinal) {
      payload.chave = chavePixFinal.trim();
    }
    
    // Validações
    const validacoes = {
      cpf_valido: cpfLimpo.length === 11,
      valor_valido: valorNumerico > 0,
      nome_valido: nome && nome.trim().length > 0,
      chave_presente: !!chavePixFinal,
      chave_obrigatoria_prod: isProducao ? !!chavePixFinal : true
    };
    
    res.json({
      payload_que_seria_enviado: payload,
      validacoes,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url,
        chave_configurada: !!CONFIG.pix_key,
        variavel_chave: `SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_PIX_KEY`
      },
      todas_validacoes_ok: Object.values(validacoes).every(v => v === true),
      configuracao_ambiente: {
        client_id_ok: !!CONFIG.client_id,
        client_secret_ok: !!CONFIG.client_secret,
        pix_key_ok: !!CONFIG.pix_key,
        ssl_verify: CONFIG.ssl_verify,
        timeout: CONFIG.timeout
      }
    });
    
  } catch (error) {
    res.status(400).json({
      erro: "Erro ao processar payload",
      ambiente: AMBIENTE_ATUAL,
      detalhes: error.message
    });
  }
});

// Endpoint para debug do payload de cobrança com vencimento
app.post("/debug-payload-vencimento", (req, res) => {
  try {
    const { 
      nome, 
      cpf, 
      valor, 
      chave_pix, 
      descricao,
      data_vencimento,
      multa = {},
      juros = {},
      desconto = {},
      txid_customizado
    } = req.body;
    
    console.log(`🐛 Debug payload vencimento no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    // Validações e processamento
    const cpfLimpo = cpf?.replace(/\D/g, '') || '';
    const valorNumerico = parseFloat(valor) || 0;
    const chavePixFinal = chave_pix || CONFIG.pix_key;
    const dataVencimento = data_vencimento ? new Date(data_vencimento) : null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    // Gerar TXID de exemplo
    const txid = txid_customizado || `cobv${Date.now()}${Math.random().toString(36).substr(2, 4)}`;
    
    const payload = {
      calendario: { 
        dataDeVencimento: dataVencimento ? dataVencimento.toISOString().split('T')[0] : null,
        validadeAposVencimento: 30
      },
      devedor: { 
        cpf: cpfLimpo,
        nome: nome?.trim() || ''
      },
      valor: { 
        original: valorNumerico.toFixed(2)
      },
      solicitacaoPagador: (descricao || "Pagamento PIX com vencimento").substring(0, 140)
    };
    
    if (chavePixFinal) {
      payload.chave = chavePixFinal.trim();
    }
    
    // Adicionar multa se informada
    if (multa && (multa.modalidade || multa.valorPerc)) {
      payload.valor.multa = {
        modalidade: multa.modalidade || "2",
        valorPerc: multa.valorPerc ? parseFloat(multa.valorPerc).toFixed(2) : "2.00"
      };
    }
    
    // Adicionar juros se informados
    if (juros && (juros.modalidade || juros.valorPerc)) {
      payload.valor.juros = {
        modalidade: juros.modalidade || "2",
        valorPerc: juros.valorPerc ? parseFloat(juros.valorPerc).toFixed(2) : "1.00"
      };
    }
    
    // Adicionar desconto se informado
    if (desconto && desconto.descontos && Array.isArray(desconto.descontos)) {
      payload.valor.desconto = desconto;
    }
    
    // Validações específicas para CobV
    const validacoes = {
      cpf_valido: cpfLimpo.length === 11,
      valor_valido: valorNumerico > 0,
      nome_valido: nome && nome.trim().length > 0,
      data_vencimento_valida: dataVencimento && !isNaN(dataVencimento.getTime()),
      data_vencimento_futura: dataVencimento && dataVencimento > hoje,
      chave_presente: !!chavePixFinal,
      chave_obrigatoria_prod: isProducao ? !!chavePixFinal : true,
      multa_configurada_corretamente: !multa?.modalidade || (multa.modalidade && multa.valorPerc),
      juros_configurados_corretamente: !juros?.modalidade || (juros.modalidade && juros.valorPerc),
      desconto_configurado_corretamente: !desconto?.descontos || Array.isArray(desconto.descontos)
    };
    
    // Cálculos de exemplo para valores após vencimento
    let exemploValorVencido = valorNumerico;
    const diasExemplo = 30; // Exemplo: 30 dias após vencimento
    
    if (payload.valor.multa) {
      const multaExemplo = payload.valor.multa.modalidade === "1" ? 
        parseFloat(payload.valor.multa.valorPerc) :
        valorNumerico * (parseFloat(payload.valor.multa.valorPerc) / 100);
      exemploValorVencido += multaExemplo;
    }
    
    if (payload.valor.juros) {
      const jurosExemplo = payload.valor.juros.modalidade === "1" ?
        parseFloat(payload.valor.juros.valorPerc) * diasExemplo :
        valorNumerico * (parseFloat(payload.valor.juros.valorPerc) / 100) * diasExemplo;
      exemploValorVencido += jurosExemplo;
    }
    
    res.json({
      payload_que_seria_enviado: payload,
      validacoes,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url,
        chave_configurada: !!CONFIG.pix_key,
        variavel_chave: `SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_PIX_KEY`
      },
      todas_validacoes_ok: Object.values(validacoes).every(v => v === true),
      configuracao_ambiente: {
        client_id_ok: !!CONFIG.client_id,
        client_secret_ok: !!CONFIG.client_secret,
        pix_key_ok: !!CONFIG.pix_key,
        ssl_verify: CONFIG.ssl_verify,
        timeout: CONFIG.timeout
      },
      simulacoes: {
        endpoint_criacao: `PUT ${CONFIG.api_url}/cobv/${txid}`,
        endpoint_consulta: `GET ${CONFIG.api_url}/cobv/${txid}`,
        txid_gerado: txid,
        valor_no_vencimento: `R$ ${valorNumerico.toFixed(2)}`,
        valor_apos_vencimento_exemplo: `R$ ${exemploValorVencido.toFixed(2)} (após ${diasExemplo} dias)`,
        data_vencimento_formatada: dataVencimento?.toISOString().split('T')[0] || 'NÃO INFORMADA'
      },
      dicas: [
        "Use formato YYYY-MM-DD para data_vencimento",
        "Multa modalidade: 1=Valor fixo, 2=Percentual",
        "Juros modalidade: 1=Valor fixo por dia, 2=Percentual por dia",
        "Descontos devem ter array 'descontos' com objetos {data, modalidade, valorPerc}",
        "TXID será gerado automaticamente se não fornecido"
      ]
    });
    
  } catch (error) {
    res.status(400).json({
      erro: "Erro ao processar payload de vencimento",
      ambiente: AMBIENTE_ATUAL,
      detalhes: error.message
    });
  }
});

// Endpoint para consultar status de uma cobrança (atualizado)
app.get("/consultar-pix/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const token = await obterToken();
    
    console.log(`🔍 Consultando PIX: ${txid} no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    const cobranca = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    const dadosCobranca = cobranca.data;
    const foiPago = dadosCobranca.pix && dadosCobranca.pix.length > 0;
    
    res.json({
      sucesso: true,
      txid: txid,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao
      },
      status: foiPago ? 'CONCLUIDA' : dadosCobranca.status,
      pago: foiPago,
      dados: {
        valor_original: dadosCobranca.valor?.original,
        devedor: dadosCobranca.devedor,
        data_criacao: dadosCobranca.calendario?.criacao,
        data_expiracao: dadosCobranca.calendario?.expiracao,
        pixCopiaECola: dadosCobranca.pixCopiaECola,
        info_pagamento: foiPago ? dadosCobranca.pix[0] : null
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro ao consultar PIX no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao consultar PIX";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      txid: req.params.txid,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// Endpoint para consultar status de uma cobrança com vencimento (CobV)
app.get("/consultar-pix-vencimento/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const token = await obterToken();
    
    console.log(`🔍 Consultando PIX com vencimento: ${txid} no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    const cobranca = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cobv/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    const dadosCobranca = cobranca.data;
    const foiPago = dadosCobranca.pix && dadosCobranca.pix.length > 0;
    const hoje = new Date();
    const dataVencimento = new Date(dadosCobranca.calendario?.dataDeVencimento);
    const vencido = hoje > dataVencimento;
    
    // Calcular valor a ser pago (considerando multa/juros se vencido)
    let valorAPagar = parseFloat(dadosCobranca.valor?.original || 0);
    let detalhesValor = {
      valor_original: dadosCobranca.valor?.original,
      multa: null,
      juros: null,
      desconto: null,
      valor_final: dadosCobranca.valor?.original
    };
    
    if (vencido && !foiPago) {
      const diasVencidos = Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24));
      
      // Calcular multa se configurada
      if (dadosCobranca.valor?.multa) {
        const multa = dadosCobranca.valor.multa;
        let valorMulta = 0;
        
        if (multa.modalidade === "1") { // Valor fixo
          valorMulta = parseFloat(multa.valorPerc);
        } else { // Percentual
          valorMulta = valorAPagar * (parseFloat(multa.valorPerc) / 100);
        }
        
        detalhesValor.multa = {
          modalidade: multa.modalidade,
          percentual_ou_valor: multa.valorPerc,
          valor_calculado: valorMulta.toFixed(2)
        };
        valorAPagar += valorMulta;
      }
      
      // Calcular juros se configurados
      if (dadosCobranca.valor?.juros) {
        const juros = dadosCobranca.valor.juros;
        let valorJuros = 0;
        
        if (juros.modalidade === "1") { // Valor fixo por dia
          valorJuros = parseFloat(juros.valorPerc) * diasVencidos;
        } else { // Percentual por dia
          valorJuros = valorAPagar * (parseFloat(juros.valorPerc) / 100) * diasVencidos;
        }
        
        detalhesValor.juros = {
          modalidade: juros.modalidade,
          percentual_ou_valor: juros.valorPerc,
          dias_vencidos: diasVencidos,
          valor_calculado: valorJuros.toFixed(2)
        };
        valorAPagar += valorJuros;
      }
      
      detalhesValor.valor_final = valorAPagar.toFixed(2);
    }
    
    // Verificar descontos aplicáveis (se não vencido)
    if (!vencido && dadosCobranca.valor?.desconto?.descontos) {
      for (const desc of dadosCobranca.valor.desconto.descontos) {
        const dataLimite = new Date(desc.data);
        if (hoje <= dataLimite) {
          detalhesValor.desconto = {
            disponivel: true,
            data_limite: desc.data,
            modalidade: desc.modalidade,
            valor_percentual: desc.valorPerc,
            valor_desconto: desc.modalidade === "1" ? 
              desc.valorPerc : 
              (valorAPagar * (parseFloat(desc.valorPerc) / 100)).toFixed(2)
          };
          break;
        }
      }
    }
    
    res.json({
      sucesso: true,
      tipo: "cobranca_com_vencimento",
      txid: txid,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao
      },
      status: foiPago ? 'CONCLUIDA' : dadosCobranca.status,
      pago: foiPago,
      vencido: vencido,
      dados: {
        valor: detalhesValor,
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
      observacoes: {
        pode_pagar: !foiPago && (
          !vencido || 
          (vencido && dadosCobranca.calendario?.validadeAposVencimento > 0)
        ),
        valor_atual: foiPago ? 
          "Já pago" : 
          (vencido ? 
            `R$ ${detalhesValor.valor_final} (com acréscimos)` : 
            `R$ ${detalhesValor.valor_original}`
          ),
        mensagem: foiPago ? 
          "Cobrança já foi paga" :
          (vencido ? 
            "Cobrança vencida - valor com acréscimos" :
            "Cobrança dentro do prazo"
          )
      }
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

// Endpoint webhook para novo pagamento (atualizado para multi-ambiente)
app.post("/webhook/novo-pagamento", async (req, res) => {
  try {
    const { pagamento, origem = "appsheet" } = req.body;
    
    console.log(`🔔 Webhook recebido no ambiente ${AMBIENTE_ATUAL.toUpperCase()} - Novo pagamento de ${origem}:`, pagamento);
    
    if (!pagamento) {
      return res.status(400).json({
        erro: "Objeto 'pagamento' é obrigatório no body",
        ambiente: AMBIENTE_ATUAL,
        formato_esperado: {
          pagamento: {
            "Row ID": "string",
            "Pagador": "string", 
            "Inscricao": "string",
            "Valor Pix": "number",
            "descricao_pagador": "string (opcional)",
            "chave_pix": "string (opcional)",
            "Status": "string (opcional)"
          }
        }
      });
    }

    // Verificar se já existe uma cobrança para este pagamento
    if (pagamento.txid && pagamento.txid !== '') {
      console.log(`⚠️  Pagamento ${pagamento["Row ID"]} já possui TXID: ${pagamento.txid}`);
      return res.json({
        sucesso: false,
        message: "Pagamento já possui cobrança PIX gerada",
        txid_existente: pagamento.txid,
        ambiente: AMBIENTE_ATUAL,
        acao: "nenhuma"
      });
    }

    // Validar dados do pagamento
    const validacao = validarPagamento(pagamento);
    if (!validacao.valido) {
      console.error(`❌ Validação falhou para ${pagamento["Row ID"]}:`, validacao.erro);
      return res.status(400).json({
        erro: validacao.erro,
        pagamento_id: pagamento["Row ID"],
        pagador: pagamento.Pagador,
        ambiente: AMBIENTE_ATUAL
      });
    }

    // Determinar chave PIX baseada no ambiente
    const chavePixFinal = pagamento.chave_pix || CONFIG.pix_key;
    
    if (isProducao && !chavePixFinal) {
      return res.status(400).json({
        erro: "Chave PIX obrigatória em produção",
        solucao: "Configure SICREDI_PROD_PIX_KEY no .env ou adicione chave_pix no pagamento",
        ambiente: "produção"
      });
    }

    console.log(`💰 Gerando PIX automático para ${validacao.nomeLimpo} - R$ ${validacao.valorFormatado} - Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    // Obter token
    const token = await obterToken();

    // Preparar payload
    const payload = {
      calendario: { 
        expiracao: 3600
      },
      devedor: { 
        cpf: validacao.cpfLimpo,
        nome: validacao.nomeLimpo
      },
      valor: { 
        original: validacao.valorFormatado
      },
      solicitacaoPagador: validacao.descricaoLimpa
    };

    if (chavePixFinal) {
      payload.chave = chavePixFinal.trim();
    }

    // Criar cobrança no Sicredi
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob`,
      {
        method: 'POST',
        data: payload,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { txid } = response.data;
    console.log(`✅ Cobrança criada automaticamente - TXID: ${txid}`);
    
    // Aguardar antes de consultar a cobrança
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Buscar dados completos da cobrança
    const cobranca = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );

    const pixCode = cobranca.data.pixCopiaECola;
    
    // Gerar URL do QR Code
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`;

    // Resposta completa para o AppSheet atualizar a linha
    const resultado = {
      sucesso: true,
      message: `Cobrança PIX gerada automaticamente no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`,
      
      // Dados para atualizar no AppSheet
      atualizacao_appsheet: {
        "Row ID": pagamento["Row ID"],
        txid: txid,
        pixCopiaECola: pixCode,
        qr_code_url: qrCodeUrl,
        status_pix: "ATIVA",
        data_geracao_pix: new Date().toISOString(),
        ambiente_pix: AMBIENTE_ATUAL,
        link_pagamento: `https://pix.example.com/pay/${txid}` // Customize conforme necessário
      },

      // Dados detalhados
      cobranca: {
        txid: txid,
        valor: validacao.valorFormatado,
        devedor: {
          nome: validacao.nomeLimpo,
          cpf: validacao.cpfLimpo
        },
        pixCopiaECola: pixCode,
        qrCodeUrl: qrCodeUrl,
        expiracao_em: new Date(Date.now() + 3600000).toISOString(),
        chave_utilizada: chavePixFinal || 'nenhuma (homologação)'
      },

      webhook_info: {
        origem: origem,
        processado_em: new Date().toISOString(),
        ambiente: {
          nome: AMBIENTE_ATUAL,
          producao: isProducao,
          api_url: CONFIG.api_url
        }
      }
    };

    console.log(`🎯 Webhook processado com sucesso para ${validacao.nomeLimpo} no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);
    res.json(resultado);

  } catch (error) {
    console.error(`❌ Erro no webhook de novo pagamento no ambiente ${AMBIENTE_ATUAL}:`, {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      erro: `Falha ao processar novo pagamento no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`,
      message: error.response?.data?.detail || error.message,
      webhook_info: {
        origem: req.body.origem || "appsheet",
        erro_em: new Date().toISOString(),
        ambiente: {
          nome: AMBIENTE_ATUAL,
          producao: isProducao,
          api_url: CONFIG.api_url
        }
      },
      
      // Dados para o AppSheet marcar como erro
      atualizacao_appsheet: {
        "Row ID": req.body.pagamento?.["Row ID"],
        status_pix: "ERRO",
        erro_pix: error.response?.data?.detail || error.message,
        data_erro_pix: new Date().toISOString(),
        ambiente_pix: AMBIENTE_ATUAL
      }
    });
  }
});

// Endpoint para listar chaves PIX do ambiente atual
app.get("/listar-chaves", async (req, res) => {
  try {
    const token = await obterToken();
    
    console.log(`🔑 Listando chaves PIX disponíveis no ambiente ${AMBIENTE_ATUAL.toUpperCase()}...`);
    
    // Tenta buscar cobranças recentes para identificar chaves válidas
    const agora = new Date();
    const ontemISO = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const agoraISO = agora.toISOString();
    
    const cobrancas = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob?inicio=${ontemISO}&fim=${agoraISO}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    // Extrai chaves únicas das cobranças
    const chavesEncontradas = [...new Set(
      cobrancas.data.cobs?.map(cob => cob.chave).filter(Boolean) || []
    )];
    
    res.json({
      sucesso: true,
      message: `Chaves encontradas nas cobranças recentes do ambiente ${AMBIENTE_ATUAL.toUpperCase()}`,
      ambiente: {
        nome: AMBIENTE_ATUAL,
        producao: isProducao,
        api_url: CONFIG.api_url
      },
      chaves_encontradas: chavesEncontradas,
      chave_configurada: CONFIG.pix_key || "NÃO CONFIGURADA",
      variavel_env: `SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_PIX_KEY`,
      dica: "Se não há chaves, você precisa cadastrar uma chave PIX no Sicredi primeiro"
    });
    
  } catch (error) {
    console.error(`❌ Erro ao listar chaves no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    res.json({
      sucesso: false,
      erro: "Não foi possível listar chaves",
      ambiente: AMBIENTE_ATUAL,
      chave_configurada: CONFIG.pix_key || "NÃO CONFIGURADA",
      variavel_env: `SICREDI_${AMBIENTE_ATUAL.toUpperCase()}_PIX_KEY`,
      dica: "Verifique se sua chave PIX está cadastrada no Sicredi",
      detalhes: error.response?.data
    });
  }
});



// Endpoint para processar múltiplas cobranças da tabela pagamentos
app.post("/gerar-cobrancas-lote", async (req, res) => {
  try {
    const { pagamentos } = req.body;
    
    console.log(`📋 Processando lote de ${pagamentos?.length || 0} pagamentos...`);
    
    // Validação básica
    if (!pagamentos || !Array.isArray(pagamentos) || pagamentos.length === 0) {
      return res.status(400).json({
        erro: "É necessário enviar um array de pagamentos",
        formato_esperado: {
          pagamentos: [
            {
              "Row ID": "string",
              "Pagador": "string",
              "Inscricao": "string", 
              "Valor Pix": "number",
              "descricao_pagador": "string",
              "chave_pix": "string (opcional)"
            }
          ]
        }
      });
    }
    
    // Limite de segurança
    if (pagamentos.length > 50) {
      return res.status(400).json({
        erro: "Máximo 50 pagamentos por lote",
        recebidos: pagamentos.length
      });
    }
    
    const resultados = [];
    const erros = [];
    let processados = 0;
    
    // Processar cada pagamento
    for (const pagamento of pagamentos) {
      try {
        processados++;
        console.log(`📝 Processando ${processados}/${pagamentos.length}: ${pagamento.Pagador || 'Sem nome'}`);
        
        // Validações específicas
        const validacao = validarPagamento(pagamento);
        if (!validacao.valido) {
          erros.push({
            row_id: pagamento["Row ID"],
            pagador: pagamento.Pagador,
            erro: validacao.erro,
            tipo: "validacao"
          });
          continue;
        }
        
        // Determinar chave PIX
        const chavePixFinal = pagamento.chave_pix || PIX_KEY;
        const isProducao = process.env.SICREDI_ENV === 'prod';
        
        if (isProducao && !chavePixFinal) {
          erros.push({
            row_id: pagamento["Row ID"],
            pagador: pagamento.Pagador,
            erro: "Chave PIX obrigatória em produção",
            tipo: "configuracao"
          });
          continue;
        }
        
        // Obter token (reutilizar se possível)
        const token = await obterToken();
        
        // Preparar payload
        const payload = {
          calendario: { expiracao: 3600 },
          devedor: { 
            cpf: validacao.cpfLimpo,
            nome: validacao.nomeLimpo
          },
          valor: { 
            original: validacao.valorFormatado
          },
          solicitacaoPagador: validacao.descricaoLimpa
        };
        
        if (chavePixFinal) {
          payload.chave = chavePixFinal.trim();
        }
        
        // Criar cobrança
        console.log(`💰 Gerando PIX para ${validacao.nomeLimpo} - R$ ${validacao.valorFormatado}`);
        
        const response = await fazerRequisicaoSicredi(
          `${SICREDI_API}/cob`,
          {
            method: 'POST',
            data: payload,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        
        const { txid } = response.data;
        
        // Aguardar antes de consultar
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Buscar dados completos da cobrança
        const cobranca = await fazerRequisicaoSicredi(
          `${SICREDI_API}/cob/${txid}`,
          {
            method: 'GET',
            headers: { 
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
          }
        );
        
        // Gerar QR Code URL
        const pixCode = cobranca.data.pixCopiaECola;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCode)}`;
        
        // Adicionar resultado de sucesso
        resultados.push({
          row_id: pagamento["Row ID"],
          pagador: validacao.nomeLimpo,
          valor: validacao.valorFormatado,
          txid: txid,
          pixCopiaECola: pixCode,
          qrCodeUrl: qrCodeUrl,
          status: "sucesso",
          chave_utilizada: chavePixFinal || 'nenhuma (homologação)',
          data_geracao: new Date().toISOString()
        });
        
        console.log(`✅ PIX gerado - TXID: ${txid} - ${validacao.nomeLimpo}`);
        
      } catch (error) {
        console.error(`❌ Erro ao processar pagamento ${pagamento["Row ID"]}:`, error.message);
        
        erros.push({
          row_id: pagamento["Row ID"],
          pagador: pagamento.Pagador || 'Sem nome',
          erro: error.response?.data?.detail || error.message,
          tipo: "api",
          detalhes: {
            status: error.response?.status,
            code: error.code
          }
        });
      }
      
      // Delay entre requisições para não sobrecarregar a API
      if (processados < pagamentos.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Estatísticas finais
    const stats = {
      total_enviados: pagamentos.length,
      sucessos: resultados.length,
      erros: erros.length,
      taxa_sucesso: ((resultados.length / pagamentos.length) * 100).toFixed(1) + '%'
    };
    
    console.log(`📊 Processamento concluído: ${stats.sucessos} sucessos, ${stats.erros} erros`);
    
    res.json({
      sucesso: erros.length < pagamentos.length,
      estatisticas: stats,
      resultados: resultados,
      erros: erros,
      ambiente: process.env.SICREDI_ENV === 'prod' ? 'produção' : 'homologação',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Erro no processamento em lote:", error);
    
    res.status(500).json({
      erro: "Falha no processamento em lote",
      detalhes: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para processar pagamentos específicos por filtro
app.post("/gerar-cobrancas-filtro", async (req, res) => {
  try {
    const { 
      pagamentos, 
      filtros = {},
      configuracoes = {}
    } = req.body;
    
    console.log(`🔍 Processando com filtros:`, filtros);
    
    if (!pagamentos || !Array.isArray(pagamentos)) {
      return res.status(400).json({
        erro: "Array de pagamentos é obrigatório"
      });
    }
    
    // Aplicar filtros
    let pagamentosFiltrados = pagamentos.filter(pagamento => {
      // Filtro por status
      if (filtros.status && pagamento.Status !== filtros.status) {
        return false;
      }
      
      // Filtro por valor mínimo
      if (filtros.valor_minimo && parseFloat(pagamento["Valor Pix"]) < filtros.valor_minimo) {
        return false;
      }
      
      // Filtro por valor máximo
      if (filtros.valor_maximo && parseFloat(pagamento["Valor Pix"]) > filtros.valor_maximo) {
        return false;
      }
      
      // Filtro por data (se informada)
      if (filtros.data_inicio) {
        const dataPagamento = new Date(pagamento.Data);
        const dataInicio = new Date(filtros.data_inicio);
        if (dataPagamento < dataInicio) {
          return false;
        }
      }
      
      // Filtro: apenas pagamentos sem PIX gerado
      if (filtros.apenas_sem_pix && pagamento.txid) {
        return false;
      }
      
      // Filtro por instituição
      if (filtros.instituicao && pagamento.Instituição !== filtros.instituicao) {
        return false;
      }
      
      return true;
    });
    
    console.log(`📋 Filtros aplicados: ${pagamentos.length} → ${pagamentosFiltrados.length} pagamentos`);
    
    if (pagamentosFiltrados.length === 0) {
      return res.json({
        sucesso: false,
        message: "Nenhum pagamento corresponde aos filtros aplicados",
        filtros_aplicados: filtros,
        total_original: pagamentos.length,
        total_filtrado: 0
      });
    }
    
    // Processar usando o endpoint principal
    return await processarLotePagamentos(pagamentosFiltrados, configuracoes, res);
    
  } catch (error) {
    console.error("❌ Erro no processamento com filtro:", error);
    res.status(500).json({
      erro: "Falha no processamento com filtro",
      detalhes: error.message
    });
  }
});

// Endpoint para consultar status de múltiplas cobranças
app.post("/consultar-cobrancas-lote", async (req, res) => {
  try {
    const { txids } = req.body;
    
    if (!txids || !Array.isArray(txids) || txids.length === 0) {
      return res.status(400).json({
        erro: "Array de TXIDs é obrigatório",
        formato: ["txid1", "txid2", "txid3"]
      });
    }
    
    if (txids.length > 100) {
      return res.status(400).json({
        erro: "Máximo 100 TXIDs por consulta"
      });
    }
    
    const token = await obterToken();
    const resultados = [];
    const erros = [];
    
    console.log(`🔍 Consultando ${txids.length} cobranças...`);
    
    for (const txid of txids) {
      try {
        const cobranca = await fazerRequisicaoSicredi(
          `${SICREDI_API}/cob/${txid}`,
          {
            method: 'GET',
            headers: { 
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            },
          }
        );
        
        resultados.push({
          txid: txid,
          status: cobranca.data.status || 'ATIVA',
          valor: cobranca.data.valor?.original,
          devedor: cobranca.data.devedor,
          data_criacao: cobranca.data.calendario?.criacao,
          data_expiracao: cobranca.data.calendario?.expiracao,
          pixCopiaECola: cobranca.data.pixCopiaECola,
          pago: cobranca.data.pix ? true : false,
          data_pagamento: cobranca.data.pix?.[0]?.horario
        });
        
        // Delay entre consultas
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        erros.push({
          txid: txid,
          erro: error.response?.data?.detail || error.message,
          status_code: error.response?.status
        });
      }
    }
    
    res.json({
      sucesso: true,
      total_consultados: txids.length,
      sucessos: resultados.length,
      erros: erros.length,
      resultados: resultados,
      erros_detalhes: erros,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error("❌ Erro na consulta em lote:", error);
    res.status(500).json({
      erro: "Falha na consulta em lote",
      detalhes: error.message
    });
  }
});

// Função auxiliar para validar pagamento
function validarPagamento(pagamento) {
  // Validar campos obrigatórios
  if (!pagamento.Pagador || pagamento.Pagador.trim().length < 3) {
    return { valido: false, erro: "Nome do pagador deve ter pelo menos 3 caracteres" };
  }
  
  if (!pagamento.Inscricao) {
    return { valido: false, erro: "CPF/CNPJ é obrigatório" };
  }
  
  if (!pagamento["Valor Pix"] || isNaN(parseFloat(pagamento["Valor Pix"]))) {
    return { valido: false, erro: "Valor PIX deve ser um número válido" };
  }
  
  // Limpar e validar CPF
  const cpfLimpo = pagamento.Inscricao.replace(/\D/g, '');
  if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) {
    return { valido: false, erro: "CPF deve ter 11 dígitos ou CNPJ 14 dígitos" };
  }
  
  // Validar valor
  const valorNumerico = parseFloat(pagamento["Valor Pix"]);
  if (valorNumerico <= 0 || valorNumerico > 50000) {
    return { valido: false, erro: "Valor deve estar entre R$ 0,01 e R$ 50.000,00" };
  }
  
  // Preparar dados limpos
  const nomeLimpo = pagamento.Pagador.trim();
  const valorFormatado = valorNumerico.toFixed(2);
  const descricaoLimpa = (pagamento.descricao_pagador || pagamento.Descrição || "Pagamento via PIX").substring(0, 140);
  
  return {
    valido: true,
    cpfLimpo,
    nomeLimpo,
    valorFormatado,
    descricaoLimpa
  };
}

// Função auxiliar para processar lote (reutilizável)
async function processarLotePagamentos(pagamentos, configuracoes, res) {
  // Implementação similar ao endpoint principal
  // Extraída para reutilização entre endpoints
  return res.json({ message: "Implementar lógica do lote aqui" });
}

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
      `${SICREDI_API}/cob?inicio=${inicioISO}&fim=${fimISO}`,
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
        data_pagamento: cob.pix?.[0]?.horario
      })),
      ambiente: process.env.SICREDI_ENV === 'prod' ? 'produção' : 'homologação'
    });
    
  } catch (error) {
    console.error("❌ Erro no relatório:", error);
    res.status(500).json({
      erro: "Falha ao gerar relatório",
      detalhes: error.message
    });
  }
});

// Tratamento de erro global
app.use((error, req, res, next) => {
  console.error("❌ Erro não tratado:", error);
  res.status(500).json({ 
    erro: "Erro interno do servidor" 
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 Servidor PIX Sicredi iniciado!
📍 Porta: ${PORT}
🌐 URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health
📂 Certificados: ${CERT_PATH}

📋 Endpoints disponíveis:
   • POST /gerar-pix - Cobrança PIX imediata
   • POST /gerar-pix-vencimento - Cobrança PIX com vencimento
   • GET  /consultar-pix/:txid - Consultar cobrança imediata
   • GET  /consultar-pix-vencimento/:txid - Consultar cobrança com vencimento
   • POST /debug-payload - Debug cobrança imediata
   • POST /debug-payload-vencimento - Debug cobrança com vencimento
   • POST /webhook/novo-pagamento - Webhook AppSheet
   • GET  /test-auth - Testar autenticação
   • GET  /listar-chaves - Listar chaves PIX
  `);
  
  // Verifica se os certificados estão presentes
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

