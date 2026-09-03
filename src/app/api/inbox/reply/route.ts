// src/app/api/inbox/reply/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyLicenseAndDevice } from "@/lib/licenseGuard";
import { decryptPassword } from "@/lib/encryption";

async function enforceSecurity(req: Request, machineId?: string, sessionToken?: string) {
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
  const clientDomain = hostHeader.split(":")[0].toLowerCase().trim();

  const guard = await verifyLicenseAndDevice(clientDomain, machineId, sessionToken);
  if (!guard.ok || !guard.machineId) {
    return {
      allowed: false,
      error: `Access Denied: ${guard.error || "Invalid license or device mismatch."}`,
      status: guard.reason === "NEW_DEVICE" ? 401 : 403,
    };
  }

  const resolvedUserId = String(guard.licenseId || guard.userId || clientDomain);
  return { allowed: true, machineId: guard.machineId, sessionToken: guard.sessionToken, userId: resolvedUserId };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // ⚡ ZERO DB HIT: सीधे फ्रंटएंड से appPassword और senderName रिसीव करना
    const { 
      machineId, 
      sessionToken, 
      fromEmail, 
      appPassword, 
      senderName, 
      toEmail, 
      subject, 
      replyText, 
      messageId 
    } = body;

    if (!fromEmail || !appPassword || !toEmail || !replyText) {
      return NextResponse.json({ error: "Missing required reply parameters (email/password/content)." }, { status: 400 });
    }

    const auth = await enforceSecurity(req, machineId, sessionToken);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // सीधे इन-मेमोरी डिक्रिप्शन (No DB Lookup)
    let plainAppPassword = "";
    try {
      plainAppPassword = decryptPassword(appPassword).replace(/\s+/g, "");
    } catch (decErr: any) {
      return NextResponse.json({ error: "Failed to decrypt app password." }, { status: 400 });
    }

    // SMTP Transporter
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: fromEmail.trim(),
        pass: plainAppPassword,
      },
    });

    const replySubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;

    // 🎯 RFC Standard Thread Linking
    let formattedMessageId = messageId ? messageId.trim() : undefined;
    if (formattedMessageId && !formattedMessageId.startsWith("<")) {
      formattedMessageId = `<${formattedMessageId}>`;
    }

    const mailOptions: any = {
      from: `"${senderName || fromEmail}" <${fromEmail}>`,
      to: toEmail,
      subject: replySubject,
      text: replyText,
    };

    if (formattedMessageId) {
      mailOptions.inReplyTo = formattedMessageId;
      mailOptions.references = formattedMessageId;
      mailOptions.headers = {
        "In-Reply-To": formattedMessageId,
        "References": formattedMessageId,
      };
    }

    const info = await transporter.sendMail(mailOptions);

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      sessionToken: auth.sessionToken,
    });
  } catch (err: any) {
    console.error("POST /api/inbox/reply Error:", err);
    return NextResponse.json({ error: err.message || "Failed to send reply." }, { status: 500 });
  }
}