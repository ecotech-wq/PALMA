/**
 * Script inline qui applique le thème AVANT la première peinture du DOM
 * pour éviter un flash blanc en mode sombre (FOUC).
 * Doit être placé dans <head> ou tout début de <body>.
 */
const code = `(function(){try{var k='ogc-theme';var v=localStorage.getItem(k);var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=v==='dark'||((v==='system'||!v)&&m);if(dark)document.documentElement.classList.add('dark');}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
