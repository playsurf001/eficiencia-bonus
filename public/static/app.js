/* =====================================================
 *  CorePro Eficiência — SPA Frontend
 *  Gestão de Produção e Bonificação Mensal
 *  "Onde sistemas se tornam negócio"
 * ===================================================== */

// ---------- Estado global ----------
const state = {
  route: 'overview',
  ano: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
  stats: null,           // /api/stats
  evolucao: null,        // /api/stats/evolucao
  costureiros: [],
  operacoes: [],
  config: null,
  selectedCostureiroId: null,
  perfil: null,
  simulacao: null,
  theme: localStorage.getItem('theme') || 'auto',
  user: null,            // usuário autenticado
  token: localStorage.getItem('cs_token') || null,
};

// ---------- Utilitários ----------
const fmt = {
  num: (n, d = 0) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  pct: (n, d = 1) => `${(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`,
  money: (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  date: (s) => {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  },
  dateShort: (s) => {
    if (!s) return '';
    const [_, m, d] = s.split('-');
    return `${d}/${m}`;
  },
};

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${msg}`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; }, 2400);
  setTimeout(() => t.remove(), 2800);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    // Sessão expirada — voltar ao login
    state.token = null; state.user = null;
    localStorage.removeItem('cs_token');
    if (state.route !== 'login') { renderLogin(); throw new Error('Sessão expirada'); }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Upload de arquivos (multipart/form-data)
async function apiUpload(path, formData) {
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { method: 'POST', credentials: 'include', headers, body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ---------- Layout ----------
const ICONS = {
  overview: 'fa-gauge-high',
  ranking: 'fa-trophy',
  perfil: 'fa-user-chart',
  bonus: 'fa-hand-holding-dollar',
  producao: 'fa-clipboard-list',
  costureiros: 'fa-users',
  operacoes: 'fa-gears',
  importar: 'fa-file-import',
  usuarios: 'fa-user-shield',
  config: 'fa-sliders',
};

// Permissões por role
const ROLE_PERMS = {
  admin:    ['overview','ranking','perfil','bonus','producao','costureiros','operacoes','importar','usuarios','config'],
  gestor:   ['overview','ranking','perfil','bonus','producao','costureiros','operacoes','importar','config'],
  operador: ['overview','ranking','perfil','bonus','producao','costureiros'],
  viewer:   ['overview','ranking','perfil','bonus'],
};
function canAccess(route) {
  if (!state.user) return ['overview','ranking','perfil','bonus','producao','costureiros','operacoes','config'].includes(route); // demo público
  const perms = ROLE_PERMS[state.user.role] || [];
  return perms.includes(route);
}

function renderLayout() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <div class="flex min-h-screen">
      <!-- Sidebar -->
      <aside id="sidebar" class="hidden md:flex flex-col w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        <div class="p-5 border-b border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-3">
            <img src="/static/brand/icon-192.png" alt="CorePro" class="logo-icon w-10 h-10 rounded-xl shadow-sm" />
            <div>
              <div class="font-bold text-slate-900 dark:text-white leading-tight">CorePro <span class="text-accent-500" style="color:#e53e24">Eficiência</span></div>
              <div class="text-[11px] text-slate-500">Onde sistemas se tornam negócio</div>
            </div>
          </div>
        </div>
        <nav class="flex-1 p-3 space-y-1 overflow-y-auto">
          <div class="px-2 py-2 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Painéis</div>
          <div class="nav-item" data-route="overview"><i class="fas ${ICONS.overview} w-5"></i> Visão Geral</div>
          <div class="nav-item" data-route="ranking"><i class="fas ${ICONS.ranking} w-5"></i> Ranking</div>
          <div class="nav-item" data-route="perfil"><i class="fas ${ICONS.perfil} w-5"></i> Perfil Individual</div>
          <div class="nav-item" data-route="bonus"><i class="fas ${ICONS.bonus} w-5"></i> Bonificação</div>

          <div class="px-2 py-2 mt-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Cadastros</div>
          <div class="nav-item" data-route="producao"><i class="fas ${ICONS.producao} w-5"></i> Produção</div>
          <div class="nav-item" data-route="costureiros"><i class="fas ${ICONS.costureiros} w-5"></i> Costureiros</div>
          <div class="nav-item" data-route="operacoes"><i class="fas ${ICONS.operacoes} w-5"></i> Operações</div>

          <div class="px-2 py-2 mt-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">Administração</div>
          <div class="nav-item" data-route="importar"><i class="fas ${ICONS.importar} w-5"></i> Importar XLSX</div>
          <div class="nav-item" data-route="usuarios"><i class="fas ${ICONS.usuarios} w-5"></i> Usuários</div>
          <div class="nav-item" data-route="config"><i class="fas ${ICONS.config} w-5"></i> Configurações</div>
        </nav>
        <div class="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          ${state.user ? `
            <div class="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div class="w-9 h-9 rounded-full gradient-bg text-white font-bold flex items-center justify-center text-sm">${(state.user.nome || '?')[0].toUpperCase()}</div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm truncate">${state.user.nome}</div>
                <div class="text-[11px] text-slate-500 truncate">${state.user.empresa_nome || ''}</div>
              </div>
            </div>
            <button id="logout-btn" class="btn btn-ghost w-full justify-start text-sm"><i class="fas fa-right-from-bracket"></i> Sair</button>
          ` : `
            <button id="login-btn" class="btn btn-primary w-full"><i class="fas fa-right-to-bracket"></i> Entrar</button>
          `}
          <button id="theme-toggle" class="btn btn-ghost w-full justify-start">
            <i class="fas fa-moon"></i> <span id="theme-label">Tema</span>
          </button>
        </div>
      </aside>

      <!-- Main -->
      <main class="flex-1 min-w-0">
        <!-- Topbar -->
        <header class="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
          <div class="flex items-center gap-3 px-5 py-3">
            <button id="mobile-menu" class="md:hidden btn btn-ghost p-2"><i class="fas fa-bars"></i></button>
            <img src="/static/brand/icon-192.png" alt="CorePro" class="md:hidden w-8 h-8 rounded-lg" />
            <h1 id="page-title" class="font-bold text-lg md:text-xl">Visão Geral</h1>
            <div class="flex-1"></div>
            <div class="flex items-center gap-2 no-print">
              <select id="mes-select" class="input py-2 px-3 text-sm w-36"></select>
              <select id="ano-select" class="input py-2 px-3 text-sm w-24"></select>
              <button id="print-btn" class="btn btn-secondary hidden md:inline-flex" title="Exportar PDF">
                <i class="fas fa-file-pdf"></i> PDF
              </button>
            </div>
          </div>
        </header>
        <!-- Print header (só aparece no PDF) -->
        <div class="hidden print:flex items-center gap-4 px-8 py-4 border-b-2" style="border-color:#1f83ad">
          <img src="/static/brand/icon-192.png" alt="CorePro" style="width:56px;height:56px" />
          <div>
            <div style="font-size:22px;font-weight:800;color:#194960">CorePro Eficiência</div>
            <div style="font-size:11px;color:#64748b">Relatório gerado em <span id="print-date"></span> — Onde sistemas se tornam negócio</div>
          </div>
        </div>

        <div id="view" class="p-5 md:p-6 fade-in"></div>
      </main>
    </div>

    <!-- Mobile menu drawer -->
    <div id="drawer" class="hidden fixed inset-0 z-40">
      <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" id="drawer-backdrop"></div>
      <div class="absolute left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-900 p-4 overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
          <div class="font-bold">Menu</div>
          <button id="drawer-close" class="btn btn-ghost p-2"><i class="fas fa-times"></i></button>
        </div>
        <div id="drawer-nav" class="space-y-1"></div>
      </div>
    </div>
  `;

  // Popular selects de período
  const anoSel = document.getElementById('ano-select');
  const mesSel = document.getElementById('mes-select');
  const thisYear = new Date().getFullYear();
  for (let y = thisYear - 2; y <= thisYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === state.ano) opt.selected = true;
    anoSel.appendChild(opt);
  }
  MESES.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1; opt.textContent = m;
    if (i + 1 === state.mes) opt.selected = true;
    mesSel.appendChild(opt);
  });
  anoSel.addEventListener('change', async (e) => { state.ano = Number(e.target.value); await refreshPeriodo(); });
  mesSel.addEventListener('change', async (e) => { state.mes = Number(e.target.value); await refreshPeriodo(); });

  // Navegação — filtrar por permissão
  document.querySelectorAll('.nav-item').forEach((el) => {
    const route = el.dataset.route;
    if (!canAccess(route)) { el.style.display = 'none'; return; }
    el.addEventListener('click', () => navigate(route));
  });
  // Login/Logout
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', () => renderLogin());
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

  // Mobile drawer: clonar nav
  const drawerNav = document.getElementById('drawer-nav');
  drawerNav.innerHTML = document.querySelector('#sidebar nav').innerHTML;
  drawerNav.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => { navigate(el.dataset.route); document.getElementById('drawer').classList.add('hidden'); });
  });
  document.getElementById('mobile-menu').addEventListener('click', () => document.getElementById('drawer').classList.remove('hidden'));
  document.getElementById('drawer-close').addEventListener('click', () => document.getElementById('drawer').classList.add('hidden'));
  document.getElementById('drawer-backdrop').addEventListener('click', () => document.getElementById('drawer').classList.add('hidden'));

  // Tema
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  updateThemeLabel();

  // Print
  document.getElementById('print-btn').addEventListener('click', () => {
    const d = new Date();
    const dateEl = document.getElementById('print-date');
    if (dateEl) dateEl.textContent = d.toLocaleString('pt-BR');
    window.print();
  });
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeLabel();
  // Recarregar charts (Chart.js não aplica dark automaticamente)
  if (state.route === 'overview' && state.stats) renderOverview();
  if (state.route === 'perfil' && state.perfil) renderPerfil();
  if (state.route === 'bonus' && state.stats) renderBonus();
}

function updateThemeLabel() {
  const isDark = document.documentElement.classList.contains('dark');
  const icon = document.querySelector('#theme-toggle i');
  const label = document.getElementById('theme-label');
  if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
  if (label) label.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
}

async function refreshPeriodo() {
  // Recarrega dados para todas as telas
  state.stats = null;
  state.evolucao = null;
  state.perfil = null;
  state.simulacao = null;
  await navigate(state.route);
}

async function navigate(route) {
  if (!canAccess(route)) {
    toast('Você não tem permissão para acessar esta área', 'error');
    return;
  }
  state.route = route;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  const titles = {
    overview: 'Visão Geral',
    ranking: 'Ranking de Costureiros',
    perfil: 'Perfil Individual',
    bonus: 'Controle de Bonificação',
    producao: 'Registros de Produção',
    costureiros: 'Costureiros',
    operacoes: 'Operações',
    importar: 'Importar Planilha XLSX',
    usuarios: 'Gestão de Usuários',
    config: 'Configurações do Sistema',
  };
  document.getElementById('page-title').textContent = titles[route] || '';
  const view = document.getElementById('view');
  view.classList.remove('fade-in');
  void view.offsetWidth;
  view.classList.add('fade-in');
  view.innerHTML = `<div class="flex justify-center py-20"><div class="loader"></div></div>`;

  try {
    if (route === 'overview') await viewOverview();
    else if (route === 'ranking') await viewRanking();
    else if (route === 'perfil') await viewPerfil();
    else if (route === 'bonus') await viewBonus();
    else if (route === 'producao') await viewProducao();
    else if (route === 'costureiros') await viewCostureiros();
    else if (route === 'operacoes') await viewOperacoes();
    else if (route === 'importar') await viewImportar();
    else if (route === 'usuarios') await viewUsuarios();
    else if (route === 'config') await viewConfig();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card text-red-500"><i class="fas fa-exclamation-triangle mr-2"></i>Erro: ${e.message}</div>`;
  }
}

// =====================================================
// LOGIN / REGISTRO
// =====================================================
function renderLogin() {
  state.route = 'login';
  const root = document.getElementById('app');
  root.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
      <div class="max-w-md w-full">
        <div class="text-center mb-6">
          <img src="/static/brand/icon-192.png" alt="CorePro Eficiência" width="96" height="96" class="mx-auto rounded-2xl shadow-xl" />
          <h1 class="text-3xl font-extrabold mt-4">
            CorePro <span style="background:linear-gradient(90deg,#c42e17,#e53e24,#f97316);-webkit-background-clip:text;background-clip:text;color:transparent;">Eficiência</span>
          </h1>
          <p class="text-slate-500 text-sm">Gestão Inteligente de Produção e Bonificação</p>
          <p class="text-xs text-slate-400 mt-1 italic">Onde sistemas se tornam negócio</p>
        </div>
        <div class="card">
          <div class="flex gap-2 mb-5">
            <button id="tab-login" class="flex-1 py-2 font-semibold border-b-2 border-brand-500 text-brand-600">Entrar</button>
            <button id="tab-register" class="flex-1 py-2 font-semibold border-b-2 border-transparent text-slate-500">Criar conta</button>
          </div>
          <form id="login-form" class="space-y-3">
            <div>
              <label class="text-xs font-semibold text-slate-500">E-mail</label>
              <input id="l-email" type="email" required class="input" placeholder="seu@email.com" autocomplete="email"/>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Senha</label>
              <input id="l-senha" type="password" required class="input" placeholder="••••••••" autocomplete="current-password"/>
            </div>
            <button class="btn btn-primary w-full"><i class="fas fa-right-to-bracket"></i> Entrar</button>
          </form>
          <form id="register-form" class="space-y-3 hidden">
            <div>
              <label class="text-xs font-semibold text-slate-500">Nome da Empresa</label>
              <input id="r-empresa" class="input" placeholder="Minha Confecção Ltda"/>
              <p class="text-[11px] text-slate-500 mt-1">Deixe vazio para entrar na empresa demonstração</p>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Seu nome</label>
              <input id="r-nome" required class="input" placeholder="João Silva"/>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">E-mail</label>
              <input id="r-email" type="email" required class="input" placeholder="seu@email.com"/>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Senha (mín. 6 caracteres)</label>
              <input id="r-senha" type="password" required minlength="6" class="input" placeholder="••••••••"/>
            </div>
            <button class="btn btn-primary w-full"><i class="fas fa-user-plus"></i> Criar conta</button>
          </form>
          <div class="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700 text-center">
            <button id="demo-btn" class="text-sm text-brand-600 font-semibold hover:underline">
              <i class="fas fa-eye mr-1"></i>Continuar como visitante (modo demonstração)
            </button>
          </div>
        </div>
        <div class="mt-4 p-3 bg-slate-100 dark:bg-slate-800/50 rounded-xl text-xs text-slate-600 dark:text-slate-400">
          <div class="font-semibold mb-1"><i class="fas fa-info-circle"></i> Contas de teste:</div>
          <div>• <b>admin@demo.com</b> / demo123 — Admin com acesso total</div>
          <div>• <b>gestor@demo.com</b> / demo123 — Gestor (sem gestão de usuários)</div>
          <div>• <b>operador@demo.com</b> / demo123 — Apenas cadastros</div>
        </div>
      </div>
    </div>
  `;

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('border-brand-500','text-brand-600');
    tabLogin.classList.remove('border-transparent','text-slate-500');
    tabRegister.classList.add('border-transparent','text-slate-500');
    tabRegister.classList.remove('border-brand-500','text-brand-600');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  });
  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('border-brand-500','text-brand-600');
    tabRegister.classList.remove('border-transparent','text-slate-500');
    tabLogin.classList.add('border-transparent','text-slate-500');
    tabLogin.classList.remove('border-brand-500','text-brand-600');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: {
        email: document.getElementById('l-email').value,
        senha: document.getElementById('l-senha').value,
      }});
      state.token = r.token; state.user = r.user;
      localStorage.setItem('cs_token', r.token);
      toast(`Bem-vindo, ${r.user.nome}!`, 'success');
      state.stats = null;
      renderLayout();
      await navigate('overview');
    } catch (err) { toast(err.message, 'error'); }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: {
        nome: document.getElementById('r-nome').value,
        email: document.getElementById('r-email').value,
        senha: document.getElementById('r-senha').value,
        empresa_nome: document.getElementById('r-empresa').value,
      }});
      state.token = r.token; state.user = r.user;
      localStorage.setItem('cs_token', r.token);
      toast('Conta criada com sucesso!', 'success');
      state.stats = null;
      renderLayout();
      await navigate('overview');
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('demo-btn').addEventListener('click', () => {
    state.user = null; state.token = null;
    localStorage.removeItem('cs_token');
    renderLayout();
    navigate('overview');
  });
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
  state.user = null; state.token = null; state.stats = null;
  localStorage.removeItem('cs_token');
  toast('Sessão encerrada', 'success');
  renderLogin();
}

// =====================================================
// IMPORTAR XLSX
// =====================================================
async function viewImportar() {
  document.getElementById('view').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="card lg:col-span-2">
        <h3 class="font-bold text-lg mb-2"><i class="fas fa-file-import text-brand-500 mr-2"></i>Importar Planilha de Produção</h3>
        <p class="text-sm text-slate-500 mb-4">
          Faça upload de planilhas XLSX existentes. O sistema detecta automaticamente o formato SENAI
          (1 aba por costureiro) ou planilhas simples com cabeçalhos padrão.
        </p>
        <form id="import-form" class="space-y-4">
          <div>
            <label class="text-xs font-semibold text-slate-500">Arquivo .xlsx</label>
            <div id="drop-zone" class="mt-1 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition">
              <i class="fas fa-cloud-arrow-up text-4xl text-slate-400"></i>
              <div class="mt-2 font-semibold" id="drop-label">Clique ou arraste um arquivo XLSX aqui</div>
              <div class="text-xs text-slate-500 mt-1">Tamanho máximo: 10MB</div>
              <input id="file-input" type="file" accept=".xlsx,.xls" class="hidden"/>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-semibold text-slate-500">Ano de referência</label>
              <input id="imp-ano" type="number" class="input" value="${state.ano}"/>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-500">Mês de referência</label>
              <select id="imp-mes" class="input">
                ${MESES.map((m, i) => `<option value="${i+1}" ${i+1 === state.mes ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input id="imp-substituir" type="checkbox" class="w-4 h-4"/>
            <span>Substituir produção existente deste mês (apaga registros anteriores)</span>
          </label>
          <button id="imp-submit" class="btn btn-primary w-full" disabled><i class="fas fa-upload"></i> Importar Planilha</button>
        </form>
        <div id="imp-result" class="hidden mt-4 p-4 rounded-xl"></div>
      </div>

      <div class="card">
        <h3 class="font-bold mb-3"><i class="fas fa-circle-info text-brand-500 mr-2"></i>Formatos Aceitos</h3>
        <div class="space-y-4 text-sm">
          <div>
            <div class="font-semibold mb-1">📋 Formato SENAI</div>
            <p class="text-slate-500 text-xs">Planilha com 1 aba por costureiro (01, 02, 03...), nome na célula C3, produção diária por linhas SEGUNDA/TERÇA/etc.</p>
          </div>
          <div>
            <div class="font-semibold mb-1">📊 Formato Simples</div>
            <p class="text-slate-500 text-xs mb-2">1 aba com cabeçalhos (pode variar):</p>
            <ul class="text-xs text-slate-500 space-y-0.5 list-disc pl-4">
              <li>data (obrigatório)</li>
              <li>costureiro / nome / colaborador</li>
              <li>operacao</li>
              <li>tempo_padrao_min / tempo</li>
              <li>quantidade_produzida / qtd</li>
              <li>minutos_trabalhados / minutos</li>
              <li>retrabalho (opcional)</li>
              <li>referencia / ref (opcional)</li>
            </ul>
          </div>
          <div class="pt-3 border-t border-slate-200 dark:border-slate-700">
            <div class="font-semibold mb-1">⚙️ O que acontece?</div>
            <ul class="text-xs text-slate-500 space-y-1 list-disc pl-4">
              <li>Costureiros novos são criados automaticamente</li>
              <li>Operações novas ganham dificuldade 1.0 (ajuste depois)</li>
              <li>Datas em formato DD/MM/YYYY ou ISO</li>
              <li>Empresa isolada (seus dados nunca se misturam)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const submitBtn = document.getElementById('imp-submit');
  let selectedFile = null;

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-brand-500'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-brand-500'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('border-brand-500');
    if (e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

  function setFile(f) {
    if (!f.name.match(/\.xlsx?$/i)) { toast('Selecione um arquivo .xlsx', 'error'); return; }
    if (f.size > 10 * 1024 * 1024) { toast('Arquivo maior que 10MB', 'error'); return; }
    selectedFile = f;
    document.getElementById('drop-label').innerHTML = `<i class="fas fa-file-excel text-emerald-500"></i> ${f.name} <span class="text-xs text-slate-500">(${(f.size/1024).toFixed(1)} KB)</span>`;
    submitBtn.disabled = false;
  }

  document.getElementById('import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<div class="loader" style="width:16px;height:16px;border-width:2px"></div> Importando...';
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('ano', document.getElementById('imp-ano').value);
    fd.append('mes', document.getElementById('imp-mes').value);
    fd.append('substituir_mes', document.getElementById('imp-substituir').checked ? 'true' : 'false');
    try {
      const r = await apiUpload('/api/import/xlsx', fd);
      const s = r.stats;
      const div = document.getElementById('imp-result');
      div.classList.remove('hidden');
      div.className = 'mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800';
      div.innerHTML = `
        <div class="font-semibold text-emerald-700 dark:text-emerald-400 mb-2"><i class="fas fa-circle-check mr-1"></i>Importação concluída!</div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-slate-500">Produções inseridas:</span> <b>${s.producoes_inseridas}</b></div>
          <div><span class="text-slate-500">Costureiros criados:</span> <b>${s.costureiros_criados}</b></div>
          <div><span class="text-slate-500">Costureiros existentes:</span> <b>${s.costureiros_encontrados}</b></div>
          <div><span class="text-slate-500">Operações criadas:</span> <b>${s.operacoes_criadas}</b></div>
        </div>
        ${s.avisos.length ? `<div class="mt-3 text-xs text-amber-600"><b>Avisos:</b><ul class="list-disc pl-4">${s.avisos.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
        ${s.erros.length ? `<div class="mt-3 text-xs text-red-600"><b>Erros:</b><ul class="list-disc pl-4">${s.erros.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
      `;
      toast(`${s.producoes_inseridas} produções importadas!`, 'success');
      state.stats = null; state.evolucao = null;
    } catch (err) {
      const div = document.getElementById('imp-result');
      div.classList.remove('hidden');
      div.className = 'mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400';
      div.innerHTML = `<i class="fas fa-triangle-exclamation mr-1"></i>${err.message}`;
      toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-upload"></i> Importar Planilha';
    }
  });
}

// =====================================================
// GESTÃO DE USUÁRIOS
// =====================================================
async function viewUsuarios() {
  const users = await api('/api/usuarios');
  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-bold text-lg">Usuários da Empresa</h3>
          <p class="text-sm text-slate-500">${users.length} cadastrados — controle quem acessa o sistema</p>
        </div>
        <button id="new-user" class="btn btn-primary"><i class="fas fa-user-plus"></i> Novo Usuário</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th class="p-3">Nome</th><th class="p-3">E-mail</th>
              <th class="p-3">Role</th><th class="p-3">Último login</th>
              <th class="p-3">Status</th><th class="p-3"></th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr class="t-row border-b border-slate-100 dark:border-slate-800">
                <td class="p-3 font-semibold">${u.nome}</td>
                <td class="p-3">${u.email}</td>
                <td class="p-3"><span class="badge ${u.role === 'admin' ? 'badge-alto' : u.role === 'gestor' ? 'badge-medio' : 'badge-baixo'}">${u.role}</span></td>
                <td class="p-3 text-xs text-slate-500">${u.ultimo_login ? fmt.date(u.ultimo_login.slice(0,10)) : 'Nunca'}</td>
                <td class="p-3">${u.ativo ? '<span class="text-emerald-600 text-xs font-semibold"><i class="fas fa-circle"></i> Ativo</span>' : '<span class="text-slate-400 text-xs">Inativo</span>'}</td>
                <td class="p-3 text-right">
                  <button class="btn btn-ghost p-1" onclick='editUser(${JSON.stringify(u)})'><i class="fas fa-pen text-xs"></i></button>
                  ${u.id !== state.user?.id ? `<button class="btn btn-ghost p-1 text-red-500" onclick="deleteUser(${u.id})"><i class="fas fa-trash text-xs"></i></button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('new-user').addEventListener('click', () => openUserModal());
}

window.editUser = (u) => openUserModal(u);
window.deleteUser = async (id) => {
  if (!confirm('Desativar este usuário?')) return;
  try { await api(`/api/usuarios/${id}`, { method: 'DELETE' }); toast('Usuário desativado', 'success'); await navigate('usuarios'); }
  catch (e) { toast(e.message, 'error'); }
};

function openUserModal(user = null) {
  const isEdit = !!user;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 class="font-bold text-lg">${isEdit ? 'Editar' : 'Novo'} Usuário</h3>
          <button class="btn btn-ghost p-2" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <div><label class="text-xs font-semibold text-slate-500">Nome</label>
            <input id="u-nome" class="input" value="${user?.nome || ''}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">E-mail</label>
            <input id="u-email" type="email" class="input" value="${user?.email || ''}" ${isEdit ? 'disabled' : ''}/></div>
          <div><label class="text-xs font-semibold text-slate-500">${isEdit ? 'Nova senha (deixe vazio para manter)' : 'Senha (mín. 6 caracteres)'}</label>
            <input id="u-senha" type="password" class="input" placeholder="••••••••"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Papel (Role)</label>
            <select id="u-role" class="input">
              <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin (acesso total + usuários)</option>
              <option value="gestor" ${user?.role === 'gestor' ? 'selected' : ''}>Gestor (administra tudo exceto usuários)</option>
              <option value="operador" ${user?.role === 'operador' ? 'selected' : ''}>Operador (lança produção)</option>
              <option value="viewer" ${user?.role === 'viewer' ? 'selected' : ''}>Visualizador (apenas leitura)</option>
            </select></div>
          ${isEdit ? `<div><label class="text-xs font-semibold text-slate-500">Status</label>
            <select id="u-ativo" class="input">
              <option value="1" ${user.ativo ? 'selected' : ''}>Ativo</option>
              <option value="0" ${!user.ativo ? 'selected' : ''}>Inativo</option>
            </select></div>` : ''}
        </div>
        <div class="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="saveUser(${user?.id || 'null'})"><i class="fas fa-save"></i> Salvar</button>
        </div>
      </div>
    </div>
  `);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
}

window.saveUser = async (id) => {
  const body = {
    nome: document.getElementById('u-nome').value,
    email: document.getElementById('u-email').value,
    senha: document.getElementById('u-senha').value,
    role: document.getElementById('u-role').value,
  };
  if (document.getElementById('u-ativo')) body.ativo = Number(document.getElementById('u-ativo').value);
  if (!body.nome) return toast('Nome obrigatório', 'error');
  try {
    if (id) {
      if (!body.senha) delete body.senha;
      await api(`/api/usuarios/${id}`, { method: 'PUT', body });
    } else {
      if (!body.email || !body.senha) return toast('E-mail e senha obrigatórios', 'error');
      await api('/api/usuarios', { method: 'POST', body });
    }
    toast('Salvo', 'success');
    closeModal();
    await navigate('usuarios');
  } catch (e) { toast(e.message, 'error'); }
};

// ---------- Loaders ----------
async function loadStats() {
  if (!state.stats) {
    state.stats = await api(`/api/stats?ano=${state.ano}&mes=${state.mes}`);
    state.config = state.stats.config;
  }
  return state.stats;
}
async function loadEvolucao() {
  if (!state.evolucao) {
    state.evolucao = await api(`/api/stats/evolucao?ano=${state.ano}&mes=${state.mes}`);
  }
  return state.evolucao;
}

// ---------- Helpers de UI ----------
function chartColors() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.08)',
    text: dark ? '#cbd5e1' : '#334155',
    brand: '#2ea2cc',
    brand2: '#e53e24',
    green: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    bgCard: dark ? '#0f172a' : '#ffffff',
  };
}

function kpiCard({ icon, label, value, sub, color = 'brand', accent }) {
  const colorMap = {
    brand: 'from-brand-500 to-brand-700',
    green: 'from-emerald-500 to-emerald-700',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-rose-500 to-red-700',
    purple: 'from-violet-500 to-purple-700',
  };
  return `
    <div class="kpi-card card">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center text-white text-lg shrink-0">
          <i class="fas ${icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold uppercase tracking-wider text-slate-500">${label}</div>
          <div class="text-2xl md:text-3xl font-bold mt-1 truncate">${value}</div>
          ${sub ? `<div class="text-xs text-slate-500 mt-1">${sub}</div>` : ''}
        </div>
        ${accent ? `<div class="text-xs font-semibold ${accent.cls}">${accent.text}</div>` : ''}
      </div>
    </div>
  `;
}

function badgeClasse(classe) {
  const map = {
    alto: { cls: 'badge-alto', icon: 'fa-arrow-trend-up', label: 'Alto' },
    medio: { cls: 'badge-medio', icon: 'fa-equals', label: 'Médio' },
    baixo: { cls: 'badge-baixo', icon: 'fa-arrow-trend-down', label: 'Baixo' },
  };
  const b = map[classe] || map.medio;
  return `<span class="badge ${b.cls}"><i class="fas ${b.icon}"></i> ${b.label}</span>`;
}

function barClasse(eficiencia) {
  if (eficiencia >= 85) return 'bar-high';
  if (eficiencia >= 70) return 'bar-med';
  return 'bar-low';
}

// =====================================================
// TELA 1 — VISÃO GERAL
// =====================================================
async function viewOverview() {
  const [stats, evo] = await Promise.all([loadStats(), loadEvolucao()]);
  const k = stats.kpis;

  document.getElementById('view').innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      ${kpiCard({
        icon: 'fa-tshirt', label: 'Produção Total', color: 'brand',
        value: fmt.num(k.total_producao),
        sub: `${k.total_costureiros} costureiros ativos`,
      })}
      ${kpiCard({
        icon: 'fa-bolt', label: 'Eficiência Média', color: 'purple',
        value: fmt.pct(k.eficiencia_media),
        sub: `Meta: ${fmt.pct(stats.config.eficiencia_meta, 0)}`,
      })}
      ${kpiCard({
        icon: 'fa-hand-holding-dollar', label: 'Total a Pagar', color: 'green',
        value: fmt.money(k.total_bonus),
        sub: `${k.costureiros_com_bonus} receberão bônus`,
      })}
      ${kpiCard({
        icon: 'fa-chart-line', label: 'Alto Desempenho', color: 'amber',
        value: k.alto_desempenho,
        sub: `${k.medio_desempenho} médio · ${k.baixo_desempenho} baixo`,
      })}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
      <div class="card lg:col-span-2">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-lg">Evolução Diária</h3>
            <p class="text-xs text-slate-500">Produção e eficiência ao longo do mês</p>
          </div>
          <i class="fas fa-chart-area text-brand-500 text-xl"></i>
        </div>
        <div class="h-72"><canvas id="chart-evo"></canvas></div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-lg">Distribuição</h3>
            <p class="text-xs text-slate-500">Costureiros por classe</p>
          </div>
          <i class="fas fa-chart-pie text-brand-500 text-xl"></i>
        </div>
        <div class="h-72"><canvas id="chart-dist"></canvas></div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-lg"><i class="fas fa-trophy text-amber-500 mr-2"></i>Top 5 Eficiência</h3>
          <button onclick="navigate('ranking')" class="text-xs text-brand-600 font-semibold hover:underline">Ver todos →</button>
        </div>
        <div class="space-y-2">
          ${[...stats.costureiros].sort((a,b) => b.eficiencia - a.eficiencia).slice(0,5).map((c, i) => `
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onclick="openPerfil(${c.costureiro_id})">
              <div class="w-8 h-8 rounded-full ${i===0?'bg-amber-500':i===1?'bg-slate-400':i===2?'bg-orange-600':'bg-slate-300 dark:bg-slate-600'} text-white font-bold flex items-center justify-center text-sm">${i+1}</div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">${c.nome}</div>
                <div class="text-xs text-slate-500">${c.tipo_maquina} · ${fmt.num(c.total_producao)} peças</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-emerald-600">${fmt.pct(c.eficiencia)}</div>
                <div class="text-xs text-slate-500">${fmt.money(c.bonus)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card">
        <h3 class="font-bold text-lg mb-3"><i class="fas fa-triangle-exclamation text-red-500 mr-2"></i>Atenção Necessária</h3>
        <div class="space-y-2">
          ${[...stats.costureiros].filter(c => c.classe === 'baixo' || c.motivo_bloqueio).slice(0,5).map(c => `
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onclick="openPerfil(${c.costureiro_id})">
              <div class="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center">
                <i class="fas fa-triangle-exclamation text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">${c.nome}</div>
                <div class="text-xs text-slate-500">${c.motivo_bloqueio || `Eficiência ${fmt.pct(c.eficiencia)}`}</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-red-600">${fmt.pct(c.eficiencia)}</div>
                <div class="text-xs text-slate-500">Frq: ${fmt.pct(c.frequencia)}</div>
              </div>
            </div>
          `).join('') || '<p class="text-sm text-slate-500 py-4 text-center">Todos performando bem 🎉</p>'}
        </div>
      </div>
    </div>
  `;

  renderOverview();
}

function renderOverview() {
  const stats = state.stats; const evo = state.evolucao;
  const c = chartColors();
  Chart.defaults.color = c.text;
  Chart.defaults.borderColor = c.grid;

  // Destroy existing
  ['chart-evo', 'chart-dist'].forEach(id => { const inst = Chart.getChart(id); if (inst) inst.destroy(); });

  // Evolução
  const ctxEvo = document.getElementById('chart-evo').getContext('2d');
  const grad = ctxEvo.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, 'rgba(58, 98, 251, 0.35)');
  grad.addColorStop(1, 'rgba(58, 98, 251, 0.0)');

  new Chart(ctxEvo, {
    type: 'line',
    data: {
      labels: evo.serie.map(s => fmt.dateShort(s.data)),
      datasets: [
        {
          label: 'Produção (peças)', data: evo.serie.map(s => s.producao),
          borderColor: c.brand, backgroundColor: grad, fill: true, tension: 0.35,
          pointRadius: 3, pointBackgroundColor: c.brand, yAxisID: 'y',
        },
        {
          label: 'Eficiência (%)', data: evo.serie.map(s => s.eficiencia),
          borderColor: c.brand2, backgroundColor: 'transparent', tension: 0.35,
          borderDash: [6, 4], pointRadius: 2, yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y: { beginAtZero: true, grid: { color: c.grid }, title: { display: true, text: 'Peças' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: '%' } },
        x: { grid: { color: c.grid } },
      },
    },
  });

  // Distribuição
  const ctxDist = document.getElementById('chart-dist').getContext('2d');
  new Chart(ctxDist, {
    type: 'doughnut',
    data: {
      labels: ['Alto', 'Médio', 'Baixo'],
      datasets: [{
        data: [stats.kpis.alto_desempenho, stats.kpis.medio_desempenho, stats.kpis.baixo_desempenho],
        backgroundColor: [c.green, c.amber, c.red],
        borderColor: c.bgCard, borderWidth: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

// =====================================================
// TELA 2 — RANKING
// =====================================================
async function viewRanking() {
  const stats = await loadStats();
  const sorted = [...stats.costureiros].sort((a, b) => b.eficiencia - a.eficiencia);

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h3 class="font-bold text-lg">Ranking de Eficiência — ${MESES[state.mes-1]}/${state.ano}</h3>
          <p class="text-sm text-slate-500">Ordenado por eficiência real, ponderada pela dificuldade das operações</p>
        </div>
        <div class="flex gap-2">
          <input id="search" class="input" placeholder="Buscar costureiro..." />
          <select id="filter-classe" class="input w-40">
            <option value="">Todas as classes</option>
            <option value="alto">Alto desempenho</option>
            <option value="medio">Médio</option>
            <option value="baixo">Baixo</option>
          </select>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th class="p-3">#</th>
              <th class="p-3">Costureiro</th>
              <th class="p-3 hidden sm:table-cell">Máquina</th>
              <th class="p-3 text-right">Produção</th>
              <th class="p-3 text-right">Eficiência</th>
              <th class="p-3 text-right hidden md:table-cell">Ponderada</th>
              <th class="p-3 text-right hidden lg:table-cell">Frq.</th>
              <th class="p-3 text-right hidden lg:table-cell">Qual.</th>
              <th class="p-3 text-right">Bônus</th>
              <th class="p-3">Classe</th>
            </tr>
          </thead>
          <tbody id="ranking-body"></tbody>
        </table>
      </div>
    </div>
  `;

  const renderBody = () => {
    const term = (document.getElementById('search').value || '').toLowerCase().trim();
    const classeFilter = document.getElementById('filter-classe').value;
    const filtered = sorted
      .filter(c => !term || c.nome.toLowerCase().includes(term))
      .filter(c => !classeFilter || c.classe === classeFilter);

    document.getElementById('ranking-body').innerHTML = filtered.map((c, i) => {
      const pos = sorted.indexOf(c) + 1;
      const posClr = pos === 1 ? 'bg-amber-500' : pos === 2 ? 'bg-slate-400' : pos === 3 ? 'bg-orange-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
      return `
        <tr class="t-row border-b border-slate-100 dark:border-slate-800 cursor-pointer" onclick="openPerfil(${c.costureiro_id})">
          <td class="p-3"><span class="inline-flex w-7 h-7 rounded-full ${posClr} text-white font-bold items-center justify-center text-xs">${pos}</span></td>
          <td class="p-3 font-semibold">${c.nome}</td>
          <td class="p-3 hidden sm:table-cell"><span class="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800">${c.tipo_maquina}</span></td>
          <td class="p-3 text-right font-semibold">${fmt.num(c.total_producao)}</td>
          <td class="p-3 text-right">
            <div class="font-bold">${fmt.pct(c.eficiencia)}</div>
            <div class="bar-bg mt-1 w-24 ml-auto"><div class="bar-fill ${barClasse(c.eficiencia)}" style="width:${Math.min(150, c.eficiencia)}%"></div></div>
          </td>
          <td class="p-3 text-right hidden md:table-cell text-slate-600 dark:text-slate-300">${fmt.pct(c.eficiencia_ponderada)}</td>
          <td class="p-3 text-right hidden lg:table-cell">${fmt.pct(c.frequencia)}</td>
          <td class="p-3 text-right hidden lg:table-cell">${fmt.pct(c.qualidade)}</td>
          <td class="p-3 text-right font-bold ${c.bonus > 0 ? 'text-emerald-600' : 'text-slate-400'}">${fmt.money(c.bonus)}</td>
          <td class="p-3">${badgeClasse(c.classe)}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="10" class="p-8 text-center text-slate-500">Nenhum resultado</td></tr>';
  };

  document.getElementById('search').addEventListener('input', renderBody);
  document.getElementById('filter-classe').addEventListener('change', renderBody);
  renderBody();
}

// =====================================================
// TELA 3 — PERFIL INDIVIDUAL
// =====================================================
window.openPerfil = async (id) => {
  state.selectedCostureiroId = id;
  await navigate('perfil');
};

async function viewPerfil() {
  const stats = await loadStats();
  if (!state.selectedCostureiroId && stats.costureiros.length > 0) {
    state.selectedCostureiroId = stats.costureiros[0].costureiro_id;
  }
  if (!state.selectedCostureiroId) {
    document.getElementById('view').innerHTML = '<div class="card text-center text-slate-500 py-10">Nenhum costureiro disponível</div>';
    return;
  }

  const perfil = await api(`/api/stats/costureiro/${state.selectedCostureiroId}?ano=${state.ano}&mes=${state.mes}`);
  state.perfil = perfil;
  const s = perfil.stats;

  document.getElementById('view').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
      <div class="card lg:col-span-1">
        <div class="flex items-center gap-4">
          <div class="efi-ring" style="background: conic-gradient(${s.eficiencia >= 85 ? '#10b981' : s.eficiencia >= 70 ? '#f59e0b' : '#ef4444'} ${Math.min(100, s.eficiencia)}%, rgba(148,163,184,0.2) 0);">
            <div class="w-16 h-16 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-slate-900 dark:text-white font-bold text-sm">
              ${fmt.pct(s.eficiencia, 0)}
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="font-bold text-xl truncate">${s.nome}</h2>
            <div class="text-sm text-slate-500"><i class="fas fa-cog mr-1"></i>${s.tipo_maquina}</div>
            <div class="mt-2">${badgeClasse(s.classe)}</div>
          </div>
        </div>

        <div class="mt-5">
          <label class="text-xs font-semibold text-slate-500">Selecionar costureiro</label>
          <select id="cost-picker" class="input mt-1">
            ${[...stats.costureiros].sort((a,b)=>a.nome.localeCompare(b.nome)).map(c =>
              `<option value="${c.costureiro_id}" ${c.costureiro_id === state.selectedCostureiroId ? 'selected' : ''}>${c.nome}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="card lg:col-span-2">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div class="text-xs text-slate-500 uppercase">Produção</div>
            <div class="text-2xl font-bold">${fmt.num(s.total_producao)}</div>
            <div class="text-xs text-slate-500">peças</div>
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase">Frequência</div>
            <div class="text-2xl font-bold">${fmt.pct(s.frequencia)}</div>
            <div class="text-xs text-slate-500">${s.dias_trabalhados}/${s.dias_uteis} dias</div>
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase">Qualidade</div>
            <div class="text-2xl font-bold">${fmt.pct(s.qualidade)}</div>
            <div class="text-xs text-slate-500">${s.retrabalho_total} retrabalhos</div>
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase">Bônus</div>
            <div class="text-2xl font-bold ${s.bonus > 0 ? 'text-emerald-600' : 'text-slate-400'}">${fmt.money(s.bonus)}</div>
            <div class="text-xs ${s.motivo_bloqueio ? 'text-red-500' : 'text-slate-500'} truncate" title="${s.motivo_bloqueio || ''}">
              ${s.motivo_bloqueio || 'Liberado'}
            </div>
          </div>
        </div>

        <div class="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div><span class="text-slate-500">Min. trabalhados:</span> <span class="font-semibold">${fmt.num(s.total_minutos_trabalhados)}</span></div>
            <div><span class="text-slate-500">Min. produzidos:</span> <span class="font-semibold">${fmt.num(s.total_minutos_produzidos)}</span></div>
            <div><span class="text-slate-500">Ef. ponderada:</span> <span class="font-semibold">${fmt.pct(s.eficiencia_ponderada)}</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
      <div class="card">
        <h3 class="font-bold mb-3"><i class="fas fa-chart-line text-brand-500 mr-2"></i>Desempenho Diário</h3>
        <div class="h-64"><canvas id="chart-diario"></canvas></div>
      </div>
      <div class="card">
        <h3 class="font-bold mb-3"><i class="fas fa-history text-brand-500 mr-2"></i>Histórico (6 meses)</h3>
        <div class="h-64"><canvas id="chart-historico"></canvas></div>
      </div>
    </div>

    <div class="card">
      <h3 class="font-bold mb-3"><i class="fas fa-list text-brand-500 mr-2"></i>Produção no mês</h3>
      <div id="perfil-producoes" class="text-sm text-slate-500">Carregando...</div>
    </div>
  `;

  document.getElementById('cost-picker').addEventListener('change', async (e) => {
    state.selectedCostureiroId = Number(e.target.value);
    await navigate('perfil');
  });

  renderPerfil();

  // Carregar produções
  const producoes = await api(`/api/producao?inicio=${perfil.periodo.inicio}&fim=${perfil.periodo.fim}&costureiro_id=${state.selectedCostureiroId}`);
  document.getElementById('perfil-producoes').innerHTML = producoes.length ? `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
            <th class="p-2">Data</th><th class="p-2">Operação</th><th class="p-2">Ref.</th>
            <th class="p-2 text-right">Qtd</th><th class="p-2 text-right">Min Trab.</th>
            <th class="p-2 text-right">Tempo Padrão</th><th class="p-2 text-right">Ef.</th><th class="p-2 text-right">Retr.</th>
          </tr>
        </thead>
        <tbody>
          ${producoes.slice(0, 100).map(p => {
            const ef = p.minutos_trabalhados > 0 ? (p.quantidade_produzida * p.tempo_padrao_min / p.minutos_trabalhados) * 100 : 0;
            return `<tr class="t-row border-b border-slate-100 dark:border-slate-800">
              <td class="p-2">${fmt.date(p.data)}</td>
              <td class="p-2">${p.operacao || '-'}</td>
              <td class="p-2">${p.referencia_peca || '-'}</td>
              <td class="p-2 text-right">${fmt.num(p.quantidade_produzida)}</td>
              <td class="p-2 text-right">${fmt.num(p.minutos_trabalhados, 1)}</td>
              <td class="p-2 text-right">${fmt.num(p.tempo_padrao_min, 1)}</td>
              <td class="p-2 text-right font-semibold">${fmt.pct(ef)}</td>
              <td class="p-2 text-right ${p.retrabalho > 0 ? 'text-red-500' : 'text-slate-400'}">${p.retrabalho}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '<div class="text-center py-6 text-slate-400">Sem produções no período</div>';
}

function renderPerfil() {
  const c = chartColors();
  Chart.defaults.color = c.text;
  const perfil = state.perfil;

  ['chart-diario', 'chart-historico'].forEach(id => { const inst = Chart.getChart(id); if (inst) inst.destroy(); });

  const ctxD = document.getElementById('chart-diario');
  if (ctxD) {
    new Chart(ctxD.getContext('2d'), {
      type: 'bar',
      data: {
        labels: perfil.diario.map(d => fmt.dateShort(d.data)),
        datasets: [
          { type: 'bar', label: 'Produção', data: perfil.diario.map(d => d.producao), backgroundColor: c.brand, borderRadius: 4, yAxisID: 'y' },
          { type: 'line', label: 'Eficiência %', data: perfil.diario.map(d => d.eficiencia), borderColor: c.green, backgroundColor: 'transparent', tension: 0.3, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, grid: { color: c.grid } },
          y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } },
          x: { grid: { color: c.grid } },
        },
      },
    });
  }

  const ctxH = document.getElementById('chart-historico');
  if (ctxH) {
    new Chart(ctxH.getContext('2d'), {
      type: 'line',
      data: {
        labels: perfil.historico.map(h => h.label),
        datasets: [{
          label: 'Eficiência %', data: perfil.historico.map(h => h.eficiencia),
          borderColor: c.brand2, backgroundColor: 'rgba(124,58,237,0.1)', fill: true,
          tension: 0.3, pointRadius: 5, pointBackgroundColor: c.brand2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true, grid: { color: c.grid } }, x: { grid: { color: c.grid } } },
      },
    });
  }
}

// =====================================================
// TELA 4 — BONIFICAÇÃO
// =====================================================
/* =====================================================
 *  BONIFICAÇÃO — réplica fiel da aba "Bonificação" da planilha
 *  Fórmula: Bonificação Individual = (eficiência/100) × 20 × (100/2)
 *           Só calcula se eficiência ≥ 75%, senão = 0
 *  Bonificação Final = Bonificação Geral (manual) + Bonificação Individual
 * ===================================================== */
const EFICIENCIA_MIN_BONIFICACAO = 75;

function calcularBonificacaoIndividualClient(eficienciaPct) {
  if (!Number.isFinite(eficienciaPct) || eficienciaPct < EFICIENCIA_MIN_BONIFICACAO) return 0;
  const eficienciaDecimal = eficienciaPct / 100;
  const valor = eficienciaDecimal * 20.0 * (100 / 2);
  return Math.round(valor * 100) / 100;
}

async function viewBonus() {
  const stats = await loadStats();
  const bonificacaoGeral = Number(stats.bonificacao_geral || stats.kpis.bonificacao_geral || 0);
  const canEdit = state.user && (state.user.role === 'admin' || state.user.role === 'gestor');

  // Sort: maior eficiência primeiro
  const lista = [...stats.costureiros].sort((a, b) => b.eficiencia - a.eficiencia);

  // Totais a partir dos dados consolidados pelo backend
  const totalIndividual = stats.kpis.total_bonificacao_individual ?? lista.reduce((s, c) => s + (c.bonificacao_individual || 0), 0);
  const numCostureiros = lista.length;
  const totalGeral = bonificacaoGeral; // valor fixo, único para a empresa
  const totalFinal = totalIndividual + totalGeral * (numCostureiros > 0 ? 1 : 0);
  // Obs.: a tela mostra bonificação geral por costureiro (cada um recebe o mesmo valor manual)
  // O total geral pago é Geral × num_costureiros + soma das individuais
  const totalGeralPago = totalGeral * numCostureiros;
  const totalFinalPago = totalIndividual + totalGeralPago;
  const recebem = lista.filter(c => (c.bonificacao_final || 0) > 0).length;

  document.getElementById('view').innerHTML = `
    <!-- Resumo top -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
      <div class="card lg:col-span-2 gradient-bg text-white">
        <div class="text-sm uppercase tracking-wider opacity-80">Total a Pagar em ${MESES[state.mes-1]}/${state.ano}</div>
        <div class="text-5xl font-extrabold mt-2" id="kpi-total-final">${fmt.money(totalFinalPago)}</div>
        <div class="mt-3 text-sm opacity-90">
          <span id="kpi-recebem">${recebem}</span> de ${numCostureiros} costureiros receberão bonificação
        </div>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div class="bg-white/15 rounded-lg p-2">
            <div class="text-xs opacity-80">Soma Bonificação Individual</div>
            <div class="font-bold text-lg" id="kpi-total-individual">${fmt.money(totalIndividual)}</div>
          </div>
          <div class="bg-white/15 rounded-lg p-2">
            <div class="text-xs opacity-80">Soma Bonificação Geral (× ${numCostureiros})</div>
            <div class="font-bold text-lg" id="kpi-total-geral">${fmt.money(totalGeralPago)}</div>
          </div>
        </div>
      </div>

      <!-- Card editável de Bonificação Geral -->
      <div class="card border-2 border-accent-500/30">
        <h3 class="font-bold mb-2 flex items-center gap-2">
          <i class="fas fa-money-bill-wave" style="color:#e53e24"></i>
          Bonificação Geral (R$)
        </h3>
        <p class="text-xs text-slate-500 mb-3">Valor manual aplicado a cada costureiro elegível neste mês.</p>
        <div class="space-y-2">
          <input id="bg-input" type="number" min="0" step="0.01" class="input text-2xl font-bold text-center"
                 value="${bonificacaoGeral.toFixed(2)}" ${canEdit ? '' : 'readonly'} />
          ${canEdit ? `
            <textarea id="bg-obs" class="input text-xs" rows="2" placeholder="Observação (opcional)"></textarea>
            <button id="bg-save" class="btn btn-primary w-full"><i class="fas fa-save"></i> Salvar Bonificação Geral</button>
          ` : `<p class="text-xs text-amber-600"><i class="fas fa-lock"></i> Apenas admin/gestor pode editar.</p>`}
        </div>
      </div>
    </div>

    <!-- Fórmula explicativa -->
    <div class="card mb-5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
      <div class="flex items-start gap-3">
        <i class="fas fa-calculator text-2xl text-blue-600 mt-1"></i>
        <div class="text-sm">
          <div class="font-bold text-blue-900 dark:text-blue-200">Fórmula da planilha (não alterar):</div>
          <div class="font-mono mt-1 text-blue-800 dark:text-blue-300">
            Bonificação Individual = eficiência × 20,00 × (100 / 2)
            <span class="text-slate-500"> &nbsp;— ativa se eficiência ≥ 75%</span>
          </div>
          <div class="font-mono text-blue-800 dark:text-blue-300">
            Bonificação Final = Bonificação Geral + Bonificação Individual
          </div>
        </div>
      </div>
    </div>

    <!-- Simulação: alterar Bonificação Geral em tempo real -->
    <div class="card mb-5 no-print">
      <h3 class="font-bold mb-3"><i class="fas fa-flask text-brand-500 mr-2"></i>Simulação em tempo real</h3>
      <p class="text-sm text-slate-500 mb-3">
        Ajuste a Bonificação Geral abaixo para ver o impacto na folha sem salvar.
      </p>
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="text-xs font-semibold text-slate-500">Bonificação Geral simulada (R$)</label>
          <input id="sim-bg" class="input w-48" type="number" min="0" step="0.01" value="${bonificacaoGeral.toFixed(2)}" />
        </div>
        <button id="sim-reset" class="btn btn-secondary"><i class="fas fa-undo"></i> Resetar para valor real</button>
      </div>
    </div>

    <!-- Tabela detalhada -->
    <div class="card">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 class="font-bold">Folha de Bonificação Detalhada</h3>
        <button id="export-csv" class="btn btn-secondary no-print"><i class="fas fa-file-csv"></i> CSV</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm" id="bonificacao-table">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th class="p-3">Costureiro</th>
              <th class="p-3 text-right">Produção</th>
              <th class="p-3 text-right">Eficiência</th>
              <th class="p-3 text-right">Bonif. Individual</th>
              <th class="p-3 text-right">Bonif. Geral</th>
              <th class="p-3 text-right text-brand-600">Bonif. Final</th>
              <th class="p-3">Status</th>
            </tr>
          </thead>
          <tbody id="bonificacao-tbody"></tbody>
          <tfoot id="bonificacao-tfoot"></tfoot>
        </table>
      </div>
    </div>
  `;

  // ─── Render dinâmico da tabela (usado para tempo real) ───
  function renderTabela(bgSim) {
    const tbody = document.getElementById('bonificacao-tbody');
    const tfoot = document.getElementById('bonificacao-tfoot');
    let somaInd = 0, somaGeral = 0, somaFinal = 0, qtdRecebem = 0;

    tbody.innerHTML = lista.map(c => {
      const ind = calcularBonificacaoIndividualClient(c.eficiencia);
      // só recebe geral se tiver bonif individual (= eficiência ≥ 75%)
      // mas conforme regra: "Bonificação Final = Geral + Individual" — sempre soma
      // Adotamos: a Bonificação Geral é aplicada quando a Individual é > 0 (paga ao elegível)
      const elegivel = ind > 0;
      const geral = elegivel ? Number(bgSim || 0) : 0;
      const finalVal = (ind > 0 ? ind : 0) + (geral > 0 ? geral : 0);
      somaInd += ind;
      somaGeral += geral;
      somaFinal += finalVal;
      if (finalVal > 0) qtdRecebem++;

      const statusClass = finalVal > 0 ? 'badge-alto' : 'badge-baixo';
      const statusIcon = finalVal > 0 ? 'fa-check' : 'fa-ban';
      const statusText = finalVal > 0 ? 'Pagar' : 'Sem bonificação';
      return `
        <tr class="t-row border-b border-slate-100 dark:border-slate-800">
          <td class="p-3 font-semibold cursor-pointer hover:text-brand-600" onclick="openPerfil(${c.costureiro_id})">${c.nome}</td>
          <td class="p-3 text-right">${fmt.num(c.total_producao)}</td>
          <td class="p-3 text-right ${c.eficiencia >= 75 ? 'text-emerald-600 font-semibold' : 'text-slate-500'}">${fmt.pct(c.eficiencia)}</td>
          <td class="p-3 text-right ${ind > 0 ? 'font-semibold text-emerald-600' : 'text-slate-400'}">${fmt.money(ind)}</td>
          <td class="p-3 text-right ${geral > 0 ? 'text-amber-600' : 'text-slate-400'}">${fmt.money(geral)}</td>
          <td class="p-3 text-right font-bold text-lg ${finalVal > 0 ? 'text-brand-600' : 'text-slate-400'}">${fmt.money(finalVal)}</td>
          <td class="p-3"><span class="badge ${statusClass}"><i class="fas ${statusIcon}"></i> ${statusText}</span></td>
        </tr>
      `;
    }).join('');

    tfoot.innerHTML = `
      <tr class="bg-slate-100 dark:bg-slate-800/70 font-bold border-t-2 border-slate-300 dark:border-slate-700">
        <td class="p-3">TOTAL (${qtdRecebem} elegíveis)</td>
        <td class="p-3 text-right">${fmt.num(stats.kpis.total_producao)}</td>
        <td class="p-3 text-right">${fmt.pct(stats.kpis.eficiencia_media)}</td>
        <td class="p-3 text-right text-emerald-600">${fmt.money(somaInd)}</td>
        <td class="p-3 text-right text-amber-600">${fmt.money(somaGeral)}</td>
        <td class="p-3 text-right text-brand-600 text-lg">${fmt.money(somaFinal)}</td>
        <td class="p-3"></td>
      </tr>
    `;

    // KPIs no card superior
    document.getElementById('kpi-total-final').textContent = fmt.money(somaFinal);
    document.getElementById('kpi-total-individual').textContent = fmt.money(somaInd);
    document.getElementById('kpi-total-geral').textContent = fmt.money(somaGeral);
    document.getElementById('kpi-recebem').textContent = qtdRecebem;
    // Atualiza label do card geral
    const kpiGeralLabel = document.querySelector('#kpi-total-geral')?.previousElementSibling;
    if (kpiGeralLabel) kpiGeralLabel.textContent = `Soma Bonificação Geral (× ${qtdRecebem})`;
  }

  // Render inicial
  renderTabela(bonificacaoGeral);

  // ─── Salvar Bonificação Geral (persiste no banco) ───
  if (canEdit) {
    document.getElementById('bg-save').addEventListener('click', async () => {
      const valor = Number(document.getElementById('bg-input').value);
      const observacao = document.getElementById('bg-obs').value.trim();
      if (!Number.isFinite(valor) || valor < 0) {
        toast('Valor deve ser um número positivo', 'error');
        return;
      }
      try {
        await api('/api/bonificacao-geral', {
          method: 'PUT',
          body: { ano: state.ano, mes: state.mes, valor, observacao }
        });
        toast(`Bonificação Geral salva: ${fmt.money(valor)}`, 'success');
        // Recarrega tudo
        state.stats = null;
        await navigate('bonus');
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  }

  // ─── Simulação em tempo real (não salva) ───
  const simInput = document.getElementById('sim-bg');
  simInput.addEventListener('input', () => {
    const v = Number(simInput.value);
    renderTabela(Number.isFinite(v) && v >= 0 ? v : 0);
  });
  document.getElementById('sim-reset').addEventListener('click', () => {
    simInput.value = bonificacaoGeral.toFixed(2);
    renderTabela(bonificacaoGeral);
  });

  // ─── Exportar CSV ───
  document.getElementById('export-csv').addEventListener('click', () => {
    const bgUsado = Number(simInput.value) || bonificacaoGeral;
    exportCSVBonus(lista, bgUsado);
  });
}

function renderBonus() { /* sem charts */ }

function exportCSVBonus(lista, bonificacaoGeral) {
  const header = ['Costureiro','Maquina','Producao','Eficiencia(%)','Bonif_Individual','Bonif_Geral','Bonif_Final','Status'];
  const rows = lista.map(c => {
    const ind = calcularBonificacaoIndividualClient(c.eficiencia);
    const geral = ind > 0 ? bonificacaoGeral : 0;
    const finalVal = ind + geral;
    return [
      `"${(c.nome || '').replace(/"/g,'""')}"`,
      c.tipo_maquina || '',
      c.total_producao,
      c.eficiencia.toFixed(2).replace('.', ','),
      ind.toFixed(2).replace('.', ','),
      geral.toFixed(2).replace('.', ','),
      finalVal.toFixed(2).replace('.', ','),
      finalVal > 0 ? 'Pagar' : 'Sem bonificacao'
    ];
  });
  const csv = [header, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bonificacao_${state.ano}_${String(state.mes).padStart(2,'0')}.csv`;
  a.click();
  toast('CSV exportado!', 'success');
}

// Compat: outros lugares ainda chamam exportCSV
function exportCSV(lista) {
  const bg = state.stats?.bonificacao_geral || 0;
  exportCSVBonus(lista, bg);
}

// =====================================================
// CRUD — PRODUÇÃO
// =====================================================
async function viewProducao() {
  const [producoes, costureiros, operacoes] = await Promise.all([
    api(`/api/producao?inicio=${state.ano}-${String(state.mes).padStart(2,'0')}-01&fim=${state.ano}-${String(state.mes).padStart(2,'0')}-31`),
    api('/api/costureiros'),
    api('/api/operacoes'),
  ]);
  state.costureiros = costureiros; state.operacoes = operacoes;

  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 class="font-bold text-lg">Registros de Produção</h3>
          <p class="text-sm text-slate-500">${producoes.length} registros no período</p>
        </div>
        <button id="new-prod" class="btn btn-primary"><i class="fas fa-plus"></i> Novo Registro</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th class="p-2">Data</th><th class="p-2">Costureiro</th><th class="p-2">Operação</th>
              <th class="p-2">Ref.</th><th class="p-2 text-right">Qtd</th>
              <th class="p-2 text-right">Tempo Padrão</th><th class="p-2 text-right">Min Trab.</th>
              <th class="p-2 text-right">Retrab.</th><th class="p-2"></th>
            </tr>
          </thead>
          <tbody>
            ${producoes.slice(0, 500).map(p => `
              <tr class="t-row border-b border-slate-100 dark:border-slate-800">
                <td class="p-2">${fmt.date(p.data)}</td>
                <td class="p-2 font-semibold">${p.costureiro_nome}</td>
                <td class="p-2">${p.operacao || '-'}</td>
                <td class="p-2">${p.referencia_peca || '-'}</td>
                <td class="p-2 text-right">${fmt.num(p.quantidade_produzida)}</td>
                <td class="p-2 text-right">${fmt.num(p.tempo_padrao_min, 1)}</td>
                <td class="p-2 text-right">${fmt.num(p.minutos_trabalhados, 1)}</td>
                <td class="p-2 text-right ${p.retrabalho > 0 ? 'text-red-500 font-bold' : 'text-slate-400'}">${p.retrabalho}</td>
                <td class="p-2 text-right">
                  <button class="btn btn-ghost p-1" onclick='editProd(${JSON.stringify(p)})'><i class="fas fa-pen text-xs"></i></button>
                  <button class="btn btn-ghost p-1 text-red-500" onclick="deleteProd(${p.id})"><i class="fas fa-trash text-xs"></i></button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="9" class="p-8 text-center text-slate-500">Nenhum registro. Clique em "Novo Registro" para começar.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('new-prod').addEventListener('click', () => openProdModal());
}

window.editProd = (p) => openProdModal(p);
window.deleteProd = async (id) => {
  if (!confirm('Excluir este registro?')) return;
  await api(`/api/producao/${id}`, { method: 'DELETE' });
  toast('Registro excluído', 'success');
  state.stats = null;
  await navigate('producao');
};

function openProdModal(prod = null) {
  const isEdit = !!prod;
  const today = new Date().toISOString().slice(0,10);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 class="font-bold text-lg">${isEdit ? 'Editar' : 'Novo'} Registro de Produção</h3>
          <button class="btn btn-ghost p-2" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold text-slate-500">Data</label>
              <input type="date" id="p-data" class="input" value="${prod?.data || today}"/></div>
            <div><label class="text-xs font-semibold text-slate-500">Costureiro</label>
              <select id="p-cost" class="input">
                ${state.costureiros.filter(c => c.ativo).map(c => `<option value="${c.id}" ${prod?.costureiro_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('')}
              </select></div>
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-500">Operação</label>
            <select id="p-op" class="input">
              <option value="">-- selecione --</option>
              ${state.operacoes.map(o => `<option value="${o.id}" data-nome="${o.nome_operacao}" data-tempo="${o.tempo_padrao_min}" ${prod?.operacao_id === o.id ? 'selected' : ''}>${o.nome_operacao} (${o.tempo_padrao_min} min)</option>`).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold text-slate-500">Referência da peça</label>
              <input id="p-ref" class="input" value="${prod?.referencia_peca || ''}"/></div>
            <div><label class="text-xs font-semibold text-slate-500">Tempo Padrão (min)</label>
              <input id="p-tempo" type="number" step="0.1" class="input" value="${prod?.tempo_padrao_min || ''}"/></div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="text-xs font-semibold text-slate-500">Qtd Produzida</label>
              <input id="p-qtd" type="number" class="input" value="${prod?.quantidade_produzida || 0}"/></div>
            <div><label class="text-xs font-semibold text-slate-500">Min Trabalhados</label>
              <input id="p-min" type="number" step="0.1" class="input" value="${prod?.minutos_trabalhados || 0}"/></div>
            <div><label class="text-xs font-semibold text-slate-500">Retrabalho</label>
              <input id="p-retr" type="number" class="input" value="${prod?.retrabalho || 0}"/></div>
          </div>
        </div>
        <div class="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="saveProd(${prod?.id || 'null'})"><i class="fas fa-save"></i> Salvar</button>
        </div>
      </div>
    </div>
  `);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

  // auto preencher tempo padrão
  document.getElementById('p-op').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.tempo) document.getElementById('p-tempo').value = opt.dataset.tempo;
  });
}

window.closeModal = () => { const b = document.getElementById('modal-backdrop'); if (b) b.remove(); };

window.saveProd = async (id) => {
  const opSel = document.getElementById('p-op');
  const opNome = opSel.selectedOptions[0]?.dataset?.nome || opSel.selectedOptions[0]?.textContent.split('(')[0].trim() || null;
  const body = {
    data: document.getElementById('p-data').value,
    costureiro_id: Number(document.getElementById('p-cost').value),
    operacao_id: opSel.value ? Number(opSel.value) : null,
    operacao: opNome,
    referencia_peca: document.getElementById('p-ref').value,
    tempo_padrao_min: Number(document.getElementById('p-tempo').value),
    quantidade_produzida: Number(document.getElementById('p-qtd').value),
    minutos_trabalhados: Number(document.getElementById('p-min').value),
    retrabalho: Number(document.getElementById('p-retr').value),
  };
  try {
    if (id) await api(`/api/producao/${id}`, { method: 'PUT', body });
    else await api('/api/producao', { method: 'POST', body });
    toast('Registro salvo', 'success');
    closeModal();
    state.stats = null; state.evolucao = null;
    await navigate('producao');
  } catch (e) { toast(e.message, 'error'); }
};

// =====================================================
// CRUD — COSTUREIROS
// =====================================================
async function viewCostureiros() {
  const costureiros = await api('/api/costureiros');
  state.costureiros = costureiros;
  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-bold text-lg">Costureiros</h3>
          <p class="text-sm text-slate-500">${costureiros.filter(c=>c.ativo).length} ativos · ${costureiros.length} total</p>
        </div>
        <button id="new-cost" class="btn btn-primary"><i class="fas fa-plus"></i> Novo Costureiro</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        ${costureiros.map(c => `
          <div class="card ${!c.ativo ? 'opacity-50' : ''}">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full gradient-bg text-white font-bold flex items-center justify-center text-sm">${c.nome[0]}</div>
                <div>
                  <div class="font-semibold">${c.nome}</div>
                  <div class="text-xs text-slate-500">${c.tipo_maquina} ${!c.ativo ? '• Inativo' : ''}</div>
                </div>
              </div>
              <div class="flex gap-1">
                <button class="btn btn-ghost p-2" onclick='editCost(${JSON.stringify(c)})'><i class="fas fa-pen text-xs"></i></button>
                <button class="btn btn-ghost p-2 text-red-500" onclick="deleteCost(${c.id})"><i class="fas fa-trash text-xs"></i></button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  document.getElementById('new-cost').addEventListener('click', () => openCostModal());
}

window.editCost = (c) => openCostModal(c);
window.deleteCost = async (id) => {
  if (!confirm('Desativar este costureiro? (soft delete — histórico preservado)')) return;
  await api(`/api/costureiros/${id}`, { method: 'DELETE' });
  toast('Costureiro desativado', 'success');
  state.stats = null;
  await navigate('costureiros');
};

function openCostModal(cost = null) {
  const isEdit = !!cost;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 class="font-bold text-lg">${isEdit ? 'Editar' : 'Novo'} Costureiro</h3>
          <button class="btn btn-ghost p-2" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <div><label class="text-xs font-semibold text-slate-500">Nome</label>
            <input id="c-nome" class="input" value="${cost?.nome || ''}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Tipo de Máquina</label>
            <select id="c-tipo" class="input">
              ${['reta','overlock','galoneira','caseadeira','travete','interloque'].map(t =>
                `<option value="${t}" ${cost?.tipo_maquina === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          ${isEdit ? `<div><label class="text-xs font-semibold text-slate-500">Status</label>
            <select id="c-ativo" class="input">
              <option value="1" ${cost?.ativo == 1 ? 'selected' : ''}>Ativo</option>
              <option value="0" ${cost?.ativo == 0 ? 'selected' : ''}>Inativo</option>
            </select></div>` : ''}
        </div>
        <div class="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="saveCost(${cost?.id || 'null'})"><i class="fas fa-save"></i> Salvar</button>
        </div>
      </div>
    </div>
  `);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
}

window.saveCost = async (id) => {
  const body = {
    nome: document.getElementById('c-nome').value,
    tipo_maquina: document.getElementById('c-tipo').value,
    ativo: document.getElementById('c-ativo') ? Number(document.getElementById('c-ativo').value) : 1,
  };
  if (!body.nome) return toast('Nome obrigatório', 'error');
  try {
    if (id) await api(`/api/costureiros/${id}`, { method: 'PUT', body });
    else await api('/api/costureiros', { method: 'POST', body });
    toast('Salvo', 'success');
    closeModal(); state.stats = null;
    await navigate('costureiros');
  } catch (e) { toast(e.message, 'error'); }
};

// =====================================================
// CRUD — OPERAÇÕES
// =====================================================
async function viewOperacoes() {
  const ops = await api('/api/operacoes');
  state.operacoes = ops;
  document.getElementById('view').innerHTML = `
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-bold text-lg">Operações</h3>
          <p class="text-sm text-slate-500">${ops.length} operações cadastradas</p>
        </div>
        <button id="new-op" class="btn btn-primary"><i class="fas fa-plus"></i> Nova Operação</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-700">
              <th class="p-3">Operação</th>
              <th class="p-3 text-right">Tempo Padrão (min)</th>
              <th class="p-3 text-right">Grau Dificuldade</th>
              <th class="p-3"></th>
            </tr>
          </thead>
          <tbody>
            ${ops.map(o => `
              <tr class="t-row border-b border-slate-100 dark:border-slate-800">
                <td class="p-3 font-semibold">${o.nome_operacao}</td>
                <td class="p-3 text-right">${fmt.num(o.tempo_padrao_min, 2)}</td>
                <td class="p-3 text-right">
                  <span class="badge ${o.grau_dificuldade >= 1.4 ? 'badge-baixo' : o.grau_dificuldade >= 1.1 ? 'badge-medio' : 'badge-alto'}">×${o.grau_dificuldade.toFixed(2)}</span>
                </td>
                <td class="p-3 text-right">
                  <button class="btn btn-ghost p-1" onclick='editOp(${JSON.stringify(o)})'><i class="fas fa-pen text-xs"></i></button>
                  <button class="btn btn-ghost p-1 text-red-500" onclick="deleteOp(${o.id})"><i class="fas fa-trash text-xs"></i></button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  document.getElementById('new-op').addEventListener('click', () => openOpModal());
}

window.editOp = (o) => openOpModal(o);
window.deleteOp = async (id) => {
  if (!confirm('Desativar esta operação?')) return;
  await api(`/api/operacoes/${id}`, { method: 'DELETE' });
  toast('Operação desativada', 'success');
  await navigate('operacoes');
};

function openOpModal(op = null) {
  const isEdit = !!op;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">
        <div class="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 class="font-bold text-lg">${isEdit ? 'Editar' : 'Nova'} Operação</h3>
          <button class="btn btn-ghost p-2" onclick="closeModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="p-5 space-y-3">
          <div><label class="text-xs font-semibold text-slate-500">Nome da operação</label>
            <input id="o-nome" class="input" value="${op?.nome_operacao || ''}"/></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs font-semibold text-slate-500">Tempo padrão (min)</label>
              <input id="o-tempo" type="number" step="0.01" class="input" value="${op?.tempo_padrao_min || ''}"/></div>
            <div><label class="text-xs font-semibold text-slate-500">Grau dificuldade</label>
              <input id="o-dif" type="number" step="0.1" class="input" value="${op?.grau_dificuldade || 1.0}"/></div>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-500">
            <i class="fas fa-info-circle mr-1"></i>O grau de dificuldade multiplica a eficiência ponderada. Use 1.0 para operações simples e até 2.0 para muito complexas.
          </div>
        </div>
        <div class="p-5 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
          <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button class="btn btn-primary" onclick="saveOp(${op?.id || 'null'})"><i class="fas fa-save"></i> Salvar</button>
        </div>
      </div>
    </div>
  `);
  document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
}

window.saveOp = async (id) => {
  const body = {
    nome_operacao: document.getElementById('o-nome').value,
    tempo_padrao_min: Number(document.getElementById('o-tempo').value),
    grau_dificuldade: Number(document.getElementById('o-dif').value),
  };
  if (!body.nome_operacao) return toast('Nome obrigatório', 'error');
  try {
    if (id) await api(`/api/operacoes/${id}`, { method: 'PUT', body });
    else await api('/api/operacoes', { method: 'POST', body });
    toast('Salvo', 'success');
    closeModal();
    await navigate('operacoes');
  } catch (e) { toast(e.message, 'error'); }
};

// =====================================================
// CONFIGURAÇÕES
// =====================================================
async function viewConfig() {
  const cfg = await api('/api/config');
  state.config = cfg;
  document.getElementById('view').innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="card">
        <h3 class="font-bold text-lg mb-3"><i class="fas fa-bullseye text-brand-500 mr-2"></i>Metas de Eficiência</h3>
        <div class="space-y-3">
          <div><label class="text-xs font-semibold text-slate-500">Eficiência mínima (%)</label>
            <input id="cfg-efmin" type="number" step="0.1" class="input" value="${cfg.eficiencia_minima}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Eficiência meta (%)</label>
            <input id="cfg-efmeta" type="number" step="0.1" class="input" value="${cfg.eficiencia_meta}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Eficiência excelente (%)</label>
            <input id="cfg-efexc" type="number" step="0.1" class="input" value="${cfg.eficiencia_excelente}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Dias úteis no mês</label>
            <input id="cfg-dias" type="number" class="input" value="${cfg.dias_uteis_mes}"/></div>
        </div>
      </div>
      <div class="card">
        <h3 class="font-bold text-lg mb-3"><i class="fas fa-hand-holding-dollar text-brand-500 mr-2"></i>Tabela de Bonificação</h3>
        <div class="space-y-3">
          <div><label class="text-xs font-semibold text-slate-500">Faixa 1 (70% - 85%)</label>
            <input id="cfg-b1" type="number" class="input" value="${cfg.bonus_faixa_1}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Faixa 2 (85% - 100%)</label>
            <input id="cfg-b2" type="number" class="input" value="${cfg.bonus_faixa_2}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Faixa 3 (100% - 115%)</label>
            <input id="cfg-b3" type="number" class="input" value="${cfg.bonus_faixa_3}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Faixa 4 (acima de 115%)</label>
            <input id="cfg-b4" type="number" class="input" value="${cfg.bonus_faixa_4}"/></div>
        </div>
      </div>
      <div class="card">
        <h3 class="font-bold text-lg mb-3"><i class="fas fa-shield-halved text-brand-500 mr-2"></i>Requisitos de Qualificação</h3>
        <div class="space-y-3">
          <div><label class="text-xs font-semibold text-slate-500">Frequência mínima (%)</label>
            <input id="cfg-freq" type="number" step="0.1" class="input" value="${cfg.frequencia_minima}"/></div>
          <div><label class="text-xs font-semibold text-slate-500">Retrabalho máximo (peças)</label>
            <input id="cfg-retr" type="number" class="input" value="${cfg.retrabalho_limite}"/></div>
          <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-xs">
            <i class="fas fa-triangle-exclamation text-amber-600 mr-1"></i>
            Costureiros com frequência abaixo do mínimo OU retrabalho acima do limite perdem o bônus, mesmo com eficiência alta.
          </div>
        </div>
      </div>
      <div class="card">
        <h3 class="font-bold text-lg mb-3"><i class="fas fa-book text-brand-500 mr-2"></i>Como funciona o cálculo</h3>
        <div class="space-y-3 text-sm">
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div class="font-semibold mb-1">Eficiência</div>
            <code class="text-xs">(tempo_padrão × qtd_produzida) / min_trabalhados × 100</code>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div class="font-semibold mb-1">Eficiência Ponderada</div>
            <code class="text-xs">Σ(tempo × qtd × dificuldade) / Σ(min_trab) × 100</code>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div class="font-semibold mb-1">Frequência</div>
            <code class="text-xs">dias_trabalhados / dias_úteis × 100</code>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div class="font-semibold mb-1">Qualidade</div>
            <code class="text-xs">100 - (retrabalho / produção × 100)</code>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-5 flex justify-end gap-2 no-print">
      <button id="cfg-save" class="btn btn-primary"><i class="fas fa-save"></i> Salvar Configurações</button>
    </div>
  `;

  document.getElementById('cfg-save').addEventListener('click', async () => {
    const body = {
      eficiencia_minima: Number(document.getElementById('cfg-efmin').value),
      eficiencia_meta: Number(document.getElementById('cfg-efmeta').value),
      eficiencia_excelente: Number(document.getElementById('cfg-efexc').value),
      dias_uteis_mes: Number(document.getElementById('cfg-dias').value),
      bonus_faixa_1: Number(document.getElementById('cfg-b1').value),
      bonus_faixa_2: Number(document.getElementById('cfg-b2').value),
      bonus_faixa_3: Number(document.getElementById('cfg-b3').value),
      bonus_faixa_4: Number(document.getElementById('cfg-b4').value),
      frequencia_minima: Number(document.getElementById('cfg-freq').value),
      retrabalho_limite: Number(document.getElementById('cfg-retr').value),
    };
    try {
      await api('/api/config', { method: 'PUT', body });
      toast('Configurações salvas!', 'success');
      state.stats = null;
    } catch (e) { toast(e.message, 'error'); }
  });
}

// =====================================================
// BOOT
// =====================================================
function bootChartJs() {
  if (window.Chart) return Promise.resolve();
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = res;
    document.head.appendChild(s);
  });
}

async function loadCurrentUser() {
  try {
    const r = await fetch('/api/auth/me', {
      credentials: 'include',
      headers: state.token ? { 'Authorization': `Bearer ${state.token}` } : {},
    });
    const d = await r.json();
    if (d.authenticated) state.user = d.user;
  } catch {}
}

function hideSplash() {
  const sp = document.getElementById('app-splash');
  if (!sp) return;
  sp.style.opacity = '0';
  setTimeout(() => sp.remove(), 500);
}

(async function () {
  try {
    await Promise.all([bootChartJs(), loadCurrentUser()]);
    renderLayout();
    await navigate('overview');
  } finally {
    hideSplash();
  }
})();
