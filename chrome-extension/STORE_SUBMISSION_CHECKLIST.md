# Chrome Web Store Submission Checklist

This file tracks what is ready for Chrome Web Store upload and what is still missing.

## Ready

- Manifest V3 extension package
- Runtime files separated into a clean upload directory
- Standard extension icons:
  - `icons/icon16.png`
  - `icons/icon32.png`
  - `icons/icon48.png`
  - `icons/icon64.png`
  - `icons/icon128.png`
- Upload zip generated:
  - `dist/notebooklm-quiz-extractor-chrome-web-store.zip`

## Still needed before submission

### Store listing text

- Short description
- Detailed description
- Category selection
- Language selection

### Store graphics

- At least 1 screenshot of the extension in use
- Recommended additional screenshots showing:
  - quiz detected
  - export completed
  - settings panel

### Privacy / compliance

- Privacy disclosure answers in Chrome Web Store dashboard
- Clear statement that quiz data is processed locally in the browser
- Clear statement that the extension is unofficial and not affiliated with Google

### Suggested supporting text

- Test instructions for reviewers:
  1. Open NotebookLM
  2. Open a quiz in the right-side app panel
  3. Click the floating `Q` button
  4. Click `Refresh`
  5. Click `Export`

## Notes

- The current extension icon is valid for packaging, but it uses a solid white background instead of transparency.
- This is acceptable for a first submission, but a transparent-background icon with a little more padding would usually look cleaner in Chrome surfaces.
- `assets/source/` contains design source images and editable masters.
- `assets/store/` contains store screenshots and promo graphics for the listing.
- Neither `assets/source/` nor `assets/store/` is required in the upload zip.
