import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Tabs, Tab, CircularProgress, IconButton, Tooltip, Paper,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { getBoard } from '../api/boards';
import { getTemplates } from '../api/templates';
import { getUsers } from '../api/users';
import ColumnsTab from './settings/ColumnsTab';
import FieldsTab from './settings/FieldsTab';
import TemplatesTab from './settings/TemplatesTab';
import LuminaTab from './settings/LuminaTab';

export default function BoardSettingsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [columns, setColumns] = useState([]);
  const [fields, setFields] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getBoard(id), getTemplates(id), getUsers()]).then(([boardData, templateData, usersData]) => {
      setBoard(boardData);
      setColumns(boardData.columns || []);
      setFields(boardData.fields || []);
      setTemplates(templateData);
      setUsers(usersData);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  const tabHint = ['Drag-free list of board sections. Click a row to rename or recolor it.',
    'Custom fields shown on cards in this board (text, number, date, url, or enum).',
    'Reusable card templates: prefill column, assignee, fields, and subtasks.',
    'Which Lumina fields the card panel shows on this board. Overrides the global selection.'][tab];

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: 760, mx: 'auto', px: 3, py: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 3 }}>
          <Tooltip title="Back to board">
            <IconButton onClick={() => navigate(`/boards/${id}`)} size="small" sx={{ border: 1, borderColor: 'divider' }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <SettingsOutlinedIcon sx={{ color: 'text.secondary' }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" noWrap>{board?.name}</Typography>
            <Typography variant="caption" color="text.secondary">Board settings</Typography>
          </Box>
        </Box>

        {/* Panel: tabs + content */}
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ px: 1.5, borderBottom: '1px solid', borderColor: 'divider', minHeight: 44, '& .MuiTab-root': { minHeight: 44, textTransform: 'none', fontWeight: 600 } }}
          >
            <Tab label="Columns" />
            <Tab label="Fields" />
            <Tab label="Templates" />
            <Tab label="Lumina" />
          </Tabs>

          <Box sx={{ p: 2.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {tabHint}
            </Typography>
            {tab === 0 && <ColumnsTab boardId={id} columns={columns} onChange={setColumns} />}
            {tab === 1 && <FieldsTab boardId={id} fields={fields} onChange={setFields} />}
            {tab === 2 && <TemplatesTab boardId={id} templates={templates} columns={columns} fields={fields} users={users} onChange={setTemplates} />}
            {tab === 3 && <LuminaTab boardId={id} />}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
