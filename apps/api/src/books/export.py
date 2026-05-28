"""PDF and EPUB export helpers for storybooks."""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass, field

_FONT_TITLE = "/usr/share/fonts/truetype/Fredoka-Bold.ttf"
_FONT_BODY  = "/usr/share/fonts/truetype/Nunito-Regular.ttf"


@dataclass
class ExportPage:
    order: int
    is_cover: bool
    text: str | None
    image_bytes: bytes | None  # None if not yet illustrated
    author: str = ""


# ── PDF ───────────────────────────────────────────────────────────────────────

def _build_pdf_sync(title: str, pages: list[ExportPage], author: str = "") -> bytes:
    from fpdf import FPDF
    from PIL import Image as PILImage

    PAGE_W, PAGE_H = 148, 210   # A5 portrait, mm
    MARGIN = 12                  # equal margin all sides

    pdf = FPDF(orientation="P", unit="mm", format="A5")
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)

    pdf.add_font("Fredoka", style="B", fname=_FONT_TITLE)
    pdf.add_font("Nunito",  style="",  fname=_FONT_BODY)

    for page in sorted(pages, key=lambda p: p.order):
        pdf.add_page()

        if page.is_cover:
            # ── Full-bleed cover ─────────────────────────────────────────────
            # Background colour
            pdf.set_fill_color(20, 18, 40)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            if page.image_bytes:
                # Full-bleed image
                _place_image_fill(pdf, page.image_bytes, 0, 0, PAGE_W, PAGE_H)

            # Gradient overlay at bottom (simulate with semi-opaque rect)
            # fpdf2 doesn't support alpha natively — use a dark bar instead
            overlay_h = PAGE_H * 0.45
            pdf.set_fill_color(12, 10, 30)
            # Soft gradient: draw multiple thin rects decreasing opacity
            steps = 20
            for i in range(steps):
                alpha_factor = i / steps  # 0 = transparent top, 1 = solid bottom
                darkness = int(12 + alpha_factor * (12))
                pdf.set_fill_color(darkness, darkness - 2, darkness + 18)
                strip_h = overlay_h / steps
                strip_y = PAGE_H - overlay_h + (i * strip_h)
                pdf.rect(0, strip_y, PAGE_W, strip_h + 0.5, style="F")

            # Title
            pdf.set_xy(MARGIN, PAGE_H - overlay_h + (overlay_h * 0.35))
            pdf.set_font("Fredoka", "B", 20)
            pdf.set_text_color(255, 255, 255)
            pdf.multi_cell(PAGE_W - MARGIN * 2, 9, title, align="C")

            # Author byline
            if author:
                pdf.set_font("Nunito", "", 9)
                pdf.set_text_color(200, 195, 220)
                pdf.cell(PAGE_W, 6, f"by {author}", align="C")

        else:
            # ── Story page — full-bleed image, gradient fade, text overlay ──
            pdf.set_fill_color(250, 248, 243)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            if page.image_bytes:
                _place_image_fill(pdf, page.image_bytes, 0, 0, PAGE_W, PAGE_H)

            # Gradient overlay at bottom for text readability
            text_zone_h = PAGE_H * 0.42
            steps = 18
            for i in range(steps):
                t = i / steps
                r = int(250 - t * 0)
                g = int(248 - t * 2)
                b = int(243 - t * 5)
                # opacity via colour shift toward paper white
                mix = t * t  # ease in — stays transparent longer
                fr = int(250 * (1 - mix) + r * mix) if mix < 1 else r
                fg = int(248 * (1 - mix) + g * mix) if mix < 1 else g
                fb = int(243 * (1 - mix) + b * mix) if mix < 1 else b
                pdf.set_fill_color(
                    int(255 * (1 - mix) + 250 * mix),
                    int(255 * (1 - mix) + 248 * mix),
                    int(255 * (1 - mix) + 243 * mix),
                )
                strip_h = text_zone_h / steps
                strip_y = PAGE_H - text_zone_h + (i * strip_h)
                pdf.rect(0, strip_y, PAGE_W, strip_h + 0.5, style="F")

            # Text — equal margins all sides within text zone
            text_top = PAGE_H - text_zone_h + MARGIN
            if page.text:
                pdf.set_xy(MARGIN, text_top)
                pdf.set_font("Nunito", "", 10)
                pdf.set_text_color(30, 28, 45)
                pdf.multi_cell(PAGE_W - MARGIN * 2, 5.8, page.text, align="L")

            # Page number — bottom centre, equal from bottom as MARGIN
            pdf.set_xy(0, PAGE_H - MARGIN + 2)
            pdf.set_font("Nunito", "", 7)
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
    pdf.set_font("Nunito", "", 8)
    pdf.set_text_color(160, 155, 200)
    pdf.cell(PAGE_W, 6, "AI Storybook Studio", align="C")

    return bytes(pdf.output())


def _place_image_fill(pdf, image_bytes: bytes, x: float, y: float, w: float, h: float) -> None:
    """Place image filling the entire box (crop/cover, not letterbox)."""
    from PIL import Image as PILImage
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        iw, ih = img.size
        # Scale so the image covers the box (cover behaviour, like object-fit: cover)
        scale = max(w / iw, h / ih)
        new_w, new_h = iw * scale, ih * scale
        # Crop to fit exactly
        left = (new_w - w) / 2
        top  = (new_h - h) / 2
        img_resized = img.resize((int(new_w), int(new_h)), PILImage.LANCZOS)
        # Convert mm→px using 300dpi: 1mm = 300/25.4 px
        px_per_mm = 300 / 25.4
        crop_box = (
            int(left * px_per_mm / scale * scale),
            int(top  * px_per_mm / scale * scale),
            int((left + w) * px_per_mm / scale * scale),
            int((top  + h) * px_per_mm / scale * scale),
        )
        # Use PIL crop on resized image
        left_px = int(left)
        top_px  = int(top)
        cropped = img_resized.crop((
            int(left_px * (300/25.4) / (300/25.4)),
            int(top_px  * (300/25.4) / (300/25.4)),
            int((left_px + w) * (300/25.4) / (300/25.4)),
            int((top_px  + h) * (300/25.4) / (300/25.4)),
        ))
        buf = io.BytesIO()
        cropped.save(buf, format="PNG")
        buf.seek(0)
        pdf.image(buf, x=x, y=y, w=w, h=h)
    except Exception:
        # Fallback: letterbox
        try:
            pdf.image(io.BytesIO(image_bytes), x=x, y=y, w=w, h=h)
        except Exception:
            pass


async def build_pdf(title: str, pages: list[ExportPage], author: str = "") -> bytes:
    return await asyncio.to_thread(_build_pdf_sync, title, pages, author)


# ── EPUB ──────────────────────────────────────────────────────────────────────

def _build_epub_sync(title: str, author: str, pages: list[ExportPage]) -> bytes:
    from ebooklib import epub

    book = epub.EpubBook()
    book.set_identifier(f"storybook-{title.replace(' ', '-').lower()}")
    book.set_title(title)
    book.set_language("en")
    book.add_author(author or "AI Storybook Studio")

    # Cover image
    cover_page = next((p for p in pages if p.is_cover and p.image_bytes), None)
    if cover_page:
        book.set_cover("cover.png", cover_page.image_bytes)

    chapters: list[epub.EpubHtml] = []

    # CSS — no hard margins, image bleeds, text overlaps naturally
    css = epub.EpubItem(
        uid="style", file_name="style.css", media_type="text/css",
        content=b"""
body {
  margin: 0;
  padding: 0;
  font-family: "Nunito", "Patrick Hand", Georgia, serif;
  background: #faf8f3;
  color: #1e1c2d;
}
.page-wrap {
  position: relative;
  page-break-after: always;
}
.page-image {
  width: 100%;
  display: block;
}
.page-image img {
  width: 100%;
  height: auto;
  display: block;
}
.page-text {
  padding: 1em 1.25em 1.5em 1.25em;
  font-size: 1.1em;
  line-height: 1.75;
  background: linear-gradient(to bottom, rgba(250,248,243,0) 0%, #faf8f3 20%);
  margin-top: -3em;
  position: relative;
}
.cover-wrap {
  text-align: center;
  background: #141228;
  color: white;
  min-height: 90vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 2em 1.5em;
  page-break-after: always;
}
.cover-wrap img { width: 100%; height: auto; display: block; }
.cover-title {
  font-family: "Fredoka", Georgia, serif;
  font-size: 2em;
  font-weight: 700;
  color: white;
  margin: 0.5em 0 0.25em;
}
.cover-author { color: rgba(255,255,255,0.65); font-size: 0.9em; }
.end-page {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 80vh; text-align: center;
  background: #141228; color: white;
}
.end-page h1 { font-size: 2.5em; margin-bottom: 0.3em; }
.end-page p { color: rgba(255,255,255,0.5); font-size: 0.85em; }
"""
    )
    book.add_item(css)

    # Cover chapter
    if cover_page:
        cover_ch = epub.EpubHtml(title="Cover", file_name="cover_page.xhtml", lang="en")
        cover_ch.content = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>Cover</title>
<link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body>
<div class="cover-wrap">
  <h1 class="cover-title">{title}</h1>
  {f'<p class="cover-author">by {author}</p>' if author else ''}
</div>
</body>
</html>""".encode("utf-8")
        cover_ch.add_item(css)
        book.add_item(cover_ch)
        chapters.append(cover_ch)

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
            img_html = f'<div class="page-image"><img src="../{img_filename}" alt="Page {page.order}" /></div>'

        text_html = f'<div class="page-text"><p>{page.text}</p></div>' if page.text else ""

        html = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Page {page.order}</title>
  <link rel="stylesheet" type="text/css" href="../style.css"/>
</head>
<body><div class="page-wrap">{img_html}{text_html}</div></body>
</html>"""

        ch = epub.EpubHtml(title=f"Page {page.order}", file_name=f"page_{page.order}.xhtml", lang="en")
        ch.content = html.encode("utf-8")
        ch.add_item(css)
        book.add_item(ch)
        chapters.append(ch)

    # The End
    end_ch = epub.EpubHtml(title="The End", file_name="the_end.xhtml", lang="en")
    end_ch.content = b"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>The End</title>
<link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body><div class="end-page"><h1>The End</h1><p>Made with AI Storybook Studio</p></div></body>
</html>"""
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


async def build_epub(title: str, author: str, pages: list[ExportPage]) -> bytes:
    return await asyncio.to_thread(_build_epub_sync, title, author, pages)
