/**
 * 前端逻辑：上传战报截图 → 调用后端识别 → 渲染结果。
 */
(function () {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const progressEl = document.getElementById('progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  /** 单色极简 SVG 图标库（currentColor，随主题自适应）。统一在此维护，模板处用 icon(name) 引用 */
  const ICONS = {
    trophy: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v2a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V5a1 1 0 0 1 1-1z"/><path d="M8 21h8M12 16.5V21M6.5 5h-2v1a3 3 0 0 0 3 3M17.5 5h2v1a3 3 0 0 1-3 3"/></svg>',
    fire: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c1 2.6-1.2 3.6-1.2 5.5A4 4 0 0 0 17 12c.2 3-2 4.9-4.8 5A5 5 0 0 1 8 11.5c.2-2.6 1.6-4 4-8z"/></svg>',
    star: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L12 13.8 7.8 16l.8-4.7L5.2 8l4.7-.7z"/></svg>',
    truck: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h12v9H3z"/><path d="M15 10h2.5L20 12.5V15h-5z"/><circle cx="7" cy="17" r="1.4"/><circle cx="17" cy="17" r="1.4"/></svg>',
    warn: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
    clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    sort: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>',
    sortAsc: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15l5-5 5 5"/></svg>',
    sortDesc: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9l5 5 5-5"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5 11-11"/></svg>',
    error: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 16H4z"/><path d="M12 10v4M12 16.5h.01"/></svg>',
    info: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    lock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M6 10l6 5 6-5M5 20h14"/></svg>',
    upload: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M6 8l6-5 6 5M5 20h14"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
    expand: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"/></svg>',
    collapse: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/></svg>',
    x: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };
  /** 返回指定 SVG 图标字符串（未知名回退为空） */
  function icon(name) {
    return ICONS[name] || '';
  }

  /**
   * 深浅主题：默认深色；用户手动切换后写入 localStorage 记忆。
   * 通过 <html data-theme="light"> 驱动 CSS 变量，按钮显示太阳/月亮对应图标。
   */
  const THEME_KEY = 'zabao.theme';
  function applyTheme(theme, persist) {
    const isLight = theme === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : '');
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) {}
    }
  }
  /** 初始化主题：优先用户记忆，否则默认深色 */
  (function initTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
    applyTheme(saved, false);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') === 'light';
        // 用圆形扩散过渡动画切换主题（参考 View Transitions API 实现，Element Plus 官网同款效果）
        toggleThemeWithReveal(cur ? 'dark' : 'light', toggle);
      });
    }
  })();

  /**
   * 带圆形扩散过渡地切换主题。
   * 观感：暗→亮 = 亮色圆从按钮中心向外扩散、盖住暗色；亮→暗 = 亮色圆向按钮中心回收、露出暗色。
   * 实现要点：过渡所需的圆形剪裁初始值/方向/@keyframes 由本函数在点击时以「具体像素」
   * 动态注入临时 <style>（而非用 CSS 变量，规避部分 Chrome 里伪元素不识别动态 var 导致的
   * 圆心偏移），并写死初始剪裁消除新视图先整帧画出的闪烁。
   * @param {string} theme 目标主题 'light' | 'dark'
   * @param {HTMLElement} originEl 主题切换按钮，作为扩散动画的起始点
   */
  function toggleThemeWithReveal(theme, originEl) {
    // 浏览器不支持 View Transitions 或用户偏好减弱动效时，直接切换，不播动画
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme(theme);
      return;
    }
    // 取按钮中心点作为扩散圆心（视口坐标），并计算覆盖全屏所需半径
    const rect = originEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const R = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    const rootEl = document.documentElement;
    const toLight = theme === 'light';
    const dirClass = toLight ? 'theme-to-light' : 'theme-to-dark';
    // 清掉上一次可能残留的过渡样式与方向 class，确保重复/快速点击时重建
    let st = document.getElementById('theme-transition-style');
    if (st) st.remove();
    rootEl.classList.remove('theme-to-light', 'theme-to-dark');
    // 注入过渡专用 CSS：初始剪裁写死为具体像素（伪元素一创建即生效，消除初帧闪烁），
    // 动画随伪元素创建同步启动，无 JS 时序空隙。
    const css = toLight
      ? [
          `html.${dirClass}::view-transition-old(root){z-index:0}`,
          `html.${dirClass}::view-transition-new(root){z-index:1;clip-path:circle(0px at ${x}px ${y}px);animation:vt-grow 450ms ease-in forwards}`,
          `@keyframes vt-grow{to{clip-path:circle(${R}px at ${x}px ${y}px)}}`
        ].join('\n')
      : [
          `html.${dirClass}::view-transition-old(root){z-index:1;clip-path:circle(${R}px at ${x}px ${y}px);animation:vt-shrink 450ms ease-in forwards}`,
          `html.${dirClass}::view-transition-new(root){z-index:0}`,
          `@keyframes vt-shrink{to{clip-path:circle(0px at ${x}px ${y}px)}}`
        ].join('\n');
    st = document.createElement('style');
    st.id = 'theme-transition-style';
    st.textContent = css;
    document.head.appendChild(st);
    rootEl.classList.add(dirClass);
    // 切换主题：新状态更新后，过渡伪元素会按注入的剪裁动画自行播放
    const transition = document.startViewTransition(() => applyTheme(theme));
    // 过渡结束后清理注入的样式与方向 class
    Promise.resolve(transition.finished)
      .finally(() => {
        rootEl.classList.remove('theme-to-light', 'theme-to-dark');
        const s = document.getElementById('theme-transition-style');
        if (s) s.remove();
      })
      .catch(() => {});
  }

  /** 当前识别模式：'pc'（横屏）或 'portrait'（竖屏） */
  let parseMode = 'pc';

  /** 模式切换交互 */
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      parseMode = btn.dataset.mode;
    });
  });

  /** 显示/更新识别进度条 */
  function setProgress(done, total, label) {
    if (total <= 1) return; // 单张不显示进度条，避免闪烁
    const pct = Math.min(100, Math.round((done / total) * 100));
    progressFill.style.width = pct + '%';
    progressText.textContent = label || `${done} / ${total}`;
    progressEl.classList.remove('hidden');
  }
  function hideProgress() {
    progressEl.classList.add('hidden');
    progressFill.style.width = '0%';
  }

  /** HTML 转义：后端错误/文件信息可能含 < > &，注入到 innerHTML 前必须先转义，避免破结构/XSS */
  function escHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
  }
  /** 显示状态条：按级别自动配单色 SVG 图标（loading 走 ::after 转圈），文本经 escHtml 转义后透传 */
  function setStatus(cls, msg) {
    const iconName = cls === 'error' ? 'error' : cls === 'warn' ? 'warn' : cls === 'loading' ? '' : 'check';
    statusEl.className = 'status ' + (cls || '');
    const safe = msg == null ? '' : escHtml(msg);
    statusEl.innerHTML = safe ? `${iconName ? icon(iconName) + ' ' : ''}<span>${safe}</span>` : '';
    statusEl.classList.toggle('hidden', !msg);
  }

  /** 上传并识别一组图片（逐张识别，实时更新进度） */
  async function uploadAndParse(files) {
    const list = Array.from(files);
    if (!list.length) return;
    setStatus('loading', `正在识别 ${list.length} 张战报，请稍候…`);
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
    hideProgress();

    const items = [];
    try {
      // 逐张调用单图识别接口，每完成一张即刷新进度
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        setProgress(i, list.length, `正在识别第 ${i + 1} / ${list.length} 张：${f.name}`);
        setStatus('loading', `正在识别 ${i + 1} / ${list.length} 张…`);
        const form = new FormData();
        form.append('image', f);
        form.append('mode', parseMode);
        const res = await fetch('/api/parse', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error((data.error || '识别失败') + `（${f.name}）`);
        items.push({ name: f.name, ...data });
      }
      setProgress(list.length, list.length, `完成 ${list.length} / ${list.length}`);
      renderResults(items);
      setStatus('', `共识别 ${items.length} 张战报`);
    } catch (e) {
      setStatus('error', e.message);
    } finally {
      hideProgress();
    }
  }

  /** 渲染识别结果 */
  function renderResults(items) {
    resultsEl.innerHTML = '';
    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'result-item';

      const head = document.createElement('div');
      head.className = 'result-head';

      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.innerHTML = `<img src="${item.image}" alt="战报${idx + 1}" />`;

      const summary = document.createElement('div');
      summary.className = 'result-summary';
      const wins = item.battles.filter((b) => b.result === 'win').length;
      const loses = item.battles.filter((b) => b.result === 'lose').length;
      summary.innerHTML = `
        <h3>战报 ${idx + 1}${item.name ? ' · ' + item.name : ''}</h3>
        <div class="legend">
          <span>尺寸 ${item.imageWidth}×${item.imageHeight}</span>
          <span>战斗 ${item.battles.length} 场</span>
          <span class="win">胜 ${wins}</span>
          <span class="lose">负 ${loses}</span>
        </div>`;

      head.appendChild(thumb);
      head.appendChild(summary);

      const body = document.createElement('div');
      item.battles.forEach((b, i) => {
        body.appendChild(renderBattle(b, i));
      });

      card.appendChild(head);
      card.appendChild(body);
      resultsEl.appendChild(card);
    });
    resultsEl.classList.remove('hidden');
  }

  /** 渲染单场战斗 */
  function renderBattle(b, i) {
    const div = document.createElement('div');
    div.className = 'battle-card ' + (b.result === 'win' ? 'win' : b.result === 'lose' ? 'lose' : '');

    // 顶部：战斗序号 + 同盟对阵 + 时间/结果（三列网格对齐）
    const top = document.createElement('div');
    top.className = 'battle-top';
    const resultText = b.resultText || (b.result === 'win' ? '胜' : b.result === 'lose' ? '败' : '?');
    top.innerHTML = `
      <span class="battle-id">第 ${i + 1} 战</span>
      <div class="alliance-row">
        <div class="alliance-side">
          <span class="alliance-badge">${b.leftAlliance || '未知'}</span>
        </div>
        <span class="vs-sep">VS</span>
        <div class="alliance-side">
          <span class="alliance-badge">${b.rightAlliance || '未知'}</span>
        </div>
      </div>
      <div class="result-block">
        ${b.time ? `<div class="battle-time" title="战报时间">${icon('clock')} ${b.time}</div>` : ''}
        <div class="result-badge ${b.result}">${resultText}</div>
      </div>`;

    // 主体：武将 + 兵力（序号已上移至顶部，正文居中只留体力消耗）
    const body = document.createElement('div');
    body.className = 'battle-body';
    body.innerHTML = `
      <div class="side left">
        ${renderGenerals(b.leftGenerals)}
        ${formatHp(b.leftHp)}
      </div>
      <div class="vs">
        ${b.hpCost ? `<span class="cost">体力-${b.hpCost}</span>` : ''}
      </div>
      <div class="side right">
        ${renderGenerals(b.rightGenerals)}
        ${formatHp(b.rightHp)}
      </div>`;

    div.appendChild(top);
    div.appendChild(body);
    return div;
  }

  /** 兵力展示：形如 "25000/30000"（剩余/战前）→ "兵力 剩余25000 / 战前30000" */
  function formatHp(hp) {
    if (!hp) return '';
    const parts = String(hp).split('/').map((s) => s.trim());
    const html =
      parts.length === 2 && parts[0] && parts[1]
        ? `兵力 剩余${parts[0]} / 战前${parts[1]}`
        : `兵力 ${hp}`;
    return `<div class="hp" title="剩余兵力 / 战前兵力">${html}</div>`;
  }

  /** 渲染武将名列表 */
  function renderGenerals(list) {
    if (!list || !list.length) return '<div class="battle-empty">未识别到武将</div>';
    // 红度：识别结果中每个武将已带 red 字段（0-5，-1 表示未识别）
    const chips = list.map((g) => {
      const red = typeof g.red === 'number' && g.red >= 0 ? g.red : null;
      const redMark = red !== null ? `<i class="gred" title="红度">${red}</i>` : '';
      return `<span class="g-chip">${g.name}${redMark}</span>`;
    }).join('');
    return `<div class="generals">${chips}</div>`;
  }

  // ---- 交互 ----
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    uploadAndParse(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => {
    uploadAndParse(fileInput.files);
    fileInput.value = '';
  });

  // ==================== 数据导入 / 导出 ====================
  const exportBtn = document.getElementById('btn-export');
  const importBtn = document.getElementById('btn-import');
  const importInput = document.getElementById('import-input');

  /** 导出全部战报数据：触发浏览器下载 records.json */
  exportBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = '/api/records/export';
    a.download = 'records.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /** 导入 JSON：选文件 → 客户端先校验 JSON 合法性 → 上传后端合并去重 */
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = ''; // 允许重复选择同一文件
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setStatus('error', '导入失败：文件不是有效的 JSON');
      return;
    }
    setStatus('loading', '正在导入并合并数据…');
    try {
      const res = await fetch('/api/records/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '导入失败');
      const dup = data.total - data.added;
      let msg = `导入完成：新增 ${data.added} 条，合并跳过重复 ${dup} 条`;
      if (data.skipped) msg += `，忽略无效数据 ${data.skipped} 条`;
      setStatus(dup > 0 || data.skipped > 0 ? 'warn' : '', msg);
      // 使同盟筛选与分析缓存失效，保证再次进入分析页时拉到最新数据
      delete analyzeResultEl.dataset.last;
      refreshAllianceChips();
      if (!tabAnalyze.classList.contains('hidden')) loadAnalysis();
    } catch (e) {
      setStatus('error', '导入失败：' + e.message);
    }
  });

  // ==================== 下拉菜单（本地数据 / 云端 共用）====================
  /** 初始化一个下拉菜单：btn 触发开合，点击菜单外自动关闭 */
  function initDropdown(wrap, btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = wrap.querySelector('.dd-menu');
      const isOpen = !menu.classList.contains('hidden');
      closeDropdowns(); // 先收起所有（含本项：若原本是开的，则就此收起）
      if (!isOpen) {
        // 本项原本收起 → 展开它
        menu.classList.remove('hidden');
        wrap.classList.add('open');
      }
    });
  }
  /** 关闭所有下拉菜单 */
  function closeDropdowns() {
    document.querySelectorAll('.dd').forEach((w) => {
      w.querySelector('.dd-menu')?.classList.add('hidden');
      w.classList.remove('open');
    });
  }
  // 点击页面其他区域时关闭全部菜单
  document.addEventListener('click', closeDropdowns);

  /**
   * 将自定义下拉（.sel）初始化为受控菜单：读取 DOM 中 .sel-opt 选项，
   * 值存于根元素 data-value，选中后更新触发区文本并回调 onPick。
   * 用于替代原生 <select>，规避系统原生下拉的白色外观/样式不一致。
   * @param {HTMLElement} root 包裹元素（应含 .sel-trigger 与 .sel-menu）
   * @param {(val:string)=>void} onPick 选中回调，参数为选中值
   */
  function initSelect(root, onPick) {
    const trigger = root.querySelector('.sel-trigger');
    const menu = root.querySelector('.sel-menu');
    const textEl = trigger.querySelector('.sel-text');
    /** 动态读取当前选项（菜单可能被 innerHTML 重绘，避免长期缓存旧元素导致监听/focus 失效） */
    const opts = () => Array.from(menu.querySelectorAll('.sel-opt'));
    /** 绑定当前值：更新 data-value、触发区文本，并高亮选中项 */
    const bind = (val) => {
      const list = opts();
      const opt = list.find((o) => o.dataset.val === val) || list[0];
      root.dataset.value = val;
      if (opt) textEl.textContent = opt.textContent;
      list.forEach((o) => o.classList.toggle('active', o.dataset.val === val));
    };
    // 事件委托：菜单重绘（innerHTML 重建 option）后新选项仍响应点击
    menu.addEventListener('click', (e) => {
      const o = e.target.closest('.sel-opt');
      if (!o) return;
      bind(o.dataset.val);
      menu.classList.add('hidden');
      root.classList.remove('open');
      if (onPick) onPick(o.dataset.val);
    });
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !menu.classList.contains('hidden');
      closeSelects(); // 先收起其他下拉（若本项原本展开则就此收起）
      if (!isOpen) {
        menu.classList.remove('hidden');
        root.classList.add('open');
        bind(root.dataset.value); // 打开时同步高亮当前选中项
      }
    });
    /** 收起本下拉 */
    const close = () => {
      menu.classList.add('hidden');
      root.classList.remove('open');
    };
    /** 将焦点移到相对当前项相邻/首尾的选项（可越界回绕），无高亮项时从当前选中项出发 */
    const moveFocus = (step) => {
      const list = opts();
      const activeIdx = list.findIndex((o) => o === document.activeElement);
      const curIdx = list.findIndex((o) => o.dataset.val === root.dataset.value);
      const base = activeIdx !== -1 ? activeIdx : curIdx;
      const n = list.length;
      const next = base === -1 ? 0 : (base + step + n) % n;
      list[next]?.focus();
    };
    // 键盘可达：方向键在选项间移动、Home/End 跳首尾、Esc 收起并归还焦点到触发区；Enter/Space 走 <button> 原生触发
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(-1); }
      else if (e.key === 'Home') { e.preventDefault(); const l = opts(); l[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); const l = opts(); l[l.length - 1]?.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); trigger.focus(); }
    });
    // 聚焦触发区时：方向键展开并定位，Esc 收起
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menu.classList.contains('hidden')) trigger.click();
        else moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Escape') {
        close();
      }
    });
    bind(root.dataset.value || '');
  }
  /** 关闭所有自定义下拉菜单 */
  function closeSelects() {
    document.querySelectorAll('.sel').forEach((w) => {
      w.querySelector('.sel-menu')?.classList.add('hidden');
      w.classList.remove('open');
    });
  }
  // 点击页面其他区域时同时关闭自定义下拉
  document.addEventListener('click', closeSelects);

  let floatTipEl = null;
  /** 在 body 层显示统一说明气泡（避开 rank 表 overflow:hidden 的裁剪，悬浮于视口） */
  function showFloatTip(html, mod, x, y) {
    if (!floatTipEl) {
      floatTipEl = document.createElement('div');
      floatTipEl.className = 'float-tip';
      document.body.appendChild(floatTipEl);
    }
    floatTipEl.className = 'float-tip show' + (mod ? ' ' + mod : '');
    floatTipEl.innerHTML = html;
    // 先放左上角测出尺寸，再平移回视口内（鼠标右下）
    floatTipEl.style.left = '0px';
    floatTipEl.style.top = '0px';
    const w = floatTipEl.offsetWidth;
    const h = floatTipEl.offsetHeight;
    let left = x + 12;
    let top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 12;
    if (top + h > window.innerHeight - 8) top = y - h - 10;
    floatTipEl.style.left = Math.max(8, left) + 'px';
    floatTipEl.style.top = Math.max(8, top) + 'px';
  }
  /** 隐藏说明气泡 */
  function hideFloatTip() {
    if (floatTipEl) floatTipEl.classList.remove('show');
  }
  /**
   * 为所有带 data-tip 的徽标绑定悬浮说明：委托监听 mouseover/mousedown/scroll。
   * 气泡挂到 body 而非徽标内部，避免被排行表包装层的 overflow 裁剪。
   */
  function bindBadgeTips() {
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('.badge[data-tip]');
      if (!el) { hideFloatTip(); return; }
      const r = el.getBoundingClientRect();
      const mod = el.classList.contains('wb-badge') ? 'wb'
        : el.classList.contains('truck-badge') ? 'truck'
        : el.classList.contains('trap-badge') ? 'trap' : 'hot';
      showFloatTip(el.getAttribute('data-tip'), mod, r.left + r.width / 2, r.bottom);
    });
    document.addEventListener('mousedown', hideFloatTip, true);
    window.addEventListener('scroll', hideFloatTip, true);
  }

  /** 设置页「标识体系」各条目底部的真实徽标预览，与排行表/热力图完全同源（同一套 classes 与配色） */
  function renderBadgePreviews() {
    const s = loadSettings();
    const num = (v, def) => (v === undefined || v === '') ? def : v;
    const html = {
      hot: `${icon('fire')}快速升温<span class="bp-hint">近 ${num(s.hotHours, 3)} 小时新出现 ≥${num(s.hotMin, 5)} 场 · 占比 ≥${num(s.hotRate, 10)}%</span>`,
      wb: `${icon('star')}白板之光<span class="bp-hint">低红段 ≥${num(s.wbMin, 5)} 场 · 胜率 ≥${num(s.wbRate, 51)}%</span>`,
      truck: `${icon('truck')}泥头车<span class="bp-hint">胜率 ≥${num(s.truckRate, 60)}%</span>`,
      trap: `${icon('warn')}陷阱<span class="bp-hint">≥${num(s.trapMin, 20)} 场 · 胜率 &lt;50%</span>`,
    };
    document.querySelectorAll('.badge-preview').forEach((el) => {
      el.innerHTML = html[el.dataset.kind] ? `<span class="badge ${el.dataset.kind}-badge">${html[el.dataset.kind]}</span>` : '';
    });
  }

  const localWrap = document.getElementById('local-wrap');
  const localMenu = document.getElementById('local-menu');
  const cloudWrap = document.getElementById('cloud-wrap');
  const cloudMenu = document.getElementById('cloud-menu');
  initDropdown(localWrap, document.getElementById('btn-local'));
  initDropdown(cloudWrap, document.getElementById('btn-cloud'));

  // ==================== 确认弹窗（替代原生 confirm / alert）====================
  const modalEl = document.getElementById('modal');
  const modalIcon = document.getElementById('modal-icon');
  const modalTitle = document.getElementById('modal-title');
  const modalMsg = document.getElementById('modal-msg');
  const modalOk = document.getElementById('modal-ok');
  const modalCancel = document.getElementById('modal-cancel');
  const modalInput = document.getElementById('modal-input');

  /**
   * 弹出自定义确认框，返回 Promise<boolean>（回车=确定，Esc/取消=否）。
   * @param opts { title, message, okText, okClass, icon }
   */
  function openConfirm(opts = {}) {
    return new Promise((resolve) => {
      const { title = '确认操作', message = '', okText = '确定', okClass = 'btn-primary', icon: iconName = 'warn' } = opts;
      modalTitle.textContent = title;
      modalMsg.textContent = message;
      modalIcon.innerHTML = icon(iconName);
      modalOk.textContent = okText;
      modalOk.className = 'btn ' + okClass;
      modalEl.classList.remove('hidden');
      const done = (val) => {
        modalEl.classList.add('hidden');
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onKey = (e) => {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter') done(true);
      };
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      modalOk.focus();
    });
  }

  /** 单按钮提示框（替代原生 alert） */
  function openAlert(message, opts = {}) {
    const { title = '提示', icon: iconName = 'info' } = opts;
    return openConfirm({ title, message, icon: iconName, okText: '知道了', okClass: 'btn-primary' });
  }

  /**
   * 弹出带口令输入框的确认框（用于清空云端等危险操作），返回 Promise<string|null>。
   * 确定/回车 = 输入的口令；Esc/取消 = null。校验在服务端完成，口令不进前端代码。
   * @param opts { title, message, okText, okClass, icon, placeholder }
   */
  function openPassword(opts = {}) {
    return new Promise((resolve) => {
      const { title = '口令确认', message = '', okText = '确定', okClass = 'btn-danger', icon: iconName = 'lock', placeholder = '请输入操作口令' } = opts;
      modalTitle.textContent = title;
      modalMsg.textContent = message;
      modalIcon.innerHTML = icon(iconName);
      modalOk.textContent = okText;
      modalOk.className = 'btn ' + okClass;
      modalInput.placeholder = placeholder;
      modalInput.value = '';
      modalInput.removeAttribute('hidden');
      modalEl.classList.remove('hidden');
      const done = (val) => {
        modalEl.classList.add('hidden');
        modalInput.setAttribute('hidden', '');
        modalOk.removeEventListener('click', onOk);
        modalCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
        resolve(val);
      };
      const onOk = () => done(modalInput.value);
      const onCancel = () => done(null);
      const onKey = (e) => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter') done(modalInput.value);
      };
      modalOk.addEventListener('click', onOk);
      modalCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      modalInput.focus();
    });
  }

  const cloudFetch = document.getElementById('cloud-fetch');
  const cloudPush = document.getElementById('cloud-push');

  /** 下载云端数据：用云端覆盖本地（破坏性，需二次确认） */
  cloudFetch.addEventListener('click', async () => {
    closeDropdowns();
    const ok = await openConfirm({
      title: '覆盖本地数据',
      message: '即将从云端【下载】数据并覆盖当前本地数据。\n本地未归档的记录将被替换，此操作不可恢复。',
      okText: '下载并覆盖',
      okClass: 'btn-danger',
      icon: 'download',
    });
    if (!ok) return;
    setStatus('loading', '正在从云端下载数据…');
    try {
      const res = await fetch('/api/cloud/pull');
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '云端下载失败');
      setStatus('warn', `已从云端下载并覆盖本地，共 ${data.total} 条记录`);
      // 本地数据已变更：失效分析缓存并刷新联盟筛选，与分析页一致
      delete analyzeResultEl.dataset.last;
      refreshAllianceChips();
      if (!tabAnalyze.classList.contains('hidden')) loadAnalysis();
    } catch (e) {
      setStatus('error', `云端下载失败：${e.message}`);
    }
  });

  /** 上传本地数据：与云端按去重键合并后写回（不再直接覆盖，避免丢失云端已有记录） */
  cloudPush.addEventListener('click', async () => {
    closeDropdowns();
    const ok = await openConfirm({
      title: '合并上传到云端',
      message: '即将把本地数据与云端数据【合并去重】后写回云端（records.json）。\n云端已存在的记录会保留，仅并入本地新增记录。',
      okText: '上传并合并',
      okClass: 'btn-danger',
      icon: 'upload',
    });
    if (!ok) return;
    setStatus('loading', '正在合并上传到云端…');
    try {
      const res = await fetch('/api/cloud/push', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '云端上传失败');
      let msg = `云端合并完成：共 ${data.total} 条（本次新增 ${data.added} 条）`;
      if (data.skipped) msg += `，忽略无效数据 ${data.skipped} 条`;
      setStatus('warn', msg);
    } catch (e) {
      setStatus('error', `云端上传失败：${e.message}`);
    }
  });

  /** 清空云端数据：口令在服务端校验，前端不存口令 */
  document.getElementById('btn-cloud-clear').addEventListener('click', async () => {
    const pw = await openPassword({
      title: '清空云端数据',
      message: '即将清空 JSONBin 云端保存的全部战报数据（records.json）。\n此操作不可恢复，仅影响云端，不影响本地数据。\n请输入操作口令确认：',
      okText: '清空',
      okClass: 'btn-danger',
      icon: 'trash',
    });
    if (pw == null) return;
    try {
      const res = await fetch('/api/cloud/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '清空失败');
      openAlert(`口令验证通过，云端数据已清空（原 ${data.cleared} 条）。`, { title: '清空完成', icon: 'check' });
    } catch (e) {
      openAlert(e.message, { title: '操作失败', icon: 'error' });
    }
  });

  // ==================== 数据分析 ====================
  const tabParse = document.getElementById('tab-parse');
  const tabAnalyze = document.getElementById('tab-analyze');
  const analyzeResultEl = document.getElementById('analyze-result');
  const allianceChips = document.getElementById('filter-alliance');
  const hoursSel = document.getElementById('filter-hours');
  const hpSel = document.getElementById('filter-hp');
  const countSel = document.getElementById('filter-count');
  const colorToggle = document.getElementById('toggle-color');
  /** 当前选中的同盟（空串表示全部） */
  let currentAlliance = '';
  /** 分析页当前子视图：'rank'（阵容胜率排行）或 'matrix'（对战热力图） */
  let currentView = 'rank';
  /** 胜率排序方向：null 不排（按场次）、'desc' 降序、'asc' 升序 */
  let rateSort = null;

  // ==================== 全屏查看（排行 / 热力图） ====================
  const fsView = document.getElementById('fs-view');
  const fsBody = document.getElementById('fs-body');
  const fsAllianceEl = document.getElementById('fs-alliance');
  const fsHours = document.getElementById('fs-hours');
  const fsHp = document.getElementById('fs-hp');
  const fsCount = document.getElementById('fs-count');
  const fsColor = document.getElementById('fs-color');
  /** 全屏查看内部可变状态：当前子视图/排序/同盟筛选/数据缓存（集中在一对象，避免零散顶层变量） */
  const fsState = { currentView: 'rank', rateSort: null, alliance: '', data: null };
  /** 生成胜率表头排序按钮（不排=双向箭头、desc=升序箭头、asc=降序箭头），主页面与全屏共用 */
  function sortHeaderBtn(s) {
    const ic = s === null ? 'sort' : s === 'desc' ? 'sortAsc' : 'sortDesc';
    const active = s ? ' active' : '';
    return `<button type="button" class="sort-btn${active}" data-sort="rate" aria-label="按胜率排序">胜率 <span>${icon(ic)}</span></button>`;
  }
  /** 循环切换排序方向：null → desc → asc → null */
  function nextSort(s) {
    return s === null ? 'desc' : s === 'desc' ? 'asc' : null;
  }
  /** 按胜率比较器（asc 升序 / desc 降序），主页面与全屏共用 */
  function byWinRate(s) {
    return (a, b) => (s === 'asc' ? a.winRate - b.winRate : b.winRate - a.winRate);
  }

  // ==================== 设置 ====================
  const tabSettings = document.getElementById('tab-settings');
  const SETTINGS_KEY = 'zabao.settings';
  // 默认设置：有效战报口径(0=不限) + 快速升温门槛(近3h/至少5场/占比10%)
  const DEFAULT_SETTINGS = { count: '0', hp: '0', hotHours: '3', hotMin: '5', hotRate: '10', wbRate: '51', wbMin: '5', truckRate: '60', truckMin: '5', hotShow: '1', wbShow: '1', truckShow: '1', trapMin: '20', trapShow: '1' };
  const settingsEls = {
    count: document.getElementById('set-count'),
    hp: document.getElementById('set-hp'),
    hotHours: document.getElementById('set-hot-hours'),
    hotMin: document.getElementById('set-hot-min'),
    hotRate: document.getElementById('set-hot-rate'),
    wbRate: document.getElementById('set-wb-rate'),
    wbMin: document.getElementById('set-wb-min'),
    truckRate: document.getElementById('set-truck-rate'),
    truckMin: document.getElementById('set-truck-min'),
    hotShow: document.getElementById('set-hot-show'),
    wbShow: document.getElementById('set-wb-show'),
    truckShow: document.getElementById('set-truck-show'),
    trapMin: document.getElementById('set-trap-min'),
    trapShow: document.getElementById('set-trap-show'),
  };
  const settingsToast = document.getElementById('settings-toast');
  /** 读取持久化设置（解析失败回退默认值） */
  function loadSettings() {
    try {
      return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  /** 写入持久化设置 */
  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }
  /** 将设置对象回填到设置表单控件（checkbox 用 checked，其余用 value） */
  function fillSettingsForm(s) {
    for (const k in settingsEls) {
      const el = settingsEls[k];
      if (el.type === 'checkbox') el.checked = String(s[k]) === '1';
      else el.value = s[k];
    }
  }
  /** 显示保存成功提示 */
  function showSettingsToast(msg) {
    settingsToast.textContent = msg;
    settingsToast.classList.add('show');
    clearTimeout(showSettingsToast._t);
    showSettingsToast._t = setTimeout(() => settingsToast.classList.remove('show'), 2200);
  }

  // ==================== 洞察（阵容走势 + 对战克制 + CSV/海报导出） ====================
  const tabInsight = document.getElementById('tab-insight');
  const insightAllianceEl = document.getElementById('insight-alliance');
  const insightHours = document.getElementById('insight-hours');
  const insightHp = document.getElementById('insight-hp');
  const insightDays = document.getElementById('insight-days');
  const insightComp = document.getElementById('insight-comp');
  const trendChartEl = document.getElementById('trend-chart');
  const matchupListEl = document.getElementById('matchup-list');
  const btnInsightCsv = document.getElementById('btn-insight-csv');
  const btnInsightPoster = document.getElementById('btn-insight-poster');
  /** 洞察页状态：当前同盟 / /api/analyze 返回 / 选中阵容（集中管理避免零散变量） */
  const insightState = { alliance: '', data: null, comp: '' };

  /** 本地时区日期 YYYY-MM-DD（导出文件名用，避免 toISOString 的 UTC 差一天） */
  function locDate() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** 将洞察页 .sel 触发区文本同步为选中值（元素值存于 data-value） */
  function setInsightCompValue(value) {
    insightComp.dataset.value = value || '';
    const opt = insightComp.querySelector(`.sel-opt[data-val="${value}"]`);
    const textEl = insightComp.querySelector('.sel-text');
    if (opt && textEl) textEl.textContent = opt.textContent;
  }
  /** 以分析数据填充阵容下拉选项（菜单重绘；监听走 initSelect 的事件委托，无需重新绑定） */
  function buildCompMenu(comps) {
    const menu = insightComp.querySelector('.sel-menu');
    menu.innerHTML = (comps || []).map((c) => `<button type="button" class="sel-opt" data-val="${escHtml(c.comp)}">${escHtml(c.comp)}</button>`).join('');
  }
  /** 加载洞察页分析数据：/api/analyze 快照 → 填充阵容下拉 → 渲染走势与克制 */
  /** 组装洞察页共用的筛选查询串（同盟/时间/兵力），extra 为额外参数（如 comp/days） */
  function insightParams(extra) {
    const params = new URLSearchParams();
    if (insightState.alliance) params.set('alliance', insightState.alliance);
    if (Number(insightHours.dataset.value || 0) > 0) params.set('hours', insightHours.dataset.value);
    if (Number(insightHp.dataset.value || 0) > 0) params.set('minHp', insightHp.dataset.value);
    if (extra) for (const k in extra) params.set(k, extra[k]);
    return params;
  }
  async function loadInsight() {
    const params = insightParams();
    try {
      const res = await fetch('/api/analyze?' + params.toString());
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '加载失败');
      insightState.data = data;
      buildCompMenu(data.comps || []);
      // 保持当前选中的阵容；无则默认取场次最多的
      const first = data.comps && data.comps[0] ? data.comps[0].comp : '';
      const comp = insightState.comp || first;
      if (comp) {
        insightState.comp = comp;
        setInsightCompValue(comp);
        renderTrend(comp);
        renderMatchups(comp);
      } else {
        trendChartEl.innerHTML = `<div class="insight-empty">${icon('info')} 暂无可用阵容数据</div>`;
        matchupListEl.innerHTML = '';
      }
    } catch (e) {
      trendChartEl.innerHTML = `<div class="status error">${icon('error')} ${e.message}</div>`;
    }
  }
  /** 走势请求序号：快速切换窗口/阵容时用于丢弃过期响应，避免旧请求覆盖新图表（竞态防护） */
  let trendReqSeq = 0;
  /** 渲染某阵容近 N 天走势（内联 SVG 柱状图，纯原生无三方库） */
  function renderTrend(comp) {
    if (!comp) return;
    trendChartEl.innerHTML = `<div class="status loading">加载走势中…</div>`;
    const reqId = ++trendReqSeq; // 记录本次请求序号，响应/异常均需校验仍为最新才渲染
    const params = insightParams({ comp, days: insightDays.dataset.value || '14' });
    fetch('/api/analyze/trend?' + params.toString())
      .then((r) => r.json())
      .then((data) => {
        if (reqId !== trendReqSeq) return; // 已不是最新请求，丢弃过期结果
        if (data.error) throw new Error(data.error);
        const points = data.points || [];
        const total = points.reduce((s, p) => s + p.total, 0);
        if (!total) {
          trendChartEl.innerHTML = `<div class="insight-empty">${icon('info')} 所选阵容在近 ${data.days || 14} 天内暂无战报，可尝试放大「走势窗口」或切换阵容</div>`;
          return;
        }
        const W = 560, H = 152, padT = 20, padB = 18, padL = 20, padR = 20;
        // 顶部内边距给「接近 100% 的高柱」其上方胜率文字留出完整字高，四周留白避免标签被裁切
        const plotW = W - padL - padR;
        const innerH = H - padT - padB;
        const bw = plotW / points.length;
        const maxRate = 100; // 胜率天然 0-100，柱高按 100% 归一即可
        // 柱几何统一推导（柱高按胜率 100% 归一、活跃日至少 2px，柱顶 y 依内边距）；主图与柱顶数值标注共用，避免重复推导
        const bh = (p) => (p.total ? Math.max(2, (p.winRate / maxRate) * innerH) : 0);
        const by = (h) => H - padB - h;
        const bars = points.map((p, i) => {
          const h = bh(p);
          const y = by(h);
          const c = winRateColor(p.winRate);
          const fill = c ? `rgb(${c.join(',')})` : '#8b98ad';
          return `<rect x="${padL + i * bw + bw * 0.18}" y="${y}" width="${bw * 0.64}" height="${h}" rx="2" fill="${fill}" title="${escHtml(p.day)}：出场 ${p.total} 场 · ${p.wins} 胜 · 胜率 ${p.winRate}%"/>`;
        }).join('');
        // 稀疏日期刻度：首/中均分/尾，最多 6 个（MM/DD），避免柱被遮挡、标签重叠
        const labelCount = Math.min(6, points.length);
        const labelIdx = new Set([...Array(labelCount)].map((_, k) => ((points.length - 1) * k) / (labelCount - 1) | 0));
        const ticks = [...labelIdx].sort((a, b) => a - b).map((i) => {
          const d = points[i].day.slice(5).replace('-', '/');
          return `<text x="${padL + i * bw + bw * 0.5}" y="${H - 6}" text-anchor="middle" class="trend-day">${d}</text>`;
        }).join('');
        // 图表参考线：25/50/75% 水平浅格 + 0 基线，便于对照柱高
        const grid = [25, 50, 75].map((g) => {
          const gy = H - padB - (g / 100) * innerH;
          return `<line class="trend-grid" x1="${padL}" x2="${padL + plotW}" y1="${gy}" y2="${gy}"/>`;
        }).join('');
        const base = `<line class="trend-base" x1="${padL}" x2="${padL + plotW}" y1="${H - padB}" y2="${H - padB}"/>`;
        // 「最近胜率」取最近一场有数据（total>0）的日期，避免末位无数据日误显示 0%
        const lastData = [...points].reverse().find((p) => p.total > 0);
        const wsum = points.reduce((s, p) => s + p.wins, 0);
        const peak = Math.max(...points.map((p) => p.winRate));
        const wrClr = (r) => { const c = winRateColor(r); return c ? `rgb(${c.join(',')})` : '#8b98ad'; };
        const lastVal = lastData ? lastData.winRate + '%' : '—';
        const lastDir = lastData ? `style="color:${wrClr(lastData.winRate)}"` : 'style="color:var(--text-faint)"';
        // 柱顶胜率数值标注：按「有数据的天数」决定——不多则全标，过多则均匀抽样，避免标签重叠
        const activeIdx = points.map((p, i) => (p.total > 0 ? i : -1)).filter((i) => i >= 0);
        let valIdx;
        if (activeIdx.length <= 14) {
          valIdx = activeIdx; // 活跃日较少，全部标注胜率
        } else {
          // 活跃日很多（高频阵容 + 长窗口）：均匀抽样最多 14 个索引，兼顾可读性
          const step = Math.max(1, Math.ceil(activeIdx.length / 14));
          valIdx = activeIdx.filter((_, k, a) => k === 0 || k === a.length - 1 || k % step === 0);
        }
        const vals = (() => {
          // 相邻标签防重叠：按 x 间距 ≥26px 贪心保留，间距不足的邻近柱省略数值
          let lastX = -Infinity;
          const shown = [];
          for (const i of valIdx) {
            const x = padL + i * bw + bw * 0.5;
            if (x - lastX >= 26) { shown.push(i); lastX = x; }
          }
          return shown.map((i) => {
            const p = points[i];
            const vy = Math.max(12, by(bh(p)) - 5); // 下限保护：高柱胜率文字不至于顶穿 SVG 上边界
            return `<text x="${padL + i * bw + bw * 0.5}" y="${vy}" text-anchor="middle" class="trend-val">${p.winRate}%</text>`;
          }).join('');
        })();
        // 底部关键指标：总场次 / 胜负 / 最近胜率 / 单日最高，浅分隔线横向排布
        const metrics = `
          <div class="trend-metrics">
            <div class="tm"><span class="tm-k">总场次</span><span class="tm-v">${total}</span></div>
            <div class="tm"><span class="tm-k">胜负</span><span class="tm-v"><b class="st-win">${wsum}</b><span class="tm-sep">/</span><b class="st-lose">${total - wsum}</b></span></div>
            <div class="tm"><span class="tm-k">最近胜率</span><span class="tm-v" ${lastDir}>${lastVal}</span></div>
            <div class="tm"><span class="tm-k">单日最高</span><span class="tm-v" style="color:${wrClr(peak)}">${peak}%</span></div>
          </div>`;
        trendChartEl.innerHTML = `<div class="trend-frame"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="trend-svg" role="img" aria-label="${escHtml(comp)} 近${data.days}天胜率走势">${grid}${base}${bars}${vals}${ticks}</svg></div>${metrics}`;
      })
      .catch((e) => { if (reqId !== trendReqSeq) return; trendChartEl.innerHTML = `<div class="status error">${icon('error')} ${e.message}</div>`; });
  }
  /** 渲染所选阵容 vs 各对手的克制列表（基于现有 matrix.cells，纯前端） */
  function renderMatchups(comp) {
    const data = insightState.data;
    if (!data || !data.matrix || !data.matrix.cells) {
      matchupListEl.innerHTML = `<div class="insight-empty">先加载分析数据</div>`;
      return;
    }
    const me = data.matrix.cells[comp];
    if (!me) { matchupListEl.innerHTML = `<div class="insight-empty">所选阵容暂无对阵数据</div>`; return; }
    const rows = Object.keys(me)
      .filter((k) => k !== comp && me[k] && me[k].total > 0)
      .map((k) => ({ comp: k, total: me[k].total, wins: me[k].wins, winRate: me[k].winRate }))
      .sort((a, b) => b.winRate - a.winRate || b.total - a.total);
    if (!rows.length) { matchupListEl.innerHTML = `<div class="insight-empty">暂无对阵数据</div>`; return; }
    // 最强对手 = 对本阵容胜率最低（我方胜率低）且场次达标的对手；最弱对手 = 反之
    const samples = rows.filter((r) => r.total >= 3);
    const hardCounter = samples.length ? samples.slice().sort((a, b) => a.winRate - b.winRate)[0] : null;
    const easy = samples.length ? samples.slice().sort((a, b) => b.winRate - a.winRate)[0] : null;
    const head = `<div class="matchup-head"><span>阵容</span><span>场次</span><span>胜率</span></div>`;
    matchupListEl.innerHTML = head + rows.map((r) => {
      const c = winRateColor(r.winRate);
      const bg = c ? `rgb(${c.join(',')})` : 'rgba(130,140,152,0.28)';
      const fg = c ? textColorFor(c) : '#8b98ad';
      const mark = hardCounter && r.comp === hardCounter.comp ? `<span class="the-pill">最强对手</span>`
        : easy && r.comp === easy.comp ? `<span class="the-pill easy">最弱对手</span>` : '';
      return `<div class="matchup-row"><span class="mu-comp"><span class="mu-label">${escHtml(r.comp)}</span>${mark}</span><span class="mu-count">${r.total}场 · ${r.wins}胜</span><span class="mu-rate" style="background:${bg};color:${fg}">${r.winRate}%</span></div>`;
    }).join('');
  }
  /** 导出当前筛选下方阵容排行 CSV（前端拼装，零后端改动） */
  function exportCsv() {
    const data = insightState.data;
    if (!data || !data.comps || !data.comps.length) { setStatus('warn', '暂无数据可导出'); return; }
    const head = ['阵容', '场次', '胜', '胜率%', '平均红度'].join(',');
    const lines = data.comps.map((c) => [c.comp, c.total, c.wins, c.winRate, c.avgStars].join(','));
    const csv = '\uFEFF' + head + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `阵容胜率排行_${locDate()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    setStatus('ok', 'CSV 已导出');
  }
  /** 生成阵容排行图片海报（canvas 绘制 → PNG 下载），按当前主题配色 */
  function exportPoster() {
    const data = insightState.data;
    if (!data || !data.comps || !data.comps.length) { setStatus('warn', '暂无数据可生成'); return; }
    const comps = data.comps.slice(0, 20);
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    const W = 980, pad = 24, rowH = 30, headH = 46, titleH = 70;
    const H = titleH + headH + comps.length * rowH + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = light ? '#ffffff' : '#0e1420';
    ctx.fillRect(0, 0, W, H);
    const titleColor = light ? '#1c2534' : '#e7edf6';
    const dimColor = light ? '#66707f' : '#8b98ad';
    const lineColor = light ? '#e2e7ee' : '#232f47';
    ctx.fillStyle = titleColor;
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillText('欧润吉 · 阵容胜率排行', pad, 44);
    ctx.fillStyle = dimColor;
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`导出时间 ${new Date().toLocaleString('zh-CN')} ｜ 有效战报 ${data.total} 场`, pad, 66);
    const cols = [
      { t: '阵容', x: pad }, { t: '场次', x: pad + 420 }, { t: '胜', x: pad + 500 },
      { t: '胜率', x: pad + 580 }, { t: '平均红度', x: pad + 690 },
    ];
    let y = titleH + headH;
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = titleColor;
    cols.forEach((c) => ctx.fillText(c.t, c.x, y - headH + 28));
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    comps.forEach((c) => {
      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad, y - rowH + 10);
      ctx.lineTo(W - pad, y - rowH + 10);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = titleColor;
      ctx.fillText(c.comp, cols[0].x, y);
      ctx.fillText(String(c.total), cols[1].x, y);
      ctx.fillText(String(c.wins), cols[2].x, y);
      // 恰好 50% 时 winRateColor 返回 null：回退中性灰块，使胜率块与浅/深背景均清晰区分
      const col = winRateColor(c.winRate) || [140, 148, 158];
      ctx.fillStyle = `rgb(${col.join(',')})`;
      const b = cols[3].x - 4, bw2 = 74, bh = 20;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b, y - 16, bw2, bh, 6);
      else ctx.rect(b, y - 16, bw2, bh);
      ctx.fill();
      ctx.fillStyle = textColorFor(col);
      ctx.fillText(`${c.winRate}%`, b + 10, y);
      ctx.fillStyle = titleColor;
      ctx.fillText(c.starsKnown ? `${c.avgStars}红` : '—', cols[4].x, y);
      y += rowH;
    });
    // 渲染完成 → 转 dataURL，先弹预览浮层，确认满意后再保存
    const url = canvas.toDataURL('image/png');
    showPosterPreview(url, () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = `欧润吉阵容排行_${locDate()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('ok', '海报已保存');
    });
  }
  /**
   * 海报预览浮层：生成后先预览，点击「保存图片」才下载，Esc/关闭可退出。
   * 浮层元素首次创建后复用，避免重复绑定事件。
   * @param {string} src 图片 dataURL
   * @param {function} onSave 确认保存回调（下载在内部触发）
   */
  function showPosterPreview(src, onSave) {
    let pv = document.getElementById('poster-preview');
    if (!pv) {
      pv = document.createElement('div');
      pv.id = 'poster-preview';
      pv.className = 'poster-preview';
      pv.innerHTML = `
        <div class="pp-card">
          <div class="pp-head"><span class="pp-title">海报预览</span><button type="button" class="pp-close" title="关闭">${icon('x')}</button></div>
          <div class="pp-body"><img alt="海报预览" /></div>
          <div class="pp-foot"><button type="button" class="btn btn-soft pp-cancel">关闭</button><button type="button" class="btn btn-primary pp-save">保存图片</button></div>
        </div>`;
      document.body.appendChild(pv);
      const close = () => { pv.classList.add('hidden'); document.body.classList.remove('fs-lock'); };
      pv.querySelector('.pp-close').addEventListener('click', close);
      pv.querySelector('.pp-cancel').addEventListener('click', close);
      pv.querySelector('.pp-save').addEventListener('click', () => { onSave(); close(); });
      pv.querySelector('.pp-card').addEventListener('click', (e) => e.stopPropagation());
      pv.addEventListener('click', close);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pv.classList.contains('hidden')) close(); });
    }
    pv.querySelector('.pp-body img').src = src;
    pv.classList.remove('hidden');
    document.body.classList.add('fs-lock');
  }
  // 洞察页下拉初始化：时间 / 兵力变更重载分析；阵容变更重渲染走势与克制
  initSelect(insightHours, () => loadInsight());
  initSelect(insightHp, () => loadInsight());
  // 走势窗口变更：只重绘走势图（克制列表与窗口无关），并同步卡片说明文案
  initSelect(insightDays, () => {
    const opt = insightDays.querySelector(`.sel-opt[data-val="${insightDays.dataset.value}"]`);
    const descEl = document.getElementById('insight-trend-desc');
    if (opt && descEl) descEl.textContent = `所选阵容近 ${opt.textContent.replace('近 ', '').replace(' 天', '')} 天逐日出场与胜率走势`;
    renderTrend(insightState.comp);
  });
  initSelect(insightComp, (val) => { insightState.comp = val; renderTrend(val); renderMatchups(val); });
  // 洞察页同盟 chips：提取去重同盟，点击切换后重载
  fetch('/api/records')
    .then((r) => r.json())
    .then((data) => {
      const list = [...new Set(((data.items || []).map((r) => r.alliance)).filter(Boolean))].sort();
      const all = ['', ...list];
      insightAllianceEl.innerHTML = all.map((a) => `<button type="button" class="chip" data-alliance="${escHtml(a)}">${a || '全部'}</button>`).join('');
      Array.from(insightAllianceEl.querySelectorAll('.chip')).forEach((chip) => chip.addEventListener('click', () => {
        insightState.alliance = chip.dataset.alliance || '';
        setActiveChip(insightAllianceEl, insightState.alliance);
        loadInsight();
      }));
    })
    .catch(() => {});
  btnInsightCsv.addEventListener('click', exportCsv);
  btnInsightPoster.addEventListener('click', exportPoster);

  /** 切换到指定标签页并执行对应页面的加载动作；写入 zabao.tab 供刷新后恢复 */
  function activateTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    tabParse.classList.toggle('hidden', tab !== 'parse');
    tabAnalyze.classList.toggle('hidden', tab !== 'analyze');
    tabInsight.classList.toggle('hidden', tab !== 'insight');
    tabSettings.classList.toggle('hidden', tab !== 'settings');
    if (tab === 'analyze') {
      // 首次打开分析页时先套用「有效战报默认口径」为筛选器初值，再加载
      if (!caliberApplied) { applyDefaultCaliber(); caliberApplied = true; }
      loadAnalysis();
    }
    if (tab === 'insight') loadInsight();
    if (tab === 'settings') fillSettingsForm(loadSettings());
  }
  /** 切换标签页 */
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      try { localStorage.setItem('zabao.tab', btn.dataset.tab); } catch (e) {}
      activateTab(btn.dataset.tab);
    });
  });

  /** 在结果区顶部显示细加载条（不替换内容，避免高度塌陷导致页面回顶） */
  function showLoadingBar() {
    let bar = analyzeResultEl.querySelector('.analyze-loading');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'analyze-loading';
      analyzeResultEl.prepend(bar);
    }
    bar.textContent = '加载统计中…';
  }
  function hideLoadingBar() {
    const bar = analyzeResultEl.querySelector('.analyze-loading');
    if (bar) bar.remove();
  }

  /** 将「有效战报默认口径」(settings 的 count/hp) 套用到分析页筛选器：取不大于目标值的最大档位 */
  let caliberApplied = false;
  function applyDefaultCaliber() {
    selectLargestAtMost(countSel, Number(loadSettings().count) || 0);
    selectLargestAtMost(hpSel, Number(loadSettings().hp) || 0);
  }
  /** 在下拉控件中选中 data-val ≤ 目标的最后一个档位（首项为「全部」），并同步高亮与文本 */
  function selectLargestAtMost(dd, target) {
    const opts = Array.from(dd.querySelectorAll('.sel-opt'));
    let chosen = opts[0] || null;
    for (const o of opts) if (Number(o.dataset.val) <= target) chosen = o;
    if (!chosen) return;
    dd.dataset.value = chosen.dataset.val;
    const t = dd.querySelector('.sel-text');
    if (t) t.textContent = chosen.textContent.trim();
    opts.forEach((o) => o.classList.toggle('active', o === chosen));
  }

  /** 加载分析数据 */
  async function loadAnalysis() {
    // 每次加载/刷新分析时同步刷新同盟筛选列表，确保新识别的同盟实时出现在下拉中
    refreshAllianceChips();
    const params = new URLSearchParams();
    if (currentAlliance) params.set('alliance', currentAlliance);
    if (Number(hoursSel.dataset.value || 0) > 0) params.set('hours', hoursSel.dataset.value);
    if (Number(hpSel.dataset.value || 0) > 0) params.set('minHp', hpSel.dataset.value);
    if (Number(countSel.dataset.value || 0) > 0) params.set('minCount', countSel.dataset.value);
    // 快速升温 / 白板之光 / 泥头车 / 陷阱判定阈值由设置页驱动，随本次分析请求下发（与全屏共用同一复用函数）
    appendThresholdParams(params);
    // 记录当前滚动位置，筛选切换后保持浏览位置不变，不再跳回顶部
    const prevScroll = window.scrollY;
    // 已有内容时保留旧数据，仅显示顶部细加载条，避免内容清空导致高度塌陷、滚动被钳制回顶
    if (analyzeResultEl.dataset.last) {
      showLoadingBar();
    } else {
      analyzeResultEl.innerHTML = '<div class="status loading">加载统计中…</div>';
    }
    try {
      const res = await fetch('/api/analyze?' + params.toString());
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '加载失败');
      renderAnalysis(data);
      // 渲染完成后恢复原滚动位置
      requestAnimationFrame(() => window.scrollTo(0, prevScroll));
    } catch (e) {
      analyzeResultEl.innerHTML = `<div class="status error">${icon('error')} ${e.message}</div>`;
    } finally {
      hideLoadingBar();
    }
  }

  /** 布局顺序：红度分档（次数组建时保证顺序） */
  const BRACKET_ORDER = ['0-5红', '6-8红', '9-11红', '12-14红', '15红'];

  /** 渲染分析结果（按当前子视图渲染排名表或对战矩阵） */
  function renderAnalysis(data) {
    if (!data.comps || !data.comps.length) {
      analyzeResultEl.innerHTML =
        '<div class="empty-state">暂无数据，请先在上方「战报识别」标签上传并识别战报。</div>';
      // 数据为空时清除缓存，避免清空记录后切换到子页签仍用旧缓存重绘出过期数据
      delete analyzeResultEl.dataset.last;
      return;
    }
    const colorOn = colorToggle.checked;
    analyzeResultEl.innerHTML =
      currentView === 'matrix' ? renderMatrix(data, colorOn) : renderRanking(data, colorOn);
    // 缓存本次数据，供「颜色显示」开关切换时无请求重绘
    analyzeResultEl.dataset.last = JSON.stringify(data);
  }

  /** 窗口尺寸变化时：矩阵视图按新宽度重排阵容列数，保证无横向滚动条且内容完整 */
  let matrixResizeTimer = null;
  window.addEventListener('resize', () => {
    if (currentView !== 'matrix' || !analyzeResultEl.dataset.last) return;
    clearTimeout(matrixResizeTimer);
    matrixResizeTimer = setTimeout(() => {
      const prevScroll = window.scrollY;
      try {
        renderAnalysis(JSON.parse(analyzeResultEl.dataset.last));
        requestAnimationFrame(() => window.scrollTo(0, prevScroll));
      } catch (e) {
        /* 缓存数据异常时静默跳过，保留原视图 */
      }
    }, 200);
  });

  /** 渲染「阵容胜率排行」子页面 */
  function renderRanking(data, colorOn) {
    // 前 30 榜单：默认展示场次最多（且胜率次优）的前 30 个阵容；点胜率表头可按胜率升降序
    const TOP_N = 30;
    let comps = data.comps;
    if (rateSort) comps = [...comps].sort(byWinRate(rateSort));
    const topComps = comps.slice(0, TOP_N);
    return `
      <h3 class="section-title">${icon('trophy')} 阵容胜率排行
        <span class="top-badge">前 ${topComps.length}</span>
        <button type="button" class="expand-btn" data-view="rank" title="展开铺满窗口查看">${icon('expand')} 展开</button>
      </h3>
      <p class="record-count">已收录 <b>${data.total}</b> 场战斗</p>
      <div class="table-wrap rank-table-wrap">
        <table class="rank-table">
          <thead>
            <tr>
              <th>#</th><th>阵容</th><th>${sortHeaderBtn(rateSort)}</th><th>平均红度</th>
              ${BRACKET_ORDER.map((b) => `<th class="bracket-th">${b}<i>胜率</i></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${topComps.map((c, i) => rankRow(c, i, colorOn)).join('')}
          </tbody>
        </table>
      </div>
      <p class="memo">说明：红度分档列按该红度段的有红度数据的场次计算胜率。</p>`;
  }

  /** 矩阵每列最小宽度（px）：容纳 3-4 字武将名 + 角标下移后完整可读，不出现横向滚动条 */
  const MATRIX_MIN_COL = 44;
  /** 矩阵最多展示阵容数（与分析端对齐） */
  const MATRIX_MAX_COMP = 15;

  /**
   * 按当前容器宽度计算矩阵可完整展示的阵容列数：
   * 窗口越窄展示的阵容越少（始终取场次最多的前 N），从而任何视口都无横向滚动条且内容完整。
   */
  function matrixColCount(container) {
    const wrap = (container || analyzeResultEl).querySelector('.table-wrap.matrix-wrap') || analyzeResultEl;
    const width = (wrap && wrap.clientWidth) || 800;
    const cols = Math.max(4, Math.floor((width - 40) / MATRIX_MIN_COL));
    return Math.min(MATRIX_MAX_COMP, cols);
  }

  /** 渲染「对战热力图」子页面 */
  function renderMatrix(data, colorOn) {
    const compStat = new Map(data.comps.map((c) => [c.comp, c]));
    const comps = data.matrix.comps.slice(0, matrixColCount());
    return `
      <h3 class="section-title">${icon('fire')} 对战热力图（前 ${comps.length} 阵容）
        <span class="heat-legend">
          <span class="heat-legend-label" style="left:0%">0%</span>
          <span class="heat-legend-label" style="left:50%">50%</span>
          <span class="heat-legend-label" style="left:100%">100%</span>
          <span class="heat-legend-bar"></span>
        </span>
        <button type="button" class="expand-btn" data-view="matrix" title="展开铺满窗口查看">${icon('expand')} 展开</button>
      </h3>
      <div class="table-wrap matrix-wrap">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="corner"><span>核心阵容↓</span><span>对手阵容→</span></th>
              ${comps.map((c) => matrixHeader(c, compStat)).join('')}
            </tr>
          </thead>
          <tbody>
            ${comps.map((row) => matrixRow(row, data.matrix, compStat, colorOn, comps)).join('')}
          </tbody>
        </table>
      </div>
      <p class="memo">说明：矩阵单元格显示「行阵容胜率%」，即行阵容对阵列阵容时的胜场占比。窗口较窄时按场次展示前 N 个阵容以保证可读。</p>`;
  }

  /** 阵容名渲染：按武将拆分为 chip 标签（与排行表一致）；genReds 存在时在武将名右侧显示平均红度角标 */
  function compChips(comp, genReds) {
    const names = comp.split('/');
    const reds = genReds || [];
    return names
      .map((g, i) => {
        const gr = reds[i];
        // 仅当该武将存在有效红度数据（known>0）时显示平均红度角标
        const redMark = gr && gr.known > 0 ? `<i class="gred" title="平均红度">${gr.avgRed}</i>` : '';
        // title 提供完整信息：窄屏矩阵列头裁切时悬停可查全名与平均红度
        const title = gr && gr.known > 0 ? `${g}（平均红度 ${gr.avgRed}）` : g;
        return `<span class="g-chip" title="${title}">${g}${redMark}</span>`;
      })
      .join('');
  }

  /**
   * 阵容标识徽标（快速升温 / 白板之光 / 泥头车 / 陷阱）。
   * 渲染为克制的柔色小标签（.badge + 语义色），悬停通过 data-tip 交给全局浮动说明气泡显示判定标准。
   * @returns {string} 在排行表「场次」后内联插入的徽标 HTML
   */
  function rankBadges(c) {
    const s = loadSettings();
    // 数值门槛取值：显式填 0（不限）时原样展示，仅空串/缺失时才回落默认值
    const num = (v, def) => (v === undefined || v === '') ? def : v;
    // 悬停说明：<b>名称</b> + 具体判定标准
    const tip = (name, desc) => `<b>${name}</b><span>${desc}</span>`;
    let h = '';
    if (c.hot && s.hotShow !== '0') {
      h += `<span class="badge hot-badge" data-tip="${tip('快速升温', `近 ${num(s.hotHours, 3)} 小时新出现、至少 ${num(s.hotMin, 5)} 场，且占该时段总场次 ≥ ${num(s.hotRate, 10)}%`)}">${icon('fire')}快速升温</span>`;
    }
    if (c.whiteBoard && s.wbShow !== '0') {
      h += `<span class="badge wb-badge" data-tip="${tip('白板之光', `「0-5红」低红分段内场次 ≥${num(s.wbMin, 5)} 且该段胜率 ≥${num(s.wbRate, 51)}%`)}">${icon('star')}白板之光</span>`;
    }
    if (c.truck && s.truckShow !== '0') {
      h += `<span class="badge truck-badge" data-tip="${tip('泥头车', `胜率 ≥${num(s.truckRate, 60)}% 的超高胜率阵容`)}">${icon('truck')}泥头车</span>`;
    }
    if (c.trap && s.trapShow !== '0') {
      h += `<span class="badge trap-badge" data-tip="${tip('陷阱', `场次 ≥${num(s.trapMin, 20)} 且总体胜率 &lt;50%，谨慎使用`)}">${icon('warn')}陷阱</span>`;
    }
    return h;
  }

  /** 排名表行 */
  function rankRow(c, i, colorOn) {
    const winRate = c.total ? Math.round((c.wins / c.total) * 100) : 0;
    // 红度分档胜率单元格：仅展示数值，不着色
    const bracketCells = BRACKET_ORDER.map((b) => {
      const bk = (c.brackets && c.brackets[b]) || { total: 0, wins: 0, winRate: 0 };
      if (!bk.total) return `<td class="bracket-col dim">—</td>`;
      return `<td class="bracket-col">${Math.round(bk.winRate)}%</td>`;
    }).join('');
    return `
      <tr>
        <td class="idx${i < 3 ? ' top-' + (i + 1) : ''}">${i + 1}</td>
        <td class="comp">
          <div class="comp-chips">${compChips(c.comp, c.genReds)}</div>
          <div class="comp-meta">${c.total}场${rankBadges(c)}</div>
        </td>
        <td>
          <div class="rate-cell">
            <span class="rate-pill" style="${colorOn ? colorByRate(c.total ? (c.wins / c.total) * 100 : 0) : ''}">${winRate}%</span>
          </div>
        </td>
        <td>${c.avgStars ? `<span class="avg-red">${c.avgStars}红</span>` : '<span class="dim">—</span>'}</td>
        ${bracketCells}
      </tr>`;
  }

  /** 矩阵列头：阵容 chip + 总场次/整体胜率 */
  function matrixHeader(comp, compStat) {
    const s = compStat.get(comp);
    const meta = s
      ? `<span class="mh-meta">${s.total}场 · ${Math.round((s.wins / s.total) * 100)}%</span>`
      : '';
    return `<th class="matrix-head"><span class="mh-comp">${compChips(comp, s && s.genReds)}</span>${meta}</th>`;
  }

  /** 对战矩阵行（热力图：整格背景随胜率连续渐变）；comps 为当前展示的列阵容子集 */
  function matrixRow(row, matrix, compStat, colorOn, comps) {
    const cells = matrix.cells[row] || {};
    const s = compStat.get(row);
    const meta = s ? `<span class="mh-meta">${s.total}场 · ${Math.round((s.wins / s.total) * 100)}%</span>` : '';
    return `
      <tr>
        <th class="row-name"><span class="mh-comp row">${compChips(row, s && s.genReds)}</span>${meta}</th>
        ${comps.map((col) => {
          const cell = cells[col];
          if (!cell || !cell.total) return '<td class="cell empty">—</td>';
          const rate = Math.round((cell.winRate ?? (cell.wins / cell.total) * 100));
          const style = colorOn ? heatColor(cell.winRate ?? (cell.wins / cell.total) * 100) : '';
          return `<td class="cell heat" style="${style}"><b>${rate}%</b><i>${cell.total}场</i></td>`;
        }).join('')}
      </tr>`;
  }

  // ==================== 全屏查看（排行 / 热力图） ====================

  /** 全屏热力图列数：按全屏容器宽度计算，最多仍受 MATRIX_MAX_COMP 限制（避免超宽） */
  function fsMatrixCols() {
    const width = (fsBody && fsBody.clientWidth) || 900;
    const cols = Math.max(6, Math.floor((width - 60) / MATRIX_MIN_COL));
    return Math.min(MATRIX_MAX_COMP, cols);
  }

  /** 全屏「阵容胜率排行」表格：显示全部阵容（不截断前 30），支持本地排序 */
  function fsRenderRanking(data, colorOn) {
    let comps = data.comps;
    if (fsState.rateSort) comps = [...comps].sort(byWinRate(fsState.rateSort));
    return `
      <div class="fs-stat">已收录 <b>${data.total}</b> 场 · 共 <b>${comps.length}</b> 个阵容</div>
      <div class="table-wrap rank-table-wrap fs-rank-wrap">
        <table class="rank-table fs-rank-table">
          <thead>
            <tr>
              <th>#</th><th>阵容</th><th>${sortHeaderBtn(fsState.rateSort)}</th><th>平均红度</th>
              ${BRACKET_ORDER.map((b) => `<th class="bracket-th">${b}<i>胜率</i></th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${comps.map((c, i) => rankRow(c, i, colorOn)).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /** 全屏「对战热力图」表格：按全屏宽度展示更多阵容列 */
  function fsRenderMatrix(data, colorOn) {
    const compStat = new Map(data.comps.map((c) => [c.comp, c]));
    const comps = data.matrix.comps.slice(0, fsMatrixCols());
    return `
      <div class="heat-legend fs-legend">
        <span class="heat-legend-label" style="left:0%">0%</span>
        <span class="heat-legend-label" style="left:50%">50%</span>
        <span class="heat-legend-label" style="left:100%">100%</span>
        <span class="heat-legend-bar"></span>
      </div>
      <div class="table-wrap matrix-wrap fs-matrix-wrap">
        <table class="matrix-table fs-matrix-table">
          <thead>
            <tr>
              <th class="corner"><span>核心阵容↓</span><span>对手阵容→</span></th>
              ${comps.map((c) => matrixHeader(c, compStat)).join('')}
            </tr>
          </thead>
          <tbody>
            ${comps.map((row) => matrixRow(row, data.matrix, compStat, colorOn, comps)).join('')}
          </tbody>
        </table>
      </div>`;
  }

  /** 依据全屏当前视图 + 缓存数据重绘表格（颜色开关/排序/切表时调用，不重新请求） */
  function paintFullscreen() {
    if (!fsState.data) return;
    const colorOn = fsColor.checked;
    fsBody.innerHTML =
      fsState.currentView === 'matrix' ? fsRenderMatrix(fsState.data, colorOn) : fsRenderRanking(fsState.data, colorOn);
  }

  /** 为请求参数追加「标识体系」判定阈值（与主分析页一致，读设置页配置） */
  function appendThresholdParams(params) {
    const s = loadSettings();
    params.set('hotMin', s.hotMin || DEFAULT_SETTINGS.hotMin);
    params.set('hotRate', s.hotRate || DEFAULT_SETTINGS.hotRate);
    params.set('hotHours', s.hotHours || DEFAULT_SETTINGS.hotHours);
    params.set('wbRate', s.wbRate || DEFAULT_SETTINGS.wbRate);
    params.set('wbMin', (s.wbMin === undefined || s.wbMin === '') ? DEFAULT_SETTINGS.wbMin : s.wbMin);
    params.set('truckRate', s.truckRate || DEFAULT_SETTINGS.truckRate);
    params.set('truckMin', (s.truckMin === undefined || s.truckMin === '') ? DEFAULT_SETTINGS.truckMin : s.truckMin);
    params.set('trapMin', (s.trapMin === undefined || s.trapMin === '') ? DEFAULT_SETTINGS.trapMin : s.trapMin);
  }

  /** 全屏视图按当前筛选条件请求并渲染表格 */
  function renderFullscreen() {
    if (!fsView || fsView.classList.contains('hidden')) return;
    const params = new URLSearchParams();
    if (fsState.alliance) params.set('alliance', fsState.alliance);
    if (Number(fsHours.dataset.value || 0) > 0) params.set('hours', fsHours.dataset.value);
    if (Number(fsHp.dataset.value || 0) > 0) params.set('minHp', fsHp.dataset.value);
    if (Number(fsCount.dataset.value || 0) > 0) params.set('minCount', fsCount.dataset.value);
    appendThresholdParams(params);
    fsBody.innerHTML = '<div class="status loading">加载统计中…</div>';
    fetch('/api/analyze?' + params.toString())
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) throw new Error((data && data.error) || '加载失败');
        fsState.data = data;
        paintFullscreen();
      })
      .catch((e) => {
        fsBody.innerHTML = `<div class="status error">${icon('error')} ${e.message}</div>`;
      });
  }

  /** 全屏同盟筛选 chips 的 HTML：首项「全部」 */
  function fsAllianceChipsHTML(alliances, active) {
    return ['', ...alliances]
      .map((a) => `<button type="button" class="chip ${a === active ? 'active' : ''}" data-alliance="${a}">${a || '全部'}</button>`)
      .join('');
  }
  /** 拉取同盟列表填充全屏筛选 chips，并绑定点击切换筛选后刷新 */
  function fsRefreshAllianceChips(list) {
    const fill = (alliances) => {
      fsAllianceEl.innerHTML = fsAllianceChipsHTML(alliances, fsState.alliance);
      Array.from(fsAllianceEl.querySelectorAll('.chip')).forEach((chip) => {
        chip.addEventListener('click', () => {
          fsState.alliance = chip.dataset.alliance || '';
          fsAllianceEl.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === chip));
          renderFullscreen();
        });
      });
    };
    if (list) return fill(list);
    fetch('/api/records')
      .then((res) => res.json())
      .then((data) => fill([...new Set((data.items || []).map((r) => r.alliance).filter(Boolean))].sort()))
      .catch(() => fill([]));
  }

  /** 全屏视图标题与子页签高亮同步 */
  function setFsTab() {
    document.getElementById('fs-title-txt').textContent = fsState.currentView === 'matrix' ? '对战热力图' : '阵容胜率排行';
    Array.from(document.querySelectorAll('.fs-tab')).forEach((t) =>
      t.classList.toggle('active', t.dataset.view === fsState.currentView)
    );
  }

  /** 打开全屏查看（默认展示主页面当前子视图，筛选从「全部/不限」独立开始） */
  function openFullscreen(view) {
    if (!fsView) return;
    fsState.currentView = (view === 'matrix' || view === 'rank') ? view : (currentView || 'rank');
    fsState.rateSort = null;
    fsState.alliance = '';
    fsState.data = null;
    setFsTab();
    fsView.classList.remove('hidden');
    document.body.classList.add('fs-lock');
    fsRefreshAllianceChips();
    renderFullscreen();
  }
  /** 关闭全屏查看 */
  function closeFullscreen() {
    if (!fsView) return;
    fsView.classList.add('hidden');
    document.body.classList.remove('fs-lock');
  }

  /** 全屏胜率排序：点击表头在 不排 → 降序 → 升序 间循环，基于缓存数据本地重排 */
  function fsCycleRateSort() {
    fsState.rateSort = nextSort(fsState.rateSort);
    paintFullscreen();
  }

  // 主分析结果区点击「展开」按钮 → 打开对应子视图全屏
  analyzeResultEl.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.expand-btn');
    if (btn) openFullscreen(btn.dataset.view);
  });

  // 全屏内交互：子页签切换、胜率排序、颜色开关、关闭
  fsView.addEventListener('click', (e) => {
    const tab = e.target.closest && e.target.closest('.fs-tab');
    if (tab) { fsState.currentView = tab.dataset.view; setFsTab(); paintFullscreen(); return; }
    const sortBtn = e.target.closest && e.target.closest('[data-sort="rate"]');
    if (sortBtn) { fsCycleRateSort(); return; }
    if (e.target.closest('#fs-close')) closeFullscreen();
  });
  fsColor.addEventListener('change', () => paintFullscreen());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fsView && !fsView.classList.contains('hidden')) closeFullscreen();
  });

  /**
   * 胜率颜色映射（<50% 红系、>50% 绿系、恰好 50% 中性）。
   * 主流显示方式：以 50% 为硬分界，两侧各自从浅色渐变到深色——
   * 0% 深红 → 50% 浅红（左段），50% 浅绿 → 100% 深绿（右段），越极端越深。
   * @returns {number[]} [r,g,b]；50% 返回 null 表示中性
   */
  function winRateColor(r) {
    r = Math.max(0, Math.min(100, r || 0));
    // 端点色：深红/浅红（左段），浅绿/深绿（右段）—— 提高饱和度，避免暗背景下色块发灰
    const RED_DEEP = [226, 47, 59];
    const RED_LIGHT = [255, 150, 156];
    const GREEN_LIGHT = [150, 228, 183];
    const GREEN_DEEP = [34, 160, 108];
    if (r < 50) {
      const t = r / 50; // 0->50：深红逐渐变浅至浅红
      return RED_DEEP.map((v, i) => Math.round(v + (RED_LIGHT[i] - v) * t));
    }
    if (r > 50) {
      // 55% 以上已是 T0 顶级队伍：直接封顶为最强深绿，一眼可辨；50~55% 快速完成浅绿→深绿过渡
      if (r >= 55) return GREEN_DEEP;
      const t = (r - 50) / 5;
      return GREEN_LIGHT.map((v, i) => Math.round(v + (GREEN_DEEP[i] - v) * t));
    }
    return null;
  }

  /** 依据背景色亮度决定文字颜色：深底用白字，浅底用暗字 */
  function textColorFor(c) {
    const luminance = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return luminance > 160 ? '#16202e' : '#ffffff';
  }

  /**
   * 热力图配色：整格背景随胜率渐变，>50% 绿、<50% 红（见 winRateColor）。
   * 返回半透明纯色 + CSS 变量，由 .cell.heat 应用毛玻璃质感。
   */
  function heatColor(winRate) {
    const c = winRateColor(winRate);
    // 恰好 50%：中性灰底，弱化以标识分界
    if (!c) return `--ht:130,140,152;--hta:0.28;color:#8b98ad;`;
    const fg = textColorFor(c);
    // 深色端用更高不透明度（更实），浅色端稍透明仍保留通透感
    const alpha = fg === '#ffffff' ? 0.88 : 0.72;
    return `--ht:${c[0]},${c[1]},${c[2]};--hta:${alpha};color:${fg};`;
  }

  /**
   * 胜率连续渐变着色：>50% 绿、<50% 红（与热力图同一套 winRateColor）。
   * 扁平半透明色块 + 细描边，不叠辉光，深浅主题下均清晰可辨。
   */
  function colorByRate(rate) {
    const c = winRateColor(rate);
    if (!c) return `background:rgba(130,140,152,0.15);color:var(--text-dim);`;
    const fg = textColorFor(c);
    const ch = `${c[0]},${c[1]},${c[2]}`;
    return `background:rgba(${ch},0.52);border-color:rgba(${ch},0.65);color:${fg};`;
  }

  // ---- 分析页交互 ----
  /** 切换分析子视图（阵容胜率排行 / 对战热力图） */
  document.querySelectorAll('.sub-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      // 已有缓存数据则本地重绘，无则重新拉取
      if (analyzeResultEl.dataset.last) {
        renderAnalysis(JSON.parse(analyzeResultEl.dataset.last));
      } else {
        loadAnalysis();
      }
    });
  });
  document.getElementById('btn-refresh').addEventListener('click', loadAnalysis);

  // ---------- 设置页：自动保存 / 恢复默认 ----------

  /** 收集并校验设置表单全部值（数字类 clamp 到合法区间，非法回退默认） */
  function collectSettings() {
    const clamp = (v, min, max, dflt) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
    };
    return {
      count: String(clamp(settingsEls.count.value, 0, 500, 0)),
      hp: String(clamp(settingsEls.hp.value, 0, 33000, 0)),
      hotHours: String(clamp(settingsEls.hotHours.value, 1, 24, 3)),
      hotMin: String(clamp(settingsEls.hotMin.value, 1, 50, 5)),
      hotRate: String(clamp(settingsEls.hotRate.value, 1, 100, 10)),
      wbRate: String(clamp(settingsEls.wbRate.value, 0, 100, 51)),
      wbMin: String(clamp(settingsEls.wbMin.value, 0, 100, 5)),
      truckRate: String(clamp(settingsEls.truckRate.value, 0, 100, 60)),
      truckMin: String(clamp(settingsEls.truckMin.value, 0, 100, 5)),
      hotShow: settingsEls.hotShow.checked ? '1' : '0',
      wbShow: settingsEls.wbShow.checked ? '1' : '0',
      truckShow: settingsEls.truckShow.checked ? '1' : '0',
      trapMin: String(clamp(settingsEls.trapMin.value, 0, 100, 20)),
      trapShow: settingsEls.trapShow.checked ? '1' : '0',
    };
  }
  /** 自动保存：读取/校验全部设置 → 持久化 → 回填修正后的值 → 提示，应用口径并刷新分析页 */
  function autoSaveSettings() {
    const s = collectSettings();
    saveSettings(s);
    fillSettingsForm(s); // 回填 clamp 后的合法值（超界输入会被就地修正）
    showSettingsToast('已保存 ✓');
    caliberApplied = false; // 确保下次进入分析页按最新「有效战报默认口径」套用
    if (!tabAnalyze.classList.contains('hidden')) {
      applyDefaultCaliber();
      loadAnalysis();
    }
  }
  // 每个设置控件变更时自动保存（数字输入在失焦/回车触发，开关在切换时触发）
  Object.values(settingsEls).forEach((el) => el.addEventListener('change', autoSaveSettings));
  document.getElementById('btn-reset-settings').addEventListener('click', () => {
    fillSettingsForm(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS });
    showSettingsToast('已恢复默认值 ✓');
    caliberApplied = false;
    if (!tabAnalyze.classList.contains('hidden')) {
      applyDefaultCaliber();
      loadAnalysis();
    }
  });
  // 胜率表头排序：点击在 不排 → 降序 → 升序 → 不排 间循环，基于已加载数据本地重排，不发请求
  analyzeResultEl.addEventListener('click', (e) => {
    const sortBtn = e.target.closest && e.target.closest('[data-sort="rate"]');
    if (!sortBtn) return;
    rateSort = nextSort(rateSort);
    if (analyzeResultEl.dataset.last) renderAnalysis(JSON.parse(analyzeResultEl.dataset.last));
  });
  initSelect(hoursSel, () => loadAnalysis());
  initSelect(hpSel, () => loadAnalysis());
  initSelect(countSel, () => loadAnalysis());
  // 全屏视图内筛选下拉：变更后直接按新条件重新请求并渲染
  initSelect(fsHours, () => renderFullscreen());
  initSelect(fsHp, () => renderFullscreen());
  initSelect(fsCount, () => renderFullscreen());
  colorToggle.addEventListener('change', () => {
    // 颜色开关变化时仅重绘当前已加载的数据，避免重复请求
    if (analyzeResultEl.dataset.last) {
      renderAnalysis(JSON.parse(analyzeResultEl.dataset.last));
    }
  });
  document.getElementById('btn-clear').addEventListener('click', async () => {
    const ok = await openConfirm({
      title: '清空全部记录',
      message: '确定清空全部已识别的战斗记录？\n此操作不可恢复。',
      okText: '清空',
      okClass: 'btn-danger',
      icon: 'trash',
    });
    if (!ok) return;
    try {
      await fetch('/api/records/clear', { method: 'POST' });
      refreshAllianceChips([]);
      currentAlliance = '';
      loadAnalysis();
    } catch (e) {
      openAlert('清空失败：' + e.message);
    }
  });

  /** 同盟 chips 高亮共用逻辑：仅将 data-alliance 匹配 activeValue 的 chip 置为 active（洞察页与分析页共用） */
  function setActiveChip(container, activeValue) {
    container.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x.dataset.alliance === activeValue));
  }

  /** 渲染同盟筛选标签（chips）；具体同盟带删除按钮，可删除该同盟全部战报 */
  function renderAllianceChips(allianceList) {
    const all = ['', ...allianceList];
    allianceChips.innerHTML = all
      .map((a) => {
        const label = a || '全部';
        const activeCls = a === currentAlliance ? 'active' : '';
        // 仅具体同盟提供删除按钮（「全部」不含）
        const del = a
          ? `<span class="chip-x" data-alliance="${a}" title="删除该同盟全部战报">${ICONS.trash}</span>`
          : '';
        return `<button type="button" class="chip ${activeCls}" data-alliance="${a}">${label}${del}</button>`;
      })
      .join('');
  }

  /** 容器级委托：删除按钮 → 删除同盟；否则 → 切换筛选（重渲染后仍有效，避免重复绑定） */
  allianceChips.addEventListener('click', (e) => {
    const del = e.target.closest && e.target.closest('.chip-x');
    if (del) {
      if (del.dataset.alliance) confirmDeleteAlliance(del.dataset.alliance);
      return;
    }
    const chip = e.target.closest && e.target.closest('.chip');
    if (!chip) return;
    currentAlliance = chip.dataset.alliance || '';
    setActiveChip(allianceChips, currentAlliance);
    loadAnalysis();
  });

  /** 删除指定同盟全部战报：先统计条数 → 二次确认（含条数）→ 调用后端接口 → 刷新筛选与分析 */
  async function confirmDeleteAlliance(alliance) {
    // 先统计该同盟当前条数，让用户明确将要删除的数据量
    let n = 0;
    try {
      const items = (await (await fetch('/api/records')).json()).items || [];
      n = items.filter((r) => r.alliance === alliance).length;
    } catch { /* 统计失败时 n 保持 0，确认文案退化为不显示条数 */ }

    const countLine = n > 0 ? `「${alliance}」共 ${n} 条战报。` : `确定删除同盟「${alliance}」的全部战报？`;
    const ok = await openConfirm({
      title: '删除同盟战报',
      message: `${countLine}\n删除后不可恢复，是否继续？`,
      okText: n > 0 ? `删除 ${n} 条` : '删除',
      okClass: 'btn-danger',
      icon: 'trash',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/records/clear-alliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alliance }),
      });
      const data = await res.json();
      if (!data.ok) return openAlert('删除失败：' + (data.error || '未知错误'));
      if (currentAlliance === alliance) currentAlliance = '';
      openAlert(`已删除「${alliance}」的 ${data.removed} 条战报`);
      // 刷新后需清理分析缓存并重建筛选列表，保证所见即所得
      delete analyzeResultEl.dataset.last;
      refreshAllianceChips();
      loadAnalysis();
    } catch (err) {
      openAlert('删除失败：' + err.message);
    }
  }

  /** 从记录中提取去重同盟名，刷新 chips；可选覆盖列表 */
  function refreshAllianceChips(override) {
    if (override) return renderAllianceChips(override);
    fetch('/api/records')
      .then((res) => res.json())
      .then((data) => {
        const alliances = [...new Set((data.items || []).map((r) => r.alliance).filter(Boolean))].sort();
        renderAllianceChips(alliances);
      })
      .catch(() => renderAllianceChips([]));
  }

  refreshAllianceChips();
  // 全局徽标说明气泡 + 设置页标识预览（需在 DEFAULT_SETTINGS / loadSettings 定义之后调用）
  bindBadgeTips();
  renderBadgePreviews();
  // 刷新后恢复上次停留的标签页（默认战报识别页），保持用户停留的原页面
  try {
    activateTab(localStorage.getItem('zabao.tab') || 'parse');
  } catch (e) { /* ignore */ }

  // 打开网页时自动检查武将名单更新（GitHub 源）。无更新/未配置不打扰；静默失败，不阻塞页面。
  fetch('/api/generals/update')
    .then((res) => res.json())
    .then((r) => {
      if (r && r.updated && r.version) {
        openAlert(`武将名单已更新至 ${r.version}`);
      }
      // 更新设置页展示的当前名单赛季
      refreshGeneralsInfo();
    })
    .catch(() => {
      // 网络/服务异常时静默；仍刷新一次赛季展示（沿用现有生效名单）
      refreshGeneralsInfo();
    });

  /**
   * 刷新设置页「武将名单」卡片：展示当前生效名单的赛季号。
   * 无赛季（内置名单兜底/旧未标赛季版本）时显示「内置默认」，不在设置页报错。
   */
  function refreshGeneralsInfo() {
    fetch('/api/generals')
      .then((res) => res.json())
      .then((g) => {
        const vEl = document.getElementById('generals-version');
        if (vEl) vEl.textContent = g && Number.isInteger(g.season) && g.season >= 1 ? `S${g.season}` : '内置默认';
      })
      .catch(() => {
        const vEl = document.getElementById('generals-version');
        if (vEl) vEl.textContent = '无法获取';
      });
  }
})();