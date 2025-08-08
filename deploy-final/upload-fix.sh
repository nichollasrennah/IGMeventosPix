#!/bin/bash

echo "🔧 Upload manual da correção PIX"
echo ""
echo "📋 INSTRUÇÕES:"
echo "1. Conecte-se ao servidor: ssh root@srv937382.hstgr.cloud"
echo "2. Navegue para o diretório: cd /app/pix-service"
echo "3. Edite o arquivo: nano whatsapp-service.js"
echo "4. Encontre a linha que contém 'dadosPix.calendario.expiracao'"
echo "5. Substitua por este bloco de código:"
echo ""
echo "============ CÓDIGO PARA SUBSTITUIR ============"
cat << 'EOF'

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

EOF

echo "============ FIM DO CÓDIGO ============"
echo ""
echo "6. Salve e saia (Ctrl+X, Y, Enter)"
echo "7. Reinicie o container: docker restart whatsapp-service"
echo "8. Aguarde 2 minutos e teste novamente"
echo ""
echo "💡 ALTERNATIVAMENTE:"
echo "Você pode usar o comando: cat > temp_fix.js"
echo "Cole o código acima, pressione Ctrl+D"
echo "Depois: cp temp_fix.js whatsapp-service.js"