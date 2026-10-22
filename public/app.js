/* ============================================================================
   SAQIB MD — Pairing Portal front-end
   Talks to the bot's real API. Works same-origin (served by the bot) or
   cross-origin (deployed statically) — the bot sends CORS headers.
   Endpoints used:
     GET  /api/status
     GET  /api/sessions?token=
     POST /api/session/remove        {number, token}
     POST /api/pair                  {number}
     GET  /api/pair/state?number=
     POST /api/pair/reset            {number}
     GET  /api/pair/stream?number=   (SSE)
     GET  /api/qr?text=&size=
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------ storage --------------------------------- */
  var LS_BASE = 'saqib.apiBase';
  var LS_TOKEN = 'saqib.adminToken';
  var LS_NUM = 'saqib.lastNumber';

  function lsGet(k) {
    try { return localStorage.getItem(k) || ''; } catch (e) { return ''; }
  }
  function lsSet(k, v) {
    try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* private mode */ }
  }

  var API_BASE = lsGet(LS_BASE).replace(/\/+$/, '');
  var ADMIN_TOKEN = lsGet(LS_TOKEN);

  function api(path) { return API_BASE + path; }

  /* ------------------------------- helpers -------------------------------- */
  function $(id) { return document.getElementById(id); }
  function normNum(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

  function fmtUptime(s) {
    if (!s) return '—';
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function shortNum(n) {
    var d = normNum(n);
    if (d.length < 7) return d || '—';
    return '+' + d.slice(0, d.length - 7) + ' ' + d.slice(d.length - 7, d.length - 4) + ' ' + d.slice(d.length - 4);
  }

  function initials(n) {
    var d = normNum(n);
    return d ? d.slice(-2) : '??';
  }

  /* -------------------------------- toasts -------------------------------- */
  var ICONS = {
    ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    err: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>'
  };

  function toast(msg, kind, ms) {
    var host = $('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('data-kind', kind || 'info');
    el.innerHTML = (ICONS[kind] || ICONS.info) + '<span></span>';
    el.lastChild.textContent = String(msg);
    host.appendChild(el);
    var life = ms || (kind === 'err' ? 5200 : 3600);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, life);
  }

  /* -------------------------------- modal --------------------------------- */
  function openModal(id) { var m = $(id); if (m) m.setAttribute('data-open', '1'); }
  function closeModal(id) { var m = $(id); if (m) m.removeAttribute('data-open'); }

  /* ------------------------------- network -------------------------------- */
  function getJSON(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(api(path), opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) {
          var err = new Error(body && body.error ? body.error : ('HTTP ' + r.status));
          err.body = body;
          err.status = r.status;
          throw err;
        }
        return body;
      });
    });
  }

  function postJSON(path, body) {
    return getJSON(path, { method: 'POST', body: JSON.stringify(body || {}) });
  }

  /* ------------------------------ app state ------------------------------- */
  var S = {
    number: '',
    code: '',
    qr: '',
    deadline: 0,
    expiresTotal: 120,
    status: 'idle',
    tick: null,
    poll: null,
    sse: null,
    busy: false,
    connected: false
  };

  /* ------------------------------- stepper -------------------------------- */
  function setStep(n, doneUpTo) {
    var steps = document.querySelectorAll('#stepper .step');
    for (var i = 0; i < steps.length; i++) {
      var el = steps[i];
      var idx = parseInt(el.getAttribute('data-step'), 10);
      if (idx === n) el.setAttribute('data-on', '1');
      else el.removeAttribute('data-on');
      if (idx <= (doneUpTo || 0)) el.setAttribute('data-done', '1');
      else el.removeAttribute('data-done');
    }
  }

  /* -------------------------------- status -------------------------------- */
  function paintStatus(st) {
    var pill = $('statusPill');
    var txt = $('statusText');
    var online = !!(st && st.ok);
    pill.setAttribute('data-state', online ? 'online' : 'offline');
    txt.textContent = online ? 'Bot online' : 'Bot offline';

    if (st) {
      $('factStatus').textContent = (st.status || 'idle').replace(/^\w/, function (c) { return c.toUpperCase(); });
      $('factUptime').textContent = fmtUptime(st.uptime);
      $('factLinked').textContent = String(st.connectedCount == null ? 0 : st.connectedCount);
      $('factCap').innerHTML = String(st.maxSessions == null ? '—' : st.maxSessions) + ' <small>max</small>';
      if (st.botName) {
        var bn = document.querySelector('.brand-name');
        if (bn) bn.textContent = String(st.botName).toUpperCase();
      }
    }
    var lg = $('legacyLink');
    if (lg) {
      lg.href = api('/legacy.html');
      if (online) lg.setAttribute('data-ok', '1');
      else lg.removeAttribute('data-ok');
    }
  }

  var hintedOffline = false;
  function loadStatus(silent) {
    return getJSON('/api/status')
      .then(function (st) { paintStatus(st); hintedOffline = false; return st; })
      .catch(function (e) {
        paintStatus(null);
        if (!silent) toast('Bot tak nahi pohanch saka — URL check karein.', 'err');
        else if (!hintedOffline) {
          hintedOffline = true;
          toast('Bot offline — top-right link icon se apna bot URL connect karein.', 'info', 8000);
        }
        throw e;
      });
  }

  /* ------------------------------- sessions ------------------------------- */
  function renderSessions(data) {
    var list = $('sessList');
    var unlock = $('unlockBtn');
    if (!list) return;

    if (data && data.locked) {
      list.innerHTML = '<div class="empty">' +
        (data.count ? (data.count + ' number(s) linked. ') : '') +
        'Owner token required to view details.</div>';
      if (unlock) unlock.classList.remove('hide');
      return;
    }
    if (unlock) unlock.classList.add('hide');

    var arr = (data && data.sessions) || [];
    if (!arr.length) {
      list.innerHTML = '<div class="empty">No linked numbers yet.</div>';
      return;
    }

    list.innerHTML = '';
    arr.forEach(function (s) {
      var on = s.status === 'connected';
      var row = document.createElement('div');
      row.className = 'sess';

      var av = document.createElement('div');
      av.className = 'sess-av';
      if (!on) av.setAttribute('data-off', '1');
      av.textContent = initials(s.number);

      var info = document.createElement('div');
      info.className = 'sess-info';
      var num = document.createElement('div');
      num.className = 'sess-num';
      num.textContent = shortNum(s.number);
      var st = document.createElement('div');
      st.className = 'sess-st';
      if (on) st.setAttribute('data-on', '1');
      st.textContent = on ? 'Connected' : (s.status || 'idle');
      info.appendChild(num);
      info.appendChild(st);

      var x = document.createElement('button');
      x.className = 'sess-x';
      x.type = 'button';
      x.title = 'Remove this session';
      x.setAttribute('aria-label', 'Remove session ' + shortNum(s.number));
      x.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
      x.addEventListener('click', function () { removeSession(s.number, x); });

      row.appendChild(av);
      row.appendChild(info);
      row.appendChild(x);
      list.appendChild(row);
    });
  }

  function loadSessions() {
    var q = ADMIN_TOKEN ? ('?token=' + encodeURIComponent(ADMIN_TOKEN)) : '';
    return getJSON('/api/sessions' + q)
      .then(function (d) { renderSessions(d); return d; })
      .catch(function () {
        renderSessions({ locked: true, count: 0 });
      });
  }

  function removeSession(number, btn) {
    if (!ADMIN_TOKEN) { openModal('tokenModal'); return; }
    if (!window.confirm('Remove session ' + shortNum(number) + '? The bot will disconnect from this number.')) return;
    if (btn) btn.disabled = true;
    postJSON('/api/session/remove', { number: number, token: ADMIN_TOKEN })
      .then(function (r) {
        if (r && r.ok) { toast('Session removed.', 'ok'); loadSessions(); loadStatus(true); }
        else toast((r && r.error) || 'Remove fail ho gaya.', 'err');
      })
      .catch(function (e) { toast(e.message || 'Remove fail ho gaya.', 'err'); })
      .then(function () { if (btn) btn.disabled = false; });
  }

  /* ------------------------------- pairing -------------------------------- */
  function setBusy(on) {
    S.busy = on;
    var b = $('pairBtn');
    var sp = $('pairSpin');
    var lbl = $('pairBtnLabel');
    if (b) b.disabled = on;
    if (sp) sp.classList.toggle('hide', !on);
    if (lbl) lbl.textContent = on ? 'Requesting code…' : 'Get pairing code';
  }

  function renderCode(code) {
    var box = $('codeDigits');
    if (!box) return;
    box.innerHTML = '';
    var clean = String(code || '').replace(/[^A-Za-z0-9]/g, '');
    if (!clean) { box.innerHTML = '<span style="color:var(--text-faint);font-size:13px">No code — use the QR tab.</span>'; return; }
    var groups = [];
    for (var i = 0; i < clean.length; i += 4) groups.push(clean.slice(i, i + 4));
    var flat = groups.join('-');
    var idx = 0;
    flat.split('').forEach(function (ch) {
      var d = document.createElement('div');
      if (ch === '-') {
        d.style.cssText = 'min-width:auto;padding:0 2px;border:0;background:none;color:var(--text-faint);font-size:22px;text-shadow:none;animation:none';
        d.textContent = '–';
      } else {
        d.className = 'digit';
        d.style.animationDelay = (idx * 45) + 'ms';
        d.textContent = ch;
        idx++;
      }
      box.appendChild(d);
    });
  }

  function renderQr(qr) {
    var box = $('qrBox');
    if (!box) return;
    if (!qr) {
      box.innerHTML = '<div style="color:#667;font-size:12.5px;text-align:center;padding:8px 4px;max-width:200px">QR abhi generate nahi hua. Code use karein ya <b>New code</b> dabayein.</div>';
      return;
    }
    var img = document.createElement('img');
    img.alt = 'WhatsApp pairing QR code';
    img.width = 216;
    img.height = 216;
    img.src = api('/api/qr?size=320&text=' + encodeURIComponent(qr));
    img.onerror = function () {
      box.innerHTML = '<div style="color:#667;font-size:12.5px;text-align:center;padding:8px 4px">QR load nahi hua.</div>';
    };
    box.innerHTML = '';
    box.appendChild(img);
  }

  /* countdown ring */
  var CIRC = 2 * Math.PI * 16;

  function paintTimer() {
    var left = Math.max(0, Math.round((S.deadline - Date.now()) / 1000));
    var num = $('timerNum');
    var bar = $('timerBar');
    var text = $('timerText');
    if (!num || !bar || !text) return;

    num.textContent = left > 99 ? String(left) : (left < 10 ? '0' + left : String(left));

    var frac = S.expiresTotal > 0 ? Math.min(1, left / S.expiresTotal) : 0;
    bar.setAttribute('stroke-dasharray', CIRC.toFixed(2));
    bar.setAttribute('stroke-dashoffset', (CIRC * (1 - frac)).toFixed(2));
    if (left <= 20) bar.style.stroke = 'var(--rose)';
    else if (left <= 45) bar.style.stroke = 'var(--amber)';
    else bar.style.stroke = 'var(--accent)';

    var mm = Math.floor(left / 60);
    var ss = left % 60;
    var clock = mm + ':' + (ss < 10 ? '0' + ss : ss);

    if (left <= 0) {
      text.innerHTML = '<b style="color:var(--rose)">Code expired.</b> Click <b>New code</b> to get a fresh one.';
    } else {
      text.innerHTML = 'Code expires in <b>' + clock + '</b>. Open WhatsApp → <b>Linked devices</b> → <b>Link with phone number</b>.';
    }
  }

  function startTimer(seconds) {
    stopTimer();
    S.expiresTotal = Math.max(1, seconds || 120);
    S.deadline = Date.now() + S.expiresTotal * 1000;
    paintTimer();
    S.tick = setInterval(paintTimer, 500);
  }
  function stopTimer() {
    if (S.tick) { clearInterval(S.tick); S.tick = null; }
  }

  /* polling fallback — safe, never invalidates the code */
  function startPoll() {
    stopPoll();
    S.poll = setInterval(function () {
      if (!S.number) return;
      getJSON('/api/pair/state?number=' + encodeURIComponent(S.number))
        .then(function (st) {
          if (!st || !st.ok) return;
          if (st.status) S.status = st.status;
          if (st.qr && st.qr !== S.qr) { S.qr = st.qr; renderQr(st.qr); }
          if (st.code && !S.code) { S.code = st.code; renderCode(st.code); }
          if (st.connected) onPaired();
          else if (st.error) onPairError(st.error);
          else if (st.status === 'linking') setStep(3, 2);
        })
        .catch(function () { /* transient */ });
    }, 2600);
  }
  function stopPoll() {
    if (S.poll) { clearInterval(S.poll); S.poll = null; }
  }

  /* live stream */
  function startSSE() {
    stopSSE();
    if (!window.EventSource) return;
    try {
      var url = api('/api/pair/stream?number=' + encodeURIComponent(S.number));
      S.sse = new EventSource(url);
      S.sse.onmessage = function (ev) {
        var d;
        try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (!d || !d.status) return;
        if (d.status === 'qr' && d.qr) { S.qr = d.qr; renderQr(d.qr); }
        else if (d.status === 'code' && d.code) { if (!S.code) { S.code = d.code; renderCode(d.code); } }
        else if (d.status === 'linking') { setStep(3, 2); toast('Code accepted — linking…', 'info'); }
        else if (d.status === 'paired') { onPaired(); }
        else if (d.status === 'error') { onPairError(d.error || 'Pairing fail ho gaya.'); }
      };
      S.sse.onerror = function () { /* polling keeps us covered */ };
    } catch (e) { /* ignore */ }
  }
  function stopSSE() {
    if (S.sse) { try { S.sse.close(); } catch (e) { /* ignore */ } S.sse = null; }
  }

  /* ------------------------------ outcomes -------------------------------- */
  function onPaired() {
    if (S.connected) return;
    S.connected = true;
    stopTimer();
    stopPoll();
    stopSSE();
    setStep(3, 3);
    $('result').setAttribute('data-show', '1');
    $('timer').classList.add('hide');
    $('success').classList.remove('hide');
    var msg = $('successMsg');
    if (msg) msg.innerHTML = 'Number <b>' + shortNum(S.number) + '</b> is now linked. Send <b>.menu</b> in any chat to get started.';
    toast('WhatsApp linked successfully! 🎉', 'ok', 6000);
    loadStatus(true);
    loadSessions();
  }

  function onPairError(msg) {
    toast(msg || 'Pairing fail ho gaya.', 'err');
    stopTimer();
    stopPoll();
    stopSSE();
    S.connected = false;
  }

  function showResult() {
    $('result').setAttribute('data-show', '1');
    $('success').classList.add('hide');
    $('timer').classList.remove('hide');
  }

  function resetUI() {
    stopTimer();
    stopPoll();
    stopSSE();
    S.code = ''; S.qr = ''; S.connected = false; S.status = 'idle';
    $('result').removeAttribute('data-show');
    $('success').classList.add('hide');
    $('timer').classList.remove('hide');
    $('codeDigits').innerHTML = '';
    $('qrBox').innerHTML = '<div class="spinner" style="border-color:rgba(0,0,0,.14);border-top-color:#05060a"></div>';
    setStep(1, 0);
  }

  /* ------------------------------- pairing -------------------------------- */
  function requestPair(number) {
    var num = normNum(number);
    if (num.length < 8 || num.length > 15) {
      toast('Valid number likhein — country code ke sath (8–15 digits).', 'err');
      return;
    }

    setBusy(true);
    resetUI();
    S.number = num;
    lsSet(LS_NUM, num);
    setStep(2, 1);
    showResult();
    $('codeDigits').innerHTML = '<span style="color:var(--text-faint);font-size:13px">Generating…</span>';

    postJSON('/api/pair', { number: num })
      .then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || 'Pairing fail ho gaya.');

        if (r.alreadyLinked) {
          S.number = r.number || num;
          onPaired();
          return;
        }

        S.code = r.code || '';
        S.qr = r.qr || '';
        S.status = r.status || 'pairing';

        renderCode(S.code);
        renderQr(S.qr);
        startTimer(r.expiresIn || 120);
        startPoll();
        startSSE();

        if (S.code) toast('Pairing code ready — enter it in WhatsApp.', 'ok');
        else toast('QR ready — scan it in WhatsApp.', 'info');
      })
      .catch(function (e) {
        var msg = (e && e.body && e.body.error) || (e && e.message) || 'Pairing fail ho gaya.';
        toast(msg, 'err');
        resetUI();
        setStep(1, 0);
      })
      .then(function () { setBusy(false); });
  }

  /* -------------------------------- tabs ---------------------------------- */
  function selectTab(which) {
    var isCode = which === 'code';
    $('tabCode').setAttribute('aria-selected', isCode ? 'true' : 'false');
    $('tabQr').setAttribute('aria-selected', isCode ? 'false' : 'true');
    $('paneCode').classList.toggle('hide', !isCode);
    $('paneQr').classList.toggle('hide', isCode);
    if (!isCode && S.qr) renderQr(S.qr);
  }

  /* -------------------------------- wire up ------------------------------- */
  function boot() {
    var last = lsGet(LS_NUM);
    if (last) $('phone').value = last;

    $('phone').addEventListener('input', function (e) {
      var d = normNum(e.target.value).slice(0, 15);
      e.target.value = d;
    });

    $('pairForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (S.busy) return;
      requestPair($('phone').value);
    });

    $('copyBtn').addEventListener('click', function () {
      if (!S.code) { toast('Koi code nahi hai abhi.', 'info'); return; }
      var txt = S.code;
      var done = function () { toast('Code copied.', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt, done); });
      } else fallbackCopy(txt, done);
    });

    $('newCodeBtn').addEventListener('click', function () {
      if (S.busy) return;
      requestPair(S.number || $('phone').value);
    });

    $('resetBtn').addEventListener('click', function () {
      var num = S.number || normNum($('phone').value);
      if (!num) { resetUI(); toast('Cleared.', 'info'); return; }
      if (!window.confirm('Reset pairing for ' + shortNum(num) + '?')) return;
      postJSON('/api/pair/reset', { number: num })
        .then(function () { toast('Session reset. Naya code lein.', 'ok'); resetUI(); loadStatus(true); })
        .catch(function (e) { toast(e.message || 'Reset fail.', 'err'); });
    });

    $('tabCode').addEventListener('click', function () { selectTab('code'); });
    $('tabQr').addEventListener('click', function () { selectTab('qr'); });

    $('refreshBtn').addEventListener('click', function () {
      loadStatus().then(function () { toast('Status refreshed.', 'ok', 1800); }).catch(function () {});
      loadSessions();
    });
    $('refreshSessBtn').addEventListener('click', function () { loadSessions(); });

    $('unlockBtn').addEventListener('click', function () { openModal('tokenModal'); });
    $('tokenCancel').addEventListener('click', function () { closeModal('tokenModal'); });
    $('tokenSave').addEventListener('click', function () {
      var v = ($('tokenInput').value || '').trim();
      if (!v) { toast('Token khali hai.', 'err'); return; }
      ADMIN_TOKEN = v;
      lsSet(LS_TOKEN, v);
      closeModal('tokenModal');
      loadSessions().then(function (d) {
        if (d && d.locked) { toast('Token galat lagta hai.', 'err'); ADMIN_TOKEN = ''; lsSet(LS_TOKEN, ''); }
        else toast('Owner view unlocked.', 'ok');
      });
    });

    $('apiBtn').addEventListener('click', function () {
      $('apiInput').value = API_BASE;
      openModal('apiModal');
    });
    $('apiCancel').addEventListener('click', function () { closeModal('apiModal'); });
    $('apiSave').addEventListener('click', function () {
      var v = ($('apiInput').value || '').trim().replace(/\/+$/, '');
      if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
      API_BASE = v;
      lsSet(LS_BASE, v);
      closeModal('apiModal');
      toast(v ? ('Connected to ' + v) : 'Using this server.', 'ok');
      resetUI();
      loadStatus(true).catch(function () {});
      loadSessions();
    });

    ['tokenModal', 'apiModal'].forEach(function (id) {
      $(id).addEventListener('click', function (e) { if (e.target === this) closeModal(id); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal('tokenModal'); closeModal('apiModal'); }
    });

    var legacy = $('legacyLink');
    if (legacy) {
      legacy.href = api('/legacy.html');
      legacy.addEventListener('click', function (e) {
        if (!legacy.getAttribute('data-ok')) {
          e.preventDefault();
          toast('Classic portal sirf bot ke apne server par khulta hai.', 'info');
        }
      });
    }

    loadStatus(true).catch(function () {});
    loadSessions();
    setInterval(function () { loadStatus(true).catch(function () {}); }, 15000);
    setInterval(function () { loadSessions(); }, 20000);

    var m = /[?&]number=([0-9]+)/.exec(window.location.search);
    if (m) {
      $('phone').value = m[1];
      requestPair(m[1]);
    }
  }

  function fallbackCopy(txt, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { toast('Copy fail — code manually likhein.', 'err'); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
