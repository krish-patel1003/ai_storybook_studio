"""PDF and EPUB export helpers for storybooks."""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass

# ── Font registry ─────────────────────────────────────────────────────────────

_FONT_DIR = "/usr/share/fonts/truetype"

EXPORT_FONTS: dict[str, dict] = {
    "nunito": {
        "label": "Nunito",
        "file_regular": f"{_FONT_DIR}/Nunito-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Nunito-Bold.ttf",
        "css_family":   "'Nunito', sans-serif",
    },
    "patrick-hand": {
        "label": "Patrick Hand",
        "file_regular": f"{_FONT_DIR}/PatrickHand-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/PatrickHand-Regular.ttf",  # no bold variant
        "css_family":   "'Patrick Hand', cursive",
    },
    "merriweather": {
        "label": "Merriweather",
        "file_regular": f"{_FONT_DIR}/Merriweather-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Merriweather-Regular.ttf",
        "css_family":   "'Merriweather', serif",
    },
    "quicksand": {
        "label": "Quicksand",
        "file_regular": f"{_FONT_DIR}/Quicksand-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Quicksand-Regular.ttf",
        "css_family":   "'Quicksand', sans-serif",
    },
    "caveat": {
        "label": "Caveat",
        "file_regular": f"{_FONT_DIR}/Caveat-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Caveat-Regular.ttf",
        "css_family":   "'Caveat', cursive",
    },
}

DEFAULT_EXPORT_FONT = "nunito"
_FONT_TITLE = f"{_FONT_DIR}/Fredoka-Bold.ttf"


@dataclass
class ExportPage:
    order: int
    is_cover: bool
    text: str | None
    image_bytes: bytes | None  # None if not yet illustrated
    author: str = ""


# ── Image helpers ─────────────────────────────────────────────────────────────

def _cover_crop(image_bytes: bytes, w_mm: float, h_mm: float, dpi: int = 150) -> bytes:
    """
    Crop/scale image to exactly fill w_mm × h_mm at `dpi`.
    Returns JPEG bytes ready for fpdf2's pdf.image().
    """
    from PIL import Image as PILImage

    mm_per_inch = 25.4
    tw = int(w_mm * dpi / mm_per_inch)
    th = int(h_mm * dpi / mm_per_inch)

    img = PILImage.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    iw, ih = img.size

    # Scale so both dimensions are covered (object-fit: cover)
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), PILImage.LANCZOS)

    # Centre-crop to target
    left = (nw - tw) // 2
    top  = (nh - th) // 2
    img = img.crop((left, top, left + tw, top + th))

    if img.mode == "RGBA":
        bg = PILImage.new("RGB", img.size, (250, 248, 243))
        bg.paste(img, mask=img.split()[3])
        img = bg

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return buf.read()


def _story_page_composite(
    image_bytes: bytes,
    w_mm: float,
    h_mm: float,
    text_zone_frac: float = 0.36,
    dpi: int = 150,
) -> bytes:
    """
    Crop/scale the image to fill the page, then composite a paper-white
    gradient over the bottom portion (matching the reader's blend).
    Returns JPEG bytes.
    """
    from PIL import Image as PILImage, ImageFilter
    import numpy as np

    mm_per_inch = 25.4
    tw = int(w_mm * dpi / mm_per_inch)
    th = int(h_mm * dpi / mm_per_inch)

    img = PILImage.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    iw, ih = img.size

    # Cover-scale then centre-crop
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), PILImage.LANCZOS)
    left = (nw - tw) // 2
    top  = (nh - th) // 2
    img = img.crop((left, top, left + tw, top + th))

    if img.mode == "RGBA":
        bg = PILImage.new("RGB", img.size, (250, 248, 243))
        bg.paste(img, mask=img.split()[3])
        img = bg

    # Build gradient overlay — starts at gradient_top_frac, opaque at bottom
    gradient_top_frac = text_zone_frac + 0.16   # gradient bleeds 16 pp above text
    grad_start_y = int(th * (1.0 - gradient_top_frac))
    grad_h = th - grad_start_y

    # Create RGBA overlay of paper white with alpha ramp
    overlay = PILImage.new("RGBA", (tw, th), (0, 0, 0, 0))
    paper = (250, 248, 243)
    arr = np.zeros((th, tw, 4), dtype=np.uint8)

    for row in range(grad_start_y, th):
        t = (row - grad_start_y) / grad_h           # 0 → 1
        alpha = int(min(255, t ** 1.6 * 300))        # ease-in curve, clamp 255
        arr[row, :] = [paper[0], paper[1], paper[2], alpha]

    overlay = PILImage.fromarray(arr, "RGBA")
    img_rgba = img.convert("RGBA")
    composited = PILImage.alpha_composite(img_rgba, overlay)
    result = composited.convert("RGB")

    buf = io.BytesIO()
    result.save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return buf.read()


# ── PDF ───────────────────────────────────────────────────────────────────────

def _build_pdf_sync(
    title: str,
    pages: list[ExportPage],
    author: str = "",
    font_id: str = DEFAULT_EXPORT_FONT,
) -> bytes:
    from fpdf import FPDF

    font_cfg = EXPORT_FONTS.get(font_id, EXPORT_FONTS[DEFAULT_EXPORT_FONT])

    PAGE_W, PAGE_H = 148, 210   # A5 portrait, mm
    MARGIN = 12

    pdf = FPDF(orientation="P", unit="mm", format="A5")
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)

    pdf.add_font("Fredoka",   style="B", fname=_FONT_TITLE)
    pdf.add_font("StoryBody", style="",  fname=font_cfg["file_regular"])
    pdf.add_font("StoryBold", style="",  fname=font_cfg["file_bold"])

    TEXT_ZONE_FRAC = 0.36   # must match reader + _story_page_composite

    for page in sorted(pages, key=lambda p: p.order):
        pdf.add_page()

        if page.is_cover:
            # Dark background
            pdf.set_fill_color(20, 18, 40)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            if page.image_bytes:
                img_bytes = _cover_crop(page.image_bytes, PAGE_W, PAGE_H)
                pdf.image(io.BytesIO(img_bytes), x=0, y=0, w=PAGE_W, h=PAGE_H)

            # Dark gradient strip at bottom (fpdf2 has no alpha — simulate with strips)
            overlay_h = PAGE_H * 0.45
            steps = 22
            for i in range(steps):
                t = i / steps
                r = int(12 + t * 8)
                pdf.set_fill_color(r, max(0, r - 2), min(255, r + 18))
                strip_h = overlay_h / steps
                strip_y = PAGE_H - overlay_h + i * strip_h
                pdf.rect(0, strip_y, PAGE_W, strip_h + 0.3, style="F")

            # Title text
            title_y = PAGE_H - overlay_h + overlay_h * 0.30
            pdf.set_xy(MARGIN, title_y)
            pdf.set_font("Fredoka", "B", 20)
            pdf.set_text_color(255, 255, 255)
            pdf.multi_cell(PAGE_W - MARGIN * 2, 9, title, align="C")

            if author:
                pdf.set_font("StoryBody", "", 9)
                pdf.set_text_color(200, 195, 220)
                pdf.cell(PAGE_W, 6, f"by {author}", align="C")

        else:
            # Full-bleed image with gradient already composited in
            if page.image_bytes:
                img_bytes = _story_page_composite(
                    page.image_bytes, PAGE_W, PAGE_H,
                    text_zone_frac=TEXT_ZONE_FRAC,
                )
                pdf.set_fill_color(250, 248, 243)
                pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")
                pdf.image(io.BytesIO(img_bytes), x=0, y=0, w=PAGE_W, h=PAGE_H)
            else:
                pdf.set_fill_color(250, 248, 243)
                pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            # Text sits in the bottom TEXT_ZONE_FRAC of the page
            text_zone_h = PAGE_H * TEXT_ZONE_FRAC
            text_top    = PAGE_H - text_zone_h + MARGIN

            if page.text:
                pdf.set_xy(MARGIN, text_top)
                pdf.set_font("StoryBold", "", 10)
                pdf.set_text_color(30, 28, 45)
                pdf.multi_cell(PAGE_W - MARGIN * 2, 5.8, page.text, align="L")

            # Page number
            pdf.set_xy(0, PAGE_H - MARGIN + 2)
            pdf.set_font("StoryBody", "", 7)
            pdf.set_text_color(160, 155, 170)
            pdf.cell(PAGE_W, 5, str(page.order), align="C")

    # Back cover
    pdf.add_page()
    pdf.set_fill_color(20, 18, 40)
    pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")
    pdf.set_xy(0, PAGE_H / 2 - 16)
    pdf.set_font("Fredoka", "B", 28)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(PAGE_W, 14, "The End", align="C")
    pdf.set_xy(0, PAGE_H / 2 + 4)
    pdf.set_font("StoryBody", "", 8)
    pdf.set_text_color(160, 155, 200)
    pdf.cell(PAGE_W, 6, "AI Storybook Studio", align="C")

    return bytes(pdf.output())


async def build_pdf(
    title: str,
    pages: list[ExportPage],
    author: str = "",
    font_id: str = DEFAULT_EXPORT_FONT,
) -> bytes:
    return await asyncio.to_thread(_build_pdf_sync, title, pages, author, font_id)


# ── EPUB ──────────────────────────────────────────────────────────────────────

def _build_epub_sync(
    title: str,
    author: str,
    pages: list[ExportPage],
    font_id: str = DEFAULT_EXPORT_FONT,
) -> bytes:
    from ebooklib import epub

    font_cfg = EXPORT_FONTS.get(font_id, EXPORT_FONTS[DEFAULT_EXPORT_FONT])
    css_family = font_cfg["css_family"]

    book = epub.EpubBook()
    book.set_identifier(f"storybook-{title.replace(' ', '-').lower()}")
    book.set_title(title)
    book.set_language("en")
    book.add_author(author or "AI Storybook Studio")

    # Cover image (used by reading apps for the shelf thumbnail)
    cover_page = next((p for p in pages if p.is_cover and p.image_bytes), None)
    if cover_page:
        book.set_cover("cover.png", cover_page.image_bytes)

    chapters: list[epub.EpubHtml] = []

    # Global CSS — paths are relative to the XHTML files (both live in OEBPS/)
    css_content = f"""
body {{
  margin: 0;
  padding: 0;
  font-family: {css_family};
  background: #faf8f3;
  color: #1e1c2d;
}}
.page-wrap {{
  position: relative;
  page-break-after: always;
  break-after: page;
}}
.page-image img {{
  width: 100%;
  height: auto;
  display: block;
  max-height: 65vh;
  object-fit: cover;
}}
.page-text {{
  padding: 0.9em 1.2em 1.4em 1.2em;
  font-size: 1.05em;
  line-height: 1.8;
  font-weight: bold;
  background: linear-gradient(to bottom, rgba(250,248,243,0) 0%, #faf8f3 18%);
  margin-top: -2.5em;
  position: relative;
  z-index: 1;
}}
.cover-wrap {{
  text-align: center;
  background: #141228;
  color: white;
  min-height: 90vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 2em 1.5em;
  page-break-after: always;
  break-after: page;
  box-sizing: border-box;
}}
.cover-wrap img {{
  width: 100%;
  height: auto;
  display: block;
  position: absolute;
  top: 0; left: 0;
  z-index: 0;
  object-fit: cover;
  min-height: 100%;
}}
.cover-content {{
  position: relative;
  z-index: 1;
  padding-bottom: 1em;
}}
.cover-title {{
  font-family: 'Fredoka', {css_family};
  font-size: 2em;
  font-weight: 700;
  color: white;
  margin: 0.4em 0 0.2em;
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
}}
.cover-author {{
  color: rgba(255,255,255,0.7);
  font-size: 0.9em;
}}
.end-page {{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
  text-align: center;
  background: #141228;
  color: white;
  page-break-after: always;
  break-after: page;
}}
.end-page h1 {{
  font-family: 'Fredoka', {css_family};
  font-size: 2.5em;
  margin-bottom: 0.3em;
}}
.end-page p {{ color: rgba(255,255,255,0.5); font-size: 0.85em; }}
""".encode("utf-8")

    css = epub.EpubItem(
        uid="style",
        file_name="style.css",
        media_type="text/css",
        content=css_content,
    )
    book.add_item(css)

    # ── Cover chapter ─────────────────────────────────────────────────────────
    if cover_page:
        img_tag = ""
        if cover_page.image_bytes:
            # Embed cover image separately so it can be referenced inside the chapter
            cov_img = epub.EpubImage()
            cov_img.file_name = "images/cover_full.png"
            cov_img.media_type = "image/png"
            cov_img.content = cover_page.image_bytes
            book.add_item(cov_img)
            img_tag = '<img src="images/cover_full.png" alt="Cover"/>'

        author_tag = f'<p class="cover-author">by {author}</p>' if author else ""
        cover_ch = epub.EpubHtml(title="Cover", file_name="cover_page.xhtml", lang="en")
        cover_ch.content = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>Cover</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<div class="cover-wrap">
  {img_tag}
  <div class="cover-content">
    <h1 class="cover-title">{title}</h1>
    {author_tag}
  </div>
</div>
</body>
</html>""".encode("utf-8")
        cover_ch.add_item(css)
        book.add_item(cover_ch)
        chapters.append(cover_ch)

    # ── Story pages ───────────────────────────────────────────────────────────
    content_pages = [p for p in sorted(pages, key=lambda x: x.order) if not p.is_cover]

    for page in content_pages:
        img_html = ""
        if page.image_bytes:
            img_filename = f"images/page_{page.order}.png"
            epub_img = epub.EpubImage()
            epub_img.file_name = img_filename
            epub_img.media_type = "image/png"
            epub_img.content = page.image_bytes
            book.add_item(epub_img)
            # Path is relative to the XHTML file — both are in OEBPS root
            img_html = f'<div class="page-image"><img src="{img_filename}" alt="Page {page.order}"/></div>'

        text_html = (
            f'<div class="page-text"><p>{page.text}</p></div>'
            if page.text else ""
        )

        html = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Page {page.order}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body><div class="page-wrap">{img_html}{text_html}</div></body>
</html>"""

        ch = epub.EpubHtml(
            title=f"Page {page.order}",
            file_name=f"page_{page.order}.xhtml",
            lang="en",
        )
        ch.content = html.encode("utf-8")
        ch.add_item(css)
        book.add_item(ch)
        chapters.append(ch)

    # ── The End ───────────────────────────────────────────────────────────────
    end_ch = epub.EpubHtml(title="The End", file_name="the_end.xhtml", lang="en")
    end_ch.content = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>The End</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<div class="end-page">
  <h1>The End</h1>
  <p>Made with AI Storybook Studio</p>
</div>
</body>
</html>""".encode("utf-8")
    end_ch.add_item(css)
    book.add_item(end_ch)
    chapters.append(end_ch)

    book.toc = tuple(chapters)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav"] + chapters

    buf = io.BytesIO()
    epub.write_epub(buf, book, {})
    return buf.getvalue()


async def build_epub(
    title: str,
    author: str,
    pages: list[ExportPage],
    font_id: str = DEFAULT_EXPORT_FONT,
) -> bytes:
    return await asyncio.to_thread(_build_epub_sync, title, author, pages, font_id)
