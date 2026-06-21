import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Tabs, Tab, CircularProgress, IconButton, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { getBoard } from '../api/boards';
import { getTemplates } from '../api/templates';
import { getUsers } from '../api/users';
import ColumnsTab from './settings/ColumnsTab';
import FieldsTab from './settings/FieldsTab';
import TemplatesTab from './settings/TemplatesTab';

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

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Tooltip title="Back to board">
          <IconButton onClick={() => navigate(`/boards/${id}`)}><ArrowBackIcon /></IconButton>
        </Tooltip>
        <Typography variant="h6" fontWeight={700}>{board?.name} — Settings</Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab label="Columns" />
        <Tab label="Fields" />
        <Tab label="Templates" />
      </Tabs>

      {tab === 0 && <ColumnsTab boardId={id} columns={columns} onChange={setColumns} />}
      {tab === 1 && <FieldsTab boardId={id} fields={fields} onChange={setFields} />}
      {tab === 2 && <TemplatesTab boardId={id} templates={templates} columns={columns} fields={fields} users={users} onChange={setTemplates} />}
    </Box>
  );
}
