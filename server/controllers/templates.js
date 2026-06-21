'use strict';

const { getDb } = require('../db');
const { ObjectId } = require('mongodb');

async function listTemplates(req, res, next) {
  try {
    const db = await getDb();
    const boardId = new ObjectId(req.params.id);
    const templates = await db.collection('card_templates')
      .find({ boardId })
      .sort({ position: 1, createdAt: 1 })
      .toArray();
    res.json(templates);
  } catch (err) { next(err); }
}

async function createTemplate(req, res, next) {
  try {
    const db = await getDb();
    const boardId = new ObjectId(req.params.id);
    const {
      name,
      descriptionTemplate = '',
      defaultColumnId = null,
      defaultAssigneeId = null,
      dueDateOffsetDays = null,
      defaultFieldValues = [],
      defaultSubtasks = [],
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: { message: 'name is required' } });

    const last = await db.collection('card_templates').findOne({ boardId }, { sort: { position: -1 } });
    const position = last ? (last.position ?? 0) + 1 : 0;

    const doc = {
      boardId,
      name: name.trim(),
      descriptionTemplate,
      defaultColumnId: defaultColumnId ? new ObjectId(defaultColumnId) : null,
      defaultAssigneeId: defaultAssigneeId ? new ObjectId(defaultAssigneeId) : null,
      dueDateOffsetDays,
      defaultFieldValues,
      defaultSubtasks,
      position,
      createdAt: new Date(),
    };
    const result = await db.collection('card_templates').insertOne(doc);
    res.status(201).json({ ...doc, _id: result.insertedId });
  } catch (err) { next(err); }
}

async function updateTemplate(req, res, next) {
  try {
    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    const {
      name, descriptionTemplate, defaultColumnId, defaultAssigneeId,
      dueDateOffsetDays, defaultFieldValues, defaultSubtasks,
    } = req.body;

    const patch = {};
    if (name !== undefined) patch.name = name.trim();
    if (descriptionTemplate !== undefined) patch.descriptionTemplate = descriptionTemplate;
    if (defaultColumnId !== undefined) patch.defaultColumnId = defaultColumnId ? new ObjectId(defaultColumnId) : null;
    if (defaultAssigneeId !== undefined) patch.defaultAssigneeId = defaultAssigneeId ? new ObjectId(defaultAssigneeId) : null;
    if (dueDateOffsetDays !== undefined) patch.dueDateOffsetDays = dueDateOffsetDays;
    if (defaultFieldValues !== undefined) patch.defaultFieldValues = defaultFieldValues;
    if (defaultSubtasks !== undefined) patch.defaultSubtasks = defaultSubtasks;

    const result = await db.collection('card_templates').findOneAndUpdate(
      { _id },
      { $set: patch },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: { message: 'Template not found' } });
    res.json(result);
  } catch (err) { next(err); }
}

async function deleteTemplate(req, res, next) {
  try {
    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    await db.collection('card_templates').deleteOne({ _id });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function applyTemplate(req, res, next) {
  try {
    const db = await getDb();
    const _id = new ObjectId(req.params.id);
    const { columnId, title } = req.body;

    const template = await db.collection('card_templates').findOne({ _id });
    if (!template) return res.status(404).json({ error: { message: 'Template not found' } });

    const resolvedColumnId = columnId
      ? new ObjectId(columnId)
      : template.defaultColumnId;

    if (!resolvedColumnId) return res.status(400).json({ error: { message: 'columnId is required (template has no default column)' } });

    const column = await db.collection('columns').findOne({ _id: resolvedColumnId });
    if (!column) return res.status(404).json({ error: { message: 'Column not found' } });

    const now = new Date();
    const card = {
      boardId: template.boardId,
      columnId: resolvedColumnId,
      title: title?.trim() || template.name,
      description: template.descriptionTemplate || '',
      assigneeId: template.defaultAssigneeId || null,
      dueDate: template.dueDateOffsetDays
        ? new Date(now.getTime() + template.dueDateOffsetDays * 86400000)
        : null,
      position: Date.now(),
      isArchived: false,
      fieldValues: template.defaultFieldValues || [],
      createdAt: now,
      updatedAt: now,
    };
    const cardResult = await db.collection('cards').insertOne(card);
    const cardId = cardResult.insertedId;

    if (template.defaultSubtasks?.length) {
      const subtasks = template.defaultSubtasks.map((s, i) => ({
        cardId,
        title: s.title,
        isComplete: false,
        assigneeId: null,
        dueDate: s.dueDateOffsetDays
          ? new Date(now.getTime() + s.dueDateOffsetDays * 86400000)
          : null,
        notes: '',
        position: i,
        createdAt: now,
      }));
      await db.collection('subtasks').insertMany(subtasks);
    }

    res.status(201).json({ ...card, _id: cardId });
  } catch (err) { next(err); }
}

async function reorderTemplates(req, res, next) {
  try {
    const db = await getDb();
    const boardId = new ObjectId(req.params.id);
    const { templateIds } = req.body;
    if (!Array.isArray(templateIds)) return res.status(400).json({ error: { message: 'templateIds array required' } });
    const ops = templateIds.map((id, position) => ({
      updateOne: { filter: { _id: new ObjectId(id), boardId }, update: { $set: { position } } },
    }));
    await db.collection('card_templates').bulkWrite(ops);
    res.status(204).end();
  } catch (err) { next(err); }
}

module.exports = { listTemplates, createTemplate, updateTemplate, deleteTemplate, applyTemplate, reorderTemplates };
