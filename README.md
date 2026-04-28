# NotebookLM Quiz Extractor

[中文](#中文说明) | [English](#english)

## 中文说明

### 项目简介

`NotebookLM Quiz Extractor` 用于从 NotebookLM 右侧应用区域中的选择题测验里导出题目数据，输出为：

- `json`
- `md`

当前稳定实现是 [chrome-extension](/path/to/NotebookLMQuizExtractor/chrome-extension)，用于处理 NotebookLM 的 iframe / blob 制品页面。它可以导出整个测验，而不只是当前题目。

### 功能特性

- 检测 NotebookLM 中由应用 / iframe / blob 渲染的测验内容
- 导出完整测验到 `json` 和 `md`
- 自动按页面顺序打开并导出当前 Notebook 中发现的已生成测验
- 批量导出时会在 Studio 列表中按标题滚动查找测验，导出后自动返回列表继续下一个
- 导出前自动回到第 1 题并顺序抓取
- 导出结果只保留题目、选项和答案，不保留逐项解释
- 支持固定导出目录
- 悬浮启动球可拖动，并会记忆位置
- 支持中英文界面，设置入口位于面板标题栏右侧齿轮按钮
- 使用蓝色圆形 `Q` 图标作为 Chrome 工具栏和悬浮启动入口

### 仓库结构

- [chrome-extension](/path/to/NotebookLMQuizExtractor/chrome-extension)：主实现，推荐实际使用
- [tampermonkey](/path/to/NotebookLMQuizExtractor/tampermonkey)：实验 / 测试路径，当前不建议作为正式发布版本

### Chrome 插件安装

1. 打开 `chrome://extensions/`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择目录：

   `/path/to/NotebookLMQuizExtractor/chrome-extension`

5. 刷新 NotebookLM 页面

> 当前版本包含 `downloads` 和 `debugger` 权限。`downloads` 用于保存导出文件；`debugger` 仅用于在 NotebookLM 忽略脚本合成点击时，派发更接近真实鼠标点击的打开测验动作。

### 使用方法

1. 打开 NotebookLM 笔记本，并在右侧应用区域显示测验
2. 点击悬浮 `Q` 按钮
3. 点击 `刷新`
4. 确认插件检测到了题目总数
5. 如有需要，点击标题栏右侧齿轮按钮打开设置：
   - 切换界面语言
   - 选择固定导出目录
6. 点击 `导出`

### 批量导出所有测验

1. 打开 NotebookLM 笔记本主页，确保包含测验入口的列表区域已加载
2. 点击悬浮 `Q` 按钮
3. 点击 `导出全部`
4. 插件会按页面顺序自动打开每个测验，并将每个测验保存为单独的 `json` 和 `md` 文件
5. 每导出一个测验后，插件会返回 Studio 列表并继续查找下一个测验

批量导出会根据测验图标、标题和 NotebookLM 生成内容列表识别测验，并尽量排除普通文稿、报告、音频概览等非测验内容。如果列表尚未加载或测验被 NotebookLM 折叠到不可访问区域，可能需要先滚动 Studio 列表让内容加载。

### 导出文件命名

导出文件名格式为：

`<测验标题>-<YYYYMMDD-HHMMSS>.json`

以及：

`<测验标题>-<YYYYMMDD-HHMMSS>.md`

批量导出时文件名前会加上序号，例如：

`01-<测验标题>-<YYYYMMDD-HHMMSS>.json`

### 导出内容说明

- 导出结果不包含 `explanations` 字段
- `md` 文件中也不会保留选项解释行

### 说明

- NotebookLM 的测验内容通常渲染在跨域 iframe / blob 上下文中，因此当前主实现采用 Chrome Extension 方案
- 批量导出依赖 NotebookLM 当前页面 DOM 和交互行为；如果 NotebookLM 更新 UI，可能需要同步调整识别规则
- Tampermonkey 版本目前保留在仓库中，仅作实验 / 测试用途

### 当前状态

- `chrome-extension/`：活跃维护，当前版本 `0.2.0`
- `tampermonkey/`：实验中，待进一步测试

---

## English

### Overview

`NotebookLM Quiz Extractor` exports multiple-choice quizzes from the NotebookLM app panel into:

- `json`
- `md`

The current stable implementation is the [chrome-extension](/path/to/NotebookLMQuizExtractor/chrome-extension). It is designed for NotebookLM's iframe / blob-based rendering model and can export the full quiz, not only the current question.

### Features

- Detects quiz content rendered through NotebookLM app / iframe / blob views
- Exports the full quiz to both `json` and `md`
- Automatically opens and exports generated quiz entries discovered in the current Notebook, in page order
- During batch export, scrolls the Studio list by title, returns to the list after each quiz, and continues with the next quiz
- Rewinds to question 1 before sequential export
- Keeps only question, options, and answer in the exported output
- Supports a fixed export directory
- Floating launcher is draggable and remembers its position
- Supports both Chinese and English UI, with Settings behind the gear button in the panel header
- Uses a blue circular `Q` icon for the Chrome toolbar and floating launcher

### Repository Layout

- [chrome-extension](/path/to/NotebookLMQuizExtractor/chrome-extension): main implementation, recommended for actual use
- [tampermonkey](/path/to/NotebookLMQuizExtractor/tampermonkey): experimental / test path, not recommended as the release target

### Install the Chrome Extension

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:

   `/path/to/NotebookLMQuizExtractor/chrome-extension`

5. Refresh the NotebookLM page

> The current version requests `downloads` and `debugger`. `downloads` saves exported files. `debugger` is used only as a fallback to dispatch a more realistic mouse click when NotebookLM ignores synthetic DOM clicks.

### Usage

1. Open a NotebookLM notebook and show the quiz in the right-side app panel
2. Click the floating `Q` launcher
3. Click `Refresh`
4. Confirm the extension detects the total number of questions
5. Click the gear button in the panel header if needed:
   - change UI language
   - choose a fixed export directory
6. Click `Export`

### Batch Export All Quizzes

1. Open the NotebookLM notebook page and make sure the list area containing quiz entries has loaded
2. Click the floating `Q` launcher
3. Click `Export All`
4. The extension will open each quiz in page order and save each quiz as separate `json` and `md` files
5. After each quiz is exported, the extension returns to the Studio list and continues with the next quiz

Batch export identifies quizzes from quiz icons, titles, and NotebookLM generated-content rows, while trying to exclude regular documents, reports, and audio overviews. If the list has not loaded or NotebookLM keeps items outside the accessible DOM, scroll the Studio list first so the entries load.

### Output Filename Format

Exported filenames use:

`<quiz-title>-<YYYYMMDD-HHMMSS>.json`

and:

`<quiz-title>-<YYYYMMDD-HHMMSS>.md`

Batch export prefixes filenames with a sequence number, for example:

`01-<quiz-title>-<YYYYMMDD-HHMMSS>.json`

### Output Content

- The exported data does not include the `explanations` field
- The `md` output also omits per-option explanation lines

### Notes

- NotebookLM quiz content is usually rendered inside cross-origin iframe / blob contexts, which is why the Chrome extension is the primary implementation
- Batch export depends on NotebookLM's current DOM and interaction behavior; if NotebookLM changes its UI, the detection rules may need updates
- The Tampermonkey version remains in the repository only for experimental / testing purposes

### Status

- `chrome-extension/`: actively maintained, current version `0.2.0`
- `tampermonkey/`: experimental, pending further testing
