import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'start-universal-quiz-funnel.js');
const runtimePath = path.join(__dirname, 'start-office-upsell.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');

function aplicarPatchesUpsellOffice() {
  patch(
    "const CHECKOUT_FINANCEIRO_URL = String(process.env.CHECKOUT_FINANCEIRO_URL || '').trim();",
    `const CHECKOUT_FINANCEIRO_URL = String(process.env.CHECKOUT_FINANCEIRO_URL || '').trim();
const CHECKOUT_PACK_OFFICE_URL = String(process.env.CHECKOUT_PACK_OFFICE_URL || 'https://pay.kiwify.com.br/jnOuze5').trim();
const PRECO_PACK_OFFICE = String(process.env.PRECO_PACK_OFFICE || 'R$ 39,90').trim();
const VALOR_SEPARADO_PACK_OFFICE = String(process.env.VALOR_SEPARADO_PACK_OFFICE || 'R$ 79,60').trim();
const ECONOMIA_PACK_OFFICE = String(process.env.ECONOMIA_PACK_OFFICE || 'R$ 39,70').trim();`,
    'config pack office'
  );

  patch(
    "keywords: ['EXCEL', 'KIT EXCEL', 'CADERNO DE EXCEL', 'KIT EXCEL BASICO', 'KIT EXCEL BÁSICO'],",
    "keywords: ['EXCEL', 'CADERNO', 'CADERNO EXCEL', 'CADERNO DE EXCEL', 'KIT EXCEL', 'KIT EXCEL BASICO', 'KIT EXCEL BÁSICO'],",
    'gatilho caderno para excel'
  );

  patch(
    `  const produto = PRODUTOS_FUNIL_LOCAL[dados.produto];
  if (!produto) {
    clearEstadoDirect(senderId);
    return [montarPerguntaEscolherProdutoLocal(true, false)];
  }

  let indiceOpcao = -1;`,
    `  const produto = PRODUTOS_FUNIL_LOCAL[dados.produto];
  if (!produto) {
    clearEstadoDirect(senderId);
    return [montarPerguntaEscolherProdutoLocal(true, false)];
  }

  if (dados.etapa === 'ESCOLHER_OFERTA_OFFICE') {
    return responderEscolhaOfertaOfficeLocal(senderId, textoOriginal, dados);
  }

  let indiceOpcao = -1;`,
    'processar escolha individual ou pack office'
  );

  patch(
    `  const objetivo = produto.opcoes[indiceOpcao];
  clearEstadoDirect(senderId);
  return montarOfertaProdutoLocal(dados.produto, objetivo);`,
    `  const objetivo = produto.opcoes[indiceOpcao];

  if (['WORD', 'EXCEL'].includes(dados.produto)) {
    const dadosOferta = {
      produto: dados.produto,
      etapa: 'ESCOLHER_OFERTA_OFFICE',
      objetivo,
      respostas: [...(dados.respostas || []), objetivo]
    };
    setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', dadosOferta);
    return [montarEscolhaOfertaOfficeLocal(dados.produto, objetivo)];
  }

  clearEstadoDirect(senderId);
  return montarOfertaProdutoLocal(dados.produto, objetivo);`,
    'oferecer pack ao final de word ou excel'
  );

  patch(
    `function montarOfertaProdutoLocal(produtoKey, objetivo) {`,
    `function montarEscolhaOfertaOfficeLocal(produtoKey, objetivo) {
  const produto = PRODUTOS_FUNIL_LOCAL[produtoKey];

  return \`Perfeito. Pelo que você respondeu, o material de \${produto.nome} combina com seu objetivo: \${objetivo}.

Antes de enviar o checkout, escolha a opção com o melhor custo-benefício para você:

1. Apenas \${produto.titulo}
Por \${PRECO_PROMO}

2. Pack Office VIP
Word + Excel + PowerPoint + Outlook
Valor dos 4 separados: \${VALOR_SEPARADO_PACK_OFFICE}
Hoje por apenas \${PRECO_PACK_OFFICE}
Economia de \${ECONOMIA_PACK_OFFICE}

Responda 1 para manter apenas \${produto.nome} ou 2 para levar o Pack Office VIP.\`;
}

function responderEscolhaOfertaOfficeLocal(senderId, textoOriginal, dados) {
  const produto = PRODUTOS_FUNIL_LOCAL[dados.produto];
  const texto = normalizar(textoOriginal || '');
  const numero = String(textoOriginal || '').replace(/[^0-9]/g, '');

  const escolheuIndividual =
    numero === '1' ||
    texto.includes('INDIVIDUAL') ||
    texto.includes('MANTER') ||
    texto.includes('APENAS') ||
    texto.includes('SO WORD') ||
    texto.includes('SO EXCEL');

  const escolheuPack =
    numero === '2' ||
    texto.includes('PACK') ||
    texto.includes('VIP') ||
    texto.includes('QUATRO EBOOK') ||
    texto.includes('4 EBOOK') ||
    texto.includes('OFFICE COMPLETO');

  if (!escolheuIndividual && !escolheuPack) {
    setEstadoDirect(senderId, 'FUNIL_PRODUTO_LOCAL', dados);
    return [\`Não consegui identificar sua escolha. Responda 1 para levar apenas \${produto.nome} por \${PRECO_PROMO}, ou 2 para levar o Pack Office VIP por \${PRECO_PACK_OFFICE}.\`];
  }

  clearEstadoDirect(senderId);

  if (escolheuPack) {
    return [\`Excelente escolha! No Pack Office VIP você recebe Word, Excel, PowerPoint e Outlook por apenas \${PRECO_PACK_OFFICE}, economizando \${ECONOMIA_PACK_OFFICE}.

Acesse aqui 👇
\${CHECKOUT_PACK_OFFICE_URL}

O acesso é liberado após a confirmação do pagamento via Pix ou cartão.\`];
  }

  const checkout = produto.checkout();
  if (!checkout) {
    return [\`Perfeito! Você escolheu apenas \${produto.nome} por \${PRECO_PROMO}. Responda aqui com seu melhor contato para o Alberto enviar o acesso.\`];
  }

  return [\`Perfeito! Você manteve a escolha de \${produto.titulo} por \${PRECO_PROMO}.

Acesse aqui 👇
\${checkout}

O acesso é liberado após a confirmação do pagamento via Pix ou cartão.\`];
}

function montarOfertaProdutoLocal(produtoKey, objetivo) {`,
    'mensagens e resposta do upsell office'
  );
}

const marker = "fs.writeFileSync(runtimePath, source, 'utf8');";

if (!source.includes(marker)) {
  throw new Error('Nao foi possivel localizar o ponto de extensao do funil universal.');
}

const injection = `\n(${aplicarPatchesUpsellOffice.toString()})();\n\n`;
source = source.replace(marker, injection + marker);

fs.writeFileSync(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
