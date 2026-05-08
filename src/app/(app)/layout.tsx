import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { DesktopSidebar, MobileBottomNav, MobileTopBar } from "@/components/NavSidebar";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Compteur de comptes en attente (badge dans la nav admin)
  const isAdmin = session.user.role === "ADMIN";
  const pendingUsersCount = isAdmin
    ? await db.user.count({ where: { status: "PENDING" } })
    : 0;

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
        <DesktopSidebar
          userName={session.user.name}
          userRole={session.user.role}
          pendingUsersCount={pendingUsersCount}
          signOutAction={handleSignOut}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar userName={session.user.name} signOutAction={handleSignOut} />
          <main className="flex-1 pb-24 md:pb-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </main>
          <MobileBottomNav
            isAdmin={isAdmin}
            pendingUsersCount={pendingUsersCount}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
