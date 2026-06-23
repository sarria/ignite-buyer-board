import { createTheme } from '@mui/material/styles';

// Blue is the brand/accent color (buttons, avatars, active states). Red is
// reserved strictly for errors/alerts (overdue, delete, "Needs Work").
const FOCUS_BLUE = '#4573d2';

const common = {
  palette: {
    primary: { main: '#4573d2' },
  },
  typography: {
    fontFamily: 'Roboto, sans-serif',
  },
  components: {
    // Outlined inputs (TextField, Select) — blue outline when focused.
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: FOCUS_BLUE },
        },
      },
    },
    // Standard (underline) inputs — title edit, tags combobox.
    MuiInput: {
      styleOverrides: {
        root: {
          '&:after': { borderBottomColor: FOCUS_BLUE },
        },
      },
    },
    // Field labels turn blue (not coral) when their input is focused.
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { color: FOCUS_BLUE },
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
