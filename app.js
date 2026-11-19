/* app.js — 가전 전기요금 계산기 UI (요금 계산은 tariff.js) */
(function () {
  'use strict';

  var T = window.Tariff;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ── 가전 프리셋 (소비전력은 제품 표기 정격의 대표값) ────────────── */
  var PRESETS = [
    { id: 'washer', name: '세탁기', emoji: '🧺', w: 2000, hours: 1.5, days: 12 },
    { id: 'dryer', name: '건조기', emoji: '🌬️', w: 2000, hours: 1.5, days: 8 },
    { id: 'airfryer', name: '에어프라이어', emoji: '🍟', w: 1500, hours: 0.5, days: 15 },
    { id: 'microwave', name: '전자레인지', emoji: '🍲', w: 1000, hours: 0.2, days: 30 },
    { id: 'induction', name: '인덕션', emoji: '🍳', w: 3400, hours: 1, days: 20 },
    { id: 'kettle', name: '전기포트', emoji: '☕', w: 1500, hours: 0.2, days: 30 },
    { id: 'heater', name: '전기히터', emoji: '🔥', w: 2000, hours: 3, days: 15 },
    { id: 'blanket', name: '전기장판', emoji: '🛏️', w: 150, hours: 6, days: 30 },
    { id: 'dehumidifier', name: '제습기', emoji: '💧', w: 300, hours: 8, days: 20 },
    { id: 'fridge', name: '냉장고', emoji: '🧊', w: 50, hours: 24, days: 30 },
    { id: 'tv', name: 'TV', emoji: '📺', w: 120, hours: 4, days: 30 },
    { id: 'pc', name: '컴퓨터', emoji: '🖥️', w: 200, hours: 5, days: 25 },
    { id: 'purifier', name: '공기청정기', emoji: '🌿', w: 40, hours: 24, days: 30 },
    { id: 'fan', name: '선풍기', emoji: '🌀', w: 50, hours: 8, days: 20 },
    { id: 'hairdryer', name: '헤어드라이어', emoji: '💨', w: 1800, hours: 0.2, days: 12 },
    { id: 'robot', name: '로봇청소기', emoji: '🤖', w: 60, hours: 1, days: 20 }
  ];

  var HEAT_IDS = { heater: 1, induction: 1, dryer: 1, kettle: 1, hairdryer: 1 };

  var state = {
    type: 'low',
    season: 'other',
    baseKwh: 300,
    items: [],
    seq: 0
  };

  /* ── 포맷 ─────────────────────────────────────────── */
  function fmt(n) {
    return Math.round(n).toLocaleString('ko-KR');
  }
  function fmt1(n) {
    var v = Math.round(n * 10) / 10;
    return v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  function won(n) {
    return fmt(n) + '원';
  }
  function pct(n) {
    if (!isFinite(n)) return '0';
    return (Math.round(n * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  }
  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /* ── 계산 ─────────────────────────────────────────── */
  function analyze() {
    var before = T.computeBill(state.baseKwh, state.type, state.season);
    var running = state.baseKwh;
    var prev = before;
    var perItem = [];
    state.items.forEach(function (it) {
      var kwh = T.applianceKwh(it.w, it.hours, it.days);
      running += kwh;
      var now = T.computeBill(running, state.type, state.season);
      perItem.push({ kwh: kwh, cost: now.total - prev.total });
      prev = now;
    });
    return {
      before: before,
      after: prev,
      addedKwh: running - state.baseKwh,
      totalKwh: running,
      delta: prev.total - before.total,
      perItem: perItem
    };
  }

  function safetyData() {
    var picked = state.items.filter(function (it) { return it.multitap; });
    var watts = picked.reduce(function (sum, it) { return sum + (Number(it.w) || 0); }, 0);
    return { picked: picked, watts: watts, report: T.multitapReport(watts) };
  }

  /* ── 프리셋 렌더 ──────────────────────────────────── */
  function renderPresets() {
    var box = $('#presets');
    box.innerHTML = '';
    PRESETS.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.dataset.preset = p.id;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', p.name + ' ' + fmt(p.w) + 'W 추가');
      b.innerHTML =
        '<span class="p-emoji" aria-hidden="true">' + p.emoji + '</span>' +
        '<span class="p-name">' + p.name + '</span>' +
        '<span class="p-w">' + fmt(p.w) + 'W</span>';
      b.addEventListener('click', function () { togglePreset(p); });
      box.appendChild(b);
    });
  }

  function syncPresetState() {
    $$('#presets .preset').forEach(function (b) {
      var on = state.items.some(function (it) { return it.presetId === b.dataset.preset; });
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function togglePreset(p) {
    var idx = -1;
    state.items.forEach(function (it, i) {
      if (it.presetId === p.id) idx = i;
    });
    if (idx >= 0) {
      state.items.splice(idx, 1);
    } else {
      state.items.push({
        key: ++state.seq,
        presetId: p.id,
        name: p.name,
        emoji: p.emoji,
        w: p.w,
        hours: p.hours,
        days: p.days,
        multitap: false
      });
    }
    renderItems();
    syncPresetState();
    refresh();
  }

  /* ── 선택 가전 렌더 ───────────────────────────────── */
  function renderItems() {
    var box = $('#selected');
    box.innerHTML = '';

    if (!state.items.length) {
      var empty = document.createElement('p');
      empty.className = 'hint';
      empty.style.marginTop = '4px';
      empty.id = 'selected-empty';
      empty.textContent = '아직 고른 가전이 없어요. 위에서 가전을 누르면 아래에 추가됩니다.';
      box.appendChild(empty);
      return;
    }

    state.items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'item';
      row.dataset.key = String(it.key);

      var head = document.createElement('div');
      head.className = 'item-head';
      head.innerHTML =
        '<span class="item-emoji" aria-hidden="true">' + it.emoji + '</span>' +
        '<span class="item-name"><span>' + escapeHtml(it.name) + '</span><small></small></span>';
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'item-remove';
      remove.setAttribute('aria-label', it.name + ' 삭제');
      remove.textContent = '×';
      remove.addEventListener('click', function () {
        state.items = state.items.filter(function (x) { return x.key !== it.key; });
        renderItems();
        syncPresetState();
        refresh();
      });
      head.appendChild(remove);
      row.appendChild(head);

      var controls = document.createElement('div');
      controls.className = 'item-controls';
      controls.innerHTML =
        '<label>소비전력<input type="number" inputmode="numeric" min="1" max="8000" step="10" data-field="w"></label>' +
        '<label>하루<input type="number" inputmode="decimal" min="0.1" max="24" step="0.5" data-field="hours"></label>' +
        '<label>한 달<input type="number" inputmode="numeric" min="1" max="31" step="1" data-field="days"></label>';
      controls.querySelector('[data-field="w"]').value = it.w;
      controls.querySelector('[data-field="hours"]').value = it.hours;
      controls.querySelector('[data-field="days"]').value = it.days;
      row.appendChild(controls);

      var foot = document.createElement('div');
      foot.className = 'item-foot';
      var label = document.createElement('label');
      label.className = 'check';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.multitap;
      cb.setAttribute('aria-label', it.name + ' 같은 멀티탭에 사용');
      label.appendChild(cb);
      label.appendChild(document.createTextNode('같은 멀티탭'));
      foot.appendChild(label);

      var kwh = document.createElement('span');
      kwh.className = 'item-kwh';
      foot.appendChild(kwh);
      var cost = document.createElement('span');
      cost.className = 'item-cost';
      foot.appendChild(cost);
      row.appendChild(foot);

      function onField(e) {
        var field = e.target.dataset.field;
        if (!field) return;
        var v = parseFloat(e.target.value);
        if (!isFinite(v)) return;
        if (field === 'w') it.w = clamp(Math.round(v), 0, 8000);
        if (field === 'hours') it.hours = clamp(v, 0, 24);
        if (field === 'days') it.days = clamp(Math.round(v), 0, 31);
        refresh();
      }
      controls.addEventListener('input', onField);
      controls.addEventListener('change', function (e) {
        onField(e);
        var f = e.target.dataset.field;
        if (f === 'w') e.target.value = it.w;
        if (f === 'days') e.target.value = it.days;
      });
      cb.addEventListener('change', function () {
        it.multitap = cb.checked;
        refresh();
      });

      box.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── 결과 렌더 ────────────────────────────────────── */
  function refresh() {
    var a = analyze();
    var hasItems = state.items.length > 0;

    /* 항목별 수치 갱신 */
    $$('#selected .item').forEach(function (row) {
      var key = Number(row.dataset.key);
      var idx = -1;
      state.items.forEach(function (it, i) { if (it.key === key) idx = i; });
      if (idx < 0) return;
      var it = state.items[idx];
      var res = a.perItem[idx];
      row.querySelector('.item-name small').textContent = fmt(it.w) + 'W';
      row.querySelector('.item-kwh').textContent = fmt1(res.kwh) + ' kWh';
      row.querySelector('.item-cost').textContent = (res.cost >= 0 ? '+' : '−') + won(Math.abs(res.cost));
    });

    /* 기본 사용량 안내 */
    var before = a.before;
    var bounds = T.tierBounds(state.season);
    var nextBound = before.tier < 3 ? bounds[before.tier - 1] : null;
    var baseHint = '지금 ' + before.tier + '단계 · 기본요금 ' + won(before.base) + ' · 청구액 ' + won(before.total);
    if (nextBound !== null) {
      baseHint += ' · 다음 단계까지 ' + fmt1(Math.max(0, nextBound - state.baseKwh)) + 'kWh';
    } else {
      baseHint += ' · 이미 3단계입니다';
    }
    $('#base-hint').textContent = baseHint;

    /* 큰 금액 */
    $('#total-bill').textContent = won(a.after.total);

    var deltaEl = $('#delta');
    if (!hasItems) {
      deltaEl.className = 'delta';
      deltaEl.innerHTML = '가전을 고르면 늘어나는 금액이 여기에 표시됩니다.';
    } else {
      var ratio = a.before.total > 0 ? (a.delta / a.before.total) * 100 : 0;
      deltaEl.className = 'delta' + (a.delta > 0 ? ' up' : '');
      deltaEl.innerHTML =
        '지금 ' + won(a.before.total) + ' → <strong>' +
        (a.delta >= 0 ? '+' : '−') + won(Math.abs(a.delta)) +
        '</strong> (' + (a.delta >= 0 ? '+' : '−') + pct(Math.abs(ratio)) + '%)';
    }

    /* 비교 바 */
    $('#compare').hidden = !hasItems;
    if (hasItems) {
      $('#compare-before').textContent = won(a.before.total);
      $('#compare-after').textContent = won(a.after.total);
      var maxV = Math.max(a.after.total, 1);
      $('#bar-before').style.width = (a.before.total / maxV) * 100 + '%';
      $('#bar-after').style.width = '100%';
      $('#compare-note').textContent =
        '추가 사용 ' + fmt1(a.addedKwh) + 'kWh · 한 달 총 ' + fmt1(a.totalKwh) + 'kWh';
    }

    /* 누진 단계 */
    var after = a.after;
    var tail = Math.max(60, bounds[1] * 0.6);
    var span = bounds[1] + tail;
    $('#z1-label').textContent = '~' + fmt(bounds[0]) + 'kWh';
    $('#z2-label').textContent = fmt(bounds[0] + 1) + '~' + fmt(bounds[1]);
    $('#z3-label').textContent = fmt(bounds[1]) + ' 초과';
    var zones = $$('#tier-track .tier-zone');
    zones[0].style.flexGrow = String(bounds[0]);
    zones[1].style.flexGrow = String(bounds[1] - bounds[0]);
    zones[2].style.flexGrow = String(tail);
    zones.forEach(function (z) {
      z.classList.toggle('active', Number(z.dataset.tier) === after.tier);
    });
    var posAfter = clamp(after.kwh / span, 0, 1) * 100;
    var posBefore = clamp(before.kwh / span, 0, 1) * 100;
    $('#marker-after').style.left = posAfter + '%';
    $('#marker-before').style.left = posBefore + '%';
    $('#marker-before').style.display = before.kwh === after.kwh ? 'none' : '';

    var badge = $('#tier-badge');
    var note = $('#tier-note');
    if (after.tier > before.tier) {
      badge.textContent = before.tier + '단계 → ' + after.tier + '단계';
      badge.className = 'tier-badge rise';
      note.textContent =
        '누진 ' + after.tier + '단계로 올라갑니다. 기본요금이 ' + won(after.base) +
        '로 바뀌고 ' + fmt(bounds[after.tier - 2]) + 'kWh 초과분 단가는 ' +
        T.TARIFF.types[after.type].rates[after.tier - 1].toFixed(1) + '원이라 요금이 크게 늘어납니다.';
    } else if (after.tier === 3) {
      badge.textContent = '3단계 유지';
      badge.className = 'tier-badge high';
      note.textContent =
        '이미 3단계입니다. 1kWh마다 ' + T.TARIFF.types[after.type].rates[2].toFixed(1) +
        '원이 붙어 가전 하나만 써도 요금이 크게 늘어납니다.';
    } else {
      badge.textContent = after.tier + '단계 유지';
      badge.className = 'tier-badge';
      var room = bounds[after.tier - 1] - after.kwh;
      note.textContent = '같은 ' + after.tier + '단계 안에서 ' + fmt1(room) + 'kWh 여유가 있습니다.';
    }

    /* 계산 내역 */
    var rows = [
      ['기본요금', before.base, after.base],
      ['전력량요금', before.energy, after.energy],
      ['기후환경요금 (9.0원/kWh)', before.climate, after.climate],
      ['연료비조정요금 (5.0원/kWh)', before.fuel, after.fuel],
      ['부가가치세 10%', before.vat, after.vat],
      ['전력산업기반기금 2.7%', before.fund, after.fund]
    ];
    var html = rows.map(function (r) {
      return '<tr><th scope="row">' + r[0] + '</th><td>' + won(r[1]) + '</td><td class="after-col">' + won(r[2]) + '</td></tr>';
    }).join('');
    html += '<tr class="total"><th scope="row">청구액</th><td>' + won(before.total) + '</td><td class="after-col">' + won(after.total) + '</td></tr>';
    $('#breakdown-body').innerHTML = html;

    /* 멀티탭 */
    renderSafety();

    /* 하단 고정 바 */
    $('#sticky-delta').textContent = hasItems ? (a.delta >= 0 ? '+' : '−') + won(Math.abs(a.delta)) : '0원';
    $('#sticky-delta').style.color = a.delta > 0 ? '#f04452' : '#1b64da';
  }

  function renderSafety() {
    var s = safetyData();
    var body = $('#safety-body');
    var empty = $('#safety-empty');
    var stickyDot = $('#sticky-dot');
    var stickyText = $('#sticky-safety');

    if (!s.picked.length) {
      body.hidden = true;
      empty.hidden = false;
      stickyDot.className = 'dot';
      stickyText.textContent = '안전 진단 전';
      return;
    }
    body.hidden = false;
    empty.hidden = true;

    var r = s.report;
    $('#safety-watt').textContent = fmt(r.watts) + ' W';
    $('#safety-amp').textContent = fmt1(r.amps) + ' A';

    var pill = $('#safety-pill');
    var msg = $('#safety-message');
    var tips = [];

    if (r.level === 'safe') {
      pill.textContent = '안전';
      pill.className = 'pill';
      msg.textContent = '일반 멀티탭(2,800W)으로도 쓸 수 있는 범위입니다. 정격의 ' + Math.round(r.normalRatio * 100) + '%를 쓰고 있어요.';
    } else if (r.level === 'warn') {
      pill.textContent = '주의';
      pill.className = 'pill warn';
      msg.textContent = '일반 멀티탭 정격(2,800W)에 가깝습니다. 권장 한도인 2,240W를 넘어 발열 위험이 커집니다.';
      tips.push('고용량 멀티탭(4,000W·16A)으로 바꾸거나 콘센트를 나눠 쓰세요.');
    } else {
      pill.textContent = '위험';
      pill.className = 'pill danger';
      if (r.overHigh) {
        msg.textContent = '고용량 멀티탭 정격(4,000W)까지 넘었습니다. 이 구성은 한 멀티탭에 걸 수 없습니다.';
        tips.push('열을 내는 가전은 서로 다른 콘센트(회로)에 나눠 꽂아야 합니다.');
      } else {
        msg.textContent = '일반 멀티탭 정격(2,800W·12.7A)을 넘었습니다. 그대로 쓰면 발열·화재 위험이 있습니다.';
        tips.push('고용량 멀티탭으로 바꾸거나, 한두 개를 다른 콘센트로 옮기세요.');
      }
    }

    if (r.overBreaker15) {
      tips.push('가정용 15A 차단기(약 3,300W)를 넘어 차단기가 내려갈 수 있습니다.');
    }

    var heat = s.picked.filter(function (it) { return HEAT_IDS[it.presetId]; }).map(function (it) { return it.name; });
    var heavy = s.picked
      .filter(function (it) { return Number(it.w) >= 2000 && !HEAT_IDS[it.presetId]; })
      .map(function (it) { return it.name; });

    if (heat.length) {
      tips.push(
        (heat.length > 1 ? heat.join('·') + '처럼 열을 내는 가전은' : heat[0] + '은') +
        ' 한 멀티탭에 겹쳐 꽂기보다 단독 콘센트에 꽂는 편이 안전합니다.'
      );
    }
    if (heavy.length) {
      tips.push(heavy.join('·') + '은 소비전력이 커서 벽면 콘센트에 단독으로 꽂는 편이 안전합니다.');
    }

    tips.push('멀티탭에 적힌 정격(예: 16A 250V)을 확인하고, 문어발식 연결은 피하세요.');

    $('#safety-tips').innerHTML = tips.map(function (t) { return '<li>' + escapeHtml(t) + '</li>'; }).join('');
    $('#gauge-fill').style.width = clamp((r.watts / 4500) * 100, 0, 100) + '%';
    $('#gauge-mark').style.left = clamp((r.watts / 4500) * 100, 0, 100) + '%';
    $('#gauge-desc').textContent =
      '정격 소비전력 ' + fmt(r.watts) + '와트, 220볼트 기준 ' + fmt1(r.amps) + '암페어. 일반 멀티탭 정격 2,800와트의 ' + Math.round(r.normalRatio * 100) + '퍼센트입니다.';
    $('#safety-items').innerHTML = s.picked.map(function (it) {
      return '<span>' + escapeHtml(it.name) + ' ' + fmt(it.w) + 'W</span>';
    }).join('');

    var label = r.level === 'safe' ? '안전' : r.level === 'warn' ? '주의' : '위험';
    stickyDot.className = 'dot ' + r.level;
    stickyText.textContent = '멀티탭 ' + label + ' · ' + fmt1(r.amps) + 'A';
  }

  /* ── 기본 입력 이벤트 ─────────────────────────────── */
  function setType(t) {
    state.type = t;
    $$('#type-seg button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.type === t ? 'true' : 'false');
    });
    refresh();
  }

  function setSeason(s) {
    state.season = s;
    $$('#season-seg button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.season === s ? 'true' : 'false');
    });
    var hints = {
      other: '1단계가 200kWh까지입니다. 전력량 단가는 120.0 / 214.6 / 307.3원입니다.',
      summer: '7~8월은 1단계가 300kWh까지로 넓어져 같은 사용량도 요금이 낮습니다.',
      winter: '동계(12~2월)는 1,000kWh를 넘는 부분에 슈퍼유저 요율 736.2원/kWh이 붙습니다.'
    };
    $('#season-hint').textContent = hints[s];
    refresh();
  }

  function setBase(kwh, fromRange) {
    var v = clamp(Math.round(Number(kwh) || 0), 0, 2000);
    state.baseKwh = v;
    var input = $('#base-kwh');
    if (fromRange || document.activeElement !== input) input.value = v;
    $('#base-range').value = clamp(v, 0, 1200);
    $$('#quick-row button').forEach(function (b) {
      b.setAttribute('aria-pressed', Number(b.dataset.kwh) === v ? 'true' : 'false');
    });
    refresh();
  }

  function addCustom() {
    var name = $('#new-name').value.trim() || '내 가전';
    var w = parseFloat($('#new-w').value);
    var hours = parseFloat($('#new-hours').value);
    var days = parseFloat($('#new-days').value);
    var hint = $('#add-hint');

    if (!isFinite(w) || w <= 0) {
      hint.textContent = '소비전력(W)을 1 이상으로 입력해 주세요.';
      $('#new-w').focus();
      return;
    }
    if (!isFinite(hours) || hours <= 0) {
      hint.textContent = '하루 사용시간을 입력해 주세요.';
      return;
    }
    if (!isFinite(days) || days <= 0) {
      hint.textContent = '한 달 사용일수를 입력해 주세요.';
      return;
    }

    state.items.push({
      key: ++state.seq,
      presetId: null,
      name: name.slice(0, 16),
      emoji: '🔌',
      w: clamp(Math.round(w), 1, 8000),
      hours: clamp(hours, 0.1, 24),
      days: clamp(Math.round(days), 1, 31),
      multitap: false
    });
    hint.textContent = name + ' ' + fmt(w) + 'W를 목록에 추가했습니다.';
    $('#new-name').value = '';
    $('#new-w').value = '';
    renderItems();
    syncPresetState();
    refresh();
  }

  /* ── 초기화 ───────────────────────────────────────── */
  function init() {
    renderPresets();
    renderItems();

    $$('#type-seg button').forEach(function (b) {
      b.addEventListener('click', function () { setType(b.dataset.type); });
    });
    $$('#season-seg button').forEach(function (b) {
      b.addEventListener('click', function () { setSeason(b.dataset.season); });
    });
    $('#base-kwh').addEventListener('input', function (e) { setBase(e.target.value); });
    $('#base-kwh').addEventListener('blur', function (e) { e.target.value = state.baseKwh; });
    $('#base-range').addEventListener('input', function (e) { setBase(e.target.value, true); });
    $$('#quick-row button').forEach(function (b) {
      b.addEventListener('click', function () { setBase(b.dataset.kwh); });
    });
    $('#add-btn').addEventListener('click', addCustom);
    ['new-name', 'new-w', 'new-hours', 'new-days'].forEach(function (id) {
      $('#' + id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
      });
    });

    setType('low');
    setSeason('other');
    setBase(300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
