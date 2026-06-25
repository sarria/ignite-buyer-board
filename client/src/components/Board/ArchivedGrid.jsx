import { Box, Typography } from '@mui/material';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import ArchivedCard from './ArchivedCard';

// Flat, responsive gallery of archived cards (replaces the column layout in the
// archive view). Cards are read-only; the column they lived in shows as a label
// and in the card drawer.
export default function ArchivedGrid({
  cards = [], fields = [], users = [], columnNameById = {},
  selectedCardId = null, onCardClick,
}) {
  if (cards.length === 0) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', gap: 1 }}>
        <ArchiveOutlinedIcon sx={{ fontSize: 40, opacity: 0.5 }} />
        <Typography variant="body2">No archived cards.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 3 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 2,
          alignItems: 'start',
        }}
      >
        {cards.map(card => (
          <ArchivedCard
            key={card._id}
            card={card}
            fields={fields}
            users={users}
            columnName={columnNameById[card.columnId?.toString()]}
            selected={selectedCardId?.toString() === card._id?.toString()}
            onClick={() => onCardClick(card)}
          />
        ))}
      </Box>
    </Box>
  );
}
