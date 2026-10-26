(function (global) {
  'use strict';

  function synTok(type, value) {
    return { type: type, value: value, syn: true };
  }

  // ---------- lenient tokenizer ----------
  function tokenize(src) {
    var tokens = [];
    var i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '{' || c === '}' || c === '[' || c === ']' || c === ':' || c === ',' || c === ';') {
        tokens.push({ type: c, raw: c, pos: i }); i++; continue;
      }
      if (c === '"' || c === "'") {
        var q = c, j = i + 1, buf = '', closed = false;
        while (j < n) {
          var ch = src[j];
          if (ch === '\\' && j + 1 < n) {
            var nx = src[j + 1];
            if (nx === 'n') { buf += '\n'; j += 2; }
            else if (nx === 't') { buf += '\t'; j += 2; }
            else if (nx === 'r') { buf += '\r'; j += 2; }
            else if (nx === 'b') { buf += '\b'; j += 2; }
            else if (nx === 'f') { buf += '\f'; j += 2; }
            else if (nx === 'u' && /^[0-9a-fA-F]{4}/.test(src.slice(j + 2, j + 6))) {
              buf += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6;
            } else { buf += nx; j += 2; }
            continue;
          }
          if (ch === q) { closed = true; j++; break; }
          buf += ch; j++;
        }
        tokens.push({ type: 'str', value: buf, raw: src.slice(i, j), closed: closed, pos: i });
        i = j; continue;
      }
      if (/[0-9]/.test(c) || ((c === '-' || c === '+') && /[0-9.]/.test(src[i + 1] || ''))) {
        var m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(src.slice(i));
        if (m) { tokens.push({ type: 'num', value: m[0], raw: m[0], pos: i }); i += m[0].length; continue; }
      }
      if (/[A-Za-z_$\u00a0-\uffff]/.test(c)) {
        var w = /^[A-Za-z0-9_$\u00a0-\uffff]+/.exec(src.slice(i))[0];
        if (w === 'true' || w === 'false' || w === 'null') tokens.push({ type: w, raw: w, pos: i });
        else tokens.push({ type: 'id', value: w, raw: w, pos: i });
        i += w.length; continue;
      }
      tokens.push({ type: 'bad', value: c, raw: c, pos: i });
      i++;
    }
    return tokens;
  }

  function unescapeSequences(s) {
    return s
      .replace(/\\u([0-9a-fA-F]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/\\(["'\\nrtbf/])/g, function (m, c) {
        if (c === 'n') return '\n';
        if (c === 't') return '\t';
        if (c === 'r') return '\r';
        if (c === 'b') return '\b';
        if (c === 'f') return '\f';
        return c;
      });
  }

  // ---------- repair tokens into an AST ----------
  // AST node kinds:
  //   {type:'obj', open, pairs:[{key, colon, val, comma}], close}
  //   {type:'arr', open, items:[{val, comma}], close}
  //   scalar token: {type:'str'|'num'|'true'|'false'|'null'|'id'|'bad', ...}
  function repair(tokens, src) {
    var p = 0, synCount = 0, removedCount = 0;
    function peek() { return tokens[p]; }
    function eat() { return tokens[p++]; }
    function syn(type, value) { synCount++; return synTok(type, value); }
    function rawSpan(t) {
      var stop = src.length, depth = 0;
      for (var k = t.pos; k < src.length; k++) {
        var c = src.charAt(k);
        if (c === '[' || c === '{' || c === '(') { depth++; continue; }
        if (c === ']' || c === ')' ) { if (depth > 0) depth--; continue; }
        if (c === '}') { if (depth > 0) { depth--; continue; } stop = k; break; }
        if (depth === 0 && (c === ',' || c === ';' || c === '\n' || c === '\r')) { stop = k; break; }
      }
      var span = src.slice(t.pos, stop).trim();
      if (!span || span === t.raw) return null;
      while (peek() && peek().pos < stop) p++;
      return { type: 'str', value: span, raw: span };
    }
    function parseValue() {
      var t = peek();
      if (!t || t.type === '}' || t.type === ']' || t.type === ',' || t.type === ':' || t.type === ';') {
        return syn('null', null);
      }
      if (t.type === '{') { eat(); return parseObject(t); }
      if (t.type === '[') { eat(); return parseArray(t); }
      if (src && (t.type === 'id' || t.type === 'bad' || t.type === 'num')) {
        var rv = rawSpan(t);
        if (rv) return rv;
      }
      return eat();
    }
    function parseObject(open) {
      var node = { type: 'obj', open: open, pairs: [], close: null };
      for (;;) {
        var t = peek();
        if (!t) { node.close = syn('}', '}'); break; }
        if (t.type === '}') { node.close = eat(); break; }
        if (t.type === ']') { removedCount++; eat(); continue; }
        if (t.type === ',' || t.type === ';') { eat(); continue; }
        if (t.type === ':' || t.type === 'bad') { eat(); continue; }
        var key = eat();
        if (key.type === 'id' || key.type === 'num' || key.type === 'true' || key.type === 'false' || key.type === 'null') {
          key = {
            type: 'str', value: String(key.value === undefined ? key.type : key.value),
            raw: key.raw, bareKey: true
          };
        }
        var colon;
        var nt = peek();
        if (nt && nt.type === ':') colon = eat(); else colon = syn(':', ':');
        var prevP = p;
        var val = parseValue();
        if (p === prevP) { removedCount++; eat(); }
        node.pairs.push({ key: key, colon: colon, val: val });
        var st = peek();
        if (st && (st.type === ',' || st.type === ';')) { eat(); continue; }
        if (st && st.type === '}') { node.close = eat(); break; }
        if (!st) { node.close = syn('}', '}'); break; }
        if (st.type === ']') { removedCount++; node.close = syn('}', '}'); break; }
        node.pairs[node.pairs.length - 1].comma = syn(',', ',');
      }
      return node;
    }
    function parseArray(open) {
      var node = { type: 'arr', open: open, items: [], close: null };
      for (;;) {
        var t = peek();
        if (!t) { node.close = syn(']', ']'); break; }
        if (t.type === ']') { node.close = eat(); break; }
        if (t.type === '}') { removedCount++; eat(); continue; }
        if (t.type === ',' || t.type === ';') { eat(); continue; }
        var prevA = p;
        var val = parseValue();
        if (p === prevA) { removedCount++; eat(); }
        node.items.push({ val: val });
        var st = peek();
        if (st && (st.type === ',' || st.type === ';')) { eat(); continue; }
        if (st && st.type === ']') { node.close = eat(); break; }
        if (!st) { node.close = syn(']', ']'); break; }
        if (st.type === '}') { removedCount++; node.close = syn(']', ']'); break; }
        node.items[node.items.length - 1].comma = syn(',', ',');
      }
      return node;
    }
    var first = parseValue();
    while (peek() && (peek().type === ',' || peek().type === ';' || peek().type === 'bad')) eat();
    if (peek()) {
      var items = [{ val: first, comma: null }];
      var cur = first;
      while (peek()) {
        var t = peek();
        if (t.type === ',' || t.type === ';') { eat(); continue; }
        var prevT = p;
        var nextVal = parseValue();
        if (p === prevT) { removedCount++; eat(); continue; }
        if (nextVal === cur) break;
        cur.comma = syn(',', ',');
        cur = nextVal;
        items.push({ val: nextVal });
      }
      return {
        ast: { type: 'arr', open: syn('[', '['), items: items, close: syn(']', ']') },
        synCount: synCount, removedCount: removedCount
      };
    }
    return { ast: first, synCount: synCount, removedCount: removedCount };
  }

  function keyText(key) {
    if (key.type === 'str') return key.value;
    return String(key.value === undefined ? key.type : key.value);
  }
  function numLiteral(raw) {
    return /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(raw) ? raw : String(Number(raw));
  }
  function scalarText(tok) {
    if (tok.type === 'str') return JSON.stringify(tok.value);
    if (tok.type === 'id' || tok.type === 'bad') return JSON.stringify(String(tok.value));
    if (tok.type === 'num') {
      var nv = Number(tok.value);
      return isFinite(nv) ? numLiteral(String(tok.value).trim()) : JSON.stringify(tok.value);
    }
    return tok.type; // true / false / null
  }

  function astToText(node, ind) {
    ind = ind || '';
    var inner = ind + '  ';
    if (node.type === 'obj') {
      if (!node.pairs.length) return '{}';
      var lines = node.pairs.map(function (pr) {
        return inner + JSON.stringify(keyText(pr.key)) + ': ' + valueText(pr.val, inner);
      });
      return '{\n' + lines.join(',\n') + '\n' + ind + '}';
    }
    if (node.type === 'arr') {
      if (!node.items.length) return '[]';
      return '[\n' + node.items.map(function (it) {
        return inner + valueText(it.val, inner);
      }).join(',\n') + '\n' + ind + ']';
    }
    return '';
  }
  function valueText(node, ind) {
    if (node && (node.type === 'obj' || node.type === 'arr')) return astToText(node, ind);
    return scalarText(node);
  }

  function astToValue(node) {
    if (!node) return null;
    if (node.type === 'obj') {
      var o = {};
      node.pairs.forEach(function (pr) { o[keyText(pr.key)] = valueToVal(pr.val); });
      return o;
    }
    if (node.type === 'arr') {
      return node.items.map(function (it) { return valueToVal(it.val); });
    }
    return valueToVal(node);
  }
  function valueToVal(node) {
    if (node.type === 'obj' || node.type === 'arr') return astToValue(node);
    if (node.type === 'str') return node.value;
    if (node.type === 'num') {
      var nv = Number(node.value);
      if (!Number.isSafeInteger(nv) && /^-?\d+$/.test(String(node.value).trim())) {
        try { return BigInt(String(node.value).trim()); } catch (e) { return nv; }
      }
      return nv;
    }
    if (node.type === 'true') return true;
    if (node.type === 'false') return false;
    if (node.type === 'null') return null;
    return String(node.value === undefined ? '' : node.value);
  }

  // ---------- input normalisation: unescape + strip wrapping quotes ----------
  function normalize(raw) {
    var s = (raw || '').trim();
    if (!s) return null;
    var candidates = [s];
    var q = s.charAt(0), last = s.charAt(s.length - 1);
    var wrapped = (q === '"' || q === "'" || q === '`') &&
      (last === q || /[}\]]["'`]\s*$/.test(s));
    if (wrapped) {
      candidates.unshift(unescapeSequences(s.replace(/^["'`]/, '').replace(/["'`]\s*$/, '')));
    }
    if (/\\"/.test(s) || /\\n/.test(s)) candidates.push(unescapeSequences(s));
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var r = repair(tokenize(c), c);
      var cost = r.synCount + r.removedCount * 2;
      if (!best || cost < best.cost) {
        best = { ast: r.ast, synCount: r.synCount, removedCount: r.removedCount, cost: cost, source: c };
      }
      if (cost === 0) break;
    }
    best.value = astToValue(best.ast);
    best.text = astToText(best.ast);
    return best;
  }

  function looksLikeJson(s) {
    if (typeof s !== 'string') return false;
    var t = s.trim();
    return (t.length > 1 && (t.charAt(0) === '{' || t.charAt(0) === '['));
  }

  // ---------- data -> AST (for filtered views, no repair marks) ----------
  function dataToNode(v) {
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        return {
          type: 'arr', open: { type: '[' }, close: { type: ']' },
          items: v.map(function (x) { return { val: dataToNode(x) }; })
        };
      }
      return {
        type: 'obj', open: { type: '{' }, close: { type: '}' },
        pairs: Object.keys(v).map(function (k) {
          return { key: { type: 'str', value: k }, colon: { type: ':' }, val: dataToNode(v[k]) };
        })
      };
    }
    if (typeof v === 'string') return { type: 'str', value: v };
    if (typeof v === 'number') return { type: 'num', value: String(v) };
    if (typeof v === 'bigint') return { type: 'num', value: v.toString() };
    if (v === true || v === false) return { type: v ? 'true' : 'false' };
    return { type: 'null', value: null };
  }

  // ---------- JSONPath subset: $ .name ['name'] [0] [*] ..name ----------
  function parsePath(expr) {
    var s = (expr || '').trim();
    if (!s) return null;
    var steps = [];
    var i = (s.charAt(0) === '$') ? 1 : 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '.') {
        i++;
        if (s.charAt(i) === '.') {
          i++;
          var dm = /^[^.[\]]+/.exec(s.slice(i));
          if (!dm) throw new Error('递归路径缺少属性名：' + expr);
          steps.push({ kind: 'deep', name: dm[0] });
          i += dm[0].length;
        } else {
          var nm = /^[^.[\]]+/.exec(s.slice(i));
          if (!nm) throw new Error('路径格式错误：' + expr);
          steps.push({ kind: 'child', name: nm[0] });
          i += nm[0].length;
        }
      } else if (c === '[') {
        var end = s.indexOf(']', i);
        if (end < 0) throw new Error('路径缺少 ]：' + expr);
        var inner = s.slice(i + 1, end).trim();
        if (inner === '*') steps.push({ kind: 'all' });
        else if (/^\d+$/.test(inner)) steps.push({ kind: 'index', idx: parseInt(inner, 10) });
        else if (/^(['"]).*\1$/.test(inner)) steps.push({ kind: 'child', name: inner.slice(1, -1) });
        else throw new Error('不支持的表达式：[' + inner + ']');
        i = end + 1;
      } else {
        var fm = /^[^.[\]]+/.exec(s.slice(i));
        if (!fm) throw new Error('路径格式错误：' + expr);
        steps.push({ kind: 'child', name: fm[0] });
        i += fm[0].length;
      }
    }
    return steps;
  }

  function collectDeep(out, v, path, name) {
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        v.forEach(function (x, k) {
          if (x && typeof x === 'object') collectDeep(out, x, path + '[' + k + ']', name);
        });
      } else {
        Object.keys(v).forEach(function (k) {
          if (k === name) out.push({ p: path + '.' + k, v: v[k] });
          collectDeep(out, v[k], path + '.' + k, name);
        });
      }
    }
  }

  function queryPath(value, steps) {
    var cur = [{ p: '$', v: value }];
    for (var s = 0; s < steps.length; s++) {
      var st = steps[s], out = [];
      for (var i = 0; i < cur.length; i++) {
        var node = cur[i], v = node.v;
        if (st.kind === 'child') {
          if (v && typeof v === 'object' && !Array.isArray(v) &&
              Object.prototype.hasOwnProperty.call(v, st.name)) {
            out.push({ p: node.p + '.' + st.name, v: v[st.name] });
          } else if (Array.isArray(v) && /^\d+$/.test(st.name) && +st.name < v.length) {
            out.push({ p: node.p + '[' + st.name + ']', v: v[+st.name] });
          }
        } else if (st.kind === 'index') {
          if (Array.isArray(v) && st.idx < v.length) out.push({ p: node.p + '[' + st.idx + ']', v: v[st.idx] });
          else if (v && typeof v === 'object' && !Array.isArray(v) && Object.prototype.hasOwnProperty.call(v, String(st.idx))) {
            out.push({ p: node.p + '.' + st.idx, v: v[String(st.idx)] });
          }
        } else if (st.kind === 'all') {
          if (Array.isArray(v)) v.forEach(function (x, k) { out.push({ p: node.p + '[' + k + ']', v: x }); });
          else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { out.push({ p: node.p + '.' + k, v: v[k] }); });
        } else if (st.kind === 'deep') {
          collectDeep(out, v, node.p, st.name);
        }
      }
      cur = out;
      if (!cur.length) break;
    }
    return cur;
  }

  // ---------- line diff ----------
  function diffLines(a, b, limit) {
    limit = limit || 2500;
    var truncated = a.length > limit || b.length > limit;
    a = a.slice(0, limit); b = b.slice(0, limit);
    var n = a.length, m = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Uint32Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var rows = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { rows.push({ l: i + 1, r: j + 1, lt: a[i], rt: b[j], kind: 'same' }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ l: i + 1, r: null, lt: a[i], rt: null, kind: 'del' }); i++; }
      else { rows.push({ l: null, r: j + 1, lt: null, rt: b[j], kind: 'add' }); j++; }
    }
    while (i < n) { rows.push({ l: i + 1, r: null, lt: a[i], rt: null, kind: 'del' }); i++; }
    while (j < m) { rows.push({ l: null, r: j + 1, lt: null, rt: b[j], kind: 'add' }); j++; }
    var changed = rows.filter(function (r) { return r.kind !== 'same'; }).length;
    return { rows: rows, changed: changed, truncated: truncated };
  }

  global.JSONCore = {
    tokenize: tokenize,
    repair: repair,
    normalize: normalize,
    looksLikeJson: looksLikeJson,
    dataToNode: dataToNode,
    parsePath: parsePath,
    queryPath: queryPath,
    diffLines: diffLines,
    astToText: astToText,
    numLiteral: numLiteral
  };
})(typeof window !== 'undefined' ? window : globalThis);
