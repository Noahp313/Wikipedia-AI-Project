import { notFound, redirect } from "next/navigation";
import { isDevAuthorized, isDevDashboardEnabled } from "../../../lib/devAuth";
import { devLogin } from "../actions";
import { LogoMark } from "../../components/icons";

// Must be evaluated per request: whether the dashboard is enabled comes from runtime env.
export const dynamic = "force-dynamic";

const ERROR_MESSAGES = {
    invalid: "That token isn't right.",
    "rate-limited": "Too many attempts. Wait a minute and try again.",
};

export default async function DevLoginPage({ searchParams }) {
    if (!isDevDashboardEnabled()) notFound();
    if (await isDevAuthorized()) redirect("/dev");

    const { error } = await searchParams;
    const message = ERROR_MESSAGES[error];

    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <form action={devLogin} className="card w-full max-w-sm p-6">
                <div className="mb-6 flex items-center gap-2.5">
                    <LogoMark size={26} />
                    <h1 className="text-sm font-semibold text-ink">Developer dashboard</h1>
                </div>

                <label htmlFor="token" className="mb-1.5 block text-sm font-medium text-ink">
                    Access token
                </label>
                <input
                    id="token"
                    name="token"
                    type="password"
                    required
                    autoFocus
                    autoComplete="current-password"
                    className="input font-mono text-sm"
                />

                {message && (
                    <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{message}</p>
                )}

                <button type="submit" className="btn btn-primary mt-4 w-full py-2">
                    Sign in
                </button>
            </form>
        </main>
    );
}
