import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="robots" content="index,follow" />

        <title>CorePro Eficiência — Gestão de Produção e Bonificação</title>
        <meta name="description" content="Sistema inteligente para controle de produção, eficiência e bonificação em confecções. Multi-tenant, relatórios em tempo real e automações de bônus." />
        <meta name="author" content="CorePro" />
        <meta name="application-name" content="CorePro Eficiência" />
        <meta name="theme-color" content="#0f768f" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0b2a33" media="(prefers-color-scheme: dark)" />
        <meta name="color-scheme" content="light dark" />

        {/* Open Graph / Twitter */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CorePro Eficiência" />
        <meta property="og:title" content="CorePro Eficiência — Gestão de Produção e Bonificação" />
        <meta property="og:description" content="Sistema inteligente para controle de produção, eficiência e bonificação em confecções." />
        <meta property="og:image" content="/static/brand/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:locale" content="pt_BR" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CorePro Eficiência" />
        <meta name="twitter:description" content="Gestão de produção e bonificação para confecções" />
        <meta name="twitter:image" content="/static/brand/og-image.png" />

        {/* Favicons */}
        <link rel="icon" href="/static/brand/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/brand/icon-16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/brand/icon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/static/brand/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/static/brand/icon-512.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/static/brand/apple-touch-icon.png" />
        <link rel="mask-icon" href="/static/brand/icon-512.png" color="#0f768f" />
        <link rel="manifest" href="/static/manifest.webmanifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CorePro" />

        {/* Pré-conexões e fontes */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="preload" as="image" href="/static/brand/icon-192.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />

        {/* Tailwind + tema + CSS app */}
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="/static/style.css" rel="stylesheet" />

        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                darkMode: 'class',
                theme: {
                  extend: {
                    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
                    colors: {
                      brand: {
                        50:  '#eefaff',
                        100: '#d9f2fc',
                        200: '#bce7f8',
                        300: '#8fd6f2',
                        400: '#58bde3',
                        500: '#2ea2cc',
                        600: '#1f83ad',
                        700: '#1b6b8e',
                        800: '#1a5773',
                        900: '#194960',
                        950: '#0b2a33'
                      },
                      accent: {
                        500: '#e53e24',
                        600: '#c42e17',
                        700: '#9f240f'
                      }
                    }
                  }
                }
              };
              // Aplica tema antes do render para evitar flash
              (function(){
                const saved = localStorage.getItem('theme');
                const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) document.documentElement.classList.add('dark');
              })();
            `,
          }}
        />
        <link
          href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"
          rel="stylesheet"
        />
      </head>
      <body class="font-sans bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        {/* Splash / loading inicial */}
        <div id="app-splash" class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-slate-950 transition-opacity duration-500">
          <img src="/static/brand/icon-192.png" alt="CorePro Eficiência" width="96" height="96" class="animate-pulse drop-shadow-lg" />
          <div class="mt-6 flex items-center gap-2 text-brand-600 dark:text-brand-300">
            <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"></circle>
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
            </svg>
            <span class="font-semibold tracking-wide">Carregando CorePro Eficiência…</span>
          </div>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Onde sistemas se tornam negócio</p>
        </div>
        {children}
      </body>
    </html>
  )
})
