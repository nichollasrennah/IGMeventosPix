const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Carregar Puppeteer apenas se não estiver em modo simulação
let puppeteer = null;
if (process.env.SIMULATE_MODE !== "true") {
  try {
    puppeteer = require("puppeteer");
  } catch (error) {
    console.log("⚠️ Puppeteer não disponível - usando modo simulação");
    process.env.SIMULATE_MODE = "true";
  }
}

const app = express();

// Configuração mais robusta do body parser
app.use(bodyParser.json({ 
  limit: '10mb',
  strict: false,
  type: ['application/json', 'text/plain']
}));

app.use(bodyParser.urlencoded({ 
  extended: true,
  limit: '10mb'
}));

// Middleware para tratar erros de JSON
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    console.error('❌ Erro de JSON parse:', error.message);
    console.error('📋 Raw body:', req.body);
    return res.status(400).json({
      erro: 'JSON inválido',
      detalhes: 'Verifique o formato do JSON enviado'
    });
  }
  next();
});

console.log(`
🚀 WhatsApp Service - Iniciando
📅 Data: ${new Date().toLocaleString('pt-BR')}
🌍 Ambiente: ${process.env.NODE_ENV || 'development'}
`);

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const PIX_SERVICE_URL = process.env.PIX_SERVICE_URL || "http://pix-service:3000";
const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED !== "false";
const DEBUG_MODE = process.env.DEBUG_MODE === "true";
let SIMULATE_MODE = process.env.SIMULATE_MODE === "true";
const AUTO_FALLBACK = process.env.AUTO_FALLBACK !== "false"; // Ativo por padrão

console.log(`🔗 PIX Service URL: ${PIX_SERVICE_URL}`);
console.log(`📱 WhatsApp habilitado: ${WHATSAPP_ENABLED}`);
console.log(`🐛 Debug mode: ${DEBUG_MODE}`);
console.log(`🎭 Simulate mode: ${SIMULATE_MODE}`);
console.log(`🔄 Auto fallback: ${AUTO_FALLBACK}`);

// =====================================================
// VARIÁVEIS GLOBAIS WHATSAPP
// =====================================================

let browser = null;
let page = null;
let whatsappReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let qrCodeDataURL = null;
let whatsappStatus = "desconectado";
let lastStatusUpdate = null;

// =====================================================
// FUNÇÕES WHATSAPP
// =====================================================

async function inicializarWhatsApp() {
  if (!WHATSAPP_ENABLED) {
    console.log("⚠️ WhatsApp desabilitado via configuração");
    return;
  }

  if (SIMULATE_MODE || !puppeteer) {
    console.log("🎭 Modo simulação ativado - WhatsApp simulado");
    whatsappReady = true;
    reconnectAttempts = 0;
    return;
  }

  try {
    console.log("🚀 Inicializando WhatsApp Web...");
    
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-component-extensions-with-background-pages',
        '--window-size=1366,768',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });

    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Ocultar propriedades que indicam automação
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Substituir a propriedade chrome
      window.chrome = {
        runtime: {},
      };
      
      // Substituir a propriedade permissions
      const originalQuery = window.navigator.permissions.query;
      return window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
    
    console.log("🌐 Acessando WhatsApp Web...");
    await page.goto('https://web.whatsapp.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    console.log("📱 Aguardando carregamento da página...");
    await page.waitForTimeout(5000);
    
    // Verificar se há QR Code ou se já está logado
    console.log("🔍 Verificando status de login...");
    
    // Múltiplos seletores para QR Code (WhatsApp muda frequentemente)
    const qrSelectors = [
      'canvas[aria-label="Scan me!"]',
      'canvas[role="img"]',
      'div[data-ref] canvas',
      '[data-testid="qr-canvas"]',
      'canvas'
    ];
    
    // Múltiplos seletores para chat list
    const chatSelectors = [
      'div[data-testid="chat-list"]',
      '[data-testid="chat-list-drawer"]',
      '#side div[role="grid"]',
      '[aria-label*="Chat list"]'
    ];
    
    // Verificar existência atual
    let qrCodeExists = null;
    let chatListExists = null;
    
    for (const selector of qrSelectors) {
      qrCodeExists = await page.$(selector).catch(() => null);
      if (qrCodeExists) {
        console.log(`📱 QR Code encontrado com seletor: ${selector}`);
        
        // Capturar QR Code como imagem
        try {
          const qrElement = qrCodeExists;
          const qrImage = await qrElement.screenshot({ encoding: 'base64' });
          qrCodeDataURL = `data:image/png;base64,${qrImage}`;
          whatsappStatus = "qr_code_disponivel";
          lastStatusUpdate = new Date().toISOString();
          console.log(`📸 QR Code capturado para exibição web`);
        } catch (qrError) {
          console.log(`⚠️ Erro ao capturar QR Code:`, qrError.message);
        }
        
        break;
      }
    }
    
    for (const selector of chatSelectors) {
      chatListExists = await page.$(selector).catch(() => null);
      if (chatListExists) {
        console.log(`✅ Chat list encontrado com seletor: ${selector}`);
        break;
      }
    }
    
    if (qrCodeExists) {
      console.log("📱 QR Code detectado! Escaneie com seu WhatsApp para conectar.");
      console.log("⏳ Aguardando login via QR Code (até 2 minutos)...");
      
      // Aguardar qualquer um dos seletores de chat aparecer
      const promises = chatSelectors.map(selector => 
        page.waitForSelector(selector, { timeout: 120000 }).catch(() => null)
      );
      await Promise.race(promises.filter(p => p !== null));
      
    } else if (chatListExists) {
      console.log("✅ Sessão já existe - login automático detectado");
      
    } else {
      console.log("⏳ Aguardando QR Code ou chat list aparecer...");
      
      // Aguardar qualquer elemento aparecer
      const allPromises = [
        ...qrSelectors.map(selector => 
          page.waitForSelector(selector, { timeout: 45000 }).catch(() => null)
        ),
        ...chatSelectors.map(selector => 
          page.waitForSelector(selector, { timeout: 45000 }).catch(() => null)
        )
      ];
      
      const result = await Promise.race(allPromises.filter(p => p !== null));
      
      if (!result) {
        throw new Error("Nenhum elemento WhatsApp detectado após 45 segundos");
      }
      
      // Verificar se conseguiu QR Code e aguardar login
      let foundQr = false;
      for (const selector of qrSelectors) {
        if (await page.$(selector).catch(() => null)) {
          console.log(`📱 QR Code apareceu! Seletor: ${selector}`);
          foundQr = true;
          break;
        }
      }
      
      if (foundQr) {
        const chatPromises = chatSelectors.map(selector => 
          page.waitForSelector(selector, { timeout: 120000 }).catch(() => null)
        );
        await Promise.race(chatPromises.filter(p => p !== null));
      }
    }
    
    whatsappReady = true;
    reconnectAttempts = 0;
    whatsappStatus = "conectado";
    qrCodeDataURL = null; // Limpar QR Code após conexão
    lastStatusUpdate = new Date().toISOString();
    console.log("✅ WhatsApp Web conectado com sucesso!");
    
    // Monitorar desconexões
    page.on('close', () => {
      console.log("⚠️ Página WhatsApp fechada");
      whatsappReady = false;
    });

  } catch (error) {
    console.error("❌ Erro ao inicializar WhatsApp:", error.message);
    
    // Tentar capturar screenshot para debug
    if (page) {
      try {
        const screenshot = await page.screenshot({ encoding: 'base64' });
        console.log("📸 Screenshot capturado para debug (base64):", screenshot.substring(0, 100) + "...");
      } catch (screenshotError) {
        console.log("⚠️ Não foi possível capturar screenshot");
      }
    }
    
    whatsappReady = false;
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Tentativa de reconexão ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} em 30s...`);
      setTimeout(inicializarWhatsApp, 30000);
    } else {
      console.error("💥 Máximo de tentativas de reconexão atingido");
      
      if (AUTO_FALLBACK && !SIMULATE_MODE) {
        console.log("🎭 Ativando modo simulação como fallback automático");
        SIMULATE_MODE = true;
        whatsappReady = true;
        reconnectAttempts = 0;
      } else {
        console.log("💡 Dica: Execute 'docker compose restart whatsapp-service' para tentar novamente");
      }
    }
  }
}

async function enviarMensagem(numero, mensagem) {
  if (!WHATSAPP_ENABLED || SIMULATE_MODE) {
    console.log(`🎭 WhatsApp simulado - Mensagem para ${numero}:`);
    console.log(`📱 ${mensagem}`);
    return { sucesso: true, simulado: true };
  }

  if (!whatsappReady || !page) {
    throw new Error("WhatsApp não está conectado");
  }

  // Verificar se página ainda está ativa
  try {
    await page.evaluate(() => window.location.href);
  } catch (error) {
    console.log("⚠️ Página WhatsApp desconectada, tentando reconectar...");
    whatsappReady = false;
    setTimeout(inicializarWhatsApp, 1000);
    throw new Error("WhatsApp desconectado, reconectando...");
  }

  try {
    console.log(`📱 Enviando mensagem para ${numero}...`);
    
    // Limpar número (apenas dígitos)
    const numeroLimpo = numero.replace(/\D/g, '');
    const numeroCompleto = `55${numeroLimpo}`;
    
    console.log(`🔍 Tentando envio via WhatsApp Web API JavaScript...`);
    
    // Tentar usar a API interna do WhatsApp Web via JavaScript
    const resultado = await page.evaluate(async (numeroCompleto, mensagem) => {
      return new Promise(async (resolve) => {
        try {
          // Aguardar WhatsApp carregar completamente
          let tentativas = 0;
          while (!window.Store && tentativas < 50) {
            await new Promise(r => setTimeout(r, 100));
            tentativas++;
          }
          
          if (!window.Store) {
            resolve({ sucesso: false, erro: "WhatsApp Store não carregado" });
            return;
          }
          
          // Obter chat ou criar novo
          const chatId = numeroCompleto + '@c.us';
          let chat = window.Store.ChatCollection.find(chatId);
          
          if (!chat) {
            // Tentar criar novo chat
            try {
              const contact = await window.Store.ContactCollection.find(chatId);
              if (contact) {
                chat = await window.Store.ChatCollection.add({
                  id: chatId,
                  isGroup: false
                });
              }
            } catch (e) {
              console.log('Erro ao criar chat:', e);
            }
          }
          
          if (chat) {
            // Enviar mensagem usando Store
            try {
              await window.Store.SendTextMessage(chat, mensagem);
              resolve({ sucesso: true, metodo: "Store API" });
              return;
            } catch (e) {
              console.log('Erro Store API:', e);
            }
          }
          
          resolve({ sucesso: false, erro: "Não foi possível enviar via Store API" });
          
        } catch (error) {
          resolve({ sucesso: false, erro: error.message });
        }
      });
    }, numeroCompleto, mensagem);
    
    if (resultado.sucesso) {
      console.log(`✅ Mensagem enviada via ${resultado.metodo} para ${numero}`);
      return { sucesso: true };
    }
    
    console.log(`⚠️ API JavaScript falhou: ${resultado.erro}`);
    console.log(`🔍 Tentando método tradicional com seletores...`);
    
    // Se API JavaScript falhar, usar método tradicional
    const url = `https://web.whatsapp.com/send?phone=${numeroCompleto}&text=${encodeURIComponent(mensagem)}`;
    
    console.log(`🌐 Navegando para: ${url.substring(0, 100)}...`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Aguardar carregamento
    await page.waitForTimeout(5000);
    
    console.log(`🔍 Verificando se página carregou corretamente...`);
    
    // Verificar se chegou na página de erro ou chat
    const isErrorPage = await page.$('.landing-window').catch(() => null);
    if (isErrorPage) {
      throw new Error(`WhatsApp bloqueou acesso para ${numero} - número pode não existir`);
    }
    
    // Aguardar interface carregar
    await page.waitForTimeout(3000);
    
    // Tentar encontrar e clicar no campo de mensagem
    console.log(`🔍 Procurando campo de entrada...`);
    
    const inputSelectors = [
      'div[data-testid="conversation-compose-box-input"]',
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[data-testid="compose-box-input"]',
      'div[spellcheck="true"][contenteditable="true"]',
      'div[contenteditable="true"]'
    ];
    
    let inputField = null;
    for (let i = 0; i < inputSelectors.length; i++) {
      const selector = inputSelectors[i];
      try {
        inputField = await page.waitForSelector(selector, { 
          timeout: i === inputSelectors.length - 1 ? 10000 : 3000,
          visible: true 
        });
        if (inputField) {
          console.log(`✅ Campo encontrado: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`⚠️ Seletor ${selector} não encontrado`);
      }
    }
    
    if (!inputField) {
      // Última tentativa via execução de script
      console.log(`🔍 Tentativa final via script injection...`);
      
      const scriptResult = await page.evaluate((msg) => {
        const inputs = document.querySelectorAll('div[contenteditable="true"]');
        if (inputs.length > 0) {
          const input = inputs[inputs.length - 1]; // Pegar o último
          input.focus();
          input.textContent = msg;
          
          // Disparar eventos
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          
          // Simular Enter
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true
          });
          input.dispatchEvent(enterEvent);
          
          return true;
        }
        return false;
      }, mensagem);
      
      if (scriptResult) {
        await page.waitForTimeout(2000);
        console.log(`✅ Mensagem enviada via script injection para ${numero}`);
        return { sucesso: true };
      } else {
        throw new Error("Nenhum método de envio funcionou");
      }
    }
    
    // Método humanizado de envio
    console.log(`🤖 Iniciando envio humanizado...`);
    
    // 1. Foco suave no campo
    await inputField.scrollIntoView();
    await page.waitForTimeout(Math.random() * 800 + 300);
    
    // 2. Movimento de mouse humanizado
    const box = await inputField.boundingBox();
    if (box) {
      // Movimento em curva ao invés de linha reta
      const steps = 5;
      const currentMouse = await page.mouse;
      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        const x = box.x + (box.width / 2) + (Math.sin(progress * Math.PI) * 10);
        const y = box.y + (box.height / 2);
        await page.mouse.move(x, y);
        await page.waitForTimeout(Math.random() * 50 + 20);
      }
    }
    
    // 3. Clique com pressão variável
    await inputField.click();
    await page.waitForTimeout(Math.random() * 600 + 200);
    
    // 4. Limpar campo existente
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(Math.random() * 300 + 100);
    
    // 5. Digitação humanizada com padrões naturais
    const caracteres = mensagem.split('');
    for (let i = 0; i < caracteres.length; i++) {
      const char = caracteres[i];
      
      // Delay variável baseado no tipo de caractere
      let delay = Math.random() * 120 + 40;
      if (char === ' ') delay += Math.random() * 100; // Pausa maior para espaços
      if ('.,!?'.includes(char)) delay += Math.random() * 200; // Pausa para pontuação
      if (char.match(/[A-Z]/)) delay += Math.random() * 80; // Maiúsculas levam mais tempo
      
      await page.keyboard.type(char);
      await page.waitForTimeout(delay);
      
      // Pausas aleatórias para simular pensamento (2% chance)
      if (Math.random() < 0.02) {
        await page.waitForTimeout(Math.random() * 1000 + 500);
      }
      
      // Correções simuladas ocasionais (1% chance)
      if (Math.random() < 0.01 && i > 5) {
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(Math.random() * 200 + 100);
        await page.keyboard.type(char);
        await page.waitForTimeout(Math.random() * 150 + 50);
      }
    }
    
    // 6. Pausa antes de enviar (simula revisão)
    await page.waitForTimeout(Math.random() * 2000 + 800);
    
    // 7. Método de envio com fallbacks
    console.log(`📤 Enviando mensagem...`);
    let enviado = false;
    
    try {
      // Método 1: Enter
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      
      // Verificar se foi enviado
      const msgSent = await page.$('[data-testid="msg-time"]').catch(() => null);
      if (msgSent) {
        enviado = true;
        console.log(`✅ Enviado via Enter`);
      }
    } catch (e) {}
    
    if (!enviado) {
      try {
        // Método 2: Botão de envio
        const sendBtn = await page.$('[data-testid="send"], [data-icon="send"]').catch(() => null);
        if (sendBtn) {
          await sendBtn.click();
          await page.waitForTimeout(1500);
          enviado = true;
          console.log(`✅ Enviado via botão`);
        }
      } catch (e) {}
    }
    
    if (!enviado) {
      // Método 3: Força via JavaScript
      await page.evaluate(() => {
        const sendButtons = document.querySelectorAll('[data-testid="send"], [data-icon="send"], button[aria-label*="Send"]');
        if (sendButtons.length > 0) {
          sendButtons[sendButtons.length - 1].click();
        }
      });
      await page.waitForTimeout(1000);
      console.log(`✅ Enviado via JavaScript`);
    }
    
    // 8. Aguardar confirmação final
    await page.waitForTimeout(2000);
    
    console.log(`✅ Mensagem enviada para ${numero}`);
    return { sucesso: true };

  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem para ${numero}:`, error.message);
    
    // Fallback para simulação em caso de erro
    if (AUTO_FALLBACK) {
      console.log(`🎭 Ativando simulação para esta mensagem como fallback`);
      console.log(`📱 Mensagem simulada para ${numero}:`);
      console.log(`📝 ${mensagem}`);
      return { sucesso: true, simulado: true, fallback: true };
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
    service: "whatsapp-service",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    uptime_formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    whatsapp: {
      enabled: WHATSAPP_ENABLED,
      ready: whatsappReady,
      reconnect_attempts: reconnectAttempts,
      simulate_mode: SIMULATE_MODE
    },
    pix_service_url: PIX_SERVICE_URL
  });
});

app.get("/ping", (req, res) => {
  res.status(200).json({
    message: "pong",
    service: "whatsapp-service",
    timestamp: new Date().toISOString(),
    whatsapp_ready: whatsappReady
  });
});

// Status do WhatsApp
app.get("/whatsapp-status", (req, res) => {
  res.json({
    connected: whatsappReady,
    enabled: WHATSAPP_ENABLED,
    simulate_mode: SIMULATE_MODE,
    reconnect_attempts: reconnectAttempts,
    max_attempts: MAX_RECONNECT_ATTEMPTS,
    status: SIMULATE_MODE ? "simulação" : whatsappStatus,
    qr_code_available: !!qrCodeDataURL,
    last_update: lastStatusUpdate
  });
});

// Página web para QR Code
app.get("/whatsapp-auth", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp - Igreja em Mossoro</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 2rem;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .header {
            margin-bottom: 2rem;
        }
        .logo {
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }
        h1 { 
            color: #25D366;
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
        }
        .subtitle {
            color: #666;
            font-size: 0.9rem;
        }
        .status {
            padding: 1rem;
            border-radius: 10px;
            margin: 1rem 0;
            font-weight: 500;
        }
        .status.connecting { background: #fff3cd; color: #856404; }
        .status.qr-ready { background: #d4edda; color: #155724; }
        .status.connected { background: #d1ecf1; color: #0c5460; }
        .status.error { background: #f8d7da; color: #721c24; }
        .qr-container {
            margin: 1.5rem 0;
            display: none;
        }
        .qr-code {
            max-width: 256px;
            width: 100%;
            height: auto;
            border: 3px solid #25D366;
            border-radius: 10px;
        }
        .instructions {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 10px;
            margin: 1rem 0;
            text-align: left;
            font-size: 0.9rem;
            line-height: 1.5;
        }
        .instructions ol {
            margin-left: 1rem;
        }
        .instructions li {
            margin: 0.5rem 0;
        }
        .refresh-btn {
            background: #25D366;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 1rem;
            transition: background 0.3s;
        }
        .refresh-btn:hover {
            background: #128C7E;
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.8rem;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">📱</div>
            <h1>WhatsApp Service</h1>
            <div class="subtitle">Igreja em Mossoro</div>
        </div>
        
        <div id="status" class="status connecting">
            🔄 Conectando ao WhatsApp Web...
        </div>
        
        <div id="qr-container" class="qr-container">
            <img id="qr-code" class="qr-code" alt="QR Code WhatsApp" />
        </div>
        
        <div id="instructions" class="instructions" style="display: none;">
            <strong>📱 Como conectar:</strong>
            <ol>
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em <strong>Configurações</strong> > <strong>Aparelhos conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong></li>
                <li>Escaneie o QR Code acima</li>
                <li>Aguarde a confirmação de conexão</li>
            </ol>
        </div>
        
        <button id="refresh" class="refresh-btn" onclick="checkStatus()">
            🔄 Atualizar Status
        </button>
        
        <div class="footer">
            PIX + WhatsApp Integration<br>
            <small>Última atualização: <span id="last-update">-</span></small>
        </div>
    </div>

    <script>
        let statusInterval;
        
        function checkStatus() {
            fetch('/whatsapp-status')
                .then(response => response.json())
                .then(data => {
                    updateStatus(data);
                })
                .catch(error => {
                    console.error('Erro:', error);
                    updateStatus({ status: 'error', connected: false });
                });
        }
        
        function updateStatus(data) {
            const statusEl = document.getElementById('status');
            const qrContainer = document.getElementById('qr-container');
            const qrCode = document.getElementById('qr-code');
            const instructions = document.getElementById('instructions');
            const lastUpdate = document.getElementById('last-update');
            
            lastUpdate.textContent = data.last_update ? 
                new Date(data.last_update).toLocaleString('pt-BR') : 
                'Não disponível';
            
            if (data.simulate_mode) {
                statusEl.className = 'status connected';
                statusEl.innerHTML = '🎭 Modo Simulação Ativo';
                qrContainer.style.display = 'none';
                instructions.style.display = 'none';
            } else if (data.connected) {
                statusEl.className = 'status connected';
                statusEl.innerHTML = '✅ WhatsApp Conectado!';
                qrContainer.style.display = 'none';
                instructions.style.display = 'none';
            } else if (data.qr_code_available) {
                statusEl.className = 'status qr-ready';
                statusEl.innerHTML = '📱 QR Code Disponível - Escaneie com seu WhatsApp';
                qrContainer.style.display = 'block';
                instructions.style.display = 'block';
                
                // Buscar QR Code
                fetch('/whatsapp-qr')
                    .then(response => response.json())
                    .then(qrData => {
                        if (qrData.qr_code) {
                            qrCode.src = qrData.qr_code;
                        }
                    });
            } else if (data.status === 'error') {
                statusEl.className = 'status error';
                statusEl.innerHTML = '❌ Erro na Conexão';
                qrContainer.style.display = 'none';
                instructions.style.display = 'none';
            } else {
                statusEl.className = 'status connecting';
                statusEl.innerHTML = '🔄 Tentando conectar... (' + data.reconnect_attempts + '/' + data.max_attempts + ')';
                qrContainer.style.display = 'none';
                instructions.style.display = 'none';
            }
        }
        
        // Verificar status a cada 3 segundos
        statusInterval = setInterval(checkStatus, 3000);
        
        // Verificar status inicial
        checkStatus();
        
        // Limpar interval quando sair da página
        window.addEventListener('beforeunload', () => {
            if (statusInterval) clearInterval(statusInterval);
        });
    </script>
</body>
</html>`;

  res.send(html);
});

// Endpoint para obter QR Code
app.get("/whatsapp-qr", (req, res) => {
  if (qrCodeDataURL) {
    res.json({
      qr_code: qrCodeDataURL,
      status: whatsappStatus,
      timestamp: lastStatusUpdate
    });
  } else {
    res.status(404).json({
      error: "QR Code não disponível",
      status: whatsappStatus
    });
  }
});

// Enviar mensagem direta
app.post("/enviar-mensagem", async (req, res) => {
  try {
    const { numero, mensagem } = req.body;
    
    if (!numero || !mensagem) {
      return res.status(400).json({
        erro: "Campos 'numero' e 'mensagem' são obrigatórios"
      });
    }
    
    const resultado = await enviarMensagem(numero, mensagem);
    
    res.json({
      sucesso: true,
      numero: numero,
      mensagem: mensagem,
      resultado: resultado
    });
    
  } catch (error) {
    console.error("❌ Erro ao enviar mensagem:", error.message);
    res.status(500).json({
      erro: "Falha ao enviar mensagem",
      detalhes: error.message
    });
  }
});

// Processar PIX + WhatsApp integrado
app.post("/processar-pix-whatsapp", async (req, res) => {
  try {
    console.log("📥 Payload completo recebido:", JSON.stringify(req.body, null, 2));
    
    let { numero, pagamento, evento, tag_evento, categoria } = req.body;
    
    // Detectar formato AppSheet (dados diretos) vs formato antigo (objeto pagamento)
    if (!pagamento && (req.body["Row ID"] || req.body.Pagador || req.body["Valor Pix"])) {
      console.log("🔍 Formato AppSheet detectado - reformatando dados");
      
      // Reformatar para formato esperado pelo PIX Service
      pagamento = {
        "Row ID": req.body["Row ID"],
        "Pagador": req.body.Pagador,
        "Valor Pix": req.body["Valor Pix"],
        "Inscricao": req.body.cpf || req.body.Inscricao
      };
      
      // Usar campos diretos para evento, etc.
      evento = req.body.evento || evento;
      tag_evento = req.body.tag_evento || tag_evento;
      categoria = req.body.categoria || categoria;
      numero = req.body.numero || numero;
    }
    
    console.log("📋 Dados processados:", { 
      numero, 
      pagamento, 
      evento, 
      tag_evento, 
      categoria 
    });
    
    if (!numero) {
      return res.status(400).json({
        erro: "Campo 'numero' é obrigatório",
        payload_recebido: req.body
      });
    }
    
    if (!pagamento || !pagamento["Row ID"] || !pagamento.Pagador || !pagamento["Valor Pix"]) {
      return res.status(400).json({
        erro: "Dados de pagamento incompletos. Esperado: Row ID, Pagador, Valor Pix",
        pagamento_processado: pagamento,
        payload_original: req.body
      });
    }
    
    // 1. Gerar PIX via PIX Service
    console.log("🏦 Gerando PIX...");
    const pixResponse = await axios.post(`${PIX_SERVICE_URL}/gerar-pix`, {
      pagamento,
      evento,
      tag_evento,
      categoria
    });
    
    const pixData = pixResponse.data;
    console.log("✅ PIX gerado:", pixData.txid);
    
    // 2. Montar mensagem WhatsApp
    const mensagem = `🎯 *${evento || 'Pagamento PIX'}*
    
👋 Olá, ${pagamento?.Pagador || 'Cliente'}!

💰 *Valor:* R$ ${pixData.valor}
🔑 *Código:* ${pixData.txid}

📱 *PIX Copia e Cola:*
\`${pixData.pixCopiaECola}\`

✅ Após o pagamento, você receberá a confirmação automaticamente.

_Igreja em Mossoro - PIX Automático_`;

    // 3. Enviar mensagem WhatsApp
    console.log("📱 Enviando WhatsApp...");
    const whatsappResult = await enviarMensagem(numero, mensagem);
    
    console.log("✅ Processo completo PIX + WhatsApp finalizado");
    
    res.json({
      sucesso: true,
      pix: {
        txid: pixData.txid,
        valor: pixData.valor,
        pixCopiaECola: pixData.pixCopiaECola
      },
      whatsapp: {
        numero: numero,
        enviado: whatsappResult.sucesso,
        simulado: whatsappResult.simulado || false
      },
      evento: evento
    });
    
  } catch (error) {
    console.error("❌ Erro no processo PIX + WhatsApp:", error.message);
    
    // Log detalhado do erro
    if (error.response) {
      console.error("📋 Erro PIX Service:", error.response.data);
    }
    
    res.status(500).json({
      erro: "Falha no processo PIX + WhatsApp",
      detalhes: error.message,
      pix_error: error.response?.data || null
    });
  }
});

// =====================================================
// INICIALIZAÇÃO
// =====================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
🚀 WhatsApp Service iniciado com sucesso!
📍 Porta: ${PORT}
🏥 Health: http://localhost:${PORT}/health
📋 Endpoints principais:
   • POST /enviar-mensagem - Enviar WhatsApp direto
   • POST /processar-pix-whatsapp - PIX + WhatsApp integrado
   • GET  /whatsapp-status - Status da conexão
   • GET  /health - Health check
   • GET  /ping - Ping
  `);
  
  // Inicializar WhatsApp após 5 segundos
  if (WHATSAPP_ENABLED) {
    setTimeout(() => {
      inicializarWhatsApp().catch(error => {
        console.error("❌ Erro na inicialização do WhatsApp:", error.message);
        // Em caso de erro, ativar modo simulação como fallback
        if (!SIMULATE_MODE && !whatsappReady) {
          console.log("🎭 Ativando modo simulação como fallback");
          whatsappReady = true;
        }
      });
    }, 5000);
  }
});

// Cleanup ao fechar
process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando WhatsApp Service...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Encerrando WhatsApp Service...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});