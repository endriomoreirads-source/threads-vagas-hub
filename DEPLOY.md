# 🚀 Como Colocar o Threads Vagas Hub Online na Nuvem

Este projeto já está 100% pronto para rodar em produção na nuvem 24h por dia.

---

### Opção 1: Deploy Grátis no Render.com (Recomendado)

O Render permite rodar aplicações Node.js gratuitas com HTTPS automático:

1. Crie uma conta gratuita em [render.com](https://render.com).
2. Conecte seu repositório GitHub (crie um repo no GitHub e dê `git push` deste projeto).
3. No painel do Render, clique em **New +** -> **Web Service**.
4. Selecione o repositório do projeto.
5. As configurações já estão pré-definidas no arquivo `render.yaml`:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
6. Clique em **Deploy Web Service**.
7. Pronto! Em instantes seu site estará no ar em uma URL como: `https://threads-vagas-hub.onrender.com`.

---

### Opção 2: Deploy no Railway.app

1. Crie uma conta em [railway.app](https://railway.app).
2. Clique em **New Project** -> **Deploy from GitHub repo**.
3. Selecione o repositório. O Railway detectará o `Dockerfile` ou `package.json` automaticamente.
4. Vá em **Settings** -> **Generate Domain** para obter sua URL pública com HTTPS.

---

### Opção 3: Link Imediato a partir do seu Mac (Sem criar conta na nuvem)

Se você quiser enviar o link imediatamente para amigos enquanto o seu Mac estiver ligado, você pode rodar:

```bash
# Opção via SSH Pinggy (gera um link https instantâneo):
ssh -p 443 -R0:localhost:3456 a.pinggy.io

# Ou via Localtunnel (npx):
npx localtunnel --port 3456
```

O terminal exibirá uma URL pública segura (ex: `https://xyz.loca.lt` ou `https://xyz.a.pinggy.io`) que qualquer pessoa pode acessar pelo celular ou computador.
