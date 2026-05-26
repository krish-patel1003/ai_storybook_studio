"""PDF and EPUB export helpers for storybooks."""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass

_FONT_TITLE = "/usr/share/fonts/truetype/Fredoka-Bold.ttf"
_FONT_BODY  = "/usr/share/fonts/truetype/Nunito-Regular.ttf"


@dataclass
class ExportPage:
    order: int
    is_cover: bool
    text: str | None
    image_bytes: bytes | None  # None if not yet illustrated


# ── PDF ───────────────────────────────────────────────────────────────────────

def _build_pdf_sync(title: str, pages: list[ExportPage]) -> bytes:
    from fpdf import FPDF

    PAGE_W, PAGE_H = 148, 210   # A5 portrait, mm
    MARGIN = 8
    TEXT_H = 50                 # bottom text zone
    IMG_MAX_H = PAGE_H - TEXT_H # image zone

    pdf = FPDF(orientation="P", unit="mm", format="A5")
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)

    pdf.add_font("Fredoka", style="B", fname=_FONT_TITLE)
    pdf.add_font("Nunito",  style="",  fname=_FONT_BODY)

    for page in sorted(pages, key=lambda p: p.order):
        pdf.add_page()

        if page.is_cover:
            # Yellow cover background
            pdf.set_fill_color(255, 200, 60)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")
            if page.image_bytes:
                _place_image(pdf, page.image_bytes, 0, 0, PAGE_W, PAGE_H - 32)
            # Title bar
            pdf.set_fill_color(20, 20, 20)
            pdf.rect(0, PAGE_H - 32, PAGE_W, 32, style="F")
            pdf.set_xy(MARGIN, PAGE_H - 28)
            pdf.set_font("Fredoka", "B", 14)
            pdf.set_text_color(255, 255, 255)
            pdf.multi_cell(PAGE_W - MARGIN * 2, 7, title, align="C")
        else:
            # White background
            pdf.set_fill_color(252, 250, 245)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            # Image
            if page.image_bytes:
                _place_image(pdf, page.image_bytes, 0, 0, PAGE_W, IMG_MAX_H)

            # Text zone
            pdf.set_fill_color(255, 255, 255)
            pdf.rect(0, IMG_MAX_H, PAGE_W, TEXT_H, style="F")
            pdf.set_draw_color(20, 20, 20)
            pdf.set_line_width(0.6)
            pdf.line(0, IMG_MAX_H, PAGE_W, IMG_MAX_H)

            if page.text:
                pdf.set_xy(MARGIN, IMG_MAX_H + 6)
                pdf.set_font("Nunito", "", 10)
                pdf.set_text_color(30, 30, 30)
                pdf.multi_cell(PAGE_W - MARGIN * 2, 5.5, page.text, align="L")

            # Page number
            pdf.set_xy(0, PAGE_H - 7)
            pdf.set_font("Nunito", "", 7)
            pdf.set_text_color(160, 160, 160)
            pdf.cell(PAGE_W, 5, str(page.order), align="C")

    # Back cover — "The End"
    pdf.add_page()
    pdf.set_fill_color(255, 200, 60)
    pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")
    pdf.set_xy(0, PAGE_H / 2 - 18)
    pdf.set_font("Fredoka", "B", 30)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(PAGE_W, 14, "The End", align="C")
    pdf.set_xy(0, PAGE_H / 2 + 2)
    pdf.set_font("Nunito", "", 8)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(PAGE_W, 6, "AI Storybook Studio", align="C")

    return bytes(pdf.output())


def _place_image(pdf, image_bytes: bytes, x: float, y: float, max_w: float, max_h: float) -> None:
    from PIL import Image as PILImage
    try:
        img = PILImage.open(io.BytesIO(image_bytes))
        iw, ih = img.size
        ratio = min(max_w / iw, max_h / ih)
        w, h = iw * ratio, ih * ratio
        ox = x + (max_w - w) / 2
        oy = y + (max_h - h) / 2
        pdf.image(io.BytesIO(image_bytes), x=ox, y=oy, w=w, h=h)
    except Exception:
        pass


async def build_pdf(title: str, pages: list[ExportPage]) -> bytes:
    return await asyncio.to_thread(_build_pdf_sync, title, pages)


# ── EPUB ──────────────────────────────────────────────────────────────────────

def _build_epub_sync(title: str, author: str, pages: list[ExportPage]) -> bytes:
    from ebooklib import epub

    book = epub.EpubBook()
    book.set_identifier(f"storybook-{title.replace(' ', '-').lower()}")
    book.set_title(title)
    book.set_language("en")
    book.add_author(author)

    # Cover image
    cover_page = next((p for p in pages if p.is_cover and p.image_bytes), None)
    if cover_page:
        book.set_cover("cover.png", cover_page.image_bytes)

    chapters: list[epub.EpubHtml] = []

    # CSS
    css = epub.EpubItem(
        uid="style", file_name="style.css", media_type="text/css",
        content=b"""
body { margin: 0; padding: 1em; font-family: Georgia, serif; background: #fffdf8; }
.page-image { text-align: center; margin-bottom: 1.2em; }
.page-image img { max-width: 100%; height: auto; border-radius: 6px; }
.page-text { font-size: 1.15em; line-height: 1.7; color: #1a1a1a; }
.end-page { display: flex; flex-direction: column; align-items: center;
            justify-content: center; min-height: 80vh; text-align: center; }
.end-page h1 { font-size: 2.5em; color: #1a1a1a; margin-bottom: 0.3em; }
.end-page p { color: #888; font-size: 0.85em; }
"""
    )
    book.add_item(css)

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
<body>{img_html}{text_html}</body>
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
