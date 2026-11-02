export async function sendEmail(env, to, subject, html) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn("Email skipped: RESEND_API_KEY and EMAIL_FROM must be configured");
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend request failed (${response.status}): ${await response.text()}`);
  }
}
