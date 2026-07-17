import { redirect } from "next/navigation";

export default function Home() {
  // L'atterrissage LYNX est « Aujourd'hui » (Ma journée). Le lanceur
  // d'applications reste accessible via l'onglet « Accueil » (/accueil).
  redirect("/aujourdhui");
}
