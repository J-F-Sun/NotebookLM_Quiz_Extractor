# NotebookLM Quiz Extractor Chrome Extension

[中文](#中文说明) | [English](#english)

## 中文说明

### 安装

1. 打开 `chrome://extensions/`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择目录：

   `/path/to/NotebookLMQuizExtractor/chrome-extension`

5. 刷新 NotebookLM 页面

### 说明

该扩展会注入 NotebookLM 及其相关 usercontent frame，用于识别测验内容并导出：

- `json`
- `md`

导出结果只保留题目、选项和答案，不保留逐项解释。

面板中的 `导出全部` 会按当前 Notebook 页面中发现的已生成测验顺序逐个打开测验，并将每个测验保存成单独文件。批量导出会在 Studio 列表中按标题滚动查找测验，每导出一个测验后自动返回列表继续下一个。

设置入口位于面板标题栏右侧齿轮按钮。Chrome 工具栏和悬浮入口使用蓝色圆形 `Q` 图标。

当前版本包含 `downloads` 和 `debugger` 权限。`downloads` 用于保存导出文件；`debugger` 仅用于在 NotebookLM 忽略脚本合成点击时，派发更接近真实鼠标点击的打开测验动作。

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

### 当前版本

- `0.2.0`

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

   `/path/to/NotebookLMQuizExtractor/chrome-extension`

5. Refresh the NotebookLM page

### Notes

This extension injects into NotebookLM and related usercontent frames so it can detect quiz content and export:

- `json`
- `md`

The exported output keeps only question, options, and answer, and omits per-option explanations.

The `Export All` action opens generated quiz entries in page order and saves each quiz as separate files. During batch export, the extension scrolls the Studio list by title, returns to the list after each quiz, and continues with the next quiz.

Settings are available from the gear button in the panel header. The Chrome toolbar and floating launcher use a blue circular `Q` icon.

The current version requests `downloads` and `debugger`. `downloads` saves exported files. `debugger` is used only as a fallback to dispatch a more realistic mouse click when NotebookLM ignores synthetic DOM clicks.

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

### Current Version

- `0.2.0`

### Chrome Web Store packaging

- Only package the extension files inside `chrome-extension/`
- The upload zip should include `manifest.json`, `background.js`, `content.js`, and `icons/`
- `assets/source/` keeps source artwork and editable master images
- `assets/store/` keeps Chrome Web Store screenshots and promo graphics
- Do not upload the whole repository, and do not include `tampermonkey/`
