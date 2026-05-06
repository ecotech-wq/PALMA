import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { DesktopSidebar, MobileBottomNav, MobileTopBar } from "@/components/NavSidebar";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
        <DesktopSidebar userName={session.user.name} signOutAction={handleSignOut} />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar userName={session.user.name} signOutAction={handleSignOut} />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">{children}</div>
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </ToastProvider>
  );
}
