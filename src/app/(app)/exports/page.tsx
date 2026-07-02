import { redirect } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Receipt } from "lucide-react";
import { auth } from "@/auth";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExportForm } from "./ExportForm";

/**
 * Hub des exports comptables / data. Toutes les sources disponibles
 * avec sélecteur de période et boutons de téléchargement.
 *
 * Admin uniquement. Le FEC est strictement réservé à l'admin parce
 * qu'il agrège la paie nette.
 */
export default async function ExportsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/dashboard"
        title="Exports"
        description="Données comptables et opérationnelles en CSV/FEC, prêtes pour Excel ou ton expert-comptable."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-600" />
              Pointages (CSV)
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Tous les pointages détaillés sur la période. Une ligne par
              pointage (date × ouvrier × chantier).
            </p>
            <ExportForm endpoint="/api/export/pointages" filenamePrefix="pointages" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-amber-600" />
              Paiements (CSV)
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Détail des paiements générés sur la période, avec brut,
              avances, retenues outils et net.
            </p>
            <ExportForm endpoint="/api/export/paiements" filenamePrefix="paiements" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-blue-600" />
              Commandes (CSV)
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Toutes les commandes avec leurs lignes (désignation,
              quantité, prix unitaire). Format «&nbsp;achats par poste&nbsp;».
            </p>
            <ExportForm endpoint="/api/export/commandes" filenamePrefix="commandes" />
          </CardBody>
        </Card>

        <Card className="border-purple-200 dark:border-purple-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt size={18} className="text-purple-600" />
              FEC — Fichier des Écritures Comptables
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Format administratif obligatoire pour l&apos;administration
              fiscale. Génère les écritures à partir des paiements payés,
              commandes livrées et locations clôturées de la période.
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-2 mb-3">
              Mapping de comptes par défaut (641, 606, 613, 401, 512, 530).
              À faire valider par votre expert-comptable avant transmission
              au fisc.
            </p>
            <ExportForm endpoint="/api/export/fec" filenamePrefix="FEC" withSiren />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText size={16} className="text-slate-500" />À savoir
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <p>
            <strong className="text-slate-900 dark:text-slate-100">CSV (Excel)</strong>{" "}
            : séparateur point-virgule + BOM UTF-8 → Excel FR ouvre direct
            sans rien casser.
          </p>
          <p>
            <strong className="text-slate-900 dark:text-slate-100">FEC</strong>{" "}
            : format tabulé, virgule décimale, encodage UTF-8.
            Le nom du fichier suit la convention{" "}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
              &lt;SIREN&gt;FEC&lt;AAAAMMJJ&gt;.txt
            </code>{" "}
            où la date est celle de clôture de l&apos;exercice.
          </p>
          <p>
            <Download size={12} className="inline -mt-0.5 mr-1" />
            Toutes les exports respectent la limite de 5000 lignes pour
            les pointages et 2000 pour les commandes — au-delà, restreins
            la période.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
