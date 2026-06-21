import { Box, Typography, Chip, Avatar, Tooltip } from '@mui/material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import SellIcon from '@mui/icons-material/Sell';
import { tagColor } from '../../utils/tagColor';

const HEALTH_COLORS = {
  'Good': '#4caf50',
  'Ok': '#ff9800',
  'Needs Work': '#f44336',
  'Waiting on DCM': '#2196f3',
};

function getHealth(card, fields) {
  const healthField = fields.find(f => f.name === 'Health' && f.type === 'enum');
  if (!healthField) return null;
  const fv = card.fieldValues?.find(v => v.fieldId?.toString() === healthField._id?.toString());
  return fv?.valueEnum || null;
}

function getInitials(name = '') {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function isOverdue(dueDate) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

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

  const health = getHealth(card, fields);
  const healthColor = health ? HEALTH_COLORS[health] : null;
  const assignee = users.find(u => u._id?.toString() === card.assigneeId?.toString());
  const subtaskCount = card.subtaskCount || 0;
  const subtaskDone = card.subtaskDone || 0;
  const commentCount = card.commentCount || 0;
  const overdue = isOverdue(card.dueDate);

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
      {card.tags?.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
          {card.tags.map(tag => (
            <Tooltip key={tag} title={tag}>
              <SellIcon sx={{ fontSize: 17, color: tagColor(tag).dot }} />
            </Tooltip>
          ))}
        </Box>
      )}

      {health && (
        <Chip
          label={health}
          size="small"
          sx={{ bgcolor: healthColor, color: '#fff', mb: 0.75, fontSize: 11, height: 20 }}
        />
      )}

      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          lineHeight: 1.4,
          mb: 1,
        }}
      >
        {card.title}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {assignee && (
            <Tooltip title={assignee.name}>
              <Avatar sx={{ width: 24, height: 24, fontSize: 11, bgcolor: '#f06a6a' }}>
                {getInitials(assignee.name)}
              </Avatar>
            </Tooltip>
          )}
          {card.dueDate && (
            <Typography variant="caption" color={overdue ? 'error' : 'text.secondary'} fontWeight={overdue ? 700 : 400}>
              {new Date(card.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {subtaskCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <CheckBoxOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">{subtaskDone}/{subtaskCount}</Typography>
            </Box>
          )}
          {commentCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">{commentCount}</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
