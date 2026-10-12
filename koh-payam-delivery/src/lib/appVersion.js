// The app's version, stamped at build time (vite.config.ts `define`): the build
// date in Thailand plus the short commit, e.g. "v2026.10.11 · 4ce840e". Lets
// the team say exactly which build a phone is running when reporting a problem.
export function formatAppVersion(built, commit) {
    // en-CA formats as YYYY-MM-DD
    var day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(built);
    var sha = (commit !== null && commit !== void 0 ? commit : '').trim().slice(0, 7);
    return "v".concat(day.replace(/-/g, '.')).concat(sha ? " \u00B7 ".concat(sha) : '');
}
/** This build's version ("dev" on the dev server / in tests). */
export var APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
