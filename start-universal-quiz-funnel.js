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
const CHECKOUT_FINANCEIRO_URL = String(process.env.CHECKOUT_FINANCEIRO_URL || '').trim();
const AMOSTRA_CONCURSO_URL = String(process.env.AMOSTRA_CONCURSO_URL || 'https://drive.google.com/file/d/1APNGWFN-lEzjDIvXYYaHI0nGpQg8cOo5/view?usp=drivesdk').trim();
let BOT_NEGOCIO_CONTEXT = String(process.env.BOT_NEGOCIO_CONTEXT || '').trim();
BOT_NEGOCIO_CONTEXT = BOT_NEGOCIO_CONTEXT
  .replace(/Word\\s*[:—-]\\s*cortesia\\s*\\((grátis|gratis)\\)/gi, \`Word — \${PRECO_PROMO}\`)
  .replace(/Planilha Financeira\\s*[:—-]\\s*cortesia\\s*\\((grátis|gratis)\\)/gi, \`Planilha Financeira — \${PRECO_PROMO}\`)
  .replace(/Informática para Concurso\\s*[:—-]\\s*R\\$\\s*47/gi, \`Informática para Concurso — \${PRECO_PROMO}\`)
  .replace(/Excel \\(Kit Excel Básico\\)\\s*[:—-]\\s*R\\$\\s*37/gi, \`Excel (Kit Excel Básico) — \${PRECO_PROMO}\`)
  .replace(/Internet 2\\.0\\s*[:—-]\\s*R\\$\\s*37/gi, \`Internet 2.0 — \${PRECO_PROMO}\`);`,
  'config oferta universal'
);

patch(
  "const ENTREGAS = carregarEntregas();",
  "const ENTREGAS = normalizarEntregasCheckoutLocal(carregarEntregas());",
  'normalizar links entregas'
);

patch(
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  `  console.log(\`💬 Comentário recebido de @\${username}: "\${text}"\`);
  console.log(\`🧩 commentId recebido: \${commentId}\`);

  const respostaLocalComentario = fluxoLocalComentario({ textoNormalizado, textoOriginal: text, senderId: fromId });
  if (respostaLocalComentario) {
    if (respostaLocalComentario.estado && fromId) {
      setEstadoDirect(fromId, respostaLocalComentario.estado.etapa, respostaLocalComentario.estado.dados);
    }
    if (ENVIAR_PRIVATE_REPLY) await enviarPrivateReply(commentId, respostaLocalComentario.mensagem);
    if (RESPONDER_PUBLICO) await responderComentarioSeguro(commentId, \`@\${username} te respondi no direct 📩\`);
    await notificarAlberto(username, \`Comentário:\n\${text}\`, respostaLocalComentario.tipo || 'COMENTARIO — FUNIL LOCAL');
    return;
  }

  // Regra fixa única: entrega por ENTREGAS_JSON.`,
  'comentario funil universal'
);

patch(
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  `  console.log(\`📩 DM recebida de \${senderId}: "\${text}"\`);
  console.log('🧭 Estado atual do Direct:', estado ? JSON.stringify(estado) : 'SEM_ESTADO');

  const respostasLocais = fluxoLocalDirect({ senderId, textoOriginal: text, textoNormalizado, estado, event });
  if (respostasLocais) {
    for (const mensagem of respostasLocais.mensagens) {
      await enviarMensagemDirect(senderId, mensagem);
    }
    await notificarAlberto(usuarioDirect, \`Mensagem:\n\${text}\`, respostasLocais.tipo || 'DIRECT — FUNIL LOCAL');
    return;
  }

  // 🔎 INVESTIGAÇÃO DE ANÚNCIO: despeja o evento completo da Meta para descobrir`,
  'direct funil universal'
);

patch(
  `// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  `// ================= FUNIL UNIVERSAL DE PRODUTOS =================
const PRODUTOS_FUNIL_LOCAL = {
  WORD: {
    nome: 'Word', titulo: 'Apostila de Word', checkout: () => CHECKOUT_WORD_URL,
    keywords: ['WORD', 'APOSTILA WORD', 'APOSTILA DE WORD', 'MATERIAL WORD'],
    pergunta: 'Você quer aprender Word para qual objetivo?',
    opcoes: ['Concurso ou prova', 'Trabalho administrativo', 'Currículo ou processo seletivo', 'Faculdade ou estudos', 'Começar do zero'],
    dor: 'organizar documentos, formatação, atalhos e recursos que mais confundem quem usa Word no dia a dia'
  },
  EXCEL: {
    nome: 'Excel', titulo: 'Kit Excel Básico', checkout: () => CHECKOUT_EXCEL_URL,
    keywords: ['EXCEL', 'KIT EXCEL', 'CADERNO DE EXCEL', 'KIT EXCEL BASICO', 'KIT EXCEL BÁSICO'],
    pergunta: 'Você quer Excel para qual objetivo?',
    opcoes: ['Trabalho administrativo', 'Processo seletivo', 'Relatórios e planilhas', 'Aprender do zero', 'Melhorar produtividade'],
    dor: 'destravar fórmulas, atalhos e tabelas para trabalhar melhor com planilhas'
  },
  INTERNET: {
    nome: 'Internet', titulo: 'eBook Internet 2.0', checkout: () => CHECKOUT_INTERNET_URL,
    keywords: ['INTERNET', 'INTERNET 2.0', 'INTERNET 2', 'EBOOK INTERNET'],
    pergunta: 'Você quer Internet 2.0 para qual objetivo?',
    opcoes: ['Concurso ou prova', 'Navegar com mais segurança', 'Estudo ou trabalho', 'Aprender o básico', 'Revisar pontos importantes'],
    dor: 'entender internet, navegação, e-mail, segurança e conceitos que aparecem em provas e no trabalho'
  },
  CONCURSO: {
    nome: 'Concurso', titulo: 'Apostila Informática para Concurso', checkout: () => CHECKOUT_CONCURSO_URL,
    keywords: ['CONCURSO', 'INFORMATICA PARA CONCURSO', 'INFORMÁTICA PARA CONCURSO', 'APOSTILA CONCURSO', 'MATERIAL CONCURSO', 'APOSTILA INFORMATICA', 'APOSTILA INFORMÁTICA'],
    pergunta: 'Você está estudando para qual situação?',
    opcoes: ['Concurso público', 'Processo seletivo', 'Prova próxima', 'Revisão geral', 'Ainda estou começando'],
    dor: 'revisar Informática do jeito que cai em prova, com pegadinhas, questões comentadas e simulado'
  },
  FINANCEIRO: {
    nome: 'Financeiro', titulo: 'Planilha Financeira', checkout: () => CHECKOUT_FINANCEIRO_URL,
    keywords: ['FINANCEIRO', 'PLANILHA FINANCEIRA', 'PLANILHA DE FINANCAS', 'PLANILHA DE FINANÇAS'],
    pergunta: 'Você quer a Planilha Financeira para qual objetivo?',
    opcoes: ['Organizar gastos pessoais', 'Controlar entradas e saídas', 'Sair do improviso', 'Planejar o mês', 'Começar do zero'],
    dor: 'organizar gastos, entradas, saídas e planejamento financeiro de forma simples'
  }
};

function normalizarEntregasCheckoutLocal(entregas = []) {
  return entregas.map(entrega => {
    const item = { ...entrega };
    const nome = normalizar(item.nome || '');

    if (nome.includes('WORD')) {
      item.link = CHECKOUT_WORD_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'Apostila de Word';
      item.mensagemDm = \`Claro! 😊 A Apostila de Word está na oferta especial por \${PRECO_PROMO}.\\n\\nO acesso é liberado após a confirmação do pagamento via Pix ou cartão.\\n\\nAqui está o link para acessar:\\n{link}\\n\\nQualquer dúvida, é só responder este chat.\\n\\n— @albertobri7o\`;
    }

    if (nome.includes('EXCEL')) {
      item.link = CHECKOUT_EXCEL_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'Kit Excel Básico';
      item.mensagemDm = \`Boa escolha! 🙌 O Kit Excel Básico é direto ao ponto: fórmulas, atalhos e tabelas para você destravar o Excel no trabalho.\\n\\nOferta especial de Dia dos Namorados: \${PRECO_PROMO}.\\n\\nO acesso é liberado após a confirmação do pagamento via Pix ou cartão.\\n\\nAqui está o link para acessar:\\n{link}\\n\\nQualquer dúvida, é só responder este chat.\\n\\n— @albertobri7o\`;
    }

    if (nome.includes('CONCURSO')) {
      item.link = CHECKOUT_CONCURSO_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'Apostila Informática para Concurso';
      item.mensagemDm = String(item.mensagemDm || '')
        .replace(/R\\$\\s*47/g, PRECO_PROMO)
        .replace(/Ele custava R\\$\\s*97, mas como é lançamento, você vai pagar R\\$\\s*47[^\\n]*/gi, \`Oferta especial de Dia dos Namorados: hoje você acessa por \${PRECO_PROMO}.\`);
    }

    if (nome.includes('INTERNET')) {
      item.link = CHECKOUT_INTERNET_URL;
      item.tipo = 'checkout';
      item.tituloDm = 'eBook Internet 2.0';
      item.mensagemDm = String(item.mensagemDm || '')
        .replace(/R\\$\\s*37/g, PRECO_PROMO);
    }

    return item;
  });
}

function fluxoLocalComentario({ textoNormalizado, textoOriginal, senderId }) {
  const produto = detectarProdutoFunilLocal(textoNormalizado, '', null);
  if (produto) {
    return iniciarFunilProdutoLocal(produto, senderId, 'COMENTARIO — INICIO FUNIL PRODUTO');
  }
  if (ehNumeroMaterialSoltoLocal(textoNormalizado)) {
    const dados = estadoInicialEscolhaProdutoLocal();
    const mensagens = responderFunilProdutoLocal(senderId, textoOriginal, { dados });
    return { mensagem: mensagens[0], tipo: 'COMENTARIO — MATERIAL NUMERICO' };
  }
  if (ehPerguntaPrecoFunilLocal(textoNormalizado)) {
    return iniciarFunilProdutoLocal(null, senderId, 'COMENTARIO — FUNIL PRECO', true);
  }
  if (ehInteresseGenericoFunilLocal(textoNormalizado)) {
    return iniciarFunilProdutoLocal(null, senderId, 'COMENTARIO — FUNIL INFORMACOES', false);
  }
  if (ehPedidoAmostraFunilLocal(textoNormalizado)) {
    return { mensagem: mensagemAmostraOuEscolhaLocal(null), tipo: 'COMENTARIO — AMOSTRA' };
  }
  return null;
}

function fluxoLocalDirect({ senderId, textoOriginal, textoNormalizado, estado, event }) {
  if (estado?.etapa === 'FUNIL_PRODUTO_LOCAL') {
    return { mensagens: responderFunilProdutoLocal(senderId, textoOriginal, estado), tipo: 'DIRECT — FUNIL PRODUTO' };
  }

  if (ehNumeroMaterialSoltoLocal(textoNormalizado)) {
    const dados = estadoInicialEscolhaProdutoLocal();
    return { mensagens: responderFunilProdutoLocal(senderId, textoOriginal, { dados }), tipo: 'DIRECT — MATERIAL NUMERICO' };
  }

  const referralTexto = extrairTextoReferral(event);
  const produto = detectarProdutoFunilLocal(textoNormalizado, referralTexto, estado);

  if (ehPedidoAmostraFunilLocal(textoNormalizado)) {
    return { mensagens: [mensagemAmostraOuEscolhaLocal(produto)], tipo: 'DIRECT — AMOSTRA' };
  }

  if (produto) {
    const inicio = iniciarFunilProdutoLocal(produto, senderId, 'DIRECT — INICIO FUNIL PRODUTO', false);
    return { mensagens: [inicio.mensagem], tipo: inicio.tipo };
  }

  if (ehPerguntaPrecoFunilLocal(textoNormalizado)) {
    const inicio = iniciarFunilProdutoLocal(null, senderId, 'DIRECT — FUNIL PRECO', true);
    return { mensagens: [inicio.mensagem], tipo: inicio.tipo };
  }

  if (ehInteresseGenericoFunilLocal(textoNormalizado)) {
    const inicio = iniciarFunilProdutoLocal(null, senderId, 'DIRECT — FUNIL INFORMACOES', false);
    return { mensagens: [inicio.mensagem], tipo: inicio.tipo };
  }

  return null;
}

function estadoInicialEscolhaProdutoLocal() {
  return { produto: null, etapa: 'ESCOLHER_PRODUTO', respostas: [] };
}

function detectarProdutoFunilLocal(textoNormalizado, referralTexto = '', estado = null) {
  const textos = [textoNormalizado, normalizar(referralTexto || ''), normalizar(estado?.dados?.produto || '')].filter(Boolean).join(' ');
  for (const [chave, produto] of Object.entries(PRODUTOS_FUNIL_LOCAL)) {
    if (produto.keywords.some(k => contemPalavraOuFrase(textos, normalizar(k)))) return chave;
  }
  return null;
}

function iniciarFunilProdutoLocal(produto, senderId, tipo = 'FUNIL PRODUTO', mostrarPreco = false) {
  const dados = { produto: produto || null, etapa: produto ? 'OBJETIVO' : 'ESCOLHER_PRODUTO', respostas: [] };
  const mensagem = produto ? montarPerguntaProdutoLocal(produto, true, mostrarPreco) : montarPerguntaEscolherProdutoLocal(true, mostrarPreco);
  return { mensagem, estado: { etapa: 'FUNIL_PRODUTO_LOCAL', dados }, tipo };
}

function responderFunilProdutoLocal(senderId, textoOriginal, estadoAtual) {
  const dados = estadoAtual?.dados || estadoInicialEscolhaProdutoLocal();
  const numero = Number(String(textoOriginal || '').replace(/[^0-9]/g, ''));
  const textoLimpo = limparTextoOpcaoLocal(textoOriginal);

  if (!dados.produto) {
    const mapa = ['WORD', 'EXCEL', 'INTERNET', 'CONCURSO', 'FINANCEIRO'];
    const nomesMateriais = ['Word', 'Excel', 'Internet 2.0', 'Informática para Concurso', 'Planilha Financeira'];
    let indiceMaterial = -1;

    if (Number.isInteger(numero) && numero >= 1 && numero <= mapa.length) {
      indiceMaterial = numero - 1;
    } else {
      indiceMaterial = encontrarIndiceOpcaoLocal(textoLimpo, nomesMateriais);
    }

    if (indiceMaterial < 0) {
      setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', dados);
      return ['Não consegui identificar o material. Pode responder com o nome dele? Ex.: Word, Excel, Internet, Informática para Concurso ou Planilha Financeira.'];
    }

    const produto = mapa[indiceMaterial];
    setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', { produto, etapa: 'OBJETIVO', respostas: [] });
    return [montarPerguntaProdutoLocal(produto, true, false)];
  }

  const produto = PRODUTOS_FUNIL_LOCAL[dados.produto];
  if (!produto) {
    clearEstadoDirect(senderId);
    return [montarPerguntaEscolherProdutoLocal(true, false)];
  }

  let indiceOpcao = -1;
  if (Number.isInteger(numero) && numero >= 1 && numero <= produto.opcoes.length) {
    indiceOpcao = numero - 1;
  } else {
    indiceOpcao = encontrarIndiceOpcaoLocal(textoLimpo, produto.opcoes);
  }

  if (indiceOpcao < 0) {
    setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', dados);
    return ['Não consegui identificar a alternativa. Pode responder com uma palavra da opção? Ex.: trabalho, concurso, faculdade, começar do zero.'];
  }

  const objetivo = produto.opcoes[indiceOpcao];
  clearEstadoDirect(senderId);
  return montarOfertaProdutoLocal(dados.produto, objetivo);
}

function limparTextoOpcaoLocal(valor = '') {
  return normalizar(valor)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function encontrarIndiceOpcaoLocal(textoLimpo, opcoes = []) {
  if (!textoLimpo) return -1;

  const palavrasTexto = textoLimpo.split(' ').filter(p => p.length >= 3);

  for (let i = 0; i < opcoes.length; i++) {
    const opcaoLimpa = limparTextoOpcaoLocal(opcoes[i]);
    if (!opcaoLimpa) continue;

    if (textoLimpo === opcaoLimpa) return i;
    if (opcaoLimpa.includes(textoLimpo) && textoLimpo.length >= 3) return i;
    if (textoLimpo.includes(opcaoLimpa) && opcaoLimpa.length >= 3) return i;

    const palavrasOpcao = opcaoLimpa.split(' ').filter(p => p.length >= 3);
    const bateuPalavra = palavrasTexto.some(p => palavrasOpcao.includes(p));
    if (bateuPalavra) return i;
  }

  return -1;
}

function montarPerguntaEscolherProdutoLocal(comIntro = false, mostrarPreco = false) {
  const pergunta = 'Para eu te mandar o acesso certo, qual material você quer?\\n\\n1. Word\\n2. Excel\\n3. Internet 2.0\\n4. Informática para Concurso\\n5. Planilha Financeira';
  if (!comIntro) return pergunta;
  return mostrarPreco
    ? \`Claro! 😊\\n\\nA oferta especial de Dia dos Namorados está por \${PRECO_PROMO}.\\n\\nAntes de te mandar um link, me responde rapidinho:\\n\\n\${pergunta}\`
    : \`Perfeito! Vou te ajudar a escolher o material certo para o seu momento. 😊\\n\\nAntes de te mandar um link, me responde rapidinho:\\n\\n\${pergunta}\`;
}

function montarPerguntaProdutoLocal(produtoKey, comIntro = false, mostrarPreco = false) {
  const produto = PRODUTOS_FUNIL_LOCAL[produtoKey];
  const opcoes = produto.opcoes.map((op, i) => \`\${i + 1}. \${op}\`).join('\\n');
  const pergunta = \`\${produto.pergunta}\\n\\n\${opcoes}\`;
  if (!comIntro) return pergunta;
  return mostrarPreco
    ? \`Claro! 😊\\n\\nA oferta especial está por \${PRECO_PROMO} hoje.\\n\\nAntes de te mandar o acesso certo, me responde rapidinho:\\n\\n\${pergunta}\`
    : \`Perfeito! Vou te ajudar a escolher o acesso certo. 😊\\n\\nAntes de te mandar o link, me responde rapidinho:\\n\\n\${pergunta}\`;
}

function montarOfertaProdutoLocal(produtoKey, objetivo) {
  const produto = PRODUTOS_FUNIL_LOCAL[produtoKey];
  const checkout = produto.checkout();
  const texto = \`Perfeito. Pelo que você respondeu, o material mais indicado é: \${produto.titulo}.\\n\\nEle te ajuda com \${produto.dor}.\\n\\nOferta especial de Dia dos Namorados: \${PRECO_PROMO}.\`;

  if (!checkout) {
    return [\`\${texto}\\n\\nAinda estou finalizando o checkout desse material. Responde aqui com seu melhor contato que o Alberto te envia o acesso certinho.\`];
  }

  return [
    texto,
    \`Acesse aqui 👇\\n\${checkout}\\n\\nO acesso é imediato após a confirmação do pagamento via Pix ou cartão.\`
  ];
}

function mensagemAmostraOuEscolhaLocal(produtoKey) {
  if (produtoKey === 'CONCURSO' || !produtoKey) {
    return \`Claro. Separei uma amostra gratuita da apostila Informática para Concurso para você ver o estilo do material antes de comprar.\\n\\nBaixe aqui 👇\\n\${AMOSTRA_CONCURSO_URL}\\n\\nDepois me responde com o número do material que você quer conhecer melhor.\`;
  }
  return montarPerguntaProdutoLocal(produtoKey, true, false);
}

function ehPerguntaPrecoFunilLocal(t) {
  const texto = String(t || '');
  return texto.includes('QUANTO') || texto.includes('PRECO') || texto.includes('PREÇO') || texto.includes('VALOR') || texto.includes('CUSTA') || texto.includes('POR QUANTO');
}
function ehInteresseGenericoFunilLocal(t) {
  const texto = String(t || '');
  return texto.includes('TENHO INTERESSE') || texto.includes('QUERIA MAIS INFORMACOES') || texto.includes('QUERIA MAIS INFORMAÇÕES') || texto.includes('QUERO MAIS INFORMACOES') || texto.includes('QUERO MAIS INFORMAÇÕES') || texto.includes('MAIS INFORMACOES') || texto.includes('MAIS INFORMAÇÕES') || texto.includes('COMO FUNCIONA') || texto.includes('DETALHES');
}
function ehPedidoAmostraFunilLocal(t) {
  const texto = String(t || '');
  return texto.includes('AMOSTRA') || texto.includes('PREVIA') || texto.includes('PRÉVIA') || texto.includes('VER POR DENTRO') || texto.includes('POSSO VER') || texto.includes('QUERO VER') || texto.includes('EXEMPLO DO MATERIAL');
}
function ehNumeroMaterialSoltoLocal(t) {
  const valor = String(t || '').replace(/[^0-9]/g, '');
  return /^[1-5]$/.test(valor);
}

// ================= EXECUÇÃO DAS DECISÕES DA IA =================`,
  'helpers funil universal'
);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
