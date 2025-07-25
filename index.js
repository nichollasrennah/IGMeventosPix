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

const SICREDI_API = "https://api-pix-h.sicredi.com.br/api/v2";
const SICREDI_TOKEN_URL = "https://api-pix-h.sicredi.com.br/oauth/token";
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
      "cob.read+cob.write+pix.read",     // Formato oficial da documentação
      "cob.write+cob.read+pix.read",     // Variação da ordem
      "cob.read cob.write pix.read",     // Formato com espaços
      "cob.write+cob.read",              // Sem pix.read
      "cob.read+cob.write"               // Sem pix.read (alternativo)
    ];
    
    const escopo = escopos[Math.min(tentativa - 1, escopos.length - 1)];
    const body = escopo ? 
      `grant_type=client_credentials&scope=${escopo}` : 
      `grant_type=client_credentials`;
    
    console.log(`📋 Tentando escopo: "${escopo || 'sem escopo'}"`);
    
    const response = await axios.post(
      SICREDI_TOKEN_URL,
      body,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
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
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    certificates: {
      cert: !!certificates.cert,
      key: !!certificates.key,
      ca: !!certificates.ca
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

app.post("/gerar-pix", async (req, res) => {
  try {
    const { nome, cpf, valor, chave_pix, descricao } = req.body;
    
    // Validações básicas
    if (!nome || !cpf || !valor) {
      return res.status(400).json({ 
        erro: "Campos obrigatórios: nome, cpf, valor" 
      });
    }
    
    console.log(`💰 Gerando PIX para ${nome} - R$ ${valor}`);
    
    const token = await obterToken();

    const payload = {
      calendario: { expiracao: 3600 },
      devedor: { cpf, nome },
      valor: { original: parseFloat(valor).toFixed(2) },
      chave: chave_pix || PIX_KEY,
      solicitacaoPagador: descricao || "Pagamento via PIX",
    };

    console.log("📤 Enviando cobrança para Sicredi...");
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
    console.log(`✅ Cobrança criada - TXID: ${txid}`);
    
    console.log("📋 Buscando dados da cobrança...");
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

    console.log("✅ PIX gerado com sucesso!");
    
    res.json({
      sucesso: true,
      txid,
      pixCopiaECola: cobranca.data.pixCopiaECola,
      valor: payload.valor.original,
      devedor: payload.devedor,
      expiracao: payload.calendario.expiracao
    });
    
  } catch (error) {
    console.error("❌ Erro detalhado:", {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      status: error.response?.status
    });
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || error.message || "Falha ao gerar cobrança PIX";
    
    res.status(statusCode).json({ 
      erro: errorMessage,
      detalhes: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        status: error.response?.status,
        data: error.response?.data
      } : undefined
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