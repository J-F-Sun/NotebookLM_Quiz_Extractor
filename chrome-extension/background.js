chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.source !== "nlm-qe-ext") return false;

  if (message.type === "trustedClick") {
    const tabId = _sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "missing-tab-id" });
      return false;
    }

    dispatchTrustedClick(tabId, message.x, message.y).then(() => {
      sendResponse({ ok: true });
    }).catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

    return true;
  }

  if (message.type !== "download") return false;

  const url = `data:${message.mimeType || "text/plain;charset=utf-8"},${encodeURIComponent(message.text || "")}`;
  chrome.downloads.download(
    {
      url,
      filename: message.filename || "notebooklm-quiz.txt",
      saveAs: Boolean(message.saveAs),
      conflictAction: "uniquify"
    },
    (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        sendResponse({ ok: false, error: error.message });
        return;
      }
      sendResponse({ ok: true, downloadId });
    }
  );

  return true;
});

async function dispatchTrustedClick(tabId, x, y) {
  const target = { tabId };
  let attached = false;
  try {
    await debuggerAttach(target);
    attached = true;
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none"
    });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1
    });
    await debuggerSendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: 1
    });
  } finally {
    if (attached) {
      try {
        await debuggerDetach(target);
      } catch (_error) {
        // Ignore detach failures after the tab changes state.
      }
    }
  }
}

function debuggerAttach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, "1.3", () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function debuggerSendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

function debuggerDetach(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}
