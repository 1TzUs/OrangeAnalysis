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

  /** 显示状态条 */
  function setStatus(cls, msg) {
    statusEl.className = 'status ' + (cls || '');
    statusEl.textContent = msg || '';
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
      setStatus('', `✅ 共识别 ${items.length} 张战报`);
    } catch (e) {
      setStatus('error', '❌ ' + e.message);
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

    // 顶部：同盟 + 时间 + 结果
    const top = document.createElement('div');
    top.className = 'battle-top';
    const resultText = b.resultText || (b.result === 'win' ? '胜' : b.result === 'lose' ? '败' : '?');
    top.innerHTML = `
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
        ${b.time ? `<div class="battle-time" title="战报时间">⏱ ${b.time}</div>` : ''}
        <div class="result-badge ${b.result}">${resultText}</div>
      </div>`;

    // 主体：武将 + 兵力
    const body = document.createElement('div');
    body.className = 'battle-body';
    body.innerHTML = `
      <div class="side left">
        ${renderGenerals(b.leftGenerals)}
        ${formatHp(b.leftHp)}
      </div>
      <div class="vs">
        <span>第 ${i + 1} 战</span>
        <span class="cost">${b.hpCost ? '体力-' + b.hpCost : ''}</span>
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

  // ==================== 设置 ====================
  const tabSettings = document.getElementById('tab-settings');
  const SETTINGS_KEY = 'zabao.settings';
  // 默认设置：有效战报口径(0=不限) + 快速升温门槛(近3h/至少5场/占比10%)
  const DEFAULT_SETTINGS = { count: '0', hp: '0', hotHours: '3', hotMin: '5', hotRate: '10' };
  const settingsEls = {
    count: document.getElementById('set-count'),
    hp: document.getElementById('set-hp'),
    hotHours: document.getElementById('set-hot-hours'),
    hotMin: document.getElementById('set-hot-min'),
    hotRate: document.getElementById('set-hot-rate'),
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
  /** 将设置对象回填到设置表单控件 */
  function fillSettingsForm(s) {
    for (const k in settingsEls) settingsEls[k].value = s[k];
  }
  /** 显示保存成功提示 */
  function showSettingsToast(msg) {
    settingsToast.textContent = msg;
    settingsToast.classList.add('show');
    clearTimeout(showSettingsToast._t);
    showSettingsToast._t = setTimeout(() => settingsToast.classList.remove('show'), 2200);
  }

  /** 切换到指定标签页并执行对应页面的加载动作；写入 zabao.tab 供刷新后恢复 */
  function activateTab(tab) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    tabParse.classList.toggle('hidden', tab !== 'parse');
    tabAnalyze.classList.toggle('hidden', tab !== 'analyze');
    tabSettings.classList.toggle('hidden', tab !== 'settings');
    if (tab === 'analyze') {
      loadAnalysis();
    }
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

  /** 加载分析数据 */
  async function loadAnalysis() {
    // 每次加载/刷新分析时同步刷新同盟筛选列表，确保新识别的同盟实时出现在下拉中
    refreshAllianceChips();
    const params = new URLSearchParams();
    if (currentAlliance) params.set('alliance', currentAlliance);
    if (Number(hoursSel.value) > 0) params.set('hours', hoursSel.value);
    if (Number(hpSel.value) > 0) params.set('minHp', hpSel.value);
    if (Number(countSel.value) > 0) params.set('minCount', countSel.value);
    // 快速升温阈值由设置页驱动，随每次分析请求下发
    const s = loadSettings();
    params.set('hotMin', s.hotMin || DEFAULT_SETTINGS.hotMin);
    params.set('hotRate', s.hotRate || DEFAULT_SETTINGS.hotRate);
    params.set('hotHours', s.hotHours || DEFAULT_SETTINGS.hotHours);
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
      analyzeResultEl.innerHTML = `<div class="status error">❌ ${e.message}</div>`;
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

  /** 无数据时提示 */
  /** 胜率表头排序按钮：↕ 悬停提示，激活时按方向显示 ▲/▼ */
  function rateHeaderBtn() {
    const icon = rateSort === null ? '↕' : rateSort === 'desc' ? '▲' : '▼';
    const active = rateSort ? ' active' : '';
    return `<button type="button" class="sort-btn${active}" data-sort="rate" aria-label="按胜率排序">胜率 <span>${icon}</span></button>`;
  }

  /** 渲染「阵容胜率排行」子页面 */
  function renderRanking(data, colorOn) {
    // 前 30 榜单：默认展示场次最多（且胜率次优）的前 30 个阵容；点胜率表头可按胜率升降序
    const TOP_N = 30;
    let comps = data.comps;
    if (rateSort) {
      comps = [...comps].sort((a, b) =>
        rateSort === 'asc' ? a.winRate - b.winRate : b.winRate - a.winRate
      );
    }
    const topComps = comps.slice(0, TOP_N);
    return `
      <h3 class="section-title">🏆 阵容胜率排行
        <span class="top-badge">前 ${topComps.length}</span>
      </h3>
      <div class="table-wrap rank-table-wrap">
        <table class="rank-table">
          <thead>
            <tr>
              <th>#</th><th>阵容</th><th>${rateHeaderBtn()}</th><th>平均红度</th>
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
  function matrixColCount() {
    const wrap = document.querySelector('.table-wrap.matrix-wrap') || analyzeResultEl;
    const width = (wrap && wrap.clientWidth) || 800;
    const cols = Math.max(4, Math.floor((width - 40) / MATRIX_MIN_COL));
    return Math.min(MATRIX_MAX_COMP, cols);
  }

  /** 渲染「对战热力图」子页面 */
  function renderMatrix(data, colorOn) {
    const compStat = new Map(data.comps.map((c) => [c.comp, c]));
    const comps = data.matrix.comps.slice(0, matrixColCount());
    return `
      <h3 class="section-title">🔥 对战热力图（前 ${comps.length} 阵容）
        <span class="heat-legend">
          <span class="heat-legend-label" style="left:0%">0%</span>
          <span class="heat-legend-label" style="left:50%">50%</span>
          <span class="heat-legend-label" style="left:100%">100%</span>
          <span class="heat-legend-bar"></span>
        </span>
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
          <div class="comp-meta">${c.total}场${c.hot ? '<span class="hot-badge"><span class="flame">🔥</span>快速升温<span class="hot-tip">近 3 小时新出现、至少 5 场，占比 ≥ 10%</span></span>' : ''}</div>
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
   * 返回带背景染色 + 同色辉光的底框样式，让色块在暗背景下更醒目直观。
   */
  function colorByRate(rate) {
    const c = winRateColor(rate);
    if (!c) return `background:rgba(130,140,152,0.15);color:var(--text-dim);`;
    const fg = textColorFor(c);
    const ch = `${c[0]},${c[1]},${c[2]}`;
    return `background:rgba(${ch},0.52);border-color:rgba(${ch},0.65);box-shadow:0 0 12px rgba(${ch},0.35);color:${fg};`;
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

  // ---------- 设置页：保存 / 恢复默认 ----------
  document.getElementById('btn-save-settings').addEventListener('click', () => {
    // 读取并校验各控件值（数字类 clamp 到合法区间），非法时回退默认
    const clamp = (v, min, max, dflt) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
    };
    const s = {
      count: String(clamp(settingsEls.count.value, 0, 500, 0)),
      hp: String(clamp(settingsEls.hp.value, 0, 33000, 0)),
      hotHours: String(clamp(settingsEls.hotHours.value, 1, 24, 3)),
      hotMin: String(clamp(settingsEls.hotMin.value, 1, 50, 5)),
      hotRate: String(clamp(settingsEls.hotRate.value, 1, 100, 10)),
    };
    saveSettings(s);
    showSettingsToast('已保存 ✓');
    // 若当前正停在分析页，刷新一次使快速升温阈值立即生效
    if (!tabAnalyze.classList.contains('hidden')) loadAnalysis();
  });
  document.getElementById('btn-reset-settings').addEventListener('click', () => {
    fillSettingsForm(DEFAULT_SETTINGS);
    showSettingsToast('已恢复默认值，点击「保存设置」生效');
  });
  // 胜率表头排序：点击在 不排 → 降序 → 升序 → 不排 间循环，基于已加载数据本地重排，不发请求
  analyzeResultEl.addEventListener('click', (e) => {
    const sortBtn = e.target.closest && e.target.closest('[data-sort="rate"]');
    if (!sortBtn) return;
    rateSort = rateSort === null ? 'desc' : rateSort === 'desc' ? 'asc' : null;
    if (analyzeResultEl.dataset.last) renderAnalysis(JSON.parse(analyzeResultEl.dataset.last));
  });
  hoursSel.addEventListener('change', loadAnalysis);
  hpSel.addEventListener('change', loadAnalysis);
  countSel.addEventListener('change', loadAnalysis);
  colorToggle.addEventListener('change', () => {
    // 颜色开关变化时仅重绘当前已加载的数据，避免重复请求
    if (analyzeResultEl.dataset.last) {
      renderAnalysis(JSON.parse(analyzeResultEl.dataset.last));
    }
  });
  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('确定清空全部已识别的战斗记录？此操作不可恢复。')) return;
    try {
      await fetch('/api/records/clear', { method: 'POST' });
      refreshAllianceChips([]);
      currentAlliance = '';
      loadAnalysis();
    } catch (e) {
      alert('清空失败：' + e.message);
    }
  });

  /** 渲染同盟筛选标签（chips），点击切换选中同盟 */
  function renderAllianceChips(allianceList) {
    const all = ['', ...allianceList];
    allianceChips.innerHTML = all
      .map((a) => {
        const label = a || '全部';
        const activeCls = a === currentAlliance ? 'active' : '';
        return `<button type="button" class="chip ${activeCls}" data-alliance="${a}">${label}</button>`;
      })
      .join('');
    // 委托点击：任一 chip 点击即切换筛选并刷新
    Array.from(allianceChips.querySelectorAll('.chip')).forEach((chip) => {
      chip.addEventListener('click', () => {
        currentAlliance = chip.dataset.alliance || '';
        renderAllianceChips(allianceList);
        loadAnalysis();
      });
    });
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
  // 刷新后恢复上次停留的标签页（默认战报识别页），保持用户停留的原页面
  try {
    activateTab(localStorage.getItem('zabao.tab') || 'parse');
  } catch (e) { /* ignore */ }
})();