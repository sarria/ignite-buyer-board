import { createTheme } from '@mui/material/styles';

// ── Design tokens (single source of truth) ───────────────────────────────────
// Blue is the brand/accent color (buttons, avatars, active states). Red is
// reserved strictly for errors/alerts (overdue, delete, "Needs Work").
// Typography is a compact, Asana-like scale; buttons are flat + sentence-case.
export const BRAND = '#4573d2';
const BRAND_DARK = '#3a63b8'; // contained-button hover (primary.dark)

// Compact 13px base scale. Use <Typography variant="…"> everywhere — do NOT
// hardcode fontSize in components, so changing the scale here reflows the app.
const typography = {
  fontFamily: 'Roboto, sans-serif',
  fontSize: 13,
  h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3 },     // 20 — page hero
  h5: { fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.3 },   // 17 — page/board title
  h6: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4 },   // 15 — section header
  subtitle1: { fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4 },  // 14
  subtitle2: { fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.4 }, // 13
  body1: { fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 },   // 14
  body2: { fontSize: '0.8125rem', fontWeight: 400, lineHeight: 1.5 },  // 13 — default body/cards
  caption: { fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.4 }, // 12 — meta
  button: { fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none' }, // 13, no SHOUTING
};

const common = {
  palette: {
    primary: { main: BRAND, dark: BRAND_DARK },
  },
  shape: { borderRadius: 8 },
  typography,
  components: {
    // Flat, sentence-case buttons (Asana-like). color="primary" → brand blue,
    // hover → primary.dark automatically. No per-button bgcolor needed.
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6 },
      },
    },
    // Outlined inputs (TextField, Select) — blue outline when focused.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: BRAND },
        },
      },
    },
    // Standard (underline) inputs — title edit, tags combobox.
    MuiInput: {
      styleOverrides: {
        root: {
          '&:after': { borderBottomColor: BRAND },
        },
      },
    },
    // Field labels turn blue (not coral) when their input is focused.
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { color: BRAND },
        },
      },
    },
  },
};

export const lightTheme = createTheme({
  ...common,
  palette: {
    ...common.palette,
    mode: 'light',
    background: { default: '#f9f9f9', paper: '#ffffff' },
    text: { primary: '#1d1f25' },
  },
});

export const darkTheme = createTheme({
  ...common,
  palette: {
    ...common.palette,
    mode: 'dark',
    background: { default: '#1a1a1a', paper: '#2d2d2d' },
    text: { primary: '#e0e0e0' },
  },
});
