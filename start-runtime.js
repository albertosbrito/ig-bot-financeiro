import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, 'server.runtime.js');

let source = fs.readFileSync(sourcePath, 'utf8');
let ok = true;

function patch(find, replacement, label) {
  if (!source.includes(find)) {
    console.warn(`Patch não aplicado: ${label}`);
    ok = false;
    return;
  }
  source = source.replace(find, replacement);
}

patch(
  `const USAR_FUNIL_BOTOES = boolEnv('USAR_FUNIL_BOTOES', true);`,
  `const USAR_FUNIL_BOTOES = false;`,
  'desativar funil por botões'
);

patch(
  `const estadosDirect = new Map();`,
  `const estadosDirect = new Map();
const atendimentosHumanos = new Map();`,
  'estado atendimento humano'
);

patch(
  `const TEMPO_ESTADO_DIRECT_MS = Number(process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6);`,
  `const TEMPO_ESTADO_DIRECT_MS = Number(process.env.TEMPO_ESTADO_DIRECT_MS || 1000 * 60 * 60 * 6);
const TEMPO_ATENDIMENTO_HUMANO_MS = Number(process.env.TEMPO_ATENDIMENTO_HUMANO_MS || 1000 * 60 * 60 * 24);`,
  'ttl atendimento humano'
);

patch(
  `  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }`,
  `  if (text && ehOperador(event) && ehComandoHumano(text)) {
    const alvoId = obterAlvoHumano(event);
    if (!alvoId) {
      console.warn('Comando humano sem alvo válido:', JSON.stringify(event));
      return;
    }
    await executarComandoHumano(alvoId, text);
    return;
  }

  if (message?.is_echo || String(senderId) === String(IG_USER_ID)) {
    console.log('Direct ignorado: echo/próprio bot');
    return;
  }`,
  'comandos assumir/liberar antes do echo'
);

patch(
  `  console.log('🔎 EVENTO COMPLETO DA META >>>', JSON.stringify(event));

  if (payload && payload.startsWith('FUNIL|')) {`,
  `  console.log('🔎 EVENTO COMPLETO DA META >>>', JSON.stringify(event));

  if (humanoAtivo(senderId)) {
    console.log(\`Atendimento humano ativo para \${senderId}. Robô não respondeu.\`);
    await notificarAlberto(
      usuarioDirect,
      \`Mensagem recebida com robô pausado:\n\${text || payload}\`,
      'DIRECT — ATENDIMENTO HUMANO ATIVO',
      { canal: 'Direct', idDirect: senderId, etapa: 'ATENDIMENTO_HUMANO', status: 'robô pausado', temperatura: 'quente' }
    );
    return;
  }

  if (payload && payload.startsWith('FUNIL|')) {`,
  'pausar conversa assumida'
);

patch(
  `async function iniciarFunilProdutoDirect(senderId, entrega, origem, textoOriginal = '') {
  const slug = slugEntrega(entrega);`,
  `async function iniciarFunilProdutoDirect(senderId, entrega, origem, textoOriginal = '') {
  if (!USAR_FUNIL_BOTOES) {
    clearEstadoDirect(senderId);
    guardarEstadoProdutoEntregue(senderId, entrega, origem);
    salvarLeadRemarketing({
      canal: 'direct', idDirect: senderId, usuario: \`ig_user_\${senderId}\`, produto: entrega.nome,
      mensagem: textoOriginal, status: 'checkout_enviado_direto', etapa: 'PRODUTO_ENTREGUE',
      temperatura: 'quente', origem, linkSugerido: entrega.link,
      acaoSugerida: 'Checkout enviado direto. Acompanhar se comprou.'
    });
    await enviarMensagemDirect(senderId, montarMensagemEntrega([entrega]));
    await notificarAlberto(
      \`ig_user_\${senderId}\`,
      \`Checkout enviado direto.\n\nProduto: \${entrega.nome}\nLink: \${entrega.link}\`,
      'DIRECT — CHECKOUT DIRETO ENVIADO',
      { canal: 'Direct', idDirect: senderId, produto: entrega.nome, etapa: 'PRODUTO_ENTREGUE', status: 'checkout enviado direto', temperatura: 'quente', linkSugerido: entrega.link }
    );
    return;
  }

  const slug = slugEntrega(entrega);`,
  'checkout direto no direct'
);

patch(
  `// ================= FUNIL POR BOTÕES =================`,
  `// ================= ATENDIMENTO HUMANO =================

function ehComandoHumano(texto = '') {
  const t = normalizar(texto).replace(/[^A-Z0-9 ]/g, '').trim();
  return t === 'ASSUMIR' || t === 'LIBERAR';
}

function tipoComandoHumano(texto = '') {
  const t = normalizar(texto).replace(/[^A-Z0-9 ]/g, '').trim();
  if (t === 'ASSUMIR') return 'assumir';
  if (t === 'LIBERAR') return 'liberar';
  return '';
}

function ehOperador(event) {
  const sender = String(event?.sender?.id || '');
  return Boolean(event?.message?.is_echo) || sender === String(IG_USER_ID) || sender === String(PAGE_ID);
}

function obterAlvoHumano(event) {
  const ids = [event?.recipient?.id, event?.message?.recipient?.id, event?.postback?.recipient?.id, event?.sender?.id]
    .map(v => String(v || '')).filter(Boolean);
  return ids.find(id => id !== String(IG_USER_ID) && id !== String(PAGE_ID)) || '';
}

async function executarComandoHumano(senderId, texto) {
  const comando = tipoComandoHumano(texto);
  const usuarioDirect = \`ig_user_\${senderId}\`;

  if (comando === 'assumir') {
    atendimentosHumanos.set(String(senderId), { atualizadoEm: Date.now() });
    clearEstadoDirect(senderId);
    await notificarAlberto(usuarioDirect, 'Comando recebido: assumir.\n\nRobô pausado nesta conversa.', 'ATENDIMENTO HUMANO — ASSUMIDO', { canal: 'Direct', idDirect: senderId, etapa: 'ATENDIMENTO_HUMANO', status: 'robô pausado' });
    console.log(\`Atendimento humano ativado para \${senderId}\`);
    return;
  }

  if (comando === 'liberar') {
    atendimentosHumanos.delete(String(senderId));
    clearEstadoDirect(senderId);
    await notificarAlberto(usuarioDirect, 'Comando recebido: liberar.\n\nRobô reativado nesta conversa.', 'ATENDIMENTO HUMANO — LIBERADO', { canal: 'Direct', idDirect: senderId, etapa: 'ROBO_ATIVO', status: 'robô ativo' });
    console.log(\`Atendimento automático reativado para \${senderId}\`);
  }
}

function humanoAtivo(senderId) {
  const estado = atendimentosHumanos.get(String(senderId));
  if (!estado) return false;
  if (Date.now() - estado.atualizadoEm > TEMPO_ATENDIMENTO_HUMANO_MS) {
    atendimentosHumanos.delete(String(senderId));
    return false;
  }
  return true;
}

// ================= FUNIL POR BOTÕES =================`,
  'funções de atendimento humano'
);

if (!ok) {
  console.warn('Camada runtime não aplicada. Subindo server.js original para evitar queda.');
  await import(pathToFileURL(sourcePath).href);
} else {
  fs.writeFileSync(runtimePath, source, 'utf8');
  console.log('Camada runtime ativa: checkout direto + assumir/liberar.');
  await import(pathToFileURL(runtimePath).href);
}
