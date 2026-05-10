import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { DesktopSidebar, MobileBottomNav, MobileTopBar } from "@/components/NavSidebar";
import { ToastProvider } from "@/components/Toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Compteurs pour les badges de notification dans la nav
  const isAdmin = session.user.role === "ADMIN";
  const today = new Date();

  const [
    pendingUsersCount,
    paiementsAVerser,
    locationsEnRetard,
    sortiesEnRetard,
  ] = await Promise.all([
    isAdmin ? db.user.count({ where: { status: "PENDING" } }) : 0,
    // Paiements en attente : badge réservé aux admins
    isAdmin ? db.paiement.count({ where: { statut: "CALCULE" } }) : 0,
    // Locations dont le retour prévu est dépassé et qui ne sont pas clôturées
    db.locationPret.count({
      where: { cloture: false, dateFinPrevue: { lt: today } },
    }),
    // Sorties matériel ouvertes depuis plus de 30 jours
    db.sortieMateriel.count({
      where: {
        dateRetour: null,
        dateSortie: {
          lt: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  const navBadges = {
    paie: paiementsAVerser,
    locations: locationsEnRetard,
    sorties: sortiesEnRetard,
  };

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
          navBadges={navBadges}
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
            navBadges={navBadges}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
