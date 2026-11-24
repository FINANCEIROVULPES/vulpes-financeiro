/* Login da versão web (Supabase Auth).
 * - Entrar com e-mail e senha.
 * - "Primeiro acesso / esqueci a senha": envia um link por e-mail para criar uma senha nova.
 * - Ao abrir um link de convite ou de nova senha, pede a senha antes de entrar.
 * - Só entra quem está cadastrada como sócia (tabela socias). Outros e-mails veem um aviso.
 */
(function (V) {
  'use strict';
  const U = V.util;

  // Lê o tipo do link antes que o Supabase limpe o endereço (#access_token=...&type=invite|recovery).
  const rawHash = window.location.hash || '';
  const linkType = (/[#&]type=(invite|recovery|signup|magiclink)/.exec(rawHash) || [])[1] || null;
  const linkError = (/[#&]error_description=([^&]+)/.exec(rawHash) || [])[1] || null;

  let client = null;
  if (window.supabase && V.config && V.config.supabaseUrl) {
    client = window.supabase.createClient(V.config.supabaseUrl, V.config.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
  }

  const box = (inner) =>
    '<div class="auth-wrap"><div class="auth-card">' +
    '<div class="auth-brand"><img src="' + V.brand.emblem + '" alt="Vulpes"><div><strong>Vulpes</strong><span>Financeiro</span></div></div>' +
    inner + '</div></div>';

  function msg(el, text, bad) {
    const m = el.querySelector('[data-msg]');
    m.textContent = text || '';
    m.className = 'auth-msg' + (bad ? ' bad' : '');
  }

  function busy(btn, on, label) {
    btn.disabled = on;
    if (label) btn.textContent = on ? 'Aguarde…' : label;
  }

  function cleanUrl() {
    try { history.replaceState(null, '', window.location.pathname + '#painel'); } catch (e) { window.location.hash = 'painel'; }
  }

  function loginScreen(root, resolve, notice) {
    root.innerHTML = box(
      '<h1>Entrar</h1><p class="auth-sub">Acesso restrito às sócias da Vulpes.</p>' +
      '<form data-login novalidate>' +
      '<div class="field"><label for="a-email">E-mail</label><input class="input" id="a-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="a-pass">Senha</label><input class="input" id="a-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn primary auth-btn" type="submit">Entrar</button>' +
      '<p class="auth-msg" data-msg></p>' +
      '<button class="auth-link" type="button" data-forgot>Primeiro acesso ou esqueci a senha</button>' +
      '</form>');
    if (notice) msg(root, notice.text, notice.bad);
    const form = root.querySelector('[data-login]');
    const btn = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = form.querySelector('#a-email').value.trim().toLowerCase();
      const password = form.querySelector('#a-pass').value;
      if (!email || !password) { msg(root, 'Informe e-mail e senha.', true); return; }
      busy(btn, true, 'Entrar');
      const { error } = await client.auth.signInWithPassword({ email, password });
      busy(btn, false, 'Entrar');
      if (error) { msg(root, 'E-mail ou senha incorretos.', true); return; }
      checkSocia(root, resolve);
    });
    root.querySelector('[data-forgot]').addEventListener('click', () => forgotScreen(root, resolve, form.querySelector('#a-email').value.trim()));
    setTimeout(() => { const f = root.querySelector('#a-email'); if (f) f.focus(); }, 0);
  }

  function forgotScreen(root, resolve, email) {
    root.innerHTML = box(
      '<h1>Criar ou trocar senha</h1><p class="auth-sub">Enviamos um link para o seu e-mail. Abra o link neste aparelho e crie a senha.</p>' +
      '<form data-forgot-form novalidate>' +
      '<div class="field"><label for="f-email">E-mail</label><input class="input" id="f-email" type="email" autocomplete="username" required value="' + U.esc(email || '') + '"></div>' +
      '<button class="btn primary auth-btn" type="submit">Enviar link</button>' +
      '<p class="auth-msg" data-msg></p>' +
      '<button class="auth-link" type="button" data-back>Voltar para o login</button>' +
      '</form>');
    const form = root.querySelector('[data-forgot-form]');
    const btn = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const value = form.querySelector('#f-email').value.trim().toLowerCase();
      if (!value) { msg(root, 'Informe o e-mail.', true); return; }
      busy(btn, true, 'Enviar link');
      await client.auth.resetPasswordForEmail(value, { redirectTo: window.location.origin + window.location.pathname });
      busy(btn, false, 'Enviar link');
      // Mesma resposta para qualquer e-mail: não revela quem tem conta.
      msg(root, 'Se este e-mail tiver acesso, o link chega em alguns minutos. Confira também o spam.');
    });
    root.querySelector('[data-back]').addEventListener('click', () => loginScreen(root, resolve));
  }

  function newPasswordScreen(root, resolve, isInvite) {
    root.innerHTML = box(
      '<h1>' + (isInvite ? 'Bem-vinda!' : 'Nova senha') + '</h1><p class="auth-sub">' +
      (isInvite ? 'Crie a sua senha para acessar o sistema.' : 'Escolha a nova senha de acesso.') + '</p>' +
      '<form data-pass-form novalidate>' +
      '<div class="field"><label for="p1">Senha</label><input class="input" id="p1" type="password" autocomplete="new-password" required minlength="8"><span class="hint">Pelo menos 8 caracteres.</span></div>' +
      '<div class="field"><label for="p2">Repita a senha</label><input class="input" id="p2" type="password" autocomplete="new-password" required></div>' +
      '<button class="btn primary auth-btn" type="submit">Salvar senha e entrar</button>' +
      '<p class="auth-msg" data-msg></p>' +
      '</form>');
    const form = root.querySelector('[data-pass-form]');
    const btn = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const p1 = form.querySelector('#p1').value, p2 = form.querySelector('#p2').value;
      if (p1.length < 8) { msg(root, 'A senha precisa ter pelo menos 8 caracteres.', true); return; }
      if (p1 !== p2) { msg(root, 'As duas senhas não são iguais.', true); return; }
      busy(btn, true, 'Salvar senha e entrar');
      const { error } = await client.auth.updateUser({ password: p1 });
      busy(btn, false, 'Salvar senha e entrar');
      if (error) { msg(root, 'Não foi possível salvar a senha. O link pode ter expirado: peça outro.', true); return; }
      cleanUrl();
      checkSocia(root, resolve);
    });
  }

  async function checkSocia(root, resolve) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) { loginScreen(root, resolve); return; }
    const { data, error } = await client.from('socias').select('nome,email').eq('user_id', session.user.id).maybeSingle();
    if (error || !data) {
      await client.auth.signOut();
      loginScreen(root, resolve, { text: 'Este e-mail não tem acesso ao sistema financeiro.', bad: true });
      return;
    }
    V.auth.user = { id: session.user.id, email: data.email, nome: data.nome };
    if (!/^#[a-z]/.test(window.location.hash)) cleanUrl();
    resolve(V.auth.user);
  }

  /* Mostra o login quando preciso e só libera o app com uma sócia logada. */
  function gate(root) {
    return new Promise(async (resolve) => {
      if (linkError) {
        cleanUrl();
        loginScreen(root, resolve, { text: 'O link não é mais válido. Peça um novo em "Primeiro acesso ou esqueci a senha".', bad: true });
        return;
      }
      const { data: { session } } = await client.auth.getSession();
      if (session && (linkType === 'invite' || linkType === 'recovery')) { newPasswordScreen(root, resolve, linkType === 'invite'); return; }
      if (session) { checkSocia(root, resolve); return; }
      loginScreen(root, resolve);
    });
  }

  async function signOut() {
    try { await client.auth.signOut(); } finally { window.location.hash = ''; window.location.reload(); }
  }

  V.auth = { client, gate, signOut, user: null, enabled: !!client };
})(window.Vulpes = window.Vulpes || {});
