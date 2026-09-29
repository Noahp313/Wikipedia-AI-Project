import Link from "next/link";
import AccountButton from "../components/AccountButton";
import HomeTabs from "../components/HomeTabs";
import { SearchDraftProvider } from "../components/SearchDraft";
import { LogoMark } from "../components/icons";

// Shared shell for the Search / My articles / Settings tabs.
export default function HomeLayout({ children }) {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="grid grid-cols-[1fr_auto] items-center gap-y-3 px-4 py-4 sm:grid-cols-[1fr_auto_1fr] sm:px-6 sm:py-5">
        <Link href="/" className="flex items-center gap-2.5 justify-self-start">
          <LogoMark size={26} />
          <span className="text-sm font-semibold tracking-tight text-ink">Wikipedia AI</span>
        </Link>
        <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <HomeTabs />
        </div>
        <div className="justify-self-end">
          <AccountButton />
        </div>
      </header>
      <SearchDraftProvider>{children}</SearchDraftProvider>
    </main>
  );
}
