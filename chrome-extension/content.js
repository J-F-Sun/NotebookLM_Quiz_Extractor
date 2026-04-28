(function () {
  "use strict";

  const SOURCE = "nlm-qe-ext";
  const QUESTION_COUNTER_RE = /第\s*(\d+)\s*个问题\s*[，,]\s*共\s*(\d+)\s*个/;
  const SLASH_COUNTER_RE = /^(\d+)\s*\/\s*(\d+)$/;
  const OPTION_INLINE_RE = /^([A-D])[\.\):、]\s*(.+)/;
  const OPTION_LABEL_RE = /^([A-D])[\.\):、]?$/;
  const CORRECT_RE = /回答正确|正确答案|correct/i;
  const RELATIVE_TIME_RE = /(?:\d+\s*)?(?:分钟前|小时前|天前|周前|月前|年前)|\b\d+\s*(?:min(?:ute)?s?|hours?|days?|weeks?|months?|years?)\s+ago\b/i;
  const PANEL_POS_KEY = "nlm-qe-ext-panel-pos-v1";
  const LANG_KEY = "nlm-qe-ext-lang";
  const DIR_NAME_KEY = "nlm-qe-ext-dir-name";
  const IDB_NAME = "nlm-qe-ext-db";
  const IDB_STORE = "kv";
  const DIR_HANDLE_KEY = "export-dir-handle";
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
    "解释"
  ]);

  const I18N = {
    zh: {
      panelTitle: "NotebookLM 测验导出",
      export: "导出",
      exportAll: "导出全部",
      stop: "停止",
      refresh: "刷新",
      settings: "设置",
      statusReady: "准备就绪",
      statusDetecting: "正在检测测验...",
      statusDetected: ({ total }) => `已检测到 ${total} 道题目`,
      statusBatchDetected: ({ total }) => `已发现 ${total} 个测验入口`,
      statusNotDetected: "未检测到测验",
      statusExporting: ({ index, total }) => `正在导出 ${index}/${total}`,
      statusBatchOpening: ({ index, total, title }) => `正在打开测验 ${index}/${total}：${title}`,
      statusBatchCollecting: ({ index, total, title }) => `正在导出测验 ${index}/${total}：${title}`,
      statusBatchExported: ({ done, total, failed, path }) => `批量导出完成：成功 ${done}/${total}${failed ? `，失败 ${failed}` : ""}\n目录：${path}`,
      statusExportRequested: "已请求测验 frame 导出全部题目，请稍候...",
      statusExported: ({ path }) => `已成功导出到目录：${path}`,
      statusStopped: "正在停止...",
      statusDirectorySet: ({ path }) => `已设置导出目录：${path}`,
      statusDirectoryFailed: ({ error }) => `目录设置失败：${error}`,
      statusFailed: ({ error }) => `失败：${error}`,
      statusSaveFailed: ({ error }) => `保存失败：${error}`,
      settingsTitle: "设置",
      language: "语言",
      languageAuto: "跟随浏览器",
      languageZh: "中文",
      languageEn: "English",
      exportDir: "导出目录",
      chooseDir: "选择目录",
      currentDir: ({ path }) => `当前：${path}`,
      defaultDir: "浏览器默认下载目录",
      close: "关闭"
    },
    en: {
      panelTitle: "NotebookLM Quiz Export",
      export: "Export",
      exportAll: "Export All",
      stop: "Stop",
      refresh: "Refresh",
      settings: "Settings",
      statusReady: "Ready",
      statusDetecting: "Detecting quiz...",
      statusDetected: ({ total }) => `Detected ${total} questions`,
      statusBatchDetected: ({ total }) => `Found ${total} quiz entries`,
      statusNotDetected: "No quiz detected",
      statusExporting: ({ index, total }) => `Exporting ${index}/${total}`,
      statusBatchOpening: ({ index, total, title }) => `Opening quiz ${index}/${total}: ${title}`,
      statusBatchCollecting: ({ index, total, title }) => `Exporting quiz ${index}/${total}: ${title}`,
      statusBatchExported: ({ done, total, failed, path }) => `Batch export complete: ${done}/${total} succeeded${failed ? `, ${failed} failed` : ""}\nFolder: ${path}`,
      statusExportRequested: "Requested export from the quiz frame. Please wait...",
      statusExported: ({ path }) => `Exported successfully to: ${path}`,
      statusStopped: "Stopping...",
      statusDirectorySet: ({ path }) => `Export directory set to: ${path}`,
      statusDirectoryFailed: ({ error }) => `Directory setup failed: ${error}`,
      statusFailed: ({ error }) => `Failed: ${error}`,
      statusSaveFailed: ({ error }) => `Save failed: ${error}`,
      settingsTitle: "Settings",
      language: "Language",
      languageAuto: "Browser default",
      languageZh: "中文",
      languageEn: "English",
      exportDir: "Export directory",
      chooseDir: "Browse",
      currentDir: ({ path }) => `Current: ${path}`,
      defaultDir: "Browser default downloads folder",
      close: "Close"
    }
  };

  const state = {
    running: false,
    stopped: false,
    panel: null,
    status: null,
    title: null,
    exportButton: null,
    batchButton: null,
    stopButton: null,
    refreshButton: null,
    settingsButton: null,
    settingsPanel: null,
    settingsTitle: null,
    languageLabel: null,
    languageSelect: null,
    directoryLabel: null,
    directoryButton: null,
    directoryText: null,
    settingsClose: null,
    remoteReady: false,
    remoteInfo: null,
    awaitingRemoteExport: false,
    pendingCollects: new Map(),
    activeCollectRequestId: "",
    batchRunning: false,
    batchStopped: false,
    drag: null,
    lastSavedPath: ""
  };

  boot();

  function boot() {
    console.info("[NotebookLM Quiz Extractor extension] loaded", {
      href: location.href,
      referrer: document.referrer,
      isFrame: window.top !== window
    });

    window.addEventListener("message", handleWindowMessage);

    const timer = setInterval(() => {
      if (!document.body || !document.documentElement) return;
      clearInterval(timer);
      init();
    }, 100);
  }

  function init() {
    announceIfQuizFrame();
    setTimeout(announceIfQuizFrame, 1000);
    setTimeout(announceIfQuizFrame, 3000);

    if (window.top !== window) return;
    if (!shouldInstallPanel()) return;

    createPanel(false);
    loadPanelPosition();
    window.addEventListener("resize", () => {
      ensurePanelVisible();
    });
    setTimeout(refreshDetectionStatus, 1000);
  }

  function shouldInstallPanel() {
    return location.hostname.endsWith("notebooklm.google.com")
      || location.hostname.endsWith("usercontent.goog")
      || location.hostname.endsWith("googleusercontent.com")
      || location.protocol === "blob:"
      || Boolean(findQuizContext());
  }

  function handleWindowMessage(event) {
    const message = event.data || {};
    if (!message || message.source !== SOURCE) return;

    if (message.type === "ready") {
      state.remoteReady = true;
      state.remoteInfo = message;
      if (!state.running) setStatus(t("statusDetected", { total: message.total }));
      return;
    }

    if (message.type === "probe") {
      announceIfQuizFrame();
      broadcastToFrames(message);
      return;
    }

    if (message.type === "stop") {
      state.stopped = true;
      state.batchStopped = true;
      cancelPendingCollects("已停止");
      broadcastToFrames(message);
      return;
    }

    if (message.type === "export") {
      const context = findQuizContext();
      if (!context) return;
      collectQuizResults().then((results) => {
        notifyTop({ type: "exportData", requestId: message.requestId || "", results, href: location.href });
      }).catch((error) => {
        notifyTop({ type: "error", requestId: message.requestId || "", message: error?.message || String(error), href: location.href });
      });
      return;
    }

    if (message.type === "collect") {
      const context = findQuizContext();
      if (!context) return;
      collectQuizResults().then((results) => {
        notifyTop({ type: "exportData", requestId: message.requestId || "", results, href: location.href });
      }).catch((error) => {
        notifyTop({ type: "error", requestId: message.requestId || "", message: error?.message || String(error), href: location.href });
      });
      return;
    }

    if (message.type === "exportData") {
      if (window.top !== window) return;
      if (resolvePendingCollect(message)) return;
      if (!state.awaitingRemoteExport) return;
      state.awaitingRemoteExport = false;
      saveResults(message.results || []).then(() => {
        setStatus(t("statusExported", { path: state.lastSavedPath || getDirectoryDisplayName() }));
        setRunning(false);
      }).catch((error) => {
        setStatus(t("statusSaveFailed", { error: error?.message || error }));
        setRunning(false);
      });
      return;
    }

    if (message.type === "error") {
      if (rejectPendingCollect(message)) return;
      state.awaitingRemoteExport = false;
      setStatus(t("statusFailed", { error: message.message || "unknown" }));
      setRunning(false);
    }
  }

  function notifyTop(message) {
    try {
      window.top.postMessage({ source: SOURCE, ...message }, "*");
    } catch (_error) {
      // Ignore cross-context notification failures.
    }
  }

  function announceIfQuizFrame() {
    const context = findQuizContext();
    if (!context) return;
    const quiz = parseQuizText(context.text);
    if (!quiz) return;
    notifyTop({
      type: "ready",
      index: quiz.index,
      total: quiz.total,
      href: location.href,
      referrer: document.referrer
    });
  }

  function refreshDetectionStatus() {
    if (state.running) return;

    const quizContext = findQuizContext();
    if (quizContext) {
      const quiz = parseQuizText(quizContext.text);
      setStatus(quiz ? t("statusDetected", { total: quiz.total }) : t("statusReady"));
      return;
    }

    state.remoteReady = false;
    broadcastToFrames({ source: SOURCE, type: "probe" });
    setStatus(t("statusDetecting"));

    setTimeout(() => {
      if (!state.running && !findQuizContext()) {
        if (state.remoteReady && state.remoteInfo?.total) {
          setStatus(t("statusDetected", { total: state.remoteInfo.total }));
        } else {
          setStatus(t("statusNotDetected"));
        }
      }
    }, 1500);
  }

  function createPanel(forceShow) {
    let panel = document.getElementById("nlm-qe-ext-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "nlm-qe-ext-panel";
      panel.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "right:16px",
        "top:50%",
        "transform:translateY(-50%)",
        "width:52px",
        "box-sizing:border-box",
        "font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "color:#202124",
        "pointer-events:auto"
      ].join(";");

      const launcher = document.createElement("div");
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
        "background:#0b57d0",
        "color:#fff",
        "font:700 18px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "box-shadow:0 6px 18px rgba(11,87,208,0.3)",
        "cursor:pointer",
        "user-select:none"
      ].join(";");

      const content = document.createElement("div");
      content.id = "nlm-qe-ext-content";
      content.style.cssText = [
        "position:absolute",
        "right:52px",
        "top:50%",
        "transform:translateY(-50%)",
        "width:280px",
        "box-sizing:border-box",
        "padding:12px",
        "border:1px solid rgba(32,33,36,0.16)",
        "border-radius:10px",
        "background:#fff",
        "box-shadow:0 10px 28px rgba(0,0,0,0.18)",
        "display:none"
      ].join(";");

      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;";

      const title = document.createElement("div");
      title.style.cssText = "font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

      const settingsButton = document.createElement("button");
      settingsButton.type = "button";
      settingsButton.textContent = "⚙";
      settingsButton.style.cssText = [
        "width:28px",
        "height:28px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "border:1px solid #dadce0",
        "border-radius:999px",
        "background:#f8fafd",
        "color:#1a73e8",
        "font:18px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "cursor:pointer",
        "padding:0",
        "flex:0 0 auto"
      ].join(";");
      header.appendChild(title);
      header.appendChild(settingsButton);

      const actions = document.createElement("div");
      actions.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:8px;";

      const exportButton = document.createElement("button");
      exportButton.type = "button";
      exportButton.style.cssText = `${buttonStyle(false)};width:100%;`;

      const batchButton = document.createElement("button");
      batchButton.type = "button";
      batchButton.style.cssText = `${buttonStyle(false)};width:100%;`;

      const stopButton = document.createElement("button");
      stopButton.type = "button";
      stopButton.disabled = true;
      stopButton.style.cssText = `${buttonStyle(true)};width:100%;`;

      const refreshButton = document.createElement("button");
      refreshButton.type = "button";
      refreshButton.style.cssText = `${buttonStyle(false)};width:100%;`;

      const status = document.createElement("div");
      status.id = "nlm-qe-ext-status";
      status.style.cssText = "white-space:pre-wrap;color:#5f6368;min-height:18px;max-height:260px;overflow:auto;";

      const settingsPanel = document.createElement("div");
      settingsPanel.style.cssText = [
        "display:none",
        "margin-top:8px",
        "padding-top:8px",
        "border-top:1px solid rgba(32,33,36,0.12)"
      ].join(";");

      const settingsTitle = document.createElement("div");
      settingsTitle.style.cssText = "font-weight:600;margin-bottom:8px;";

      const languageRow = document.createElement("div");
      languageRow.style.cssText = "display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:10px;";
      const languageLabel = document.createElement("label");
      languageLabel.style.cssText = "font-weight:500;";
      const languageSelect = document.createElement("select");
      languageSelect.style.cssText = "width:100%;border:1px solid #dadce0;border-radius:6px;padding:6px 8px;background:#fff;color:#202124;";
      languageSelect.innerHTML = [
        '<option value="auto"></option>',
        '<option value="zh"></option>',
        '<option value="en"></option>'
      ].join("");
      languageRow.appendChild(languageLabel);
      languageRow.appendChild(languageSelect);

      const directoryLabel = document.createElement("div");
      directoryLabel.style.cssText = "font-weight:500;margin-bottom:6px;";
      const directoryRow = document.createElement("div");
      directoryRow.style.cssText = "display:grid;grid-template-columns:minmax(0,1fr) 92px;align-items:start;gap:8px;";
      const directoryText = document.createElement("div");
      directoryText.style.cssText = "font-size:12px;color:#5f6368;word-break:break-all;flex:1;";
      const directoryButton = document.createElement("button");
      directoryButton.type = "button";
      directoryButton.style.cssText = `${buttonStyle(false)};width:92px;`;
      const settingsClose = document.createElement("button");
      settingsClose.type = "button";
      settingsClose.style.cssText = `${buttonStyle(false)};margin-top:8px;width:100%;`;

      directoryRow.appendChild(directoryText);
      directoryRow.appendChild(directoryButton);
      settingsPanel.appendChild(settingsTitle);
      settingsPanel.appendChild(languageRow);
      settingsPanel.appendChild(directoryLabel);
      settingsPanel.appendChild(directoryRow);
      settingsPanel.appendChild(settingsClose);

      actions.appendChild(exportButton);
      actions.appendChild(batchButton);
      actions.appendChild(stopButton);
      actions.appendChild(refreshButton);
      content.appendChild(header);
      content.appendChild(actions);
      content.appendChild(status);
      content.appendChild(settingsPanel);
      panel.appendChild(launcher);
      panel.appendChild(content);
      document.documentElement.appendChild(panel);

      state.panel = panel;
      state.status = status;
      state.title = title;
      state.exportButton = exportButton;
      state.batchButton = batchButton;
      state.stopButton = stopButton;
      state.refreshButton = refreshButton;
      state.settingsButton = settingsButton;
      state.settingsPanel = settingsPanel;
      state.settingsTitle = settingsTitle;
      state.languageLabel = languageLabel;
      state.languageSelect = languageSelect;
      state.directoryLabel = directoryLabel;
      state.directoryButton = directoryButton;
      state.directoryText = directoryText;
      state.settingsClose = settingsClose;

      panel.addEventListener("mouseenter", () => {
        content.style.display = "block";
      });
      panel.addEventListener("mouseleave", () => {
        if (!state.running) content.style.display = "none";
      });
      launcher.addEventListener("click", () => {
        content.style.display = content.style.display === "block" ? "none" : "block";
      });
      setupPanelDragging(panel, launcher, content);

      exportButton.addEventListener("click", () => {
        runExport().catch((error) => {
          setStatus(t("statusFailed", { error: error?.message || error }));
          setRunning(false);
        });
      });
      batchButton.addEventListener("click", () => {
        runBatchExport().catch((error) => {
          setStatus(t("statusFailed", { error: error?.message || error }));
          setRunning(false);
        });
      });
      stopButton.addEventListener("click", () => {
        state.stopped = true;
        state.batchStopped = true;
        cancelPendingCollects("已停止");
        broadcastToFrames({ source: SOURCE, type: "stop" });
        setStatus(t("statusStopped"));
      });
      refreshButton.addEventListener("click", refreshDetectionStatus);
      settingsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        settingsPanel.style.display = settingsPanel.style.display === "block" ? "none" : "block";
        content.style.display = "block";
      });
      languageSelect.addEventListener("change", () => {
        localStorage.setItem(LANG_KEY, languageSelect.value);
        applyLanguage();
        refreshDetectionStatus();
      });
      directoryButton.addEventListener("click", () => {
        chooseExportDirectory().catch((error) => {
          setStatus(t("statusDirectoryFailed", { error: error?.message || error }));
        });
      });
      settingsClose.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        settingsPanel.style.display = "none";
        content.style.display = "block";
      });
      applyLanguage();
    } else {
      state.panel = panel;
      state.status = panel.querySelector("#nlm-qe-ext-status");
    }

    if (forceShow) {
      panel.style.display = "block";
      const content = panel.querySelector("#nlm-qe-ext-content");
      if (content) content.style.display = "block";
    }

    const content = panel.querySelector("#nlm-qe-ext-content");
    if (content) updatePanelDocking(panel, content);
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

  async function runExport() {
    setRunning(true);
    state.stopped = false;

    const localContext = await waitForQuizContext(1200);
    if (localContext) {
      const results = stripExplanations(await collectQuizResults());
      await saveResults(results);
      setStatus(t("statusExported", { path: state.lastSavedPath || getDirectoryDisplayName() }));
      setRunning(false);
      return;
    }

    if (window.top !== window) {
      setRunning(false);
      throw new Error("当前 frame 中没有可解析的测验题目");
    }

    state.awaitingRemoteExport = true;
    broadcastToFrames({ source: SOURCE, type: "collect" });
    setStatus(t("statusExportRequested"));
  }

  async function runBatchExport() {
    if (window.top !== window) {
      throw new Error("请在 NotebookLM 主页面运行批量导出");
    }

    setRunning(true);
    state.stopped = false;
    state.batchStopped = false;
    state.batchRunning = true;

    const entries = discoverQuizArtifacts();
    if (!entries.length) {
      setRunning(false);
      setStatus(t("statusFailed", { error: "未在当前 Notebook 页面发现测验入口" }));
      return;
    }

    setStatus(t("statusBatchDetected", { total: entries.length }));

    let done = 0;
    let failed = 0;
    const total = entries.length;

    try {
      for (let index = 0; index < total; index += 1) {
        if (state.batchStopped || state.stopped) break;

        const entry = entries[index];
        const title = entry.title || `Quiz ${index + 1}`;
        try {
          setStatus(t("statusBatchOpening", { index: index + 1, total, title }));

          const opened = await openQuizArtifact(entry);
          if (!opened) {
            failed += 1;
            continue;
          }

          const ready = await waitForRemoteReadyAfterOpen(20000);
          if (!ready && !findQuizContext()) {
            failed += 1;
            closeNotebookLmDialog();
            continue;
          }

          setStatus(t("statusBatchCollecting", { index: index + 1, total, title }));
          const results = stripExplanations(await collectCurrentVisibleQuiz());
          await saveResults(results, { title, sequence: index + 1 });
          done += 1;
          await sleep(500);
          if (index < total - 1) await returnToArtifactList(entries);
        } catch (error) {
          if (state.batchStopped || state.stopped) break;
          closeNotebookLmDialog();
          if (index < total - 1) await returnToArtifactList(entries);
          failed += 1;
        }
      }
    } finally {
      state.batchRunning = false;
      setRunning(false);
    }

    setStatus(t("statusBatchExported", {
      done,
      total,
      failed,
      path: state.lastSavedPath || getDirectoryDisplayName()
    }));
  }

  async function collectCurrentVisibleQuiz() {
    const localContext = await waitForQuizContext(1000);
    if (localContext) return await collectQuizResults();
    return await collectFromRemoteFrame();
  }

  async function collectFromRemoteFrame() {
    const requestId = `collect-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    state.activeCollectRequestId = requestId;
    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        state.pendingCollects.delete(requestId);
        reject(new Error("等待测验 frame 返回数据超时"));
      }, 90000);
      state.pendingCollects.set(requestId, { resolve, reject, timeoutId });
    });
    broadcastToFrames({ source: SOURCE, type: "collect", requestId });
    return await promise;
  }

  function resolvePendingCollect(message) {
    const requestId = message.requestId || "";
    if (!requestId) return false;
    const pending = state.pendingCollects.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    state.pendingCollects.delete(requestId);
    pending.resolve(message.results || []);
    return true;
  }

  function rejectPendingCollect(message) {
    const requestId = message.requestId || "";
    if (!requestId) return false;
    const pending = state.pendingCollects.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timeoutId);
    state.pendingCollects.delete(requestId);
    pending.reject(new Error(message.message || "测验 frame 导出失败"));
    return true;
  }

  function cancelPendingCollects(message) {
    for (const [requestId, pending] of state.pendingCollects.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
      state.pendingCollects.delete(requestId);
    }
  }

  async function collectQuizResults() {
    state.stopped = false;

    const results = [];
    const seen = new Set();
    const initialContext = await waitForQuizContext();
    if (!initialContext) throw new Error("当前 frame 中没有可解析的测验题目");

    await rewindToFirstQuestion();

    for (let step = 0; step < 200; step += 1) {
      if (state.stopped) break;

      const quizContext = await waitForQuizContext();
      if (!quizContext) throw new Error("当前 frame 中没有可解析的测验题目");

      const before = parseQuizText(quizContext.text);
      if (!before) {
        if (!results.length) throw new Error("当前测验文本无法解析");
        break;
      }

      const fingerprint = compactFingerprint(`${before.index}:${before.question}`);
      if (seen.has(fingerprint)) break;
      seen.add(fingerprint);

      setStatus(t("statusExporting", { index: before.index, total: before.total }));
      let after = before;
      if (!before.answer) {
        clickOption(quizContext.root, "A");
        await waitForAnswerReveal(before.index, fingerprint);
        const afterContext = findQuizContext() || quizContext;
        after = parseQuizText(afterContext.text) || before;
      }

      results.push({
        index: after.index,
        total: after.total,
        question: after.question,
        options: before.options,
        answer: after.answer || "",
        explanations: after.explanations || {}
      });

      if (after.index >= after.total) break;

      const currentContext = findQuizContext() || quizContext;
      if (!clickNext(currentContext.root)) {
        setStatus(t("statusFailed", { error: "next-button-not-found" }));
        break;
      }

      const advanced = await waitForQuestionAdvance(after.index, fingerprint);
      if (!advanced) {
        setStatus(t("statusFailed", { error: "question-did-not-advance" }));
        break;
      }
    }

    if (!results.length) throw new Error("没有抓取到题目");
    return results;
  }

  function broadcastToFrames(message) {
    for (const frame of Array.from(window.frames)) {
      try {
        frame.postMessage(message, "*");
        for (const nested of Array.from(frame.frames || [])) nested.postMessage(message, "*");
      } catch (_error) {
        // Ignore inaccessible frames.
      }
    }
  }

  function setRunning(running) {
    state.running = running;
    if (state.exportButton) state.exportButton.disabled = running;
    if (state.batchButton) state.batchButton.disabled = running;
    if (state.stopButton) state.stopButton.disabled = !running;
    const content = state.panel?.querySelector("#nlm-qe-ext-content");
    if (content && running) content.style.display = "block";
  }

  function setStatus(text) {
    console.info("[NotebookLM Quiz Extractor extension]", text);
    if (state.status) state.status.textContent = text;
  }

  async function waitForQuizContext(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const context = findQuizContext();
      if (context) return context;
      await sleep(300);
    }
    return null;
  }

  async function waitForQuestionAdvance(previousIndex, previousFingerprint) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const context = findQuizContext();
      const parsed = context ? parseQuizText(context.text) : null;
      if (parsed) {
        const nextFingerprint = compactFingerprint(`${parsed.index}:${parsed.question}`);
        if (parsed.index !== previousIndex || nextFingerprint !== previousFingerprint) {
          return true;
        }
      }
      await sleep(250);
    }
    return false;
  }

  async function waitForAnswerReveal(previousIndex, previousFingerprint) {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const context = findQuizContext();
      const parsed = context ? parseQuizText(context.text) : null;
      if (parsed) {
        const nextFingerprint = compactFingerprint(`${parsed.index}:${parsed.question}`);
        const hasAnswer = Boolean(parsed.answer);
        if (hasAnswer && (parsed.index === previousIndex || nextFingerprint === previousFingerprint)) {
          return true;
        }
      }
      await sleep(200);
    }
    return false;
  }

  async function rewindToFirstQuestion() {
    let guard = 0;
    while (guard < 250) {
      const context = await waitForQuizContext(1200);
      const parsed = context ? parseQuizText(context.text) : null;
      if (!parsed) return false;
      if (parsed.index <= 1) return true;
      const fingerprint = compactFingerprint(`${parsed.index}:${parsed.question}`);
      if (!clickPrevious(context.root)) return false;
      const moved = await waitForQuestionRetreat(parsed.index, fingerprint);
      if (!moved) return false;
      guard += 1;
    }
    return false;
  }

  async function waitForQuestionRetreat(previousIndex, previousFingerprint) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const context = findQuizContext();
      const parsed = context ? parseQuizText(context.text) : null;
      if (parsed) {
        const nextFingerprint = compactFingerprint(`${parsed.index}:${parsed.question}`);
        if (parsed.index < previousIndex || nextFingerprint !== previousFingerprint) {
          return true;
        }
      }
      await sleep(250);
    }
    return false;
  }

  function findQuizContext() {
    return collectQuizContexts(document).find((candidate) => parseQuizText(candidate.text)) || null;
  }

  function discoverQuizArtifacts() {
    const selectors = [
      "button",
      "[role='button']",
      "a",
      "[tabindex]",
      "[aria-label]",
      "[data-testid]",
      "[jsaction]"
    ].join(",");
    const explicitQuizCandidates = queryAllDeep(document, selectors)
      .filter(isVisible)
      .filter((element) => !element.closest?.("#nlm-qe-ext-panel"))
      .map((element) => {
        const title = extractQuizEntryTitle(element);
        return { element, row: element, title, rect: element.getBoundingClientRect() };
      })
      .filter((entry) => entry.title)
      .filter((entry) => entry.rect.width * entry.rect.height <= 260000);

    const generatedRows = [];
    const generatedSeen = new Set();
    for (const element of queryAllDeep(document, "*")) {
      if (!isVisible(element) || element.closest?.("#nlm-qe-ext-panel")) continue;
      if (!RELATIVE_TIME_RE.test(normalizeSpace(element.innerText || element.textContent || ""))) continue;
      const row = findGeneratedArtifactRow(element);
      if (!row || generatedSeen.has(row)) continue;
      generatedSeen.add(row);
      generatedRows.push(row);
    }

    const generatedArtifactCandidates = generatedRows
      .filter(isVisible)
      .filter((element) => !element.closest?.("#nlm-qe-ext-panel"))
      .map((element) => {
        const title = extractGeneratedArtifactTitle(element);
        const clickable = resolveArtifactClickTarget(element);
        return { element: clickable || element, title, row: element, rect: element.getBoundingClientRect() };
      })
      .filter((entry) => entry.title)
      .filter((entry) => isGeneratedQuizArtifact(entry.row || entry.element, entry.title))
      .filter((entry) => entry.rect.width * entry.rect.height <= 280000);

    const candidates = explicitQuizCandidates.concat(generatedArtifactCandidates)
      .sort((left, right) => {
        const leftArea = left.rect.width * left.rect.height;
        const rightArea = right.rect.width * right.rect.height;
        return leftArea - rightArea;
      });

    const selected = [];
    const seen = new Set();
    for (const entry of candidates) {
      const key = compactFingerprint(entry.title);
      if (!key || seen.has(key)) continue;
      if (selected.some((item) => item.element.contains(entry.element) || entry.element.contains(item.element))) continue;
      seen.add(key);
      selected.push(entry);
    }

    return selected.sort((left, right) => {
      const topDelta = left.rect.top - right.rect.top;
      if (Math.abs(topDelta) > 8) return topDelta;
      return left.rect.left - right.rect.left;
    });
  }

  function extractQuizEntryTitle(element) {
    const label = normalizeSpace(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`);
    const rawText = normalizeSpace(element.innerText || element.textContent || "");
    const text = normalizeSpace(`${label} ${rawText}`);
    if (!/(测验|小测|选择题|\bquiz\b)/i.test(text)) return "";
    if (isNotebookLmCreationLauncher(element, text)) return "";
    if (/(NotebookLM 测验导出|NotebookLM Quiz Export|导出全部|导出|刷新|设置|停止|Export All|Export|Refresh|Settings|Stop)/i.test(text)) return "";
    if (/(上一题|下一题|上一个|下一个|回答正确|正确答案|previous|next|correct answer)/i.test(text)) return "";
    const lines = String(element.innerText || element.textContent || label || "")
      .split(/\r?\n/)
      .map(normalizeSpace)
      .filter(Boolean)
      .filter((line) => !shouldIgnoreLine(line));
    return normalizeSpace(lines.find((line) => /(测验|小测|选择题|\bquiz\b)/i.test(line)) || lines[0] || text).slice(0, 120);
  }

  function extractGeneratedArtifactTitle(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 220 || rect.height < 36 || rect.height > 140) return "";

    const label = normalizeSpace(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`);
    const raw = String(element.innerText || element.textContent || label || "");
    const text = normalizeSpace(raw);
    if (!text) return "";
    if (isNotebookLmCreationLauncher(element, text)) return "";
    if (/(NotebookLM 测验导出|NotebookLM Quiz Export|导出全部|导出|刷新|设置|停止|Export All|Export|Refresh|Settings|Stop)/i.test(text)) return "";
    if (!RELATIVE_TIME_RE.test(text)) return "";

    const lines = raw
      .split(/\r?\n/)
      .map(normalizeSpace)
      .filter(Boolean)
      .filter((line) => !shouldIgnoreLine(line))
      .filter((line) => !/^(article|description|draft|note|notes|text_snippet|sticky_note_2|quiz|help|more_vert|chevron_forward|play_arrow|pause|open_in_new)$/i.test(line))
      .filter((line) => !RELATIVE_TIME_RE.test(line))
      .filter((line) => !/^\d+\s*个来源$/i.test(line))
      .filter((line) => !/^\d+\s*sources?$/i.test(line));
    return normalizeSpace(lines[0] || "").slice(0, 120);
  }

  function findGeneratedArtifactRow(element) {
    let current = element;
    let best = null;
    while (current && current !== document.documentElement) {
      const rect = current.getBoundingClientRect();
      const text = normalizeSpace(current.innerText || current.textContent || "");
      if (RELATIVE_TIME_RE.test(text)
        && rect.width >= 220
        && rect.height >= 36
        && rect.height <= 180
        && rect.width <= 900) {
        best = current;
      }
      const parent = current.parentElement;
      if (!parent) break;
      const parentRect = parent.getBoundingClientRect();
      if (parentRect.height > 220 || parentRect.width > 1000) break;
      current = parent;
    }
    return best;
  }

  function isGeneratedQuizArtifact(element, title) {
    const text = normalizeSpace(element.innerText || element.textContent || "");
    const label = normalizeSpace(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`);
    const lines = String(element.innerText || element.textContent || "")
      .split(/\r?\n/)
      .map(normalizeSpace)
      .filter(Boolean);

    if (lines.some((line) => /^(quiz|help|help_outline|live_help)$/i.test(line))) return true;
    if (/(测验|小测|问答|\bquiz\b|\bquestions?\b)/i.test(title)) return true;
    if (/(测验|quiz)/i.test(label)) return true;

    const iconText = Array.from(element.querySelectorAll?.("mat-icon,.material-icons,.material-symbols-outlined,.material-symbols-rounded,.material-symbols-sharp,[fonticon]") || [])
      .map((node) => normalizeSpace(node.textContent || node.getAttribute("fonticon") || node.getAttribute("data-icon") || ""))
      .join(" ");
    if (/(^|\s)(quiz|help|help_outline|live_help)(\s|$)/i.test(iconText)) return true;

    return false;
  }

  function resolveArtifactClickTarget(element) {
    const clickSelectors = [
      "button",
      "[role='button']",
      "a",
      "[tabindex]",
      "[jsaction]",
      "[data-testid]"
    ].join(",");
    let current = element;
    while (current && current !== document.documentElement) {
      if (current.matches?.(clickSelectors) && isVisible(current) && !isOverflowMenuButton(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isOverflowMenuButton(element) {
    const text = textOf(element);
    const attrs = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
    return /^(more_vert|⋮|\.\.\.)$/i.test(text) || /更多|more options|more actions/i.test(attrs);
  }

  function isNotebookLmCreationLauncher(element, text) {
    const normalized = normalizeSpace(text);
    const compact = compactFingerprint(normalized);
    if (/^(测验|quiz|自定义测验|customquiz|生成测验|generatequiz)$/.test(compact)) return true;

    const launcherNames = [
      "音频概览",
      "演示文稿",
      "视频概览",
      "思维导图",
      "报告",
      "闪卡",
      "测验",
      "信息图",
      "数据表格",
      "Audio Overview",
      "Briefing Doc",
      "Video Overview",
      "Mind Map",
      "Report",
      "Flashcards",
      "Quiz",
      "Infographic",
      "Table"
    ];
    const hasOnlyLauncherText = launcherNames.some((name) => normalized === name || normalized === `${name} chevron_forward`);
    if (hasOnlyLauncherText) return true;

    const rect = element.getBoundingClientRect();
    const looksLikeStudioAppTile = rect.width <= 260
      && rect.height <= 120
      && /chevron_forward|生成|Generate|自定义测验|Custom quiz/i.test(normalized);
    return looksLikeStudioAppTile;
  }

  async function openQuizArtifact(entry) {
    const freshEntry = await findQuizArtifactEntryByScrolling(entry.title) || (entry.element?.isConnected ? entry : findQuizArtifactEntry(entry.title));
    const element = freshEntry?.element;
    const row = freshEntry?.row || element;
    if (!element && !row) return false;
    state.remoteReady = false;
    state.remoteInfo = null;
    const scrollTarget = row || element;
    scrollTarget.scrollIntoView({ block: "center", inline: "center" });
    await sleep(250);
    const trustedClicked = await trustedClickArtifactRow(freshEntry);
    if (trustedClicked) {
      await sleep(800);
      if (state.remoteReady || findQuizContext() || hasNotebookLmArtifactFrame()) return true;
    }
    for (const target of artifactOpenTargets(freshEntry)) {
      if (!target.isConnected) break;
      clickElementLikeUser(target);
      await sleep(180);
      if (state.remoteReady || findQuizContext()) break;
    }
    return true;
  }

  async function trustedClickArtifactRow(entry) {
    const row = entry?.row || entry?.element;
    if (!row || !row.isConnected || !isVisible(row)) return false;
    const rect = row.getBoundingClientRect();
    const points = [
      { x: rect.left + Math.min(Math.max(rect.width * 0.28, 120), rect.width - 80), y: rect.top + rect.height * 0.5 },
      { x: rect.left + Math.min(Math.max(rect.width * 0.18, 80), rect.width - 80), y: rect.top + rect.height * 0.5 },
      { x: rect.left + Math.min(Math.max(rect.width * 0.45, 180), rect.width - 100), y: rect.top + rect.height * 0.5 }
    ].filter((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return hit && !hit.closest?.("#nlm-qe-ext-panel") && !isOverflowMenuButton(hit);
    });

    for (const point of points) {
      try {
        const response = await chrome.runtime.sendMessage({
          source: SOURCE,
          type: "trustedClick",
          x: Math.round(point.x),
          y: Math.round(point.y)
        });
        if (response?.ok) return true;
      } catch (_error) {
        return false;
      }
    }
    return false;
  }

  async function returnToArtifactList(entries) {
    if (hasArtifactListEntries(entries)) return true;

    const breadcrumb = findStudioBreadcrumb();
    if (breadcrumb) {
      const rect = breadcrumb.getBoundingClientRect();
      await trustedClickPoint(rect.left + Math.min(64, Math.max(24, rect.width * 0.25)), rect.top + rect.height * 0.5);
      clickElementLikeUser(breadcrumb);
      if (await waitForArtifactList(entries, 8000)) return true;
    }

    history.back();
    if (await waitForArtifactList(entries, 8000)) return true;

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true, cancelable: true, composed: true }));
    return await waitForArtifactList(entries, 4000);
  }

  function hasArtifactListEntries(entries) {
    const available = discoverQuizArtifacts();
    if (!available.length) return hasGeneratedArtifactList();
    const availableKeys = new Set(available.map((entry) => compactFingerprint(entry.title)));
    return entries.some((entry) => availableKeys.has(compactFingerprint(entry.title)));
  }

  function hasGeneratedArtifactList() {
    return queryAllDeep(document, "*").some((element) => {
      if (!isVisible(element) || element.closest?.("#nlm-qe-ext-panel")) return false;
      const rect = element.getBoundingClientRect();
      const text = normalizeSpace(element.innerText || element.textContent || "");
      return RELATIVE_TIME_RE.test(text) && rect.width >= 220 && rect.height >= 36 && rect.height <= 180;
    });
  }

  async function waitForArtifactList(entries, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (hasArtifactListEntries(entries)) return true;
      await sleep(300);
    }
    return false;
  }

  function findStudioBreadcrumb() {
    const candidates = queryAllDeep(document, "button,[role='button'],a,[tabindex],[jsaction],[data-testid],div,span")
      .filter(isVisible)
      .filter((element) => !element.closest?.("#nlm-qe-ext-panel"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.top > 180 || rect.height > 80 || rect.width > 420) return false;
        const text = normalizeSpace(element.innerText || element.textContent || element.getAttribute("aria-label") || "");
        return /^Studio(?:\s*[›>]\s*应用)?$/i.test(text) || /^Studio$/i.test(text);
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return (leftRect.width * leftRect.height) - (rightRect.width * rightRect.height);
      });
    return candidates[0] || null;
  }

  async function trustedClickPoint(x, y) {
    try {
      const response = await chrome.runtime.sendMessage({
        source: SOURCE,
        type: "trustedClick",
        x: Math.round(x),
        y: Math.round(y)
      });
      return Boolean(response?.ok);
    } catch (_error) {
      return false;
    }
  }

  function findQuizArtifactElement(title) {
    return findQuizArtifactEntry(title)?.element || null;
  }

  function findQuizArtifactEntry(title) {
    const target = compactFingerprint(title);
    if (!target) return null;
    return discoverQuizArtifacts().find((entry) => compactFingerprint(entry.title) === target) || null;
  }

  async function findQuizArtifactEntryByScrolling(title) {
    const target = compactFingerprint(title);
    if (!target) return null;

    const immediate = findQuizArtifactEntry(title);
    if (immediate) return immediate;

    for (const scroller of artifactScrollContainers()) {
      const originalTop = scroller === document.scrollingElement ? window.scrollY : scroller.scrollTop;
      const maxTop = Math.max(0, (scroller.scrollHeight || document.documentElement.scrollHeight) - (scroller.clientHeight || window.innerHeight));
      const page = Math.max(240, Math.floor((scroller.clientHeight || window.innerHeight) * 0.75));

      setScrollTop(scroller, 0);
      await sleep(250);
      for (let top = 0; top <= maxTop + page; top += page) {
        const found = findQuizArtifactEntry(title);
        if (found) return found;
        setScrollTop(scroller, Math.min(top + page, maxTop));
        await sleep(250);
      }

      setScrollTop(scroller, originalTop);
      await sleep(120);
    }

    return null;
  }

  function artifactScrollContainers() {
    const containers = Array.from(document.querySelectorAll("*"))
      .filter((element) => {
        if (!isVisible(element)) return false;
        const style = getComputedStyle(element);
        if (!/(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)) return false;
        return element.scrollHeight > element.clientHeight + 120 && element.clientHeight > 240;
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return (rightRect.width * rightRect.height) - (leftRect.width * leftRect.height);
      });

    const root = document.scrollingElement || document.documentElement;
    return containers.concat(root).filter((element, index, list) => element && list.indexOf(element) === index);
  }

  function setScrollTop(scroller, top) {
    if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) {
      window.scrollTo({ top, behavior: "instant" });
      return;
    }
    scroller.scrollTop = top;
  }

  function artifactOpenTargets(entry) {
    const result = [];
    const add = (element) => {
      if (!element || !element.isConnected || !isVisible(element)) return;
      if (element.closest?.("#nlm-qe-ext-panel") || isOverflowMenuButton(element)) return;
      if (!result.includes(element)) result.push(element);
    };

    const row = entry?.row || entry?.element;
    add(entry?.element);
    add(row);

    const titleKey = compactFingerprint(entry?.title || "");
    const descendants = Array.from(row?.querySelectorAll?.("*") || []).filter(isVisible);
    for (const element of descendants) {
      const text = normalizeSpace(element.innerText || element.textContent || "");
      if (titleKey && compactFingerprint(text).includes(titleKey)) add(element);
    }
    for (const element of descendants) {
      const text = normalizeSpace(element.innerText || element.textContent || "");
      const attrs = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
      if (/^(quiz|help|help_outline|live_help)$/i.test(text) || /测验|quiz/i.test(attrs)) add(element);
    }
    for (const element of descendants) {
      if (element.matches?.("button,[role='button'],a,[tabindex],[jsaction],[data-testid]")) add(element);
    }

    return result.slice(0, 8);
  }

  function clickElementLikeUser(element) {
    const rect = element.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    const PointerEventCtor = window.PointerEvent || MouseEvent;
    element.dispatchEvent(new MouseEvent("mouseover", options));
    element.dispatchEvent(new MouseEvent("mousemove", options));
    element.dispatchEvent(new PointerEventCtor("pointerdown", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.focus?.({ preventScroll: true });
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new PointerEventCtor("pointerup", options));
    element.dispatchEvent(new MouseEvent("click", options));
    if (typeof element.click === "function") element.click();
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true }));
    element.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true, composed: true }));
  }

  async function waitForRemoteReadyAfterOpen(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (state.remoteReady && state.remoteInfo?.total) return true;
      const context = findQuizContext();
      if (context && parseQuizText(context.text)) return true;
      broadcastToFrames({ source: SOURCE, type: "probe" });
      await sleep(hasNotebookLmArtifactFrame() ? 750 : 500);
    }
    return false;
  }

  function hasNotebookLmArtifactFrame() {
    return Array.from(document.querySelectorAll("iframe,frame")).some((frame) => {
      const src = frame.getAttribute("src") || frame.src || "";
      return /usercontent\.goog|googleusercontent\.com|blob:|notebooklm/i.test(src);
    });
  }

  function closeNotebookLmDialog() {
    const closeButton = clickableElements(document)
      .filter((element) => !element.closest?.("#nlm-qe-ext-panel"))
      .find((element) => {
        const text = textOf(element);
        const attrs = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
        return /^(关闭|close|×|x)$/i.test(text) || /关闭|close/i.test(attrs);
      });
    if (closeButton) {
      closeButton.click();
      return true;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    return false;
  }

  function diagnoseDocuments() {
    const contexts = collectQuizContexts(document);
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
      return "判断：扩展尚未收到测验 frame 回报。请在 chrome://extensions 中确认本扩展已启用，并刷新 NotebookLM。";
    }
    return "";
  }

  function collectQuizContexts(rootDocument) {
    const result = [{ kind: "doc", root: rootDocument, text: rootText(rootDocument) }];
    result.push(...collectShadowContexts(rootDocument));
    for (const frame of Array.from(rootDocument.querySelectorAll("iframe,frame"))) {
      try {
        const childDocument = frame.contentDocument;
        if (childDocument) result.push(...collectQuizContexts(childDocument));
      } catch (_error) {
        // Cross-origin frames should receive their own content script.
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
    if (root.innerText) return root.innerText;
    const pieces = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = normalizeSpace(node.nodeValue || "");
      if (text) pieces.push(text);
    }
    return pieces.join("\n");
  }

  function parseQuizText(text) {
    const lines = cleanLines(text);
    const counterInfo = parseCounterFromLines(lines);
    if (!counterInfo) return null;

    const optionIndexes = lines
      .map((line, lineIndex) => (optionLabelAt(lines, lineIndex) ? lineIndex : -1))
      .filter((lineIndex) => lineIndex >= 0);
    const firstFour = firstOrderedAbcd(lines, optionIndexes);
    if (firstFour.length !== 4) return null;

    const { index, total, lineIndex: counterIndex } = counterInfo;
    const question = normalizeSpace(
      lines
        .slice(counterIndex + 1, firstFour[0])
        .filter((line) => !shouldIgnoreLine(line))
        .map((line) => line.replace(/^Question\s*\d+\s*[:：]\s*/i, ""))
        .join(" ")
    );
    const options = extractOptions(lines, firstFour);
    const explanations = extractExplanations(lines, firstFour);
    const answer = Object.entries(explanations).find(([, explanation]) => CORRECT_RE.test(explanation))?.[0] || "";

    return { index, total, question, options, answer, explanations };
  }

  function cleanLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(normalizeSpace)
      .filter(Boolean);
  }

  function parseCounterFromLines(lines) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const chinese = lines[lineIndex].match(QUESTION_COUNTER_RE);
      if (chinese) return { index: Number(chinese[1]), total: Number(chinese[2]), lineIndex };
      const slash = lines[lineIndex].match(SLASH_COUNTER_RE);
      if (slash) return { index: Number(slash[1]), total: Number(slash[2]), lineIndex };
    }
    return null;
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

  function extractOptions(lines, optionIndexes) {
    const options = {};
    const boundaries = optionIndexes.concat(lines.length);
    optionIndexes.forEach((index, pos) => {
      const label = optionLabelAt(lines, index);
      const inline = optionInlineText(lines[index]);
      if (inline) {
        options[label] = inline;
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
      const inline = optionInlineText(lines[start]);
      const segmentStart = inline ? start + 1 : start + 2;
      const segment = trimAtGlobalExplanation(lines.slice(segmentStart, boundaries[pos + 1]));
      explanations[label] = normalizeSpace(segment.filter((line) => !shouldIgnoreLine(line) && !parseCounterFromLines([line])).join(" "));
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
    const match = String(line || "").match(OPTION_INLINE_RE);
    return match ? normalizeSpace(match[2]) : "";
  }

  function shouldIgnoreLine(line) {
    return IGNORED_LINES.has(line) || line.startsWith("keyboard_");
  }

  function trimAtGlobalExplanation(lines) {
    const index = lines.findIndex((line) => line === "chat_spark_2" || line === "解释");
    return index >= 0 ? lines.slice(0, index) : lines;
  }

  function clickOption(root, label) {
    const pattern = new RegExp(`^\\s*${label}[\\.)：:、]?\\s*`);
    const target = clickableElements(root).find((element) => pattern.test(textOf(element)))
      || findTextNodeClickable(root, label);
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return true;
  }

  function clickNext(root) {
    const candidates = clickableElements(root).filter((element) => {
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

  function clickPrevious(root) {
    const candidates = clickableElements(root).filter((element) => {
      const text = textOf(element);
      const attrs = `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`;
      return /^(上一题|上一个|previous|prev|‹|«|←)$/i.test(text)
        || /上一题|上一个|previous|prev/i.test(attrs);
    });
    if (!candidates.length) return false;
    candidates[0].scrollIntoView({ block: "center", inline: "center" });
    candidates[0].click();
    return true;
  }

  function clickableElements(root) {
    return queryAllDeep(root, "button,[role='button'],[role='radio'],label,a,[aria-label]")
      .filter(isVisible)
      .filter((element) => !element.disabled && element.getAttribute("aria-disabled") !== "true");
  }

  function findTextNodeClickable(root, label) {
    const elements = queryAllDeep(root, "div,span,p")
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
      if (element.shadowRoot) result.push(...queryAllDeep(element.shadowRoot, selector));
    }
    return result;
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 4 && rect.height > 4;
  }

  function textOf(element) {
    return normalizeSpace(element.innerText || element.textContent || element.getAttribute("aria-label") || "");
  }

  function normalizeSpace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function compactFingerprint(value) {
    return normalizeSpace(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 180);
  }

  function shortUrl(url) {
    const text = String(url || "");
    return text.length > 96 ? `${text.slice(0, 96)}...` : text;
  }

  async function downloadText(filename, text, mimeType) {
    const saveAs = getSaveAsPreference();
    const response = await chrome.runtime.sendMessage({
      source: SOURCE,
      type: "download",
      filename,
      text,
      mimeType,
      saveAs
    });
    if (!response?.ok) throw new Error(response?.error || `下载失败：${filename}`);
  }

  async function saveResults(results, options = {}) {
    if (!results.length) throw new Error("没有可保存的题目");

    const title = options.title || extractQuizTitle() || "NotebookLM Quiz";
    const sequencePrefix = options.sequence ? `${String(options.sequence).padStart(2, "0")}-` : "";
    const base = `${sequencePrefix}${sanitizeFilename(title)}-${timestamp()}`;
    const files = [
      { filename: `${base}.json`, text: JSON.stringify(results, null, 2), mimeType: "application/json;charset=utf-8" },
      { filename: `${base}.md`, text: renderMarkdown(results), mimeType: "text/markdown;charset=utf-8" }
    ];

    const handle = await getStoredDirectoryHandle();
    if (handle) {
      const writableHandle = await ensureDirectoryPermission(handle);
      if (writableHandle) {
        for (const file of files) {
          await writeFileToDirectory(writableHandle, file.filename, file.text);
        }
        state.lastSavedPath = getDirectoryDisplayName();
        return;
      }
    }

    for (let index = 0; index < files.length; index += 1) {
      await downloadText(files[index].filename, files[index].text, files[index].mimeType);
    }
    state.lastSavedPath = getDirectoryDisplayName();
  }

  async function chooseExportDirectory() {
    if (typeof window.showDirectoryPicker !== "function") {
      throw new Error("当前页面不支持目录选择 API");
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await setStoredDirectoryHandle(handle);
    localStorage.setItem(DIR_NAME_KEY, handle.name);
    localStorage.setItem("nlm-qe-ext-save-as", "false");
    updateSettingsSummary();
    setStatus(t("statusDirectorySet", { path: getDirectoryDisplayName() }));
  }

  function getSaveAsPreference() {
    const value = localStorage.getItem("nlm-qe-ext-save-as");
    if (value === null) return false;
    return value === "true";
  }

  function loadPanelPosition() {
    const panel = state.panel;
    const content = panel?.querySelector("#nlm-qe-ext-content");
    if (!panel || !content) return;
    try {
      const raw = localStorage.getItem(PANEL_POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.left === "number" && typeof parsed.top === "number") {
        panel.style.left = `${parsed.left}px`;
        panel.style.top = `${parsed.top}px`;
        panel.style.right = "auto";
        panel.style.transform = "none";
        ensurePanelVisible();
      }
    } catch (_error) {
      // Ignore bad panel state.
    }
  }

  function applyLanguage() {
    if (!state.title) return;
    state.title.textContent = t("panelTitle");
    state.exportButton.textContent = t("export");
    if (state.batchButton) state.batchButton.textContent = t("exportAll");
    state.stopButton.textContent = t("stop");
    state.refreshButton.textContent = t("refresh");
    state.settingsButton.textContent = "⚙";
    state.settingsButton.title = t("settings");
    state.settingsButton.setAttribute("aria-label", t("settings"));
    state.settingsTitle.textContent = t("settingsTitle");
    state.languageLabel.textContent = t("language");
    state.languageSelect.options[0].textContent = t("languageAuto");
    state.languageSelect.options[1].textContent = t("languageZh");
    state.languageSelect.options[2].textContent = t("languageEn");
    state.directoryLabel.textContent = t("exportDir");
    state.directoryButton.textContent = t("chooseDir");
    state.settingsClose.textContent = t("close");
    if (!state.status?.textContent) state.status.textContent = t("statusReady");
    updateSettingsSummary();
  }

  function updateSettingsSummary() {
    if (state.directoryText) state.directoryText.textContent = t("currentDir", { path: getDirectoryDisplayName() });
  }

  function getLanguage() {
    const stored = localStorage.getItem(LANG_KEY) || "auto";
    if (state.languageSelect && state.languageSelect.value !== stored) state.languageSelect.value = stored;
    if (stored === "zh" || stored === "en") return stored;
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function t(key, params = {}) {
    const lang = getLanguage();
    const entry = I18N[lang][key];
    if (typeof entry === "function") return entry(params);
    return entry ?? key;
  }

  function getDirectoryDisplayName() {
    return localStorage.getItem(DIR_NAME_KEY) || t("defaultDir");
  }

  function extractQuizTitle() {
    const candidates = [
      "input[aria-label='制品标题']",
      "input[aria-label='Artifact title']",
      "input[title='制品标题']",
      "input[title='Artifact title']",
      "[aria-label='制品标题']",
      "[aria-label='Artifact title']"
    ];
    for (const selector of candidates) {
      const element = document.querySelector(selector);
      const value = normalizeSpace(element?.value || element?.textContent || "");
      if (value) return value;
    }
    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).map((node) => normalizeSpace(node.textContent));
    const title = headings.find((value) => value && /测验|quiz/i.test(value));
    return title || normalizeSpace(document.title.replace(/\s*-\s*NotebookLM.*$/i, ""));
  }

  function sanitizeFilename(value) {
    return normalizeSpace(value)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 120) || "NotebookLM_Quiz";
  }

  function savePanelPosition(left, top) {
    localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ left, top }));
  }

  function ensurePanelVisible() {
    const panel = state.panel;
    const content = panel?.querySelector("#nlm-qe-ext-content");
    if (!panel || !content) return;

    const rect = panel.getBoundingClientRect();
    const panelWidth = Math.max(Math.ceil(rect.width || panel.offsetWidth || 52), 52);
    const panelHeight = Math.max(Math.ceil(rect.height || panel.offsetHeight || 44), 44);
    const maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);

    let nextLeft = rect.left;
    let nextTop = rect.top;

    const usesStoredPosition = panel.style.left && panel.style.left !== "auto";
    if (!usesStoredPosition) {
      nextLeft = maxLeft;
      nextTop = clamp(Math.round(window.innerHeight * 0.5 - panelHeight * 0.5), 8, maxTop);
    } else {
      nextLeft = clamp(Math.round(nextLeft), 8, maxLeft);
      nextTop = clamp(Math.round(nextTop), 8, maxTop);
    }

    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
    panel.style.right = "auto";
    panel.style.transform = "none";
    updatePanelDocking(panel, content);
    savePanelPosition(nextLeft, nextTop);
  }

  function setupPanelDragging(panel, launcher, content) {
    launcher.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      state.drag = {
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
        moved: false
      };
      launcher.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    launcher.addEventListener("pointermove", (event) => {
      if (!state.drag) return;
      const nextLeft = clamp(event.clientX - state.drag.dx, 8, window.innerWidth - 60);
      const nextTop = clamp(event.clientY - state.drag.dy, 8, window.innerHeight - 60);
      panel.style.left = `${nextLeft}px`;
      panel.style.top = `${nextTop}px`;
      panel.style.right = "auto";
      panel.style.transform = "none";
      updatePanelDocking(panel, content);
      savePanelPosition(nextLeft, nextTop);
      state.drag.moved = true;
    });

    launcher.addEventListener("pointerup", (event) => {
      if (!state.drag) return;
      launcher.releasePointerCapture?.(event.pointerId);
      const moved = state.drag.moved;
      state.drag = null;
      if (moved) event.stopPropagation();
    });

    launcher.addEventListener("pointercancel", () => {
      state.drag = null;
    });
  }

  function updatePanelDocking(panel, content) {
    const rect = panel.getBoundingClientRect();
    if (rect.left < window.innerWidth / 2) {
      content.style.left = "52px";
      content.style.right = "auto";
    } else {
      content.style.right = "52px";
      content.style.left = "auto";
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  async function openDatabase() {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function setStoredDirectoryHandle(handle) {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function getStoredDirectoryHandle() {
    const db = await openDatabase();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const request = tx.objectStore(IDB_STORE).get(DIR_HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  }

  async function ensureDirectoryPermission(handle) {
    try {
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission === "granted") return handle;
      return null;
    } catch (_error) {
      return null;
    }
  }

  async function writeFileToDirectory(handle, filename, text) {
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
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
      }
      lines.push("");
    }
    return `${lines.join("\n").trim()}\n`;
  }

  function stripExplanations(results) {
    return results.map((item) => ({
      index: item.index,
      total: item.total,
      question: item.question,
      options: item.options,
      answer: item.answer || ""
    }));
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
      pad(now.getSeconds())
    ].join("");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
