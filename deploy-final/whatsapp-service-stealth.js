const express = require('express');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Variáveis globais
let browser, page;
let whatsappStatus = "desconectado";
let qrCodeDataURL = null;
let lastStatusUpdate = new Date().toISOString();

// Configurações
const PORT = process.env.PORT || 3001;
const PIX_SERVICE_URL = process.env.PIX_SERVICE_URL || 'http://localhost:3000';
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const SIMULATE_MODE = process.env.SIMULATE_MODE === 'true';
const AUTO_FALLBACK = process.env.AUTO_FALLBACK === 'true';

console.log(`🚀 Inicializando WhatsApp Service Stealth...`);
console.log(`📋 Configurações: ENABLED=${WHATSAPP_ENABLED}, DEBUG=${DEBUG_MODE}, SIMULATE=${SIMULATE_MODE}`);

// Função para inicializar WhatsApp Web com máxima stealth
async function inicializarWhatsApp() {
  try {
    console.log("🥷 Iniciando modo stealth extremo...");
    
    // Browser com configurações ultra-stealthed
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees,VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-component-extensions-with-background-pages',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-client-side-phishing-detection',
        '--disable-notifications',
        '--mute-audio',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      ]
    });

    const context = await browser.createIncognitoBrowserContext();
    page = await context.newPage();
    
    // Configurações stealth extremas
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
    });
    
    // Script anti-detecção ultra avançado
    await page.evaluateOnNewDocument(() => {
      // Remover TODAS as traces de automation
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }, { name: 'Native Client' }] });
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      
      // Chrome object real
      window.chrome = {
        runtime: {
          onConnect: null,
          onMessage: null,
          connect: () => ({ onMessage: {}, onDisconnect: {}, postMessage: () => {} }),
          sendMessage: () => {}
        },
        loadTimes: () => ({ commitLoadTime: Date.now(), finishDocumentLoadTime: Date.now() + 100 }),
        csi: () => ({ onloadT: Date.now(), pageT: Date.now() + 50 })
      };
      
      // Sobrescrever detecções
      delete window.navigator.__webdriver_script_fn;
      delete window.navigator.__webdriver_evaluate;
      delete window.navigator.__webdriver_unwrapped;
      delete window.navigator.__fxdriver_evaluate;
      delete window.navigator.__fxdriver_unwrapped;
      delete window.navigator.__driver_evaluate;
      delete window.navigator.__webdriver_evaluate__;
      delete window.navigator.__selenium_evaluate;
      delete window.navigator.__selenium_unwrapped;
      delete window.navigator.__fxdriver_evaluate__;
      
      // Permissions mock
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) => (
        params.name === 'notifications' ? 
        Promise.resolve({ state: 'default' }) : 
        originalQuery(params)
      );
      
      // WebGL fingerprint masking
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return 'Intel Inc.';
        if (parameter === 37446) return 'Intel(R) HD Graphics 620';
        return getParameter(parameter);
      };
      
      // Override toString methods
      window.Function.prototype.toString = new Proxy(window.Function.prototype.toString, {
        apply: function(target, thisArg, args) {
          if (thisArg === WebGLRenderingContext.prototype.getParameter) {
            return 'function getParameter() { [native code] }';
          }
          return target.apply(thisArg, args);
        }
      });
    });
    
    console.log("🌐 Navegando para WhatsApp Web de forma natural...");
    
    // Navegar de forma mais natural - primeiro Google, depois WhatsApp
    await page.goto('https://www.google.com', { waitUntil: 'networkidle0' });
    await page.waitForTimeout(2000 + Math.random() * 3000);
    
    // Simular busca por WhatsApp Web
    const searchBox = await page.$('input[name="q"]');
    if (searchBox) {
      await searchBox.click();
      await page.waitForTimeout(500);
      await searchBox.type('whatsapp web', { delay: 100 + Math.random() * 200 });
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      
      // Clicar no primeiro resultado
      const firstResult = await page.$('h3');
      if (firstResult) {
        await firstResult.click();
      } else {
        // Fallback: ir direto
        await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle0' });
      }
    } else {
      // Fallback: ir direto
      await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle0' });
    }
    
    console.log("📱 Aguardando carregamento da página...");
    await page.waitForTimeout(8000); // Aguardar mais tempo
    
    // Verificar QR Code ou login
    const qrCanvas = await page.$('canvas[role="img"], canvas[aria-label*="Scan"]').catch(() => null);
    const chatList = await page.$('[data-testid="chat-list"], #side').catch(() => null);
    
    if (qrCanvas) {
      console.log("📱 QR Code encontrado - capturando...");
      const qrImage = await qrCanvas.screenshot({ encoding: 'base64' });
      qrCodeDataURL = `data:image/png;base64,${qrImage}`;
      whatsappStatus = "qr_code_disponivel";
      
      console.log("⏳ Aguardando scan do QR Code...");
      await page.waitForSelector('[data-testid="chat-list"], #side', { timeout: 120000 });
      whatsappStatus = "conectado";
      console.log("✅ WhatsApp Web conectado!");
      
    } else if (chatList) {
      whatsappStatus = "conectado";
      console.log("✅ Já conectado ao WhatsApp Web!");
    } else {
      throw new Error("Não foi possível detectar QR Code nem chat list");
    }
    
    lastStatusUpdate = new Date().toISOString();
    
  } catch (error) {
    console.error("❌ Erro ao inicializar WhatsApp:", error.message);
    whatsappStatus = "erro";
    
    if (AUTO_FALLBACK) {
      console.log("🎭 Ativando modo simulação como fallback");
      whatsappStatus = "simulacao";
    }
    
    lastStatusUpdate = new Date().toISOString();
  }
}

// Função para enviar mensagem com máxima naturalidade
async function enviarMensagem(numero, mensagem) {
  if (!WHATSAPP_ENABLED) {
    console.log("📱 WhatsApp desabilitado - simulando envio");
    return { sucesso: true, simulado: true };
  }

  if (whatsappStatus === "simulacao" || SIMULATE_MODE) {
    console.log(`📱 Mensagem simulada para ${numero}:`);
    console.log(`📝 ${mensagem}`);
    return { sucesso: true, simulado: true };
  }

  if (whatsappStatus !== "conectado") {
    throw new Error("WhatsApp não está conectado");
  }

  try {
    console.log(`📱 Enviando mensagem para ${numero} de forma ultra natural...`);
    
    const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;
    
    // Método 1: Tentar API WhatsApp Web Store (mais natural)
    const storeResult = await page.evaluate(async (phone, msg) => {
      if (window.Store && window.Store.SendTextMessage && window.Store.Chat) {
        try {
          const chatId = phone + '@c.us';
          let chat = window.Store.Chat.get(chatId);
          
          if (!chat) {
            // Criar chat se não existir
            const contact = window.Store.Contact.get(chatId);
            if (contact) {
              chat = await window.Store.Chat.find(contact);
            }
          }
          
          if (chat) {
            await window.Store.SendTextMessage(chat, msg);
            return { sucesso: true, metodo: 'Store API' };
          }
        } catch (e) {
          return { sucesso: false, erro: e.message };
        }
      }
      return { sucesso: false, erro: 'Store não disponível' };
    }, numeroCompleto, mensagem);
    
    if (storeResult.sucesso) {
      console.log(`✅ Mensagem enviada via ${storeResult.metodo}`);
      
      // Verificar entrega
      await page.waitForTimeout(3000);
      const delivered = await page.$('[data-testid="msg-time"]').catch(() => null);
      if (delivered) {
        console.log("✅ Confirmação de entrega detectada");
        return { sucesso: true, entregue: true };
      }
      
      return { sucesso: true };
    }
    
    console.log("🔄 Store API falhou, usando método natural...");
    
    // Método 2: Navegação natural
    console.log("🌐 Navegando naturalmente para o chat...");
    
    // Ir para chat de forma mais natural
    await page.goto(`https://web.whatsapp.com/send?phone=${numeroCompleto}`, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Aguardar carregamento natural
    await page.waitForTimeout(5000 + Math.random() * 3000);
    
    // Procurar campo de entrada com paciência
    console.log("🔍 Localizando campo de mensagem...");
    
    const inputSelectors = [
      'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]'
    ];
    
    let inputField = null;
    for (const selector of inputSelectors) {
      inputField = await page.waitForSelector(selector, { 
        timeout: 10000, 
        visible: true 
      }).catch(() => null);
      
      if (inputField) {
        console.log(`✅ Campo encontrado: ${selector}`);
        break;
      }
    }
    
    if (!inputField) {
      throw new Error("Campo de entrada não encontrado");
    }
    
    // Envio ultra-humanizado
    console.log("🤖 Iniciando digitação ultra natural...");
    
    // Scroll suave até o campo
    await inputField.scrollIntoView({ behavior: 'smooth' });
    await page.waitForTimeout(1000 + Math.random() * 1000);
    
    // Movimento natural do mouse
    const box = await inputField.boundingBox();
    if (box) {
      // Simular movimento de mouse real com aceleração/desaceleração
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const easeProgress = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        
        const x = box.x + box.width / 2 + Math.sin(progress * Math.PI * 2) * 5;
        const y = box.y + box.height / 2 + Math.cos(progress * Math.PI * 3) * 3;
        
        await page.mouse.move(x, y);
        await page.waitForTimeout(20 + Math.random() * 30);
      }
    }
    
    // Clique natural
    await inputField.click();
    await page.waitForTimeout(800 + Math.random() * 400);
    
    // Limpar campo de forma natural
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
    
    // Digitação ultra natural
    const palavras = mensagem.split(' ');
    for (let i = 0; i < palavras.length; i++) {
      const palavra = palavras[i];
      
      // Digitar cada caractere com timing natural
      for (let j = 0; j < palavra.length; j++) {
        const char = palavra[j];
        
        // Timing baseado em padrões reais de digitação
        let delay = 80 + Math.random() * 120;
        if (char.match(/[aeiou]/i)) delay -= 20; // Vogais mais rápidas
        if (char.match(/[qwerty]/i)) delay += 30; // Teclas difíceis mais lentas
        if (j === 0) delay += 100; // Primeira letra da palavra
        
        await page.keyboard.type(char);
        await page.waitForTimeout(delay);
        
        // Pausas naturais ocasionais
        if (Math.random() < 0.05) {
          await page.waitForTimeout(300 + Math.random() * 500);
        }
      }
      
      // Espaço entre palavras
      if (i < palavras.length - 1) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(150 + Math.random() * 200);
      }
      
      // Pausa entre palavras ocasionalmente
      if (Math.random() < 0.15) {
        await page.waitForTimeout(400 + Math.random() * 600);
      }
    }
    
    // Pausa antes de enviar (simula leitura/revisão)
    await page.waitForTimeout(1000 + Math.random() * 2000);
    
    console.log("📤 Enviando mensagem...");
    
    // Enviar com múltiplos métodos
    let enviado = false;
    
    // Método 1: Enter
    try {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      
      // Verificar se enviou procurando por timestamp
      const msgTime = await page.$('[data-testid="msg-time"]', { timeout: 3000 }).catch(() => null);
      if (msgTime) {
        enviado = true;
        console.log("✅ Enviado via Enter");
      }
    } catch (e) {}
    
    // Método 2: Botão de envio
    if (!enviado) {
      try {
        const sendBtn = await page.$('button[data-testid="send"], [data-icon="send"]').catch(() => null);
        if (sendBtn) {
          await sendBtn.click();
          await page.waitForTimeout(2000);
          enviado = true;
          console.log("✅ Enviado via botão");
        }
      } catch (e) {}
    }
    
    // Método 3: JavaScript force
    if (!enviado) {
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('[data-testid="send"], [data-icon="send"], button[aria-label*="Send"], button[aria-label*="Enviar"]');
        if (buttons.length > 0) {
          buttons[buttons.length - 1].click();
        }
      });
      await page.waitForTimeout(1000);
      console.log("✅ Enviado via JavaScript");
    }
    
    // Aguardar e verificar entrega
    await page.waitForTimeout(3000);
    
    // Procurar indicadores de entrega
    const entregaIndicadores = await page.$$eval('[data-testid="msg-time"], .message-out .checkmark-out, [data-icon="msg-check"], [data-icon="msg-dblcheck"]', 
      elements => elements.length
    ).catch(() => 0);
    
    if (entregaIndicadores > 0) {
      console.log("✅ Indicadores de entrega encontrados");
      return { sucesso: true, entregue: true, indicadores: entregaIndicadores };
    }
    
    console.log("✅ Mensagem processada");
    return { sucesso: true };
    
  } catch (error) {
    console.error(`❌ Erro ao enviar para ${numero}:`, error.message);
    
    if (AUTO_FALLBACK) {
      console.log("🎭 Fallback para simulação");
      console.log(`📱 Mensagem simulada para ${numero}: ${mensagem}`);
      return { sucesso: true, simulado: true, fallback: true };
    }
    
    throw error;
  }
}

// Endpoints da API
app.get('/whatsapp-status', (req, res) => {
  res.json({
    status: whatsappStatus,
    connected: whatsappStatus === "conectado",
    simulate_mode: whatsappStatus === "simulacao" || SIMULATE_MODE,
    timestamp: lastStatusUpdate,
    version: "stealth-v1.0"
  });
});

app.get('/whatsapp-qr', (req, res) => {
  res.json({
    qr_code_data: qrCodeDataURL,
    available: qrCodeDataURL !== null,
    status: whatsappStatus
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
    
    console.log("📋 Resposta PIX:", JSON.stringify(pixResponse.data, null, 2));
    
    if (!pixResponse.data.sucesso) {
      throw new Error(`Erro ao gerar PIX: ${pixResponse.data.erro}`);
    }
    
    // A resposta já vem estruturada corretamente
    const dadosPix = pixResponse.data;
    if (!dadosPix || !dadosPix.txid) {
      console.error("❌ Estrutura de resposta PIX inválida:", pixResponse.data);
      throw new Error("Resposta do PIX Service em formato inválido");
    }
    
    console.log(`✅ PIX gerado: ${dadosPix.txid}`);
    
    // Preparar mensagem WhatsApp
    const nomeEvento = evento || 'Igreja em Mossoró';
    const tagEvento = tag_evento ? ` #${tag_evento}` : '';
    const nomeCategoria = categoria ? ` - ${categoria}` : '';
    
    // Calcular data de expiração - usar dados_completos se disponível
    let dataExpiracao = '';
    if (dadosPix.dados_completos && dadosPix.dados_completos.calendario) {
      const expiracao = dadosPix.dados_completos.calendario.expiracao;
      if (typeof expiracao === 'number') {
        // Se for número, é timestamp ou segundos desde criação
        const criacaoDate = new Date(dadosPix.dados_completos.calendario.criacao);
        const expiracaoDate = new Date(criacaoDate.getTime() + (expiracao * 1000));
        dataExpiracao = expiracaoDate.toLocaleString('pt-BR');
      } else if (expiracao) {
        // Se for string/date
        dataExpiracao = new Date(expiracao).toLocaleString('pt-BR');
      }
    }
    
    // Fallback para data de expiração
    if (!dataExpiracao) {
      const agora = new Date();
      const expira = new Date(agora.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 dias
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
    
    // Enviar WhatsApp
    console.log("📱 Enviando WhatsApp...");
    const whatsappResult = await enviarMensagem(numero, mensagemWhatsApp);
    
    console.log("✅ Processo completo PIX + WhatsApp finalizado");
    
    res.json({
      sucesso: true,
      pix: dadosPix,
      whatsapp: whatsappResult,
      simulado: whatsappResult.simulado || false
    });
    
  } catch (error) {
    console.error("❌ Erro no processo PIX + WhatsApp:", error.message);
    res.status(500).json({ erro: error.message });
  }
});

// Página web para QR Code
app.get('/whatsapp-auth', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Stealth - Igreja em Mossoro</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #333;
        }
        .container {
            background: white; border-radius: 20px; padding: 2rem; box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center; max-width: 450px; width: 90%;
        }
        .header { margin-bottom: 2rem; }
        .logo { font-size: 3rem; margin-bottom: 0.5rem; }
        h1 { color: #25D366; margin-bottom: 0.5rem; font-size: 1.8rem; }
        .subtitle { color: #666; font-size: 0.9rem; }
        .status { padding: 1rem; border-radius: 10px; margin: 1rem 0; font-weight: 500; }
        .status.connecting { background: #fff3cd; color: #856404; }
        .status.qr-ready { background: #d4edda; color: #155724; }
        .status.connected { background: #d1ecf1; color: #0c5460; }
        .status.error { background: #f8d7da; color: #721c24; }
        .qr-container { margin: 1.5rem 0; display: none; }
        .qr-container.show { display: block; }
        .qr-code { max-width: 250px; border: 3px solid #25D366; border-radius: 15px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); }
        .instructions { background: #f8f9fa; padding: 1.5rem; border-radius: 10px; margin: 1rem 0; text-align: left; }
        .instructions h3 { color: #25D366; margin-bottom: 1rem; text-align: center; }
        .instructions ol { padding-left: 1.2rem; }
        .instructions li { margin: 0.5rem 0; }
        .version { position: fixed; bottom: 10px; right: 10px; font-size: 0.7rem; color: rgba(255,255,255,0.7); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🥷</div>
            <h1>WhatsApp Stealth</h1>
            <div class="subtitle">Sistema Ultra Furtivo - Igreja em Mossoró</div>
        </div>
        
        <div id="status" class="status connecting">
            🔄 Verificando conexão...
        </div>
        
        <div id="qr-container" class="qr-container">
            <img id="qr-code" class="qr-code" alt="QR Code WhatsApp" />
        </div>
        
        <div class="instructions" id="instructions" style="display: none;">
            <h3>📱 Como Conectar</h3>
            <ol>
                <li>Abra o <strong>WhatsApp</strong> no seu celular</li>
                <li>Toque em <strong>⋮</strong> (menu) → <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li><strong>Escaneie o QR Code</strong> acima</li>
                <li>Aguarde a confirmação de conexão</li>
            </ol>
        </div>
    </div>
    
    <div class="version">Stealth v1.0</div>
    
    <script>
        async function updateStatus() {
            try {
                const response = await fetch('/whatsapp-status');
                const data = await response.json();
                
                const statusDiv = document.getElementById('status');
                const qrContainer = document.getElementById('qr-container');
                const qrCode = document.getElementById('qr-code');
                const instructions = document.getElementById('instructions');
                
                if (data.status === 'conectado') {
                    statusDiv.className = 'status connected';
                    statusDiv.innerHTML = '✅ WhatsApp Conectado - Sistema Ativo!';
                    qrContainer.classList.remove('show');
                    instructions.style.display = 'none';
                } else if (data.status === 'qr_code_disponivel') {
                    statusDiv.className = 'status qr-ready';
                    statusDiv.innerHTML = '📱 QR Code Disponível - Escaneie para conectar';
                    
                    const qrResponse = await fetch('/whatsapp-qr');
                    const qrData = await qrResponse.json();
                    
                    if (qrData.qr_code_data) {
                        qrCode.src = qrData.qr_code_data;
                        qrContainer.classList.add('show');
                        instructions.style.display = 'block';
                    }
                } else if (data.status === 'simulacao') {
                    statusDiv.className = 'status connecting';
                    statusDiv.innerHTML = '🎭 Modo Simulação Ativo';
                    qrContainer.classList.remove('show');
                    instructions.style.display = 'none';
                } else if (data.status === 'erro') {
                    statusDiv.className = 'status error';
                    statusDiv.innerHTML = '❌ Erro de Conexão - Reiniciando...';
                    qrContainer.classList.remove('show');
                    instructions.style.display = 'none';
                } else {
                    statusDiv.className = 'status connecting';
                    statusDiv.innerHTML = '🔄 Conectando modo stealth...';
                    qrContainer.classList.remove('show');
                    instructions.style.display = 'none';
                }
            } catch (error) {
                console.error('Erro ao atualizar status:', error);
                const statusDiv = document.getElementById('status');
                statusDiv.className = 'status error';
                statusDiv.innerHTML = '❌ Erro de comunicação';
            }
        }
        
        // Atualizar status imediatamente e a cada 3 segundos
        updateStatus();
        setInterval(updateStatus, 3000);
    </script>
</body>
</html>
  `);
});

// Inicializar servidor
if (WHATSAPP_ENABLED) {
  inicializarWhatsApp().then(() => {
    console.log("🥷 WhatsApp Stealth inicializado");
  });
} else {
  console.log("📱 WhatsApp desabilitado - modo simulação ativo");
  whatsappStatus = "simulacao";
}

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Service Stealth rodando na porta ${PORT}`);
  console.log(`🌐 Página QR Code: http://localhost:${PORT}/whatsapp-auth`);
});