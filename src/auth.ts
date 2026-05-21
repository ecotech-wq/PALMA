import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import type { Role } from "@/generated/prisma/enums";
import { verifyTotpToken, hashBackupCode } from "@/lib/totp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Code TOTP (6 chiffres) ou backup code (XXXX-XXXX). Optionnel : on
  // ne l'exige que si l'utilisateur a activé le 2FA.
  totpCode: z.string().optional().nullable(),
});

class AccountPendingError extends CredentialsSignin {
  code = "AccountPending";
}
class AccountRevokedError extends CredentialsSignin {
  code = "AccountRevoked";
}
class TotpRequiredError extends CredentialsSignin {
  code = "TotpRequired";
}
class TotpInvalidError extends CredentialsSignin {
  code = "TotpInvalid";
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }
  interface User {
    role: Role;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
        totpCode: { label: "Code 2FA", type: "text" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        // Compte en attente de validation par un admin
        if (user.status === "PENDING") {
          throw new AccountPendingError();
        }
        // Compte révoqué (l'admin a retiré l'accès)
        if (user.status === "REVOKED") {
          throw new AccountRevokedError();
        }

        // 2FA TOTP : si activé, on exige un code valide (TOTP ou backup)
        if (user.totpEnabled && user.totpSecret) {
          const code = (parsed.data.totpCode ?? "").trim();
          if (!code) throw new TotpRequiredError();

          // Format backup code "XXXX-XXXX" vs TOTP 6 chiffres
          const isBackup = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(code);
          if (isBackup) {
            const h = hashBackupCode(code);
            if (!user.totpBackupCodes.includes(h)) {
              throw new TotpInvalidError();
            }
            // Consomme le code à usage unique
            await db.user.update({
              where: { id: user.id },
              data: {
                totpBackupCodes: user.totpBackupCodes.filter(
                  (x) => x !== h
                ),
              },
            });
          } else {
            const valid = verifyTotpToken(user.totpSecret, code);
            if (!valid) throw new TotpInvalidError();
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
