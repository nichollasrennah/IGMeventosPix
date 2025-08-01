const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// =====================================================
// CONFIGURAÇÃO DOS SERVIÇOS
// =====================================================

const PIX_SERVICE_URL = process.env.PIX_SERVICE_URL || "http://localhost:3000";
const WHATSAPP_SERVICE_URL = process.env.WHATSAPP_SERVICE_URL || "http://localhost:3001";

console.log(`
🚀 Gateway Service - Coordenador PIX + WhatsApp
📍 PIX Service: ${PIX_SERVICE_URL}
📍 WhatsApp Service: ${WHATSAPP_SERVICE_URL}
`);

// =====================================================
// ENDPOINTS GATEWAY
// =====================================================

// Health check combinado
app.get("/health", async (req, res) => {
  try {
    const [pixHealth, whatsappHealth] = await Promise.allSettled([
      axios.get(`${PIX_SERVICE_URL}/health`, { timeout: 5000 }),
      axios.get(`${WHATSAPP_SERVICE_URL}/health`, { timeout: 5000 })
    ]);

    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    res.status(200).json({
      service: "gateway-service",
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
      },
      services: {
        pix: {
          status: pixHealth.status === 'fulfilled' ? 'ok' : 'error',
          url: PIX_SERVICE_URL,
          data: pixHealth.status === 'fulfilled' ? pixHealth.value.data : { error: pixHealth.reason?.message }
        },
        whatsapp: {
          status: whatsappHealth.status === 'fulfilled' ? 'ok' : 'error', 
          url: WHATSAPP_SERVICE_URL,
          data: whatsappHealth.status === 'fulfilled' ? whatsappHealth.value.data : { error: whatsappHealth.reason?.message }
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      service: "gateway-service",
      status: "error",
      error: error.message
    });
  }
});

app.get("/ping", (req, res) => {
  res.status(200).json({
    message: "pong",
    service: "gateway-service",
    timestamp: new Date().toISOString()
  });
});

// Proxy para PIX Service
app.post("/gerar-pix", async (req, res) => {
  try {
    console.log('📤 Proxy PIX: gerar-pix');
    const response = await axios.post(`${PIX_SERVICE_URL}/gerar-pix`, req.body, {
      timeout: 30000
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ Erro no proxy PIX:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { erro: "Falha no serviço PIX" }
    );
  }
});

app.post("/gerar-pix-vencimento", async (req, res) => {
  try {
    console.log('📤 Proxy PIX: gerar-pix-vencimento');
    const response = await axios.post(`${PIX_SERVICE_URL}/gerar-pix-vencimento`, req.body, {
      timeout: 30000
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ Erro no proxy PIX vencimento:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { erro: "Falha no serviço PIX" }
    );
  }
});

app.get("/consultar-pix/:txid", async (req, res) => {
  try {
    console.log('📤 Proxy PIX: consultar-pix');
    const response = await axios.get(`${PIX_SERVICE_URL}/consultar-pix/${req.params.txid}`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { erro: "Falha no serviço PIX" }
    );
  }
});

app.get("/consultar-pix-vencimento/:txid", async (req, res) => {
  try {
    console.log('📤 Proxy PIX: consultar-pix-vencimento');
    const response = await axios.get(`${PIX_SERVICE_URL}/consultar-pix-vencimento/${req.params.txid}`, {
      timeout: 15000
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { erro: "Falha no serviço PIX" }
    );
  }
});

// Proxy para WhatsApp Service
app.post("/enviar-whatsapp", async (req, res) => {
  try {
    console.log('📤 Proxy WhatsApp: enviar-mensagem');
    const response = await axios.post(`${WHATSAPP_SERVICE_URL}/enviar-mensagem`, req.body, {
      timeout: 30000
    });
    res.json(response.data);
  } catch (error) {
    console.error('❌ Erro no proxy WhatsApp:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { erro: "Falha no serviço WhatsApp" }
    );
  }
});

app.get("/whatsapp-status", async (req, res) => {
  try {
    const response = await axios.get(`${WHATSAPP_SERVICE_URL}/whatsapp-status`, {
      timeout: 10000
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(
      error.response?.data || { erro: "Falha no serviço WhatsApp" }
    );
  }
});

app.get("/whatsapp-qr", async (req, res) => {
  try {
    const response = await axios.get(`${WHATSAPP_SERVICE_URL}/whatsapp-qr`, {
      timeout: 10000
    });
    res.send(response.data);
  } catch (error) {
    res.status(500).send('<h1>Erro ao acessar interface WhatsApp</h1><p>' + error.message + '</p>');
  }
});

// Endpoint integrado: Gerar PIX + Enviar WhatsApp
app.post("/gerar-pix-whatsapp", async (req, res) => {
  try {
    const { pagamento, numero, dataVencimento, evento, tag_evento, categoria } = req.body;
    
    console.log('🔗 Operação integrada: PIX + WhatsApp iniciada');

    if (!pagamento || !numero) {
      return res.status(400).json({
        erro: "Campos 'pagamento' e 'numero' são obrigatórios"
      });
    }

    // Responder imediatamente para evitar timeout
    res.status(200).json({
      status: "processando",
      message: "PIX sendo gerado e WhatsApp será enviado em seguida",
      timestamp: new Date().toISOString()
    });

    // Processar de forma assíncrona
    processarPixWhatsApp(pagamento, numero, dataVencimento, evento, tag_evento, categoria);

  } catch (error) {
    console.error("❌ Erro na operação integrada:", error.message);
    res.status(500).json({
      erro: "Falha na operação integrada",
      detalhes: error.message
    });
  }
});

// Função assíncrona para processar PIX + WhatsApp
async function processarPixWhatsApp(pagamento, numero, dataVencimento, evento, tag_evento, categoria) {
  try {
    console.log('🔄 Processando PIX...');
    
    // 1. Gerar PIX
    const pixEndpoint = dataVencimento ? '/gerar-pix-vencimento' : '/gerar-pix';
    const pixPayload = {
      pagamento,
      ...(dataVencimento && { dataVencimento }),
      ...(evento && { evento }),
      ...(tag_evento && { tag_evento }),
      ...(categoria && { categoria })
    };

    const pixResponse = await axios.post(`${PIX_SERVICE_URL}${pixEndpoint}`, pixPayload, {
      timeout: 30000
    });

    if (!pixResponse.data.sucesso) {
      throw new Error('Falha ao gerar PIX: ' + JSON.stringify(pixResponse.data));
    }

    console.log('✅ PIX gerado:', pixResponse.data.txid);

    // 2. Enviar WhatsApp
    console.log('🔄 Enviando WhatsApp...');
    
    const mensagem = `💰 *Informações de Pagamento PIX*

📋 *Dados do Pagamento:*
💵 Valor: R$ ${pixResponse.data.valor}
👤 Pagador: ${pixResponse.data.pagador}
🆔 ID: ${pixResponse.data.txid}
${pixResponse.data.dataVencimento ? `📅 Vencimento: ${pixResponse.data.dataVencimento}` : '⚡ Pagamento Imediato'}
${evento ? `🏷️ Evento: ${evento}` : ''}
${categoria ? `📂 Categoria: ${categoria}` : ''}

📱 *PIX Copia e Cola:*
\`${pixResponse.data.pixCopiaECola}\`

✅ Pagamento gerado com sucesso!
🏦 Via Sicredi PIX`;

    const whatsappResponse = await axios.post(`${WHATSAPP_SERVICE_URL}/enviar-mensagem`, {
      numero: numero,
      mensagem: mensagem
    }, {
      timeout: 30000
    });

    if (whatsappResponse.data.sucesso) {
      console.log('✅ WhatsApp enviado com sucesso para:', whatsappResponse.data.numero_formatado);
    } else {
      console.log('⚠️ Falha no envio WhatsApp:', whatsappResponse.data.erro);
    }

    console.log('🎉 Operação integrada PIX + WhatsApp concluída');

  } catch (error) {
    console.error('❌ Erro na operação integrada:', error.message);
  }
}

// Endpoint otimizado para AppSheet
app.post("/appsheet-whatsapp", async (req, res) => {
  try {
    const { pagamento, numero, evento, tag_evento, categoria } = req.body;
    
    console.log('📱 AppSheet WhatsApp request recebido');
    
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

// =====================================================
// INICIALIZAÇÃO
// =====================================================

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`
🚀 Gateway Service iniciado!
📍 Porta: ${PORT}
🌐 URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health

📋 Endpoints disponíveis:
   • POST /gerar-pix - Gerar PIX imediato (proxy)
   • POST /gerar-pix-vencimento - Gerar PIX com vencimento (proxy)
   • GET  /consultar-pix/:txid - Consultar PIX (proxy)
   • GET  /consultar-pix-vencimento/:txid - Consultar PIX vencimento (proxy)
   • POST /enviar-whatsapp - Enviar WhatsApp (proxy)
   • GET  /whatsapp-status - Status WhatsApp (proxy)
   • GET  /whatsapp-qr - Interface QR Code (proxy)
   • POST /gerar-pix-whatsapp - Operação integrada PIX + WhatsApp
   • POST /appsheet-whatsapp - Endpoint otimizado AppSheet
   • GET  /health - Health check combinado
   • GET  /ping - Ping
  `);
});