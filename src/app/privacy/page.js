import Link from "next/link";

export const metadata = {
  title: "Privacy — Wikipedia AI",
};

// Plain-language policy; linked from the Google sign-in consent screen.
// Keep it in sync with what the app actually stores.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/" className="btn btn-ghost -ml-2 mb-6 text-ink-muted">
        ← Back
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy</h1>
      <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-ink-muted">
        <p>
          <strong className="text-ink">What we store.</strong> If you sign in with Google, we store your name, email
          address and profile picture URL so we can show who&apos;s signed in and keep your articles tied to your
          account. We don&apos;t get your Google password or access to anything else in your Google account.
        </p>
        <p>
          <strong className="text-ink">Your articles.</strong> Articles you generate, your edits to them, and your
          edit history are stored so you can come back to them. Unsaved articles are deleted automatically after 7
          days. Saved articles are kept until you unsave them. Your articles are only visible to you.
        </p>
        <p>
          <strong className="text-ink">Without signing in.</strong> We create an anonymous session (a cookie) so your
          generated articles belong to you. It lasts until you close your browser: when you come back after that, the
          old session is ended and its articles can no longer be opened. If you sign in before then, those
          articles move to your account.
        </p>
        <p>
          <strong className="text-ink">AI processing.</strong> Your searches, questions and article text are sent to
          Google&apos;s Gemini API to generate and update articles. Source material comes from Wikipedia.
        </p>
        <p>
          <strong className="text-ink">No selling or ads.</strong> We don&apos;t sell your data or use it for
          advertising.
        </p>
        <p>
          <strong className="text-ink">Deleting your data.</strong> You can delete your account from Settings. This
          permanently removes your account, your articles and their edit history. For any other questions, contact
          the site owner.
        </p>
      </div>
    </main>
  );
}
