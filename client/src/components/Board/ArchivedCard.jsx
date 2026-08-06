import { Box, Typography } from '@mui/material';
import CardFace from './CardFace';

// Read-only card for the archived grid view. Intentionally does NOT use dnd-kit's
// useSortable — archived cards can't be dragged, and skipping that hook lets us
// render hundreds/thousands of them without freezing the board. `columnName` shows
// where the card lived (the grid is flat, not grouped by column).
export default function ArchivedCard({ card, fields = [], users = [], onClick, selected = false, columnName }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: selected
          ? (theme => theme.palette.mode === 'dark' ? 'rgba(69,115,210,0.20)' : 'rgba(69,115,210,0.10)')
          : 'background.paper',
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        boxShadow: theme => (selected ? `0 0 0 1px ${theme.palette.primary.main}` : 'none'),
        borderRadius: 1.5,
        p: 1.5,
        opacity: 0.92,
        cursor: 'pointer',
        '&:hover': { boxShadow: theme => (selected ? `0 0 0 1px ${theme.palette.primary.main}` : 3), opacity: 1 },
        transition: 'box-shadow 0.15s, opacity 0.15s',
        userSelect: 'none',
      }}
    >
      {columnName && (
        <Typography
          noWrap
          sx={{
            display: 'block', mb: 0.75, color: 'text.secondary', fontWeight: 700,
            fontSize: '0.65rem', letterSpacing: 0.4, textTransform: 'uppercase',
          }}
        >
          {columnName}
        </Typography>
      )}
      <CardFace card={card} fields={fields} users={users} readOnly />
    </Box>
  );
}
