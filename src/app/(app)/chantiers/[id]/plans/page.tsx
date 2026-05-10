import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  requireAuth,
  requireChantierAccess,
} from "@/lib/auth-helpers";
import { PlansSection } from "@/app/(app)/plans/PlansSection";

export default async function PlansChantierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireAuth();
  await requireChantierAccess(me, id);
  if (me.isClient && !me.visibility.showPlans) {
    redirect(`/chantiers/${id}`);
  }

  const [chantier, plans] = await Promise.all([
    db.chantier.findUnique({
      where: { id },
      select: { id: true, nom: true },
    }),
    db.planChantier.findMany({
      where: { chantierId: id },
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!chantier) notFound();

  return (
    <div>
      <PageHeader
        title={`Plans — ${chantier.nom}`}
        description="Plans d'exécution, fiches techniques, vidéos de montage"
        backHref={`/chantiers/${id}`}
      />

      <Card>
        <CardBody>
          <PlansSection
            chantierId={id}
            currentUserId={me.id}
            isAdmin={me.isAdmin}
            canUpload={!me.isClient}
            plans={plans.map((p) => ({
              id: p.id,
              uploaderId: p.uploaderId,
              uploaderName: p.uploader.name,
              nom: p.nom,
              description: p.description,
              fileUrl: p.fileUrl,
              mimeType: p.mimeType,
              fileSize: p.fileSize,
              createdAt: p.createdAt,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
