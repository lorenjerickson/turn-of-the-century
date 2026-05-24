export const TOTC_THEME_SETTING = "uiTheme";
export const TOTC_THEME_CLEAN = "clean";
export const TOTC_THEME_VICTORIAN = "victorian";

export const TOTC_THEME_CHOICES = Object.freeze({
    [TOTC_THEME_CLEAN]: "Clean",
    [TOTC_THEME_VICTORIAN]: "Victorian"
});

const MANAGED_THEME_CLASSES = Object.freeze([
    "totc-theme",
    "totc-theme-clean",
    "totc-theme-victorian",
    "totc-system-theme"
]);

export function normalizeTotcTheme(value) {
    const theme = String(value ?? "").trim().toLowerCase();
    return Object.hasOwn(TOTC_THEME_CHOICES, theme) ? theme : TOTC_THEME_CLEAN;
}

export function getTotcThemeBodyClasses(value) {
    const theme = normalizeTotcTheme(value);
    const classes = ["totc-theme", `totc-theme-${theme}`];
    if (theme === TOTC_THEME_VICTORIAN) classes.push("totc-system-theme");
    return classes;
}

export function applyTotcTheme(value, { body = globalThis.document?.body } = {}) {
    if (!body?.classList) return normalizeTotcTheme(value);

    body.classList.remove(...MANAGED_THEME_CLASSES);
    body.classList.add(...getTotcThemeBodyClasses(value));
    return normalizeTotcTheme(value);
}

export function registerTotcThemeSetting(systemId, { onChange } = {}) {
    game.settings.register(systemId, TOTC_THEME_SETTING, {
        name: "TotC UI theme",
        hint: "Choose the visual theme for Turn of the Century UI surfaces.",
        scope: "world",
        config: true,
        type: String,
        choices: TOTC_THEME_CHOICES,
        default: TOTC_THEME_CLEAN,
        onChange: (value) => {
            const theme = applyTotcTheme(value);
            onChange?.(theme);
        }
    });
}
