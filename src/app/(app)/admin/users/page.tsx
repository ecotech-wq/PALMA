import { auth } from "@/auth";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, type BadgeColor } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { UserActions } from "./UserActions";
import {
  approveUser,
  revokeUser,
  deleteUser,
  changeUserRole,
  adminGenerateResetLink,
  setClientChantiers,
} from "./actions";

const statusLabel: Record<string, string> = {
  PENDING: "En attente",
  ACTIVE: "Actif",
  REVOKED: "Révoqué",
};

const statusColor: Record<string, BadgeColor> = {
  PENDING: "yellow",
  ACTIVE: "green",
  REVOKED: "red",
};

export default async function AdminUsersPage() {
  const session = await auth();
  const meId = session?.user?.id ?? "";

  const [users, allChantiers] = await Promise.all([
    db.user.findMany({
      include: {
        chantiersClient: { select: { id: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    db.chantier.findMany({
      select: { id: true, nom: true },
      orderBy: { nom: "asc" },
    }),
  ]);

  const pendingCount = users.filter((u) => u.status === "PENDING").length;

  return (
    <div>
      <PageHeader
        title="Administration — Utilisateurs"
        description={`${users.length} compte${users.length > 1 ? "s" : ""}${
          pendingCount > 0
            ? ` · ${pendingCount} en attente d'approbation`
            : ""
        }`}
      />

      {pendingCount > 0 && (
        <Card className="mb-5 bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900">
          <CardBody className="text-sm text-yellow-900 dark:text-yellow-200">
            <strong>{pendingCount}</strong>{" "}
            {pendingCount > 1 ? "comptes attendent" : "compte attend"} ton
            approbation pour pouvoir se connecter.
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Comptes</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {users.map((u) => {
              const isMe = u.id === meId;
              return (
                <li
                  key={u.id}
                  className="px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {u.name}
                      </span>
                      {isMe && (
                        <Badge color="blue">Toi</Badge>
                      )}
                      <Badge color={u.role === "ADMIN" ? "purple" : "slate"}>
                        {u.role}
                      </Badge>
                      <Badge color={statusColor[u.status] ?? "slate"}>
                        {statusLabel[u.status] ?? u.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {u.email} · créé {formatDate(u.createdAt)}
                    </div>
                  </div>

                  <UserActions
                    userId={u.id}
                    status={u.status}
                    role={u.role}
                    isMe={isMe}
                    allChantiers={allChantiers}
                    assignedChantierIds={u.chantiersClient.map((c) => c.id)}
                    onApprove={approveUser}
                    onRevoke={revokeUser}
                    onDelete={deleteUser}
                    onChangeRole={changeUserRole}
                    onResetPassword={adminGenerateResetLink}
                    onSetClientChantiers={setClientChantiers}
                  />
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
