import logging
from backend.config import settings

logger = logging.getLogger(__name__)

async def send_recovery_email(to_email: str, code: str):
    if not settings.SENDGRID_API_KEY:
        logger.info(f"[DEV] Recovery code for {to_email}: {code}")
        print(f"[DEV EMAIL] To: {to_email} | Code: {code}")
        return
    try:
        import sendgrid
        from sendgrid.helpers.mail import Mail
        sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
        message = Mail(
            from_email=settings.FROM_EMAIL, to_emails=to_email,
            subject="NexDeFi — Password Recovery Code",
            html_content=f"""<div style="font-family:monospace;max-width:480px;margin:0 auto;padding:32px;background:#0f1319;color:#e2e8f4;border-radius:12px">
              <h2 style="color:#3dd6f5">◈ NexDeFi</h2><p>Your recovery code:</p>
              <div style="font-size:36px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;background:#151b26;border-radius:8px;color:#3dd6f5;margin:20px 0">{code}</div>
              <p style="color:#6b7fa0;font-size:12px">Expires in 10 minutes.</p></div>""")
        sg.send(message)
    except Exception as e:
        logger.error(f"Email error: {e}")
