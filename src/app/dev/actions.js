"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
    DEV_SESSION_COOKIE,
    DEV_SESSION_MAX_AGE_SECONDS,
    devSessionValue,
    isDevDashboardEnabled,
    tokenMatches,
} from "../../lib/devAuth";
import { devLoginRateLimit } from "../../lib/rateLimit";

export async function devLogin(formData) {
    if (!isDevDashboardEnabled()) notFound();

    const { success } = await devLoginRateLimit.limit("dev-login");
    if (!success) redirect("/dev/login?error=rate-limited");

    if (!tokenMatches(formData.get("token"))) redirect("/dev/login?error=invalid");

    const cookieStore = await cookies();
    cookieStore.set(DEV_SESSION_COOKIE, devSessionValue(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/dev",
        maxAge: DEV_SESSION_MAX_AGE_SECONDS,
    });

    redirect("/dev");
}

export async function devLogout() {
    const cookieStore = await cookies();
    cookieStore.delete({ name: DEV_SESSION_COOKIE, path: "/dev" });
    redirect("/dev/login");
}
