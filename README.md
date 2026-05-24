# 🤖 Bot Instagram: Comentário → DM com Planilha

Quando alguém comenta **FINANCEIRO** num post/Reel, o bot:
1. Responde no comentário: *"@usuario te mandei no direct! 📩"*
2. Envia DM com o link da planilha

---

## ⚠️ Pré-requisitos

- Conta Instagram **Profissional** (Criador ou Empresa) — em Configurações → Tipo de conta
- **Página do Facebook** vinculada à conta do Instagram (obrigatório pela Meta)
- Conta no [Meta for Developers](https://developers.facebook.com)
- Conta no [Railway](https://railway.app) (free tier serve)
- Link público da planilha (Google Drive com "qualquer um com o link")

---

## Parte 1 — Criar o App na Meta

1. Acesse https://developers.facebook.com/apps → **Criar App**
2. Tipo: **"Empresa"** (Business)
3. Adicione os produtos:
   - **Instagram** → *Configurar*
   - **Webhooks** → *Configurar*
4. Em **Instagram → Configurações da API**:
   - Conecte sua conta do Instagram profissional
   - Anote o **Instagram User ID** (número grande) → vai virar `IG_USER_ID`
5. Em **Configurações do App → Básico**:
   - Anote a **Chave Secreta do App** (App Secret) → vai virar `APP_SECRET`

---

## Parte 2 — Deploy no Railway

1. Crie uma conta em https://railway.app (login com GitHub é o mais fácil)
2. Suba esta pasta pro GitHub (repositório novo)
3. No Railway: **New Project → Deploy from GitHub repo** → escolha seu repo
4. Aguarde o build (~2 min). Railway gera uma URL tipo `https://seu-app.up.railway.app`
5. Em **Settings → Variables**, adicione TODAS as variáveis do `.env.example`:

| Variável | O que é | Onde pego |
|---|---|---|
| `VERIFY_TOKEN` | Senha que VOCÊ inventa | Qualquer string aleatória, ex: `meu_token_xyz_2024` |
| `APP_SECRET` | Chave secreta do app | Meta → Configurações do App → Básico |
| `ACCESS_TOKEN` | Token longa duração | Parte 3 abaixo |
| `IG_USER_ID` | ID da sua conta IG | Meta → Instagram → API Setup |
| `PALAVRA_CHAVE` | Gatilho | `FINANCEIRO` |
| `LINK_PLANILHA` | Link público da planilha | Google Drive |
| `MENSAGEM_DM` | Texto da DM | Personalize como quiser |

Após salvar variáveis, o Railway redeploya sozinho.

---

## Parte 3 — Token de Acesso Longa Duração

O token curto dura 1h; o longo dura 60 dias e você renova depois.

1. Vá em https://developers.facebook.com/tools/explorer
2. Selecione seu app, clique em **Generate Access Token**
3. Permissões necessárias:
   - `instagram_basic`
   - `instagram_manage_comments`
   - `instagram_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
4. Copie o token curto gerado
5. Troque por longa duração:
   ```
   https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=SEU_APP_ID&client_secret=SEU_APP_SECRET&fb_exchange_token=TOKEN_CURTO
   ```
   Abra essa URL no navegador (substituindo os valores). Vai retornar o token de 60 dias.
6. Cole no Railway em `ACCESS_TOKEN`

---

## Parte 4 — Conectar Webhook ao Railway

1. No Meta for Developers → seu app → **Webhooks**
2. Escolha **Instagram** no dropdown → *Subscribe*
3. **Callback URL**: `https://seu-app.up.railway.app/webhook`
4. **Verify Token**: o mesmo valor que você pôs em `VERIFY_TOKEN`
5. Clique **Verify and Save** — se aparecer ✅, deu certo
6. Marque o evento: **`comments`** → *Subscribe*

7. Inscreva sua conta IG para receber eventos:
   ```bash
   curl -X POST "https://graph.instagram.com/v21.0/SEU_IG_USER_ID/subscribed_apps?subscribed_fields=comments&access_token=SEU_ACCESS_TOKEN"
   ```

---

## Parte 5 — Testar

1. Publique um Reel/post na conta profissional
2. **De outra conta**, comente: **FINANCEIRO**
3. Em segundos:
   - O comentário recebe resposta pública
   - A outra conta recebe DM com o link

Veja os logs no Railway (aba **Deployments → View Logs**) para debugar.

---

## ⚠️ Limitações importantes

- **Janela de 24h**: a Meta só deixa enviar DM se o usuário já interagiu nos últimos 24h. Comentário conta como interação, então funciona.
- **Modo Desenvolvimento**: o app começa em modo dev. Só testers cadastrados recebem. Para todos os seguidores funcionarem, você precisa submeter o app para **App Review** com as permissões `instagram_manage_messages` e `instagram_manage_comments`. A Meta aprova em geral em 3-7 dias.
- **Token expira em 60 dias**: configure um lembrete pra renovar, ou implemente refresh automático.
- **Conta vinculada**: a conta IG precisa estar vinculada a uma Página do Facebook.

---

## Renovar token (a cada 60 dias)

```bash
curl -X GET "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=SEU_TOKEN_ATUAL"
```

Cole o novo em `ACCESS_TOKEN` no Railway.

---

## Estrutura

```
ig-bot/
├── server.js          ← código principal
├── package.json
├── railway.json
├── .env.example
└── README.md
```

## Dúvidas comuns

**"Webhook não verifica"** → confira se `VERIFY_TOKEN` no Railway é exatamente o mesmo que você digitou no painel da Meta.

**"Comentário recebe match nos logs mas DM falha"** → seu app provavelmente está em modo Dev. Submeta pro App Review ou adicione a conta de teste em *Roles → Test Users*.

**"Funciona pra mim mas não pros seguidores"** → mesmo motivo acima: App Review.
