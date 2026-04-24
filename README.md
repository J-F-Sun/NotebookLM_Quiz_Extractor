# NotebookLM Quiz Extractor

[中文](#中文说明) | [English](#english)

## 中文说明

### 项目简介

`NotebookLM Quiz Extractor` 用于从 NotebookLM 右侧应用区域中的选择题测验里导出题目数据，输出为：

- `json`
- `md`

当前稳定实现是 [chrome-extension](NotebookLMQuizExtractor/chrome-extension)，用于处理 NotebookLM 的 iframe / blob 制品页面。它可以导出整个测验，而不只是当前题目。

### 功能特性

- 检测 NotebookLM 中由应用 / iframe / blob 渲染的测验内容
- 导出完整测验到 `json` 和 `md`
- 导出前自动回到第 1 题并顺序抓取
- 导出结果只保留题目、选项和答案，不保留逐项解释
- 支持固定导出目录
- 悬浮启动球可拖动，并会记忆位置
- 支持中英文界面

### 仓库结构

- [chrome-extension](NotebookLMQuizExtractor/chrome-extension)：主实现，推荐实际使用
- [tampermonkey](NotebookLMQuizExtractor/tampermonkey)：实验 / 测试路径，当前不建议作为正式发布版本

### Chrome 插件安装

1. 打开 `chrome://extensions/`
2. 开启 `Developer mode`
3. 点击 `Load unpacked`
4. 选择目录：

   `NotebookLMQuizExtractor/chrome-extension`

5. 刷新 NotebookLM 页面

### 使用方法

1. 打开 NotebookLM 笔记本，并在右侧应用区域显示测验
2. 点击悬浮 `Q` 按钮
3. 点击 `刷新`
4. 确认插件检测到了题目总数
5. 如有需要，打开 `设置`：
   - 切换界面语言
   - 选择固定导出目录
6. 点击 `导出`

### 导出文件命名

导出文件名格式为：

`<测验标题>-<YYYYMMDD-HHMMSS>.json`

以及：

`<测验标题>-<YYYYMMDD-HHMMSS>.md`

### 导出内容说明

- 导出结果不包含 `explanations` 字段
- `md` 文件中也不会保留选项解释行

### 说明

- NotebookLM 的测验内容通常渲染在跨域 iframe / blob 上下文中，因此当前主实现采用 Chrome Extension 方案
- Tampermonkey 版本目前保留在仓库中，仅作实验 / 测试用途

### 当前状态

- `chrome-extension/`：活跃维护
- `tampermonkey/`：实验中，待进一步测试

---

## English

### Overview

`NotebookLM Quiz Extractor` exports multiple-choice quizzes from the NotebookLM app panel into:

- `json`
- `md`

The current stable implementation is the [chrome-extension](NotebookLMQuizExtractor/chrome-extension). It is designed for NotebookLM's iframe / blob-based rendering model and can export the full quiz, not only the current question.

### Features

- Detects quiz content rendered through NotebookLM app / iframe / blob views
- Exports the full quiz to both `json` and `md`
- Rewinds to question 1 before sequential export
- Keeps only question, options, and answer in the exported output
- Supports a fixed export directory
- Floating launcher is draggable and remembers its position
- Supports both Chinese and English UI

### Repository Layout

- [chrome-extension](NotebookLMQuizExtractor/chrome-extension): main implementation, recommended for actual use
- [tampermonkey](NotebookLMQuizExtractor/tampermonkey): experimental / test path, not recommended as the release target

### Install the Chrome Extension

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select:

   `NotebookLMQuizExtractor/chrome-extension`

5. Refresh the NotebookLM page

### Usage

1. Open a NotebookLM notebook and show the quiz in the right-side app panel
2. Click the floating `Q` launcher
3. Click `Refresh`
4. Confirm the extension detects the total number of questions
5. Open `Settings` if needed:
   - change UI language
   - choose a fixed export directory
6. Click `Export`

### Output Filename Format

Exported filenames use:

`<quiz-title>-<YYYYMMDD-HHMMSS>.json`

and:

`<quiz-title>-<YYYYMMDD-HHMMSS>.md`

### Output Content

- The exported data does not include the `explanations` field
- The `md` output also omits per-option explanation lines

### Notes

- NotebookLM quiz content is usually rendered inside cross-origin iframe / blob contexts, which is why the Chrome extension is the primary implementation
- The Tampermonkey version remains in the repository only for experimental / testing purposes

### Status

- `chrome-extension/`: actively maintained
- `tampermonkey/`: experimental, pending further testing
