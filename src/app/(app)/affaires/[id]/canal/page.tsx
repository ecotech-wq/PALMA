import { redirect } from "next/navigation";

// ─── Fil (canal) d'une affaire : déplacé dans la messagerie ──────────────────
// Le fil d'affaire vit désormais dans le centre de travail
// /messagerie/affaire/[affaireId] (fil complet : médias, pagination,
// polling, bandeau de pilotage). Cette route est conservée pour les liens
// et notifications déjà émis : elle redirige simplement.

export default async function CanalAffairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/messagerie/affaire/${id}`);
}
