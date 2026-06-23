import { Box } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CardFace from './CardFace';

export default function BoardCard({ card, fields = [], users = [], onClick, dimmed = false, selected = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card._id,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : dimmed ? 0.45 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      sx={{
        bgcolor: selected
          ? (theme => theme.palette.mode === 'dark' ? 'rgba(69,115,210,0.20)' : 'rgba(69,115,210,0.10)')
          : 'background.paper',
        border: '1px solid',
        borderColor: selected ? '#4573d2' : 'divider',
        boxShadow: selected ? '0 0 0 1px #4573d2' : 'none',
        borderRadius: 1.5,
        p: 1.5,
        mb: 1,
        cursor: 'pointer',
        '&:hover': { boxShadow: selected ? '0 0 0 1px #4573d2' : 3 },
        transition: 'box-shadow 0.15s, background-color 0.15s',
        userSelect: 'none',
      }}
    >
      <CardFace card={card} fields={fields} users={users} />
    </Box>
  );
}
