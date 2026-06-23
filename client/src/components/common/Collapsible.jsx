import { useRef, useState, useEffect } from 'react';
import { Box, Link } from '@mui/material';

// Clamps tall content to `collapsedHeight` with a fade + "See more"/"See less".
// Re-measures on resize (e.g. when inline images finish loading) so the toggle
// only appears when content actually overflows.
export default function Collapsible({ children, collapsedHeight = 240 }) {
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setOverflows(el.offsetHeight > collapsedHeight + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsedHeight]);

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          maxHeight: expanded ? 'none' : collapsedHeight,
          overflow: 'hidden',
        }}
      >
        {/* Unconstrained wrapper so we can measure the true content height. */}
        <Box ref={contentRef}>{children}</Box>
        {!expanded && overflows && (
          <Box
            sx={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 44,
              pointerEvents: 'none',
              background: theme => `linear-gradient(to bottom, transparent, ${theme.palette.background.paper})`,
            }}
          />
        )}
      </Box>
      {overflows && (
        <Link
          component="button"
          type="button"
          variant="caption"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          sx={{ mt: 0.5, fontWeight: 600 }}
        >
          {expanded ? 'See less' : 'See more'}
        </Link>
      )}
    </Box>
  );
}
