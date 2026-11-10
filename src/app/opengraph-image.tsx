import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt =
  "OCTANE — a self-hosted OpenCode workspace";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const mono = "monospace";
const sans = "sans-serif";

const brandLogo = `data:image/png;base64,${readFileSync(
  path.join(process.cwd(), "public", "brand", "logo.png"),
).toString("base64")}`;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0b0f14",
          color: "#f8fafc",
          padding: "52px 64px",
          fontFamily: sans,
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* ImageResponse only accepts plain <img>; next/image is not available here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandLogo}
                alt=""
                width={240}
                height={80}
                style={{ width: 240, height: 80, objectFit: "contain" }}
              />
              <div
                style={{
                  display: "flex",
                  fontFamily: mono,
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  color: "#717a87",
                }}
              >
                OPENCODE WORKSPACE
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                border: "1px solid #2a323c",
                borderRadius: 999,
                padding: "8px 16px",
                color: "#a1a7b3",
                fontSize: 15,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#00d6a0",
                }}
              />
              Self-hosted
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 46 }}>
            <div
              style={{
                width: 590,
                display: "flex",
                flexDirection: "column",
                gap: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontFamily: mono,
                  fontSize: 13,
                  letterSpacing: "0.16em",
                  color: "#ff8a00",
                }}
              >
                <span
                  style={{ width: 30, height: 1, background: "#ff8a00" }}
                />
                OC / OPENCODE
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: 64,
                  lineHeight: 1.02,
                  letterSpacing: "-0.05em",
                  fontWeight: 600,
                }}
              >
                <span>Your codebase,</span>
                <span style={{ color: "#a1a7b3" }}>in the browser.</span>
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 23,
                  lineHeight: 1.4,
                  color: "#a1a7b3",
                  maxWidth: 520,
                }}
              >
                Live sessions, subagent progress, visual diffs and local usage.
                Authenticated, and entirely yours.
              </div>
            </div>

            <div
              style={{
                width: 436,
                display: "flex",
                flexDirection: "column",
                borderRadius: 18,
                border: "1px solid #2a323c",
                background: "#151a21",
                padding: 20,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingBottom: 14,
                  borderBottom: "1px solid #242b34",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "#3a424d",
                  }}
                />
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "#3a424d",
                  }}
                />
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: "#3a424d",
                  }}
                />
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: mono,
                    fontSize: 11,
                    color: "#717a87",
                  }}
                >
                  session / live
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#00d6a0",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "#00d6a0",
                    }}
                  />
                  connected
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingTop: 16,
                }}
              >
                <div style={{ display: "flex", fontSize: 18, color: "#f8fafc" }}>
                  Add rate limiting to login
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 15,
                    lineHeight: 1.45,
                    color: "#a1a7b3",
                  }}
                >
                  I&apos;ll add a per-IP limiter and wire it into the handler.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  marginTop: 16,
                  borderRadius: 10,
                  border: "1px solid #2a323c",
                  background: "#11161d",
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontFamily: mono,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "#ff8a00" }}>edit</span>
                  <span style={{ color: "#d5dae1" }}>src/lib/auth.ts</span>
                  <span style={{ marginLeft: "auto", color: "#00d6a0" }}>+18</span>
                  <span style={{ color: "#ff5364" }}>-2</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 10,
                    fontFamily: mono,
                    fontSize: 10.5,
                    color: "#ff7a88",
                  }}
                >
                  - if (!ip) return next();
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 4,
                    fontFamily: mono,
                    fontSize: 10.5,
                    color: "#5ee3bf",
                  }}
                >
                  + if (limited(ip)) return 429;
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginTop: 14,
                  borderRadius: 9,
                  border: "1px solid #2a323c",
                  background: "#11161d",
                  padding: "10px 12px",
                  color: "#717a87",
                  fontSize: 13,
                }}
              >
                Ask OpenCode…
                <div
                  style={{
                    marginLeft: "auto",
                    width: 24,
                    height: 24,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 7,
                    background: "#ff8a00",
                    color: "#0b0f14",
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  ↑
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid #242b34",
              paddingTop: 20,
              color: "#717a87",
              fontSize: 14,
            }}
          >
            <span>Live sessions · Subagents · Diffs · Usage</span>
            <span style={{ fontFamily: mono, color: "#a1a7b3" }}>OCTANE</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
