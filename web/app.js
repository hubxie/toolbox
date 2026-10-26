(function () {
  'use strict';
  var core = window.JSONCore;
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var LS = {
    input: 'toolbox.input.v1',
    history: 'toolbox.json.history.v1',
    timer: 'toolbox.timer.v1',
    stats: 'toolbox.stats.v1'
  };
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 存储已满或隐私模式 */ }
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hms(secs) {
    return pad(Math.floor(secs / 3600)) + ':' + pad(Math.floor(secs % 3600 / 60)) + ':' + pad(secs % 60);
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ---------- state ----------
  var state = { norm: null, copyText: '', expanded: 0 };
  var els = {
    input: $('#input'), tree: $('#tree'), status: $('#status'),
    pathInput: $('#pathInput'), pathMsg: $('#pathMsg'),
    optExpand: $('#optExpand'),
    historyList: $('#historyList'), btnCompare: $('#btnCompare'),
    timerDisplay: $('#timerDisplay'), statFormats: $('#statFormats'),
    statRepairs: $('#statRepairs'), statTimer: $('#statTimer'), statHistory: $('#statHistory'),
    diffModal: $('#diffModal'), diffBody: $('#diffBody'), diffSummary: $('#diffSummary')
  };

  // ---------- history ----------
  var history = lsGet(LS.history, []);
  if (!Array.isArray(history)) history = [];
  var compareIds = [];

  function saveHistory() { lsSet(LS.history, history.slice(0, 100)); }

  function pushHistory(raw) {
    var text = raw.trim();
    if (!text) return;
    if (history.length && history[0].raw.trim() === text) return;
    history.unshift({ id: Date.now() + '-' + Math.floor(Math.random() * 1e4), ts: Date.now(), raw: text });
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    if (!history.length) {
      els.historyList.innerHTML = '<div class="history-empty">暂无历史。点「格式化」会把内容存入这里。</div>';
      els.btnCompare.disabled = true;
      els.statHistory.textContent = '0';
      return;
    }
    els.historyList.innerHTML = history.map(function (h) {
      var label = h.raw.replace(/\s+/g, ' ').slice(0, 60);
      var sel = compareIds.indexOf(h.id) >= 0;
      return '<div class="hist-item' + (sel ? ' selected' : '') + '" data-id="' + h.id + '">' +
        '<input type="checkbox"' + (sel ? ' checked' : '') + ' title="勾选两项进行对比">' +
        '<span class="hist-main" title="双击放回左侧输入框">' +
        '<span class="hist-label">' + esc(label) + '</span>' +
        '<span class="hist-time">' + fmtTime(h.ts) + '</span></span>' +
        '<button class="hist-del" title="删除这条历史">×</button></div>';
    }).join('');
    els.btnCompare.disabled = compareIds.length !== 2;
    els.statHistory.textContent = String(history.length);
  }

  els.historyList.addEventListener('click', function (ev) {
    var item = ev.target.closest('.hist-item');
    if (!item) return;
    var id = item.getAttribute('data-id');
    if (ev.target.classList.contains('hist-del')) {
      history = history.filter(function (h) { return h.id !== id; });
      compareIds = compareIds.filter(function (x) { return x !== id; });
      saveHistory(); renderHistory();
      return;
    }
    if (ev.target.type === 'checkbox') {
      var idx = compareIds.indexOf(id);
      if (ev.target.checked && idx < 0) {
        if (compareIds.length >= 2) compareIds.shift();
        compareIds.push(id);
      } else if (!ev.target.checked && idx >= 0) {
        compareIds.splice(idx, 1);
      }
      renderHistory();
    }
  });
  els.historyList.addEventListener('dblclick', function (ev) {
    var main = ev.target.closest('.hist-main');
    var item = ev.target.closest('.hist-item');
    if (!main || !item) return;
    var entry = history.filter(function (h) { return h.id === item.getAttribute('data-id'); })[0];
    if (!entry) return;
    els.input.value = entry.raw;
    lsSet(LS.input, entry.raw);
    format(false);
    els.input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#btnClearHistory').addEventListener('click', function () {
    if (!history.length) return;
    if (!window.confirm('确定清空全部历史吗？')) return;
    history = []; compareIds = [];
    saveHistory(); renderHistory();
  });

  // ---------- diff ----------
  els.btnCompare.addEventListener('click', function () {
    var picked = compareIds.map(function (id) {
      return history.filter(function (h) { return h.id === id; })[0];
    }).filter(Boolean).sort(function (a, b) { return a.ts - b.ts; });
    if (picked.length !== 2) return;
    var A = core.normalize(picked[0].raw), B = core.normalize(picked[1].raw);
    if (!A || !B) return;
    var ta = A.text.split('\n');
    var tb = B.text.split('\n');
    var d = core.diffLines(ta, tb);
    $('#diffLabelA').textContent = 'A · ' + fmtTime(picked[0].ts) + ' · ' + picked[0].raw.replace(/\s+/g, ' ').slice(0, 40);
    $('#diffLabelB').textContent = 'B · ' + fmtTime(picked[1].ts) + ' · ' + picked[1].raw.replace(/\s+/g, ' ').slice(0, 40);
    els.diffSummary.textContent = '差异 ' + d.changed + ' 行' + (d.truncated ? '（内容过长，仅对比前 2500 行）' : '');
    els.diffBody.innerHTML = d.rows.map(function (r) {
      return '<div class="diff-row ' + r.kind + '">' +
        '<div class="ln">' + (r.l || '') + '</div>' +
        '<div class="lc">' + (r.lt == null ? '' : esc(r.lt)) + '</div>' +
        '<div class="ln">' + (r.r || '') + '</div>' +
        '<div class="rc">' + (r.rt == null ? '' : esc(r.rt)) + '</div></div>';
    }).join('');
    els.diffModal.hidden = false;
  });
  $('#btnDiffClose').addEventListener('click', function () { els.diffModal.hidden = true; });
  els.diffModal.addEventListener('click', function (ev) {
    if (ev.target === els.diffModal) els.diffModal.hidden = true;
  });

  // ---------- tree rendering ----------
  function tokenHtml(tok) {
    var cls, text;
    if (tok.type === 'str') { cls = 't-str'; text = JSON.stringify(tok.value); }
    else if (tok.type === 'id' || tok.type === 'bad') { cls = 't-str'; text = JSON.stringify(String(tok.value == null ? '' : tok.value)); }
    else if (tok.type === 'num') { cls = 't-num'; text = core.numLiteral(tok.value); }
    else if (tok.type === 'true' || tok.type === 'false' || tok.type === 'null') { cls = 't-kw'; text = tok.type; }
    else { cls = 't-punc'; text = tok.type; }
    var title = tok.syn ? ' title="自动补充的内容，非原始数据"' : '';
    return '<span class="' + cls + (tok.syn ? ' syn' : '') + '"' + title + '>' + esc(text) + '</span>';
  }
  function keyHtmlOf(keyTok) {
    if (keyTok.bareKey) {
      return '<span class="syn" title="键名缺少引号，已自动补充">"</span>' +
        '<span class="t-key">' + esc(keyTok.value) + '</span>' +
        '<span class="syn">"</span>';
    }
    return '<span class="t-key' + (keyTok.syn ? ' syn' : '') + '">' + esc(JSON.stringify(keyTok.value)) + '</span>';
  }
  function commaHtml(tok) {
    if (!tok) return '';
    return '<span class="t-comma' + (tok.syn ? ' syn' : '') + '">,</span>';
  }
  function colonHtml(tok) {
    return '<span class="t-punc' + (tok.syn ? ' syn' : '') + '"' +
      (tok.syn ? ' title="自动补充的冒号"' : '') + '>:</span>';
  }
  var BADGE = '<span class="expanded-badge" title="原本是一个 JSON 字符串，已自动展开识别">内嵌字符串已展开</span>';

  function renderValue(node, ctx) {
    if (node.type === 'obj' || node.type === 'arr') {
      return renderContainer(node, ctx);
    }
    if (node.type === 'str' && els.optExpand.checked && ctx.depth < 5 && core.looksLikeJson(node.value)) {
      var inner = null;
      try { inner = core.normalize(node.value); } catch (e) { inner = null; }
      if (inner && inner.synCount <= 3 && (inner.ast.type === 'obj' || inner.ast.type === 'arr')) {
        state.expanded++;
        var expandedCtx = { key: ctx.key, badge: BADGE, comma: ctx.comma, depth: ctx.depth + 1 };
        return renderContainer(inner.ast, expandedCtx);
      }
    }
    return '<div class="row"><span class="caret leaf"></span>' + ctx.key + tokenHtml(node) +
      commaHtml(ctx.comma) + '</div>';
  }

  function renderContainer(node, ctx) {
    var open = node.type === 'obj' ? '{' : '[';
    var close = node.type === 'obj' ? '}' : ']';
    var count = node.type === 'obj' ? node.pairs.length : node.items.length;
    var bodyHtml;
    var childDepth = ctx.depth + 1;
    if (node.type === 'obj') {
      bodyHtml = node.pairs.map(function (pr) {
        return renderValue(pr.val, {
          key: keyHtmlOf(pr.key) + colonHtml(pr.colon) + ' ',
          comma: pr.comma, depth: childDepth
        });
      }).join('');
    } else {
      bodyHtml = node.items.map(function (it) {
        return renderValue(it.val, { key: '', comma: it.comma, depth: childDepth });
      }).join('');
    }
    var openSyn = node.open.syn ? ' syn' : '';
    var closeSyn = node.close && node.close.syn ? ' syn' : '';
    var empty = count === 0;
    if (empty) {
      return '<div class="row"><span class="caret leaf"></span>' + ctx.key +
        '<span class="t-punc' + openSyn + '">' + open + '</span>' +
        '<span class="t-punc' + closeSyn + '">' + close + '</span>' +
        (ctx.badge || '') + commaHtml(ctx.comma) + '</div>';
    }
    return '<div class="node">' +
      '<div class="row"><span class="caret">▾</span>' + ctx.key +
      '<span class="t-punc' + openSyn + '"' + (node.open.syn ? ' title="自动补充的括号"' : '') + '>' + open + '</span>' +
      (ctx.badge || '') +
      '<span class="count">' + count + ' 项</span>' +
      '<span class="ellipsis">… ' + close + commaHtml(ctx.comma) + '</span></div>' +
      '<div class="body">' + bodyHtml + '</div>' +
      '<div class="row"><span class="caret leaf"></span><span class="t-punc' + closeSyn + '">' + close + '</span>' + commaHtml(ctx.comma) + '</div>' +
      '</div>';
  }

  function renderTreeFromNorm(norm) {
    var root = norm.ast;
    if (root.type !== 'obj' && root.type !== 'arr') {
      return renderValue(root, { key: '', comma: null, depth: 0 });
    }
    return renderContainer(root, { key: '', comma: null, depth: 0 });
  }

  function renderFiltered(matches) {
    return matches.map(function (m) {
      return '<div class="path-label">' + esc(m.p) + '</div>' +
        renderValue(core.dataToNode(m.v), { key: '', comma: null, depth: 0 });
    }).join('');
  }

  // ---------- format pipeline ----------
  function applyPathFilter(norm) {
    var expr = els.pathInput.value.trim();
    els.pathMsg.textContent = '';
    els.pathMsg.classList.remove('err');
    if (!expr) return null;
    try {
      var steps = core.parsePath(expr);
      var matches = core.queryPath(norm.value, steps);
      if (!matches.length) {
        els.pathMsg.textContent = '无匹配结果';
        return { html: '<div class="empty">JSONPath 没有匹配到任何数据。</div>', text: '' };
      }
      els.pathMsg.textContent = matches.length + ' 处匹配';
      var stringifyKeepBig = function (x) {
        var s = JSON.stringify(x, function (k, v) { return typeof v === 'bigint' ? '\u0000B' + v : v; }, 2);
        return s.replace(/"\u0000B(-?\d+)"/g, '$1');
      };
      var text = matches.length === 1
        ? stringifyKeepBig(matches[0].v)
        : stringifyKeepBig(matches.map(function (m) { return { path: m.p, value: m.v }; }));
      return { html: renderFiltered(matches), text: text };
    } catch (e) {
      els.pathMsg.textContent = e.message;
      els.pathMsg.classList.add('err');
      return null;
    }
  }

  function renderView() {
    if (!state.norm) return;
    state.expanded = 0;
    var filtered = applyPathFilter(state.norm);
    if (filtered) {
      els.tree.innerHTML = filtered.html;
      state.copyText = filtered.text;
    } else {
      els.tree.innerHTML = renderTreeFromNorm(state.norm);
      state.copyText = state.norm.text;
    }
    if (state.expanded) {
      setStatus('已展开 ' + state.expanded + ' 个内嵌 JSON 字符串', 'ok');
    }
  }

  function setStatus(msg, kind) {
    els.status.textContent = msg;
    els.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function loadStats() {
    var st = lsGet(LS.stats, null);
    if (!st || st.date !== today()) st = { date: today(), formats: 0, repairs: 0 };
    return st;
  }
  function renderStats(st) {
    els.statFormats.textContent = String(st.formats);
    els.statRepairs.textContent = String(st.repairs);
  }

  function format(saveToHistory) {
    var raw = els.input.value;
    lsSet(LS.input, raw);
    if (!raw.trim()) {
      state.norm = null;
      els.tree.innerHTML = '<div class="empty">等待输入。</div>';
      setStatus('', '');
      els.pathMsg.textContent = '';
      return;
    }
    var norm = null;
    try { norm = core.normalize(raw); } catch (e) { norm = null; }
    if (!norm) { setStatus('无法解析输入内容', 'err'); return; }
    state.norm = norm;
    state.expanded = 0;
    var parts = [];
    if (norm.synCount) parts.push('自动补充 ' + norm.synCount + ' 处');
    if (norm.removedCount) parts.push('移除无效字符 ' + norm.removedCount + ' 个');
    if (!parts.length) parts.push('语法完整');
    setStatus(parts.join(' · '), norm.synCount || norm.removedCount ? 'warn' : 'ok');
    renderView();
    if (saveToHistory) {
      var st = loadStats();
      st.formats++; st.repairs += norm.synCount;
      lsSet(LS.stats, st); renderStats(st);
      pushHistory(raw);
    }
  }

  // ---------- events ----------
  var debounce = null;
  els.input.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { format(false); }, 600);
  });
  $('#btnFormat').addEventListener('click', function () { format(true); });
  $('#btnClear').addEventListener('click', function () {
    els.input.value = '';
    lsSet(LS.input, '');
    format(false);
  });
  els.pathInput.addEventListener('input', function () { renderView(); });
  els.optExpand.addEventListener('change', renderView);

  els.tree.addEventListener('click', function (ev) {
    var caret = ev.target.closest('.caret');
    if (!caret || caret.classList.contains('leaf')) return;
    var node = caret.closest('.node');
    if (node) node.classList.toggle('collapsed');
  });
  document.querySelectorAll('[data-fold]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var collapse = btn.getAttribute('data-fold') === 'collapse';
      els.tree.querySelectorAll('.node').forEach(function (n) {
        n.classList.toggle('collapsed', collapse);
      });
    });
  });
  function copyToClipboard(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    }
  }
  $('#btnCopy').addEventListener('click', function () {
    if (!state.copyText) return;
    var old = $('#btnCopy').textContent;
    copyToClipboard(state.copyText, function () {
      $('#btnCopy').textContent = '已复制';
      setTimeout(function () { $('#btnCopy').textContent = old; }, 1200);
    });
  });

  // ---------- timer ----------
  var timer = lsGet(LS.timer, null);
  if (!timer || timer.date !== today()) timer = { date: today(), secs: 0 };
  var timerRunning = false, timerHandle = null;

  function renderTimer() {
    els.timerDisplay.textContent = hms(timer.secs);
    els.statTimer.textContent = hms(timer.secs);
  }
  function tickTimer() {
    timer.secs++;
    if (timer.secs % 5 === 0) lsSet(LS.timer, timer);
    renderTimer();
  }
  $('#btnTimerToggle').addEventListener('click', function () {
    timerRunning = !timerRunning;
    this.textContent = timerRunning ? '暂停' : '开始';
    if (timerRunning) timerHandle = setInterval(tickTimer, 1000);
    else { clearInterval(timerHandle); lsSet(LS.timer, timer); }
  });
  $('#btnTimerReset').addEventListener('click', function () {
    timer.secs = 0; lsSet(LS.timer, timer); renderTimer();
  });
  window.addEventListener('beforeunload', function () { lsSet(LS.timer, timer); });
  renderTimer();

  // ---------- timestamp tool ----------
  function toTs(v) { return v >= 1e12 ? v : v * 1000; }
  function fmtLocal(ms, withMs) {
    var d = new Date(ms);
    var s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    return withMs ? s + '.' + String(d.getMilliseconds()).padStart(3, '0') : s;
  }
  var tsEls = {
    now: $('#tsNowStr'), sec: $('#tsSec'), ms: $('#tsMs'),
    input: $('#tsInput'), local: $('#tsLocal'), iso: $('#tsIso')
  };
  function tickNow() {
    var t = Date.now();
    tsEls.now.textContent = fmtLocal(t);
    tsEls.sec.textContent = String(Math.floor(t / 1000));
    tsEls.ms.textContent = String(t);
  }
  tickNow();
  setInterval(tickNow, 1000);

  function convertTs() {
    var raw = tsEls.input.value.trim();
    tsEls.local.classList.remove('clickable');
    tsEls.iso.classList.remove('clickable');
    if (!raw) { tsEls.local.textContent = ''; tsEls.iso.textContent = ''; return; }
    if (!/^\d+$/.test(raw)) {
      tsEls.local.textContent = '仅支持数字时间戳';
      tsEls.iso.textContent = '';
      return;
    }
    var ms = toTs(Number(raw));
    if ((!isFinite(ms) || ms < 0 || ms > 8.64e15) && raw.length >= 15) {
      tsEls.local.textContent = '超出时间戳范围，已按雪花 ID 在下方解析';
      tsEls.iso.textContent = '';
      sfEls.idInput.value = raw;
      parseSf();
      return;
    }
    if (!isFinite(ms) || ms < 0 || ms > 8.64e15) {
      tsEls.local.textContent = '超出可表示范围';
      tsEls.iso.textContent = '';
      return;
    }
    tsEls.local.textContent = fmtLocal(ms, true);
    tsEls.iso.textContent = new Date(ms).toISOString();
    tsEls.local.classList.add('clickable');
    tsEls.iso.classList.add('clickable');
  }
  tsEls.input.addEventListener('input', convertTs);
  $('#btnTsNow').addEventListener('click', function () {
    tsEls.input.value = String(Math.floor(Date.now() / 1000));
    convertTs();
  });

  var tsPick = $('#tsPick'), tsPickSec = $('#tsPickSec'), tsPickMs = $('#tsPickMs');
  function localInputValue(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function convertPick() {
    tsPickSec.classList.remove('clickable');
    tsPickMs.classList.remove('clickable');
    var v = tsPick.value;
    if (!v) { tsPickSec.textContent = ''; tsPickMs.textContent = ''; return; }
    var d = new Date(v);
    if (isNaN(d.getTime())) { tsPickSec.textContent = '时间无效'; tsPickMs.textContent = ''; return; }
    var ms = d.getTime();
    tsPickSec.textContent = String(Math.floor(ms / 1000));
    tsPickMs.textContent = String(ms);
    tsPickSec.classList.add('clickable');
    tsPickMs.classList.add('clickable');
  }
  tsPick.value = localInputValue(new Date());
  convertPick();
  tsPick.addEventListener('input', convertPick);
  $('#btnTsPickNow').addEventListener('click', function () {
    tsPick.value = localInputValue(new Date());
    convertPick();
  });

  function copyFlash(el) {
    el.classList.add('copied');
    setTimeout(function () { el.classList.remove('copied'); }, 900);
  }
  $('.layout').addEventListener('click', function (ev) {
    var val = ev.target.closest('.ts-val.clickable, .sf-id');
    if (!val) return;
    var text = val.textContent.trim();
    if (!text) return;
    copyToClipboard(text, function () { copyFlash(val); });
  });

  // ---------- snowflake ----------
  var SF_DEFAULT_EPOCH = '1288834974657';
  var LS_SF = 'toolbox.snowflake.v1';
  var sfPrefs = lsGet(LS_SF, null) || { epoch: SF_DEFAULT_EPOCH, dc: '1', worker: '1' };
  var sfEls = {
    idInput: $('#sfIdInput'), time: $('#sfTime'), ts: $('#sfTs'),
    dcOut: $('#sfDcOut'), workerOut: $('#sfWorkerOut'), seqOut: $('#sfSeqOut'),
    epochOut: $('#sfEpochOut'), batch: $('#sfBatch'),
    epoch: $('#sfEpoch'), dc: $('#sfDc'), worker: $('#sfWorker'), list: $('#sfList')
  };
  sfEls.epoch.value = sfPrefs.epoch;
  sfEls.dc.value = sfPrefs.dc;
  sfEls.worker.value = sfPrefs.worker;

  function sfClamp2(v) { var n = parseInt(v, 10); return (isNaN(n) || n < 0) ? 0 : Math.min(31, n); }
  function getSfEpoch() {
    var raw = sfEls.epoch.value.trim() || SF_DEFAULT_EPOCH;
    try { var e = BigInt(raw); return e; } catch (err) { return BigInt(SF_DEFAULT_EPOCH); }
  }
  function saveSfPrefs() {
    sfPrefs = { epoch: sfEls.epoch.value.trim() || SF_DEFAULT_EPOCH, dc: sfEls.dc.value, worker: sfEls.worker.value };
    lsSet(LS_SF, sfPrefs);
  }
  function setSfOut(el, text, copyable) {
    el.textContent = text;
    el.classList.toggle('clickable', !!copyable);
  }
  function parseSf() {
    var raw = sfEls.idInput.value.trim();
    sfCalib.hidden = true;
    sfEls.batch.hidden = true;
    sfLastDelta = null;
    [sfEls.time, sfEls.ts, sfEls.dcOut, sfEls.workerOut, sfEls.seqOut, sfEls.epochOut].forEach(function (el) { setSfOut(el, '', false); });
    if (!raw) return;
    if (!/^\d+$/.test(raw)) { renderSfBatch(raw); return; }
    var id;
    try { id = BigInt(raw); } catch (e) { return; }
    if (id >> 22n >= (1n << 41n)) { setSfOut(sfEls.time, '超出 41 位时间范围', false); return; }
    var epoch = getSfEpoch();
    var ms = (id >> 22n) + epoch;
    if (ms < 0n || ms > 8640000000000000n) { setSfOut(sfEls.time, '起始时间戳与 ID 不匹配', false); return; }
    var msNum = Number(ms);
    setSfOut(sfEls.time, fmtLocal(msNum, true), true);
    setSfOut(sfEls.ts, String(msNum), true);
    setSfOut(sfEls.dcOut, String((id >> 17n) & 31n), true);
    setSfOut(sfEls.workerOut, String((id >> 12n) & 31n), true);
    setSfOut(sfEls.seqOut, String(id & 4095n), true);
    setSfOut(sfEls.epochOut, String(epoch), true);
    sfLastDelta = id >> 22n;
    sfCalibTime.value = localInputValue(new Date(msNum));
    sfCalib.hidden = false;
  }
  var sfCalib = $('#sfCalib'), sfCalibTime = $('#sfCalibTime'), sfLastDelta = null;
  $('#btnSfCalib').addEventListener('click', function () {
    if (sfLastDelta == null || !sfCalibTime.value) return;
    var real = new Date(sfCalibTime.value).getTime();
    if (isNaN(real)) return;
    var e = BigInt(real) - sfLastDelta;
    if (e < 0n || e > BigInt(8640000000000000)) return;
    sfEls.epoch.value = e.toString();
    saveSfPrefs();
    parseSf();
  });
  function extractSfIds(text) {
    var runs = text.match(/\d+/g) || [];
    var seen = {}, out = [];
    runs.forEach(function (r) {
      if (r.length >= 15 && r.length <= 19 && !seen[r]) { seen[r] = 1; out.push(r); }
    });
    return out.slice(0, 100);
  }
  function renderSfBatch(text) {
    var ids = extractSfIds(text);
    if (!ids.length) {
      setSfOut(sfEls.time, '未找到 15–19 位数字 ID', false);
      return;
    }
    var epoch = getSfEpoch();
    sfEls.batch.innerHTML = '<div class="sf-batch-head">从文本中提取到 ' + ids.length + ' 个 ID（按当前纪元解析，点击 ID 复制）</div>' +
      ids.map(function (s) {
        var id = BigInt(s), timeTxt, metaTxt = '';
        if (id >> 22n >= (1n << 41n)) {
          timeTxt = '超出 41 位时间范围';
        } else {
          var ms = (id >> 22n) + epoch;
          if (ms < 0n || ms > 8640000000000000n) {
            timeTxt = '纪元与 ID 不匹配';
          } else {
            timeTxt = fmtLocal(Number(ms), true);
            metaTxt = 'dc ' + Number((id >> 17n) & 31n) + ' · w ' + Number((id >> 12n) & 31n) + ' · seq ' + Number(id & 4095n);
          }
        }
        return '<div class="sf-batch-row"><span class="sf-id" title="点击复制">' + s + '</span>' +
          '<span class="sf-batch-time">' + esc(timeTxt) + '</span>' +
          '<span class="sf-batch-meta">' + metaTxt + '</span></div>';
      }).join('');
    sfEls.batch.hidden = false;
  }
  sfEls.idInput.addEventListener('input', parseSf);
  $('#btnSfParse').addEventListener('click', parseSf);
  [sfEls.epoch, sfEls.dc, sfEls.worker].forEach(function (el) {
    el.addEventListener('change', saveSfPrefs);
  });

  function genSf(n) {
    var epoch = getSfEpoch();
    var dc = BigInt(sfClamp2(sfEls.dc.value)), w = BigInt(sfClamp2(sfEls.worker.value));
    var base = Date.now();
    if (BigInt(base) < epoch) {
      sfEls.list.innerHTML = '<div class="history-empty">生成时间早于起始时间戳</div>';
      return;
    }
    var ids = [];
    for (var i = 0; i < n; i++) {
      var ms = BigInt(base + Math.floor(i / 4096));
      var seq = BigInt(i % 4096);
      ids.push((((ms - epoch) << 22n) | (dc << 17n) | (w << 12n) | seq).toString());
    }
    sfEls.list.innerHTML =
      '<div class="sf-note">基于 ' + esc(fmtLocal(base)) + ' · 纪元 ' + epoch.toString() +
      ' · 数据中心 ' + String(dc) + ' · 机器位 ' + String(w) + '</div>' +
      ids.map(function (x) {
        return '<div class="sf-id" title="点击复制">' + esc(x) + '</div>';
      }).join('');
  }
  $('#btnSfGen').addEventListener('click', function () { genSf(5); });

  // ---------- tabs ----------
  var LS_TAB = 'toolbox.tab.v1';
  var panels = { json: $('#panelJson'), regex: $('#panelRegex'), qr: $('#panelQr'), tools: $('#panelTools') };
  var histCard = $('.history-card');
  var activeTab = 'json';
  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== name; });
    histCard.hidden = name !== 'json';
    lsSet(LS_TAB, name);
    if (name === 'regex') runRegex();
    else if (name === 'qr') ensureQrLibs().then(runQrGen).catch(function () {});
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); });
  });

  // ---------- regex ----------
  var LS_RE = 'toolbox.regex.v1';
  var rePrefs = lsGet(LS_RE, null) || { pattern: '', text: '', flags: 'g' };
  var reEls = {
    pattern: $('#rePattern'), text: $('#reText'), status: $('#reStatus'),
    count: $('#reCount'), preview: $('#rePreview'), result: $('#reResult')
  };
  reEls.pattern.value = rePrefs.pattern || '';
  reEls.text.value = rePrefs.text || '';
  document.querySelectorAll('.re-flags input').forEach(function (cb) {
    cb.checked = (rePrefs.flags || 'g').indexOf(cb.getAttribute('data-flag')) >= 0;
  });
  var reMatches = [];

  function reFlags() {
    var f = '';
    document.querySelectorAll('.re-flags input:checked').forEach(function (cb) { f += cb.getAttribute('data-flag'); });
    return f;
  }
  function runRegex() {
    lsSet(LS_RE, { pattern: reEls.pattern.value, text: reEls.text.value, flags: reFlags() });
    reEls.result.innerHTML = '';
    reEls.preview.innerHTML = '';
    reEls.count.textContent = '';
    reMatches = [];
    var pat = reEls.pattern.value;
    if (!pat) { reEls.status.textContent = ''; reEls.status.className = 'status'; return; }
    var flags = reFlags();
    var re;
    try { re = new RegExp(pat, flags); }
    catch (e) {
      reEls.status.className = 'status err';
      reEls.status.textContent = '语法错误：' + e.message;
      return;
    }
    var text = reEls.text.value;
    if (text) {
      var m, guard = 0;
      if (flags.indexOf('g') >= 0) {
        while ((m = re.exec(text)) !== null && guard < 5000) {
          reMatches.push({ arr: m.slice(), groups: m.groups, start: m.index, len: m[0].length });
          if (m[0] === '') re.lastIndex++;
          guard++;
        }
      } else {
        m = re.exec(text);
        if (m) reMatches.push({ arr: m.slice(), groups: m.groups, start: m.index, len: m[0].length });
      }
    }
    reEls.status.className = 'status ' + (reMatches.length ? 'ok' : 'warn');
    reEls.status.textContent = '语法有效 /' + pat + '/' + flags +
      (text ? ' · ' + reMatches.length + ' 处匹配' : ' · 未填测试文本');
    reEls.count.textContent = text && reMatches.length ? '共 ' + reMatches.length + ' 处' : '';

    if (text && reMatches.length) {
      var LIMIT = 4000;
      var src = text.slice(0, LIMIT);
      var html = '', pos = 0;
      reMatches.forEach(function (r) {
        if (r.start >= src.length) return;
        html += esc(src.slice(pos, r.start)) + '<mark>' + esc(src.slice(r.start, r.start + r.len)) + '</mark>';
        pos = r.start + r.len;
      });
      html += esc(src.slice(pos)) + (text.length > LIMIT ? '<span class="re-more">…（预览截断，完整结果见下方列表）</span>' : '');
      reEls.preview.innerHTML = html;
    }

    if (text && !reMatches.length) {
      reEls.result.innerHTML = '<div class="history-empty">当前表达式在测试文本中没有匹配。</div>';
    }
    reEls.result.innerHTML += reMatches.map(function (r, i) {
      var rows = '<div class="re-line"><span class="re-tag">全文</span><span class="re-val" title="点击复制">' + esc(r.arr[0]) + '</span></div>';
      for (var g = 1; g < r.arr.length; g++) {
        rows += '<div class="re-line"><span class="re-tag">组 ' + g + '</span><span class="re-val" title="点击复制">' +
          (r.arr[g] === undefined ? '<span class="re-none">未匹配</span>' : esc(r.arr[g])) + '</span></div>';
      }
      if (r.groups) {
        Object.keys(r.groups).forEach(function (k) {
          rows += '<div class="re-line"><span class="re-tag">' + esc(k) + '</span><span class="re-val" title="点击复制">' +
            (r.groups[k] === undefined ? '<span class="re-none">未匹配</span>' : esc(r.groups[k])) + '</span></div>';
        });
      }
      return '<div class="re-card"><div class="re-card-head">#' + (i + 1) + ' · 位置 ' + r.start + '–' + (r.start + r.len) + '</div>' + rows + '</div>';
    }).join('');
  }
  var reDebounce = null;
  [reEls.pattern, reEls.text].forEach(function (el) {
    el.addEventListener('input', function () { clearTimeout(reDebounce); reDebounce = setTimeout(runRegex, 300); });
  });
  document.querySelectorAll('.re-flags input').forEach(function (cb) {
    cb.addEventListener('change', runRegex);
  });
  $('#btnReClear').addEventListener('click', function () { reEls.text.value = ''; runRegex(); });
  $('#btnReCopyAll').addEventListener('click', function () {
    var all = reMatches.map(function (r) { return r.arr[0]; }).join('\n');
    if (!all) return;
    var btn = $('#btnReCopyAll'), old = btn.textContent;
    copyToClipboard(all, function () {
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    });
  });
  reEls.result.addEventListener('click', function (ev) {
    var val = ev.target.closest('.re-val');
    if (!val) return;
    copyToClipboard(val.textContent, function () { copyFlash(val); });
  });

  // ---------- QR libs (lazy, loaded on first visit of the QR tab) ----------
  var qrLibsPromise = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureQrLibs() {
    if (!qrLibsPromise) {
      qrLibsPromise = Promise.all([loadScript('jsqr.min.js'), loadScript('qrcode-gen.min.js')])
        .catch(function (e) { qrLibsPromise = null; throw e; });
    }
    return qrLibsPromise;
  }

  // ---------- QR decode ----------
  var qrEls = {
    file: $('#qrFile'), drop: $('#qrDrop'), status: $('#qrStatus'),
    imgBox: $('#qrImgBox'), img: $('#qrImg'), text: $('#qrText')
  };
  var qrText = '', qrUrl = null;
  function qrStatus(msg, kind) {
    qrEls.status.textContent = msg;
    qrEls.status.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setQrResult(msg, kind) {
    qrEls.text.textContent = msg || '';
    qrEls.text.classList.toggle('clickable', !!msg && kind === 'ok');
  }
  function decodeQrFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { qrStatus('请选择图片文件（PNG / JPG / WebP…）', 'err'); setQrResult('', ''); return; }
    if (!window.jsQR) {
      qrStatus('解码组件加载中…', '');
      ensureQrLibs().then(function () { decodeQrFile(file); },
        function () { qrStatus('解码组件加载失败，请重试', 'err'); });
      return;
    }
    qrStatus('正在解码…', '');
    setQrResult('', '');
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
      qrUrl = url;
      qrEls.img.src = url;
      qrEls.imgBox.hidden = false;
      var w = img.naturalWidth, h = img.naturalHeight;
      var maxSide = Math.max(w, h), scale = maxSide > 2048 ? 2048 / maxSide : 1;
      var up = Math.max(w, h) < 320 ? 2 : 1;
      var cw = Math.max(1, Math.round(w * scale * up)), ch = Math.max(1, Math.round(h * scale * up));
      var cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, cw, ch);
      var t0 = Date.now(), result = null;
      try {
        var data = ctx.getImageData(0, 0, cw, ch);
        result = jsQR(data.data, cw, ch, { inversionAttempts: 'attemptBoth' });
      } catch (e) { qrStatus('解码异常：' + e.message, 'err'); return; }
      if (result && result.data) {
        qrText = result.data;
        setQrResult(qrText, 'ok');
        qrStatus('识别成功 · ' + qrText.length + ' 字符 · 原图 ' + w + '×' + h + ' · 用时 ' + (Date.now() - t0) + 'ms', 'ok');
      } else {
        qrText = '';
        qrStatus('未识别到二维码，试试裁剪空白区域或换更清晰的图', 'warn');
      }
    };
    img.onerror = function () { URL.revokeObjectURL(url); qrStatus('图片读取失败', 'err'); };
    img.src = url;
  }
  qrEls.file.addEventListener('change', function () {
    decodeQrFile(qrEls.file.files[0]);
    qrEls.file.value = '';
  });
  qrEls.drop.addEventListener('dragover', function (ev) { ev.preventDefault(); qrEls.drop.classList.add('drag'); });
  qrEls.drop.addEventListener('dragleave', function () { qrEls.drop.classList.remove('drag'); });
  qrEls.drop.addEventListener('drop', function (ev) {
    ev.preventDefault();
    qrEls.drop.classList.remove('drag');
    var f = ev.dataTransfer.files && ev.dataTransfer.files[0];
    decodeQrFile(f);
  });
  qrEls.drop.addEventListener('click', function () { qrEls.file.click(); });
  document.addEventListener('paste', function (ev) {
    if (activeTab !== 'qr') return;
    var items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        var f = items[i].getAsFile();
        if (f) { ev.preventDefault(); decodeQrFile(f); }
        return;
      }
    }
  });
  qrEls.text.addEventListener('click', function () {
    if (!qrText) return;
    copyToClipboard(qrText, function () {
      qrEls.text.classList.add('copied');
      setTimeout(function () { qrEls.text.classList.remove('copied'); }, 900);
    });
  });
  $('#btnQrCopy').addEventListener('click', function () {
    if (!qrText) return;
    var btn = $('#btnQrCopy'), old = btn.textContent;
    copyToClipboard(qrText, function () {
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    });
  });
  $('#btnQrClear').addEventListener('click', function () {
    qrText = '';
    if (qrUrl) { URL.revokeObjectURL(qrUrl); qrUrl = null; }
    qrEls.imgBox.hidden = true;
    qrEls.img.removeAttribute('src');
    setQrResult('', '');
    qrStatus('', '');
  });

  // ---------- QR generate ----------
  var LS_QRGEN = 'toolbox.qrgen.v1';
  var genPrefs = lsGet(LS_QRGEN, null) || { text: '', ec: 'M', size: 'm' };
  var genEls = {
    text: $('#qrGenText'), ec: $('#qrGenEc'), size: $('#qrGenSize'),
    status: $('#qrGenStatus'), box: $('#qrGenBox')
  };
  genEls.text.value = genPrefs.text || '';
  genEls.ec.value = genPrefs.ec || 'M';
  genEls.size.value = genPrefs.size || 'm';
  var qrGenCanvas = null;

  function genStatus(msg, kind) {
    genEls.status.textContent = msg;
    genEls.status.className = 'status' + (kind ? ' ' + kind : '');
  }
  function buildQrCanvas(qr, cell) {
    var count = qr.getModuleCount();
    var margin = 4;
    var px = (count + margin * 2) * cell;
    var cv = document.createElement('canvas');
    cv.width = px; cv.height = px;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
      }
    }
    return cv;
  }
  function runQrGen() {
    lsSet(LS_QRGEN, { text: genEls.text.value, ec: genEls.ec.value, size: genEls.size.value });
    var text = genEls.text.value;
    qrGenCanvas = null;
    if (!text) {
      genEls.box.innerHTML = '<span class="history-empty">输入内容后自动生成</span>';
      genStatus('', '');
      return;
    }
    var cell = genEls.size.value === 's' ? 4 : genEls.size.value === 'l' ? 10 : 6;
    if (!window.qrcode) {
      genStatus('二维码组件加载中…', '');
      ensureQrLibs().then(runQrGen, function () { genStatus('二维码组件加载失败', 'err'); });
      return;
    }
    try {
      var qr = window.qrcode(0, genEls.ec.value);
      // qrcode-generator 的 Byte 模式按 charCodeAt&0xFF 取字节，先转成 UTF-8 拉丁字符串保证中文正确
      var utf8 = new TextEncoder().encode(text);
      var binStr = '';
      for (var bi = 0; bi < utf8.length; bi++) binStr += String.fromCharCode(utf8[bi]);
      qr.addData(binStr, 'Byte');
      qr.make();
      var cv = buildQrCanvas(qr, cell);
      genEls.box.innerHTML = '';
      genEls.box.appendChild(cv);
      qrGenCanvas = cv;
      genStatus('已生成 · ' + text.length + ' 字符 · ' + qr.getModuleCount() + '×' + qr.getModuleCount() +
        ' 模块 · 容错 ' + genEls.ec.value + ' · 图片 ' + cv.width + 'px', 'ok');
    } catch (e) {
      genEls.box.innerHTML = '<span class="history-empty">生成失败</span>';
      genStatus('生成失败：' + ((e && e.message) || '内容过长或含不支持字符'), 'err');
    }
  }
  var genDebounce = null;
  genEls.text.addEventListener('input', function () {
    clearTimeout(genDebounce); genDebounce = setTimeout(runQrGen, 300);
  });
  genEls.ec.addEventListener('change', runQrGen);
  genEls.size.addEventListener('change', runQrGen);
  $('#btnQrDownload').addEventListener('click', function () {
    if (!qrGenCanvas) return;
    qrGenCanvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qrcode.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  });
  $('#btnQrCopyImg').addEventListener('click', function () {
    if (!qrGenCanvas || !(navigator.clipboard && window.ClipboardItem)) {
      genStatus('当前浏览器不支持复制图片，请用下载 PNG', 'warn');
      return;
    }
    qrGenCanvas.toBlob(function (blob) {
      if (!blob) return;
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(
        function () { genStatus('图片已复制到剪贴板', 'ok'); },
        function () { genStatus('复制失败，请改用下载 PNG', 'err'); }
      );
    }, 'image/png');
  });
  // gen runs when the QR tab is first opened (see switchTab), keeping libs lazy

  // ---------- init ----------
  $('#todayDate').textContent = today() + ' · 数据仅保存在本机浏览器';
  renderStats(loadStats());
  var savedInput = lsGet(LS.input, '');
  if (savedInput) els.input.value = savedInput;
  renderHistory();
  format(false);
  switchTab(lsGet(LS_TAB, 'json'));
})();
