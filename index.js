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

// Adicione estes endpoints ao seu middleware PIX Sicredi

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

