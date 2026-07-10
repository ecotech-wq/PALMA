import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth, requireChantierAccess } from "@/lib/auth-helpers";
import { RapportPrintView } from "./RapportPrintView";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFmt = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Parse une date "YYYY-MM-DD" venant d'un query param. */
function parseDay(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return fallback;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    0,
    0,
    0,
    0
  );
  return isNaN(d.getTime()) ? fallback : d;
}

/**
 * Vue imprimable d'un rapport compilé depuis le fil messagerie.
 * Query params :
 *   from=YYYY-MM-DD  (défaut : aujourd'hui - 7j)
 *   to=YYYY-MM-DD    (défaut : aujourd'hui)
 *   for=equipe|client (défaut : equipe)
 *
 * En mode "client", on retire les messages marqués hiddenFromClient
 * et certains types internes (SORTIE/RETOUR/COMMANDE bruts).
 */
export default async function RapportPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; for?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireAuth();
  await requireChantierAccess(me, id);

  const audience: "equipe" | "client" =
    sp.for === "client" ? "client" : "equipe";

  // Fenêtre par défaut : 7 derniers jours
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 6);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = parseDay(sp.from, defaultFrom);
  from.setHours(0, 0, 0, 0);
  const to = parseDay(sp.to, today);
  to.setHours(23, 59, 59, 999);

  const chantier = await db.chantier.findUnique({
    where: { id },
    include: {
      chef: { select: { name: true, email: true } },
      clients: { select: { name: true, email: true } },
      // Entête du document : l'entreprise émettrice (nom + couleur d'accent).
      espace: { select: { nom: true, couleur: true } },
    },
  });
  if (!chantier) notFound();

  const messages = await db.journalMessage.findMany({
    where: {
      chantierId: id,
      createdAt: { gte: from, lte: to },
      // Mode client : on retire le hiddenFromClient et certains types
      // techniques qui ne parlent pas au client (sortie/retour matériel,
      // notes internes éventuellement marquées). On garde NOTE par défaut
      // car c'est le "fil" lisible.
      ...(audience === "client"
        ? {
            hiddenFromClient: false,
            type: {
              notIn: ["SYSTEM_SORTIE", "SYSTEM_RETOUR"],
            },
          }
        : {}),
    },
    include: {
      author: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group par jour côté serveur — la vue reste pure
  type Row = {
    id: string;
    type: string;
    authorName: string | null;
    authorRole: string | null;
    texte: string | null;
    photos: string[];
    hiddenFromClient: boolean;
    time: string;
  };
  const groups = new Map<string, Row[]>();
  for (const m of messages) {
    const k = new Date(m.createdAt).toISOString().slice(0, 10);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({
      id: m.id,
      type: m.type,
      authorName: m.author?.name ?? null,
      authorRole: m.author?.role ?? null,
      texte: m.texte,
      photos: m.photos,
      hiddenFromClient: m.hiddenFromClient,
      time: timeFmt.format(new Date(m.createdAt)),
    });
  }

  const days = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, rows]) => ({
      key: k,
      label: dayFmt.format(new Date(k + "T12:00:00.000Z")),
      rows,
    }));

  // Stats simples
  const photoCount = messages.reduce((acc, m) => acc + m.photos.length, 0);
  const incidents = messages.filter((m) => m.type === "SYSTEM_INCIDENT").length;
  const demandes = messages.filter((m) => m.type === "SYSTEM_DEMANDE").length;
  const rapportsQuot = messages.filter((m) => m.type === "SYSTEM_RAPPORT")
    .length;

  return (
    <RapportPrintView
      audience={audience}
      espace={{ nom: chantier.espace.nom, couleur: chantier.espace.couleur }}
      chantier={{
        nom: chantier.nom,
        adresse: chantier.adresse,
        description: chantier.description,
        chefName: chantier.chef?.name ?? null,
        chefEmail: chantier.chef?.email ?? null,
        clients: chantier.clients.map((c) => ({
          name: c.name,
          email: c.email,
        })),
      }}
      period={{
        fromLabel: dateFmt.format(from),
        toLabel: dateFmt.format(to),
        editedLabel: dateFmt.format(new Date()),
      }}
      stats={{
        total: messages.length,
        photoCount,
        incidents,
        demandes,
        rapportsQuot,
        days: days.length,
      }}
      days={days}
    />
  );
}
