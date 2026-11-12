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
          background: "#1A1918",
          color: "#ECEAE6",
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
                  color: "#8E8A84",
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
                border: "1px solid #2E2D2B",
                borderRadius: 2,
                padding: "8px 16px",
                color: "#8E8A84",
                fontSize: 15,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "#3FB950",
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
                  color: "#FF8A00",
                }}
              >
                <span
                  style={{ width: 30, height: 1, background: "#FF8A00" }}
                />
                OC / OPENCODE
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: 54,
                  lineHeight: 1.06,
                  letterSpacing: "-0.045em",
                  fontWeight: 600,
                }}
              >
                <span>Self-hosted AI coding</span>
                <span style={{ color: "#8E8A84" }}>workspace for OpenCode.</span>
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 22,
                  lineHeight: 1.4,
                  color: "#8E8A84",
                  maxWidth: 520,
                }}
              >
                Secure authentication, live AI sessions, file management, code
                diffs, terminal access, tasks and usage tracking.
              </div>
            </div>

            <div
              style={{
                width: 436,
                display: "flex",
                flexDirection: "column",
                borderRadius: 10,
                border: "1px solid #2E2D2B",
                background: "#232220",
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  paddingBottom: 14,
                  borderBottom: "1px solid #2E2D2B",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: "#3A3936",
                  }}
                />
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: "#3A3936",
                  }}
                />
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: "#3A3936",
                  }}
                />
                <span
                  style={{
                    marginLeft: 8,
                    fontFamily: mono,
                    fontSize: 11,
                    color: "#8E8A84",
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
                    color: "#3FB950",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 2,
                      background: "#3FB950",
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
                <div style={{ display: "flex", fontSize: 18, color: "#ECEAE6" }}>
                  Add rate limiting to login
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: 15,
                    lineHeight: 1.45,
                    color: "#8E8A84",
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
                  border: "1px solid #2E2D2B",
                  background: "#232220",
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
                  <span style={{ color: "#FF8A00" }}>edit</span>
                  <span style={{ color: "#D6D3CE" }}>src/lib/auth.ts</span>
                  <span style={{ marginLeft: "auto", color: "#3FB950" }}>+18</span>
                  <span style={{ color: "#E5534B" }}>-2</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: 10,
                    fontFamily: mono,
                    fontSize: 10.5,
                    color: "#F47067",
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
                    color: "#56D364",
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
                  border: "1px solid #2E2D2B",
                  background: "#232220",
                  padding: "10px 12px",
                  color: "#8E8A84",
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
                    background: "#FF8A00",
                    color: "#1A1918",
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
              borderTop: "1px solid #2E2D2B",
              paddingTop: 20,
              color: "#8E8A84",
              fontSize: 14,
            }}
          >
            <span>Live sessions · Subagents · Diffs · Usage</span>
            <span style={{ fontFamily: mono, color: "#8E8A84" }}>OCTANE</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
