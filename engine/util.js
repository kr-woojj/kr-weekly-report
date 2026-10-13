/* 주간보고 변환기 — 공통 도우미 (DOM·날짜·문자열). 브라우저·Node 공용 (전역 WBR 네임스페이스). */
(function (WBR) {
  'use strict';
  const U = {};

  // ---------- DOM ----------
  U.parseXml = function (text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const err = doc.getElementsByTagName('parsererror');
    if (err.length) throw new Error('XML 파싱 실패: ' + (err[0].textContent || '').slice(0, 200));
    return doc;
  };
  U.serializeXml = function (root) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(root);
  };
  U.children = function (el) {          // 요소 자식만(텍스트·주석 제외)
    const out = [];
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n);
    return out;
  };
  U.childrenNS = function (el, ns, local) {
    return U.children(el).filter(c => c.namespaceURI === ns && c.localName === local);
  };
  U.firstChildNS = function (el, ns, local) {
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && n.namespaceURI === ns && n.localName === local) return n;
    return null;
  };
  U.descendants = function (el, ns, local) {   // 자신 제외 모든 하위 요소
    return Array.from(el.getElementsByTagNameNS(ns, local));
  };
  U.indexOf = function (parent, el) { return U.children(parent).indexOf(el); };
  U.insertAt = function (parent, idx, node) {
    const kids = U.children(parent);
    parent.insertBefore(node, idx < kids.length ? kids[idx] : null);
  };
  U.insertAfter = function (ref, node) { ref.parentNode.insertBefore(node, ref.nextSibling); };
  U.removeAll = function (el) { while (el.firstChild) el.removeChild(el.firstChild); };
  U.mkel = function (doc, ns, qname, attrs) {
    const e = doc.createElementNS(ns, qname);
    if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    return e;
  };
  U.sub = function (parent, ns, qname, attrs) { const e = U.mkel(parent.ownerDocument, ns, qname, attrs); parent.appendChild(e); return e; };

  // ---------- 날짜 (ISO 'YYYY-MM-DD' 문자열 기반, 월요일=0) ----------
  const pad = n => String(n).padStart(2, '0');
  U.pad = pad;
  U.isoOf = function (y, m, d) {
    const t = Date.UTC(y, m - 1, d); const x = new Date(t);
    if (x.getUTCFullYear() !== y || x.getUTCMonth() !== m - 1 || x.getUTCDate() !== d) return null; // 존재하지 않는 날짜
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  U.days = function (iso) { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
  U.addDays = function (iso, n) { const x = new Date((U.days(iso) + n) * 86400000); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
  U.weekday = function (iso) { const x = new Date(U.days(iso) * 86400000); return (x.getUTCDay() + 6) % 7; };
  U.ymd = function (iso) { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
  U.WD = '월화수목금토일';
  U.todayIso = function () { const x = new Date(); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
  U.stamp = function () { const x = new Date(); return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}_${pad(x.getHours())}${pad(x.getMinutes())}${pad(x.getSeconds())}`; };

  // ---------- 문자열 ----------
  U.normWs = s => s.replace(/\s+/gu, '');
  U.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.codepoints = s => Array.from(s);

  // ---------- 간단 diff (difflib 대용: 배열 opcodes) ----------
  U.opcodes = function (a, b, eq) {
    eq = eq || ((x, y) => x === y);
    const n = a.length, m = b.length;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    const push = (op, i1, i2, j1, j2) => {
      const last = ops[ops.length - 1];
      if (last && last.op !== 'equal' && op !== 'equal' && last.i2 === i1 && last.j2 === j1) { last.i2 = i2; last.j2 = j2; last.op = 'replace'; }
      else ops.push({ op, i1, i2, j1, j2 });
    };
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { push('equal', i, i + 1, j, j + 1); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) { push('delete', i, i + 1, j, j); i++; }
      else { push('insert', i, i, j, j + 1); j++; }
    }
    if (i < n) push('delete', i, n, j, j);
    if (j < m) push('insert', i, i, j, m);
    return ops;
  };

  WBR.util = U;
})(globalThis.WBR = globalThis.WBR || {});
