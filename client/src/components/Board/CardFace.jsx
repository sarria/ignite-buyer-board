import { Box, Typography, Chip, Tooltip } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SellIcon from '@mui/icons-material/Sell';
import LinkIcon from '@mui/icons-material/Link';
import { tagColor } from '../../utils/tagColor';
import AssigneeControl from '../common/AssigneeControl';
import DueDatePicker from '../common/DueDatePicker';

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

// Presentational card contents shared by BoardCard (draggable) and ArchivedCard.
export default function CardFace({ card, fields = [], users = [], onPatch, readOnly = false }) {
  const health = getHealth(card, fields);
  const healthColor = health ? HEALTH_COLORS[health] : null;
  const subtaskCount = card.subtaskCount || 0;
  const subtaskDone = card.subtaskDone || 0;
  const commentCount = card.commentCount || 0;
  // Legacy cards hold only an advertiserId — they're still linked, so count both
  // (same test LuminaPanel uses). `name` is the display copy stored on the link, so
  // the tooltip can name the campaign without a Lumina round-trip per card.
  const luminaLinked = !!(card.lumina?.lineitemId || card.lumina?.advertiserId);
  const luminaName = card.lumina?.name;

  return (
    <>
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

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, mb: 1 }}>
        {card.isCompleted && (
          <CheckCircleIcon sx={{ fontSize: 16, color: '#4caf50', flexShrink: 0, mt: '2px' }} />
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
            // Completed = green ✓ + dimmed title, not struck through (matches Asana).
            color: card.isCompleted ? 'text.disabled' : 'text.primary',
          }}
        >
          {card.title}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
        {/* Assign and set a due date without opening the card — the two edits buyers
            make while scanning a column. Dashed placeholders when unset (Asana). */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AssigneeControl
            value={card.assigneeId}
            users={users}
            readOnly={readOnly}
            onChange={id => onPatch?.({ assigneeId: id })}
          />
          <DueDatePicker
            compact
            value={card.dueDate}
            readOnly={readOnly}
            onChange={v => onPatch?.({ dueDate: v })}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Linked to Lumina. Brand blue (not muted like the counts) because it's a
              property of the card, not a tally — it should read at a glance when you
              scan a column for which accounts still need linking. */}
          {luminaLinked && (
            <Tooltip title={luminaName ? `Lumina · ${luminaName}` : 'Linked to Lumina'}>
              <LinkIcon sx={{ fontSize: 15, color: 'primary.main' }} />
            </Tooltip>
          )}
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
    </>
  );
}
