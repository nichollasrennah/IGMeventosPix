const express = require("express");
const bodyParser = require("body-parser");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const app = express();
app.use(bodyParser.json());

// =====================================================
// VARIÁVEIS GLOBAIS WHATSAPP
// =====================================================

let whatsappClient = null;
let whatsappReady = false;
let currentQRCode = null;
let whatsappInitializing = false;
let keepAliveInterval = null;

// =====================================================
// INICIALIZAÇÃO WHATSAPP
// =====================================================

function inicializarWhatsApp() {
  if (whatsappInitializing) {
    console.log('⏳ WhatsApp já está sendo inicializado...');
    return;
  }

  if (process.env.WHATSAPP_ENABLED !== 'true') {
    console.log('📱 WhatsApp desabilitado (WHATSAPP_ENABLED != true)');
    return;
  }

  if (whatsappClient) {
    console.log('🔄 Destruindo cliente WhatsApp existente...');
    try {
      whatsappClient.destroy();
    } catch (error) {
      console.log('⚠️ Erro ao destruir cliente anterior:', error.message);
    }
  }

  whatsappInitializing = true;
  console.log('🔄 Iniciando processo de inicialização do WhatsApp...');
  
  try {
    // Configurações otimizadas para baixo uso de memória
    const puppeteerOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--memory-pressure-off',
        '--max_old_space_size=300',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-background-networking'
      ]
    };

    // Em produção, especificar caminho do executável
    if (process.env.NODE_ENV === 'production') {
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || 
                            process.env.CHROME_BIN || 
                            '/usr/bin/google-chrome-stable';
      
      try {
        const fs = require('fs');
        if (fs.existsSync(executablePath)) {
          puppeteerOptions.executablePath = executablePath;
          console.log(`🔧 Usando Chrome em: ${executablePath}`);
        }
      } catch (e) {
        console.log('⚠️ Não foi possível verificar caminho do Chrome, usando padrão');
      }
    }

    whatsappClient = new Client({
      authStrategy: new LocalAuth({
        name: "whatsapp-service-session",
        dataPath: "./whatsapp-session"
      }),
      puppeteer: puppeteerOptions,
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0
    });

    whatsappClient.on('qr', (qr) => {
      console.log('📱 QR Code gerado para WhatsApp');
      currentQRCode = qr;
      
      if (process.env.NODE_ENV !== 'production') {
        qrcode.generate(qr, { small: true });
      }
    });

    whatsappClient.on('authenticated', () => {
      console.log('✅ WhatsApp autenticado com sucesso');
      currentQRCode = null;
    });

    whatsappClient.on('ready', async () => {
      console.log('🚀 WhatsApp conectado e pronto!');
      whatsappReady = true;
      whatsappInitializing = false;
      currentQRCode = null;
      
      try {
        const info = await whatsappClient.getState();
        console.log('📱 Estado WhatsApp:', info);
      } catch (err) {
        console.log('📞 WhatsApp conectado (informações não disponíveis)');
      }
      
      // Configurar keep-alive
      iniciarKeepAlive();
    });

    whatsappClient.on('loading_screen', (percent, message) => {
      console.log(`⏳ Carregando WhatsApp: ${percent}% - ${message}`);
    });

    whatsappClient.on('change_state', (state) => {
      console.log('🔄 Estado WhatsApp alterado:', state);
    });

    whatsappClient.on('disconnected', (reason) => {
      console.log('❌ WhatsApp desconectado:', reason);
      whatsappReady = false;
      currentQRCode = null;
      
      // Parar keep-alive quando desconectado
      pararKeepAlive();
      
      if (reason === 'LOGOUT') {
        console.log('🔄 Logout detectado - limpando sessão e reinicializando...');
        whatsappInitializing = false;
        
        setTimeout(() => {
          console.log('🔄 Reinicializando WhatsApp após logout...');
          inicializarWhatsApp();
        }, 5000);
      } else {
        console.log('🔄 Tentando reconectar WhatsApp em 10 segundos...');
        whatsappInitializing = false;
        
        setTimeout(() => {
          inicializarWhatsApp();
        }, 10000);
      }
    });

    whatsappClient.on('auth_failure', (message) => {
      console.error('❌ Falha na autenticação WhatsApp:', message);
      whatsappReady = false;
      whatsappInitializing = false;
      currentQRCode = null;
    });

    console.log('🔄 Inicializando cliente WhatsApp...');
    whatsappClient.initialize();

  } catch (error) {
    console.error('❌ Erro ao inicializar WhatsApp:', error.message);
    console.log('📱 WhatsApp não estará disponível nesta sessão');
    whatsappReady = false;
    whatsappInitializing = false;
  }
}

// =====================================================
// KEEP-ALIVE WHATSAPP
// =====================================================

function iniciarKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  keepAliveInterval = setInterval(async () => {
    try {
      if (whatsappClient && whatsappReady) {
        const state = await whatsappClient.getState();
        console.log(`💓 WhatsApp Keep-Alive - Estado: ${state}`);
        
        if (state !== 'CONNECTED') {
          console.log('⚠️ WhatsApp desconectado durante keep-alive, tentando reconectar...');
          whatsappReady = false;
          inicializarWhatsApp();
        }
      }
    } catch (error) {
      console.log('⚠️ Erro no keep-alive WhatsApp:', error.message);
      whatsappReady = false;
    }
  }, 5 * 60 * 1000); // 5 minutos
  
  console.log('💓 Keep-alive WhatsApp iniciado (5 min intervals)');
}

function pararKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('💔 Keep-alive WhatsApp parado');
  }
}

// =====================================================
// FUNÇÃO ENVIAR WHATSAPP
// =====================================================

async function enviarWhatsApp(numero, mensagem) {
  if (!whatsappClient || !whatsappReady) {
    throw new Error('WhatsApp não está conectado');
  }

  // Limpar e formatar número brasileiro
  let numeroLimpo = numero.replace(/\D/g, '');
  
  if (numeroLimpo.startsWith('55')) {
    numeroLimpo = numeroLimpo.substring(2);
  }
  
  if (numeroLimpo.length === 10) {
    numeroLimpo = numeroLimpo.substring(0, 2) + '9' + numeroLimpo.substring(2);
  }
  
  if (numeroLimpo.length !== 11) {
    throw new Error(`Número brasileiro inválido: ${numeroLimpo} (deve ter 11 dígitos)`);
  }
  
  const numeroCompleto = `55${numeroLimpo}`;
  const chatId = `${numeroCompleto}@c.us`;
  
  console.log(`📞 Tentando enviar para: ${numero} -> ${numeroCompleto} (${chatId})`);

  // Verificar se o número é válido
  const numberId = await whatsappClient.getNumberId(chatId);
  if (!numberId) {
    throw new Error(`Número ${numeroCompleto} não possui WhatsApp ativo`);
  }

  console.log(`✅ Número validado: ${numberId._serialized}`);

  // Enviar mensagem
  const message = await whatsappClient.sendMessage(numberId._serialized, mensagem);
  
  console.log(`✅ Mensagem enviada com sucesso para ${numeroCompleto}`);
  console.log(`📨 ID da mensagem: ${message.id._serialized}`);
  
  return {
    sucesso: true,
    numero_formatado: numeroCompleto,
    chat_id: numberId._serialized,
    mensagem_id: message.id._serialized,
    timestamp: new Date().toISOString()
  };
}

// =====================================================
// ENDPOINTS WHATSAPP SERVICE
// =====================================================

// Health check
app.get("/health", (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    service: "whatsapp-service",
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptime),
    uptime_formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    whatsapp: {
      enabled: process.env.WHATSAPP_ENABLED === 'true',
      connected: whatsappReady,
      initializing: whatsappInitializing,
      keep_alive_active: !!keepAliveInterval,
      has_qr_code: !!currentQRCode
    }
  });
});

app.get("/ping", (req, res) => {
  res.status(200).json({
    message: "pong",
    service: "whatsapp-service",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  });
});

// Status WhatsApp
app.get("/whatsapp-status", async (req, res) => {
  try {
    let state = null;
    let info = null;
    
    if (whatsappClient && whatsappReady) {
      try {
        state = await whatsappClient.getState();
        info = await whatsappClient.info;
      } catch (error) {
        console.log('⚠️ Erro ao obter informações WhatsApp:', error.message);
      }
    }

    res.json({
      enabled: process.env.WHATSAPP_ENABLED === 'true',
      ready: whatsappReady,
      initializing: whatsappInitializing,
      state: state,
      has_qr_code: !!currentQRCode,
      keep_alive_active: !!keepAliveInterval,
      client_info: info ? {
        platform: info.platform,
        phone: info.wid?.user
      } : null,
      last_check: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      erro: "Erro ao verificar status WhatsApp",
      detalhes: error.message
    });
  }
});

// QR Code para conexão
app.get("/whatsapp-qr", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>WhatsApp QR Code - PIX Service</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .qr-container { margin: 20px 0; }
            .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
            .connected { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .disconnected { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .loading { background-color: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
            button { background-color: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 5px; }
            button:hover { background-color: #0056b3; }
            .refresh-btn { background-color: #28a745; }
            .refresh-btn:hover { background-color: #1e7e34; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔗 WhatsApp Connection - PIX Service</h1>
            <div id="status" class="status loading">Verificando status...</div>
            <div class="qr-container">
                <div id="qr-code">Carregando QR Code...</div>
            </div>
            <button onclick="verificarStatus()" class="refresh-btn">🔄 Atualizar Status</button>
            <button onclick="forcarReconexao()">🔄 Forçar Reconexão</button>
            <button onclick="resetWhatsApp()">🗑️ Reset Sessão</button>
        </div>

        <script>
            let statusInterval;

            function verificarStatus() {
                fetch('/whatsapp-status')
                    .then(response => response.json())
                    .then(data => {
                        const statusDiv = document.getElementById('status');
                        const qrDiv = document.getElementById('qr-code');
                        
                        if (data.ready) {
                            statusDiv.className = 'status connected';
                            statusDiv.innerHTML = '✅ WhatsApp Conectado e Pronto!';
                            qrDiv.innerHTML = '<h3>✅ Conectado com Sucesso!</h3><p>WhatsApp está pronto para enviar mensagens.</p>';
                        } else if (data.initializing) {
                            statusDiv.className = 'status loading';
                            statusDiv.innerHTML = '⏳ Iniciando conexão WhatsApp...';
                            if (data.has_qr_code) {
                                buscarQRCode();
                            } else {
                                qrDiv.innerHTML = '<p>⏳ Gerando QR Code...</p>';
                            }
                        } else {
                            statusDiv.className = 'status disconnected';
                            statusDiv.innerHTML = '❌ WhatsApp Desconectado';
                            qrDiv.innerHTML = '<p>❌ WhatsApp não está conectado. Clique em "Forçar Reconexão" para tentar novamente.</p>';
                        }
                    })
                    .catch(error => {
                        console.error('Erro:', error);
                        document.getElementById('status').innerHTML = '❌ Erro ao verificar status';
                    });
            }

            function buscarQRCode() {
                fetch('/whatsapp-qr-data')
                    .then(response => response.json())
                    .then(data => {
                        if (data.qr_code) {
                            document.getElementById('qr-code').innerHTML = 
                                '<h3>📱 Escaneie o QR Code com seu WhatsApp</h3>' +
                                '<img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + 
                                encodeURIComponent(data.qr_code) + '" alt="QR Code WhatsApp" style="border: 2px solid #ccc; border-radius: 10px;">' +
                                '<p><small>Abra o WhatsApp no seu celular > Menu (⋮) > Aparelhos conectados > Conectar um aparelho</small></p>';
                        }
                    })
                    .catch(error => {
                        console.error('Erro ao buscar QR:', error);
                    });
            }

            function forcarReconexao() {
                fetch('/whatsapp-reconnect', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message || 'Reconexão iniciada');
                        setTimeout(verificarStatus, 2000);
                    })
                    .catch(error => {
                        alert('Erro ao forçar reconexão: ' + error.message);
                    });
            }

            function resetWhatsApp() {
                if (confirm('Isso irá limpar a sessão salva. Deseja continuar?')) {
                    fetch('/whatsapp-reset', { method: 'POST' })
                        .then(response => response.json())
                        .then(data => {
                            alert(data.message || 'Reset realizado');
                            setTimeout(verificarStatus, 2000);
                        })
                        .catch(error => {
                            alert('Erro ao fazer reset: ' + error.message);
                        });
                }
            }

            // Verificar status ao carregar
            verificarStatus();
            
            // Atualizar status a cada 5 segundos
            setInterval(verificarStatus, 5000);
        </script>
    </body>
    </html>
  `);
});

// QR Code dados
app.get("/whatsapp-qr-data", (req, res) => {
  res.json({
    has_qr_code: !!currentQRCode,
    qr_code: currentQRCode,
    ready: whatsappReady,
    initializing: whatsappInitializing
  });
});

// Enviar mensagem
app.post("/enviar-mensagem", async (req, res) => {
  try {
    const { numero, mensagem } = req.body;
    
    if (!numero || !mensagem) {
      return res.status(400).json({
        sucesso: false,
        erro: "Campos 'numero' e 'mensagem' são obrigatórios"
      });
    }

    if (!whatsappReady) {
      return res.status(503).json({
        sucesso: false,
        erro: "WhatsApp não está conectado",
        status: {
          ready: whatsappReady,
          initializing: whatsappInitializing,
          has_qr_code: !!currentQRCode
        }
      });
    }

    console.log(`📤 Solicitação de envio WhatsApp para: ${numero}`);
    
    const resultado = await enviarWhatsApp(numero, mensagem);
    
    res.json({
      sucesso: true,
      ...resultado
    });

  } catch (error) {
    console.error("❌ Erro ao enviar WhatsApp:", error.message);
    
    res.status(500).json({
      sucesso: false,
      erro: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Reconectar WhatsApp
app.post("/whatsapp-reconnect", async (req, res) => {
  try {
    console.log('🔄 Solicitação de reconexão WhatsApp recebida');
    
    whatsappReady = false;
    whatsappInitializing = false;
    
    if (whatsappClient) {
      try {
        await whatsappClient.destroy();
        console.log('🗑️ Cliente WhatsApp anterior destruído');
      } catch (error) {
        console.log('⚠️ Erro ao destruir cliente:', error.message);
      }
    }
    
    whatsappClient = null;
    currentQRCode = null;
    pararKeepAlive();
    
    setTimeout(() => {
      inicializarWhatsApp();
    }, 2000);
    
    res.json({
      sucesso: true,
      message: "Processo de reconexão WhatsApp iniciado"
    });
    
  } catch (error) {
    console.error('❌ Erro na reconexão:', error.message);
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// Reset WhatsApp (limpar sessão)
app.post("/whatsapp-reset", async (req, res) => {
  try {
    console.log('🗑️ Solicitação de reset WhatsApp recebida');
    
    whatsappReady = false;
    whatsappInitializing = false;
    
    if (whatsappClient) {
      try {
        await whatsappClient.destroy();
      } catch (error) {
        console.log('⚠️ Erro ao destruir cliente:', error.message);
      }
    }
    
    whatsappClient = null;
    currentQRCode = null;
    pararKeepAlive();
    
    // Limpar sessão salva
    const fs = require('fs');
    const path = require('path');
    const sessionPath = path.join(__dirname, 'whatsapp-session');
    
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log('🗑️ Sessão WhatsApp removida');
    }
    
    setTimeout(() => {
      inicializarWhatsApp();
    }, 3000);
    
    res.json({
      sucesso: true,
      message: "Reset WhatsApp realizado - nova sessão será criada"
    });
    
  } catch (error) {
    console.error('❌ Erro no reset:', error.message);
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// =====================================================
// LIMPEZA DE MEMÓRIA
// =====================================================

function limparCacheMemoria() {
  try {
    console.log('🧹 Iniciando limpeza de cache WhatsApp Service...');
    
    if (global.gc) {
      global.gc();
      const memory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(`♻️ Garbage collection executado - Memória: ${memory}MB`);
    }
    
  } catch (error) {
    console.log('⚠️ Erro na limpeza de cache:', error.message);
  }
}

// Auto-ping para prevenir hibernação
let autoPingInterval = null;

function iniciarAutoPing() {
  if (autoPingInterval) {
    clearInterval(autoPingInterval);
  }
  
  autoPingInterval = setInterval(async () => {
    try {
      const uptime = process.uptime();
      const memoryMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      
      console.log(`🏓 WhatsApp Service Auto-ping - Uptime: ${Math.floor(uptime)}s, Memória: ${memoryMB}MB`);
      
      if (memoryMB > 150) {
        console.log(`⚠️ Uso de memória alto: ${memoryMB}MB - Limpando cache`);
        limparCacheMemoria();
      }
      
      // Verificar se WhatsApp precisa reconectar
      if (process.env.WHATSAPP_ENABLED === 'true' && !whatsappReady && !whatsappInitializing) {
        console.log('🔄 Auto-ping detectou WhatsApp desconectado, tentando reconectar...');
        inicializarWhatsApp();
      }
      
    } catch (error) {
      console.log('⚠️ Erro no auto-ping:', error.message);
    }
  }, 10 * 60 * 1000); // 10 minutos
  
  console.log('🏓 Auto-ping WhatsApp Service iniciado (10 min intervals)');
}

// =====================================================
// INICIALIZAÇÃO DO SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
🚀 WhatsApp Service iniciado!
📍 Porta: ${PORT}
🌐 URL: http://localhost:${PORT}
🏥 Health: http://localhost:${PORT}/health

📋 Endpoints disponíveis:
   • POST /enviar-mensagem - Enviar mensagem WhatsApp
   • GET  /whatsapp-status - Status da conexão WhatsApp
   • GET  /whatsapp-qr - Interface web para QR Code
   • GET  /whatsapp-qr-data - Dados do QR Code em JSON
   • POST /whatsapp-reconnect - Forçar reconexão WhatsApp
   • POST /whatsapp-reset - Reset completo (limpa sessão)
   • GET  /health - Health check
   • GET  /ping - Ping
  `);
  
  // Inicializar WhatsApp após servidor estabilizar
  setTimeout(() => {
    inicializarWhatsApp();
  }, 2000);
  
  // Iniciar auto-ping
  iniciarAutoPing();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Recebido SIGTERM, desconectando WhatsApp...');
  
  pararKeepAlive();
  
  if (autoPingInterval) {
    clearInterval(autoPingInterval);
  }
  
  if (whatsappClient) {
    try {
      await whatsappClient.destroy();
      console.log('✅ WhatsApp desconectado');
    } catch (error) {
      console.log('⚠️ Erro ao desconectar WhatsApp:', error.message);
    }
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 Recebido SIGINT, desconectando WhatsApp...');
  
  pararKeepAlive();
  
  if (autoPingInterval) {
    clearInterval(autoPingInterval);
  }
  
  if (whatsappClient) {
    try {
      await whatsappClient.destroy();
      console.log('✅ WhatsApp desconectado');
    } catch (error) {
      console.log('⚠️ Erro ao desconectar WhatsApp:', error.message);
    }
  }
  
  process.exit(0);
});