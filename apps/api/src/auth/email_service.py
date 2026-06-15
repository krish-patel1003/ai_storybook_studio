"""
Email service for sending transactional emails via Resend API.
Uses httpx (already in dependencies) — no extra package needed.
"""

import logging

import httpx

from src.config import settings

logger = logging.getLogger(__name__)


async def send_verification_email(to_email: str, pen_name: str, token: str) -> None:
    """Send a beautiful HTML email verification link."""
    verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"

    html = _build_verification_html(pen_name, verify_url)

    await _send_email(
        to=to_email,
        subject="Verify your Storybook.Studio account ✦",
        html=html,
    )


async def send_welcome_email(to_email: str, pen_name: str) -> None:
    """Send a welcome email after successful verification."""
    html = _build_welcome_html(pen_name)

    await _send_email(
        to=to_email,
        subject="Welcome to Storybook.Studio — let's write your first story! ✦",
        html=html,
    )


async def _send_email(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping email to %s", to)
        return

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": settings.EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html,
            },
        )

    if resp.status_code not in (200, 201):
        logger.error("Resend API error %s: %s", resp.status_code, resp.text)
    else:
        logger.info("Email sent to %s: %s", to, subject)


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

          <!-- Logo / header -->
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

              <!-- Book emoji + headline -->
              <p style="margin:0 0 8px;font-size:40px;text-align:center;">📖</p>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:900;color:#1A1A1A;
                         text-align:center;line-height:1.2;">
                Confirm your email
              </h1>
              <p style="margin:0 0 28px;color:#6B7280;font-size:16px;text-align:center;
                        line-height:1.6;">
                Hey <strong style="color:#1A1A1A;">{pen_name}</strong>! You're almost set up.<br/>
                Click below to verify your email and start writing.
              </p>

              <!-- CTA button -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="{verify_url}"
                   style="display:inline-block;background:#F59E0B;color:#1A1A1A;
                          font-size:16px;font-weight:800;text-decoration:none;
                          padding:14px 32px;border-radius:100px;
                          border:2.5px solid #1A1A1A;box-shadow:3px 3px 0 #1A1A1A;">
                  ✦ Verify my email
                </a>
              </div>

              <!-- Divider -->
              <hr style="border:none;border-top:2px solid #F3F4F6;margin:0 0 20px;" />

              <!-- Fallback URL -->
              <p style="margin:0 0 6px;font-size:13px;color:#6B7280;text-align:center;">
                Or paste this link in your browser:
              </p>
              <p style="margin:0;font-size:12px;color:#9CA3AF;text-align:center;
                        word-break:break-all;line-height:1.5;">
                {verify_url}
              </p>

              <!-- Expiry note -->
              <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
                This link expires in 24 hours. If you didn't sign up, you can safely ignore this.
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
              <p style="margin:0 0 28px;color:#6B7280;font-size:16px;text-align:center;
                        line-height:1.6;">
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
