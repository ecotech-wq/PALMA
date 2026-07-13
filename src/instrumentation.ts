// ─── Instrumentation Next.js : cron interne des relances financières ─────────
// register() est appelé UNE fois au démarrage de chaque instance serveur
// (Next 16 : instrumentation.ts vit dans src/ et est actif par défaut, aucun
// drapeau de config). On n'arme le cron que dans le runtime Node : le runtime
// Edge n'a ni node-cron ni Prisma.
// Le balayage tourne à 6 h 30 heure de l'entreprise (Indian/Mauritius, UTC+4),
// avant l'arrivée au bureau : les pilotes trouvent les relances du jour dans
// leurs notifications. Le job CONSTATE et NOTIFIE L'ÉQUIPE, rien d'autre, et
// ne doit JAMAIS faire tomber le serveur (tout est enveloppé de try/catch).

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Anti double-armement : register() peut être ré-exécuté (rechargement en
  // dev, ré-import du module). Un seul cron par processus.
  const g = globalThis as typeof globalThis & {
    __cronRelancesArme?: boolean;
  };
  if (g.__cronRelancesArme) return;
  g.__cronRelancesArme = true;

  try {
    const cron = (await import("node-cron")).default;
    cron.schedule(
      "30 6 * * *",
      async () => {
        try {
          // Import différé : la base n'est touchée qu'au moment du balayage,
          // pas au démarrage du serveur.
          const { executerRelances } = await import("@/lib/relances");
          const bilan = await executerRelances();
          console.log(
            `[relances] balayage quotidien : ${bilan.examines} examinés, ` +
              `${bilan.constats} constats, ${bilan.notifiesNouveaux} nouveaux ` +
              `notifiés, ${bilan.dejaTraites} déjà traités`
          );
        } catch (e) {
          console.error("[relances] échec du balayage quotidien:", e);
        }
      },
      { timezone: "Indian/Mauritius", name: "relances-financieres" }
    );
    console.log(
      "[relances] cron armé : 6 h 30 chaque jour (Indian/Mauritius)"
    );
  } catch (e) {
    console.error("[relances] armement du cron impossible:", e);
  }
}
