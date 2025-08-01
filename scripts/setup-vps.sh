#!/bin/bash

# Script de setup inicial da VPS para Docker
set -e

echo "🚀 Configurando VPS para PIX + WhatsApp Docker..."

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Verificar se é root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ Este script deve ser executado como root!${NC}"
   exit 1
fi

# Atualizar sistema
echo -e "${YELLOW}📦 Atualizando sistema...${NC}"
apt update && apt upgrade -y

# Instalar dependências básicas
echo -e "${YELLOW}🔧 Instalando dependências básicas...${NC}"
apt install -y \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    jq \
    htop

# Instalar Docker
echo -e "${YELLOW}🐳 Instalando Docker...${NC}"
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Instalar Docker Compose standalone
echo -e "${YELLOW}🔗 Instalando Docker Compose...${NC}"
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Criar usuário para aplicação
echo -e "${YELLOW}👤 Criando usuário da aplicação...${NC}"
useradd -m -s /bin/bash pixapp
usermod -aG docker pixapp

# Criar diretórios
echo -e "${YELLOW}📁 Criando estrutura de diretórios...${NC}"
mkdir -p /home/pixapp/pix-sicredi
cd /home/pixapp/pix-sicredi

# Configurar Git (se repositório será clonado)
echo -e "${YELLOW}📋 Você quer clonar o repositório agora? (y/n)${NC}"
read -r CLONE_REPO

if [[ $CLONE_REPO =~ ^[Yy]$ ]]; then
    echo "Digite a URL do repositório Git:"
    read -r REPO_URL
    
    echo -e "${YELLOW}📥 Clonando repositório...${NC}"
    git clone "$REPO_URL" .
    
    # Configurar permissões
    chown -R pixapp:pixapp /home/pixapp/pix-sicredi
fi

# Configurar firewall
echo -e "${YELLOW}🔥 Configurando firewall...${NC}"
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp

# Configurar swap (importante para containers com pouca RAM)
echo -e "${YELLOW}💾 Configurando swap...${NC}"
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Otimizar configurações do sistema para Docker
echo -e "${YELLOW}⚙️ Otimizando configurações do sistema...${NC}"

# Limites de arquivo
cat >> /etc/security/limits.conf << EOF
* soft nofile 65536
* hard nofile 65536
root soft nofile 65536
root hard nofile 65536
EOF

# Configurações de rede
cat >> /etc/sysctl.conf << EOF
# Otimizações para Docker
net.core.somaxconn = 65536
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65536
net.ipv4.tcp_keepalive_time = 600
vm.swappiness = 10
EOF

sysctl -p

# Configurar logrotate para containers
echo -e "${YELLOW}📋 Configurando logrotate...${NC}"
cat > /etc/logrotate.d/docker-containers << EOF
/var/lib/docker/containers/*/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    copytruncate
    notifempty
}
EOF

# Criar script de backup
echo -e "${YELLOW}💾 Criando script de backup...${NC}"
cat > /home/pixapp/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/pixapp/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup volumes Docker
docker run --rm \
    -v pix-sicredi_whatsapp-session:/data/whatsapp-session \
    -v pix-sicredi_pix-logs:/data/pix-logs \
    -v pix-sicredi_whatsapp-logs:/data/whatsapp-logs \
    -v $BACKUP_DIR:/backup \
    alpine tar czf /backup/docker-volumes-$DATE.tar.gz -C /data .

# Backup certificados
tar czf $BACKUP_DIR/certs-$DATE.tar.gz -C /home/pixapp/pix-sicredi certs/

# Manter apenas últimos 7 backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "✅ Backup criado: $DATE"
EOF

chmod +x /home/pixapp/backup.sh
chown pixapp:pixapp /home/pixapp/backup.sh

# Agendar backup diário
echo -e "${YELLOW}⏰ Agendando backup diário...${NC}"
(crontab -u pixapp -l 2>/dev/null; echo "0 2 * * * /home/pixapp/backup.sh") | crontab -u pixapp -

# Instalar e configurar fail2ban (segurança)
echo -e "${YELLOW}🛡️ Configurando fail2ban...${NC}"
apt install -y fail2ban

cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
EOF

systemctl enable fail2ban
systemctl start fail2ban

# Verificar instalações
echo -e "${YELLOW}🔍 Verificando instalações...${NC}"
echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"
echo "Sistema: $(lsb_release -d | cut -f2)"
echo "RAM: $(free -h | grep Mem | awk '{print $2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $4}' | sed 's/G/ GB/')"

echo ""
echo -e "${GREEN}🎉 VPS configurada com sucesso!${NC}"
echo ""
echo -e "${YELLOW}📋 Próximos passos:${NC}"
echo "1. Configure suas variáveis em /home/pixapp/pix-sicredi/.env"
echo "2. Coloque os certificados Sicredi em /home/pixapp/pix-sicredi/certs/"
echo "3. Execute: sudo -u pixapp ./scripts/deploy.sh"
echo ""
echo -e "${YELLOW}🔧 Comandos úteis:${NC}"
echo "  sudo -u pixapp docker-compose ps     # Status dos containers"
echo "  sudo -u pixapp ./scripts/monitor.sh  # Monitoramento"
echo "  sudo -u pixapp ./scripts/deploy.sh   # Deploy/redeploy"
echo ""
echo -e "${GREEN}✅ Configuração concluída!${NC}"