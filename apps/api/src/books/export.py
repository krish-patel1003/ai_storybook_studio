"""PDF and EPUB export helpers for storybooks."""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass

# ── Font registry ─────────────────────────────────────────────────────────────

_FONT_DIR = "/usr/share/fonts/truetype"

EXPORT_FONTS: dict[str, dict] = {
    "unkempt": {
        "label": "Unkempt",
        "file_regular": f"{_FONT_DIR}/Unkempt-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Unkempt-Bold.ttf",
        "css_family":   "'Unkempt', cursive",
    },
    "nunito": {
        "label": "Nunito",
        "file_regular": f"{_FONT_DIR}/Nunito-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Nunito-Bold.ttf",
        "css_family":   "'Nunito', sans-serif",
    },
    "patrick-hand": {
        "label": "Patrick Hand",
        "file_regular": f"{_FONT_DIR}/PatrickHand-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/PatrickHand-Regular.ttf",
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

DEFAULT_EXPORT_FONT = "unkempt"
_FONT_TITLE = f"{_FONT_DIR}/Kranky-Regular.ttf"   # cover title font


@dataclass
class ExportPage:
    order: int
    is_cover: bool
    text: str | None
    image_bytes: bytes | None  # None if not yet illustrated
    author: str = ""
    text_align: str = "center"    # left | center | right
    text_position: str = "bottom" # top | center | bottom
    is_back_cover: bool = False
    font_family: str | None = None
    font_size: float | None = None
    text_color: str | None = None
    text_mode: int | None = None  # 1=overlay (default), 2=stacked


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _stacked_image_crop(
    image_bytes: bytes,
    w_mm: float,
    h_mm: float,
    bg_rgb: tuple[int, int, int] = (250, 248, 243),
    fade_frac: float = 0.40,
    dpi: int = 150,
) -> bytes:
    """Crop/scale image to w_mm × h_mm and composite a gradient fade at the bottom
    so the image blends into the text-block background colour (matching Mode2Preview)."""
    from PIL import Image as PILImage
    import numpy as np

    mm_per_inch = 25.4
    tw = int(w_mm * dpi / mm_per_inch)
    th = int(h_mm * dpi / mm_per_inch)

    img = PILImage.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), PILImage.LANCZOS)
    left = (nw - tw) // 2
    top  = (nh - th) // 2
    img  = img.crop((left, top, left + tw, top + th)).convert("RGBA")

    # Build bottom-fade gradient: transparent at top, solid bg at bottom
    fade_h = int(th * fade_frac)
    arr = np.zeros((fade_h, tw, 4), dtype=np.uint8)
    for row in range(fade_h):
        alpha = int(255 * (row / fade_h))
        arr[row, :] = [bg_rgb[0], bg_rgb[1], bg_rgb[2], alpha]
    overlay = PILImage.fromarray(arr, "RGBA")
    img.paste(overlay, (0, th - fade_h), overlay)

    bg = PILImage.new("RGB", img.size, bg_rgb)
    bg.paste(img, mask=img.split()[3])
    buf = io.BytesIO()
    bg.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


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


def _back_cover_composite(image_bytes: bytes, w_mm: float, h_mm: float, dpi: int = 150) -> bytes:
    """
    Back cover: the cover art scaled to fill the page, then a heavy dark navy
    overlay (~85% opaque) to create a rich dark background that still hints at
    the original illustration.  Returns JPEG bytes.
    """
    import numpy as np
    from PIL import Image as PILImage

    mm_per_inch = 25.4
    tw = int(w_mm * dpi / mm_per_inch)
    th = int(h_mm * dpi / mm_per_inch)

    img = PILImage.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    iw, ih = img.size

    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    img = img.resize((nw, nh), PILImage.LANCZOS)
    left = (nw - tw) // 2
    top  = (nh - th) // 2
    img = img.crop((left, top, left + tw, top + th))

    if img.mode == "RGBA":
        bg = PILImage.new("RGB", img.size, (20, 18, 40))
        bg.paste(img, mask=img.split()[3])
        img = bg

    # Uniform dark navy overlay (85 % opacity) — art bleeds through subtly
    overlay = PILImage.new("RGBA", (tw, th), (12, 10, 30, 217))
    composited = PILImage.alpha_composite(img.convert("RGBA"), overlay)

    buf = io.BytesIO()
    composited.convert("RGB").save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return buf.read()


def _cover_composite(image_bytes: bytes, w_mm: float, h_mm: float, dpi: int = 150) -> bytes:
    """
    Cover page: crop/scale to fill page, then composite a dark navy gradient
    over the bottom 50% via PIL alpha_composite (smooth, no banding).
    Returns JPEG bytes.
    """
    import numpy as np
    from PIL import Image as PILImage

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
        bg = PILImage.new("RGB", img.size, (20, 18, 40))
        bg.paste(img, mask=img.split()[3])
        img = bg

    # Build dark navy gradient over bottom 50%
    overlay_frac = 0.50
    grad_start_y = int(th * (1.0 - overlay_frac))
    grad_h = th - grad_start_y

    arr = np.zeros((th, tw, 4), dtype=np.uint8)
    for row in range(grad_start_y, th):
        t = (row - grad_start_y) / grad_h          # 0 → 1
        alpha = int(min(255, t ** 1.2 * 255))       # ease-in curve
        arr[row, :] = [12, 10, 30, alpha]

    overlay = PILImage.fromarray(arr, "RGBA")
    composited = PILImage.alpha_composite(img.convert("RGBA"), overlay)
    result = composited.convert("RGB")

    buf = io.BytesIO()
    result.save(buf, format="JPEG", quality=88)
    buf.seek(0)
    return buf.read()


def _story_page_composite(
    image_bytes: bytes,
    w_mm: float,
    h_mm: float,
    text_zone_frac: float = 0.36,
    text_position: str = "bottom",
    dpi: int = 150,
) -> bytes:
    """
    Crop/scale the image to fill the page, then composite a paper-white
    gradient behind the text zone (direction depends on text_position).
    Returns JPEG bytes.
    """
    import numpy as np
    from PIL import Image as PILImage

    mm_per_inch = 25.4
    tw = int(w_mm * dpi / mm_per_inch)
    th = int(h_mm * dpi / mm_per_inch)

    img = PILImage.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")
    iw, ih = img.size

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

    paper = (250, 248, 243)
    arr   = np.zeros((th, tw, 4), dtype=np.uint8)
    bleed = 0.16   # gradient extends this far beyond the text zone edge

    if text_position == "top":
        zone_end   = int(th * (text_zone_frac + bleed))
        for row in range(0, zone_end):
            t     = 1.0 - row / zone_end          # 1 at top → 0 at zone end
            alpha = int(min(255, t ** 1.6 * 300))
            arr[row, :] = [paper[0], paper[1], paper[2], alpha]

    elif text_position == "center":
        mid       = th // 2
        half_zone = int(th * (text_zone_frac / 2 + bleed))
        for row in range(max(0, mid - half_zone), min(th, mid + half_zone)):
            dist  = abs(row - mid) / half_zone     # 0 at centre → 1 at edge
            t     = 1.0 - dist
            alpha = int(min(255, t ** 1.6 * 300))
            arr[row, :] = [paper[0], paper[1], paper[2], alpha]

    else:  # bottom (default)
        grad_start = int(th * (1.0 - text_zone_frac - bleed))
        grad_h     = th - grad_start
        for row in range(grad_start, th):
            t     = (row - grad_start) / grad_h
            alpha = int(min(255, t ** 1.6 * 300))
            arr[row, :] = [paper[0], paper[1], paper[2], alpha]

    overlay    = PILImage.fromarray(arr, "RGBA")
    composited = PILImage.alpha_composite(img.convert("RGBA"), overlay)
    result     = composited.convert("RGB")

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

    PAGE_W, PAGE_H = 148, 210   # A5 portrait, mm
    MARGIN = 12

    pdf = FPDF(orientation="P", unit="mm", format="A5")
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)

    pdf.add_font("Kranky", style="", fname=_FONT_TITLE)
    # Register every export font so per-page switching works
    for _fid, _fcfg in EXPORT_FONTS.items():
        pdf.add_font(f"Body_{_fid}", style="", fname=_fcfg["file_regular"])
        pdf.add_font(f"Bold_{_fid}", style="", fname=_fcfg["file_bold"])
    # Keep legacy aliases pointing at the book-level fallback font
    font_cfg = EXPORT_FONTS.get(font_id, EXPORT_FONTS[DEFAULT_EXPORT_FONT])
    pdf.add_font("StoryBody", style="", fname=font_cfg["file_regular"])
    pdf.add_font("StoryBold", style="", fname=font_cfg["file_bold"])

    TEXT_ZONE_FRAC = 0.36   # must match reader + _story_page_composite

    for page in sorted(pages, key=lambda p: p.order):
        # Back cover is rendered separately at the end — skip it in the main loop
        if getattr(page, 'is_back_cover', False):
            continue

        pdf.add_page()

        if page.is_cover:
            # Dark background fallback (shows if no image)
            pdf.set_fill_color(20, 18, 40)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            if page.image_bytes:
                # Gradient baked into image via PIL — no opaque strips
                img_bytes = _cover_composite(page.image_bytes, PAGE_W, PAGE_H)
                pdf.image(io.BytesIO(img_bytes), x=0, y=0, w=PAGE_W, h=PAGE_H)

            # Title text sits in the lower 45% of the page
            overlay_h = PAGE_H * 0.45
            title_y = PAGE_H - overlay_h + overlay_h * 0.30
            pdf.set_xy(MARGIN, title_y)
            pdf.set_font("Kranky", "", 22)
            pdf.set_text_color(255, 255, 255)
            pdf.multi_cell(PAGE_W - MARGIN * 2, 9, title, align="C")

            author_display = author or "AI Storybook Studio"
            pdf.set_x(0)
            pdf.set_font("StoryBody", "", 9)
            pdf.set_text_color(200, 195, 220)
            pdf.cell(PAGE_W, 6, f"by {author_display}", align="C")

        else:
            import re as _re
            t_pos    = getattr(page, "text_position", "bottom")
            t_align  = getattr(page, "text_align",    "center")
            t_mode   = getattr(page, "text_mode",  None) or 1

            # Per-page font/size/color (fall back to book-level font_id)
            pg_font_id = (page.font_family or "").strip() or font_id
            if pg_font_id not in EXPORT_FONTS:
                pg_font_id = font_id if font_id in EXPORT_FONTS else DEFAULT_EXPORT_FONT
            bold_alias = f"Bold_{pg_font_id}"
            body_alias = f"Body_{pg_font_id}"

            DEFAULT_FONT_SIZE = 13.0
            pg_font_size = float(page.font_size) if getattr(page, "font_size", None) else DEFAULT_FONT_SIZE

            if getattr(page, "text_color", None):
                pg_r, pg_g, pg_b = _hex_to_rgb(page.text_color)
            else:
                pg_r, pg_g, pg_b = 30, 28, 45  # default dark navy

            _ALIGN = {"left": "L", "center": "C", "right": "R"}
            pdf_align = _ALIGN.get(t_align, "C")

            pdf.set_fill_color(250, 248, 243)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            if t_mode == 2:
                # ── Stacked: image top 55%, text bottom 45% ───────────────
                IMG_FRAC  = 0.55
                TEXT_FRAC = 1.0 - IMG_FRAC
                img_h_mm  = PAGE_H * IMG_FRAC

                if page.image_bytes:
                    img_bytes = _stacked_image_crop(page.image_bytes, PAGE_W, img_h_mm)
                    pdf.image(io.BytesIO(img_bytes), x=0, y=0, w=PAGE_W, h=img_h_mm)

                text_zone_top = img_h_mm
                text_zone_h   = PAGE_H * TEXT_FRAC
                cell_w        = PAGE_W - MARGIN * 2

                if page.text:
                    display_text = _re.sub(r'\n{2,}', '\n', page.text.strip())
                    available    = text_zone_h - MARGIN * 1.5

                    INIT_LINE_H = pg_font_size * 0.55
                    _LINE_RATIO = INIT_LINE_H / pg_font_size
                    font_size   = pg_font_size
                    line_h      = INIT_LINE_H
                    lines: list[str] = []

                    for _attempt in range(200):
                        pdf.set_font(bold_alias, "", font_size)
                        lines   = pdf.multi_cell(cell_w, line_h, display_text,
                                                 align=pdf_align, dry_run=True, output="LINES")
                        block_h = len(lines) * line_h
                        if block_h <= available or font_size <= 8.5:
                            break
                        font_size -= 0.5
                        line_h    = _LINE_RATIO * font_size

                    block_h    = len(lines) * line_h
                    top_offset = max(0.0, (available - block_h) / 2)
                    text_y     = text_zone_top + top_offset + MARGIN * 0.75

                    pdf.set_text_color(pg_r, pg_g, pg_b)
                    pdf.set_xy(MARGIN, text_y)
                    pdf.multi_cell(cell_w, line_h, "\n".join(lines), align=pdf_align)

            else:
                # ── Overlay: full-bleed image with gradient behind text ────
                if page.image_bytes:
                    img_bytes = _story_page_composite(
                        page.image_bytes, PAGE_W, PAGE_H,
                        text_zone_frac=TEXT_ZONE_FRAC,
                        text_position=t_pos,
                    )
                    pdf.image(io.BytesIO(img_bytes), x=0, y=0, w=PAGE_W, h=PAGE_H)

                text_zone_h = PAGE_H * TEXT_ZONE_FRAC
                if t_pos == "top":
                    text_zone_top = 0.0
                elif t_pos == "center":
                    text_zone_top = (PAGE_H - text_zone_h) / 2
                else:
                    text_zone_top = PAGE_H - text_zone_h

                if page.text:
                    display_text = _re.sub(r'\n{2,}', '\n', page.text.strip())
                    cell_w       = PAGE_W - MARGIN * 2
                    available    = text_zone_h - MARGIN

                    INIT_LINE_H = pg_font_size * 0.55
                    _LINE_RATIO = INIT_LINE_H / pg_font_size
                    font_size   = pg_font_size
                    line_h      = INIT_LINE_H
                    lines: list[str] = []

                    for _attempt in range(200):
                        pdf.set_font(bold_alias, "", font_size)
                        lines   = pdf.multi_cell(cell_w, line_h, display_text,
                                                 align=pdf_align, dry_run=True, output="LINES")
                        block_h = len(lines) * line_h
                        if block_h <= available or font_size <= 8.5:
                            break
                        font_size -= 0.5
                        line_h    = _LINE_RATIO * font_size

                    max_lines = max(1, int(available / line_h))
                    if len(lines) > max_lines:
                        lines = lines[:max_lines]
                    block_h    = len(lines) * line_h
                    top_offset = max(0.0, (available - block_h) / 2)
                    text_y     = text_zone_top + top_offset + MARGIN * 0.5

                    pdf.set_text_color(pg_r, pg_g, pg_b)
                    pdf.set_xy(MARGIN, text_y)
                    pdf.multi_cell(cell_w, line_h, "\n".join(lines), align=pdf_align)

            # Page number
            pdf.set_xy(0, PAGE_H - MARGIN + 2)
            pdf.set_font(body_alias, "", 7)
            pdf.set_text_color(160, 155, 170)
            pdf.cell(PAGE_W, 5, str(page.order), align="C")

    # ── Back cover ────────────────────────────────────────────────────────────
    pdf.add_page()
    cover_page = next((p for p in pages if p.is_cover), None)
    back_cover_page = next((p for p in pages if getattr(p, 'is_back_cover', False)), None)
    pdf.set_fill_color(20, 18, 40)
    pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

    if back_cover_page and back_cover_page.image_bytes:
        # Dedicated back cover illustration — full-bleed, no darkening composite
        bc_img = _cover_crop(back_cover_page.image_bytes, PAGE_W, PAGE_H)
        pdf.image(io.BytesIO(bc_img), x=0, y=0, w=PAGE_W, h=PAGE_H)
    elif cover_page and cover_page.image_bytes:
        bc_img = _back_cover_composite(cover_page.image_bytes, PAGE_W, PAGE_H)
        pdf.image(io.BytesIO(bc_img), x=0, y=0, w=PAGE_W, h=PAGE_H)

    # Centre-block: decorative top star row
    mid = PAGE_H / 2
    pdf.set_xy(0, mid - 30)
    pdf.set_font("StoryBody", "", 11)
    pdf.set_text_color(200, 185, 240)
    pdf.cell(PAGE_W, 8, "✦  ✦  ✦", align="C")

    # "The End" headline
    pdf.set_xy(0, mid - 18)
    pdf.set_font("Kranky", "", 34)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(PAGE_W, 16, "The End", align="C")

    # Thin rule (simulated with dots)
    pdf.set_xy(0, mid + 2)
    pdf.set_font("StoryBody", "", 7)
    pdf.set_text_color(140, 130, 180)
    pdf.cell(PAGE_W, 5, "· · · · · · · · · · · · · · · · · · · · ·", align="C")

    # Title echo
    pdf.set_xy(0, mid + 10)
    pdf.set_font("StoryBody", "", 9)
    pdf.set_text_color(200, 195, 220)
    pdf.multi_cell(PAGE_W, 6, title, align="C")

    # Author credit
    author_display = author or "AI Storybook Studio"
    pdf.set_x(0)
    pdf.set_font("StoryBody", "", 8)
    pdf.set_text_color(150, 140, 190)
    pdf.cell(PAGE_W, 5, f"by {author_display}", align="C")

    # App footer at bottom
    pdf.set_xy(0, PAGE_H - 14)
    pdf.set_font("StoryBody", "", 7)
    pdf.set_text_color(100, 95, 140)
    pdf.cell(PAGE_W, 5, "Created with AI Storybook Studio", align="C")

    return bytes(pdf.output())


async def build_pdf(
    title: str,
    pages: list[ExportPage],
    author: str = "",
    font_id: str = DEFAULT_EXPORT_FONT,
) -> bytes:
    return await asyncio.to_thread(_build_pdf_sync, title, pages, author, font_id)


def _build_cover_pdf_sync(
    title: str,
    cover_page: ExportPage,
    author: str = "",
) -> bytes:
    """Single-page PDF containing only the front cover — for Amazon publishing upload."""
    from fpdf import FPDF

    PAGE_W, PAGE_H = 148, 210
    MARGIN = 12

    pdf = FPDF(orientation="P", unit="mm", format="A5")
    pdf.set_auto_page_break(False)
    pdf.set_margins(0, 0, 0)
    pdf.add_font("Kranky",    style="", fname=_FONT_TITLE)
    font_cfg = EXPORT_FONTS[DEFAULT_EXPORT_FONT]
    pdf.add_font("StoryBody", style="", fname=font_cfg["file_regular"])

    pdf.add_page()
    pdf.set_fill_color(20, 18, 40)
    pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

    if cover_page.image_bytes:
        img_bytes = _cover_composite(cover_page.image_bytes, PAGE_W, PAGE_H)
        pdf.image(io.BytesIO(img_bytes), x=0, y=0, w=PAGE_W, h=PAGE_H)

    overlay_h = PAGE_H * 0.45
    title_y   = PAGE_H - overlay_h + overlay_h * 0.30
    pdf.set_xy(MARGIN, title_y)
    pdf.set_font("Kranky", "", 22)
    pdf.set_text_color(255, 255, 255)
    pdf.multi_cell(PAGE_W - MARGIN * 2, 9, title, align="C")

    author_display = author or "AI Storybook Studio"
    pdf.set_x(0)
    pdf.set_font("StoryBody", "", 9)
    pdf.set_text_color(200, 195, 220)
    pdf.cell(PAGE_W, 6, f"by {author_display}", align="C")

    return bytes(pdf.output())


async def build_cover_pdf(
    title: str,
    cover_page: ExportPage,
    author: str = "",
) -> bytes:
    return await asyncio.to_thread(_build_cover_pdf_sync, title, cover_page, author)


# ── EPUB image crop (shorter portrait — leaves room for text) ─────────────────

def _epub_story_image(image_bytes: bytes, w_mm: float = 148, h_mm: float = 118, dpi: int = 150) -> bytes:
    """
    Crop the illustration to a shorter portrait rectangle (default ~148×118 mm)
    so that when rendered at 100% width in an EPUB it occupies roughly 55-60%
    of a typical e-reader screen, leaving the bottom third for the story text.
    No gradient — clean cut.
    """
    return _cover_crop(image_bytes, w_mm, h_mm, dpi)


# ── EPUB ──────────────────────────────────────────────────────────────────────

def _build_epub_sync(
    title: str,
    author: str,
    pages: list[ExportPage],
    font_id: str = DEFAULT_EXPORT_FONT,
) -> bytes:
    import html as html_mod
    from ebooklib import epub

    font_cfg = EXPORT_FONTS.get(font_id, EXPORT_FONTS[DEFAULT_EXPORT_FONT])
    css_family = font_cfg["css_family"]

    book = epub.EpubBook()
    book.set_identifier(f"storybook-{title.replace(' ', '-').lower()}")
    book.set_title(title)
    book.set_language("en")
    book.add_author(author or "AI Storybook Studio")

    # Shelf thumbnail used by reading apps
    cover_page = next((p for p in pages if p.is_cover and p.image_bytes), None)
    if cover_page:
        book.set_cover("cover.png", cover_page.image_bytes)

    chapters: list[epub.EpubHtml] = []

    # ── Global CSS ────────────────────────────────────────────────────────────
    # Rules deliberately avoid: vh/vw, position absolute/fixed, flexbox, object-fit
    # — all poorly supported in older EPUB readers / Kindles.
    css_content = f"""
body {{
  margin: 0;
  padding: 0;
  font-family: {css_family};
  background: #faf8f3;
  color: #1e1c2d;
}}

/* ── Story page: image then text ──────────────────────────────── */
.page-wrap {{
  page-break-after: always;
  break-after: page;
  background: #faf8f3;
}}

/* Image block: fills full width, height auto-scales from the
   pre-cropped JPEG (148 × 118 mm). On a typical 600 px wide
   e-reader that renders as ~600 × 478 px ≈ 60 % of screen height,
   leaving comfortable room for the text below. */
.page-image {{
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  line-height: 0;
}}
.page-image img {{
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
  padding: 0;
}}

/* Text block below the image */
.page-text {{
  background: #faf8f3;
  padding: 0.6em 1.2em 1.4em 1.2em;
  font-size: 1.1em;
  line-height: 1.7;
  font-weight: bold;
  color: #1e1c2d;
}}
.page-text p {{
  margin: 0;
  padding: 0;
}}

/* ── Text-only page (no illustration) ────────────────────────── */
.page-text-only {{
  page-break-after: always;
  break-after: page;
  background: #faf8f3;
  padding: 3em 1.4em 2em 1.4em;
  font-size: 1.1em;
  line-height: 1.7;
  font-weight: bold;
  color: #1e1c2d;
}}
.page-text-only p {{
  margin: 0;
  padding: 0;
}}

/* ── Cover page ───────────────────────────────────────────────── */
.cover-wrap {{
  page-break-after: always;
  break-after: page;
  background: #141228;
  text-align: center;
}}
.cover-wrap img {{
  display: block;
  width: 100%;
  height: auto;
}}
.cover-content {{
  background: #141228;
  padding: 1em 1.4em 1.8em;
}}
.cover-title {{
  font-family: 'Kranky', serif;
  font-size: 1.8em;
  font-weight: 400;
  color: #ffffff;
  margin: 0.2em 0 0.15em;
}}
.cover-author {{
  font-size: 0.9em;
  color: rgba(255,255,255,0.6);
  margin: 0;
}}

/* ── The End ──────────────────────────────────────────────────── */
.end-page {{
  page-break-after: always;
  break-after: page;
  background: #141228;
  text-align: center;
  padding: 4em 2em 3em;
}}
.end-page h1 {{
  font-size: 2em;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 0.4em;
}}
.end-page p {{
  font-size: 0.85em;
  color: rgba(255,255,255,0.45);
  margin: 0;
}}
""".encode("utf-8")

    css = epub.EpubItem(
        uid="style",
        file_name="style.css",
        media_type="text/css",
        content=css_content,
    )
    book.add_item(css)

    # ── Cover chapter ─────────────────────────────────────────────────────────
    if cover_page and cover_page.image_bytes:
        # Crop cover to full portrait for the cover page (looks good as a title card)
        cover_jpg = _cover_crop(cover_page.image_bytes, 148, 210)
        cov_img = epub.EpubImage()
        cov_img.file_name = "images/cover_full.jpg"
        cov_img.media_type = "image/jpeg"
        cov_img.content = cover_jpg
        book.add_item(cov_img)

        safe_title  = html_mod.escape(title)
        safe_author = html_mod.escape(author) if author else ""
        author_tag  = f'<p class="cover-author">by {safe_author}</p>' if safe_author else ""

        cover_ch = epub.EpubHtml(title="Cover", file_name="cover_page.xhtml", lang="en")
        cover_ch.content = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8"/><title>Cover</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<div class="cover-wrap">
  <img src="images/cover_full.jpg" alt="Cover"/>
  <div class="cover-content">
    <h1 class="cover-title">{safe_title}</h1>
    {author_tag}
  </div>
</div>
</body>
</html>""".encode("utf-8")
        cover_ch.add_item(css)
        book.add_item(cover_ch)
        chapters.append(cover_ch)

    # ── Story pages ───────────────────────────────────────────────────────────
    content_pages = [
        p for p in sorted(pages, key=lambda x: x.order)
        if not p.is_cover and not getattr(p, 'is_back_cover', False)
    ]

    for page in content_pages:
        safe_text = html_mod.escape(page.text or "").replace("\n", "<br/>")

        if page.image_bytes:
            # Crop to shorter portrait (148 × 118 mm) so the image takes ~60 % of
            # the screen and the text is immediately visible below it.
            story_jpg = _epub_story_image(page.image_bytes)
            img_filename = f"images/page_{page.order}.jpg"
            epub_img = epub.EpubImage()
            epub_img.file_name = img_filename
            epub_img.media_type = "image/jpeg"
            epub_img.content = story_jpg
            book.add_item(epub_img)

            body_content = f"""<div class="page-wrap">
  <div class="page-image"><img src="{img_filename}" alt="Page {page.order}"/></div>
  {f'<div class="page-text"><p>{safe_text}</p></div>' if safe_text else ''}
</div>"""
        else:
            # Continuation / text-only page
            body_content = (
                f'<div class="page-text-only"><p>{safe_text}</p></div>'
                if safe_text
                else '<div class="page-text-only">&#160;</div>'
            )

        ch = epub.EpubHtml(
            title=f"Page {page.order}",
            file_name=f"page_{page.order}.xhtml",
            lang="en",
        )
        ch.content = f"""<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Page {page.order}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>{body_content}</body>
</html>""".encode("utf-8")
        ch.add_item(css)
        book.add_item(ch)
        chapters.append(ch)

    # ── The End ───────────────────────────────────────────────────────────────
    end_ch = epub.EpubHtml(title="The End", file_name="the_end.xhtml", lang="en")
    end_ch.content = b"""<?xml version='1.0' encoding='utf-8'?>
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
</html>"""
    end_ch.add_item(css)
    book.add_item(end_ch)
    chapters.append(end_ch)

    book.toc = tuple(chapters)
    nav = epub.EpubNav()
    book.add_item(epub.EpubNcx())
    book.add_item(nav)
    book.spine = [(nav, "no")] + chapters

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
