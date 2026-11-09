import express, { Request, Response } from "express";
import twilio from "twilio";
import sgMail from "@sendgrid/mail";
import { config } from "./config";

const app = express();
app.use(express.json());
app.set("json spaces", 2); // pretty-print JSON in the browser

const twilioClient = twilio(config.twilio.sid, config.twilio.token);
sgMail.setApiKey(config.sendgrid.apiKey);

// ---------- helpers ----------

async function sendSms(to: string) {
  try {
    const msg = await twilioClient.messages.create({
      body: config.twilio.smsBody,
      from: config.twilio.fromNumber,
      to,
    });
    return { success: true, sid: msg.sid, status: msg.status, to: msg.to };
  } catch (err: any) {
    return {
      success: false,
      httpStatus: err.status,
      twilioCode: err.code,
      message: err.message,
    };
  }
}

async function sendEmail(to: string) {
  try {
    const [res] = await sgMail.send({
      to,
      from: { email: config.sendgrid.senderEmail, name: config.sendgrid.senderName },
      subject: "Test email from notify-test server",
      text: "If you can read this, SendGrid is working.",
      html: "<h3>It works ✅</h3><p>If you can read this, SendGrid is working.</p>",
    });
    return { success: true, httpStatus: res.statusCode, to };
  } catch (err: any) {
    return {
      success: false,
      httpStatus: err.code, // SendGrid puts the HTTP status in err.code
      message: err.message,
      details: err.response?.body?.errors,
    };
  }
}

// ---------- routes ----------

app.get("/", (_req: Request, res: Response) => {
  res.json({
    message: "notify-test server is running",
    endpoints: {
      "POST /send-sms": { body: { phone: "+91XXXXXXXXXX" } },
      "POST /send-email": { body: { email: "you@example.com" } },
      "POST /send-both": { body: { phone: "+91XXXXXXXXXX", email: "you@example.com" } },
      "GET /send-both?phone=...&email=...": "same as above, easy to hit from the browser",
    },
  });
});

app.post("/send-sms", async (req: Request, res: Response) => {
  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ error: "phone is required (e.g. +919876543210)" });
  const result = await sendSms(phone);
  res.status(result.success ? 200 : 502).json({ sms: result });
});

app.post("/send-email", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "email is required" });
  const result = await sendEmail(email);
  res.status(result.success ? 200 : 502).json({ email: result });
});

async function handleBoth(phone?: string, email?: string, res?: Response) {
  if (!phone || !email) {
    return res!.status(400).json({ error: "both phone and email are required" });
  }
  const [sms, mail] = await Promise.all([sendSms(phone), sendEmail(email)]);
  const ok = sms.success && mail.success;
  res!.status(ok ? 200 : 502).json({ sms, email: mail });
}

app.post("/send-both", (req, res) => handleBoth(req.body?.phone, req.body?.email, res));

app.get("/send-both", (req, res) =>
  handleBoth(req.query.phone as string, req.query.email as string, res)
);

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});