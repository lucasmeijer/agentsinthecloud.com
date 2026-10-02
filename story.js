/* AgentsInTheCloud scroll story.
   Stage is a 1600x1000 SVG. Moving compound objects (laptop, cloud, envs) are driven by
   plain "proxy" objects {x,y,s,o} that the timeline tweens; render() writes them to the DOM. */
(() => {
  gsap.registerPlugin(ScrollTrigger);

  const NS = 'http://www.w3.org/2000/svg';
  const INK = '#2b241e';
  const $ = (s) => document.querySelector(s);
  function el(tag, attrs = {}, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const use = (href, x, y, w, h, parent, extra = {}) => el('use', { href, x, y, width: w, height: h, ...extra }, parent);

  /* ---------------- states ---------------- */
  const LAPTOP = {
    A: { x: 368, y: 311, s: 1.35 },   // centre stage, big
    B: { x: 110, y: 553, s: 0.8 },    // bottom-left, cloud upper-right
    C: { x: 70, y: 505, s: 0.9 },     // left half, cloud right half
    D: { x: 70, y: 518, s: 0.88 },    // left, closet on the right
  };
  const CLOUD = {
    B: { x: 760, y: 300, s: 0.95 },
    C: { x: 810, y: 330, s: 0.96 },
    D: { x: 1047, y: 458, s: 0.328 }, // closet scene is scaled .82 and its floor moved to y=905
  };
  const ENV_SINGLE = { x: 172, y: 120, s: 1.9 };
  const ENV_GRID_S = 0.95;
  const envSlot = (i) => ({ x: 164 + (i % 2) * (240 * ENV_GRID_S + 16), y: 120 + Math.floor(i / 2) * (170 * ENV_GRID_S + 16), s: ENV_GRID_S });
  const TASKS = ['empty-workspace', 'dark-mode', 'bump-deps', 'write-docs'];
  const PROMPTS = ['', 'add dark mode', 'bump deps', 'write the docs']; // typed into the launch composer
  const APPS = ['claude', 'chrome', 'ghostty', 'vscode'];
  // Chrome + app (dark mode) state, filled in by buildAtelier()
  const TYPED_URL = 'agentsinthecloud.com';
  const DK = { bg: '#1c1a18', chrome: '#2b2724', tab: '#3a3530', side: '#221f1c', line: '#3d3630', text: '#ece4d8', dim: '#9b8f80', accent: '#e39a5c' };
  let urlText, urlCaret, tabNew, tabLoading, tabLoaded, pageSpinner, page, rowsG;
  let composer, promptText, promptCaret, promptPlaceholder, launchBtn, claudePanes, activeRow;
  // what Claude Code does after each launch: [marker, text]
  const WORK = [
    [['●', 'Read(src/styles/theme.css)'], ['●', 'Update(src/styles/theme.css)'], ['⎿', '+48 −3'], ['●', 'Bash(npm test)'], ['✻', 'Working…']],
    [['●', 'Bash(npm outdated)'], ['●', 'Update(package.json)'], ['⎿', '7 packages bumped'], ['●', 'Bash(npm test)'], ['✻', 'Working…']],
    [['●', 'Read(src/**/*.ts)'], ['●', 'Write(docs/README.md)'], ['⎿', '+120 lines'], ['●', 'Write(docs/api.md)'], ['✻', 'Working…']],
  ];
  // window slots inside an env (env local 240x170)
  const ENV_WIN = [[10, 28], [125, 28], [10, 100], [125, 100]];
  // windows on the laptop screen (screen local 640x400)
  const WIN_MAX = { x: 24, y: 24, width: 592, height: 364 };
  const WIN_CASCADE = [[24, 26], [76, 56], [128, 86], [180, 116]].map(([x, y]) => ({ x, y, width: 440, height: 271 }));

  const P = {
    laptop: { ...LAPTOP.A, o: 0 },
    cloud: { ...CLOUD.B, o: 0 },
    claudeBig: null, // set after the opening frame is built
    sentence: { c: 0, y: 596, s: 1, o: 1 }, // c: 0 = centred on "favorite", 1 = whole sentence centred
    scr: { cx: 320, cy: 200, s: 1 }, // zoom inside the Mac's screen: screen point shown at its centre
    typed: { n: 0 },
    shell: { n: 0 },
    prompt: { i: 1, n: 0 }, // opening sentence baseline + scale
    beams: { o: 0 },
    envs: TASKS.map(() => ({ ...ENV_SINGLE, o: 0 })),
  };

  const stage = $('#stage');
  const L = {
    closet: $('#layer-closet'), beams: $('#layer-beams'), laptop: $('#layer-laptop'), cloud: $('#layer-cloud'),
    fly: $('#layer-fly'), logos: $('#layer-logos'), badges: $('#layer-badges'),
  };

  /* ---------------- icons: hover lift, tooltip, click opens the site ---------------- */
  const LINKS = {
    claude: ['Claude Code', 'Anthropic’s coding agent. Explore your codebase, make changes, and work through tasks with Claude.', 'https://www.anthropic.com/claude-code'],
    codex: ['Codex', 'OpenAI’s coding agent. Read, write, and debug code with your OpenAI account.', 'https://openai.com/codex/'],
    pi: ['Pi', 'A lightweight, extensible coding agent with support for models from multiple providers.', 'https://github.com/badlogic/pi-mono'],
    builtin: ['Built-in agent', 'AgentsInTheCloud’s integrated coding agent, with durable execution and your choice of supported models.', 'https://github.com/lucasmeijer/atelier'],
    chrome: ['Google Chrome', 'The browser, with your app’s preview in it.', 'https://www.google.com/chrome/'],
    ghostty: ['Ghostty', 'A fast, native terminal emulator.', 'https://ghostty.org'],
    vscode: ['VS Code', 'Microsoft’s code editor.', 'https://code.visualstudio.com'],
    github: ['Open source', 'All of AgentsInTheCloud is on GitHub. Read it, fork it, run it.', 'https://github.com/lucasmeijer/atelier'],
    docker: ['Docker', 'AgentsInTheCloud runs in Docker.', 'https://www.docker.com/products/docker-desktop/'],
    why: ['Why Tailscale?', 'You reach the agents on your server through Tailscale: a private network between your own devices, so nothing is open to the internet. It’s a free and very popular tool.', ''],
    tailscale: ['Tailscale', 'A private network between your devices, so only you can reach your server.', 'https://tailscale.com/download'],
    hetzner: ['Hetzner', 'Affordable cloud servers in Europe and the US.', 'https://www.hetzner.com/cloud/'],
    digitalocean: ['DigitalOcean', 'Simple cloud servers, called Droplets.', 'https://www.digitalocean.com/products/droplets'],
    anthropic: ['Anthropic', 'Claude models.', 'https://www.anthropic.com'],
    openai: ['OpenAI', 'GPT models.', 'https://openai.com'],
    gemini: ['Google Gemini', 'Gemini models.', 'https://ai.google.dev'],
    mistral: ['Mistral AI', 'Mistral and Codestral models.', 'https://mistral.ai'],
    deepseek: ['DeepSeek', 'DeepSeek models.', 'https://www.deepseek.com'],
    qwen: ['Qwen', 'Alibaba’s Qwen models.', 'https://qwen.ai'],
    kimi: ['Kimi', 'Moonshot AI’s Kimi models.', 'https://www.kimi.com'],
    xai: ['xAI', 'Grok models.', 'https://x.ai'],
    meta: ['Meta', 'Meta’s models.', 'https://ai.meta.com'],
    zhipu: ['Z.ai', 'GLM models.', 'https://z.ai'],
    copilot: ['GitHub Copilot', 'Bring your Copilot subscription.', 'https://github.com/features/copilot'],
    openrouter: ['OpenRouter', 'Hundreds of models behind one API.', 'https://openrouter.ai'],
    groq: ['Groq', 'Very fast inference.', 'https://groq.com'],
    minimax: ['MiniMax', 'MiniMax models.', 'https://www.minimax.io'],
    huggingface: ['Hugging Face', 'The home of open models.', 'https://huggingface.co'],
  };
  // Moves g's children into a .hov wrapper (CSS lifts it on hover) and marks g as an icon.
  function iconify(g, key) {
    const hov = el('g', { class: 'hov' });
    while (g.firstChild) hov.appendChild(g.firstChild);
    g.appendChild(hov);
    g.classList.add('icon');
    if (key) g.dataset.key = key;
    return g;
  }

  /* ---------------- opening frame: "favorite" with arrows to the four agents (as on the homepage) ---------------- */
  const CAPTION_Y = 925; // stage y where captions start; every scene's graphics end around y=905
  const ORBIT_K = 3.2, ORBIT_C = { x: 800, y: 565 }; const SENT_FONT = 90;
  const orbitOrigin = { x: ORBIT_C.x - 135 * ORBIT_K, y: ORBIT_C.y - 105 * ORBIT_K };
  const AGENTS = [
    { id: 'claude', cx: 44, cy: 32, r: -10 }, { id: 'codex', cx: 234, cy: 42, r: 9 },
    { id: 'pi', cx: 48, cy: 178, r: 7 }, { id: 'builtin', cx: 218, cy: 184, r: -8 },
  ];
  function agentTile(id, parent) {
    const g = el('g', {}, parent);
    el('rect', { x: -24, y: -21, width: 48, height: 48, rx: 15, fill: '#af89502e' }, g);
    el('rect', { x: -24, y: -24, width: 48, height: 48, rx: 15, fill: '#fff8ec', stroke: '#c6ad8a', 'stroke-width': 1 }, g);
    if (id === 'builtin') el('image', { href: '/assets/builtin-agent-64.png', x: -20, y: -20, width: 40, height: 40 }, g);
    else use('#brand-' + id, -14, -14, 28, 28, g);
    return iconify(g, id);
  }
  const opening = el('g', {}, L.logos);
  const sentence = el('g', { class: 'sans', 'font-size': SENT_FONT, 'letter-spacing': '-2.7', fill: '#342d26' }, opening);
  const SENT_BASE = ORBIT_C.y + 31;
  const underline = el('rect', { height: 11, rx: 5.5, fill: '#bc8a564a' }, sentence);
  const tLead = el('text', { 'text-anchor': 'end', 'font-weight': 450 }, sentence, 'Take your');
  const tFav = el('text', { 'text-anchor': 'middle', 'font-weight': 650, fill: '#955d2d' }, sentence, 'favorite');
  const tTail = el('text', { 'font-weight': 450 }, sentence, 'coding agent,');
  let sentDx = 0;
  function layoutSentence() {
    const w = tFav.getComputedTextLength() || 300, base = SENT_BASE;
    tFav.setAttribute('x', ORBIT_C.x); tFav.setAttribute('y', base);
    tLead.setAttribute('x', ORBIT_C.x - w / 2 - 22); tLead.setAttribute('y', base);
    tTail.setAttribute('x', ORBIT_C.x + w / 2 + 22); tTail.setAttribute('y', base);
    // how far the whole sentence's centre is from "favorite" (so it can centre itself as a caption)
    sentDx = ((ORBIT_C.x - w / 2 - 22 - tLead.getComputedTextLength()) + (ORBIT_C.x + w / 2 + 22 + tTail.getComputedTextLength())) / 2 - ORBIT_C.x;
    underline.setAttribute('x', ORBIT_C.x - w / 2 - 8); underline.setAttribute('width', w + 16);
    underline.setAttribute('y', base + 10); underline.setAttribute('transform', `rotate(-3 ${ORBIT_C.x} ${base + 14})`);
  }
  layoutSentence();
  document.fonts && document.fonts.ready.then(layoutSentence);
  const orbit = el('g', { transform: `translate(${orbitOrigin.x} ${orbitOrigin.y}) scale(${ORBIT_K})` }, opening);
  const arrows = el('g', { fill: 'none', stroke: '#955d2d', 'stroke-width': 1.6, 'stroke-linecap': 'round', opacity: 0.65, 'marker-end': 'url(#arrowhead)' }, orbit);
  ['M110 93 Q72 83 58 54', 'M160 93 Q196 88 216 65', 'M110 118 Q77 131 61 159', 'M164 119 Q205 125 204 158'].forEach((d) => el('path', { d }, arrows));
  AGENTS.slice(1).forEach((a) => agentTile(a.id, orbit).setAttribute('transform', `translate(${a.cx} ${a.cy}) rotate(${a.r})`));
  // Claude Code's tile is the one that travels into the laptop
  const claudeBigG = el('g', {}, L.logos);
  agentTile('claude', claudeBigG);
  const CLAUDE_START = { x: orbitOrigin.x + AGENTS[0].cx * ORBIT_K, y: orbitOrigin.y + AGENTS[0].cy * ORBIT_K, s: ORBIT_K, r: AGENTS[0].r, o: 1 };
  P.claudeBig = { ...CLAUDE_START };

  /* ---------------- laptop ---------------- */
  const lap = el('g', {}, L.laptop);
  el('ellipse', { cx: 320, cy: 446, rx: 410, ry: 16, fill: INK, opacity: 0.2, filter: 'url(#soft)' }, lap);
  // lid: thin aluminium edge around a black glass bezel
  el('rect', { x: -17, y: -17, width: 674, height: 434, rx: 24, fill: 'url(#aluLid)', stroke: INK, 'stroke-width': 3.5 }, lap);
  el('rect', { x: -13, y: -13, width: 666, height: 426, rx: 20, fill: '#0b0b0d' }, lap);
  // base: thin slab with a thumb scoop in the front edge
  el('path', { d: 'M-84 416 H724 Q730 416 728 422 L720 433 Q715 440 703 440 H-63 Q-75 440 -80 433 L-88 422 Q-90 416 -84 416 Z', fill: 'url(#aluBase)', stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, lap);
  el('path', { d: 'M-82 420.5 H722', stroke: '#fff', 'stroke-width': 1.5, opacity: 0.8 }, lap);
  el('path', { d: 'M272 417.5 Q274 426 286 426 H354 Q366 426 368 417.5 Z', fill: '#9fa0a6' }, lap);
  const screenClipG = el('g', { 'clip-path': 'url(#screenClip)' }, lap);
  const screen = el('g', {}, screenClipG); // zooms inside the Mac's screen

  // wallpaper
  el('rect', { width: 640, height: 400, fill: 'url(#wallpaper)' }, screen);
  el('circle', { cx: 470, cy: 150, r: 46, fill: '#ffe2a8', opacity: 0.8 }, screen);
  el('path', { d: 'M0 260 C120 220 240 300 380 250 S600 220 640 240 V400 H0 Z', fill: '#c46a4f', opacity: 0.55 }, screen);
  el('path', { d: 'M0 320 C160 280 300 350 460 300 S600 300 640 310 V400 H0 Z', fill: '#8e4f55', opacity: 0.6 }, screen);

  // desktop windows
  const lapWins = APPS.map((a, i) => {
    const r = i === 0 ? WIN_MAX : WIN_CASCADE[i];
    return use('#w-' + a, r.x, r.y, r.width, r.height, screen, { opacity: 0 });
  });
  // a plain shell over the Claude window's content until `claude` is typed
  const shell = el('g', {}, screen);
  screen.insertBefore(shell, lapWins[1]);
  {
    const k = WIN_MAX.width / 520, x = WIN_MAX.x + 3 * k, y = WIN_MAX.y + 27 * k;
    el('rect', { x, y, width: 514 * k, height: 290 * k, fill: '#1f1b18' }, shell);
    shell.prompt = el('text', { x: x + 16 * k, y: y + 30 * k, 'font-size': 14 * k, fill: '#e9e1d6', class: 'mono' }, shell);
    shell.caret = el('rect', { y: y + 18 * k, width: 8 * k, height: 15 * k, fill: '#e9e1d6', class: 'blink' }, shell);
  }
  const SHELL_CMD = 'claude';

  // Chrome window showing Atelier at agentsinthecloud.com
  const atelier = el('g', { opacity: 0 }, screen);
  buildAtelier(atelier);

  // menubar
  const menubar = el('g', {}, screen);
  el('rect', { width: 640, height: 16, fill: '#fff8ef', opacity: 0.72 }, menubar);
  el('circle', { cx: 14, cy: 8, r: 4, fill: INK }, menubar);
  const MENU = ['Claude Code', 'Chrome', 'Ghostty', 'Code'];
  const appNames = MENU.map((n, i) =>
    el('text', { x: 26, y: 11.5, 'font-size': 9, 'font-weight': 700, fill: INK, class: 'sans', opacity: i === 0 ? 1 : 0 }, menubar, n));
  el('text', { x: 96, y: 11.5, 'font-size': 9, fill: INK, class: 'sans', 'word-spacing': 6 }, menubar, 'File Edit View Window Help');
  el('text', { x: 628, y: 11.5, 'font-size': 9, fill: INK, class: 'sans', 'text-anchor': 'end' }, menubar, 'Fri 9:41');
  el('path', { d: 'M286 -2 H354 V9 Q354 15 348 15 H292 Q286 15 286 9 Z', fill: '#0b0b0d' }, screenClipG);
  el('circle', { cx: 320, cy: 7, r: 2, fill: '#23232a' }, screenClipG);

  // Chrome, full screen: the frame is there first (blank tab), the page loads after the URL is typed
  function buildAtelier(g) {
    el('rect', { x: 0, y: 16, width: 640, height: 384, fill: DK.bg }, g);
    el('rect', { x: 0, y: 16, width: 640, height: 60, fill: DK.chrome }, g);
    el('path', { d: 'M10 44 V28 a6 6 0 0 1 6 -6 h150 a6 6 0 0 1 6 6 V44 Z', fill: DK.tab }, g);
    tabNew = el('text', { x: 24, y: 37, 'font-size': 11, fill: DK.dim, class: 'sans', 'font-weight': 600 }, g, 'New Tab');
    tabLoading = el('g', { opacity: 0 }, g);
    el('circle', { cx: 28, cy: 33, r: 5, fill: 'none', stroke: DK.accent, 'stroke-width': 1.8, 'stroke-dasharray': '22 10', class: 'spin' }, tabLoading);
    el('text', { x: 41, y: 37, 'font-size': 11, fill: DK.text, class: 'sans', 'font-weight': 600 }, tabLoading, TYPED_URL);
    tabLoaded = el('g', { opacity: 0 }, g);
    el('image', { href: '/favicon-32.png', x: 21, y: 26, width: 14, height: 14 }, tabLoaded);
    el('text', { x: 41, y: 37, 'font-size': 11, fill: DK.text, class: 'sans', 'font-weight': 600 }, tabLoaded, 'AgentsInTheCloud');
    el('rect', { x: 0, y: 44, width: 640, height: 32, fill: DK.tab }, g);
    el('path', { d: 'M16 60 l6 -5 M16 60 l6 5 M16 60 h12 M48 60 l-6 -5 M48 60 l-6 5 M48 60 h-12', stroke: DK.dim, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }, g);
    el('rect', { x: 62, y: 49, width: 566, height: 23, rx: 11.5, fill: DK.chrome, stroke: DK.accent, 'stroke-width': 1.5 }, g);
    el('path', { d: 'M76 57 v-2 a3.5 3.5 0 0 1 7 0 v2 M74.5 57 h10 v7 h-10 Z', fill: 'none', stroke: DK.dim, 'stroke-width': 1.4 }, g);
    urlText = el('text', { x: 92, y: 66, 'font-size': 15, fill: DK.text, class: 'sans', 'font-weight': 600, 'letter-spacing': '-0.2' }, g, '');
    urlCaret = el('rect', { x: 92, y: 53, width: 1.6, height: 16, fill: DK.text, class: 'blink' }, g);
    pageSpinner = el('circle', { cx: 320, cy: 238, r: 16, fill: 'none', stroke: DK.accent, 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-dasharray': '70 31', class: 'spin', opacity: 0 }, g);
    page = el('g', { opacity: 0 }, g);
    // workspaces
    el('rect', { x: 0, y: 76, width: 140, height: 324, fill: DK.side }, page);
    el('text', { x: 12, y: 94, 'font-size': 8.5, 'letter-spacing': 1.2, fill: DK.dim, class: 'sans', 'font-weight': 700 }, page, 'WORKSPACES');
    activeRow = el('rect', { x: 6, y: 102, width: 128, height: 23, rx: 6, fill: '#34302b', stroke: '#4a423a' }, page);
    rowsG = el('g', {}, page);
    // Claude Code
    el('rect', { x: 140, y: 76, width: 500, height: 20, fill: '#2a2420' }, page);
    use('#spark', 148, 80, 12, 12, page);
    el('text', { x: 165, y: 90, 'font-size': 10, fill: DK.text, class: 'sans', 'font-weight': 600 }, page, 'Claude Code');
    claudePanes = [el('g', {}, page)];
    pane(claudePanes[0], '#c-claude-welcome', 140, 96, 500, 304, 'xMinYMin slice'); // same Claude Code that went into the cloud
    WORK.forEach((lines, i) => {
      const g = el('g', { opacity: 0 }, page);
      el('rect', { x: 140, y: 96, width: 500, height: 304, fill: '#1f1b18' }, g);
      const t = el('g', { class: 'mono', 'font-size': 14, fill: '#e9e1d6' }, g);
      el('text', { x: 158, y: 128 }, t, '').innerHTML = `<tspan fill="#8f8478">&gt;</tspan> ${PROMPTS[i + 1]}`;
      g.lines = lines.map(([dot, txt], k) => {
        const line = el('text', { x: 158, y: 164 + k * 30, opacity: 0 }, t);
        line.innerHTML = dot === '⎿' ? `<tspan fill="#8f8478">  ⎿ </tspan><tspan fill="#7fc27a">${txt}</tspan>`
          : dot === '✻' ? `<tspan fill="#d97757">✻ </tspan><tspan fill="#d97757" font-style="italic">${txt}</tspan>`
          : `<tspan fill="#d97757">● </tspan>${txt}`;
        return line;
      });
      claudePanes.push(g);
    });
    el('path', { d: 'M140 76 V400', stroke: DK.line, 'stroke-width': 2 }, page);
    // launch composer (new workspace)
    composer = el('g', { opacity: 0 }, g);
    el('rect', { x: 0, y: 76, width: 640, height: 324, fill: '#000', opacity: 0.5 }, composer);
    el('rect', { x: 120, y: 112, width: 400, height: 186, rx: 14, fill: '#2a2622', stroke: '#4a423a', 'stroke-width': 1.5 }, composer);
    el('text', { x: 138, y: 134, 'font-size': 12, 'font-weight': 700, fill: DK.text, class: 'sans' }, composer, 'New workspace');
    el('rect', { x: 136, y: 144, width: 368, height: 92, rx: 9, fill: DK.bg, stroke: DK.accent, 'stroke-width': 1.5 }, composer);
    promptPlaceholder = el('text', { x: 148, y: 166, 'font-size': 12, fill: '#7d7266', class: 'sans' }, composer, 'Describe what you want the agent to do…');
    promptText = el('text', { x: 148, y: 167, 'font-size': 14, 'font-weight': 500, fill: DK.text, class: 'sans' }, composer, '');
    promptCaret = el('rect', { x: 148, y: 155, width: 1.5, height: 15, fill: DK.text, class: 'blink' }, composer);
    el('rect', { x: 136, y: 252, width: 116, height: 28, rx: 14, fill: '#36302a', stroke: '#4a423a' }, composer);
    use('#spark', 146, 259, 14, 14, composer);
    el('text', { x: 166, y: 270, 'font-size': 11, 'font-weight': 600, fill: DK.text, class: 'sans' }, composer, 'Claude Code ▾');
    launchBtn = el('g', {}, composer);
    el('rect', { x: 420, y: 252, width: 84, height: 28, rx: 14, fill: DK.accent }, launchBtn);
    el('text', { x: 462, y: 270, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#1d1a17', class: 'sans' }, launchBtn, 'Launch ↵');
  }
  function pane(parent, href, x, y, w, h, par) {
    const s = el('svg', { x, y, width: w, height: h, viewBox: '0 0 520 294', preserveAspectRatio: par }, parent);
    use(href, 0, 0, 520, 294, s);
  }
  const rows = TASKS.map((t, i) => {
    const y = 102 + i * 27;
    const g = el('g', { opacity: 0 }, rowsG);
    el('text', { x: 14, y: y + 15.5, 'font-size': 10.5, fill: DK.text, class: 'mono' }, g, t);
    g.spinner = el('circle', { cx: 123, cy: y + 11.5, r: 4.2, fill: 'none', stroke: DK.accent, 'stroke-width': 1.6, 'stroke-dasharray': '19 8', class: 'spin' }, g);
    g.done = el('circle', { cx: 123, cy: y + 11.5, r: 3.6, fill: '#e8c547', opacity: 0 }, g);
    if (i === 0) { g.spinner.setAttribute('opacity', 0); g.done.setAttribute('opacity', 1); } // empty-workspace is idle
    g.ring = el('rect', { x: 5, y: y - 1, width: 130, height: 25, rx: 7, fill: 'none', stroke: '#f0a960', 'stroke-width': 2.5, opacity: 0 }, g);
    return g;
  });

  /* ---------------- cloud ---------------- */
  const cloudG = el('g', {}, L.cloud);
  const CLOUD_SHAPES = [
    ['rect', { x: 70, y: 200, width: 660, height: 310, rx: 90 }],
    ['circle', { cx: 230, cy: 210, r: 140 }], ['circle', { cx: 420, cy: 170, r: 165 }], ['circle', { cx: 600, cy: 220, r: 145 }],
    ['circle', { cx: 120, cy: 340, r: 100 }], ['circle', { cx: 690, cy: 350, r: 100 }],
  ];
  el('ellipse', { cx: 405, cy: 290, rx: 430, ry: 290, fill: '#fff4dc', opacity: 0.9, filter: 'url(#softer)' }, cloudG);
  const outline = el('g', { fill: INK, stroke: INK, 'stroke-width': 16 }, cloudG);
  const shadow = el('g', { fill: INK, opacity: 0.18, transform: 'translate(10 14)' }, cloudG);
  const fill = el('g', { fill: 'url(#cloudFill)' }, cloudG);
  CLOUD_SHAPES.forEach(([t, a]) => { el(t, a, shadow); el(t, a, outline); el(t, a, fill); });
  shadow.remove(); cloudG.insertBefore(shadow, outline);
  el('path', { d: 'M300 70 a150 150 0 0 1 200 -40', stroke: '#fff', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round', opacity: 0.8 }, cloudG);
  const envsG = el('g', {}, cloudG);
  const envNodes = TASKS.map((t, i) => makeEnv(t, i, envsG));
  const env1Wins = [...envNodes[0].querySelectorAll('use.win')];
  gsap.set(env1Wins, { opacity: 0 });

  function makeEnv(label, i, parent) {
    const g = el('g', { opacity: 0 }, parent);
    el('rect', { x: 5, y: 7, width: 240, height: 170, rx: 14, fill: INK, opacity: 0.2 }, g);
    el('rect', { x: 0, y: 0, width: 240, height: 170, rx: 14, fill: '#fffaf2', stroke: INK, 'stroke-width': 3 }, g);
    el('circle', { cx: 14, cy: 14, r: 4, fill: '#61c554' }, g);
    el('text', { x: 24, y: 18, 'font-size': 11, 'font-weight': 700, fill: '#5d5145', class: 'mono' }, g, label);
    APPS.forEach((a, j) => {
      const [x, y] = ENV_WIN[j];
      use('#w-' + a, x, y, 105, 65, g, { class: 'win' });
      use('#icon-' + a, x + 105 - 27, y + 65 - 27, 24, 24, g, { class: 'win' }); // app badge
    });
    g.ring = el('rect', { x: -6, y: -6, width: 252, height: 182, rx: 19, fill: 'none', stroke: '#f0a960', 'stroke-width': 7, opacity: 0 }, g);
    return g;
  }

  /* ---------------- flying windows ---------------- */
  const toStage = (outer, inner, x, y) => ({ x: outer.x + outer.s * (inner.x + inner.s * x), y: outer.y + outer.s * (inner.y + inner.s * y) });
  const ID = { x: 0, y: 0, s: 1 };
  const flyFrom = WIN_CASCADE.map((r) => {
    const p = toStage(LAPTOP.A, ID, r.x, r.y);
    return { x: p.x, y: p.y, width: r.width * LAPTOP.A.s, height: r.height * LAPTOP.A.s };
  });
  const flyTo = ENV_WIN.map(([x, y]) => {
    const p = toStage(CLOUD.B, ENV_SINGLE, x, y);
    const k = CLOUD.B.s * ENV_SINGLE.s;
    return { x: p.x, y: p.y, width: 105 * k, height: 65 * k };
  });
  const flyers = APPS.map((a, i) => use('#w-' + a, flyFrom[i].x, flyFrom[i].y, flyFrom[i].width, flyFrom[i].height, L.fly, { opacity: 0 }));

  /* ---------------- beams ---------------- */
  const beamsG = el('g', { opacity: 0 }, L.beams);
  const beamPaths = [0, 1].map((k) => {
    const soft = el('path', { class: 'beam', stroke: '#f0a960', 'stroke-width': 16, opacity: 0.35 }, beamsG);
    const dash = el('path', { class: 'beam beam-dash' + (k ? ' rev' : ''), stroke: '#955d2d', 'stroke-width': 5 }, beamsG);
    return { soft, dash };
  });
  const packets = [0, 1, 2, 3].map((i) => el('circle', { r: 7, fill: '#fffaf1', stroke: INK, 'stroke-width': 3 }, beamsG));

  /* ---------------- closet ---------------- */
  const floor = el('g', { opacity: 0 }, L.closet);
  el('rect', { x: -50, y: 905, width: 1700, height: 30, fill: '#d6c2a2' }, floor);
  el('path', { d: 'M-50 905 H1650', stroke: INK, 'stroke-width': 3, opacity: 0.4 }, floor);
  const closetScene = el('g', { transform: 'translate(1180 905) scale(.82) translate(-1180 -965)' }, L.closet);
  const closet = el('g', { opacity: 0 }, closetScene);
  buildCloset(closet);
  const miniWrap = el('g', { transform: 'translate(1180 790)' }, closetScene);
  const mini = el('g', { opacity: 0 }, miniWrap);
  el('ellipse', { cx: 0, cy: 24, rx: 110, ry: 8, fill: INK, opacity: 0.35, filter: 'url(#soft)' }, mini);
  el('rect', { x: -100, y: -26, width: 200, height: 48, rx: 16, fill: '#dcd8d1', stroke: INK, 'stroke-width': 4 }, mini);
  el('rect', { x: -90, y: -21, width: 180, height: 7, rx: 3.5, fill: '#fff', opacity: 0.7 }, mini);
  el('path', { d: 'M-40 8 H40', stroke: '#a59d92', 'stroke-width': 3, 'stroke-linecap': 'round' }, mini);
  el('circle', { cx: -80, cy: 8, r: 4, fill: '#7fe08a', class: 'glow' }, mini);
  el('circle', { cx: -80, cy: 8, r: 10, fill: '#7fe08a', opacity: 0.3, filter: 'url(#soft)' }, mini);
  const bubbles = [[1170, 754, 7], [1152, 724, 11], [1130, 688, 15]].map(([cx, cy, r]) =>
    el('circle', { cx, cy, r, fill: '#fbf3e6', stroke: INK, 'stroke-width': 3, opacity: 0 }, closetScene));

  function buildCloset(g) {
    // frame + interior
    el('rect', { x: 880, y: 150, width: 600, height: 815, rx: 6, fill: '#c79a68', stroke: INK, 'stroke-width': 5 }, g);
    el('rect', { x: 906, y: 176, width: 548, height: 789, fill: 'url(#closetIn)', stroke: INK, 'stroke-width': 3 }, g);
    // lamp + glow (like the logo's workshop lamp)
    el('path', { d: 'M1180 176 V206', stroke: INK, 'stroke-width': 3 }, g);
    el('path', { d: 'M1180 220 L970 965 H1390 Z', fill: 'url(#lampGlow)' }, g);
    el('path', { d: 'M1150 226 Q1152 204 1180 204 Q1208 204 1210 226 Z', fill: '#3a332d', stroke: INK, 'stroke-width': 3 }, g);
    el('ellipse', { cx: 1180, cy: 228, rx: 12, ry: 6, fill: '#ffe2a0' }, g);
    // top shelf + stuff
    el('rect', { x: 906, y: 330, width: 548, height: 16, fill: '#a7774b', stroke: INK, 'stroke-width': 3 }, g);
    el('rect', { x: 940, y: 262, width: 120, height: 68, rx: 3, fill: '#c9955c', stroke: INK, 'stroke-width': 3 }, g);
    el('rect', { x: 995, y: 262, width: 10, height: 68, fill: '#e6c592' }, g);
    el('rect', { x: 1075, y: 286, width: 90, height: 44, rx: 3, fill: '#b7844f', stroke: INK, 'stroke-width': 3 }, g);
    [['#8fb3c9', 1320, 278, 110], ['#e7c46b', 1315, 296, 120], ['#c97b6b', 1322, 313, 106]].forEach(([c, x, y, w]) =>
      el('rect', { x, y, width: w, height: 18, rx: 8, fill: c, stroke: INK, 'stroke-width': 3 }, g));
    // coats on hooks
    el('path', { d: 'M930 400 q20 -20 40 0 l18 170 q-38 14 -76 0 Z', fill: '#7d8f6a', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M1424 410 q-20 -20 -40 0 l-14 150 q34 12 68 0 Z', fill: '#b5604c', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    // bottom shelf
    el('rect', { x: 906, y: 812, width: 548, height: 16, fill: '#a7774b', stroke: INK, 'stroke-width': 3 }, g);
    // router
    el('path', { d: 'M1340 772 l-10 -40 M1400 772 l10 -40', stroke: INK, 'stroke-width': 4, 'stroke-linecap': 'round' }, g);
    el('rect', { x: 1322, y: 770, width: 96, height: 42, rx: 9, fill: '#f2ede4', stroke: INK, 'stroke-width': 3.5 }, g);
    [0, 1, 2].forEach((i) => el('circle', { cx: 1342 + i * 14, cy: 791, r: 3.2, fill: '#7fe08a', class: i === 1 ? 'blink2' : '' }, g));
    el('path', { d: 'M1280 800 C1296 830 1310 830 1322 800', stroke: '#3a6ea5', 'stroke-width': 4, fill: 'none' }, g);
    // floor stuff
    el('path', { d: 'M950 960 q0 -26 26 -26 h18 q8 0 8 10 v16 Z M1012 960 q0 -26 26 -26 h18 q8 0 8 10 v16 Z', fill: '#5a4a3e', stroke: INK, 'stroke-width': 3 }, g);
    el('path', { d: 'M1290 960 L1300 880 H1420 L1430 960 Z', fill: '#d8b47c', stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M1296 906 H1424 M1293 932 H1427', stroke: '#a7824e', 'stroke-width': 3 }, g);
    // open door
    el('path', { d: 'M880 150 L800 182 V935 L880 965 Z', fill: '#dcb486', stroke: INK, 'stroke-width': 5, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M822 230 L862 214 V470 L822 482 Z M822 560 L862 552 V900 L822 910 Z', fill: 'none', stroke: '#b98d5d', 'stroke-width': 3 }, g);
    el('circle', { cx: 816, cy: 560, r: 7, fill: '#e9c66a', stroke: INK, 'stroke-width': 2.5 }, g);
  }

  /* ---------------- finale: free / open source / any model, then the big logo and the two choices ---------------- */
  const finale = el('g', {}, L.badges);
  function logoTile(parent, { x, y, size, r = 0, img, sym, key, pad = 0.2 }) {
    const wrap = el('g', { transform: `translate(${x} ${y}) rotate(${r})` }, parent);
    const inner = el('g', {}, wrap); // the timeline pops this
    const g = el('g', {}, inner);
    const h = size / 2, rad = size * 0.3, p = size * pad;
    el('rect', { x: -h, y: -h + size * 0.07, width: size, height: size, rx: rad, fill: '#af89502e' }, g);
    el('rect', { x: -h, y: -h, width: size, height: size, rx: rad, fill: '#fff8ec', stroke: '#c6ad8a', 'stroke-width': size / 48 }, g);
    if (sym) use(sym, -h + p, -h + p, size - 2 * p, size - 2 * p, g);
    else el('image', { href: img, x: -h + p, y: -h + p, width: size - 2 * p, height: size - 2 * p }, g);
    iconify(g, key);
    return inner;
  }
  // Free: a price tag
  const freeTag = el('g', {}, el('g', { transform: 'translate(300 600) rotate(-8) scale(1.5)' }, finale));
  el('path', { d: 'M-90 -50 H50 L100 0 L50 50 H-90 Q-100 50 -100 40 V-40 Q-100 -50 -90 -50 Z', fill: '#f4c66b', stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' }, freeTag);
  el('circle', { cx: 58, cy: 0, r: 9, fill: '#fffaf2', stroke: INK, 'stroke-width': 3 }, freeTag);
  el('text', { x: -22, y: 22, 'text-anchor': 'middle', 'font-size': 64, 'font-weight': 800, fill: INK, class: 'sans' }, freeTag, '$0');
  // Open source: GitHub
  const ghTile = logoTile(finale, { x: 610, y: 560, size: 190, r: 6, img: '/assets/logos/si-github.svg', key: 'github' });
  // Any model, any subscription: rapid fire of providers
  const PROVIDERS = [['claude-color', 'anthropic'], ['openai', 'openai'], ['gemini-color', 'gemini'], ['mistral-color', 'mistral'], ['deepseek-color', 'deepseek'],
    ['qwen-color', 'qwen'], ['moonshot', 'kimi'], ['grok', 'xai'], ['meta-color', 'meta'], ['zhipu-color', 'zhipu'],
    ['githubcopilot', 'copilot'], ['openrouter', 'openrouter'], ['groq', 'groq'], ['minimax-color', 'minimax'], ['huggingface-color', 'huggingface']];
  const PPOS = [[760, 420], [905, 385], [1055, 405], [1205, 372], [1350, 430], [820, 560], [970, 535], [1120, 548], [1270, 562], [1415, 590],
    [735, 700], [885, 690], [1035, 705], [1185, 712], [1335, 720]];
  const provTiles = PROVIDERS.map(([f, key], i) => logoTile(finale, { x: PPOS[i][0], y: PPOS[i][1], size: 112, r: ((i * 37) % 19) - 9, img: `/assets/logos/${f}.svg`, key }));
  gsap.set([freeTag, ghTile, ...provTiles], { autoAlpha: 0 });

  // hand-drawn arrows from caption words up to the logos
  const arrowG = el('g', { fill: 'none', stroke: '#955d2d', 'stroke-width': 4, 'stroke-linecap': 'round' }, L.badges);
  // [x, y] of the logo; arrows run from the caption word up (or down) to it
  const ARROWS = { free: [300, 690], oss: [610, 680], any: [1035, 770], chrome: [560, 1075], ghostty: [800, 1085], vscode: [1060, 1075] };
  const appTiles = {};
  [['chrome', 560, 1075, -8], ['ghostty', 800, 1085, 5], ['vscode', 1060, 1075, 8]].forEach(([key, x, y, rot]) => {
    appTiles[key] = logoTile(L.logos, { x, y, size: 78, r: rot, sym: '#icon-' + key, key, pad: 0.12 });
  });
  gsap.set(Object.values(appTiles), { autoAlpha: 0 });
  const arrowPaths = {};
  for (const k in ARROWS) arrowPaths[k] = el('path', { pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1, 'marker-end': 'url(#arrowhead)', opacity: 0 }, arrowG);

  // the big logo
  const bigLogo = el('g', { opacity: 0 }, L.badges);
  el('image', { href: '/assets/agents-in-the-cloud.webp', x: 295, y: 232, width: 1010, height: 673 }, bigLogo);

  // two ways in
  const choiceCards = ['mac', 'server'].map((kind, i) => {
    const wrap = el('g', { transform: `translate(${560 + i * 480} 680)` }, L.badges);
    const inner = el('g', {}, wrap);
    const g = el('g', {}, inner);
    el('rect', { x: -192, y: -208, width: 400, height: 440, rx: 32, fill: INK, opacity: 0.18 }, g);
    el('rect', { x: -200, y: -220, width: 400, height: 440, rx: 32, fill: '#fffaf2', stroke: INK, 'stroke-width': 4 }, g);
    if (kind === 'mac') {
      el('rect', { x: -122, y: -186, width: 244, height: 156, rx: 14, fill: '#0b0b0d', stroke: INK, 'stroke-width': 4 }, g);
      el('rect', { x: -112, y: -176, width: 224, height: 136, rx: 5, fill: 'url(#wallpaper)' }, g);
      el('rect', { x: -70, y: -160, width: 140, height: 100, rx: 8, fill: '#1f1b18' }, g);
      use('#spark', -16, -126, 32, 32, g);
      el('path', { d: 'M-156 -30 H156 L146 -16 Q141 -10 130 -10 H-130 Q-141 -10 -146 -16 Z', fill: 'url(#aluBase)', stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round' }, g);
    } else {
      const cl = el('g', { transform: 'translate(0 -150)' }, g);
      const shapes = [['circle', { cx: -45, cy: 5, r: 34 }], ['circle', { cx: 5, cy: -12, r: 44 }], ['circle', { cx: 55, cy: 8, r: 30 }], ['rect', { x: -80, y: 0, width: 165, height: 40, rx: 20 }]];
      shapes.forEach(([t, a]) => el(t, { ...a, fill: INK, stroke: INK, 'stroke-width': 8 }, cl));
      shapes.forEach(([t, a]) => el(t, { ...a, fill: '#fffaf1' }, cl));
      [[-6, -78, 5], [-14, -96, 7]].forEach(([cx, cy, rr]) => el('circle', { cx, cy, r: rr, fill: '#fffaf1', stroke: INK, 'stroke-width': 3 }, g));
      el('rect', { x: -110, y: -66, width: 220, height: 56, rx: 18, fill: '#dcd8d1', stroke: INK, 'stroke-width': 4 }, g);
      el('rect', { x: -100, y: -60, width: 200, height: 8, rx: 4, fill: '#fff', opacity: 0.7 }, g);
      el('circle', { cx: -88, cy: -30, r: 4.5, fill: '#7fe08a', class: 'glow' }, g);
    }
    el('text', { x: 0, y: 64, 'text-anchor': 'middle', 'font-size': 40, 'font-weight': 650, 'letter-spacing': '-1.2', fill: INK, class: 'sans' }, g, kind === 'mac' ? 'On your Mac' : 'On a server');
    el('text', { x: 0, y: 104, 'text-anchor': 'middle', 'font-size': 22, fill: '#75634f', class: 'sans' }, g, kind === 'mac' ? 'Quick and easy.' : 'Works while your laptop sleeps.');
    el('rect', { x: -96, y: 136, width: 192, height: 54, rx: 27, fill: '#955d2d' }, g);
    el('rect', { x: -96, y: 136, width: 192, height: 54, rx: 27, fill: 'none', stroke: '#6b3f1c', 'stroke-width': 3, transform: 'translate(0 3)', opacity: 0.6 }, g);
    el('text', { x: 0, y: 171, 'text-anchor': 'middle', 'font-size': 23, 'font-weight': 600, fill: '#fff8ec', class: 'sans' }, g, 'Pick this →');
    iconify(g);
    g.dataset.choice = kind;
    return inner;
  });
  gsap.set(choiceCards, { autoAlpha: 0 });

  /* ---------------- render ---------------- */
  const placeSentence = () => {
    sentence.setAttribute('transform', `translate(${800 - sentDx * P.sentence.s * P.sentence.c} ${P.sentence.y}) scale(${P.sentence.s}) translate(-800 ${-SENT_BASE})`);
    sentence.setAttribute('opacity', P.sentence.o);
  };
  const place = (node, p) => { node.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${p.s})` + (p.r ? ` rotate(${p.r})` : '')); node.setAttribute('opacity', p.o); };
  const local = (p, x, y) => ({ x: p.x + p.s * x, y: p.y + p.s * y });
  let typedShown = -1, promptShown = '', shellShown = -1;
  function render(time) {
    const sn = Math.round(P.shell.n);
    if (sn !== shellShown) {
      shellShown = sn;
      shell.prompt.innerHTML = `<tspan fill="#a58cf0">~/app</tspan> <tspan fill="#7fc27a">❯</tspan> ${SHELL_CMD.slice(0, sn)}`;
      shell.caret.setAttribute('x', +shell.prompt.getAttribute('x') + shell.prompt.getComputedTextLength() + 2);
    }
    screen.setAttribute('transform', P.scr.s === 1 ? '' : `translate(320 200) scale(${P.scr.s}) translate(${-P.scr.cx} ${-P.scr.cy})`);
    const pr = PROMPTS[P.prompt.i].slice(0, Math.round(P.prompt.n));
    if (pr !== promptShown) {
      promptShown = pr;
      promptText.textContent = pr;
      promptPlaceholder.setAttribute('opacity', pr ? 0 : 1);
      promptCaret.setAttribute('x', 149 + (pr ? promptText.getComputedTextLength() : 0));
    }
    const n = Math.round(P.typed.n);
    if (n !== typedShown) {
      typedShown = n;
      urlText.textContent = TYPED_URL.slice(0, n);
      urlCaret.setAttribute('x', 93 + (n ? urlText.getComputedTextLength() : 0));
    }
    place(lap, P.laptop);
    place(cloudG, P.cloud);
    place(claudeBigG, P.claudeBig);
    placeSentence();
    P.envs.forEach((p, i) => place(envNodes[i], p));
    beamsG.setAttribute('opacity', P.beams.o);
    if (P.beams.o > 0.001) {
      beamPaths.forEach((b, k) => {
        const a = local(P.laptop, 650, 140 + k * 40);
        const c = local(P.cloud, 92, 360 + k * 50);
        const d = Math.max(60, Math.abs(c.x - a.x) * 0.5);
        const path = `M${a.x} ${a.y} C${a.x + d} ${a.y} ${c.x - d} ${c.y} ${c.x} ${c.y}`;
        b.soft.setAttribute('d', path); b.dash.setAttribute('d', path);
      });
      packets.forEach((pk, i) => {
        const path = beamPaths[i % 2].dash;
        const len = path.getTotalLength();
        let t = (time * 0.32 + i * 0.37) % 1;
        if (i % 2) t = 1 - t;
        const pt = path.getPointAtLength(t * len);
        pk.setAttribute('cx', pt.x); pk.setAttribute('cy', pt.y);
      });
    }
  }
  gsap.ticker.add(render);

  /* ---------------- timeline ---------------- */
  const caps = [...document.querySelectorAll('.caption')];
  gsap.set(caps, { autoAlpha: 0 });
  // split each [data-beat] phrase into word spans that light up one after another
  const beats = [];
  document.querySelectorAll('.caption [data-beat]').forEach((ph) => {
    const at = parseFloat(ph.dataset.beat);
    const color = ph.classList.contains('accent') ? '#955d2d' : '#342d26';
    const parts = ph.textContent.split(/(\s+)/);
    ph.textContent = '';
    let n = 0;
    parts.forEach((p) => {
      if (/^\s+$/.test(p)) { ph.append(p); return; }
      const w = document.createElement('span');
      w.className = 'kw'; w.textContent = p; ph.append(w);
      beats.push({ w, at: at + n++ * 0.12, color });
    });
  });

  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut', duration: 1 } });
  const caption = (from, to, at) => {
    if (from) tl.to(caps[from], { autoAlpha: 0, duration: 0.4, ease: 'power1.in' }, at);
    tl.to(caps[to], { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, at + 0.3);
  };
  const STEPS = [0, 2.4, 6, 13, 24.5, 29.5, 37, 40.5];
  // a tiny tween so the timeline starts at 0 with a defined state
  tl.set({}, {}, 0);

  // 1 — "favorite coding agent": Claude Code's tile drops into the Mac
  tl.to('.scroll-hint', { autoAlpha: 0, duration: 0.4 }, 0);
  tl.to(orbit, { opacity: 0, duration: 0.15, ease: 'none' }, 0);
  tl.to(P.sentence, { c: 1, y: CAPTION_Y + 44, s: 50 / SENT_FONT, duration: 0.45 }, 0.02);
  tl.to(P.laptop, { o: 1, duration: 0.3 }, 0.3);
  tl.to(P.claudeBig, { x: 786, y: 567, s: 1.4, r: 0, duration: 0.6, ease: 'power2.inOut' }, 0.02);
  tl.to(P.claudeBig, { o: 0, duration: 0.15 }, 0.55);
  tl.fromTo(lapWins[0], { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.5);
  tl.to(P.shell, { n: SHELL_CMD.length, duration: 0.4, ease: 'none' }, 0.75);
  tl.set(shell, { opacity: 0 }, 1.25); // enter: Claude Code starts

  // 2 — browser, terminal and VS Code open next to it
  tl.to(P.sentence, { o: 0, duration: 0.4, ease: 'power1.in' }, STEPS[1]);
  caption(0, 1, STEPS[1]);
  tl.to(lapWins[0], { attr: WIN_CASCADE[0], duration: 0.8 }, 2.8);
  [1, 2, 3].forEach((i) => {
    const at = 2.8 + i * 0.6;
    tl.fromTo(lapWins[i], { opacity: 0, attr: { ...WIN_CASCADE[i], y: WIN_CASCADE[i].y + 30 } }, { opacity: 1, attr: WIN_CASCADE[i], duration: 0.6, ease: 'back.out(1.6)' }, at);
    tl.set(appNames, { opacity: 0 }, at); tl.set(appNames[i], { opacity: 1 }, at);
    const key = APPS[i];
    tl.fromTo(appTiles[key], { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(2.2)' }, at);
    tl.to(arrowPaths[key], { attr: { 'stroke-dashoffset': 0 }, opacity: 0.85, duration: 0.4, ease: 'power2.out' }, at + 0.05);
  });
  tl.to([appTiles.chrome, appTiles.ghostty, appTiles.vscode, arrowPaths.chrome, arrowPaths.ghostty, arrowPaths.vscode], { autoAlpha: 0, duration: 0.3 }, STEPS[2]);

  // 3 — out of the laptop, into the cloud
  caption(1, 2, STEPS[2]);
  tl.set(lapWins, { opacity: 0 }, 6.3);
  tl.set(flyers, { opacity: 1 }, 6.3);
  tl.to(P.laptop, { ...LAPTOP.B, duration: 2.2 }, 6.4);
  tl.fromTo(P.cloud, { o: 0, s: CLOUD.B.s * 0.8, x: CLOUD.B.x + 80, y: CLOUD.B.y + 50 }, { o: 1, ...CLOUD.B, duration: 1.6, ease: 'back.out(1.3)' }, 6.4);
  tl.to(P.envs[0], { o: 1, duration: 0.6 }, 7.4);
  flyers.forEach((f, i) => tl.to(f, { attr: flyTo[i], duration: 2.2, ease: 'power3.inOut' }, 6.6 + i * 0.25));
  tl.set(env1Wins, { opacity: 1 }, 9.6);
  tl.set(flyers, { opacity: 0 }, 9.6);
  tl.set(appNames, { opacity: 0 }, 9.6); tl.set(appNames[1], { opacity: 1 }, 9.6); // Chrome
  tl.fromTo(atelier, { opacity: 0, scale: 0.85, transformOrigin: '50% 60%' }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.4)' }, 9.6);
  // zoom into the address bar, type the URL, then the page loads and we zoom back out
  tl.to(P.scr, { cx: 190, cy: 70, s: 2.6, duration: 0.9, ease: 'power2.inOut' }, 10.0);
  tl.to(P.typed, { n: TYPED_URL.length, duration: 1.1, ease: 'none' }, 10.9);
  // enter: a short spinner while the page loads (everything here stays before 13, where scene 4's shift starts)
  tl.set(urlCaret, { opacity: 0 }, 12.0);
  tl.set(tabNew, { opacity: 0 }, 12.0);
  tl.set([tabLoading, pageSpinner], { opacity: 1 }, 12.0);
  tl.to(P.scr, { cx: 320, cy: 200, s: 1, duration: 0.6, ease: 'power2.inOut' }, 12.0);
  tl.set([tabLoading, pageSpinner], { opacity: 0 }, 12.94);
  tl.set(tabLoaded, { opacity: 1 }, 12.94);
  tl.to(page, { opacity: 1, duration: 0.04 }, 12.94);
  tl.set(rows[0], { opacity: 1 }, 12.95);
  tl.to(P.beams, { o: 1, duration: 0.8 }, 12.96);

  // 4 — many environments, each a new workspace
  caption(2, 3, STEPS[3]);
  tl.to(P.laptop, { ...LAPTOP.C, duration: 2 }, 13.2);
  tl.to(P.cloud, { ...CLOUD.C, duration: 2 }, 13.2);
  tl.to(P.envs[0], { ...envSlot(0), duration: 2 }, 13.2);
  const blink = (node, at) => tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: 0.14, repeat: 5, yoyo: true, ease: 'none' }, at);
  for (let i = 1; i < TASKS.length; i++) {
    const at = 15.4 + (i - 1) * 2.8;
    const slot = envSlot(i);
    tl.set(P.prompt, { i, n: 0 }, at);
    tl.fromTo(composer, { opacity: 0, scale: 0.94, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' }, at);
    tl.to(P.scr, { cx: 318, cy: 210, s: 1.4, duration: 0.5, ease: 'power2.inOut' }, at + 0.15);
    tl.to(P.prompt, { n: PROMPTS[i].length, duration: 0.6, ease: 'none' }, at + 0.65);
    tl.fromTo(launchBtn, { scale: 1, transformOrigin: '50% 50%' }, { scale: 0.88, duration: 0.08, yoyo: true, repeat: 1 }, at + 1.3);
    tl.to(composer, { opacity: 0, duration: 0.2 }, at + 1.45);
    tl.to(P.scr, { cx: 320, cy: 200, s: 1, duration: 0.5, ease: 'power2.inOut' }, at + 1.45);
    tl.fromTo(P.envs[i], { ...slot, o: 0 }, { ...slot, o: 1, duration: 0.4, ease: 'power2.out' }, at + 1.7);
    tl.fromTo(rows[i], { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 1.7);
    tl.to(activeRow, { attr: { y: 102 + i * 27 }, duration: 0.25 }, at + 1.75);
    tl.to(claudePanes[i - 1], { opacity: 0, duration: 0.15 }, at + 1.75);
    tl.to(claudePanes[i], { opacity: 1, duration: 0.15 }, at + 1.75);
    claudePanes[i].lines.forEach((ln, k) => tl.to(ln, { opacity: 1, duration: 0.1 }, at + 1.95 + k * 0.17));
    blink(rows[i].ring, at + 1.8);
    if (i === 3) { tl.set(rows[1].spinner, { opacity: 0 }, at + 1.8); tl.set(rows[1].done, { opacity: 1 }, at + 1.8); } // dark-mode finishes
    blink(envNodes[i].ring, at + 1.8);
  }

  // 5 — it's just a Mac mini in a closet
  caption(3, 4, STEPS[4]);
  tl.to([closet, floor], { opacity: 1, duration: 1.2 }, 24.7);
  tl.to(P.laptop, { ...LAPTOP.D, duration: 2 }, 24.7);
  tl.fromTo(mini, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' }, 25.5);
  tl.to(P.cloud, { ...CLOUD.D, duration: 2.2, ease: 'power3.inOut' }, 25.7);
  bubbles.forEach((b, i) => tl.fromTo(b, { opacity: 0, scale: 0, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(3)' }, 27.5 + i * 0.2));

  // 6 — free, open source, any model, any subscription (each logo replaces the previous one)
  caption(4, 5, STEPS[5]);
  tl.to([closet, floor, mini, ...bubbles], { opacity: 0, duration: 0.8 }, 29.7);
  tl.to([P.laptop, P.cloud, P.beams], { o: 0, duration: 0.8 }, 29.7);
  const pop = (t, at) => tl.fromTo(t, { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, at);
  const unpop = (t, at) => tl.to(t, { autoAlpha: 0, scale: 0.7, duration: 0.3, ease: 'power1.in' }, at);
  const drawArrow = (k, at) => tl.to(arrowPaths[k], { attr: { 'stroke-dashoffset': 0 }, opacity: 0.85, duration: 0.5, ease: 'power2.out' }, at);
  const eraseArrow = (k, at) => tl.to(arrowPaths[k], { opacity: 0, duration: 0.3 }, at);
  pop(freeTag, 30.4); drawArrow('free', 30.5);
  unpop(freeTag, 31.8); eraseArrow('free', 31.8);
  pop(ghTile, 32.1); drawArrow('oss', 32.2);
  unpop(ghTile, 33.4); eraseArrow('oss', 33.4);
  drawArrow('any', 33.7);
  provTiles.forEach((t, i) => pop(t, 33.7 + i * 0.12));

  // 7 — the big logo: get in!
  caption(5, 6, STEPS[6]);
  provTiles.forEach((t) => unpop(t, 37.1));
  eraseArrow('any', 37.1);
  tl.fromTo(bigLogo, { opacity: 0, scale: 0.85, transformOrigin: '50% 60%' }, { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.6)' }, 37.3);

  // 8 — two ways in
  caption(6, 7, STEPS[7]);
  tl.to(bigLogo, { opacity: 0, scale: 0.9, duration: 0.5 }, 40.6);
  pop(choiceCards[0], 41.2);
  pop(choiceCards[1], 41.8);

  beats.forEach((b) => tl.to(b.w, { color: b.color, duration: 0.3, ease: 'none' }, b.at));
  // Everything above is authored on one clock; these shifts re-pace it afterwards.
  // (data-beat values in index.html are on the authored clock; ?t= is on the final one.)
  const shift = (from, by) => { tl.shiftChildren(by, false, from); STEPS.forEach((s, i) => { if (s >= from) STEPS[i] += by; }); };
  shift(13, 3.2);   // room for zooming in and typing the URL
  shift(1.6, -0.6); // less waiting after `claude` starts
  tl.to({}, { duration: 1.4 }, tl.duration()); // hold at the end

  /* ---------------- caption placement: just under the graphics ---------------- */
  function stageGeom() {
    const vb = stage.viewBox.baseVal;
    const k = Math.min(stage.clientWidth / vb.width, stage.clientHeight / vb.height);
    return { vb, k, ox: (stage.clientWidth - vb.width * k) / 2, oy: (stage.clientHeight - vb.height * k) / 2 };
  }
  function placeCaptions() {
    const box = $('.captions');
    const { vb, k, ox, oy } = stageGeom();
    box.style.top = oy + (CAPTION_Y - vb.y) * k + 'px';
    box.style.left = ox + 150 * k + 'px';
    box.style.width = 1300 * k + 'px';
    box.style.fontSize = Math.max(15, 50 * k) + 'px';
  }
  // arrows start at the top of their caption word, so they're laid out from the word's real position
  function layoutArrows() {
    const { vb, k, ox, oy } = stageGeom(), sr = stage.getBoundingClientRect();
    for (const key in ARROWS) {
      const w = document.querySelector(`[data-arrow="${key}"]`).getBoundingClientRect();
      const [tx, ty] = ARROWS[key];
      const fx = vb.x + (w.left + w.width / 2 - sr.left - ox) / k;
      const top = vb.y + (w.top - sr.top - oy) / k, bottom = vb.y + (w.bottom - sr.top - oy) / k;
      const down = ty > bottom;
      const fy = down ? bottom + 4 : top - 8, ey = down ? ty - 50 : ty + 22;
      const bend = (tx > fx ? -1 : 1) * (down ? 40 : 70);
      arrowPaths[key].setAttribute('d', `M${fx} ${fy} Q${(fx + tx) / 2 + bend} ${(fy + ey) / 2 + (down ? -6 : 10)} ${tx} ${ey}`);
    }
  }
  const layout = () => { placeCaptions(); layoutArrows(); };
  layout();
  // The pinned section is re-sized by ScrollTrigger after the window's resize event, so lay out
  // whenever the stage itself changes size and after every ScrollTrigger refresh.
  new ResizeObserver(layout).observe(stage);
  ScrollTrigger.addEventListener('refresh', layout);
  document.fonts && document.fonts.ready.then(layout);

  /* ---------------- tooltips, clicks, and which icons are currently interactive ---------------- */
  const icons = [...stage.querySelectorAll('.icon')];
  const effOpacity = (n) => {
    let o = 1;
    for (; n && n !== stage; n = n.parentNode) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  };
  function updateLive() {
    icons.forEach((ic) => ic.classList.toggle('live', effOpacity(ic) > 0.5));
  }
  let liveTick = 0;
  gsap.ticker.add(() => { if (++liveTick % 6 === 0) updateLive(); });

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'tooltip');
  tip.innerHTML = '<strong></strong><span></span><em></em>';
  document.body.append(tip);
  let tipFor = null;
  function showTip(target, key) {
    if (tipFor === target) return;
    tipFor = target;
    const [title, text, url] = LINKS[key];
    tip.children[0].textContent = title;
    tip.children[1].textContent = text;
    tip.children[2].textContent = url ? new URL(url).hostname.replace(/^www\./, '') + ' ↗' : '';
    tip.classList.remove('on');
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top = r.top - th - 14, side = 'top';
    if (top < 8) { top = r.bottom + 14; side = 'bottom'; }
    const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.dataset.side = side;
    tip.style.setProperty('--nub', r.left + r.width / 2 - left + 'px');
    requestAnimationFrame(() => tip.classList.add('on'));
  }
  function hideTip() { tipFor = null; tip.classList.remove('on'); }
  document.addEventListener('pointerover', (e) => {
    const ic = e.target.closest('.icon.live, [data-tip]');
    const key = ic && (ic.dataset.key || ic.dataset.tip);
    if (key && LINKS[key]) showTip(ic.querySelector('.hov, img') || ic, key);
    else hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });
  stage.addEventListener('click', (e) => {
    const ic = e.target.closest('.icon.live');
    if (!ic) return;
    if (ic.dataset.choice) choose(ic.dataset.choice);
    else if (LINKS[ic.dataset.key]) window.open(LINKS[ic.dataset.key][2], '_blank', 'noopener');
  });

  /* ---------------- after a choice: reveal the next steps and scroll to them ---------------- */
  const next = $('#next');
  // If nobody picks, scrolling down simply shows the Mac route.
  const revealSteps = (delay = 0) => gsap.fromTo('#next .step', { y: 50, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.12, duration: 0.7, ease: 'back.out(1.6)', delay });
  ScrollTrigger.create({ trigger: next, start: 'top 75%', once: true, onEnter: () => revealSteps() });
  function choose(kind) {
    next.dataset.kind = kind;
    revealSteps(0.45);
    window.scrollTo({ top: next.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
  }
  $('#next .switch').addEventListener('click', () => choose(next.dataset.kind === 'mac' ? 'server' : 'mac'));
  $('#next .copy').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const code = next.querySelector('.cmd code').textContent;
    try { await navigator.clipboard.writeText(code); btn.textContent = 'Copied!'; } catch { btn.textContent = 'Select & copy'; }
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  });

  /* ---------------- scroll ---------------- */
  const dots = [...document.querySelectorAll('.progress i')];
  const setDot = (n) => dots.forEach((d, i) => d.classList.toggle('on', i === n));
  setDot(0);
  const storyST = ScrollTrigger.create({
    trigger: '#story',
    start: 'top top',
    end: () => '+=' + Math.round(tl.duration() * window.innerHeight * 0.16),
    pin: true,
    scrub: 0.8,
    animation: tl,
    onUpdate: (self) => {
      const t = self.progress * tl.duration();
      let n = 0;
      STEPS.forEach((s, i) => { if (t >= s - 0.2) n = i; });
      setDot(n);
    },
  });

  // Debug: ?t=12.5 jumps the story to that time (useful while iterating)
  const q = new URLSearchParams(location.search).get('t');
  if (q != null) {
    const st = storyST;
    requestAnimationFrame(() => window.scrollTo(0, st.start + (st.end - st.start) * (parseFloat(q) / tl.duration())));
  }
  // re-measure text-dependent layout (used by the temporary font picker)
  const relayout = () => { layoutSentence(); layout(); };
  window.__story = { tl, P, st: storyST, relayout };
})();
