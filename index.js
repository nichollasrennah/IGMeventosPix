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

// Função para carregar certificados com tratamento de erro
function carregarCertificados() {
  try {
    const cert = fs.readFileSync(path.join(CERT_PATH, "cert.cer"));
    const key = fs.readFileSync(path.join(CERT_PATH, "api.key"));
    
    // Tenta carregar diferentes variações do certificado CA
    let ca;
    const possiveisCAs = [
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
      console.warn("⚠️  Nenhum certificado CA encontrado, tentando sem CA");
    }
    
    return { cert, key, ca };
  } catch (error) {
    console.error("❌ Erro ao carregar certificados:", error.message);
    throw error;
  }
}

const certificates = carregarCertificados();

const SICREDI_API = process.env.SICREDI_ENV === 'prod' ? 
  "https://api-pix.sicredi.com.br/api/v2" : 
  "https://api-pix-h.sicredi.com.br/api/v2";

const SICREDI_TOKEN_URL = process.env.SICREDI_ENV === 'prod' ? 
  "https://api-pix.sicredi.com.br/oauth/token" : 
  "https://api-pix-h.sicredi.com.br/oauth/token";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PIX_KEY = process.env.PIX_KEY;

// Função para criar agente HTTPS com diferentes configurações
function criarAgentHTTPS(tentativa = 1) {
  const baseConfig = {
    cert: certificates.cert,
    key: certificates.key,
  };

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
      console.warn("⚠️  Tentativa sem verificação SSL - USE APENAS EM HOMOLOGAÇÃO");
      return new https.Agent({
        ...baseConfig,
        rejectUnauthorized: false,
      });
    
    default:
      throw new Error("Todas as tentativas de conexão SSL falharam");
  }
}

async function obterToken(tentativa = 1) {
  try {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const httpsAgent = criarAgentHTTPS(tentativa);
    
    console.log(`🔑 Obtendo token (tentativa ${tentativa})...`);
    console.log(`🔐 Client ID: ${CLIENT_ID ? CLIENT_ID.substring(0, 8) + '...' : 'NÃO CONFIGURADO'}`);
    
    // Diferentes configurações de escopo para tentar
    const escopos = [
      "cob.write+cob.read+webhook.read+webhook.write", // Escopo completo da collection
      "cob.read+cob.write+pix.read",                   // Formato da documentação
      "cob.write+cob.read+pix.read",                   // Variação da ordem
      "cob.write+cob.read",                            // Básico
      "cob.read+cob.write"                             // Básico alternativo
    ];
    
    const escopo = escopos[Math.min(tentativa - 1, escopos.length - 1)];
    
    let url, body, headers;
    
    if (tentativa <= 3) {
      // Primeiras 3 tentativas: formato tradicional (body)
      url = SICREDI_TOKEN_URL;
      body = escopo ? 
        `grant_type=client_credentials&scope=${escopo}` : 
        `grant_type=client_credentials`;
      headers = {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      };
    } else {
      // Tentativas 4-5: formato query parameters (como no Postman)
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        ...(escopo && { scope: escopo })
      });
      url = `${SICREDI_TOKEN_URL}?${params.toString()}`;
      body = '';
      headers = {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json", // Postman usa JSON
      };
    }
    
    console.log(`📋 Tentando escopo: "${escopo || 'sem escopo'}" - Método: ${tentativa <= 3 ? 'BODY' : 'QUERY'}`);
    
    const response = await axios.post(
      url,
      body,
      {
        headers,
        httpsAgent,
        timeout: 10000, // 10 segundos de timeout
      }
    );
    
    console.log("✅ Token obtido com sucesso");
    console.log(`🎯 Escopo funcionou: "${escopo || 'sem escopo'}"`);
    return response.data.access_token;
    
  } catch (error) {
    console.error(`❌ Erro na tentativa ${tentativa}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    // Se for erro de escopo, tenta próximo escopo
    if (tentativa < 5 && (
      error.response?.status === 400 ||
      error.response?.data?.detail?.includes('Escopo') ||
      error.response?.data?.detail?.includes('escopo') ||
      error.code === 'UNABLE_TO_GET_ISSUER_CERT' || 
      error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      error.code === 'CERT_UNTRUSTED'
    )) {
      console.log(`🔄 Tentando novamente com configuração ${tentativa + 1}...`);
      return obterToken(tentativa + 1);
    }
    
    throw error;
  }
}

async function fazerRequisicaoSicredi(url, options, tentativa = 1) {
  try {
    const httpsAgent = criarAgentHTTPS(tentativa);
    const response = await axios({
      ...options,
      url,
      httpsAgent,
      timeout: 15000,
    });
    
    return response;
    
  } catch (error) {
    console.error(`❌ Erro na requisição (tentativa ${tentativa}):`, error.message);
    
    if (tentativa < 3 && (
      error.code === 'UNABLE_TO_GET_ISSUER_CERT' || 
      error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      error.code === 'CERT_UNTRUSTED'
    )) {
      console.log(`🔄 Tentando requisição novamente com configuração ${tentativa + 1}...`);
      return fazerRequisicaoSicredi(url, options, tentativa + 1);
    }
    
    throw error;
  }
}

// Middleware para log de requisições
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Endpoint de health check
app.get("/health", (req, res) => {
  const isProducao = process.env.SICREDI_ENV === 'prod';
  
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    ambiente: isProducao ? 'produção' : 'homologação',
    apis: {
      token_url: isProducao ? 'https://api-pix.sicredi.com.br/oauth/token' : 'https://api-pix-h.sicredi.com.br/oauth/token',
      pix_url: isProducao ? 'https://api-pix.sicredi.com.br/api/v2' : 'https://api-pix-h.sicredi.com.br/api/v2'
    },
    certificates: {
      cert: !!certificates.cert,
      key: !!certificates.key,
      ca: !!certificates.ca
    },
    configuracao: {
      chave_pix_obrigatoria: isProducao,
      chave_configurada: PIX_KEY ? 'sim' : 'não'
    }
  });
});

// Endpoint para testar apenas a autenticação
app.get("/test-auth", async (req, res) => {
  try {
    console.log("🧪 Testando autenticação...");
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(400).json({
        erro: "CLIENT_ID e CLIENT_SECRET devem estar configurados no .env"
      });
    }
    
    const token = await obterToken();
    
    res.json({
      sucesso: true,
      message: "Autenticação realizada com sucesso!",
      token_length: token.length,
      token_preview: token.substring(0, 20) + "..."
    });
    
  } catch (error) {
    console.error("❌ Erro na autenticação:", error.response?.data || error.message);
    
    res.status(500).json({
      erro: "Falha na autenticação",
      detalhes: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      }
    });
  }
});

// Substitua a função /gerar-pix por esta versão corrigida:

app.post("/gerar-pix", async (req, res) => {
  try {
    const { nome, cpf, valor, chave_pix, descricao } = req.body;
    
    // Validações básicas
    if (!nome || !cpf || !valor) {
      return res.status(400).json({ 
        erro: "Campos obrigatórios: nome, cpf, valor" 
      });
    }
    
    // Validação do CPF (apenas números, 11 dígitos)
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ 
        erro: "CPF deve conter exatamente 11 dígitos numéricos" 
      });
    }
    
    // Validação do valor
    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return res.status(400).json({ 
        erro: "Valor deve ser um número positivo" 
      });
    }
    
    // Determinar chave PIX baseada no ambiente
    let chavePixFinal;
    const isProducao = process.env.SICREDI_ENV === 'prod';
    
    if (isProducao) {
      // Em produção: chave é obrigatória
      chavePixFinal = chave_pix || PIX_KEY;
      if (!chavePixFinal) {
        return res.status(400).json({
          erro: "Chave PIX é obrigatória em produção. Configure PIX_KEY no .env ou envie chave_pix na requisição.",
          ambiente: "produção"
        });
      }
    } else {
      // Em homologação: chave é opcional mas recomendada
      chavePixFinal = chave_pix || PIX_KEY;
      console.log(`🧪 Ambiente: HOMOLOGAÇÃO - Chave PIX: ${chavePixFinal ? 'fornecida' : 'não obrigatória'}`);
    }
    
    console.log(`💰 Gerando PIX para ${nome} - R$ ${valorNumerico.toFixed(2)} - Ambiente: ${isProducao ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}`);
    
    const token = await obterToken();

    // Payload corrigido seguindo a especificação PIX do Banco Central
    const payload = {
      calendario: { 
        expiracao: 3600 // em segundos
      },
      devedor: { 
        cpf: cpfLimpo, // CPF apenas com números
        nome: nome.trim() // Remove espaços extras
      },
      valor: { 
        original: valorNumerico.toFixed(2) // Garantir 2 casas decimais
      },
      solicitacaoPagador: (descricao || "Pagamento via PIX").substring(0, 140) // Limite de caracteres
    };
    
    // Adicionar chave apenas se fornecida
    if (chavePixFinal) {
      payload.chave = chavePixFinal.trim();
      console.log(`🔑 Usando chave PIX: ${chavePixFinal}`);
    } else {
      console.log(`🧪 Gerando PIX sem chave específica (homologação)`);
    }

    console.log("📤 Payload a ser enviado:", JSON.stringify(payload, null, 2));
    console.log("📤 Enviando cobrança para Sicredi...");
    
    const response = await fazerRequisicaoSicredi(
      `${SICREDI_API}/cob`,
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
    
    // Aguarda um momento antes de consultar a cobrança
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("📋 Buscando dados da cobrança...");
    const cobranca = await fazerRequisicaoSicredi(
      `${SICREDI_API}/cob/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      }
    );

    console.log("✅ PIX gerado com sucesso!");
    
    res.json({
      sucesso: true,
      txid,
      pixCopiaECola: cobranca.data.pixCopiaECola,
      valor: payload.valor.original,
      devedor: payload.devedor,
      expiracao: payload.calendario.expiracao,
      ambiente: isProducao ? 'produção' : 'homologação',
      chave_utilizada: chavePixFinal || 'nenhuma (homologação)',
      qrcode: cobranca.data.qrcode || null // Caso tenha QR Code
    });
    
  } catch (error) {
    console.error("❌ Erro detalhado:", {
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
    
    // Mensagens de erro mais específicas
    if (error.response?.data?.detail) {
      errorMessage = error.response.data.detail;
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    const responseError = {
      erro: errorMessage,
      ambiente: process.env.SICREDI_ENV === 'prod' ? 'produção' : 'homologação',
      timestamp: new Date().toISOString()
    };
    
    // Em desenvolvimento, adiciona mais detalhes
    if (process.env.NODE_ENV === 'development') {
      responseError.detalhes = {
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
        violacoes: error.response?.data?.violacoes
      };
    }
    
    res.status(statusCode).json(responseError);
  }
});

// Também adicione este endpoint para debug do payload:
app.post("/debug-payload", (req, res) => {
  try {
    const { nome, cpf, valor, chave_pix, descricao } = req.body;
    
    // Validações e processamento igual ao endpoint principal
    const cpfLimpo = cpf?.replace(/\D/g, '') || '';
    const valorNumerico = parseFloat(valor) || 0;
    const chavePixFinal = chave_pix || PIX_KEY;
    
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
      chave_presente: !!chavePixFinal
    };
    
    res.json({
      payload_que_seria_enviado: payload,
      validacoes,
      ambiente: process.env.SICREDI_ENV === 'prod' ? 'produção' : 'homologação',
      todas_validacoes_ok: Object.values(validacoes).every(v => v === true)
    });
    
  } catch (error) {
    res.status(400).json({
      erro: "Erro ao processar payload",
      detalhes: error.message
    });
  }
});

// Endpoint para consultar status de uma cobrança
app.get("/consultar-pix/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const token = await obterToken();
    
    console.log(`🔍 Consultando PIX: ${txid}`);
    
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
    
    res.json({
      sucesso: true,
      dados: cobranca.data
    });
    
  } catch (error) {
    console.error("❌ Erro ao consultar PIX:", error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || "Falha ao consultar PIX";
    
    res.status(statusCode).json({ 
      erro: errorMessage 
    });
  }
});

// Endpoint para testar chaves PIX disponíveis
app.get("/listar-chaves", async (req, res) => {
  try {
    const token = await obterToken();
    
    console.log("🔑 Listando chaves PIX disponíveis...");
    
    // Tenta buscar cobranças recentes para identificar chaves válidas
    const agora = new Date();
    const ontemISO = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const agoraISO = agora.toISOString();
    
    const cobrancas = await fazerRequisicaoSicredi(
      `${SICREDI_API}/cob?inicio=${ontemISO}&fim=${agoraISO}`,
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
      message: "Chaves encontradas nas cobranças recentes",
      chaves_encontradas: chavesEncontradas,
      chave_configurada: PIX_KEY || "NÃO CONFIGURRADA",
      dica: "Se não há chaves, você precisa cadastrar uma chave PIX no Sicredi primeiro"
    });
    
  } catch (error) {
    console.error("❌ Erro ao listar chaves:", error.message);
    
    res.json({
      sucesso: false,
      erro: "Não foi possível listar chaves",
      chave_configurada: PIX_KEY || "NÃO CONFIGURADA",
      dica: "Verifique se sua chave PIX está cadastrada no Sicredi",
      detalhes: error.response?.data
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