// TS 7 rejects side-effect imports without a declaration (TS2882); Vite owns
// CSS at build time, so stylesheets are declaration-only, no exported shape.
declare module '*.css';
