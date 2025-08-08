const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const app = express();

// Configurar body parser com tratamento de erro melhorado
app.use(bodyParser.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      console.error('❌ JSON malformado recebido:', buf.toString());
      console.error('❌ Erro de parsing:', e.message);
      throw new Error('JSON malformado');
    }
  }
}));

// Middleware para tratar erros de JSON
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('❌ Erro de sintaxe JSON:', error.message);
    return res.status(400).json({
      erro: 'JSON malformado no payload',
      detalhes: error.message,
      dica: 'Verifique se não há vírgulas extras, chaves não fechadas ou caracteres inválidos',
      timestamp: new Date().toISOString()
    });
  }
  next(error);
});

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
🚀 PIX Service Sicredi - Iniciando (Versão sem Chrome)
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
console.log("🔍 Validando configuração do ambiente...");

if (!CONFIG.client_id || !CONFIG.client_secret) {
  console.error(`❌ Configuração incompleta para ambiente ${AMBIENTE_ATUAL}`);
  console.error(`🔐 Client ID: ${CONFIG.client_id ? 'OK' : 'FALTANDO'}`);
  console.error(`🔐 Client Secret: ${CONFIG.client_secret ? 'OK' : 'FALTANDO'}`);
  console.error(`📋 PIX Key: ${CONFIG.pix_key || 'FALTANDO'}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.error("❌ Parando execução em produção devido à configuração incompleta");
    process.exit(1);
  }
} else {
  console.log("✅ Configuração do ambiente validada com sucesso");
}

// =====================================================
// FUNÇÕES UTILITÁRIAS PARA QR CODE
// =====================================================

async function gerarQRCode(pixCopiaECola, opcoes = {}) {
  try {
    const opcoesQR = {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: opcoes.width || 256,
      ...opcoes
    };

    // Gerar QR Code como base64
    const qrCodeDataURL = await QRCode.toDataURL(pixCopiaECola, opcoesQR);
    
    // Gerar QR Code como buffer (para salvar arquivo se necessário)
    const qrCodeBuffer = await QRCode.toBuffer(pixCopiaECola, opcoesQR);
    
    return {
      dataURL: qrCodeDataURL,
      buffer: qrCodeBuffer,
      base64: qrCodeDataURL.split(',')[1] // Remover prefixo data:image/png;base64,
    };
    
  } catch (error) {
    console.error('❌ Erro ao gerar QR Code:', error.message);
    throw error;
  }
}

// =====================================================
// FUNÇÕES DE GERAÇÃO PDF COM PDFKIT
// =====================================================

function gerarRelatorioPDFSimples(dados, estatisticas, periodo) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Relatório de Cobranças PIX', 50, 50);
      doc.fontSize(14).text('Igreja em Mossoró - Sistema Sicredi', 50, 80);
      doc.fontSize(10).text(`Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}`, 50, 100);
      
      // Período
      const dataInicio = new Date(periodo.inicio).toLocaleDateString('pt-BR');
      const dataFim = new Date(periodo.fim).toLocaleDateString('pt-BR');
      doc.fontSize(12).text(`Período: ${dataInicio} até ${dataFim}`, 50, 130);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 50, 150);

      // Estatísticas
      let y = 180;
      doc.fontSize(16).text('Estatísticas', 50, y);
      y += 30;
      
      doc.fontSize(12);
      doc.text(`Total de Cobranças: ${estatisticas.total_cobrancas}`, 50, y);
      doc.text(`Valor Total: R$ ${estatisticas.valor_total.toFixed(2)}`, 300, y);
      y += 20;
      
      doc.text(`Cobranças Pagas: ${estatisticas.cobrancas_pagas}`, 50, y);
      doc.text(`Valor Recebido: R$ ${estatisticas.valor_recebido.toFixed(2)}`, 300, y);
      y += 20;
      
      doc.text(`Taxa de Conversão: ${estatisticas.taxa_conversao}`, 50, y);
      doc.text(`Cobranças Ativas: ${estatisticas.cobrancas_ativas}`, 300, y);
      y += 40;

      // Tabela de dados
      doc.fontSize(16).text('Detalhes das Cobranças', 50, y);
      y += 30;

      // Headers da tabela (sem TXID)
      doc.fontSize(10);
      doc.text('Devedor', 50, y);
      doc.text('Valor', 200, y);
      doc.text('Status', 280, y);
      doc.text('Data', 360, y);
      doc.text('Evento/Categoria', 450, y);
      y += 20;

      // Linha separadora
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;

      // Dados (sem TXID)
      dados.forEach((cob, index) => {
        if (y > 700) { // Nova página se necessário
          doc.addPage();
          y = 50;
        }

        doc.text((cob.devedor || 'N/A').substring(0, 25), 50, y);
        doc.text(`R$ ${cob.valor || '0.00'}`, 200, y);
        doc.text(cob.pago ? 'PAGA' : (cob.status || 'N/A'), 280, y);
        doc.text(cob.data_criacao ? new Date(cob.data_criacao).toLocaleDateString('pt-BR') : 'N/A', 360, y);
        
        // Mostrar evento e categoria
        const eventoCategoria = [];
        if (cob.evento) eventoCategoria.push(cob.evento.substring(0, 15));
        if (cob.categoria) eventoCategoria.push(cob.categoria.substring(0, 15));
        doc.text(eventoCategoria.join('/') || 'N/A', 450, y);
        
        y += 15;
      });

      // Footer
      doc.fontSize(8).text('Igreja em Mossoró - Sistema de Cobranças PIX', 50, doc.page.height - 50);
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
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
      console.log(`⚠️ CA específico não encontrado, usando padrão`);
    }

  } catch (error) {
    console.error("❌ Erro ao carregar certificados:", error.message);
    console.log("⚠️ Continuando sem certificados (modo desenvolvimento)");
  }
}

// Carregar certificados se disponíveis
carregarCertificados();

// =====================================================
// FUNÇÕES UTILITÁRIAS
// =====================================================

const httpsAgent = new https.Agent({
  cert: certificates.cert,
  key: certificates.key,
  ca: certificates.ca,
  rejectUnauthorized: CONFIG.ssl_verify
});

async function fazerRequisicaoSicredi(url, options = {}) {
  const config = {
    ...options,
    httpsAgent,
    timeout: CONFIG.timeout,
    headers: {
      'User-Agent': 'PIX-Service-Igreja-Mossoro/2.0',
      ...options.headers
    }
  };

  for (let tentativa = 1; tentativa <= CONFIG.retry_attempts; tentativa++) {
    try {
      console.log(`🔄 Tentativa ${tentativa}/${CONFIG.retry_attempts}: ${options.method || 'GET'} ${url}`);
      
      const response = await axios({
        url,
        ...config
      });
      
      console.log(`✅ Resposta recebida: ${response.status}`);
      return response;
      
    } catch (error) {
      console.log(`❌ Tentativa ${tentativa} falhou: ${error.message}`);
      
      if (tentativa === CONFIG.retry_attempts) {
        throw error;
      }
      
      const delay = Math.min(1000 * Math.pow(2, tentativa - 1), 5000);
      console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

let tokenCache = { token: null, expires: null };

// Função para invalidar cache de token (forçar novo token)
function invalidarCacheToken() {
  console.log("🔄 Invalidando cache de token - será obtido novo token");
  tokenCache.token = null;
  tokenCache.expires = null;
}

async function obterToken() {
  if (tokenCache.token && tokenCache.expires && Date.now() < tokenCache.expires) {
    console.log("🔄 Usando token em cache");
    return tokenCache.token;
  }

  console.log("🔑 Obtendo novo token OAuth2...");
  
  const credentials = Buffer.from(`${CONFIG.client_id}:${CONFIG.client_secret}`).toString('base64');
  
  const response = await fazerRequisicaoSicredi(CONFIG.token_url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data: 'grant_type=client_credentials&scope=cob.read+cob.write+pix.read+cobv.read+cobv.write'
  });

  const { access_token, expires_in } = response.data;
  
  tokenCache.token = access_token;
  tokenCache.expires = Date.now() + (expires_in * 1000) - 60000; // 1 min antes de expirar
  
  console.log(`✅ Token obtido com sucesso (expira em ${expires_in}s)`);
  console.log(`🔐 Scopes incluídos: cob.write cob.read cobv.write cobv.read lotecobv.write lotecobv.read`);
  return access_token;
}

// =====================================================
// ENDPOINTS PRINCIPAIS (apenas alguns essenciais)
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    ambiente: AMBIENTE_ATUAL,
    version: "2.0.0-no-chrome"
  });
});

app.get("/ping", (req, res) => {
  res.json({ 
    message: "pong", 
    timestamp: new Date().toISOString(),
    ambiente: AMBIENTE_ATUAL 
  });
});

// Endpoint para testar token e scopes
app.get("/test-token", async (req, res) => {
  try {
    console.log("🧪 Testando token e scopes...");
    
    // Invalidar cache para obter token fresco
    invalidarCacheToken();
    const token = await obterToken();
    
    // Testar acesso básico
    const testCob = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob?inicio=2025-01-01T00:00:00Z&fim=2025-01-01T01:00:00Z`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    let cobvAccess = false;
    try {
      // Testar acesso a endpoints cobv
      await fazerRequisicaoSicredi(
        `${CONFIG.api_url}/cobv?inicio=2025-01-01T00:00:00Z&fim=2025-01-01T01:00:00Z`,
        {
          method: 'GET',
          headers: { 
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
        }
      );
      cobvAccess = true;
    } catch (error) {
      console.log(`⚠️ Acesso cobv negado: ${error.response?.status} - ${error.message}`);
    }
    
    res.json({
      sucesso: true,
      token_funcional: true,
      cob_access: true,
      cobv_access: cobvAccess,
      ambiente: AMBIENTE_ATUAL,
      scopes_solicitados: "cob.read+cob.write+pix.read+cobv.read+cobv.write",
      timestamp: new Date().toISOString(),
      sugestao: cobvAccess ? null : "Token não tem acesso aos endpoints PIX com vencimento. Verifique credenciais."
    });
    
  } catch (error) {
    console.error("❌ Erro no teste de token:", error.message);
    
    res.status(500).json({
      sucesso: false,
      erro: "Token não funcional",
      detalhes: error.message,
      status_code: error.response?.status || 'unknown',
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para gerar relatório em PDF (versão sem Chrome)
app.get("/relatorio-pdf", async (req, res) => {
  try {
    const { 
      data_inicio, 
      data_fim, 
      nome_arquivo,
      evento,
      categoria
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
    
    // Processar dados primeiro (antes dos filtros)
    let dadosFormatados = dados.map(cob => {
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
    
    // Log para debug
    console.log(`📋 Exemplo de dados processados:`);
    dadosFormatados.slice(0, 3).forEach((cob, i) => {
      console.log(`${i+1}. Evento: "${cob.evento}", Categoria: "${cob.categoria}", Devedor: "${cob.devedor}"`);
    });
    
    // Processar estatísticas (baseado nos dados originais)
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
    
    
    // Aplicar filtros (corrigido para buscar nas informações adicionais)
    console.log(`📋 Total cobranças antes do filtro: ${dadosFormatados.length}`);
    
    if (evento) {
      const eventoFiltro = evento.toLowerCase().trim();
      dadosFormatados = dadosFormatados.filter(cob => {
        return cob.evento && cob.evento.toLowerCase().includes(eventoFiltro);
      });
      console.log(`📋 Filtro por evento "${evento}": ${dadosFormatados.length} cobranças`);
    }
    
    if (categoria) {
      const categoriaFiltro = categoria.toLowerCase().trim();
      dadosFormatados = dadosFormatados.filter(cob => {
        return cob.categoria && cob.categoria.toLowerCase().includes(categoriaFiltro);
      });
      console.log(`📋 Filtro por categoria "${categoria}": ${dadosFormatados.length} cobranças`);
    }
    
    console.log(`📋 Total cobranças após filtros: ${dadosFormatados.length}`);
    
    // Recalcular estatísticas baseadas nos dados filtrados
    const statsFiltradas = {
      ...stats,
      total_cobrancas: dadosFormatados.length,
      valor_total: dadosFormatados.reduce((acc, cob) => acc + parseFloat(cob.valor || 0), 0),
      cobrancas_pagas: dadosFormatados.filter(cob => cob.pago).length,
      cobrancas_ativas: dadosFormatados.filter(cob => cob.status === 'ATIVA').length,
      valor_recebido: dadosFormatados
        .filter(cob => cob.pago)
        .reduce((acc, cob) => acc + parseFloat(cob.valor || 0), 0),
      taxa_conversao: dadosFormatados.length > 0 ? 
        ((dadosFormatados.filter(cob => cob.pago).length / dadosFormatados.length) * 100).toFixed(1) + '%' : '0%'
    };
    
    // Gerar PDF usando PDFKit (com estatísticas filtradas)
    const pdfBuffer = await gerarRelatorioPDFSimples(dadosFormatados, statsFiltradas, {
      inicio: inicioISO,
      fim: fimISO
    });
    
    // Gerar nome do arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    let sufixoFiltro = '';
    if (evento) sufixoFiltro += `-evento-${evento.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (categoria) sufixoFiltro += `-cat-${categoria.replace(/[^a-zA-Z0-9]/g, '')}`;
    
    const nomeArquivo = nome_arquivo || 
      `relatorio-cobrancas-${AMBIENTE_ATUAL}-${timestamp}${sufixoFiltro}-${Date.now()}.pdf`;
    
    const caminhoArquivo = path.join(PDF_PATH, nomeArquivo);
    
    // Salvar PDF no servidor
    fs.writeFileSync(caminhoArquivo, pdfBuffer);
    
    console.log(`✅ PDF gerado com sucesso: ${nomeArquivo}`);
    
    // URL para acessar o PDF
    const urlPdf = `${req.protocol}://${req.get('host')}/pdfs/${nomeArquivo}`;
    
    res.json({
      sucesso: true,
      message: "Relatório PDF gerado com sucesso (PDFKit)",
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
      gerado_em: new Date().toISOString(),
      metodo: "PDFKit (sem Chrome)"
    });
    
  } catch (error) {
    console.error("❌ Erro ao gerar relatório PDF:", error);
    res.status(500).json({
      erro: "Falha ao gerar relatório PDF",
      detalhes: error.message,
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString(),
      metodo: "PDFKit (sem Chrome)"
    });
  }
});

// =====================================================
// ENDPOINTS PIX COM VENCIMENTO (CobV)
// =====================================================

// Endpoint para gerar PIX com vencimento (CobV)
app.post("/gerar-pix-vencimento", async (req, res) => {
  try {
    console.log(`📥 Payload recebido no /gerar-pix-vencimento:`, JSON.stringify(req.body, null, 2));
    
    let pagamento, evento, tag_evento, categoria, data_vencimento, multa, juros, desconto;
    
    // Detectar formato AppSheet (dados diretos) vs formato antigo (objeto pagamento)
    if (req.body.pagamento) {
      // Formato antigo: { pagamento: {...}, evento: "...", ... }
      ({ pagamento, evento, tag_evento, categoria, data_vencimento, multa, juros, desconto } = req.body);
    } else if (req.body["Row ID"] || req.body.Pagador || req.body["Valor Pix"]) {
      // Formato AppSheet: dados diretos no body
      pagamento = {
        "Row ID": req.body["Row ID"],
        "Pagador": req.body.Pagador,
        "Valor Pix": req.body["Valor Pix"]?.toString().replace(",", "."), // Converter vírgula para ponto
        "Inscricao": req.body.cpf || req.body.Inscricao // Priorizar campo 'cpf' se disponível
      };
      evento = req.body.evento;
      tag_evento = req.body.tag_evento;
      categoria = req.body.categoria;
      data_vencimento = req.body.data_vencimento || req.body.vencimento;
      multa = req.body.multa;
      juros = req.body.juros;
      desconto = req.body.desconto;
    } else {
      return res.status(400).json({
        erro: "Formato de dados inválido. Esperado: campos 'Row ID', 'Pagador', 'Valor Pix', 'data_vencimento'",
        ambiente: AMBIENTE_ATUAL,
        payload_recebido: req.body
      });
    }

    // Validar data de vencimento
    if (!data_vencimento) {
      return res.status(400).json({
        erro: "Campo 'data_vencimento' é obrigatório para PIX com vencimento",
        ambiente: AMBIENTE_ATUAL,
        formato_esperado: "YYYY-MM-DD"
      });
    }

    const dataVenc = new Date(data_vencimento);
    if (isNaN(dataVenc.getTime()) || dataVenc <= new Date()) {
      return res.status(400).json({
        erro: "Data de vencimento deve ser válida e futura",  
        ambiente: AMBIENTE_ATUAL,
        data_recebida: data_vencimento
      });
    }

    console.log(`📋 Dados processados - Pagamento:`, pagamento);
    console.log(`📋 Evento: ${evento}, Tag: ${tag_evento}, Categoria: ${categoria}`);
    console.log(`📅 Vencimento: ${data_vencimento}`);

    // Invalidar cache de token para garantir que temos um novo token com scopes corretos
    if (!tokenCache.token) {
      console.log(`🔄 Primeiro acesso - invalidando cache para obter token com scopes cobv`);
      invalidarCacheToken();
    }

    const token = await obterToken();
    const txid = crypto.randomBytes(16).toString('hex').slice(0, 25);
    const valor = parseFloat(pagamento["Valor Pix"].toString().replace(",", ".")).toFixed(2);

    // Payload para PIX com vencimento (CobV)
    const pixPayload = {
      calendario: {
        dataDeVencimento: data_vencimento,
        validadeAposVencimento: req.body.validade_apos_vencimento || 30 // dias
      },
      devedor: {
        nome: pagamento.Pagador.trim(),
        cpf: (pagamento.Inscricao || "00000000000").replace(/\D/g, "")
      },
      valor: {
        original: valor
      },
      chave: CONFIG.pix_key,
      solicitacaoPagador: req.body.descricao || `Pagamento com vencimento - ${pagamento["Row ID"]}`
    };

    // Adicionar multa se especificada
    if (multa && parseFloat(multa) > 0) {
      pixPayload.valor.multa = {
        modalidade: "2", // Valor fixo
        valorPerc: parseFloat(multa).toFixed(2)
      };
    }

    // Adicionar juros se especificados
    if (juros && parseFloat(juros) > 0) {
      pixPayload.valor.juros = {
        modalidade: "2", // Valor mensal
        valorPerc: parseFloat(juros).toFixed(2)
      };
    }

    // Adicionar desconto se especificado
    if (desconto && parseFloat(desconto) > 0) {
      pixPayload.valor.desconto = {
        modalidade: "1", // Valor fixo até data
        descontoDataFixa: [{
          data: data_vencimento,
          valorPerc: parseFloat(desconto).toFixed(2)
        }]
      };
    }

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
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: pixPayload
    });

    console.log(`✅ PIX com vencimento gerado com sucesso no ambiente ${AMBIENTE_ATUAL.toUpperCase()}: ${txid}`);

    // Gerar QR Code
    let qrCode = null;
    try {
      if (response.data.pixCopiaECola) {
        console.log(`📱 Gerando QR Code para PIX com vencimento: ${txid}`);
        qrCode = await gerarQRCode(response.data.pixCopiaECola, { width: 300 });
        console.log(`✅ QR Code gerado com sucesso para PIX com vencimento`);
      }
    } catch (qrError) {
      console.error(`⚠️ Erro ao gerar QR Code para PIX com vencimento:`, qrError.message);
      // Continuar sem QR Code se houver erro
    }

    res.json({
      sucesso: true,
      tipo: "cobv",
      txid: txid,
      pixCopiaECola: response.data.pixCopiaECola,
      qrCode: qrCode ? {
        dataURL: qrCode.dataURL,
        base64: qrCode.base64
      } : null,
      valor: valor,
      pagador: pagamento.Pagador,
      data_vencimento: data_vencimento,
      ambiente: AMBIENTE_ATUAL,
      evento: evento || null,
      tag_evento: tag_evento || null,
      categoria: categoria || null,
      multa: multa || null,
      juros: juros || null,
      desconto: desconto || null,
      dados_completos: response.data
    });

  } catch (error) {
    console.error(`❌ Erro ao gerar PIX com vencimento no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    let detalheErro = error.message;
    let statusCode = 500;
    let sugestao = null;
    
    if (error.response?.status === 403) {
      statusCode = 403;
      detalheErro = "Token sem permissão para endpoints PIX com vencimento (cobv)";
      sugestao = "Verifique se as credenciais têm acesso aos scopes: cobv.write cobv.read";
      
      // Invalidar token para tentar obter um novo na próxima requisição
      console.log(`🔄 Erro 403 - invalidando token para próxima tentativa`);
      invalidarCacheToken();
    } else if (error.response?.data) {
      detalheErro = JSON.stringify(error.response.data);
    }
    
    res.status(statusCode).json({
      erro: "Falha ao gerar PIX com vencimento",
      detalhes: detalheErro,
      ambiente: AMBIENTE_ATUAL,
      status_code: error.response?.status || 'unknown',
      sugestao: sugestao,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para gerar lote de PIX com vencimento (LoteCobV)
app.post("/gerar-lote-pix-vencimento", async (req, res) => {
  try {
    console.log(`📥 Payload recebido no /gerar-lote-pix-vencimento:`, JSON.stringify(req.body, null, 2));
    
    const { cobsv, descricao } = req.body;
    
    if (!cobsv || !Array.isArray(cobsv) || cobsv.length === 0) {
      return res.status(400).json({
        erro: "Campo 'cobsv' deve ser um array com pelo menos 1 cobrança",
        ambiente: AMBIENTE_ATUAL,
        formato_esperado: {
          cobsv: [
            {
              "Row ID": "string",
              Pagador: "string", 
              "Valor Pix": "number",
              cpf: "string",
              data_vencimento: "YYYY-MM-DD",
              evento: "string (opcional)",
              categoria: "string (opcional)",
              tag_evento: "string (opcional)"
            }
          ]
        }
      });
    }

    if (cobsv.length > 1000) {
      return res.status(400).json({
        erro: "Máximo de 1000 cobranças por lote",
        ambiente: AMBIENTE_ATUAL,
        quantidade_recebida: cobsv.length
      });
    }

    const token = await obterToken();
    const loteId = `lote${Date.now()}`;
    
    // Processar cada cobrança do lote
    const cobrancasProcessadas = {};
    const erros = [];
    
    for (let i = 0; i < cobsv.length; i++) {
      const cob = cobsv[i];
      
      try {
        // Validar campos obrigatórios
        if (!cob["Row ID"] || !cob.Pagador || !cob["Valor Pix"] || !cob.data_vencimento) {
          erros.push({
            indice: i,
            erro: "Campos obrigatórios: Row ID, Pagador, Valor Pix, data_vencimento",
            cobranca: cob
          });
          continue;
        }

        // Validar data de vencimento
        const dataVenc = new Date(cob.data_vencimento);
        if (isNaN(dataVenc.getTime()) || dataVenc <= new Date()) {
          erros.push({
            indice: i,
            erro: "Data de vencimento deve ser válida e futura",
            cobranca: cob
          });
          continue;
        }

        const txid = `${loteId}_${i.toString().padStart(3, '0')}`;
        const valor = parseFloat(cob["Valor Pix"].toString().replace(",", ".")).toFixed(2);

        // Payload para cada PIX com vencimento
        const pixPayload = {
          calendario: {
            dataDeVencimento: cob.data_vencimento,
            validadeAposVencimento: cob.validade_apos_vencimento || 30
          },
          devedor: {
            nome: cob.Pagador.trim(),
            cpf: (cob.cpf || cob.Inscricao || "00000000000").replace(/\D/g, "")
          },
          valor: {
            original: valor
          },
          chave: CONFIG.pix_key,
          solicitacaoPagador: cob.descricao || `Lote ${loteId} - ${cob["Row ID"]}`
        };

        // Adicionar informações de evento
        if (cob.evento || cob.tag_evento || cob.categoria) {
          pixPayload.infoAdicionais = [];
          
          if (cob.evento) pixPayload.infoAdicionais.push({ nome: "evento", valor: cob.evento });
          if (cob.tag_evento) pixPayload.infoAdicionais.push({ nome: "tag_evento", valor: cob.tag_evento });
          if (cob.categoria) pixPayload.infoAdicionais.push({ nome: "categoria", valor: cob.categoria });
        }

        // Adicionar multa, juros, desconto se especificados
        if (cob.multa && parseFloat(cob.multa) > 0) {
          pixPayload.valor.multa = {
            modalidade: "2",
            valorPerc: parseFloat(cob.multa).toFixed(2)
          };
        }

        if (cob.juros && parseFloat(cob.juros) > 0) {
          pixPayload.valor.juros = {
            modalidade: "2", 
            valorPerc: parseFloat(cob.juros).toFixed(2)
          };
        }

        if (cob.desconto && parseFloat(cob.desconto) > 0) {
          pixPayload.valor.desconto = {
            modalidade: "1",
            descontoDataFixa: [{
              data: cob.data_vencimento,
              valorPerc: parseFloat(cob.desconto).toFixed(2)
            }]
          };
        }

        cobrancasProcessadas[txid] = pixPayload;
        
      } catch (error) {
        erros.push({
          indice: i,
          erro: error.message,
          cobranca: cob
        });
      }
    }

    // Criar lote no Sicredi
    const lotePayload = {
      descricao: descricao || `Lote PIX com vencimento - ${new Date().toLocaleString('pt-BR')}`,
      cobsv: cobrancasProcessadas
    };

    const url = `${CONFIG.api_url}/lotecobv/${loteId}`;
    
    const response = await fazerRequisicaoSicredi(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      data: lotePayload
    });

    console.log(`✅ Lote PIX com vencimento criado com sucesso: ${loteId} (${Object.keys(cobrancasProcessadas).length} cobranças)`);

    // Gerar QR Codes para cada cobrança do lote
    const qrCodes = {};
    let qrCodesGerados = 0;
    
    if (response.data && response.data.cobsv) {
      console.log(`📱 Gerando QR Codes para lote: ${loteId}`);
      
      for (const [txid, cobData] of Object.entries(response.data.cobsv)) {
        try {
          if (cobData.pixCopiaECola) {
            const qrCode = await gerarQRCode(cobData.pixCopiaECola, { width: 256 });
            qrCodes[txid] = {
              dataURL: qrCode.dataURL,
              base64: qrCode.base64
            };
            qrCodesGerados++;
          }
        } catch (qrError) {
          console.error(`⚠️ Erro ao gerar QR Code para ${txid}:`, qrError.message);
          // Continuar com as outras cobranças
        }
      }
      
      console.log(`✅ QR Codes gerados: ${qrCodesGerados}/${Object.keys(response.data.cobsv).length}`);
    }

    res.json({
      sucesso: true,
      tipo: "lotecobv",
      lote_id: loteId,
      total_solicitadas: cobsv.length,
      total_processadas: Object.keys(cobrancasProcessadas).length,
      total_erros: erros.length,
      qr_codes_gerados: qrCodesGerados,
      ambiente: AMBIENTE_ATUAL,
      erros: erros.length > 0 ? erros : null,
      qrCodes: Object.keys(qrCodes).length > 0 ? qrCodes : null,
      dados_completos: response.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Erro ao gerar lote PIX com vencimento no ambiente ${AMBIENTE_ATUAL}:`, error.message);
    
    let detalheErro = error.message;
    if (error.response?.data) {
      detalheErro = JSON.stringify(error.response.data);
    }
    
    res.status(500).json({
      erro: "Falha ao gerar lote PIX com vencimento",
      detalhes: detalheErro,
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para consultar PIX imediato (cob)
app.get("/consultar-pix/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const token = await obterToken();
    
    console.log(`🔍 Consultando PIX imediato: ${txid} no ambiente ${AMBIENTE_ATUAL.toUpperCase()}`);
    
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cob/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
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
      sucesso: true,
      tipo: "cob",
      txid: txid,
      status: dadosCobranca.status,
      pago: foiPago,
      expirado: expirado,
      ambiente: AMBIENTE_ATUAL,
      dados: {
        valor: dadosCobranca.valor,
        devedor: dadosCobranca.devedor,
        data_criacao: dadosCobranca.calendario?.criacao,
        data_expiracao: dataExpiracao ? dataExpiracao.toISOString() : null,
        data_expiracao_formatada: dataExpiracao ? dataExpiracao.toLocaleString('pt-BR') : null,
        expiracao_segundos: dadosCobranca.calendario?.expiracao || null,
        pixCopiaECola: dadosCobranca.pixCopiaECola,
        info_pagamento: foiPago ? dadosCobranca.pix?.[0] : null
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erro ao consultar PIX imediato ${req.params.txid}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    
    res.status(statusCode).json({
      erro: `PIX imediato não encontrado ou erro na consulta`,
      txid: req.params.txid,
      detalhes: error.response?.data || error.message,
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para consultar PIX com vencimento
app.get("/consultar-pix-vencimento/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const token = await obterToken();
    
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/cobv/${txid}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    console.log(`✅ PIX com vencimento consultado: ${txid}`);
    
    res.json({
      sucesso: true,
      tipo: "cobv",
      txid: txid,
      ambiente: AMBIENTE_ATUAL,
      dados: response.data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erro ao consultar PIX com vencimento ${req.params.txid}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    
    res.status(statusCode).json({
      erro: `PIX com vencimento não encontrado ou erro na consulta`,
      txid: req.params.txid,
      detalhes: error.response?.data || error.message,
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para consultar lote PIX com vencimento  
app.get("/consultar-lote-pix-vencimento/:loteId", async (req, res) => {
  try {
    const { loteId } = req.params;
    const token = await obterToken();
    
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/lotecobv/${loteId}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    console.log(`✅ Lote PIX com vencimento consultado: ${loteId}`);
    
    res.json({
      sucesso: true,
      tipo: "lotecobv",
      lote_id: loteId,
      ambiente: AMBIENTE_ATUAL,
      dados: response.data,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ Erro ao consultar lote PIX com vencimento ${req.params.loteId}:`, error.message);
    
    const statusCode = error.response?.status || 500;
    
    res.status(statusCode).json({
      erro: `Lote PIX com vencimento não encontrado ou erro na consulta`,
      lote_id: req.params.loteId,
      detalhes: error.response?.data || error.message,
      ambiente: AMBIENTE_ATUAL,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para exibir QR Code como imagem PNG
app.get("/qrcode/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const { width = 300, tipo = 'cobv' } = req.query;
    
    const token = await obterToken();
    
    // Determinar URL baseada no tipo
    const apiPath = tipo === 'lotecobv' ? `lotecobv/${txid}` : `cobv/${txid}`;
    
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/${apiPath}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    let pixCopiaECola = null;
    
    if (tipo === 'lotecobv' && response.data.cobsv) {
      // Para lotes, pegar a primeira cobrança ou uma específica
      const firstTxid = Object.keys(response.data.cobsv)[0];
      pixCopiaECola = response.data.cobsv[firstTxid]?.pixCopiaECola;
    } else {
      // Para cobrança individual
      pixCopiaECola = response.data.pixCopiaECola;
    }
    
    if (!pixCopiaECola) {
      return res.status(404).json({
        erro: "PIX Copia e Cola não encontrado",
        txid: txid,
        tipo: tipo
      });
    }
    
    // Gerar QR Code
    const qrCode = await gerarQRCode(pixCopiaECola, { 
      width: parseInt(width),
      type: 'png'
    });
    
    // Retornar imagem PNG
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="qrcode_${txid}.png"`);
    res.send(qrCode.buffer);
    
    console.log(`📱 QR Code servido como imagem para: ${txid}`);
    
  } catch (error) {
    console.error(`❌ Erro ao servir QR Code para ${req.params.txid}:`, error.message);
    
    res.status(404).json({
      erro: "Não foi possível gerar QR Code",
      txid: req.params.txid,
      detalhes: error.message,
      ambiente: AMBIENTE_ATUAL
    });
  }
});

// Endpoint para visualizar QR Code em página HTML
app.get("/visualizar-qr/:txid", async (req, res) => {
  try {
    const { txid } = req.params;
    const { tipo = 'cobv' } = req.query;
    
    const token = await obterToken();
    
    // Determinar URL baseada no tipo
    const apiPath = tipo === 'lotecobv' ? `lotecobv/${txid}` : `cobv/${txid}`;
    
    const response = await fazerRequisicaoSicredi(
      `${CONFIG.api_url}/${apiPath}`,
      {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      }
    );
    
    let pixCopiaECola = null;
    let dadosCobranca = null;
    
    if (tipo === 'lotecobv' && response.data.cobsv) {
      // Para lotes, pegar a primeira cobrança
      const firstTxid = Object.keys(response.data.cobsv)[0];
      const cobData = response.data.cobsv[firstTxid];
      pixCopiaECola = cobData?.pixCopiaECola;
      dadosCobranca = cobData;
    } else {
      // Para cobrança individual
      pixCopiaECola = response.data.pixCopiaECola;
      dadosCobranca = response.data;
    }
    
    if (!pixCopiaECola) {
      return res.status(404).send(`
        <html>
          <head><title>QR Code não encontrado</title></head>
          <body>
            <h1>❌ QR Code não encontrado</h1>
            <p>TXID: ${txid}</p>
            <p>Tipo: ${tipo}</p>
          </body>
        </html>
      `);
    }
    
    // Gerar QR Code
    const qrCode = await gerarQRCode(pixCopiaECola, { width: 400 });
    
    // Página HTML com QR Code
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Code PIX - ${txid}</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background: #f5f5f5;
            }
            .container {
                background: white;
                border-radius: 12px;
                padding: 30px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
            }
            .qr-code {
                margin: 20px 0;
                padding: 20px;
                background: white;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                display: inline-block;
            }
            .info {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
                text-align: left;
            }
            .info h3 {
                margin-top: 0;
                color: #333;
            }
            .copy-button {
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                margin: 10px;
            }
            .copy-button:hover {
                background: #0056b3;
            }
            .pix-code {
                font-family: monospace;
                background: #f1f1f1;
                padding: 10px;
                border-radius: 4px;
                word-break: break-all;
                font-size: 12px;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>📱 QR Code PIX</h1>
            <p><strong>TXID:</strong> ${txid}</p>
            
            <div class="qr-code">
                <img src="${qrCode.dataURL}" alt="QR Code PIX" />
            </div>
            
            <div class="info">
                <h3>💰 Informações da Cobrança</h3>
                <p><strong>Valor:</strong> R$ ${dadosCobranca.valor?.original || 'N/A'}</p>
                <p><strong>Devedor:</strong> ${dadosCobranca.devedor?.nome || 'N/A'}</p>
                <p><strong>Status:</strong> ${dadosCobranca.status || 'N/A'}</p>
                ${dadosCobranca.calendario?.dataDeVencimento ? 
                  `<p><strong>📅 Vencimento:</strong> ${new Date(dadosCobranca.calendario.dataDeVencimento).toLocaleDateString('pt-BR')}</p>` : ''
                }
                <p><strong>🌍 Ambiente:</strong> ${AMBIENTE_ATUAL.toUpperCase()}</p>
            </div>
            
            <div class="info">
                <h3>📋 PIX Copia e Cola</h3>
                <div class="pix-code" id="pixCode">${pixCopiaECola}</div>
                <button class="copy-button" onclick="copyPixCode()">📋 Copiar Código PIX</button>
            </div>
            
            <p><small>🕒 Gerado em: ${new Date().toLocaleString('pt-BR')}</small></p>
        </div>
        
        <script>
            function copyPixCode() {
                const pixCode = document.getElementById('pixCode').textContent;
                navigator.clipboard.writeText(pixCode).then(() => {
                    alert('✅ Código PIX copiado para a área de transferência!');
                }).catch(() => {
                    // Fallback para navegadores mais antigos
                    const textArea = document.createElement('textarea');
                    textArea.value = pixCode;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    alert('✅ Código PIX copiado!');
                });
            }
        </script>
    </body>
    </html>
    `;
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    
    console.log(`🌐 Página de visualização QR Code servida para: ${txid}`);
    
  } catch (error) {
    console.error(`❌ Erro ao exibir visualização QR Code para ${req.params.txid}:`, error.message);
    
    res.status(500).send(`
      <html>
        <head><title>Erro</title></head>
        <body>
          <h1>❌ Erro ao carregar QR Code</h1>
          <p>TXID: ${req.params.txid}</p>
          <p>Erro: ${error.message}</p>
        </body>
      </html>
    `);
  }
});

// Outros endpoints essenciais aqui (copiados do arquivo original)

// =====================================================
// INICIALIZAÇÃO DO SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 PIX Service iniciado com sucesso! (Versão sem Chrome)
📍 Porta: ${PORT}
🌐 Ambiente: ${AMBIENTE_ATUAL.toUpperCase()}
🏥 Health: http://localhost:${PORT}/health
📋 Endpoints principais:
   • GET  /health - Health check
   • GET  /ping - Ping
   • GET  /test-token - Testar token e scopes OAuth2
   • GET  /relatorio-pdf - Gerar PDF com PDFKit (sem Chrome)
   • GET  /consultar-pix/:txid - Consultar PIX imediato com data de expiração
   
📄 Endpoints PIX com vencimento:
   • POST /gerar-pix-vencimento - PIX individual com vencimento (CobV + QR Code)
   • POST /gerar-lote-pix-vencimento - Lote PIX com vencimento (LoteCobV + QR Codes) 
   • GET  /consultar-pix-vencimento/:txid - Consultar PIX com vencimento
   • GET  /consultar-lote-pix-vencimento/:loteId - Consultar lote PIX
   
📱 Endpoints de QR Code:
   • GET  /qrcode/:txid - QR Code como imagem PNG
   • GET  /visualizar-qr/:txid - Página HTML com QR Code interativo
  `);
});