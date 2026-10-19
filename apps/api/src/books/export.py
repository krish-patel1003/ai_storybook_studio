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
        "weight": 400,
        "file_regular": f"{_FONT_DIR}/Unkempt-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Unkempt-Bold.ttf",
        "css_family":   "'Unkempt', cursive",
    },
    "nunito": {
        "label": "Nunito",
        "weight": 600,
        "file_regular": f"{_FONT_DIR}/Nunito-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Nunito-Bold.ttf",
        "css_family":   "'Nunito', sans-serif",
    },
    "patrick-hand": {
        "label": "Patrick Hand",
        "weight": 400,
        "file_regular": f"{_FONT_DIR}/PatrickHand-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/PatrickHand-Regular.ttf",
        "css_family":   "'Patrick Hand', cursive",
    },
    "merriweather": {
        "label": "Merriweather",
        "weight": 700,
        "file_regular": f"{_FONT_DIR}/Merriweather-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Merriweather-Regular.ttf",
        "css_family":   "'Merriweather', serif",
    },
    "quicksand": {
        "label": "Quicksand",
        "weight": 600,
        "file_regular": f"{_FONT_DIR}/Quicksand-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Quicksand-Regular.ttf",
        "css_family":   "'Quicksand', sans-serif",
    },
    "caveat": {
        "label": "Caveat",
        "weight": 700,
        "file_regular": f"{_FONT_DIR}/Caveat-Regular.ttf",
        "file_bold":    f"{_FONT_DIR}/Caveat-Regular.ttf",
        "css_family":   "'Caveat', cursive",
    },
}

DEFAULT_EXPORT_FONT = "unkempt"
_FONT_TITLE = f"{_FONT_DIR}/Kranky-Regular.ttf"   # cover title font


def _font_file(font_id: str) -> str:
    """Pick the TTF whose weight matches the reader (regular < 600 ≤ bold)."""
    cfg = EXPORT_FONTS.get(font_id, EXPORT_FONTS[DEFAULT_EXPORT_FONT])
    return cfg["file_bold"] if cfg.get("weight", 600) >= 600 else cfg["file_regular"]


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
    bg_color: str | None = None   # page/paper background — matches studio + reader


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _stacked_image_crop(
    image_bytes: bytes,
    w_mm: float,
    h_mm: float,
    fade_frac: float = 0.45,
    dpi: int = 150,
) -> bytes:
    """Crop/scale image and apply a true alpha fade at the bottom edge so the image
    blends into the PDF background without JPEG seam artifacts (returned as PNG)."""
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

    # Fade the bottom fade_frac of the image to transparent using vectorised numpy ops
    arr = np.array(img, dtype=np.float32)
    fade_h = int(th * fade_frac)
    fade_start = th - fade_h
    # alpha multiplier goes from 1.0 at fade_start to 0.0 at the last row
    alphas = np.linspace(1.0, 0.0, fade_h, dtype=np.float32).reshape(-1, 1)
    arr[fade_start:, :, 3] *= alphas
    np.clip(arr, 0, 255, out=arr)

    img = PILImage.fromarray(arr.astype(np.uint8), "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
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
    paper: tuple[int, int, int] = (250, 248, 243),
) -> bytes:
    """
    Crop/scale the image to fill the page, then composite a paper-colored
    gradient behind the text zone (direction depends on text_position).
    `paper` matches the page's saved bg_color so the export is pixel-identical
    to studio/reader. Returns JPEG bytes.
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
        bg = PILImage.new("RGB", img.size, paper)
        bg.paste(img, mask=img.split()[3])
        img = bg

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

    # Match the online reader's page proportions (440 × 580 ≈ 0.759) so the exported
    # pages — and their text-area percentage — look exactly like reading on the site.
    PAGE_W, PAGE_H = 148, 195   # 148 × 195mm ≈ reader aspect
    MARGIN = 12

    pdf = FPDF(orientation="P", unit="mm", format=(PAGE_W, PAGE_H))
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
            # Content page — rendered exactly like the online reader as one composited
            # image (same layout/font/size/colour/blend), then placed full-page.
            pg_font_id = (getattr(page, "font_family", "") or "").strip()
            if pg_font_id not in EXPORT_FONTS:
                pg_font_id = font_id if font_id in EXPORT_FONTS else DEFAULT_EXPORT_FONT
            t_mode = getattr(page, "text_mode", None) or 3  # default page style = clear separation
            bg_rgb = _hex_to_rgb(page.bg_color) if getattr(page, "bg_color", None) else (250, 248, 243)
            pdf.set_fill_color(*bg_rgb)
            pdf.rect(0, 0, PAGE_W, PAGE_H, style="F")

            if page.image_bytes:
                page_img = _render_page_image(
                    page.image_bytes, page.text or "", t_mode,
                    _font_file(pg_font_id),
                    font_px=getattr(page, "font_size", None) or 14,
                    text_hex=getattr(page, "text_color", None) or "#1a1a2e",
                    bg_hex=getattr(page, "bg_color", None) or "#faf8f3",
                    align=getattr(page, "text_align", "center") or "center",
                    valign=getattr(page, "text_valign", "center") or "center",
                    position=getattr(page, "text_position", "bottom") or "bottom",
                    w_mm=PAGE_W, h_mm=PAGE_H,
                )
                pdf.image(io.BytesIO(page_img), x=0, y=0, w=PAGE_W, h=PAGE_H)

            # Page number (small, bottom-right — like the reader)
            pdf.set_xy(PAGE_W - 16, PAGE_H - MARGIN + 1)
            pdf.set_font("StoryBody", "", 7)
            pdf.set_text_color(150, 145, 160)
            pdf.cell(12, 5, str(page.order), align="R")

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


# ── Cover image (PNG / JPEG) ──────────────────────────────────────────────────

def _build_cover_image_sync(
    title: str,
    cover_page: ExportPage,
    author: str = "",
    fmt: str = "PNG",
    with_text: bool = True,
) -> bytes:
    """Front cover as a raster image.

    with_text=True  → "Standard" cover: title + author baked in (for sharing).
    with_text=False → "Editor" cover: clean artwork only, no text, so the user
                      can add their own title in the Amazon KDP cover editor.
    """
    from PIL import Image as PILImage, ImageDraw, ImageFont

    W, H = 1250, 1774  # ~A5 ratio (148:210) at ~215 dpi

    if cover_page.image_bytes:
        art = _cover_composite(cover_page.image_bytes, 148, 210, dpi=220)
        base = PILImage.open(io.BytesIO(art)).convert("RGB").resize((W, H), PILImage.LANCZOS)
    else:
        base = PILImage.new("RGB", (W, H), (20, 18, 40))

    if not with_text:
        # Clean artwork only — no title/author overlay.
        buf = io.BytesIO()
        if fmt.upper() == "JPEG":
            base.save(buf, format="JPEG", quality=92)
        else:
            base.save(buf, format="PNG")
        return buf.getvalue()

    draw = ImageDraw.Draw(base)

    def _load(path: str, size: int):
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            return ImageFont.load_default()

    title_font = _load(_FONT_TITLE, 92)
    author_font = _load(EXPORT_FONTS[DEFAULT_EXPORT_FONT]["file_regular"], 44)

    margin = int(W * 0.09)
    max_w = W - margin * 2

    # Word-wrap the title to fit within max_w.
    words = (title or "").split()
    lines: list[str] = []
    cur = ""
    for word in words:
        trial = f"{cur} {word}".strip()
        if draw.textlength(trial, font=title_font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)

    line_h = int(title_font.size * 1.15)
    author_line = f"by {author}" if author else ""
    author_h = int(author_font.size * 1.4) if author_line else 0
    block_h = len(lines) * line_h + author_h

    # Anchor the text block in the lower third (over the dark gradient).
    y = int(H * 0.90) - block_h
    for ln in lines:
        w = draw.textlength(ln, font=title_font)
        x = (W - w) / 2
        # soft shadow for legibility
        draw.text((x + 2, y + 2), ln, font=title_font, fill=(0, 0, 0))
        draw.text((x, y), ln, font=title_font, fill=(255, 255, 255))
        y += line_h
    if author_line:
        y += int(author_font.size * 0.2)
        w = draw.textlength(author_line, font=author_font)
        draw.text(((W - w) / 2, y), author_line, font=author_font, fill=(225, 222, 235))

    buf = io.BytesIO()
    fmt = fmt.upper()
    if fmt == "JPEG":
        base.save(buf, format="JPEG", quality=92)
    else:
        base.save(buf, format="PNG")
    return buf.getvalue()


async def build_cover_image(
    title: str,
    cover_page: ExportPage,
    author: str = "",
    fmt: str = "PNG",
    with_text: bool = True,
) -> bytes:
    return await asyncio.to_thread(_build_cover_image_sync, title, cover_page, author, fmt, with_text)


# ── EPUB image crop (shorter portrait — leaves room for text) ─────────────────

def _epub_story_image(image_bytes: bytes, w_mm: float = 148, h_mm: float = 152, dpi: int = 200) -> bytes:
    """
    Stacked layout image: crop the illustration to ~148×152 mm (≈72 % of the A5
    page) so it matches the app's "picture on top, text below" layout and renders
    large — not shrunk — on an e-reader. Higher DPI keeps it crisp on big screens.
    No gradient — clean cut.
    """
    return _cover_crop(image_bytes, w_mm, h_mm, dpi)


def _render_page_image(
    image_bytes: bytes,
    text: str,
    text_mode: int,
    font_path: str,
    font_px: float = 14.0,
    text_hex: str = "#1a1a2e",
    bg_hex: str = "#faf8f3",
    align: str = "center",
    valign: str = "center",
    position: str = "bottom",
    w_mm: float = 148,
    h_mm: float = 195,  # ≈ reader page aspect (440:580)
    dpi: int = 200,
) -> bytes:
    """Render a whole page as one image that matches the online reader as closely as
    possible — same layout proportions, font, size, colours, alignment and blend — so
    PDF and EPUB exports look exactly like reading the book on the site.

    Modes: 1 = Words on Picture (full-bleed image + bg-toned gradient + text over it),
    2 = Blended stacked (picture on top, soft fade into the text band), 3 = Clear
    separation stacked (picture on top, clean edge). Returns JPEG bytes."""
    import numpy as np
    from PIL import Image as PILImage, ImageDraw, ImageFont

    tw = int(w_mm * dpi / 25.4)
    th = int(h_mm * dpi / 25.4)
    bg = _hex_to_rgb(bg_hex)
    fg = _hex_to_rgb(text_hex)

    # The reader lays text out in a 440px-wide page coordinate; scale to the canvas.
    scale = tw / 440.0
    fpx = max(10, int(round((font_px or 14) * scale)))
    pad_x = int(20 * scale)
    pad_y = int(16 * scale)
    line_ratio = 1.6  # matches the reader's line-height

    def load_font(sz: int):
        try:
            return ImageFont.truetype(font_path, sz)
        except Exception:
            return ImageFont.load_default()

    def crop_cover(src: "PILImage.Image", cw: int, ch: int, anchor_top: bool) -> "PILImage.Image":
        iw, ih = src.size
        s = max(cw / iw, ch / ih)
        nw, nh = int(iw * s), int(ih * s)
        r = src.resize((nw, nh), PILImage.LANCZOS)
        left = (nw - cw) // 2
        top = 0 if anchor_top else (nh - ch) // 2
        return r.crop((left, top, left + cw, top + ch))

    def wrap(draw, f, s: str, max_w: int):
        lines, cur = [], ""
        for word in (s or "").strip().split():
            trial = f"{cur} {word}".strip()
            if draw.textlength(trial, font=f) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur); cur = word
        if cur:
            lines.append(cur)
        return lines

    src = PILImage.open(io.BytesIO(image_bytes)).convert("RGB") if image_bytes else None
    has_text = bool((text or "").strip())

    if text_mode == 1:
        # ── Words on Picture — full-bleed image, gradient toward bg, text over it ──
        canvas = crop_cover(src, tw, th, anchor_top=True) if src else PILImage.new("RGB", (tw, th), bg)
        if has_text:
            zone_h = int(th * 0.47)
            band = np.zeros((th, tw, 4), dtype=np.uint8)
            if position == "top":
                for i in range(zone_h):
                    a = int(min(255, (1 - i / zone_h) ** 1.1 * 255))
                    band[i, :] = [bg[0], bg[1], bg[2], a]
            elif position == "center":
                cy0 = (th - zone_h) // 2
                for i in range(zone_h):
                    d = abs(i - zone_h / 2) / (zone_h / 2)
                    a = int(min(255, (1 - d) * 230))
                    band[cy0 + i, :] = [bg[0], bg[1], bg[2], a]
            else:
                y0 = th - zone_h
                for i in range(zone_h):
                    a = int(min(255, (i / zone_h) ** 1.1 * 255))
                    band[y0 + i, :] = [bg[0], bg[1], bg[2], a]
            overlay = PILImage.fromarray(band, "RGBA")
            canvas = PILImage.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")

            draw = ImageDraw.Draw(canvas)
            f = load_font(fpx)
            max_w = tw - pad_x * 2
            lines = wrap(draw, f, text, max_w)
            line_h = int(fpx * line_ratio)
            block_h = len(lines) * line_h
            if position == "top":
                y = pad_y * 1.5
            elif position == "center":
                y = (th - block_h) / 2
            else:
                y = th - block_h - pad_y * 1.5
            for ln in lines:
                w = draw.textlength(ln, font=f)
                x = pad_x if align == "left" else (tw - pad_x - w) if align == "right" else (tw - w) / 2
                draw.text((x, y), ln, font=f, fill=fg)
                y += line_h
        return _jpeg(canvas)

    # ── Stacked (Blended=2 / Clear separation=3): picture on top, text band below ──
    canvas = PILImage.new("RGB", (tw, th), bg)
    img_h = int(th * 0.75)  # reader: image 75%, text band 25%
    if src:
        img = crop_cover(src, tw, img_h, anchor_top=False)
        if text_mode == 2:
            arr = np.array(img.convert("RGBA"), dtype=np.float32)
            fade_h = int(img_h * 0.16)
            alphas = np.linspace(1.0, 0.0, fade_h, dtype=np.float32).reshape(-1, 1)
            arr[img_h - fade_h:, :, 3] *= alphas
            faded = PILImage.fromarray(arr.astype(np.uint8), "RGBA")
            bg_layer = PILImage.new("RGBA", (tw, img_h), (bg[0], bg[1], bg[2], 255))
            img = PILImage.alpha_composite(bg_layer, faded).convert("RGB")
        canvas.paste(img, (0, 0))

    if has_text:
        draw = ImageDraw.Draw(canvas)
        band_top, band_h = img_h, th - img_h
        max_w = tw - pad_x * 2
        size = fpx
        f = load_font(size)
        lines = wrap(draw, f, text, max_w)
        line_h = int(size * line_ratio)
        while len(lines) * line_h > band_h - pad_y * 2 and size > 10:
            size -= 1
            f = load_font(size)
            lines = wrap(draw, f, text, max_w)
            line_h = int(size * line_ratio)
        block_h = len(lines) * line_h
        if block_h > band_h:
            y = band_top + pad_y
        elif valign == "top":
            y = band_top + pad_y
        elif valign == "bottom":
            y = th - pad_y - block_h
        else:
            y = band_top + max(pad_y, (band_h - block_h) / 2)
        for ln in lines:
            w = draw.textlength(ln, font=f)
            x = pad_x if align == "left" else (tw - pad_x - w) if align == "right" else (tw - w) / 2
            draw.text((x, y), ln, font=f, fill=fg)
            y += line_h
    return _jpeg(canvas)


def _jpeg(img) -> bytes:
    buf = io.BytesIO(); img.convert("RGB").save(buf, format="JPEG", quality=90); return buf.getvalue()


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

/* Words-on-Picture: full-bleed image with text already baked in */
.page-fullimage {{
  page-break-after: always;
  break-after: page;
  text-align: center;
  margin: 0;
  padding: 0;
  background: #faf8f3;
}}
.page-fullimage img {{
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
        mode = getattr(page, "text_mode", None) or 2

        if page.image_bytes:
            # One composited page image that matches the online reader (same layout,
            # font, size, colours, blend) — so the picture and text stay together.
            pg_font_id = (getattr(page, "font_family", "") or "").strip() or font_id
            pg_cfg = EXPORT_FONTS.get(pg_font_id, font_cfg)
            page_jpg = _render_page_image(
                page.image_bytes,
                page.text or "",
                mode,
                _font_file(pg_font_id),
                font_px=getattr(page, "font_size", None) or 14,
                text_hex=getattr(page, "text_color", None) or "#1a1a2e",
                bg_hex=getattr(page, "bg_color", None) or "#faf8f3",
                align=getattr(page, "text_align", "center") or "center",
                valign=getattr(page, "text_valign", "center") or "center",
                position=getattr(page, "text_position", "bottom") or "bottom",
            )
            img_filename = f"images/page_{page.order}.jpg"
            epub_img = epub.EpubImage()
            epub_img.file_name = img_filename
            epub_img.media_type = "image/jpeg"
            epub_img.content = page_jpg
            book.add_item(epub_img)
            body_content = f"""<div class="page-fullimage"><img src="{img_filename}" alt="Page {page.order}"/></div>"""
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
