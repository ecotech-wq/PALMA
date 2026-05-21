import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ProfileForm, PasswordForm } from "./ProfileForms";
import { updateProfile, changePassword } from "./actions";
import { formatDate } from "@/lib/utils";
import { EnablePushButton } from "@/components/EnablePushButton";
import { TotpSection } from "./TotpSection";

export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      totpEnabled: true,
    },
  });
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader title="Mon profil" description="Tes infos et ton mot de passe" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Mes informations</CardTitle>
            </CardHeader>
            <CardBody>
              <ProfileForm
                initial={{ name: user.name, email: user.email }}
                action={updateProfile}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changer le mot de passe</CardTitle>
            </CardHeader>
            <CardBody>
              <PasswordForm action={changePassword} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Authentification à 2 facteurs (2FA)</CardTitle>
            </CardHeader>
            <CardBody>
              <TotpSection initiallyEnabled={user.totpEnabled} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifications navigateur</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Reçois une notification push sur ce navigateur dès qu&apos;un
                événement important te concerne (demande matériel, incident,
                message, etc.) — même quand l&apos;app n&apos;est pas ouverte.
              </p>
              <EnablePushButton
                vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
              />
              {!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
                <p className="text-xs text-amber-700 dark:text-amber-400 italic">
                  Les notifications navigateur ne sont pas encore configurées
                  côté serveur (clés VAPID manquantes).
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>Compte</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Rôle</div>
                <div className="mt-0.5">
                  <Badge color={user.role === "ADMIN" ? "purple" : "blue"}>
                    {user.role === "ADMIN" ? "Administrateur" : "Chef de chantier"}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Statut</div>
                <div className="mt-0.5">
                  <Badge color="green">{user.status}</Badge>
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Créé le</div>
                <div className="text-slate-900 dark:text-slate-100">
                  {formatDate(user.createdAt)}
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
