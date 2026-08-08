/* ============================================================
 * 每天进步一点点 · 诗词成语练习小工具（纯前端 H5 原型）
 * 形态：先原型后全栈。当前用 localStorage + 内存数据；
 *       api 层已抽象，后续把方法体换成 fetch 即可平滑升级为全栈。
 * 登录：游客占位，微信/手机号接口预留（见 me 页占位按钮）。
 * ============================================================ */
(function () {
  "use strict";

  var HAN = /[一-龥]/;
  var STORE_KEY = "mjjb_state_v1";
  var ROUND_CAP = 50;          // 每轮题量封顶，防离谱
  var GROUP_SIZE = 10;         // 每日学习一组条数
  var LIB_PAGE_SIZE = 30;      // 诗词成语库每页条数
  var EASY_BANK_CAP = 50;      // 第一轮常用词池上限（便于按需扩充）

  var ENTRIES = window.ENTRIES || [];
  var COLLECTIONS = window.COLLECTIONS || [];
  var BY_ID = {};
  ENTRIES.forEach(function (e) { BY_ID[e.id] = e; });

  // 分类 → 原文卷首页图片
  var CAT_VOL = {
    "光阴如流水": "vol1.jpg",
    "情深缘浅": "vol2.jpg",
    "知己天涯": "vol3.jpg",
    "山水有清音": "vol4.jpg",
    "风骨凛然": "vol5.jpg",
    "文墨风流": "vol6.jpg",
    "世间百态": "vol7.jpg",
    "千古一叹": "vol8.jpg"
  };

  /* ---------------- API 抽象层（全栈预留） ---------------- */
  var api = {
    getCollections: function () { return COLLECTIONS; },
    getEntries: function (colIds) {
      return ENTRIES.filter(function (e) { return colIds.indexOf(e.collection) >= 0; });
    },
    // 后续全栈：改从后端读取/写入
    loadState: loadState,
    saveState: saveState
  };

  /* ---------------- 状态（localStorage） ---------------- */
  function defaultState() {
    return {
      learnedToday: { date: "", ids: [] },
      mastered: {},          // {entryId: true}
      favorites: [],         // [entryId]
      round: 1,
      best: {},              // {roundNo: 最好百分比}
      collections: ["cy"],   // 勾选的文集
      lastView: "study",     // 上次所在 tab（自动接续用）
      studyIdx: 0            // 学习栏当前条目索引（自动接续用）
    };
  }
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!s || typeof s !== "object") return defaultState();
      var d = defaultState();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      return s;
    } catch (e) { return defaultState(); }
  }
  function saveState(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

  var state = api.loadState();

  /* ---------------- 工具 ---------------- */
  function today() {
    var d = new Date();
    var m = ("0" + (d.getMonth() + 1)).slice(-2);
    var day = ("0" + d.getDate()).slice(-2);
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function selectedEntries() { return api.getEntries(state.collections); }

  // 确保今日学习组已生成
  function ensureDailyGroup() {
    if (state.learnedToday.date === today() && state.learnedToday.ids.length) return;
    var pool = selectedEntries().map(function (e) { return e.id; });
    var ids = [];
    var bag = pool.slice();
    for (var i = 0; i < GROUP_SIZE && bag.length; i++) {
      var idx = Math.floor(Math.random() * bag.length);
      ids.push(bag.splice(idx, 1)[0]);
    }
    state.learnedToday = { date: today(), ids: ids };
    saveState(state);
  }

  // 出题池：优先今日已学未掌握；全掌握后从勾选文集全量随机
  function quizPool() {
    var lt = state.learnedToday.ids;
    var un = lt.filter(function (id) { return !state.mastered[id]; });
    if (un.length) return un;
    return selectedEntries().map(function (e) { return e.id; });
  }

  // 难度分层：第1轮只用最短、最熟悉常用的词，之后逐轮加入更长的词
  function roundPool(round) {
    var all = selectedEntries();
    // 第1轮：easy 且字数 <= 6，避免长句上手太难
    var easy = all.filter(function (e) { return e.easy && e.chars <= 6; });
    // 兜底：如果 easy 短词不够，放宽到所有 easy
    if (easy.length < 10) easy = all.filter(function (e) { return e.easy; });
    var hard = all.filter(function (e) { return !e.easy || e.chars > 6; });
    var pool;
    if (round <= 1) {
      pool = easy.slice();
    } else {
      // 第2轮起：常用词 + 部分较生字，轮次越高较生字占比越大
      var hardTake = Math.min(hard.length, Math.round(hard.length * Math.min(1, (round - 1) / 5)));
      var shuffledHard = hard.slice().sort(function () { return Math.random() - 0.5; }).slice(0, hardTake);
      pool = easy.concat(shuffledHard);
    }
    return pool.map(function (e) { return e.id; });
  }

  // 把词条拆成 token，随机挖空（汉字数=4 挖2、=8 挖4，其余挖约半数）
  function makeQuestion(entry) {
    var tokens = [];
    var hanIdx = [];
    for (var i = 0; i < entry.term.length; i++) {
      var ch = entry.term[i];
      if (HAN.test(ch)) { tokens.push({ ch: ch, punct: false }); hanIdx.push(tokens.length - 1); }
      else { tokens.push({ ch: ch, punct: true }); }
    }
    // 填空字数：短词（成语等）保持挖约半数；诗句等较长句子最多挖 4 字，避免长句全空难答
    var hideCount = Math.min(Math.round(entry.chars / 2), 4);
    var shuffled = hanIdx.slice().sort(function () { return Math.random() - 0.5; });
    var hideSet = {};
    shuffled.slice(0, hideCount).forEach(function (i) { hideSet[i] = true; });
    tokens.forEach(function (t, i) { if (hideSet[i]) t.hidden = true; });
    var answerIdx = 0;
    tokens.forEach(function (t) { if (t.hidden) t.answerIdx = answerIdx++; });
    var answer = tokens.filter(function (t) { return t.hidden; }).map(function (t) { return t.ch; }).join("");
    return { entryId: entry.id, tokens: tokens, answer: answer, typed: null, answered: false, correct: false };
  }

  function buildQuiz() {
    var count = Math.min(ROUND_CAP, 10 * state.round);
    // 轮次池优先，且优先今日已学未掌握；都不够再补全书
    var roundIds = roundPool(state.round);
    var unmasteredRound = roundIds.filter(function (id) { return !state.mastered[id]; });
    var pool = unmasteredRound.length ? unmasteredRound : roundIds;
    var all = selectedEntries().map(function (e) { return e.id; });
    var used = {};
    var qs = [];
    for (var k = 0; k < count; k++) {
      var cand = pool.filter(function (id) { return !used[id]; });
      if (!cand.length) cand = all.filter(function (id) { return !used[id]; });
      if (!cand.length) cand = all;
      var id = pick(cand);
      used[id] = true;
      qs.push(makeQuestion(BY_ID[id]));
    }
    return qs;
  }

  /* ---------------- 渲染框架 ---------------- */
  var view = document.getElementById("view");
  var tabs = document.querySelectorAll(".tab");
  var quiz = null;        // 当前考核会话
  var studyIdx = state.studyIdx || 0;

  function setTab(name) {
    tabs.forEach(function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    if (state.lastView !== name) { state.lastView = name; saveState(state); }
    if (name === "lib") renderLib();
    else if (name === "study") renderStudy();
    else if (name === "fav") renderFav();
    else if (name === "quiz") renderQuizHome();
    else if (name === "me") renderMe();
  }
  // 自动接续上次所在 tab
  setTab(state.lastView || "study");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { setTab(t.dataset.tab); });
  });

  /* ---------------- 学习 ---------------- */
  function renderStudy() {
    ensureDailyGroup();
    var ids = state.learnedToday.ids;
    studyIdx = state.studyIdx || 0;
    if (studyIdx >= ids.length) studyIdx = ids.length - 1;
    if (studyIdx < 0) studyIdx = 0;
    state.studyIdx = studyIdx;
    var e = BY_ID[ids[studyIdx]];
    var isFav = state.favorites.indexOf(e.id) >= 0;
    var html = "";
    html += '<div class="progress">每日一组 · 第 ' + (studyIdx + 1) + " / " + ids.length + " 条</div>";
    html += '<div class="card" id="studyCard">';
    html += '  <div class="cat">' + e.category + "</div>";
    html += '  <div class="term">' + e.term + "</div>";
    if (e.pinyin) html += '  <div class="pinyin">' + e.pinyin + "</div>";
    html += '  <div class="source">—— ' + e.source + "</div>";
    html += '  <div class="meaning">' + e.meaning + "</div>";
    html += '  <div class="card-actions">';
    html += '    <button class="btn ' + (isFav ? "btn-fav" : "btn-ghost") + '" id="favBtn">' + (isFav ? "★ 已收藏" : "☆ 收藏") + "</button>";
    html += '    <button class="btn btn-recite" id="reciteBtn">🔊 诵读</button>';
    html += "  </div>";
    html += "</div>";
    html += '<div class="hint">下滑或点“下一条”继续 · 收藏后可到“收藏”随时查阅</div>';
    html += '<div class="card-actions" style="margin-top:14px">';
    html += '  <button class="btn btn-ghost" id="prevBtn"' + (studyIdx === 0 ? " disabled" : "") + ">↑ 上一条</button>";
    html += '  <button class="btn btn-primary" id="nextBtn">' + (studyIdx === ids.length - 1 ? "完成本组 ✓" : "下一条 ↓") + "</button>";
    html += "</div>";
    view.innerHTML = html;

    document.getElementById("favBtn").onclick = function () {
      var i = state.favorites.indexOf(e.id);
      if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(e.id);
      saveState(state); renderStudy();
    };
    document.getElementById("reciteBtn").onclick = function () { playRecite(e.term); };
    document.getElementById("nextBtn").onclick = function () {
      if (studyIdx < ids.length - 1) { studyIdx++; state.studyIdx = studyIdx; saveState(state); renderStudy(); }
      else { setTab("quiz"); }
    };
    document.getElementById("prevBtn").onclick = function () {
      if (studyIdx > 0) { studyIdx--; state.studyIdx = studyIdx; saveState(state); renderStudy(); }
    };
    bindSwipe(document.getElementById("studyCard"));
    bindWheelNav();
  }

  function bindSwipe(el) {    var sy = 0;
    el.addEventListener("touchstart", function (e) { sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      var dy = e.changedTouches[0].clientY - sy;
      if (dy > 60 && studyIdx > 0) { studyIdx--; state.studyIdx = studyIdx; saveState(state); renderStudy(); }
      else if (dy < -60 && studyIdx < state.learnedToday.ids.length - 1) { studyIdx++; state.studyIdx = studyIdx; saveState(state); renderStudy(); }
    }, { passive: true });
  }

  // PC 端鼠标滚轮下滑/上滑 = 下一条/上一条（仅学习栏生效；触屏手机继续走 bindSwipe）
  function bindWheelNav() {
    if (bindWheelNav._bound) return;
    bindWheelNav._bound = true;
    view.addEventListener("wheel", function (e) {
      var active = document.querySelector(".tab.active");
      if (!active || active.dataset.tab !== "study") return;
      e.preventDefault();
      bindWheelNav.acc = (bindWheelNav.acc || 0) + e.deltaY;
      var now = Date.now();
      if (now - (bindWheelNav.lastT || 0) > 800) bindWheelNav.acc = 0;
      bindWheelNav.lastT = now;
      if (bindWheelNav.acc > 60) {
        var ids = state.learnedToday.ids;
        if (studyIdx < ids.length - 1) { studyIdx++; state.studyIdx = studyIdx; saveState(state); renderStudy(); }
        bindWheelNav.acc = 0;
      } else if (bindWheelNav.acc < -60) {
        if (studyIdx > 0) { studyIdx--; state.studyIdx = studyIdx; saveState(state); renderStudy(); }
        bindWheelNav.acc = 0;
      }
    }, { passive: false });
  }

  /* ---------------- 诵读（央视风） ---------------- */
  // 优先播放预生成的 edge-tts 央视男声(YunyangNeural)音频；文件缺失则用浏览器 TTS 兜底
  var _zhVoice = null;
  function pickZhVoice() {
    if (!("speechSynthesis" in window)) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    var zh = vs.filter(function (v) { return /zh|chinese/i.test(v.lang); });
    if (!zh.length) return null;
    var m = zh.filter(function (v) { return /yunyang|male|男|晓|云|yang/i.test(v.name); });
    return m[0] || zh[0];
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = function () { _zhVoice = pickZhVoice(); };
  }
  function speakFallback(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN"; u.rate = 0.95; u.pitch = 1.0;
      var v = _zhVoice || pickZhVoice();
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function playRecite(text) {
    if (!text) return;
    var id = null;
    for (var k in BY_ID) { if (BY_ID[k].term === text) { id = BY_ID[k].id; break; } }
    if (id == null) { speakFallback(text); return; }
    var au = new Audio("audio/" + id + ".mp3");
    var fallbackTimer = setTimeout(function () { speakFallback(text); }, 1800);
    au.oncanplay = function () { clearTimeout(fallbackTimer); au.play(); };
    au.onerror = function () { clearTimeout(fallbackTimer); speakFallback(text); };
    au.load();
  }

  /* ---------------- 诗词成语库（第一栏） ---------------- */
  var libPage = 1, libCat = "all", libQ = "";
  function libFiltered() {
    return selectedEntries().filter(function (e) {
      if (libCat !== "all" && e.category !== libCat) return false;
      if (libQ) {
        var q = libQ.trim();
        if (q && e.term.indexOf(q) < 0 && (e.meaning || "").indexOf(q) < 0 && (e.source || "").indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function renderLib() {
    var cats = [];
    var seen = {};
    selectedEntries().forEach(function (e) { if (!seen[e.category]) { seen[e.category] = 1; cats.push(e.category); } });
    var list = libFiltered();
    var pages = Math.max(1, Math.ceil(list.length / LIB_PAGE_SIZE));
    if (libPage > pages) libPage = pages;
    var start = (libPage - 1) * LIB_PAGE_SIZE;
    var slice = list.slice(start, start + LIB_PAGE_SIZE);

    var html = "";
    html += '<div class="progress">诗词成语库 · 共 ' + list.length + " 条</div>";
    html += '<div class="lib-cover"><img src="assets/cover.jpg" alt="200个绝美的诗词成语" /></div>';
    html += '<div class="lib-search"><input id="libQ" placeholder="搜索词条 / 释义 / 出处…" value="' + libQ.replace(/"/g, "&quot;") + '" /></div>';
    html += '<div class="lib-cats" id="libCats">';
    html += '<span class="lib-cat' + (libCat === "all" ? " on" : "") + '" data-c="all">全部</span>';
    cats.forEach(function (c) { html += '<span class="lib-cat' + (libCat === c ? " on" : "") + '" data-c="' + c + '">' + c + "</span>"; });
    html += "</div>";
    if (libCat !== "all" && CAT_VOL[libCat]) {
      html += '<div class="lib-vol"><img src="assets/' + CAT_VOL[libCat] + '" alt="' + libCat + '卷首" /></div>';
    }
    html += '<div class="list">';
    var lastCat = null;
    slice.forEach(function (e) {
      if (libCat === "all" && e.category !== lastCat) {
        if (CAT_VOL[e.category]) html += '<div class="lib-vol"><img src="assets/' + CAT_VOL[e.category] + '" alt="' + e.category + '卷首" /></div>';
        lastCat = e.category;
      }
      var fav = state.favorites.indexOf(e.id) >= 0;
      html += "<div class='item lib-item' data-id='" + e.id + "'>";
      html += "<span class='lib-fav' data-id='" + e.id + "'>" + (fav ? "★" : "☆") + "</span>";
      html += "<div class='t'>" + e.term + "</div>";
      if (e.pinyin) html += "<div class='pinyin-sm'>" + e.pinyin + "</div>";
      html += "<div class='s'>—— " + e.source + "</div>";
      html += "<div class='m'>" + e.meaning + "</div>";
      html += "</div>";
    });
    if (!slice.length) html += "<div class='empty'>没有匹配的词条</div>";
    html += "</div>";
    if (pages > 1) {
      html += '<div class="lib-pager">';
      html += '<button class="btn btn-ghost" id="libPrev"' + (libPage <= 1 ? " disabled" : "") + ">‹ 上一页</button>";
      html += '<span class="lib-pageinfo">' + libPage + " / " + pages + "</span>";
      html += '<button class="btn btn-ghost" id="libNext"' + (libPage >= pages ? " disabled" : "") + ">下一页 ›</button>";
      html += "</div>";
    }
    view.innerHTML = html;

    document.getElementById("libQ").addEventListener("input", function () {
      libQ = this.value; libPage = 1; renderLib();
    });
    view.querySelectorAll(".lib-cat").forEach(function (b) {
      b.onclick = function () { libCat = b.dataset.c; libPage = 1; renderLib(); };
    });
    view.querySelectorAll(".lib-fav").forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var id = parseInt(b.dataset.id, 10);
        var i = state.favorites.indexOf(id);
        if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(id);
        saveState(state); renderLib();
      };
    });
    var pv = document.getElementById("libPrev"), nx = document.getElementById("libNext");
    if (pv) pv.onclick = function () { if (libPage > 1) { libPage--; renderLib(); } };
    if (nx) nx.onclick = function () { if (libPage < pages) { libPage++; renderLib(); } };
  }

  /* ---------------- 收藏 ---------------- */
  function renderFav() {
    if (!state.favorites.length) {
      view.innerHTML = '<div class="empty">还没有收藏。<br>去“学习”里把喜欢的词句加进来吧 ⭐</div>';
      return;
    }
    var html = '<div class="progress">我的收藏 · 共 ' + state.favorites.length + " 条</div><div class='list'>";
    state.favorites.forEach(function (id) {
      var e = BY_ID[id];
      html += "<div class='item'><span class='del' data-id='" + id + "'>移除</span>";
      html += "<div class='t'>" + e.term + "</div>";
      html += "<div class='s'>—— " + e.source + "</div>";
      html += "<div class='m'>" + e.meaning + "</div></div>";
    });
    html += "</div>";
    view.innerHTML = html;
    view.querySelectorAll(".del").forEach(function (b) {
      b.onclick = function () {
        var id = parseInt(b.dataset.id, 10);
        state.favorites = state.favorites.filter(function (x) { return x !== id; });
        saveState(state); renderFav();
      };
    });
  }

  /* ---------------- 考核 ---------------- */
  function renderQuizHome() {
    var count = Math.min(ROUND_CAP, 10 * state.round);
    var best = state.best[state.round] || 0;
    var masteredCount = Object.keys(state.mastered).length;
    var html = "";
    html += '<div class="quiz-meta">';
    html += '  <div><div class="k">当前轮次</div><div class="v">第 ' + state.round + " 轮</div></div>";
    html += '  <div><div class="k">本轮题量</div><div class="v">' + count + " 题</div></div>";
    html += '  <div><div class="k">历史最好</div><div class="v">' + best + " 分</div></div>";
    html += "</div>";
    html += '<div class="hint">规则：挖空填字，每轮满分 100 分，<b>&#8805;90 分</b>即可晋级下一轮。<br>第1轮用最熟悉常用的词，越往后越难。<br>题目优先出自今日已学内容，全部掌握后从全书随机。</div>';
    html += '<div class="card-actions" style="margin-top:20px">';
    html += '  <button class="btn btn-primary" id="startBtn" style="font-size:17px;padding:13px 34px">开始第 ' + state.round + " 轮自测</button>";
    html += "</div>";
    html += '<div class="hint">已掌握 ' + masteredCount + " / " + ENTRIES.length + " 条</div>";
    view.innerHTML = html;
    document.getElementById("startBtn").onclick = startQuiz;
  }

  function startQuiz() {
    quiz = { questions: buildQuiz(), idx: 0, correct: 0, wrong: [], mode: "normal" };
    renderQuestion();
  }

  function startMistakeQuiz() {
    if (!quiz || !quiz.wrong || !quiz.wrong.length) { renderQuizHome(); return; }
    var entries = quiz.wrong.map(function (w) { return BY_ID[w.entryId]; });
    // 去重，避免同一词条连续出现
    var seen = {}, unique = [];
    entries.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = true; unique.push(e); } });
    var qs = [];
    var used = {};
    for (var i = 0; i < unique.length; i++) {
      var e = unique[i];
      if (!used[e.id]) { used[e.id] = true; qs.push(makeQuestion(e)); }
    }
    // 打乱顺序
    qs.sort(function () { return Math.random() - 0.5; });
    quiz = { questions: qs, idx: 0, correct: 0, wrong: [], mode: "mistake" };
    renderQuestion();
  }

  function renderQuestion() {
    var q = quiz.questions[quiz.idx];
    var total = quiz.questions.length;
    var html = "";
    html += '<div class="progress">第 ' + state.round + " 轮 · 第 " + (quiz.idx + 1) + " / " + total + " 题</div>";
    html += '<div class="qterm" id="qterm">';
    q.tokens.forEach(function (t) {
      if (t.punct) html += "<span class='punct'>" + t.ch + "</span>";
      else if (t.hidden) {
        var val = (q.typed && q.typed[t.answerIdx] != null) ? q.typed[t.answerIdx] : "";
        html += "<input class='fill' maxlength='1' data-ai='" + t.answerIdx + "' value='" + val.replace(/'/g, "&#39;") + "' />";
      } else html += "<span>" + t.ch + "</span>";
    });
    html += "</div>";
    html += '<div class="qfeedback ' + (q.answered ? (q.correct ? "ok" : "bad") : "") + '" id="fb">' +
      (q.answered ? (q.correct ? "✓ 正确！" : "正确答案：" + q.answer) : "") + "</div>";
    html += '<div class="qnav">';
    html += '  <button class="btn btn-ghost" id="prevBtn"' + (quiz.idx === 0 ? " disabled" : "") + ">↑ 上一道</button>";
    html += '  <button class="btn btn-primary" id="submitBtn">' +
      (q.answered ? (quiz.idx === total - 1 ? "查看结果" : "下一题 →") : "确定") + "</button>";
    html += '  <button class="btn btn-ghost" id="skipBtn">下一道 ↓</button>';
    html += "</div>";
    view.innerHTML = html;

    var inputs = [].slice.call(view.querySelectorAll("input.fill"));
    function ensureTyped() { if (!q.typed) q.typed = []; }
    function fillBox(box, ch) {
      box.value = ch;
      box.classList.remove("ok", "bad");
      ensureTyped();
      q.typed[parseInt(box.dataset.ai, 10)] = ch;
    }
    function nextBlank(fromIdx, fills) {
      for (var i = fromIdx + 1; i < fills.length; i++) {
        if (!fills[i].disabled) return fills[i];
      }
      return null;
    }
    // 多词/整句一次性录入：从当前空开始把每个汉字向后分发，跳过已填的空
    function getFills() { return [].slice.call(view.querySelectorAll("input.fill")); }
    function nextBlank(fromIdx, fills) {
      for (var i = fromIdx + 1; i < fills.length; i++) { if (!fills[i].disabled) return fills[i]; }
      return null;
    }
    function distribute(text, startInp) {
      var fills = getFills();
      var idx = fills.indexOf(startInp);
      if (idx < 0) return;
      var chars = text.replace(/[^一-龥]/g, "").split("");
      var lastFilled = null, p = idx;
      for (var k = 0; k < chars.length && p < fills.length; k++) {
        while (p < fills.length && fills[p] !== startInp && fills[p].value && !fills[p].disabled) p++;
        if (p >= fills.length) break;
        fillBox(fills[p], chars[k]);
        lastFilled = fills[p];
        p++;
      }
      var next = null;
      if (lastFilled) {
        var fills2 = getFills();
        var li = fills2.indexOf(lastFilled);
        next = nextBlank(li, fills2) || lastFilled;
      }
      if (next) next.focus();
    }
    inputs.forEach(function (inp) {
      var composing = false;
      inp.addEventListener("compositionstart", function () { composing = true; });
      inp.addEventListener("compositionend", function (e) {
        composing = false;
        var raw = ((e.data || e.target.value) || "").replace(/[^一-龥]/g, "");
        if (raw) distribute(raw, inp);
      });
      inp.addEventListener("input", function (e) {
        if (e.isComposing || composing) return;
        var raw = inp.value.replace(/[^一-龥]/g, "");
        if (raw.length === 0) { fillBox(inp, ""); return; }
        if (raw.length === 1 && inp.value === raw) {
          fillBox(inp, raw);
          var nb = nextBlank(getFills().indexOf(inp), getFills());
          if (nb) nb.focus();
        } else {
          distribute(raw, inp);
        }
      });
      inp.addEventListener("paste", function (e) {
        e.preventDefault();
        var text = ((e.clipboardData || window.clipboardData).getData("text") || "").replace(/[^一-龥]/g, "");
        if (!text) return;
        distribute(text, inp);
      });
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !inp.value) {
          var fills = getFills();
          var idx = fills.indexOf(inp);
          if (idx > 0) { e.preventDefault(); fills[idx - 1].focus(); }
        }
      });
    });
    if (q.answered) inputs.forEach(function (i) { i.classList.add(q.correct ? "ok" : "bad"); i.disabled = true; });

    function goNext() { if (quiz.idx === total - 1) finishQuiz(); else { quiz.idx++; renderQuestion(); } }

    document.getElementById("prevBtn").onclick = function () { if (quiz.idx > 0) { quiz.idx--; renderQuestion(); } };
    document.getElementById("skipBtn").onclick = goNext;
    document.getElementById("submitBtn").onclick = function () {
      if (q.answered) { goNext(); return; }
      function norm(s) { return (s || "").replace(/[^一-龥]/g, ""); }
      var rawUser = inputs.map(function (i) { return i.value; }).join("");
      var user = norm(rawUser);
      var ans = norm(q.answer);
      if (user.length < ans.length) {
        document.getElementById("fb").className = "qfeedback bad";
        document.getElementById("fb").textContent = "还有 " + (ans.length - user.length) + " 个空没填上～";
        return;
      }
      q.typed = inputs.map(function (i) { return i.value; });
      var ok = user === ans;
      q.answered = true; q.correct = ok;
      if (ok) { quiz.correct++; state.mastered[q.entryId] = true; saveState(state); }
      else { q.userAnswer = user; quiz.wrong.push(q); }
      inputs.forEach(function (i) { i.classList.add(ok ? "ok" : "bad"); i.disabled = true; });
      document.getElementById("fb").className = "qfeedback " + (ok ? "ok" : "bad");
      document.getElementById("fb").textContent = ok ? "✓ 正确！" : "正确答案：" + q.answer;
      document.getElementById("submitBtn").textContent = (quiz.idx === total - 1) ? "查看结果" : "下一题 →";
    };
  }

  function finishQuiz() {
    var total = quiz.questions.length;
    var score = total ? Math.round(quiz.correct / total * 100) : 0;
    var passed = score >= 90;
    var cur = state.round;
    var isNormal = quiz.mode !== "mistake";
    if (isNormal && passed) {
      state.best[cur] = Math.max(state.best[cur] || 0, score);
      state.round = cur + 1;
      saveState(state);
    }
    var html = "";
    html += '<div class="card result-card">';
    html += '  <div class="result-emoji">' + (passed ? "🎉" : "💪") + "</div>";
    html += '  <div class="term result-score">' + (quiz.mode === "mistake" ? "错题测试" : "第 " + cur + " 轮自测") + " · " + score + " 分 / 100</div>";
    html += '  <div class="hint">' + (passed ? "太棒了，全部答对！" : "达标线 90 分。差一点点，再练一组就能过！") + "</div>";
    if (quiz.wrong && quiz.wrong.length) {
      html += '  <div class="wrong-title">本轮错题回顾</div>';
      html += '  <div class="wrong-list">';
      quiz.wrong.forEach(function (w, idx) {
        var e = BY_ID[w.entryId];
        html += '    <div class="wrong-item">';
        html += '      <div class="w-term">' + (idx + 1) + ". " + e.term + "</div>";
        html += '      <div class="w-line"><span class="w-label">正确答案</span><span class="w-ans">' + w.answer + "</span></div>";
        html += '      <div class="w-line"><span class="w-label">你的答案</span><span class="w-user">' + (w.userAnswer || "未作答") + "</span></div>";
        html += "    </div>";
      });
      html += "  </div>";
    } else {
      html += '  <div class="hint" style="margin-top:12px">✨ 全部正确，没有错题！</div>';
    }
    html += '  <div class="card-actions" style="margin-top:18px;flex-wrap:wrap">';
    if (quiz.wrong && quiz.wrong.length) {
      html += '    <button class="btn btn-primary" id="mistakeBtn">🎯 错题测试</button>';
    }
    html += '    <button class="btn btn-ghost" id="againBtn">' + (quiz.mode === "mistake" ? "再练一次错题" : "重测本轮") + "</button>";
    html += '    <button class="btn btn-ghost" id="homeBtn">返回自测首页</button>';
    html += "  </div>";
    html += "</div>";
    view.innerHTML = html;
    var againBtn = document.getElementById("againBtn");
    if (againBtn) againBtn.onclick = quiz.mode === "mistake" ? startMistakeQuiz : startQuiz;
    var mb = document.getElementById("mistakeBtn");
    if (mb) mb.onclick = startMistakeQuiz;
    var homeBtn = document.getElementById("homeBtn");
    if (homeBtn) homeBtn.onclick = renderQuizHome;
    if (isNormal && passed) showReward(score);
  }

  /* ---------------- 自测通过奖励弹层 ---------------- */
  var REWARDS = [
    { emoji: "🍦", name: "冰淇淋" },
    { emoji: "🧋", name: "珍珠奶茶" },
    { emoji: "🍗", name: "一顿肯德基" },
    { emoji: "🎬", name: "一张电影票" },
    { emoji: "🍱", name: "一顿大餐" }
  ];
  function showReward(score) {
    var r = REWARDS[Math.floor(Math.random() * REWARDS.length)];
    var ov = document.getElementById("rewardOverlay");
    if (!ov) { renderQuizHome(); return; }
    document.getElementById("rewardEmoji").textContent = r.emoji;
    document.getElementById("rewardName").textContent = r.name;
    document.getElementById("rewardScore").textContent = "本轮得分 " + score + " 分 / 100";
    ov.classList.add("show");
    document.getElementById("rewardBtn").onclick = function () {
      ov.classList.remove("show");
    };
  }

  /* ---------------- 我的 ---------------- */
  function renderMe() {
    var masteredCount = Object.keys(state.mastered).length;
    var html = "";
    // 文集勾选
    html += '<div class="progress">学习 / 自测文集</div>';
    COLLECTIONS.forEach(function (c) {
      var on = state.collections.indexOf(c.id) >= 0;
      html += '<div class="set-row"><div><div class="lab">' + c.name + '</div>';
      html += '<div class="desc">' + (c.id === "cy" ? "已收录 200 条" : "即将上线") + "</div></div>";
      html += '<div class="switch ' + (on ? "on" : "") + '" data-col="' + c.id + '"></div></div>';
    });
    // 统计
    html += '<div class="stat-grid">';
    html += '  <div class="stat"><div class="v">' + state.round + "</div><div class='k'>当前轮次</div></div>";
    html += '  <div class="stat"><div class="v">' + Math.min(ROUND_CAP, 10 * state.round) + "</div><div class='k'>本轮题量</div></div>";
    html += '  <div class="stat"><div class="v">' + masteredCount + "</div><div class='k'>已掌握条数</div></div>";
    html += '  <div class="stat"><div class="v">' + state.favorites.length + "</div><div class='k'>收藏条数</div></div>";
    html += "</div>";
    // 登录占位（全栈预留）
    html += '<div class="progress">账号</div>';
    html += '<div class="login-ph">当前：<b>游客模式</b>（进度仅保存在本机）<br>';
    html += '微信扫码登录 / 手机号登录 · 即将开放</div>';
    // 重置
    html += '<div class="card-actions" style="margin-top:16px">';
    html += '  <button class="btn btn-ghost" id="resetBtn">清空本机进度</button>';
    html += "</div>";
    view.innerHTML = html;

    view.querySelectorAll(".switch").forEach(function (sw) {
      sw.onclick = function () {
        var id = sw.dataset.col;
        var i = state.collections.indexOf(id);
        if (i >= 0) { if (state.collections.length > 1) state.collections.splice(i, 1); }
        else state.collections.push(id);
        saveState(state); renderMe();
      };
    });
    document.getElementById("resetBtn").onclick = function () {
      if (confirm("确定清空本机所有进度（学习/收藏/掌握/轮次）？")) {
        state = defaultState(); saveState(state); studyIdx = 0; renderMe();
      }
    };
  }

  /* ---------------- 启动 ---------------- */
  ensureDailyGroup();
  setTab("study");
})();
