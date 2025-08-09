# PIX Service Dockerfile
FROM node:18-alpine

# Criar usuário não-root
RUN addgroup -g 1001 -S pixapp && \
    adduser -S pixapp -u 1001

# Definir diretório de trabalho
WORKDIR /app

# Copiar package.json e package-lock.json
COPY pix-package.json ./package.json
COPY package-lock.json ./package-lock.json

# Instalar dependências
RUN npm install --omit=dev && \
    npm cache clean --force

# Copiar código da aplicação
COPY pix-service.js ./index.js

# Criar diretórios necessários
RUN mkdir -p certs logs && \
    chown -R pixapp:pixapp /app

# Mudar para usuário não-root
USER pixapp

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=300"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expor porta
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]