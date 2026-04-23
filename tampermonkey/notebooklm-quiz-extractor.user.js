// ==UserScript==
// @name         NotebookLM Quiz Extractor
// @namespace    local.notebooklm.quiz
// @version      0.2.4
// @description  Export NotebookLM multiple-choice quiz data from the current page.
// @match        https://notebooklm.google.com/*
// @match        https://*.notebooklm.google.com/*
// @match        https://*.googleusercontent.com/*
// @match        https://*.usercontent.goog/*
// @match        https://*.scf.usercontent.goog/*
// @include      /^https:\/\/.*\.scf\.usercontent\.goog\/.*$/
// @include      /^https:\/\/.*\.usercontent\.goog\/.*$/
// @include      about:blank
// @include      /^blob:.*$/
// @include      /^blob:https:\/\/notebooklm\.google\.com\/.*$/
// @include      /^blob:https:\/\/.*\.usercontent\.goog\/.*$/
// @include      /^blob:https:\/\/.*\.googleusercontent\.com\/.*$/
// @run-at       document-start
// @grant        GM_download
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const QUESTION_COUNTER_RE = /第\s*(\d+)\s*个问题\s*[，,]\s*共\s*(\d+)\s*个/;
  const SLASH_COUNTER_RE = /^(\d+)\s*\/\s*(\d+)$/;
  const OPTION_INLINE_RE = /^([A-D])[\.\):、]\s*(.+)/;
  const OPTION_LABEL_RE = /^([A-D])[\.\):、]?$/;
  const CORRECT_RE = /回答正确|正确答案|correct/i;
  const IGNORED_LINES = new Set([
    "edit",
    "提示",
    "显示提示",
    "keyboard_arrow_down",
    "keyboard_arrow_up",
    "下一个",
    "下一题",
    "上一个",
    "上一题",
    "完成",
    "close",
    "done",
    "check",
    "cancel",
    "chat_spark_2",
    "解释",
  ]);

  const state = {
    running: false,
    stopped: false,
    panel: null,
    status: null,
    initialized: false,
    remoteReady: false,
    remoteInfo: null,
  };

  boot();

  function boot() {
    console.info("[NotebookLM Quiz Extractor] userscript loaded", {
      href: location.href,
      referrer: document.referrer,
      isFrame: window.top !== window,
    });
    const timer = setInterval(() => {
      if (!document.body || !document.documentElement) return;
      clearInterval(timer);
      init();
    }, 100);
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    window.addEventListener("message", handleFrameMessage);
    announceIfQuizFrame();
    setTimeout(announceIfQuizFrame, 1500);

    if (window.top !== window) return;

    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("显示 NotebookLM 面板", () => {
        createPanel(true);
        alert("NotebookLM Quiz Extractor 面板已尝试显示在页面右上角。");
      });
      GM_registerMenuCommand("导出 NotebookLM 测验", () => {
        createPanel(true);
        alert("NotebookLM Quiz Extractor 已开始执行导出。若 5 秒内没有保存弹窗，请查看页面右侧面板状态。");
        exportQuiz().catch((error) => {
          console.error("[NotebookLM Quiz Extractor] export failed", error);
          setStatus(`失败：${error?.message || error}`);
          alert(`NotebookLM Quiz Extractor 失败：\n${error?.message || error}`);
          setRunning(false);
        });
      });
      GM_registerMenuCommand("刷新测验状态", () => {
        createPanel(true);
        refreshDetectionStatus();
      });
      GM_registerMenuCommand("打开测验 Frame", () => {
        createPanel(true);
        openQuizFrame();
      });
    }
    if (!shouldInstallPanel()) return;
    createPanel(false);
    setTimeout(refreshDetectionStatus, 1500);
  }

  function shouldInstallPanel() {
    return location.hostname.endsWith("notebooklm.google.com")
      || location.hostname.endsWith("usercontent.goog")
      || location.hostname.endsWith("googleusercontent.com")
      || isLikelyNotebookChildFrame()
      || location.protocol === "blob:"
      || Boolean(findQuizContext());
  }

  function isLikelyNotebookChildFrame() {
    try {
      return window.top !== window && document.referrer.includes("notebooklm.google.com");
    } catch (_error) {
      return false;
    }
  }

  function handleFrameMessage(event) {
    const message = event.data || {};
    if (!message || message.source !== "nlm-qe") return;
    if (message.type === "ready") {
      state.remoteReady = true;
      state.remoteInfo = message;
      if (!state.running) setStatus(`已检测到测验 frame：${message.index}/${message.total}\n${shortUrl(message.href || "")}`);
      return;
    }
    if (message.type === "probe") {
      announceIfQuizFrame();
      broadcastToFrames(message);
      return;
    }
    if (message.type === "export") {
      const context = findQuizContext();
      if (!context) return;
      createPanel(true);
      exportQuiz(false).catch((error) => {
        console.error("[NotebookLM Quiz Extractor] frame export failed", error);
        setStatus(`失败：${error?.message || error}`);
      });
    }
  }

  function announceIfQuizFrame() {
    const context = findQuizContext();
    if (!context) return;
    const quiz = parseQuizText(context.text);
    if (!quiz) return;
    try {
      window.top.postMessage(
        {
          source: "nlm-qe",
          type: "ready",
          index: quiz.index,
          total: quiz.total,
          href: location.href,
          referrer: document.referrer,
        },
        "*"
      );
    } catch (_error) {
      // Ignore cross-context notification failures.
    }
  }

  function refreshDetectionStatus() {
    if (state.running) return;
    const quizContext = findQuizContext();
    const exportButton = document.getElementById("nlm-qe-export");
    if (quizContext) {
      const quiz = parseQuizText(quizContext.text);
      setStatus(quiz ? `已检测到测验：${quiz.index}/${quiz.total}` : "已检测到测验");
      if (exportButton) exportButton.disabled = false;
      return;
    }
    broadcastToFrames({ source: "nlm-qe", type: "probe" });
    setStatus(`${state.remoteReady ? "已检测到子 frame 测验，可直接导出" : "正在请求子 frame 自检..."}\n${diagnoseDocuments()}\n${diagnoseFrames()}\n${diagnoseInjectionLimit()}`);
    setTimeout(() => {
      if (!state.running && !findQuizContext()) {
        setStatus(`${state.remoteReady ? "已检测到子 frame 测验，可直接导出" : "未检测到测验"}\n${diagnoseDocuments()}\n${diagnoseFrames()}\n${diagnoseInjectionLimit()}`);
      }
    }, 1200);
    if (exportButton) exportButton.disabled = false;
  }

  function createPanel(forceShow) {
    let panel = document.getElementById("nlm-qe-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "nlm-qe-panel";
      panel.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "right:16px",
        "top:50%",
        "transform:translateY(-50%)",
        "width:52px",
        "box-sizing:border-box",
        "padding:0",
        "border:none",
        "border-radius:26px",
        "background:transparent",
        "color:#202124",
        "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "display:block",
        "visibility:visible",
        "opacity:1",
        "pointer-events:auto"
      ].join(";");

      const launcher = document.createElement("div");
      launcher.id = "nlm-qe-launcher";
      launcher.textContent = "Q";
      launcher.title = "NotebookLM Quiz Export";
      launcher.style.cssText = [
        "width:44px",
        "height:44px",
        "margin-left:8px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "border-radius:999px",
        "background:#1a73e8",
        "color:#fff",
        "font:600 18px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "box-shadow:0 6px 18px rgba(26,115,232,0.28)",
        "cursor:pointer",
        "user-select:none"
      ].join(";");

      const content = document.createElement("div");
      content.id = "nlm-qe-content";
      content.style.cssText = [
        "position:absolute",
        "right:52px",
        "top:50%",
        "transform:translateY(-50%)",
        "width:248px",
        "box-sizing:border-box",
        "padding:12px",
        "border:1px solid rgba(32,33,36,0.16)",
        "border-radius:10px",
        "background:#ffffff",
        "box-shadow:0 10px 28px rgba(0,0,0,0.18)",
        "display:none"
      ].join(";");

      const title = document.createElement("div");
      title.id = "nlm-qe-title";
      title.textContent = "NotebookLM Quiz Export";
      title.style.cssText = "font-weight:600;margin-bottom:8px;";

      const actions = document.createElement("div");
      actions.id = "nlm-qe-actions";
      actions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;";

      const exportButton = document.createElement("button");
      exportButton.id = "nlm-qe-export";
      exportButton.type = "button";
      exportButton.textContent = "导出测验";
      exportButton.style.cssText = buttonStyle(false);

      const stopButton = document.createElement("button");
      stopButton.id = "nlm-qe-stop";
      stopButton.type = "button";
      stopButton.textContent = "停止";
      stopButton.disabled = true;
      stopButton.style.cssText = buttonStyle(true);

      const refreshButton = document.createElement("button");
      refreshButton.id = "nlm-qe-refresh";
      refreshButton.type = "button";
      refreshButton.textContent = "刷新";
      refreshButton.style.cssText = buttonStyle(false);

      const openFrameButton = document.createElement("button");
      openFrameButton.id = "nlm-qe-open-frame";
      openFrameButton.type = "button";
      openFrameButton.textContent = "打开Frame";
      openFrameButton.style.cssText = buttonStyle(false);

      const status = document.createElement("div");
      status.id = "nlm-qe-status";
      status.textContent = "正在检测测验...";
      status.style.cssText = "white-space:pre-wrap;color:#5f6368;min-height:18px;";

      actions.appendChild(exportButton);
      actions.appendChild(stopButton);
      actions.appendChild(refreshButton);
      actions.appendChild(openFrameButton);
      content.appendChild(title);
      content.appendChild(actions);
      content.appendChild(status);
      panel.appendChild(launcher);
      panel.appendChild(content);
      document.documentElement.appendChild(panel);

      state.panel = panel;
      state.status = status;

      const showContent = () => {
        content.style.display = "block";
      };
      const hideContent = () => {
        if (state.running) return;
        content.style.display = "none";
      };

      panel.addEventListener("mouseenter", showContent);
      panel.addEventListener("mouseleave", hideContent);
      launcher.addEventListener("click", () => {
        content.style.display = content.style.display === "block" ? "none" : "block";
      });

      exportButton.addEventListener("click", () => {
        exportQuiz().catch((error) => {
          console.error("[NotebookLM Quiz Extractor] export failed", error);
          setStatus(`失败：${error?.message || error}`);
          alert(`NotebookLM Quiz Extractor 失败：\n${error?.message || error}`);
          setRunning(false);
        });
      });
      stopButton.addEventListener("click", () => {
        state.stopped = true;
        setStatus("正在停止...");
      });
      refreshButton.addEventListener("click", () => {
        refreshDetectionStatus();
      });
      openFrameButton.addEventListener("click", () => {
        openQuizFrame();
      });
    } else {
      state.panel = panel;
      state.status = panel.querySelector("#nlm-qe-status");
    }

    if (forceShow && state.panel) {
      state.panel.style.display = "block";
      state.panel.style.visibility = "visible";
      state.panel.style.opacity = "1";
      const content = state.panel.querySelector("#nlm-qe-content");
      if (content) content.style.display = "block";
    }
  }

  function buttonStyle(disabled) {
    return [
      "border:1px solid #dadce0",
      "border-radius:6px",
      `background:${disabled ? "#f1f3f4" : "#f8fafd"}`,
      `color:${disabled ? "#80868b" : "#1a73e8"}`,
      "padding:7px 10px",
      "white-space:nowrap",
      "font:inherit",
      `cursor:${disabled ? "not-allowed" : "pointer"}`
    ].join(";");
  }

  async function exportQuiz(allowBroadcast = true) {
    setRunning(true);
    state.stopped = false;

    const results = [];
    const seen = new Set();
    const maxQuestions = 200;

    for (let step = 0; step < maxQuestions; step += 1) {
      if (state.stopped) break;

      const quizContext = await waitForQuizContext();
      if (!quizContext) {
        if (allowBroadcast && window.top === window) {
          broadcastToFrames({ source: "nlm-qe", type: "export" });
          const frameUrl = findLikelyQuizFrameUrl();
          if (frameUrl && !state.remoteReady) {
            setStatus("当前主页面不可直接读取跨域测验 iframe，正在打开测验 Frame 新标签页。\n在新标签页中点击导出测验。\n" + shortUrl(frameUrl));
            window.open(frameUrl, "_blank", "noopener,noreferrer");
          } else {
            setStatus("当前主页面不可直接读取测验，已向子 frame 发送导出命令。\n如果没有下载弹窗，请确认 Tampermonkey 已允许在 iframe/blob 中运行。\n" + diagnoseFrames());
          }
          setRunning(false);
          return;
        }
        throw new Error("当前页面、可访问 iframe 或 Shadow DOM 中没有可解析的测验题目");
      }

      const before = parseQuizText(quizContext.text);
      if (!before) {
        if (results.length === 0) throw new Error("当前测验文本无法解析");
        break;
      }

      const fingerprint = compactFingerprint(before.question);
      if (seen.has(fingerprint)) break;
      seen.add(fingerprint);

      setStatus(`正在抓取 ${before.index}/${before.total}\n${before.question.slice(0, 80)}`);

      clickOption(quizContext.root, "A");
      await sleep(450);

      const afterContext = findQuizContext() || quizContext;
      const after = parseQuizText(afterContext.text) || before;
      results.push({
        index: after.index,
        total: after.total,
        question: after.question,
        options: before.options,
        answer: after.answer || "",
        explanations: after.explanations || {},
      });

      if (after.index >= after.total) break;
      if (!clickNext(afterContext.root)) break;
      await sleep(650);
    }

    if (!results.length) throw new Error("没有抓取到题目");

    const base = `notebooklm-quiz-${timestamp()}`;
    await downloadText(`${base}.json`, JSON.stringify(results, null, 2), "application/json;charset=utf-8");
    await downloadText(`${base}.md`, renderMarkdown(results), "text/markdown;charset=utf-8");
    setStatus(`完成：已导出 ${results.length} 题`);
    alert(`NotebookLM Quiz Extractor 已导出 ${results.length} 题`);
    setRunning(false);
  }

  function broadcastToFrames(message) {
    for (const frame of Array.from(window.frames)) {
      try {
        frame.postMessage(message, "*");
        for (const nested of Array.from(frame.frames || [])) {
          nested.postMessage(message, "*");
        }
      } catch (_error) {
        // Ignore inaccessible frames.
      }
    }
  }

  function setRunning(running) {
    state.running = running;
    const exportButton = document.getElementById("nlm-qe-export");
    const stopButton = document.getElementById("nlm-qe-stop");
    const content = document.getElementById("nlm-qe-content");
    if (exportButton) exportButton.disabled = running;
    if (stopButton) stopButton.disabled = !running;
    if (content && running) content.style.display = "block";
  }

  function setStatus(text) {
    console.info("[NotebookLM Quiz Extractor]", text);
    if (state.status) state.status.textContent = text;
  }

  async function waitForQuizContext() {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const quizContext = findQuizContext();
      if (quizContext) return quizContext;
      await sleep(300);
    }
    return null;
  }

  function findQuizContext() {
    const pageContexts = pageScanContexts();
    const pageHit = pageContexts.find((candidate) => parseQuizText(candidate.text));
    if (pageHit) return pageHit;
    return collectQuizContexts(document).find((candidate) => parseQuizText(candidate.text)) || null;
  }

  function diagnoseDocuments() {
    const contexts = pageScanContexts().concat(collectQuizContexts(document));
    const summaries = contexts.map((candidate, index) => {
      const lines = cleanLines(candidate.text);
      const counter = parseCounterFromLines(lines);
      const optionCount = lines.filter((line, lineIndex) => optionLabelAt(lines, lineIndex)).length;
      return `${candidate.kind}${index}: counter=${counter ? `${counter.index}/${counter.total}` : "no"} options=${optionCount}`;
    });
    return summaries.slice(0, 8).join("\n") || "没有可访问文本";
  }

  function diagnoseFrames() {
    if (window.top !== window) return `frame: ${shortUrl(location.href)}`;
    const frames = Array.from(document.querySelectorAll("iframe,frame"));
    if (!frames.length) return "iframes=0";
    return frames
      .slice(0, 8)
      .map((frame, index) => {
        const src = frame.getAttribute("src") || frame.src || "";
        let access = "cross";
        try {
          access = frame.contentDocument ? "same" : "no-doc";
        } catch (_error) {
          access = "cross";
        }
        return `iframe${index}: ${access} ${shortUrl(src)}`;
      })
      .join("\n");
  }

  function diagnoseInjectionLimit() {
    if (state.remoteReady) return "";
    if (window.top !== window) return "";
    const frameInfo = Array.from(document.querySelectorAll("iframe,frame"))
      .map((frame) => frame.getAttribute("src") || frame.src || "")
      .filter(Boolean)
      .join("\n");
    if (/scf\.usercontent\.goog|usercontent\.goog|googleusercontent\.com/.test(frameInfo)) {
      return "判断：测验在跨域/Blob 制品 Frame 中；当前 Tampermonkey 未注入该 Frame，顶层脚本无法读取题目 DOM。";
    }
    return "";
  }

  function findLikelyQuizFrameUrl() {
    const frames = Array.from(document.querySelectorAll("iframe,frame"));
    const urls = frames
      .map((frame) => frame.getAttribute("src") || frame.src || "")
      .filter(Boolean);
    return urls.find((url) => /usercontent\.goog|googleusercontent\.com/.test(url) && /noteb|widget|app/i.test(url))
      || urls.find((url) => /usercontent\.goog|googleusercontent\.com/.test(url))
      || "";
  }

  function openQuizFrame() {
    const frameUrl = findLikelyQuizFrameUrl();
    if (!frameUrl) {
      setStatus(`没有找到可打开的测验 iframe。\n${diagnoseFrames()}`);
      return false;
    }
    const opened = window.open(frameUrl, "_blank");
    if (!opened) {
      setStatus(`Chrome 拦截了新标签页。请允许 notebooklm.google.com 的弹出式窗口后重试。\n${shortUrl(frameUrl)}`);
      return false;
    }
    setStatus(`已打开测验 Frame 新标签页。\n如果新标签页仍无面板，说明 Tampermonkey 无法注入 NotebookLM 的 sandbox/blob 制品页。\n${shortUrl(frameUrl)}`);
    return true;
  }

  function shortUrl(url) {
    const text = String(url || "");
    if (!text) return "";
    return text.length > 96 ? `${text.slice(0, 96)}...` : text;
  }

  function collectQuizContexts(rootDocument) {
    const result = [{ kind: "doc", root: rootDocument, text: rootText(rootDocument) }];
    result.push(...collectShadowContexts(rootDocument));
    for (const frame of Array.from(rootDocument.querySelectorAll("iframe,frame"))) {
      try {
        const childDocument = frame.contentDocument;
        if (!childDocument) continue;
        result.push(...collectQuizContexts(childDocument));
      } catch (_error) {
        // Cross-origin frames are expected. If Tampermonkey injects into them, they get their own panel.
      }
    }
    return result;
  }

  function collectShadowContexts(root) {
    const result = [];
    const elements = Array.from(root.querySelectorAll?.("*") || []);
    for (const element of elements) {
      if (!element.shadowRoot) continue;
      result.push({ kind: "shadow", root: element.shadowRoot, text: rootText(element.shadowRoot) });
      result.push(...collectShadowContexts(element.shadowRoot));
    }
    return result;
  }

  function rootText(root) {
    if (root.body?.innerText) return root.body.innerText;
    const pieces = [];
    collectVisibleText(root, pieces);
    return pieces.join("\n");
  }

  function collectVisibleText(root, pieces) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = normalizeSpace(node.nodeValue || "");
      if (!text) continue;
      const parent = node.parentElement;
      if (parent && !isVisible(parent)) continue;
      pieces.push(text);
    }
  }

  function parseQuizText(text) {
    const lines = cleanLines(text);
    const counterInfo = parseCounterFromLines(lines);
    if (!counterInfo) return null;

    const { index, total, lineIndex: counterIndex } = counterInfo;
    const optionIndexes = lines
      .map((line, lineIndex) => (optionLabelAt(lines, lineIndex) ? lineIndex : -1))
      .filter((lineIndex) => lineIndex >= 0);
    const firstFour = firstOrderedAbcd(lines, optionIndexes);
    if (firstFour.length !== 4) return null;

    const question = extractQuestion(lines, counterIndex, firstFour[0]);
    const options = extractOptions(lines, firstFour);
    const explanations = extractExplanations(lines, firstFour);
    const answer = Object.entries(explanations).find(([, explanation]) => CORRECT_RE.test(explanation))?.[0] || "";

    return { index, total, question, options, answer, explanations };
  }

  function cleanLines(text) {
    return text
      .split(/\r?\n/)
      .map(normalizeSpace)
      .filter(Boolean);
  }

  function parseCounterFromLines(lines) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const chinese = line.match(QUESTION_COUNTER_RE);
      if (chinese) return { index: Number(chinese[1]), total: Number(chinese[2]), lineIndex };
      const slash = line.match(SLASH_COUNTER_RE);
      if (slash) return { index: Number(slash[1]), total: Number(slash[2]), lineIndex };
    }
    return null;
  }

  function hasAbcdOptions(lines) {
    const indexes = lines
      .map((line, lineIndex) => (optionLabelAt(lines, lineIndex) ? lineIndex : -1))
      .filter((lineIndex) => lineIndex >= 0);
    return firstOrderedAbcd(lines, indexes).length === 4;
  }

  function firstOrderedAbcd(lines, indexes) {
    const result = [];
    let expectedCode = "A".charCodeAt(0);
    for (const index of indexes) {
      if (optionLabelAt(lines, index) === String.fromCharCode(expectedCode)) {
        result.push(index);
        expectedCode += 1;
        if (expectedCode === "E".charCodeAt(0)) break;
      }
    }
    return result;
  }

  function extractQuestion(lines, counterIndex, firstOptionIndex) {
    return normalizeSpace(
      lines
        .slice(counterIndex + 1, firstOptionIndex)
        .filter((line) => !shouldIgnoreLine(line))
        .map(stripQuestionPrefix)
        .join(" ")
    );
  }

  function extractOptions(lines, optionIndexes) {
    const options = {};
    const boundaries = optionIndexes.concat(lines.length);
    optionIndexes.forEach((index, pos) => {
      const label = optionLabelAt(lines, index);
      if (!label) return;
      const inline = optionInlineText(lines[index]);
      if (inline) {
        options[label] = normalizeSpace(inline);
        return;
      }
      const end = boundaries[pos + 1];
      const optionLine = lines.slice(index + 1, end).find((line) => !shouldIgnoreLine(line) && !CORRECT_RE.test(line));
      options[label] = normalizeSpace(optionLine || "");
    });
    return options;
  }

  function extractExplanations(lines, optionIndexes) {
    const explanations = {};
    const boundaries = optionIndexes.concat(lines.length);
    optionIndexes.forEach((start, pos) => {
      const label = optionLabelAt(lines, start);
      if (!label) return;
      const inline = optionInlineText(lines[start]);
      const segmentStart = inline ? start + 1 : start + 2;
      const segment = trimAtGlobalExplanation(lines.slice(segmentStart, boundaries[pos + 1]));
      explanations[label] = normalizeSpace(
        segment.filter((line) => !shouldIgnoreLine(line) && !parseCounterFromLines([line])).join(" ")
      );
    });
    return explanations;
  }

  function optionLabelAt(lines, index) {
    const line = lines[index] || "";
    const inline = line.match(OPTION_INLINE_RE);
    if (inline) return inline[1];
    const labelOnly = line.match(OPTION_LABEL_RE);
    if (!labelOnly) return "";
    if (index + 1 < lines.length && !shouldIgnoreLine(lines[index + 1])) return labelOnly[1];
    return "";
  }

  function optionInlineText(line) {
    const match = line.match(OPTION_INLINE_RE);
    return match ? normalizeSpace(match[2]) : "";
  }

  function shouldIgnoreLine(line) {
    return IGNORED_LINES.has(line) || line.startsWith("keyboard_");
  }

  function trimAtGlobalExplanation(lines) {
    const index = lines.findIndex((line) => line === "chat_spark_2" || line === "解释");
    return index >= 0 ? lines.slice(0, index) : lines;
  }

  function stripQuestionPrefix(line) {
    return line.replace(/^Question\s*\d+\s*[:：]\s*/i, "");
  }

  function normalizeSpace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function compactFingerprint(value) {
    return normalizeSpace(value).toLowerCase().replace(/\W+/g, "").slice(0, 180);
  }

  function clickOption(rootDocument, label) {
    if (rootDocument === "__page__") return pageClickOption(label);
    const pattern = new RegExp(`^\\s*${label}[\\.)：:、]?\\s*`);
    const candidates = clickableElements(rootDocument).filter((element) => pattern.test(textOf(element)));
    const target = candidates[0] || findTextNodeClickable(rootDocument, label);
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return true;
  }

  function clickNext(rootDocument) {
    if (rootDocument === "__page__") return pageClickNext();
    const candidates = clickableElements(rootDocument).filter((element) => {
      const text = textOf(element);
      const attrs = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
      return /^(下一题|下一个|继续|完成|next|continue|finish|done|›|»|→)$/i.test(text)
        || /下一题|下一个|继续|完成|next|continue|finish|done/i.test(attrs);
    });
    if (!candidates.length) return false;
    candidates[0].scrollIntoView({ block: "center", inline: "center" });
    candidates[0].click();
    return true;
  }

  function clickableElements(rootDocument) {
    return queryAllDeep(rootDocument, "button,[role='button'],[role='radio'],label,a,[aria-label]")
      .filter(isVisible)
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
  }

  function findTextNodeClickable(rootDocument, label) {
    const elements = queryAllDeep(rootDocument, "div,span,p")
      .filter(isVisible)
      .filter((element) => textOf(element) === label || textOf(element) === `${label}.`);
    for (const element of elements) {
      const clickable = element.closest("button,[role='button'],[role='radio'],label");
      if (clickable && !clickable.disabled && clickable.getAttribute("aria-disabled") !== "true") return clickable;
    }
    return null;
  }

  function queryAllDeep(root, selector) {
    const result = Array.from(root.querySelectorAll?.(selector) || []);
    const elements = Array.from(root.querySelectorAll?.("*") || []);
    for (const element of elements) {
      if (!element.shadowRoot) continue;
      result.push(...queryAllDeep(element.shadowRoot, selector));
    }
    return result;
  }

  function pageScanContexts() {
    const contexts = pageEval(function () {
      function rootText(root) {
        if (root.body && root.body.innerText) return root.body.innerText;
        if (root.innerText) return root.innerText;
        return "";
      }

      function collect(root, kind) {
        const result = [{ kind, text: rootText(root) }];
        const elements = Array.from(root.querySelectorAll ? root.querySelectorAll("*") : []);
        for (const element of elements) {
          if (element.shadowRoot) result.push(...collect(element.shadowRoot, "page-shadow"));
        }
        for (const frame of Array.from(root.querySelectorAll ? root.querySelectorAll("iframe,frame") : [])) {
          try {
            if (frame.contentDocument) result.push(...collect(frame.contentDocument, "page-frame"));
          } catch (_error) {
            // Ignore cross-origin frames.
          }
        }
        return result;
      }

      return collect(document, "page");
    });

    return (Array.isArray(contexts) ? contexts : []).map((context) => ({
      kind: context.kind || "page",
      root: "__page__",
      text: context.text || "",
    }));
  }

  function pageClickOption(label) {
    return Boolean(pageEval(function (targetLabel) {
      const pattern = new RegExp("^\\s*" + targetLabel + "[\\.)：:、]?\\s*");
      const target = clickableElements(document).find((element) => pattern.test(textOf(element)))
        || findTextNodeClickable(document, targetLabel);
      if (!target) return false;
      target.scrollIntoView({ block: "center", inline: "center" });
      target.click();
      return true;

      function clickableElements(root) {
        return queryAllDeep(root, "button,[role='button'],[role='radio'],label,a,[aria-label]")
          .filter(isVisible)
          .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
      }

      function findTextNodeClickable(root, label) {
        const elements = queryAllDeep(root, "div,span,p")
          .filter(isVisible)
          .filter((element) => textOf(element) === label || textOf(element) === label + ".");
        for (const element of elements) {
          const clickable = element.closest("button,[role='button'],[role='radio'],label");
          if (clickable && !clickable.disabled && clickable.getAttribute("aria-disabled") !== "true") return clickable;
        }
        return null;
      }

      function queryAllDeep(root, selector) {
        const result = Array.from(root.querySelectorAll ? root.querySelectorAll(selector) : []);
        const elements = Array.from(root.querySelectorAll ? root.querySelectorAll("*") : []);
        for (const element of elements) {
          if (element.shadowRoot) result.push(...queryAllDeep(element.shadowRoot, selector));
        }
        for (const frame of Array.from(root.querySelectorAll ? root.querySelectorAll("iframe,frame") : [])) {
          try {
            if (frame.contentDocument) result.push(...queryAllDeep(frame.contentDocument, selector));
          } catch (_error) {
            // Ignore cross-origin frames.
          }
        }
        return result;
      }

      function isVisible(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 4 && rect.height > 4;
      }

      function textOf(element) {
        return String(element.innerText || element.textContent || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      }
    }, label));
  }

  function pageClickNext() {
    return Boolean(pageEval(function () {
      const candidates = clickableElements(document).filter((element) => {
        const text = textOf(element);
        const attrs = (element.getAttribute("aria-label") || "") + " " + (element.getAttribute("title") || "");
        return /^(下一题|下一个|继续|完成|next|continue|finish|done|›|»|→)$/i.test(text)
          || /下一题|下一个|继续|完成|next|continue|finish|done/i.test(attrs);
      });
      if (!candidates.length) return false;
      candidates[0].scrollIntoView({ block: "center", inline: "center" });
      candidates[0].click();
      return true;

      function clickableElements(root) {
        return queryAllDeep(root, "button,[role='button'],[role='radio'],label,a,[aria-label]")
          .filter(isVisible)
          .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
      }

      function queryAllDeep(root, selector) {
        const result = Array.from(root.querySelectorAll ? root.querySelectorAll(selector) : []);
        const elements = Array.from(root.querySelectorAll ? root.querySelectorAll("*") : []);
        for (const element of elements) {
          if (element.shadowRoot) result.push(...queryAllDeep(element.shadowRoot, selector));
        }
        for (const frame of Array.from(root.querySelectorAll ? root.querySelectorAll("iframe,frame") : [])) {
          try {
            if (frame.contentDocument) result.push(...queryAllDeep(frame.contentDocument, selector));
          } catch (_error) {
            // Ignore cross-origin frames.
          }
        }
        return result;
      }

      function isVisible(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 4 && rect.height > 4;
      }

      function textOf(element) {
        return String(element.innerText || element.textContent || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      }
    }));
  }

  function pageEval(fn, ...args) {
    try {
      const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      return page.Function("fn", "args", "return fn.apply(window, args);")(fn, args);
    } catch (error) {
      console.warn("[NotebookLM Quiz Extractor] pageEval failed", error);
      return null;
    }
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 4 && rect.height > 4;
  }

  function textOf(element) {
    return normalizeSpace(element.innerText || element.textContent || element.getAttribute("aria-label") || "");
  }

  async function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      if (typeof GM_download === "function") {
        await new Promise((resolve, reject) => {
          GM_download({
            url,
            name: filename,
            saveAs: true,
            onload: resolve,
            onerror: reject,
            ontimeout: reject,
          });
        });
        return;
      }
      fallbackDownload(url, filename);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function fallbackDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function renderMarkdown(quizzes) {
    const lines = ["# NotebookLM Quiz Export", ""];
    for (const quiz of quizzes) {
      lines.push(`## ${quiz.index}/${quiz.total}. ${quiz.question}`, "");
      if (quiz.answer) lines.push(`**Answer:** ${quiz.answer}`, "");
      for (const label of ["A", "B", "C", "D"]) {
        if (!Object.prototype.hasOwnProperty.call(quiz.options, label)) continue;
        const marker = quiz.answer === label ? " [correct]" : "";
        lines.push(`- ${label}. ${quiz.options[label]}${marker}`);
        if (quiz.explanations[label]) lines.push(`  - ${quiz.explanations[label]}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim() + "\n";
  }

  function timestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join("");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
