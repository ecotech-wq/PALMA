import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth, signOut } from "@/auth";
import { requireAuth, espaceFilter } from "@/lib/auth-helpers";
import { DiscretProvider, DiscretToggle } from "@/features/discret";
import { db } from "@/lib/db";
import { DesktopSidebar, MobileBottomNav, MobileTopBar } from "@/components/NavSidebar";
import { ToastProvider } from "@/components/Toast";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { OfflineBanner } from "@/components/OfflineBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Socle espaces : contexte d'entreprise (rôle effectif, modules actifs).
  const me = await requireAuth();

  // Compteurs pour les badges de notification dans la nav
  // Badges plateforme (comptes en attente, paie a verser) : rôle GLOBAL, à
  // dessein (données non bornées par espace). La NAV, elle, suit le rôle
  // effectif d'espace (me.role) plus bas.
  const isAdmin = session.user.role === "ADMIN";
  const isConducteur = session.user.role === "CONDUCTEUR";
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

  const userId = session.user.id as string;

  // Pré-calcul des IDs de chantiers accessibles (pour le badge messagerie)
  let accessibleChantierIds: string[] | null = null;
  if (isClient) {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { chantiersClient: { select: { id: true } } },
    });
    accessibleChantierIds = (u?.chantiersClient ?? []).map((c) => c.id);
  }

  const { unreadMessagerieFor, unreadIncidentsFor, unreadDemandesFor } =
    await import("@/lib/read-state");

  const [
    pendingUsersCount,
    paiementsAVerser,
    locationsEnRetard,
    sortiesEnRetard,
    incidentsUnread,
    demandesUnread,
    messagerieUnread,
  ] = await Promise.all([
    isAdmin ? db.user.count({ where: { status: "PENDING" } }) : 0,
    // Paiements en attente : badge réservé aux admins, borné à l'entreprise
    // courante (socle espaces : pas de cumul inter-entreprises).
    isAdmin
      ? db.paiement.count({
          where: { statut: "CALCULE", ouvrier: { ...espaceFilter(me) } },
        })
      : 0,
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
    // Incidents non lus (ouverts/en cours + créés après last-read)
    isClient ? 0 : unreadIncidentsFor(userId),
    // Demandes non lues (en attente + créées après last-read) :
    // pertinent pour admin + conducteur qui doivent valider
    isAdmin || isConducteur ? unreadDemandesFor(userId) : 0,
    // Messagerie : nb total de nouveaux messages depuis dernière ouverture
    isClient
      ? { total: 0, byChantier: {} }
      : unreadMessagerieFor(userId, accessibleChantierIds),
  ]);

  // Charge les notifications de l'utilisateur (non lues + 20 plus récentes
  // pour le panel de la cloche)
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
    incidents: incidentsUnread,
    demandes: demandesUnread,
    messagerie: messagerieUnread.total,
  };

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  // Mode discret : cookie absent = montants MASQUÉS (réglage sûr).
  // La bascule (œil, touche M) écrit le cookie côté client.
  const discretCookie = (await cookies()).get("discret")?.value;
  const discretInitial = discretCookie !== "0";

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

  // L'œil du mode discret voyage avec la cloche : un seul point
  // d'insertion pour l'en-tête mobile ET la barre latérale desktop.
  const bellEtOeil = (
    <>
      <DiscretToggle />
      {bell}
    </>
  );

  return (
    <ToastProvider>
      <DiscretProvider initial={discretInitial}>
      <CommandPalette />
      <OfflineBanner />
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
        <DesktopSidebar
          userName={session.user.name}
          userRole={me.role}
          modules={me.modules}
          espaces={me.espaces.map((e) => ({ id: e.id, nom: e.nom }))}
          espaceCourantId={me.espaceCourant?.id ?? null}
          canSwitchEspace={me.isGlobalAdmin}
          pendingUsersCount={pendingUsersCount}
          navBadges={navBadges}
          clientVisibility={clientVisibility}
          signOutAction={handleSignOut}
          bell={bellEtOeil}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <MobileTopBar
            userName={session.user.name}
            signOutAction={handleSignOut}
            bell={bellEtOeil}
          />
          <main className="flex-1 pb-24 md:pb-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </main>
          <MobileBottomNav
            isAdmin={me.isAdmin}
            isConducteur={me.isConducteur}
            isClient={me.isClient}
            modules={me.modules}
            espaces={me.espaces.map((e) => ({ id: e.id, nom: e.nom }))}
            espaceCourantId={me.espaceCourant?.id ?? null}
            canSwitchEspace={me.isGlobalAdmin}
            pendingUsersCount={pendingUsersCount}
            navBadges={navBadges}
            clientVisibility={clientVisibility}
          />
        </div>
      </div>
      </DiscretProvider>
    </ToastProvider>
  );
}
