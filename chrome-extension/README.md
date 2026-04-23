# NotebookLM Quiz Extractor Chrome Extension

[中文](#中文说明) | [English](#english)

## 中文说明

### 安装

1. 打开 `chrome://extensions/`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择目录：

   `REPO_ROOT/chrome-extension`

5. 刷新 NotebookLM 页面

### 说明

该扩展会注入 NotebookLM 及其相关 usercontent frame，用于识别测验内容并导出：

- `json`
- `md`

导出结果只保留题目、选项和答案，不保留逐项解释。

---

## English

### Install

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:

   `REPO_ROOT/chrome-extension`

5. Refresh the NotebookLM page

### Notes

This extension injects into NotebookLM and related usercontent frames so it can detect quiz content and export:

- `json`
- `md`

The exported output keeps only question, options, and answer, and omits per-option explanations.
