# NotebookLM Quiz Extractor Chrome Extension

[中文](#中文说明) | [English](#english)

## 中文说明

### 安装

1. 打开 `chrome://extensions/`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择目录：

   `NotebookLMQuizExtractor/chrome-extension`

5. 刷新 NotebookLM 页面

### 说明

该扩展会注入 NotebookLM 及其相关 usercontent frame，用于识别测验内容并导出：

- `json`
- `md`

导出结果只保留题目、选项和答案，不保留逐项解释。

### 目录结构

```text
chrome-extension/
  manifest.json
  background.js
  content.js
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon64.png
    icon128.png
  assets/
    source/
      logo_icon.png
      logo_icon2.png
      logo_icon_modified.png
      cover.png
      cover2.png
      cover_top.png
    store/
      ui01.jpg
      ui02.jpg
      ui03.jpg
      output01.jpg
      cover2_modified.png
      cover_top_modified.png
  README.md
```

### 提交 Chrome Web Store

- 上传时只打包 `chrome-extension/` 目录内的扩展文件
- 建议将 `manifest.json`、`background.js`、`content.js`、`icons/` 压缩为一个 zip
- `assets/source/` 用于保存设计源图和母版素材
- `assets/store/` 用于保存 Chrome Web Store 会实际使用的截图和宣传图
- 不要上传整个仓库，也不要把 `tampermonkey/` 一起打包

---

## English

### Install

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:

   `NotebookLMQuizExtractor/chrome-extension`

5. Refresh the NotebookLM page

### Notes

This extension injects into NotebookLM and related usercontent frames so it can detect quiz content and export:

- `json`
- `md`

The exported output keeps only question, options, and answer, and omits per-option explanations.

### Directory layout

```text
chrome-extension/
  manifest.json
  background.js
  content.js
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon64.png
    icon128.png
  assets/
    source/
      logo_icon.png
      logo_icon2.png
      logo_icon_modified.png
      cover.png
      cover2.png
      cover_top.png
    store/
      ui01.jpg
      ui02.jpg
      ui03.jpg
      output01.jpg
      cover2_modified.png
      cover_top_modified.png
  README.md
```

### Chrome Web Store packaging

- Only package the extension files inside `chrome-extension/`
- The upload zip should include `manifest.json`, `background.js`, `content.js`, and `icons/`
- `assets/source/` keeps source artwork and editable master images
- `assets/store/` keeps Chrome Web Store screenshots and promo graphics
- Do not upload the whole repository, and do not include `tampermonkey/`
