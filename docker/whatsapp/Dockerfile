# WhatsApp Service Dockerfile
FROM node:18-slim

# Instalar dependências do sistema para Puppeteer
RUN apt-get update && \
    apt-get install -y \
        wget \
        gnupg \
        ca-certificates \
        curl \
        && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
        && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
        && apt-get update \
        && apt-get install -y \
            google-chrome-stable \
            fonts-ipafont-gothic \
            fonts-wqy-zenhei \
            fonts-thai-tlwg \
            fonts-kacst \
            fonts-freefont-ttf \
            libxss1 \
            --no-install-recommends \
        && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root
RUN groupadd -r whatsapp && useradd -r -g whatsapp -G audio,video whatsapp \
    && mkdir -p /home/whatsapp/Downloads /app \
    && chown -R whatsapp:whatsapp /home/whatsapp \
    && chown -R whatsapp:whatsapp /app

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json específico do WhatsApp
COPY whatsapp-package.json ./package.json

# Instalar dependências
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código da aplicação
COPY whatsapp-service.js ./index.js

# Criar diretórios necessários
RUN mkdir -p whatsapp-session logs && \
    chown -R whatsapp:whatsapp /app

# Mudar para usuário não-root
USER whatsapp

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3001
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_OPTIONS="--expose-gc --max-old-space-size=500"
ENV WHATSAPP_ENABLED=true

# Health check
HEALTHCHECK --interval=60s --timeout=15s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Expor porta
EXPOSE 3001

# Comando de inicialização
CMD ["npm", "start"]