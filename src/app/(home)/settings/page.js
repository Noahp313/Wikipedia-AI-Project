"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient, signInWithGoogle } from "../../../lib/auth-client";
import { useLocalStorage } from "../../../lib/useLocalStorage";
import { applyTheme, THEME_STORAGE_KEY, THEMES } from "../../../lib/theme";
import {
  DEFAULT_LEVEL,
  EXPLANATION_LEVELS,
  LEVEL_STORAGE_KEY,
  normalizeLevel,
} from "../../../lib/explanationLevels";
import LevelPicker from "../../components/LevelPicker";
import { FeatureCheckboxes } from "../../components/FeaturesPicker";
import { FEATURES_STORAGE_KEY, parseStoredFeatures } from "../../../lib/features";
import { LogOutIcon, TrashIcon } from "../../components/icons";

function SettingsCard({ title, description, children }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-faint">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.id ? "bg-surface text-ink shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08)]" : "text-ink-faint hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState({ status: "idle" });

  const handleDelete = async () => {
    setState({ status: "working" });
    const { error } = await authClient.deleteUser();
    if (!error) {
      router.push("/");
      router.refresh();
      return;
    }
    // Google-only accounts must have signed in within the last day to delete
    setState({ status: error.code === "SESSION_EXPIRED" ? "stale" : "error", message: error.message });
  };

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="btn btn-secondary text-danger hover:bg-danger-soft hover:text-danger">
        <TrashIcon size={15} />
        Delete account
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-danger/30 bg-danger-soft p-4">
      <p className="text-sm font-medium text-ink">Delete your account permanently?</p>
      <p className="mt-1 text-sm text-ink-muted">
        This removes your account, every article you&apos;ve saved or generated, and their edit history. It can&apos;t be
        undone.
      </p>
      {state.status === "stale" && (
        <p className="mt-3 text-sm text-danger">
          For your security, sign in again before deleting your account.{" "}
          <button onClick={() => signInWithGoogle("/settings")} className="cursor-pointer font-medium underline">
            Sign in again
          </button>
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-3 text-sm text-danger">Couldn&apos;t delete your account{state.message ? `: ${state.message}` : "."}</p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={handleDelete}
          disabled={state.status === "working"}
          className="btn bg-danger text-white hover:opacity-90"
        >
          {state.status === "working" ? "Deleting…" : "Delete forever"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setState({ status: "idle" });
          }}
          disabled={state.status === "working"}
          className="btn btn-ghost"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;
  const signedIn = !!user && !user.isAnonymous;

  const [theme, setTheme] = useLocalStorage(THEME_STORAGE_KEY, "system");
  const [storedLevel, setLevel] = useLocalStorage(LEVEL_STORAGE_KEY, DEFAULT_LEVEL);
  const level = normalizeLevel(storedLevel);
  // Same saved selection as the search bar's Features button
  const [storedFeatures, setStoredFeatures] = useLocalStorage(FEATURES_STORAGE_KEY, null);
  const features = parseStoredFeatures(storedFeatures);

  const handleTheme = (next) => {
    setTheme(next);
    applyTheme(next);
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Settings</h1>

      <SettingsCard title="Appearance" description="Choose a theme, or match your device.">
        <Segmented options={THEMES} value={theme} onChange={handleTheme} label="Theme" />
      </SettingsCard>

      <SettingsCard
        title="Default explanation level"
        description="Used for new articles. You can still change it in the search box or the chat."
      >
        <LevelPicker value={level} onChange={setLevel} />
        <p className="mt-2 text-sm text-ink-muted">{EXPLANATION_LEVELS.find((l) => l.id === level).description}.</p>
      </SettingsCard>

      <SettingsCard
        title="Default features"
        description="What new articles may include when it fits. You can still change it from the search bar, and asking for one directly (e.g. “with a table”) always includes it."
      >
        <div className="-mx-2.5">
          <FeatureCheckboxes value={features} onChange={(next) => setStoredFeatures(next.join(","))} />
        </div>
      </SettingsCard>

      <SettingsCard title="Account">
        {isPending ? (
          <div className="h-10 w-48 animate-pulse rounded-lg bg-subtle" />
        ) : signedIn ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{user.name || user.email}</p>
                <p className="truncate text-sm text-ink-faint">Signed in with Google · {user.email}</p>
              </div>
              <button onClick={handleSignOut} className="btn btn-secondary">
                <LogOutIcon size={15} />
                Sign out
              </button>
            </div>
            <div className="border-t border-line pt-5">
              <DeleteAccount />
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Sign in to save articles and open them on any device.
            </p>
            <button onClick={() => signInWithGoogle("/settings")} className="btn btn-primary">
              Sign in with Google
            </button>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
