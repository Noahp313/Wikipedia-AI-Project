// Light/dark preference. "system" (no data-theme attribute) follows the OS;
// globals.css defines both palettes against :root[data-theme].
export const THEME_STORAGE_KEY = "wikai-theme";

export const THEMES = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

// Inlined in <head> so the saved theme applies before first paint (no flash).
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
