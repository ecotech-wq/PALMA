import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  Send,
  CheckCircle2,
  Undo2,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Field, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  getHebdoData,
  updateRapportHebdoIntro,
  envoyerRapportHebdoAuClient,
  annulerEnvoiRapportHebdo,
} from "@/app/(app)/rapports-hebdo/actions";
import { lundiDeLaSemaine } from "@/lib/dates";
import { HebdoMessageRow } from "@/app/(app)/rapports-hebdo/HebdoMessageRow";
import { HebdoSignBox } from "@/app/(app)/rapports-hebdo/HebdoSignBox";

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftWeek(date: string, weeks: number): string {
  const d = new Date(date + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return isoDay(d);
}

export default async function RapportHebdoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ w?: string; preview?: string }>;
}) {
  const { id } = await params;
  const { w, preview } = await searchParams;
  const previewAsClient = preview === "client";

  // Détermine le lundi de la semaine demandée
  const semaineDebut = w
    ? new Date(w + "T00:00:00.000Z")
    : lundiDeLaSemaine(new Date());
  const semaineFin = new Date(semaineDebut);
  semaineFin.setUTCDate(semaineFin.getUTCDate() + 6);

  const { me, hebdo, messages, chantier } = await getHebdoData(
    id,
    semaineDebut
  );
  if (!chantier) notFound();
  if (me.isClient && !me.visibility.showRapportsHebdo) {
    redirect(`/chantiers/${id}`);
  }

  const semaineDebutStr = isoDay(semaineDebut);
  const isLundiCourant =
    semaineDebutStr === isoDay(lundiDeLaSemaine(new Date()));

  const hiddenMessageIds = new Set(hebdo?.hiddenMessageIds ?? []);
  const envoyeAuClient = hebdo?.envoyeAuClient ?? false;

  // Filtrage final pour le client : exclut les messages cachés
  // (par hiddenFromClient OU par hiddenMessageIds dans le rapport)
  const visibleForClient = messages.filter(
    (m) => !m.hiddenFromClient && !hiddenMessageIds.has(m.id)
  );

  // Messages affichés : tous pour admin/chef en mode normal,
  // version filtrée si client OU si admin a activé l'aperçu client.
  const isViewingAsClient = me.isClient || (me.isAdmin && previewAsClient);
  const messagesToShow = isViewingAsClient ? visibleForClient : messages;

  const updateIntroAction = updateRapportHebdoIntro.bind(
    null,
    id,
    semaineDebutStr
  );
  const envoyerAction = envoyerRapportHebdoAuClient.bind(
    null,
    id,
    semaineDebutStr
  );
  const annulerEnvoiAction = annulerEnvoiRapportHebdo.bind(
    null,
    id,
    semaineDebutStr
  );

  return (
    <div>
      <PageHeader
        title={`Rapport hebdo — ${chantier.nom}`}
        description={`Du ${dateFmt.format(semaineDebut)} au ${dateFmt.format(semaineFin)}`}
        backHref={`/chantiers/${id}`}
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {envoyeAuClient ? (
              <Badge color="green">Envoyé</Badge>
            ) : (
              <Badge color="yellow">Brouillon</Badge>
            )}
            {me.isAdmin && (
              <Link
                href={`/chantiers/${id}/rapport-hebdo?w=${semaineDebutStr}${previewAsClient ? "" : "&preview=client"}`}
              >
                <Button size="sm" variant="outline">
                  {previewAsClient ? (
                    <>
                      <EyeOff size={14} />
                      <span className="hidden sm:inline">Vue admin</span>
                    </>
                  ) : (
                    <>
                      <Eye size={14} />
                      <span className="hidden sm:inline">Aperçu client</span>
                    </>
                  )}
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {previewAsClient && me.isAdmin && (
        <div className="mb-3 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Eye size={14} />
          <span>
            <strong>Aperçu client</strong> — voici exactement ce que verra le
            client. Les messages cachés ou exclus sont masqués.
          </span>
        </div>
      )}

      {/* Navigation semaine */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 mb-3 flex items-center gap-2">
        <Link
          href={`/chantiers/${id}/rapport-hebdo?w=${shiftWeek(semaineDebutStr, -1)}`}
        >
          <Button variant="ghost" size="icon">
            <ChevronLeft size={18} />
          </Button>
        </Link>
        <div className="flex-1 text-center text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">
          <CalendarRange size={14} className="inline mr-1" />
          Semaine du {dateFmt.format(semaineDebut)}
        </div>
        <Link
          href={`/chantiers/${id}/rapport-hebdo?w=${shiftWeek(semaineDebutStr, 1)}`}
        >
          <Button variant="ghost" size="icon">
            <ChevronRight size={18} />
          </Button>
        </Link>
        {!isLundiCourant && (
          <Link
            href={`/chantiers/${id}/rapport-hebdo?w=${isoDay(lundiDeLaSemaine(new Date()))}`}
          >
            <Button variant="outline" size="sm">
              Cette semaine
            </Button>
          </Link>
        )}
      </div>

      <div className={`grid grid-cols-1 ${me.isAdmin && !previewAsClient ? "lg:grid-cols-3" : ""} gap-5`}>
        <div className={me.isAdmin && !previewAsClient ? "lg:col-span-2 space-y-4" : "space-y-4"}>
          {/* Intro éditable par admin (hors preview) */}
          {me.isAdmin && !previewAsClient && (
            <Card>
              <CardHeader>
                <CardTitle>Introduction du rapport</CardTitle>
              </CardHeader>
              <CardBody>
                <form action={updateIntroAction} className="space-y-2">
                  <Field
                    label="Mot d'introduction (optionnel)"
                    hint="Affiché en haut du rapport envoyé au client"
                  >
                    <Textarea
                      name="texteIntro"
                      rows={3}
                      defaultValue={hebdo?.texteIntro ?? ""}
                      placeholder="Cette semaine sur le chantier, les équipes ont avancé sur..."
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">
                      <Save size={14} /> Enregistrer
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}

          {/* Pour un client (vrai ou en aperçu), afficher l'intro en lecture */}
          {isViewingAsClient && hebdo?.texteIntro && (
            <Card>
              <CardBody>
                <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                  {hebdo.texteIntro}
                </div>
              </CardBody>
            </Card>
          )}

          {/* Vue : liste des messages de la semaine */}
          <Card>
            <CardHeader>
              <CardTitle>
                {isViewingAsClient
                  ? "Activité de la semaine"
                  : `Tous les messages (${messages.length} — ${visibleForClient.length} visibles client)`}
              </CardTitle>
            </CardHeader>
            <CardBody className="!p-0">
              {messagesToShow.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 italic text-center">
                  Aucune activité cette semaine.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {messagesToShow.map((m) => (
                    <HebdoMessageRow
                      key={m.id}
                      chantierId={id}
                      semaineDebutStr={semaineDebutStr}
                      message={{
                        id: m.id,
                        type: m.type,
                        texte: m.texte,
                        photos: m.photos,
                        videos: m.videos,
                        hiddenFromClient: m.hiddenFromClient,
                        date: m.date,
                        createdAt: m.createdAt,
                        authorName: m.author?.name ?? null,
                        incidentId: m.incidentId,
                        demandeId: m.demandeId,
                        commandeId: m.commandeId,
                      }}
                      excluded={hiddenMessageIds.has(m.id)}
                      // En aperçu client, on désactive les contrôles admin
                      isAdmin={me.isAdmin && !previewAsClient}
                      isClient={isViewingAsClient}
                    />
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Encart signature client : visible pour le client (vrai ou en aperçu)
              uniquement si le rapport a été envoyé. */}
          {isViewingAsClient && envoyeAuClient && (
            <HebdoSignBox
              chantierId={id}
              semaineDebutStr={semaineDebutStr}
              alreadySignedUrl={hebdo?.signatureClientUrl ?? null}
              signedAt={hebdo?.signatureClientLe ?? null}
            />
          )}
        </div>

        {/* Sidebar admin : envoi au client (cachée en mode preview) */}
        {me.isAdmin && !previewAsClient && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Envoi au client</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3 text-sm">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Avant d&apos;envoyer, parcours les messages et coche
                  l&apos;œil pour cacher ceux que tu ne veux pas exposer
                  (incompétences, retards, échanges internes).
                </p>
                <div className="text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Total messages
                    </span>
                    <strong>{messages.length}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Visibles par le client
                    </span>
                    <strong className="text-green-600">
                      {visibleForClient.length}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">
                      Cachés
                    </span>
                    <strong className="text-amber-600">
                      {messages.length - visibleForClient.length}
                    </strong>
                  </div>
                </div>
                {envoyeAuClient ? (
                  <>
                    <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 px-3 py-2 text-xs text-green-800 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      Envoyé le{" "}
                      {hebdo?.envoyeLe
                        ? new Date(hebdo.envoyeLe).toLocaleString("fr-FR")
                        : "—"}
                    </div>
                    <form action={annulerEnvoiAction}>
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Undo2 size={14} /> Annuler l&apos;envoi
                      </Button>
                    </form>
                  </>
                ) : (
                  <form action={envoyerAction}>
                    <Button type="submit" size="sm" className="w-full">
                      <Send size={14} /> Envoyer au client
                    </Button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 italic">
                      Les clients rattachés à ce chantier recevront une
                      notification.
                    </p>
                  </form>
                )}
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
