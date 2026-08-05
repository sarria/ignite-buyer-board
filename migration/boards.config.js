'use strict';

/**
 * Every board we import, and the decisions that go with it.
 *
 * This file exists so those decisions live in the repo instead of in someone's head or in
 * a command they have to remember. Adding a board = adding an entry here; importing it is
 * then always the same one command.
 *
 *   key      short name used on the command line
 *   gid      Asana project GID (digits from app.asana.com/0/<gid>/list)
 *   archive  column names whose cards import as ARCHIVED — history, not live work.
 *            An archived card KEEPS its column: the archive grid labels it and the Column
 *            filter works there, so archiving doesn't cost you the section. It only keeps
 *            those cards out of every active board/list/calendar load.
 *   skip     column names not imported at all (templates, scratch boards)
 *
 * Names are matched case-insensitively and exactly; the seeder warns on a name the board
 * doesn't have, so a typo can't silently leave 2,000 cancelled accounts on the live board.
 */

module.exports = [
  {
    key: 'rachel',
    gid: '1156457376337923',
    name: 'The A Team (Team Rachel)',
    // Cancelled Clients alone was ~2,000 of 2,416 cards (83%) — an archive wearing a
    // section's name. Leaving it active makes every board load carry ~6x the cards.
    archive: ['Cancelled Clients', 'Completed Campaigns'],
    skip: ['Duplicate Task Board'],
  },
  {
    key: 'dream',
    gid: '1205337491932114',
    name: 'The Dream Team (Team Conrad)',
    archive: ['Completed'],
    skip: [],
  },
  {
    key: 'kathy',
    gid: '1208888075650797',
    name: 'Team Kathy',
    archive: ['Completed', 'Cancelled Clients'],
    skip: ['Template / Example'],
  },
  {
    key: 'ttots',
    gid: '1205337491932125',
    name: 'Team T Tots (Team Travis)',
    // University of Alabama and OOO Section are kept: odd names, but real live sections.
    archive: ['Completed', 'Cancelled Clients'],
    skip: ['Template / Example'],
  },
];
