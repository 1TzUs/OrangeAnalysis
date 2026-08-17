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

    // 顶部：同盟 + 结果
    const top = document.createElement('div');
    top.className = 'battle-top';
    const resultText = b.resultText || (b.result === 'win' ? '胜' : b.result === 'lose' ? '败' : '?');
    top.innerHTML = `
      <div class="alliance-row">
        <span class="alliance-badge">${b.leftAlliance || '未知'}</span>
        <span style="color:var(--text-dim)">VS</span>
        <span class="alliance-badge">${b.rightAlliance || '未知'}</span>
      </div>
      <div class="result-badge ${b.result}">${resultText}</div>`;

    // 主体：武将 + 兵力
    const body = document.createElement('div');
    body.className = 'battle-body';
    body.innerHTML = `
      <div class="side left">
        ${renderGenerals(b.leftGenerals)}
        <div class="hp">${b.leftHp ? '兵力 ' + b.leftHp : ''}</div>
      </div>
      <div class="vs">
        <span>第 ${i + 1} 战</span>
        <span class="cost">${b.hpCost ? '体力-' + b.hpCost : ''}</span>
      </div>
      <div class="side right">
        ${renderGenerals(b.rightGenerals)}
        <div class="hp">${b.rightHp ? '兵力 ' + b.rightHp : ''}</div>
      </div>`;

    div.appendChild(top);
    div.appendChild(body);
    return div;
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
  const colorToggle = document.getElementById('toggle-color');
  /** 当前选中的同盟（空串表示全部） */
  let currentAlliance = '';
  /** 分析页当前子视图：'rank'（阵容胜率排行）或 'matrix'（对战热力图） */
  let currentView = 'rank';

  /** 切换标签页 */
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      tabParse.classList.toggle('hidden', tab !== 'parse');
      tabAnalyze.classList.toggle('hidden', tab !== 'analyze');
      if (tab === 'analyze') loadAnalysis();
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

  /** 渲染「阵容胜率排行」子页面 */
  function renderRanking(data, colorOn) {
    // 前 30 榜单：仅展示场次最多（且胜率次优）的前 30 个阵容
    const TOP_N = 30;
    const topComps = data.comps.slice(0, TOP_N);
    return `
      <h3 class="section-title">🏆 阵容胜率排行
        <span class="top-badge">前 ${topComps.length}</span>
      </h3>
      <div class="table-wrap">
        <table class="rank-table">
          <thead>
            <tr>
              <th>#</th><th>阵容</th><th>场次</th><th>胜</th><th>负</th>
              <th>胜率</th><th>平均红度</th>
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

  /** 渲染「对战热力图」子页面 */
  function renderMatrix(data, colorOn) {
    const compStat = new Map(data.comps.map((c) => [c.comp, c]));
    return `
      <h3 class="section-title">🔥 对战热力图（前 ${data.matrix.comps.length} 阵容）
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
              ${data.matrix.comps.map((c) => matrixHeader(c, compStat)).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.matrix.comps.map((row) => matrixRow(row, data.matrix, compStat, colorOn)).join('')}
          </tbody>
        </table>
      </div>
      <p class="memo">说明：矩阵单元格显示「行阵容胜率%」，即行阵容对阵列阵容时的胜场占比。</p>`;
  }

  /** 阵容名渲染：按武将拆分为 chip 标签（与排行表一致） */
  function compChips(comp) {
    return comp.split('/').map((g) => `<span class="g-chip">${g}</span>`).join('');
  }

  /** 排名表行 */
  function rankRow(c, i, colorOn) {
    const winRate = c.total ? Math.round((c.wins / c.total) * 100) : 0;
    const bar = c.total ? (c.wins / c.total) * 100 : 0;
    // 红度分档胜率单元格
    const bracketCells = BRACKET_ORDER.map((b) => {
      const bk = (c.brackets && c.brackets[b]) || { total: 0, wins: 0, winRate: 0 };
      const rate = bk.total ? Math.round(bk.winRate) : '—';
      const cls = colorOn && bk.total ? rateCellClass(bk.winRate) : '';
      return `<td class="bracket-col ${cls}">${rate === '—' ? '<span class="dim">—</span>' : rate + '%'}</td>`;
    }).join('');
    return `
      <tr>
        <td class="idx">${i + 1}</td>
        <td class="comp">${compChips(c.comp)}</td>
        <td>${c.total}</td>
        <td class="win">${c.wins}</td>
        <td class="lose">${c.total - c.wins}</td>
        <td>
          <div class="rate-cell">
            <div class="rate-bar"><div class="rate-fill" style="width:${bar}%"></div></div>
            <span>${winRate}%</span>
          </div>
        </td>
        <td>${c.avgStars ? c.avgStars + '红' : '—'}</td>
        ${bracketCells}
      </tr>`;
  }

  /** 矩阵列头：阵容 chip + 总场次/整体胜率 */
  function matrixHeader(comp, compStat) {
    const s = compStat.get(comp);
    const meta = s
      ? `<span class="mh-meta">${s.total}场 · ${Math.round((s.wins / s.total) * 100)}%</span>`
      : '';
    return `<th class="matrix-head"><span class="mh-comp">${compChips(comp)}</span>${meta}</th>`;
  }

  /** 对战矩阵行（热力图：整格背景随胜率连续渐变） */
  function matrixRow(row, matrix, compStat, colorOn) {
    const cells = matrix.cells[row] || {};
    const s = compStat.get(row);
    const meta = s ? `<span class="mh-meta">${s.total}场 · ${Math.round((s.wins / s.total) * 100)}%</span>` : '';
    return `
      <tr>
        <th class="row-name"><span class="mh-comp row">${compChips(row)}</span>${meta}</th>
        ${matrix.comps.map((col) => {
          const cell = cells[col];
          if (!cell || !cell.total) return '<td class="cell empty">—</td>';
          const rate = Math.round((cell.winRate ?? (cell.wins / cell.total) * 100));
          const style = colorOn ? heatColor(cell.winRate ?? (cell.wins / cell.total) * 100) : '';
          return `<td class="cell heat" style="${style}"><b>${rate}%</b><i>${cell.total}场</i></td>`;
        }).join('')}
      </tr>`;
  }

  /**
   * 热力图配色：以 50% 为中心连续渐变。
   * 0% 深红 → 50% 白/浅灰 → 100% 深绿；离 50% 越远颜色越深。
   * 返回半透明纯色 + CSS 变量，由 .cell.heat 应用毛玻璃质感。
   */
  function heatColor(winRate) {
    const r = Math.max(0, Math.min(100, winRate || 0));
    // 端点色：0% 深红，50% 白，100% 深绿
    const DEEP_RED = [190, 30, 30];
    const WHITE = [245, 245, 245];
    const DEEP_GREEN = [30, 130, 50];
    let c;
    if (r < 50) {
      const t = r / 50; // 0->50 深红逐渐变浅至白
      c = DEEP_RED.map((v, i) => Math.round(v + (WHITE[i] - v) * t));
    } else {
      const t = (r - 50) / 50; // 50->100 白逐渐变深至深绿
      c = WHITE.map((v, i) => Math.round(v + (DEEP_GREEN[i] - v) * t));
    }
    // 自适应文字颜色：根据背景亮度，深底用白字，浅底用黑字
    const luminance = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    const fg = luminance > 200 ? '#1a2030' : '#ffffff';
    // 半透明主色（毛玻璃由 CSS backdrop-filter 完成），透明度随颜色深浅调整
    const alpha = luminance > 200 ? 0.55 : 0.72;
    return `--ht:${c[0]},${c[1]},${c[2]};--hta:${alpha};color:${fg};`;
  }

  /** 胜率三色编码：≥60 绿 / ≤40 红 / 其余中立 */
  function rateCellClass(winRate) {
    return winRate >= 60 ? 'good' : winRate <= 40 ? 'bad' : 'neutral';
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
  hoursSel.addEventListener('change', loadAnalysis);
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
})();