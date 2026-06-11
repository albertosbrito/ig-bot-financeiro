import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');

function patch(find, replacement, label) {
  if (!source.includes(find)) throw new Error(`Patch nao aplicado: ${label}`);
  source = source.replace(find, replacement);
}

patch(
  "const BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();",
  `const PRECO_PROMO = String(process.env.PRECO_PROMO || 'R$ 19,90').trim();
const CHECKOUT_CONCURSO_URL = String(process.env.CHECKOUT_CONCURSO_URL || 'https://pay.kiwify.com.br/TfqsJLX').trim();
const CHECKOUT_WORD_URL = String(process.env.CHECKOUT_WORD_URL || 'https://pay.kiwify.com.br/CKv3YRe').trim();
const CHECKOUT_EXCEL_URL = String(process.env.CHECKOUT_EXCEL_URL || 'https://pay.kiwify.com.br/8ST9DMO').trim();
const CHECKOUT_INTERNET_URL = String(process.env.CHECKOUT_INTERNET_URL || 'https://pay.kiwify.com.br/5DBbzXn').trim();
const AMOSTRA_CONCURSO_URL = String(process.env.AMOSTRA_CONCURSO_URL || 'https://drive.google.com/file/d/1APNGWFN-lEzjDIvXYYaHI0nGpQg8cOo5/view?usp=drivesdk').trim();
let BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();
BOT_NEGOCIO_CONTEXT = BOT_NEGOCIO_CONTEXT
  .replace(/Word\\s*[:—-]\\s*cortesia\\s*\\((grátis|gratis)\\)/gi, 'Word — ' + PRECO_PROMO)
  .replace(/Planilha Financeira\\s*[:—-]\\s*cortesia\\s*\\((grátis|gratis)\\)/gi, 'Planilha Financeira — inclusa no Kit Excel Básico')
  .replace(/Informática para Concurso\\s*[:—-]\\s*R\\$\\s*47/gi, 'Informática para Concurso — ' + PRECO_PROMO)
  .replace(/Excel \\(Kit Excel Básico\\)\\s*[:—-]\\s*R\\$\\s*37/gi, 'Excel (Kit Excel Básico) — ' + PRECO_PROMO)
  .replace(/Internet 2\\.0\\s*[:—-]\\s*R\\$\\s*37/gi, 'Internet 2.0 — ' + PRECO_PROMO);`,
  'config baixo atrito'
);

patch(
  "const ENTREGAS = carregarEntregas();",
  "const ENTREGAS = normalizarEntregasBaixoAtrito(carregarEntregas());",
  'normalizar entregas baixo atrito'
);

patch(
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  const respostaBaixoAtritoComentario = fluxoBaixoAtritoComentario({ textoNormalizado, textoOriginal: text, senderId: fromId });
  if (respostaBaixoAtritoComentario) {
    if (respostaBaixoAtritoComentario.estado && fromId) {
      setEstadoDirect(fromId, respostaBaixoAtritoComentario.estado.etapa, respostaBaixoAtritoComentario.estado.dados || {});
    }
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, respostaBaixoAtritoComentario.mensagem);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te respondi no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, respostaBaixoAtritoComentario.tipo || 'COMENTARIO — FUNIL BAIXO ATRITO');
    return;
  }

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  'comentario baixo atrito'
);

patch(
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  const respostasBaixoAtrito = fluxoBaixoAtritoDirect({ senderId, textoOriginal: text, textoNormalizado, estado, event });
  if (respostasBaixoAtrito) {
    for (const mensagem of respostasBaixoAtrito.mensagens) {
      await enviarMensagemDirect(senderId, mensagem);
    }
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, respostasBaixoAtrito.tipo || 'DIRECT — FUNIL BAIXO ATRITO');
    return;
  }

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  'direct baixo atrito'
);

patch(
  `// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  `// ================= FUNIL DE VENDAS BAIXO ATRITO =================
const PRODUTOS_BAIXO_ATRITO = {
  WORD: {
    nome: 'Word', titulo: 'Apostila de Word', checkout: CHECKOUT_WORD_URL,
    keywords: ['WORD', 'WORDI', 'APOSTILA WORD', 'APOSTILA DE WORD', 'MATERIAL WORD'],
    pitch: 'O material de Word te leva do básico ao avançado: formatação, currículo, trabalhos e pontos que aparecem em prova.'
  },
  EXCEL: {
    nome: 'Excel', titulo: 'Kit Excel Básico', checkout: CHECKOUT_EXCEL_URL,
    keywords: ['EXCEL', 'EXEL', 'KIT EXCEL', 'CADERNO DE EXCEL', 'PLANILHA FINANCEIRA', 'FINANCEIRO', 'FINANCAS', 'FINANÇAS', 'GASTOS', 'PLANILHA DE FINANCAS', 'PLANILHA DE FINANÇAS'],
    pitch: 'O Kit Excel Básico cobre fórmulas, atalhos, tabelas e relatórios para destravar o Excel no trabalho. A Planilha Financeira vai inclusa no kit.'
  },
  INTERNET: {
    nome: 'Internet 2.0', titulo: 'eBook Internet 2.0', checkout: CHECKOUT_INTERNET_URL,
    keywords: ['INTERNET', 'INTERNET 2', 'INTERNET 2.0', 'EBOOK INTERNET'],
    pitch: 'O Internet 2.0 traz navegação, segurança, e-mail e conceitos que caem em prova, explicados de forma simples.'
  },
  CONCURSO: {
    nome: 'Informática para Concurso', titulo: 'Apostila Informática para Concurso', checkout: CHECKOUT_CONCURSO_URL,
    keywords: ['CONCURSO', 'INFORMATICA', 'INFORMÁTICA', 'INFORMATICA PARA CONCURSO', 'INFORMÁTICA PARA CONCURSO', 'APOSTILA CONCURSO', 'MATERIAL CONCURSO'],
    pitch: 'O material de Informática para Concurso reúne os temas que mais caem, com pegadinhas, questões comentadas e simulado final.'
  }
};

function normalizarEntregasBaixoAtrito(entregas = []) {
  return entregas.map(entrega => {
    const item = { ...entrega };
    const nome = normalizar(item.nome || '');

    if (nome.includes('WORD')) {
      item.link = CHECKOUT_WORD_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'Apostila de Word';
      item.mensagemDm = mensagemCheckoutProduto('WORD').join('\\n\\n');
    }

    if (nome.includes('EXCEL') || nome.includes('FINANCEIRO')) {
      item.link = CHECKOUT_EXCEL_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'Kit Excel Básico';
      item.mensagemDm = mensagemCheckoutProduto('EXCEL').join('\\n\\n');
    }

    if (nome.includes('CONCURSO')) {
      item.link = CHECKOUT_CONCURSO_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'Apostila Informática para Concurso';
      item.mensagemDm = mensagemCheckoutProduto('CONCURSO').join('\\n\\n');
    }

    if (nome.includes('INTERNET')) {
      item.link = CHECKOUT_INTERNET_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'eBook Internet 2.0';
      item.mensagemDm = mensagemCheckoutProduto('INTERNET').join('\\n\\n');
    }

    return item;
  });
}

function fluxoBaixoAtritoComentario({ textoNormalizado, textoOriginal, senderId }) {
  const produto = detectarProdutoBaixoAtrito(textoNormalizado, '');
  if (produto) return respostaProdutoComentario(produto, senderId, 'COMENTARIO — PRODUTO');
  if (ehPerguntaPrecoBaixoAtrito(textoNormalizado)) return respostaEscolhaMaterial(true, senderId, 'COMENTARIO — PRECO');
  if (ehInteresseGenericoBaixoAtrito(textoNormalizado)) return respostaEscolhaMaterial(false, senderId, 'COMENTARIO — INFORMACOES');
  if (ehPedidoAmostraBaixoAtrito(textoNormalizado)) return { mensagem: mensagemAmostraBaixoAtrito(), tipo: 'COMENTARIO — AMOSTRA' };
  if (ehNumeroMaterialBaixoAtrito(textoNormalizado)) {
    const produtoNumero = produtoPorNumeroBaixoAtrito(textoOriginal);
    if (produtoNumero) return respostaProdutoComentario(produtoNumero, senderId, 'COMENTARIO — NUMERO PRODUTO');
  }
  return null;
}

function fluxoBaixoAtritoDirect({ senderId, textoOriginal, textoNormalizado, estado, event }) {
  if (estado?.etapa === 'ESCOLHER_MATERIAL_BAIXO_ATRITO') {
    const produtoEstado = detectarProdutoBaixoAtrito(textoNormalizado, '') || produtoPorNumeroBaixoAtrito(textoOriginal);
    if (!produtoEstado) {
      setEstadoDirect(senderId, 'ESCOLHER_MATERIAL_BAIXO_ATRITO', {});
      return { mensagens: ['Pode me responder com o nome do material: Word, Excel, Internet 2.0 ou Informática para Concurso.'], tipo: 'DIRECT — MATERIAL NAO IDENTIFICADO' };
    }
    clearEstadoDirect(senderId);
    return { mensagens: mensagemCheckoutProduto(produtoEstado), tipo: 'DIRECT — CHECKOUT PRODUTO' };
  }

  const referralTexto = extrairTextoReferral(event);
  const produto = detectarProdutoBaixoAtrito(textoNormalizado, referralTexto);

  if (ehPedidoAmostraBaixoAtrito(textoNormalizado)) {
    return { mensagens: [mensagemAmostraBaixoAtrito()], tipo: 'DIRECT — AMOSTRA' };
  }

  if (produto) {
    clearEstadoDirect(senderId);
    return { mensagens: mensagemCheckoutProduto(produto), tipo: 'DIRECT — CHECKOUT PRODUTO' };
  }

  if (ehNumeroMaterialBaixoAtrito(textoNormalizado)) {
    const produtoNumero = produtoPorNumeroBaixoAtrito(textoOriginal);
    if (produtoNumero) {
      clearEstadoDirect(senderId);
      return { mensagens: mensagemCheckoutProduto(produtoNumero), tipo: 'DIRECT — NUMERO PRODUTO' };
    }
  }

  if (ehPerguntaPrecoBaixoAtrito(textoNormalizado)) {
    setEstadoDirect(senderId, 'ESCOLHER_MATERIAL_BAIXO_ATRITO', {});
    return { mensagens: [mensagemEscolhaMaterial(true)], tipo: 'DIRECT — PRECO' };
  }

  if (ehInteresseGenericoBaixoAtrito(textoNormalizado)) {
    setEstadoDirect(senderId, 'ESCOLHER_MATERIAL_BAIXO_ATRITO', {});
    return { mensagens: [mensagemEscolhaMaterial(false)], tipo: 'DIRECT — INFORMACOES' };
  }

  return null;
}

function respostaProdutoComentario(produto, senderId, tipo) {
  const mensagens = mensagemCheckoutProduto(produto);
  return { mensagem: mensagens.join('\\n\\n'), tipo };
}

function respostaEscolhaMaterial(comPreco, senderId, tipo) {
  return {
    mensagem: mensagemEscolhaMaterial(comPreco),
    estado: { etapa: 'ESCOLHER_MATERIAL_BAIXO_ATRITO', dados: {} },
    tipo
  };
}

function mensagemEscolhaMaterial(comPreco = false) {
  if (comPreco) {
    return 'Cada material está por ' + PRECO_PROMO + ', com acesso liberado após o pagamento. 😊\\n\\nMe diz qual você quer que eu já te mando o link: Word, Excel, Internet 2.0 ou Informática para Concurso.';
  }
  return 'Show! Pra eu te mandar o acesso certo, qual material te interessa? Word, Excel, Internet 2.0 ou Informática para Concurso? 😊';
}

function mensagemCheckoutProduto(produtoKey) {
  const produto = PRODUTOS_BAIXO_ATRITO[produtoKey];
  if (!produto) return [mensagemEscolhaMaterial(false)];
  return [
    'Perfeito! ' + produto.pitch + '\\n\\nHoje ele está por ' + PRECO_PROMO + ', com acesso liberado após o pagamento.',
    'Aqui está o link para garantir agora 👇\\n' + produto.checkout + '\\n\\nQualquer dúvida, me chama aqui.'
  ];
}

function mensagemAmostraBaixoAtrito() {
  return 'Claro. Separei uma amostra gratuita da apostila Informática para Concurso para você ver o estilo do material antes de comprar.\\n\\nBaixe aqui 👇\\n' + AMOSTRA_CONCURSO_URL + '\\n\\nO material completo está por ' + PRECO_PROMO + '. Se quiser, me diga o material que eu te mando o link.';
}

function detectarProdutoBaixoAtrito(textoNormalizado, referralTexto = '') {
  const texto = String(textoNormalizado || '') + ' ' + normalizar(referralTexto || '');
  for (const [key, produto] of Object.entries(PRODUTOS_BAIXO_ATRITO)) {
    if (produto.keywords.some(k => contemPalavraOuFrase(texto, normalizar(k)))) return key;
  }
  return null;
}

function produtoPorNumeroBaixoAtrito(textoOriginal) {
  const numero = Number(String(textoOriginal || '').replace(/[^0-9]/g, ''));
  const mapa = ['WORD', 'EXCEL', 'INTERNET', 'CONCURSO'];
  return numero >= 1 && numero <= mapa.length ? mapa[numero - 1] : null;
}

function ehNumeroMaterialBaixoAtrito(t) {
  const valor = String(t || '').replace(/[^0-9]/g, '');
  return /^[1-4]$/.test(valor);
}

function ehPerguntaPrecoBaixoAtrito(t) {
  const texto = String(t || '');
  return texto.includes('QUANTO') || texto.includes('PRECO') || texto.includes('PREÇO') || texto.includes('VALOR') || texto.includes('CUSTA') || texto.includes('POR QUANTO');
}

function ehInteresseGenericoBaixoAtrito(t) {
  const texto = String(t || '');
  return texto.includes('TENHO INTERESSE') || texto.includes('QUERIA MAIS INFORMACOES') || texto.includes('QUERIA MAIS INFORMAÇÕES') || texto.includes('QUERO MAIS INFORMACOES') || texto.includes('QUERO MAIS INFORMAÇÕES') || texto.includes('MAIS INFORMACOES') || texto.includes('MAIS INFORMAÇÕES') || texto.includes('CONHECER OS MATERIAIS') || texto.includes('CONHECER MATERIAIS') || texto.includes('QUERO CONHECER') || texto.includes('QUAIS MATERIAIS') || texto.includes('LISTA DE MATERIAIS') || texto.includes('MATERIAIS DISPONIVEIS') || texto.includes('MATERIAIS DISPONÍVEIS') || texto.includes('MATERIAIS') || texto.includes('TEM CURSO') || texto.includes('TEM CURSOS') || texto.includes('CURSO') || texto.includes('CURSOS') || texto.includes('AULA') || texto.includes('AULAS') || texto.includes('COMO FUNCIONA') || texto.includes('DETALHES');
}

function ehPedidoAmostraBaixoAtrito(t) {
  const texto = String(t || '');
  return texto.includes('AMOSTRA') || texto.includes('PREVIA') || texto.includes('PRÉVIA') || texto.includes('VER POR DENTRO') || texto.includes('POSSO VER') || texto.includes('QUERO VER') || texto.includes('EXEMPLO DO MATERIAL');
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  'helpers baixo atrito'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
