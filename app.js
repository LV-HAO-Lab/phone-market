/* 行情模块 · 小程序风格交互 */
(() => {
  const D = window.MARKET_DATA;
  const $ = s => document.querySelector(s);
  if (!D) {
    $('#rows').innerHTML = '<div class="empty">数据未加载：先运行 <code>node parse.mjs</code></div>';
    return;
  }

  /* ---------------- 数据 ---------------- */
  const ITEMS = [];
  D.series.forEach(s => s.items.forEach(it => ITEMS.push({
    ...it,
    category: s.category, brand: s.brand, series: s.series,
    seriesKey: s.key, typeKey: s.type, typeLabel: s.typeLabel,
  })));

  const CATS = ['全部', ...D.categories];
  const BRANDS = ['全部', ...D.brands];

  // 品牌色：批发圈里认牌子靠颜色，做成一眼能分
  const BRAND = {
    '小米': [[255, 106, 0], [255, 154, 60]],
    '红米': [[255, 77, 79], [255, 120, 117]],
    '苹果': [[58, 63, 74], [107, 114, 128]],
    '华为': [[211, 47, 47], [239, 83, 80]],
    '荣耀': [[10, 132, 255], [90, 174, 255]],
    'iQOO': [[27, 108, 255], [77, 141, 255]],
    'vivo': [[75, 94, 252], [123, 140, 255]],
    'OPPO': [[18, 183, 106], [50, 213, 131]],
    '一加': [[235, 0, 32], [255, 77, 77]],
    '真我': [[255, 184, 0], [255, 213, 79]],
    '联想': [[226, 35, 26], [255, 90, 79]],
    '华硕': [[0, 83, 155], [45, 127, 214]],
    '机械革命': [[31, 41, 55], [75, 85, 99]],
    '来酷': [[14, 165, 233], [56, 189, 248]],
    '罗技': [[11, 123, 208], [59, 158, 232]],
    '索尼': [[17, 24, 39], [63, 70, 82]],
    '大疆': [[31, 41, 55], [75, 85, 99]],
    '影石': [[249, 115, 22], [251, 146, 60]],
    '任天堂': [[228, 0, 15], [255, 77, 94]],
    '戴森': [[124, 58, 237], [167, 139, 250]],
  };
  const thumbStyle = b => {
    const c = BRAND[b] || [[90, 100, 116], [140, 150, 168]];
    return `background:linear-gradient(140deg,rgb(${c[0]}) 0%,rgb(${c[1]}) 100%)`;
  };
  const shortName = b => (b.length <= 2 ? b : b === '机械革命' ? '机械' : b === '任天堂' ? '任' : b.slice(0, 2));

  // 涨跌：真实产品来自上一份报价单，这里按 id 生成确定值占位
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  ITEMS.forEach(it => {
    it.prev = it.max == null ? null : Math.round(it.max * (1 + (((hash(it.id + 'prev') % 160) - 80) / 10000)));
  });

  const WATCH_KEY = 'sjw.watch.v2';
  const watched = new Set((() => { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; } })());

  const S = { cat: '全部', brand: '全部', q: '', sort: 'default', onlyPriced: false, onlyWatched: false, typeKey: null };

  /* ---------------- 小工具 ---------------- */
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = n => n == null ? '—' : n.toLocaleString('zh-CN');

  // 型号名和规格分开：手机/平板/穿戴把 12+512 抠出来做 chip，电脑保留整串
  function splitName(it) {
    if (!['手机', '平板', '穿戴', '音频', '配件'].includes(it.category) || !it.storage) return [it.head, null];
    const re = new RegExp('\\s*' + it.storage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*');
    const pure = it.head.replace(re, ' ').replace(/\s+/g, ' ').trim();
    return pure && pure !== it.head ? [pure, it.storage] : [it.head, null];
  }

  function priceHTML(it) {
    if (it.min == null) return `<strong class="masked">停收</strong><span class="delta flat">当日不收</span>`;
    const masks = it.offers.filter(o => o.mask).map(o => o.mask);
    const allMasked = masks.length === it.offers.length && masks.length > 0;

    if (allMasked && new Set(masks).size === 1) {
      const m = masks[0];
      const digits = m.replace(/\*/g, '');
      return `<strong class="masked">${digits}<small>${'x'.repeat(m.length - digits.length)}</small></strong>
        <span class="range">${num(it.min)}–${num(it.max)}</span>${deltaHTML(it)}`;
    }
    const main = it.min === it.max ? num(it.min) : num(it.min);
    const unit = it.min === it.max ? '<small>元</small>' : '<small>元起</small>';
    const range = it.min === it.max ? '' : `<span class="range">${num(it.min)}–${num(it.max)}</span>`;
    return `<strong>${main}${unit}</strong>${range}${deltaHTML(it)}`;
  }

  function deltaHTML(it) {
    if (it.prev == null || it.max == null) return '';
    const d = it.max - it.prev;
    if (!d) return '<span class="delta flat">持平</span>';
    const pct = (Math.abs(d / it.prev) * 100).toFixed(1).replace(/\.0$/, '');
    const tail = pct === '0' ? ' 元' : ` ${pct}%`;
    return d > 0
      ? `<span class="delta up">↑${num(d)}${tail}</span>`
      : `<span class="delta down">↓${num(-d)}${tail}</span>`;
  }

  const haystack = it => [it.head, it.brand, it.series, it.category, it.conditions.join(' '),
    it.offers.map(o => o.colors.join('')).join(' '), it.typeLabel].join(' ').toLowerCase();
  const matchesQuery = it => !S.q || haystack(it).includes(S.q.toLowerCase());

  function filtered() {
    let out = ITEMS.filter(it =>
      (S.cat === '全部' || it.category === S.cat) &&
      (S.brand === '全部' || it.brand === S.brand) &&
      (!S.typeKey || it.typeKey === S.typeKey) &&
      (!S.onlyPriced || it.min != null) &&
      (!S.onlyWatched || watched.has(it.id)) &&
      matchesQuery(it));
    if (S.sort === 'asc') out = out.slice().sort((a, b) => (a.min ?? 1e9) - (b.min ?? 1e9));
    if (S.sort === 'desc') out = out.slice().sort((a, b) => (b.max ?? -1) - (a.max ?? -1));
    return out;
  }

  /* ---------------- 渲染 ---------------- */
  function renderCats() {
    $('#cats').innerHTML = CATS.map(c => {
      const n = c === '全部' ? ITEMS.length : ITEMS.filter(i => i.category === c).length;
      return `<button class="cat ${c === S.cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}<b>${n}</b></button>`;
    }).join('');
  }

  function renderBrands() {
    const pool = ITEMS.filter(it => (S.cat === '全部' || it.category === S.cat) && matchesQuery(it));
    $('#brands').innerHTML = BRANDS.map(b => {
      const n = b === '全部' ? pool.length : pool.filter(i => i.brand === b).length;
      if (b !== '全部' && !n) return '';
      return `<button class="brand ${b === S.brand ? 'on' : ''}" data-brand="${esc(b)}"><b>${esc(b)}</b><small>${n}</small></button>`;
    }).join('');
  }

  function cardHTML(it, i) {
    const [name, sto] = splitName(it);
    const tags = [];
    if (it.typeKey !== 'recycle') tags.push(`<span class="tag ${it.typeKey === 'agency' ? 'agency' : 'wholesale'}">${esc(it.typeLabel)}</span>`);
    it.conditions.slice(0, 3).forEach(c => tags.push(`<span class="tag warn">${esc(c)}</span>`));
    if (it.variant) tags.push(`<span class="tag gray">${esc(it.variant)}</span>`);
    if (!tags.length) {
      const cn = it.offers.reduce((n, o) => n + (o.colors.length || 0), 0);
      tags.push(`<span class="tag ${it.min == null ? 'warn' : ''}">${it.min == null ? '停收' : cn + ' 个配色'}</span>`);
    }
    return `<article class="card ${it.min == null ? 'dead' : ''}" data-id="${esc(it.id)}" style="animation-delay:${Math.min(i, 12) * 12}ms">
      <div class="thumb ${shortName(it.brand).length > 2 ? 'sm' : ''}" style="${thumbStyle(it.brand)}">${esc(shortName(it.brand))}</div>
      <div class="mid">
        <h4>${watched.has(it.id) ? '<span class="star">★</span>' : ''}${esc(name)}${sto ? `<span class="sto">${esc(sto)}</span>` : ''}</h4>
        <div class="tags">${tags.join('')}</div>
      </div>
      <div class="price">${priceHTML(it)}</div>
    </article>`;
  }

  function renderRows(skeleton) {
    const list = filtered();
    $('#countText').textContent = `${list.length} 个机型 · ${new Set(list.map(i => i.brand)).size} 个品牌`;
    const box = $('#rows');

    if (skeleton) {
      box.innerHTML = Array.from({ length: 7 }).map(() => `
        <div class="sk-card">
          <div class="sk" style="width:42px;height:42px;border-radius:12px"></div>
          <div style="flex:1">
            <div class="sk" style="height:13px;width:60%"></div>
            <div class="sk" style="height:10px;width:36%;margin-top:7px"></div>
          </div>
          <div class="sk" style="width:56px;height:20px"></div>
        </div>`).join('');
      return;
    }

    if (!list.length) {
      box.innerHTML = `<div class="empty">
        <svg viewBox="0 0 64 64" width="58" height="58"><rect x="12" y="10" width="40" height="44" rx="7" fill="none" stroke="#c7cfdc" stroke-width="2.4"/><path d="M22 26h20M22 34h14" stroke="#c7cfdc" stroke-width="2.4" stroke-linecap="round"/></svg>
        <div>没找到这个机型</div><div style="font-size:11.5px">换个关键词，或关掉「只看有价」</div></div>`;
      return;
    }

    if (S.sort !== 'default') {
      box.innerHTML = list.map((it, i) => {
        const h = `<div class="shead"><span class="sbrand">${esc(it.brand)}</span><span class="ssep">/</span><span class="sname">${esc(it.series)}</span></div>`;
        return (i === 0 || list[i - 1].seriesKey !== it.seriesKey ? h : '') + cardHTML(it, i);
      }).join('') + FOOT;
      return;
    }

    const groups = new Map();
    list.forEach(it => { if (!groups.has(it.seriesKey)) groups.set(it.seriesKey, []); groups.get(it.seriesKey).push(it); });

    let html = '', idx = 0;
    for (const [, items] of groups) {
      const h = items[0];
      const cls = h.typeKey === 'agency' ? 'agency' : h.typeKey === 'wholesale' ? 'wholesale' : '';
      html += `<div class="shead">
        <span class="sbrand">${esc(h.brand)}</span><span class="ssep">/</span><span class="sname">${esc(h.series)}</span>
        <span class="badge ${cls}">${esc(h.typeLabel)}</span>
        <span class="scount">${items.length} 款</span></div>`;
      html += items.map(it => cardHTML(it, idx++)).join('');
    }
    box.innerHTML = html + FOOT;
  }

  const FOOT = `<div class="foot">数据源：郑州鑫盛 2026-11-21 微信报价单 · 与商家原文逐行一致<br/>价格为当日结算价 · 遮码价显示为 34xx · 停收 = 当日不收该配色</div>`;

  function renderAll(skeleton) { renderCats(); renderBrands(); renderRows(skeleton); }

  /* ---------------- 抽屉 ---------------- */
  const mask = $('#mask'), sheet = $('#sheet');
  const closeSheet = () => { mask.hidden = true; sheet.hidden = true; sheet.innerHTML = ''; };
  mask.addEventListener('click', closeSheet);

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), 1700);
  }

  function drawSpark(cv, base, seed) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    // 近 7 日（占位）：以当日价为锚点做确定性波动
    const pts = [];
    for (let i = 0; i < 7; i++) {
      const r = ((hash(seed + i) % 100) / 100 - .5) * 0.028;
      pts.push(base * (1 + r + (i - 6) * -0.0012));
    }
    pts[6] = base;
    const min = Math.min(...pts), max = Math.max(...pts);
    const span = max - min || 1;
    const X = i => (i / 6) * (w - 8) + 4;
    const Y = v => h - 8 - ((v - min) / span) * (h - 18);

    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(43,98,246,.20)');
    g.addColorStop(1, 'rgba(43,98,246,0)');
    c.beginPath(); c.moveTo(X(0), h);
    pts.forEach((v, i) => c.lineTo(X(i), Y(v)));
    c.lineTo(X(6), h); c.closePath(); c.fillStyle = g; c.fill();

    c.beginPath();
    pts.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
    c.strokeStyle = '#2b62f6'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();

    c.beginPath(); c.arc(X(6), Y(pts[6]), 3.2, 0, Math.PI * 2);
    c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#2b62f6'; c.lineWidth = 2.2; c.stroke();
  }

  function openDetail(it) {
    const [name, sto] = splitName(it);
    const c = BRAND[it.brand] || [[90, 100, 116], [140, 150, 168]];
    const headBg = `background:linear-gradient(180deg,rgba(${c[0].join(',')},.16) 0%,rgba(${c[0].join(',')},.05) 58%,#fff 100%)`;
    const brandPill = `background:linear-gradient(140deg,rgb(${c[0]}) 0%,rgb(${c[1]}) 100%)`;
    const chips = it.offers.map(o => {
      const label = o.colors.length ? o.colors.join(' ') : '统一价';
      if (o.value == null) return `<div class="cchip dead"><em>${esc(label)}</em><b>停收</b></div>`;
      const val = o.mask ? o.mask.replace(/\*/g, 'x') : num(o.value);
      return `<div class="cchip"><em>${esc(label)}</em><b>${val}</b></div>`;
    }).join('');

    const kv = [
      ['品类 / 品牌', `${it.category} · ${it.brand}`],
      ['规格', it.storage || '—'],
      ['价格类型', it.typeLabel],
      ['当日条件', it.conditions.length ? it.conditions.join('、') : '无'],
      ['官方指导价', it.msrp ? num(it.msrp) + ' 元' : '—'],
      ['昨日对比', it.prev == null ? '—' : num(it.prev) + ' 元'],
      ['报价日期', '2026-11-21'],
      ['报价商家', D.meta.merchant || '—'],
    ].map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

    const priceLine = it.min == null ? '停收'
      : (it.min === it.max ? num(it.min) + '<span>元</span>' : num(it.min) + '<span>元起</span>');

    sheet.innerHTML = `
      <div class="grab"></div>
      <div class="dh" style="${headBg}">
        <div class="dh-name">${esc(name)}${sto ? ` ${esc(sto)}` : ''}</div>
        <div class="dh-price">${priceLine}</div>
        <div class="dh-sub">
          <span class="pill" style="${brandPill};color:#fff;border-color:transparent">${esc(it.brand)}</span>
          <span>${esc(it.typeLabel)}</span><span>·</span><span>11.21 结算价</span><span>·</span><span>${esc(it.series)}</span>
        </div>
      </div>
      ${it.max != null ? `<div class="spark-box"><h5>近 7 日报价<em>演示数据</em></h5><canvas class="spark" id="spark"></canvas></div>` : ''}
      <div class="sec">分色报价<span>${it.offers.length} 条</span></div>
      <div class="colors">${chips}</div>
      <div class="sec">明细</div>
      <div class="kv">${kv}</div>
      <div class="sec">原始报价行</div>
      <pre class="raw">${esc(it.source)}</pre>
      <div class="acts">
        <button class="${watched.has(it.id) ? 'watched' : ''}" id="btnWatch">${watched.has(it.id) ? '★ 已关注' : '☆ 关注'}</button>
        <button class="primary" id="btnCopy">复制报价</button>
      </div>`;

    mask.hidden = false; sheet.hidden = false;
    const cv = $('#spark');
    if (cv) requestAnimationFrame(() => drawSpark(cv, it.max, it.id));

    $('#btnWatch').addEventListener('click', e => {
      watched.has(it.id) ? watched.delete(it.id) : watched.add(it.id);
      localStorage.setItem(WATCH_KEY, JSON.stringify([...watched]));
      const on = watched.has(it.id);
      e.currentTarget.textContent = on ? '★ 已关注' : '☆ 关注';
      e.currentTarget.classList.toggle('watched', on);
      renderRows();
    });
    $('#btnCopy').addEventListener('click', async () => {
      const txt = `${it.head} ${it.min == null ? '停收' : num(it.min) + '-' + num(it.max) + '元'} ${it.typeLabel}（11.21）`;
      try { await navigator.clipboard.writeText(txt); toast('已复制 ' + txt); }
      catch { prompt('复制这段：', txt); }
    });
  }

  function openRaw() {
    let html = '';
    D.series.forEach(s => {
      html += `<div class="rgroup"><h6>${esc(s.brand)} / ${esc(s.series)} · ${esc(s.typeLabel)}</h6>
        <pre>${s.items.map(i => esc(i.source)).join('\n')}</pre></div>`;
    });
    sheet.innerHTML = `<div class="grab"></div>
      <div class="rawsheet">
        <h3>报价原文</h3>
        <div class="note">${esc(D.meta.merchant)} · ${esc(D.meta.date)} · ${ITEMS.length} 行，与商家发出的报价单逐行一致</div>
        ${html}
      </div>`;
    mask.hidden = false; sheet.hidden = false;
  }

  function openFilter() {
    const types = [['全部', null], ['回收价', 'recycle'], ['出货价', 'wholesale'], ['代卖价', 'agency']];
    sheet.innerHTML = `<div class="grab"></div>
      <div class="fsheet">
        <h3>筛选</h3>
        <div class="note">条件叠加生效</div>
        <div class="fgroup"><h4>价格类型</h4><div class="opts">
          ${types.map(([l, k]) => `<button class="opt ${S.typeKey === k ? 'on' : ''}" data-type="${k ?? ''}">${l}${k ? `<i>${ITEMS.filter(i => i.typeKey === k).length}</i>` : ''}</button>`).join('')}
        </div></div>
        <div class="fgroup"><h4>显示</h4><div class="opts">
          <button class="opt ${S.onlyPriced ? 'on' : ''}" data-toggle="onlyPriced">只看有价</button>
          <button class="opt ${S.onlyWatched ? 'on' : ''}" data-toggle="onlyWatched">只看关注<i>${watched.size}</i></button>
        </div></div>
        <div class="facts">
          <button id="btnReset">重置</button>
          <button class="primary" id="btnDone">看 ${filtered().length} 个结果</button>
        </div>
      </div>`;
    mask.hidden = false; sheet.hidden = false;

    const refresh = () => { $('#btnDone').textContent = `看 ${filtered().length} 个结果`; };
    sheet.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
      S.typeKey = b.dataset.type || null;
      sheet.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x === b));
      refresh();
    }));
    sheet.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.toggle; S[k] = !S[k];
      b.classList.toggle('on', S[k]);
      refresh();
    }));
    $('#btnReset').addEventListener('click', () => {
      S.typeKey = null; S.onlyPriced = false; S.onlyWatched = false;
      closeSheet(); renderAll(); openFilter();
    });
    $('#btnDone').addEventListener('click', () => { closeSheet(); renderAll(); });
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', e => {
    const cat = e.target.closest('[data-cat]');
    if (cat) { S.cat = cat.dataset.cat; S.brand = '全部'; renderAll(); return; }
    const br = e.target.closest('[data-brand]');
    if (br) { S.brand = br.dataset.brand; renderBrands(); renderRows(); $('#rows').scrollTop = 0; return; }
    const card = e.target.closest('.card[data-id]');
    if (card) { const it = ITEMS.find(x => x.id === card.dataset.id); if (it) openDetail(it); return; }
    const seg = e.target.closest('[data-sort]');
    if (seg) {
      S.sort = seg.dataset.sort;
      document.querySelectorAll('#segSort button').forEach(b => b.classList.toggle('on', b === seg));
      renderRows(); $('#rows').scrollTop = 0; return;
    }
    const tab = e.target.closest('#tabbar button');
    if (tab && tab.dataset.tab !== 'market') toast('复刻演示：只做了「行情」模块');
  });

  $('#q').addEventListener('input', e => {
    S.q = e.target.value.trim();
    $('#btnClear').hidden = !S.q;
    renderBrands(); renderRows();
  });
  $('#btnClear').addEventListener('click', () => {
    $('#q').value = ''; S.q = ''; $('#btnClear').hidden = true;
    renderBrands(); renderRows();
  });
  $('#btnFilter').addEventListener('click', openFilter);
  $('#btnRaw').addEventListener('click', openRaw);
  $('#btnCity').addEventListener('click', () => toast('复刻演示：郑州单站'));
  $('#dateText').textContent = (D.meta.date || '').slice(5).replace('-', '.') || '—';

  /* ---------------- 启动 ---------------- */
  renderAll(true);
  setTimeout(() => {
    renderAll(false);
    if (location.hash.startsWith('#detail=')) {
      const it = ITEMS.find(x => x.id === decodeURIComponent(location.hash.slice(8)));
      if (it) openDetail(it);
    } else if (location.hash === '#filter') openFilter();
    else if (location.hash === '#raw') openRaw();
  }, 260);
})();
