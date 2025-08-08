// Sistema Híbrido: WhatsApp Web + Business API + Simulação
const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Configurações
const PORT = process.env.PORT || 3001;
const PIX_SERVICE_URL = process.env.PIX_SERVICE_URL || 'http://localhost:3000';

// WhatsApp Business API (quando configurada)
const WHATSAPP_BUSINESS_TOKEN = process.env.WHATSAPP_BUSINESS_TOKEN || null;
const WHATSAPP_BUSINESS_PHONE_ID = process.env.WHATSAPP_BUSINESS_PHONE_ID || null;

// Configurações gerais
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const SIMULATE_MODE = process.env.SIMULATE_MODE === 'true';
const AUTO_FALLBACK = process.env.AUTO_FALLBACK === 'true';

// Variáveis globais para WhatsApp Web
let browser, page;
let whatsappWebStatus = "desconectado";
let qrCodeDataURL = null;
let lastStatusUpdate = new Date().toISOString();

console.log(`🚀 Inicializando WhatsApp Service Híbrido...`);
console.log(`📋 WhatsApp Web: ${WHATSAPP_ENABLED}`);
console.log(`📋 WhatsApp Business API: ${WHATSAPP_BUSINESS_TOKEN ? 'Configurado' : 'Não configurado'}`);
console.log(`📋 Modo Simulação: ${SIMULATE_MODE}`);

// Função para enviar via WhatsApp Business API
async function enviarViaBusinessAPI(numero, mensagem) {
  if (!WHATSAPP_BUSINESS_TOKEN || !WHATSAPP_BUSINESS_PHONE_ID) {
    throw new Error("WhatsApp Business API não configurada");
  }

  try {
    console.log(`📱 Enviando via WhatsApp Business API para ${numero}...`);
    
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;
    
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${WHATSAPP_BUSINESS_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: numeroCompleto,
        type: "text",
        text: { body: mensagem }
      },
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_BUSINESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.messages) {
      console.log(`✅ Mensagem enviada via Business API - ID: ${response.data.messages[0].id}`);
      return { 
        sucesso: true, 
        metodo: 'WhatsApp Business API',
        id_mensagem: response.data.messages[0].id,
        garantido: true
      };
    }

    throw new Error("Resposta inválida da Business API");

  } catch (error) {
    console.error(`❌ Erro Business API:`, error.response?.data || error.message);
    throw error;
  }
}

// Função para inicializar WhatsApp Web (código existente simplificado)
async function inicializarWhatsAppWeb() {
  if (!WHATSAPP_ENABLED || SIMULATE_MODE) {
    console.log("📱 WhatsApp Web desabilitado ou em simulação");
    whatsappWebStatus = "desabilitado";
    return;
  }

  try {
    console.log("🌐 Inicializando WhatsApp Web...");
    
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768'
      ]
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    // Anti-detecção básico
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });

    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle0' });
    await page.waitForTimeout(5000);

    // Verificar se há QR Code ou se já está logado
    const qrCanvas = await page.$('canvas[role="img"]').catch(() => null);
    
    if (qrCanvas) {
      console.log("📱 QR Code encontrado");
      const qrImage = await qrCanvas.screenshot({ encoding: 'base64' });
      qrCodeDataURL = `data:image/png;base64,${qrImage}`;
      whatsappWebStatus = "qr_code_disponivel";
      
      // Aguardar login
      await page.waitForSelector('[data-testid="chat-list"], #side', { timeout: 120000 });
      whatsappWebStatus = "conectado";
      console.log("✅ WhatsApp Web conectado!");
      
    } else {
      const chatList = await page.$('[data-testid="chat-list"], #side').catch(() => null);
      if (chatList) {
        whatsappWebStatus = "conectado";
        console.log("✅ WhatsApp Web já conectado!");
      } else {
        throw new Error("Não foi possível detectar QR Code nem chat list");
      }
    }

  } catch (error) {
    console.error("❌ Erro ao inicializar WhatsApp Web:", error.message);
    whatsappWebStatus = "erro";
  }

  lastStatusUpdate = new Date().toISOString();
}

// Função para enviar via WhatsApp Web (versão simplificada)
async function enviarViaWhatsAppWeb(numero, mensagem) {
  if (whatsappWebStatus !== "conectado") {
    throw new Error("WhatsApp Web não está conectado");
  }

  try {
    console.log(`📱 Tentando envio via WhatsApp Web para ${numero}...`);
    
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;
    const url = `https://web.whatsapp.com/send?phone=${numeroCompleto}&text=${encodeURIComponent(mensagem)}`;
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // Encontrar campo de entrada
    const inputField = await page.waitForSelector(
      'div[contenteditable="true"][role="textbox"]', 
      { timeout: 10000, visible: true }
    );
    
    if (!inputField) {
      throw new Error("Campo de entrada não encontrado");
    }
    
    // Digitar e enviar
    await inputField.click();
    await page.waitForTimeout(1000);
    
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.type(mensagem, { delay: 50 });
    await page.waitForTimeout(1000);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    
    // Verificar se foi enviado
    const msgTime = await page.$('[data-testid="msg-time"]').catch(() => null);
    if (msgTime) {
      console.log("✅ Mensagem enviada via WhatsApp Web com confirmação");
      return { sucesso: true, metodo: 'WhatsApp Web', confirmado: true };
    }
    
    console.log("⚠️ Mensagem enviada via WhatsApp Web sem confirmação");
    return { sucesso: true, metodo: 'WhatsApp Web', confirmado: false };
    
  } catch (error) {
    console.error(`❌ Erro WhatsApp Web:`, error.message);
    throw error;
  }
}

// Função principal híbrida para enviar mensagem
async function enviarMensagem(numero, mensagem) {
  const tentativas = [];
  
  // PRIORIDADE 1: WhatsApp Business API (se configurado)
  if (WHATSAPP_BUSINESS_TOKEN && WHATSAPP_BUSINESS_PHONE_ID) {
    try {
      const resultado = await enviarViaBusinessAPI(numero, mensagem);
      tentativas.push({ metodo: 'Business API', sucesso: true, resultado });
      console.log(`🎉 Sucesso via Business API!`);
      return resultado;
    } catch (error) {
      tentativas.push({ metodo: 'Business API', sucesso: false, erro: error.message });
      console.log(`⚠️ Business API falhou: ${error.message}`);
    }
  }
  
  // PRIORIDADE 2: WhatsApp Web (se disponível)
  if (whatsappWebStatus === "conectado") {
    try {
      const resultado = await enviarViaWhatsAppWeb(numero, mensagem);
      tentativas.push({ metodo: 'WhatsApp Web', sucesso: true, resultado });
      console.log(`🎉 Sucesso via WhatsApp Web!`);
      return resultado;
    } catch (error) {
      tentativas.push({ metodo: 'WhatsApp Web', sucesso: false, erro: error.message });
      console.log(`⚠️ WhatsApp Web falhou: ${error.message}`);
    }
  }
  
  // PRIORIDADE 3: Simulação (fallback)
  if (AUTO_FALLBACK || SIMULATE_MODE) {
    console.log(`🎭 Ativando simulação como fallback final`);
    console.log(`📱 Mensagem simulada para ${numero}:`);
    console.log(`📝 ${mensagem}`);
    
    tentativas.push({ metodo: 'Simulação', sucesso: true, resultado: { simulado: true } });
    return { 
      sucesso: true, 
      simulado: true, 
      metodo: 'Simulação',
      tentativas: tentativas
    };
  }
  
  // Se chegou aqui, falhou tudo
  throw new Error(`Todas as tentativas falharam: ${tentativas.map(t => `${t.metodo}: ${t.erro || 'OK'}`).join(', ')}`);
}

// Endpoints da API
app.get('/whatsapp-status', (req, res) => {
  res.json({
    status: whatsappWebStatus,
    web_connected: whatsappWebStatus === "conectado",
    business_api_configured: !!(WHATSAPP_BUSINESS_TOKEN && WHATSAPP_BUSINESS_PHONE_ID),
    simulate_mode: SIMULATE_MODE,
    timestamp: lastStatusUpdate,
    version: "hybrid-v1.0",
    methods_available: [
      WHATSAPP_BUSINESS_TOKEN ? 'Business API' : null,
      whatsappWebStatus === "conectado" ? 'WhatsApp Web' : null,
      'Simulação'
    ].filter(Boolean)
  });
});

app.get('/whatsapp-qr', (req, res) => {
  res.json({
    qr_code_data: qrCodeDataURL,
    available: qrCodeDataURL !== null,
    status: whatsappWebStatus
  });
});

app.post('/enviar-mensagem', async (req, res) => {
  try {
    const { numero, mensagem } = req.body;
    
    if (!numero || !mensagem) {
      return res.status(400).json({ erro: "Número e mensagem são obrigatórios" });
    }
    
    const resultado = await enviarMensagem(numero, mensagem);
    res.json({ sucesso: true, ...resultado });
    
  } catch (error) {
    console.error("❌ Erro no endpoint enviar-mensagem:", error.message);
    res.status(500).json({ erro: error.message });
  }
});

app.post('/processar-pix-whatsapp', async (req, res) => {
  try {
    console.log("📥 Payload recebido:", JSON.stringify(req.body, null, 2));
    
    let numero, pagamento, evento, tag_evento, categoria;
    
    // Detectar formato AppSheet
    if (req.body['Row ID'] || req.body['Pagador'] || req.body['Valor Pix']) {
      console.log("🔍 Formato AppSheet detectado - reformatando dados");
      
      numero = req.body.numero;
      pagamento = {
        'Row ID': req.body['Row ID'],
        'Pagador': req.body['Pagador'] || req.body.pagador,
        'Valor Pix': req.body['Valor Pix'] || req.body.valor,
        'Inscricao': req.body.cpf || req.body.inscricao
      };
      evento = req.body.evento;
      tag_evento = req.body.tag_evento;
      categoria = req.body.categoria;
    } else {
      numero = req.body.numero;
      pagamento = req.body.pagamento;
      evento = req.body.evento;
      tag_evento = req.body.tag_evento;
      categoria = req.body.categoria;
    }
    
    console.log("📋 Dados processados:", { numero, pagamento, evento, tag_evento, categoria });
    
    if (!numero || !pagamento) {
      return res.status(400).json({ erro: "Número e dados de pagamento são obrigatórios" });
    }
    
    // Gerar PIX
    console.log("🏦 Gerando PIX...");
    const pixResponse = await axios.post(`${PIX_SERVICE_URL}/gerar-pix`, { pagamento });
    
    if (!pixResponse.data.sucesso) {
      throw new Error(`Erro ao gerar PIX: ${pixResponse.data.erro}`);
    }
    
    const dadosPix = pixResponse.data;
    console.log(`✅ PIX gerado: ${dadosPix.txid}`);
    
    // Preparar mensagem WhatsApp
    const nomeEvento = evento || 'Igreja em Mossoró';
    const tagEvento = tag_evento ? ` #${tag_evento}` : '';
    const nomeCategoria = categoria ? ` - ${categoria}` : '';
    
    // Calcular data de expiração
    let dataExpiracao = '';
    if (dadosPix.dados_completos && dadosPix.dados_completos.calendario) {
      const expiracao = dadosPix.dados_completos.calendario.expiracao;
      if (typeof expiracao === 'number') {
        const criacaoDate = new Date(dadosPix.dados_completos.calendario.criacao);
        const expiracaoDate = new Date(criacaoDate.getTime() + (expiracao * 1000));
        dataExpiracao = expiracaoDate.toLocaleString('pt-BR');
      }
    }
    
    if (!dataExpiracao) {
      const agora = new Date();
      const expira = new Date(agora.getTime() + (7 * 24 * 60 * 60 * 1000));
      dataExpiracao = expira.toLocaleString('pt-BR');
    }
    
    const mensagemWhatsApp = `🎯 *${nomeEvento}*${tagEvento}${nomeCategoria}
    
👤 *Pagador:* ${pagamento.Pagador}
💰 *Valor:* R$ ${pagamento['Valor Pix']}
🔑 *ID:* ${pagamento['Row ID']}

📱 *PIX Copia e Cola:*
\`${dadosPix.pixCopiaECola}\`

✅ *Pague com seu banco:*
1️⃣ Abra seu app do banco
2️⃣ Escolha PIX
3️⃣ Cole o código acima
4️⃣ Confirme o pagamento

⏰ Válido até: ${dataExpiracao}

🙏 Igreja em Mossoró - Conectando Vidas ao Reino`;
    
    // Enviar WhatsApp com sistema híbrido
    console.log("📱 Enviando WhatsApp via sistema híbrido...");
    const whatsappResult = await enviarMensagem(numero, mensagemWhatsApp);
    
    console.log("✅ Processo completo PIX + WhatsApp finalizado");
    
    res.json({
      sucesso: true,
      pix: dadosPix,
      whatsapp: whatsappResult,
      metodo_usado: whatsappResult.metodo,
      garantido: whatsappResult.garantido || false,
      simulado: whatsappResult.simulado || false
    });
    
  } catch (error) {
    console.error("❌ Erro no processo PIX + WhatsApp:", error.message);
    res.status(500).json({ erro: error.message });
  }
});

// Página web
app.get('/whatsapp-auth', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Híbrido - Igreja em Mossoro</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #333;
        }
        .container {
            background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center; max-width: 500px; width: 90%;
        }
        .header { margin-bottom: 2rem; }
        .logo { font-size: 3rem; margin-bottom: 0.5rem; }
        h1 { color: #25D366; margin-bottom: 0.5rem; font-size: 1.8rem; }
        .subtitle { color: #666; font-size: 0.9rem; }
        .status { padding: 1rem; border-radius: 10px; margin: 1rem 0; font-weight: 500; }
        .status.connecting { background: #fff3cd; color: #856404; }
        .status.qr-ready { background: #d4edda; color: #155724; }
        .status.connected { background: #d1ecf1; color: #0c5460; }
        .status.business { background: #e7f3ff; color: #0056b3; }
        .status.error { background: #f8d7da; color: #721c24; }
        .methods { background: #f8f9fa; padding: 1rem; border-radius: 10px; margin: 1rem 0; }
        .methods h3 { color: #25D366; margin-bottom: 0.5rem; }
        .method { display: flex; justify-content: space-between; align-items: center; margin: 0.5rem 0; }
        .method .status-dot { width: 10px; height: 10px; border-radius: 50%; margin-left: 10px; }
        .status-dot.active { background: #28a745; }
        .status-dot.inactive { background: #dc3545; }
        .qr-container { margin: 1.5rem 0; display: none; }
        .qr-container.show { display: block; }
        .qr-code { max-width: 250px; border: 3px solid #25D366; border-radius: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🔄</div>
            <h1>WhatsApp Híbrido</h1>
            <div class="subtitle">Sistema Múltiplos Canais - Igreja em Mossoró</div>
        </div>
        
        <div id="status" class="status connecting">
            🔄 Verificando métodos disponíveis...
        </div>
        
        <div class="methods">
            <h3>📋 Métodos de Envio</h3>
            <div class="method">
                <span>WhatsApp Business API</span>
                <div id="business-dot" class="status-dot inactive"></div>
            </div>
            <div class="method">
                <span>WhatsApp Web</span>
                <div id="web-dot" class="status-dot inactive"></div>
            </div>
            <div class="method">
                <span>Simulação (Fallback)</span>
                <div id="sim-dot" class="status-dot active"></div>
            </div>
        </div>
        
        <div id="qr-container" class="qr-container">
            <img id="qr-code" class="qr-code" alt="QR Code WhatsApp Web" />
        </div>
    </div>
    
    <script>
        async function updateStatus() {
            try {
                const response = await fetch('/whatsapp-status');
                const data = await response.json();
                
                const statusDiv = document.getElementById('status');
                const qrContainer = document.getElementById('qr-container');
                const qrCode = document.getElementById('qr-code');
                
                const businessDot = document.getElementById('business-dot');
                const webDot = document.getElementById('web-dot');
                const simDot = document.getElementById('sim-dot');
                
                // Atualizar indicadores
                businessDot.className = \`status-dot \${data.business_api_configured ? 'active' : 'inactive'}\`;
                webDot.className = \`status-dot \${data.web_connected ? 'active' : 'inactive'}\`;
                simDot.className = 'status-dot active'; // Sempre ativo
                
                // Status principal
                if (data.business_api_configured) {
                    statusDiv.className = 'status business';
                    statusDiv.innerHTML = '🚀 WhatsApp Business API Ativo - Entrega Garantida!';
                    qrContainer.classList.remove('show');
                } else if (data.web_connected) {
                    statusDiv.className = 'status connected';
                    statusDiv.innerHTML = '✅ WhatsApp Web Conectado';
                    qrContainer.classList.remove('show');
                } else if (data.status === 'qr_code_disponivel') {
                    statusDiv.className = 'status qr-ready';
                    statusDiv.innerHTML = '📱 QR Code WhatsApp Web - Escaneie para conectar';
                    
                    const qrResponse = await fetch('/whatsapp-qr');
                    const qrData = await qrResponse.json();
                    
                    if (qrData.qr_code_data) {
                        qrCode.src = qrData.qr_code_data;
                        qrContainer.classList.add('show');
                    }
                } else {
                    statusDiv.className = 'status connecting';
                    statusDiv.innerHTML = '🔄 Sistema Híbrido - Simulação Ativa';
                    qrContainer.classList.remove('show');
                }
            } catch (error) {
                console.error('Erro:', error);
            }
        }
        
        updateStatus();
        setInterval(updateStatus, 3000);
    </script>
</body>
</html>
  `);
});

// Inicializar
if (WHATSAPP_ENABLED && !SIMULATE_MODE) {
  inicializarWhatsAppWeb();
} else {
  console.log("📱 WhatsApp Web desabilitado - usando Business API e/ou simulação");
  whatsappWebStatus = "desabilitado";
}

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service Híbrido rodando na porta ${PORT}`);
  console.log(`🌐 Página: http://localhost:${PORT}/whatsapp-auth`);
  console.log(`📋 Prioridades: ${WHATSAPP_BUSINESS_TOKEN ? '1) Business API → ' : ''}${WHATSAPP_ENABLED ? '2) WhatsApp Web → ' : ''}3) Simulação`);
});