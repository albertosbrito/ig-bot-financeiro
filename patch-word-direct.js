import fs from 'fs';

const file = 'start-universal-quiz-funnel.js';
let src = fs.readFileSync(file, 'utf8');

function apply(find, replace, label) {
  if (!src.includes(find)) {
    console.log('[word-direct-patch] skip:', label);
    return;
  }
  src = src.replace(find, replace);
  console.log('[word-direct-patch] applied:', label);
}

apply(
  "function normalizarEntregasCheckoutLocal(entregas = []) {",
  "function mensagemWordCheckoutDiretoLocal() {\n  return 'Oi! Vi que você pediu o material de Word 😊\\n\\nA Apostila de Word vai do básico ao avançado, com foco em formatação, documentos, currículo, trabalhos e uso no dia a dia.\\n\\nEla está na oferta por ' + PRECO_PROMO + '.\\n\\nAqui está o acesso:\\n' + CHECKOUT_WORD_URL + '\\n\\nO material libera após a confirmação do pagamento via Pix ou cartão.';\n}\n\nfunction normalizarEntregasCheckoutLocal(entregas = []) {",
  'add Word direct message'
);

apply(
  "item.mensagemDm = `Claro! 😊 A Apostila de Word está na oferta especial por ${PRECO_PROMO}.\\n\\nO acesso é liberado após a confirmação do pagamento via Pix ou cartão.\\n\\nAqui está o link para acessar:\\n{link}\\n\\nQualquer dúvida, é só responder este chat.\\n\\n— @albertobri7o`;",
  "item.mensagemDm = mensagemWordCheckoutDiretoLocal();",
  'replace Word delivery message'
);

apply(
  "const produto = detectarProdutoFunilLocal(textoNormalizado, '', null);\n  if (produto) {\n    return iniciarFunilProdutoLocal(produto, senderId, 'COMENTARIO — INICIO FUNIL PRODUTO');\n  }",
  "const produto = detectarProdutoFunilLocal(textoNormalizado, '', null);\n  if (produto === 'WORD') {\n    return { mensagem: mensagemWordCheckoutDiretoLocal(), tipo: 'COMENTARIO — WORD CHECKOUT DIRETO' };\n  }\n  if (produto) {\n    return iniciarFunilProdutoLocal(produto, senderId, 'COMENTARIO — INICIO FUNIL PRODUTO');\n  }",
  'comment Word direct checkout'
);

apply(
  "if (produto) {\n    const inicio = iniciarFunilProdutoLocal(produto, senderId, 'DIRECT — INICIO FUNIL PRODUTO', false);\n    return { mensagens: [inicio.mensagem], tipo: inicio.tipo };\n  }",
  "if (produto === 'WORD') {\n    clearEstadoDirect(senderId);\n    return { mensagens: [mensagemWordCheckoutDiretoLocal()], tipo: 'DIRECT — WORD CHECKOUT DIRETO' };\n  }\n\n  if (produto) {\n    const inicio = iniciarFunilProdutoLocal(produto, senderId, 'DIRECT — INICIO FUNIL PRODUTO', false);\n    return { mensagens: [inicio.mensagem], tipo: inicio.tipo };\n  }",
  'direct Word direct checkout'
);

apply(
  "const produto = mapa[indiceMaterial];\n    setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', { produto, etapa: 'OBJETIVO', respostas: [] });\n    return [montarPerguntaProdutoLocal(produto, true, false)];",
  "const produto = mapa[indiceMaterial];\n    if (produto === 'WORD') {\n      clearEstadoDirect(senderId);\n      return [mensagemWordCheckoutDiretoLocal()];\n    }\n    setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', { produto, etapa: 'OBJETIVO', respostas: [] });\n    return [montarPerguntaProdutoLocal(produto, true, false)];",
  'numeric Word direct checkout'
);

fs.writeFileSync(file, src, 'utf8');
console.log('[word-direct-patch] done');
