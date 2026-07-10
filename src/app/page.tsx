import { redirect } from "next/navigation";

export default function Home() {
  // L'écran d'accueil LYNX est le lanceur d'applications (grille par espace).
  redirect("/accueil");
}
