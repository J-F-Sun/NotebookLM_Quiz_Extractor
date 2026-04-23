chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.source !== "nlm-qe-ext" || message.type !== "download") return false;

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
