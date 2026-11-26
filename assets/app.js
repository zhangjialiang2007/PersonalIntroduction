/* ===================================================================
   作品集前端逻辑：读取 data/works.json → 渲染筛选/搜索/排序 → 弹窗播放
   数据驱动，改内容只动 JSON，不动这里。
   =================================================================== */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const grid = $('work-grid');
  const filters = $('filters');
  const search = $('search');
  const sortBy = $('sort-by');
  const results = $('results');
  const empty = $('empty');
  const dialog = $('detail');
  const player = $('player');

  let works = [];
  let category = '全部';

  /* 相对路径（含中文文件名）与 http(s) 外链放行，挡掉 javascript: 等协议 */
  const safeUrl = (value) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const isBvid = (value) => /^BV[0-9A-Za-z]{10}$/.test(value || '');

  /* 小工具：建元素 */
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /* ---------- 卡片 ---------- */
  function createCard(work) {
    const card = el('article', 'card');
    const btn = el('button', 'card-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', `查看《${work.title}》详情`);
    btn.addEventListener('click', () => openDetail(work));

    const thumb = el('div', 'thumb');
    const cover = safeUrl(work.cover);
    if (cover) {
      const img = el('img');
      img.src = cover;
      img.alt = `${work.title} 封面`;
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove()); // 图挂了就回落到渐变占位
      thumb.append(img);
    } else {
      thumb.append(el('span', 'initial', (work.category || work.title || '·').slice(0, 1)));
    }
    thumb.append(
      el('span', 'corner', work.category || '作品'),
      el('span', 'play', '▶')
    );
    if (work.duration) thumb.append(el('span', 'duration', work.duration));

    const body = el('div', 'card-body');
    body.append(el('h3', '', work.title));
    body.append(el('p', '', work.summary || '点击查看详情。'));

    const foot = el('div', 'card-foot');
    const tags = el('div', 'tags');
    (work.tags || []).slice(0, 2).forEach((tag) => tags.append(el('span', 'tag', tag)));
    foot.append(tags, el('span', 'more', '查看详情 ↗'));
    body.append(foot);

    btn.append(thumb, body);
    card.append(btn);
    return card;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const term = search.value.trim().toLowerCase();

    const list = works.filter((work) => {
      const inCategory = category === '全部' || work.category === category;
      if (!inCategory) return false;
      if (!term) return true;
      const haystack = [work.title, work.summary, work.description, work.category, ...(work.tags || [])]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

    // default 保留 JSON 里的原始顺序；按日期排序时未填日期的作品始终排最后
    if (sortBy.value !== 'default') {
      const sign = sortBy.value === 'newest' ? -1 : 1;
      list.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return sign * a.date.localeCompare(b.date);
      });
    }

    grid.replaceChildren(...list.map(createCard));
    empty.hidden = list.length > 0;
    results.textContent = `${list.length} / ${works.length} 个作品`;
  }

  /* ---------- 分类筛选按钮 ---------- */
  function renderFilters() {
    // 分类按数据中首次出现的顺序排列，新增分类无需改代码
    const categories = [...new Set(works.map((work) => work.category).filter(Boolean))];
    ['全部', ...categories].forEach((name) => {
      const chip = el('button', 'chip', name);
      chip.type = 'button';
      chip.dataset.category = name;
      chip.addEventListener('click', () => setCategory(name));
      filters.append(chip);
    });
    setCategory('全部');
  }

  function setCategory(name) {
    category = name;
    filters.querySelectorAll('.chip').forEach((chip) => {
      const active = chip.dataset.category === name;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    render();
  }

  /* ---------- 详情弹窗 ---------- */
  function openDetail(work) {
    $('detail-category').textContent = [work.category, work.duration && `时长 ${work.duration}`]
      .filter(Boolean)
      .join(' · ');
    $('detail-title').textContent = work.title || '';
    $('detail-desc').textContent = work.description || work.summary || '';
    $('detail-tags').replaceChildren(
      ...(work.tags || []).map((tag) => el('span', 'tag', tag))
    );

    const links = $('detail-links');
    links.replaceChildren();
    // B 站视频给一个站内跳转，外链也可以同时在 links 里配
    if (isBvid(work.bvid)) {
      const a = el('a', '', '在 B 站观看 ↗');
      a.href = `https://www.bilibili.com/video/${work.bvid}/`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      links.append(a);
    }
    (work.links || []).forEach((item) => {
      const href = safeUrl(item && item.url);
      if (!href) return;
      const a = el('a', '', `${item.label || '相关链接'} ↗`);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      links.append(a);
    });

    // 播放器：优先本地 mp4，其次 B 站嵌入，都没有就提示
    player.replaceChildren();
    const videoUrl = safeUrl(work.video);
    // 没有视频时不再保留 16:9 空白
    player.classList.toggle('no-media', !videoUrl && !isBvid(work.bvid));
    if (videoUrl) {
      const video = el('video');
      video.src = videoUrl;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      player.append(video);
    } else if (isBvid(work.bvid)) {
      const iframe = el('iframe');
      const src = new URL('https://player.bilibili.com/player.html');
      src.searchParams.set('bvid', work.bvid);
      src.searchParams.set('page', '1');
      src.searchParams.set('autoplay', '0');
      src.searchParams.set('danmaku', '0');
      iframe.src = src.href;
      iframe.title = `${work.title} - 视频播放`;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.setAttribute('allowfullscreen', '');
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      player.append(iframe);
    } else {
      player.append(el('p', 'hint', '此作品还没有视频。\n在 data/works.json 里填 bvid（B 站）或 video（mp4 路径）即可播放。'));
    }

    dialog.showModal();
  }

  function closeDetail() {
    dialog.close();
    player.replaceChildren(); // 清空即停止播放
  }

  /* ---------- 事件绑定 ---------- */
  search.addEventListener('input', render);
  sortBy.addEventListener('change', render);
  $('close-detail').addEventListener('click', closeDetail);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDetail(); // 点遮罩关闭
  });
  dialog.addEventListener('close', () => player.replaceChildren());

  $('year').textContent = String(new Date().getFullYear());
  $('stat-year').textContent = String(new Date().getFullYear());

  /* ---------- 启动：拉数据 ---------- */
  fetch('data/works.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data)) throw new Error('works.json 根节点必须是数组');
      works = data.filter((work) => work && work.id && work.title);
      $('stat-works').textContent = String(works.length).padStart(2, '0');
      $('stat-categories').textContent = String(
        new Set(works.map((work) => work.category).filter(Boolean)).size
      ).padStart(2, '0');
      renderFilters();
    })
    .catch((error) => {
      console.error(error);
      results.textContent = '加载失败';
      empty.hidden = true;
      grid.append(
        el(
          'p',
          'empty',
          location.protocol === 'file:'
            ? '浏览器不允许本地文件直接读取 JSON。请在此目录运行 python -m http.server 8000，再访问 http://localhost:8000'
            : '无法读取 data/works.json，请检查文件是否存在且为合法 JSON。'
        )
      );
    });
})();
