import { IconButton, Tooltip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';

// The one complete/incomplete control. Asana's shape: a grey ring that fills green when
// done, never a square MUI checkbox — the drawer's subtask list used one and was the odd
// surface out. Lives here so the board, list and drawer can't drift apart again.

export default function CompleteToggle({ done, onToggle, disabled = false, size = 17, sx }) {
  return (
    <Tooltip title={done ? 'Mark incomplete' : 'Mark complete'}>
      <span style={{ display: 'flex', flexShrink: 0 }}>
        <IconButton
          size="small"
          disabled={disabled}
          onClick={onToggle}
          sx={{
            p: 0.25, flexShrink: 0,
            color: done ? '#4caf50' : 'text.disabled',
            '&:hover': { color: '#4caf50', bgcolor: 'transparent' },
            ...sx,
          }}
        >
          {done
            ? <CheckCircleIcon sx={{ fontSize: size }} />
            : <CheckCircleOutlineIcon sx={{ fontSize: size }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
