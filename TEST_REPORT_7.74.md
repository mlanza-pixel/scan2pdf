# v7.74 verification report

**Executed locally:** upstream source import; real 2-page and 5-page image-backed PDF generation at 85 DPI; PyMuPDF page count, embedded images, absence of text layer, minimum size, SHA-256 manifest.

- ocrtestdata_002pages_85dpi.pdf: 2 pages, 474,995 bytes, 2 image-backed pages, 0.37 s, SHA-256 `cd18d891fcc4fdbd891fbf44faca22b8d47a850d5d76e7ff2bbe818365cfb61b`
- ocrtestdata_005pages_85dpi.pdf: 5 pages, 919,481 bytes, 5 image-backed pages, 0.67 s, SHA-256 `07dd3c55f0378127071df213737669fab7e6bfff6afd44e3e93fb7c033786a79`

**Not executed:** full GitHub Actions run; mobile iPad/iPhone; end-to-end app OCR of upstream PDFs; OCR accuracy ground truth; screenshots on real devices.
