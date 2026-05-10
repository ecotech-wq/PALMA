import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { DesktopSidebar, MobileBottomNav, MobileTopBar } from "@/components/NavSidebar";
import { ToastProvider } from "@/components/Toast";
import { NotificationBell } from "@/components/NotificationBell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Compteurs pour les badges de notification dans la nav
  const isAdmin = session.user.role === "ADMIN";
  const isClient = session.user.role === "CLIENT";
  const today = new Date();

  // Charge les flags de visibilité du client (utilisé pour filtrer la nav)
  let clientVisibility = {
    showJournal: true,
    showIncidents: true,
    showPlans: true,
    showRapportsHebdo: true,
  };
  if (isClient) {
    const u = await db.user.findUnique({
      where: { id: session.user.id as string },
      select: {
        showJournal: true,
        showIncidents: true,
        showPlans: true,
        showRapportsHebdo: true,
      },
    });
    if (u) {
      clientVisibility = {
        showJournal: u.showJournal,
        showIncidents: u.showIncidents,
        showPlans: u.showPlans,
        showRapportsHebdo: u.showRapportsHebdo,
      };
    }
  }

  const [
    pendingUsersCount,
    paiementsAVerser,
    locationsEnRetard,
    sortiesEnRetard,
    incidentsOuverts,
    demandesEnAttente,
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
    // Incidents non résolus (OUVERT ou EN_COURS)
    db.incident.count({
      where: { statut: { in: ["OUVERT", "EN_COURS"] } },
    }),
    // Demandes de matériel en attente : pertinent pour l'admin
    // (les chefs voient leurs demandes mais le badge sert à l'admin
    // pour valider rapidement)
    isAdmin ? db.demandeMateriel.count({ where: { statut: "DEMANDEE" } }) : 0,
  ]);

  // Charge les notifications de l'utilisateur (non lues + 20 plus récentes
  // pour le panel de la cloche)
  const userId = session.user.id as string;
  const [notifications, unreadNotifCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.notification.count({ where: { userId, read: false } }),
  ]);

  const navBadges = {
    paie: paiementsAVerser,
    locations: locationsEnRetard,
    sorties: sortiesEnRetard,
    incidents: incidentsOuverts,
    demandes: demandesEnAttente,
  };

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const bell = (
    <NotificationBell
      notifications={notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt,
      }))}
      unreadCount={unreadNotifCount}
    />
  );

  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
        <DesktopSidebar
          userName={session.user.name}
          userRole={session.user.role}
          pendingUsersCount={pendingUsersCount}
          navBadges={navBadges}
          clientVisibility={clientVisibility}
          signOutAction={handleSignOut}
          bell={bell}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar
            userName={session.user.name}
            signOutAction={handleSignOut}
            bell={bell}
          />
          <main className="flex-1 pb-24 md:pb-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </main>
          <MobileBottomNav
            isAdmin={isAdmin}
            isClient={isClient}
            pendingUsersCount={pendingUsersCount}
            navBadges={navBadges}
            clientVisibility={clientVisibility}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
