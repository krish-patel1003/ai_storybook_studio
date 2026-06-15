"""
Email service using Gmail SMTP (or any SMTP relay).
Uses Python's built-in smtplib + asyncio.to_thread — no extra packages.

Gmail setup:
  1. Enable 2-Step Verification on the Gmail / Google Workspace account
  2. Go to myaccount.google.com → Security → App Passwords
  3. Generate an App Password for "Mail"
  4. Store it in Secret Manager as `smtp-password`

Env vars needed (set via Cloud Run secrets / .env):
  SMTP_HOST     smtp.gmail.com
  SMTP_PORT     587
  SMTP_USER     ira-tech@csulb.edu   (or whatever Gmail sends from)
  SMTP_PASSWORD <app-password>
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import settings

logger = logging.getLogger(__name__)


# ── Public API ────────────────────────────────────────────────────────────────

async def send_verification_email(to_email: str, pen_name: str, token: str) -> None:
    verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
    html = _build_verification_html(pen_name, verify_url)
    await _send(
        to=to_email,
        subject="Verify your Storybook.Studio account ✦",
        html=html,
    )


async def send_welcome_email(to_email: str, pen_name: str) -> None:
    html = _build_welcome_html(pen_name)
    await _send(
        to=to_email,
        subject="Welcome to Storybook.Studio — let's write your first story! ✦",
        html=html,
    )


# ── SMTP sender ───────────────────────────────────────────────────────────────

def _send_sync(to: str, subject: str, html: str) -> None:
    """Synchronous send — runs in a thread so it doesn't block the event loop."""
    if not settings.SMTP_PASSWORD or not settings.SMTP_USER:
        logger.warning("SMTP credentials not configured — skipping email to %s", to)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, [to], msg.as_string())

    logger.info("Email sent via SMTP to %s: %s", to, subject)


async def _send(to: str, subject: str, html: str) -> None:
    try:
        await asyncio.to_thread(_send_sync, to, subject, html)
    except Exception:
        logger.exception("Failed to send email to %s", to)


# ── HTML templates ─────────────────────────────────────────────────────────────

def _build_verification_html(pen_name: str, verify_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
               style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:#1A1A1A;border-radius:16px;
                          border:2.5px solid #1A1A1A;padding:12px 24px;">
                <span style="font-size:22px;font-weight:900;color:#FFFBF5;letter-spacing:-0.5px;">
                  Storybook<span style="color:#F59E0B;">.</span>Studio
                </span>
              </div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#FFFFFF;border-radius:24px;border:2.5px solid #1A1A1A;
                       box-shadow:4px 4px 0 #1A1A1A;padding:40px 40px 32px;">

              <p style="margin:0 0 8px;font-size:40px;text-align:center;">📖</p>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#1A1A1A;
                         text-align:center;line-height:1.2;">
                Confirm your email
              </h1>
              <p style="margin:0 0 28px;color:#6B7280;font-size:16px;text-align:center;line-height:1.6;">
                Hey <strong style="color:#1A1A1A;">{pen_name}</strong>! You're almost set up.<br/>
                Click below to verify your email and start writing.
              </p>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="{verify_url}"
                   style="display:inline-block;background:#F59E0B;color:#1A1A1A;
                          font-size:16px;font-weight:800;text-decoration:none;
                          padding:14px 32px;border-radius:100px;
                          border:2.5px solid #1A1A1A;box-shadow:3px 3px 0 #1A1A1A;">
                  ✦ Verify my email
                </a>
              </div>

              <hr style="border:none;border-top:2px solid #F3F4F6;margin:0 0 20px;" />

              <p style="margin:0 0 6px;font-size:13px;color:#6B7280;text-align:center;">
                Or paste this link in your browser:
              </p>
              <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;
                        word-break:break-all;line-height:1.5;">
                {verify_url}
              </p>
              <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
                This link expires in 24 hours. If you didn't sign up, ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                © 2026 Storybook.Studio — Made with crayons &amp; code.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_welcome_html(pen_name: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to Storybook.Studio</title>
</head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
               style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="display:inline-block;background:#1A1A1A;border-radius:16px;
                          border:2.5px solid #1A1A1A;padding:12px 24px;">
                <span style="font-size:22px;font-weight:900;color:#FFFBF5;letter-spacing:-0.5px;">
                  Storybook<span style="color:#F59E0B;">.</span>Studio
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFFFF;border-radius:24px;border:2.5px solid #1A1A1A;
                       box-shadow:4px 4px 0 #1A1A1A;padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:40px;text-align:center;">🎉</p>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#1A1A1A;
                         text-align:center;line-height:1.2;">
                You're all set, {pen_name}!
              </h1>
              <p style="margin:0 0 28px;color:#6B7280;font-size:16px;text-align:center;line-height:1.6;">
                Your account is verified. Time to write your first illustrated storybook!
              </p>
              <div style="text-align:center;">
                <a href="https://ai-storybook-studio.vercel.app/create"
                   style="display:inline-block;background:#F59E0B;color:#1A1A1A;
                          font-size:16px;font-weight:800;text-decoration:none;
                          padding:14px 32px;border-radius:100px;
                          border:2.5px solid #1A1A1A;box-shadow:3px 3px 0 #1A1A1A;">
                  ✦ Start your story
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                © 2026 Storybook.Studio — Made with crayons &amp; code.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
