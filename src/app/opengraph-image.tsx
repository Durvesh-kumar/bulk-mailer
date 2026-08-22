import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "InboxSend — High-Performance Cold Outreach";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0B0F19 0%, #1E3A8A 50%, #2563EB 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          color: "white",
          padding: "40px",
          textAlign: "center",
          position: "relative",
        }}
      >
        {/* Top Badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(255, 255, 255, 0.12)",
            padding: "12px 28px",
            borderRadius: "9999px",
            fontSize: "26px",
            fontWeight: "bold",
            marginBottom: "28px",
            border: "1.5px solid rgba(255, 255, 255, 0.25)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          🚀 InboxFlow
        </div>

        {/* Main Title */}
        <div
          style={{
            fontSize: "64px",
            fontWeight: "900",
            letterSpacing: "-1.5px",
            marginBottom: "20px",
            maxWidth: "950px",
            lineHeight: 1.15,
            textShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          High-Performance Cold Outreach
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: "30px",
            color: "#93C5FD",
            fontWeight: "500",
            maxWidth: "850px",
            lineHeight: 1.4,
          }}
        >
          Automated Multi-Account Rotation & High Inbox Delivery
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}