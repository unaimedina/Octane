import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { discordConfigured, passwordConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export const viewport: Viewport = { themeColor: "#1a1918" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (await getSession()) redirect("/chat");
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={safeNextPath(next)}
      discordEnabled={discordConfigured()}
      passwordEnabled={passwordConfigured()}
      initialError={error ?? null}
    />
  );
}
