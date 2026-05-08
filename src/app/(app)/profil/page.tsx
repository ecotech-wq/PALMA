import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { ProfileForm, PasswordForm } from "./ProfileForms";
import { updateProfile, changePassword } from "./actions";
import { formatDate } from "@/lib/utils";

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
