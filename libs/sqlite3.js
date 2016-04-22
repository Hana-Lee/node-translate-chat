/**
 * @author Hana Lee
 * @since 2016-04-22 15:57
 */
'use strict';

var Sqlite3 = require('sqlite3').verbose();
var db = new Sqlite3.Database('translate-chat.db');
var QUERIES = {};
QUERIES.CREATE_USERS =
  'CREATE TABLE IF NOT EXISTS Users(' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'user_name VARCHAR(255) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(user_id, user_name)' +
  ')';
QUERIES.CREATE_CHAT_ROOMS =
  'CREATE TABLE IF NOT EXISTS ChatRooms(' +
    'chat_room_id VARCHAR(255) PRIMARY KEY NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\') ' +
  ')';
QUERIES.CREATE_CHAT_ROOM_SETTINGS =
  'CREATE TABLE IF NOT EXISTS ChatRoomSettings(' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'translate_ko BOOLEAN NOT NULL CHECK (translate_ko IN (0, 1)), ' +
    'show_picture BOOLEAN NOT NULL CHECK (show_picture IN (0, 1)), ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(chat_room_id, user_id)' +
  ')';
QUERIES.CREATE_CHAT_ROOM_USERS =
  'CREATE TABLE IF NOT EXISTS ChatRoomUsers(' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\')' +
  ')';
QUERIES.CREATE_CHAT_MESSAGES =
  'CREATE TABLE IF NOT EXISTS ChatMessages(' +
    'chat_message_id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'o_message VARCHAR(2048), ' +
    't_message VARCHAR(2048), ' +
    'from_lang_code CHAR(6), ' +
    'to_lang_code CHAR(6), ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\') ' +
  ')';
QUERIES.CREATE_UNIQUE_INDEX_CHAT_MESSAGES = 'CREATE UNIQUE INDEX IF NOT EXISTS cmuidx01 ON ChatMessages(chat_message_id)';
QUERIES.CREATE_COMPLEX_INDEX1_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx01 ON ChatMessages (chat_message_id)';
QUERIES.CREATE_COMPLEX_INDEX2_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx02 ON ChatMessages (user_id)';
QUERIES.CREATE_COMPLEX_INDEX3_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx03 ON ChatMessages (user_id, o_message, t_message)';

QUERIES.INSERT_CHAT_MESSGE = 'INSERT INTO ChatMessages (' +
    'chat_room_id, user_id, o_message, t_message, from_lang_code, to_lang_code' +
  ') VALUES (?, ?, ?, ?, ?, ?)';
QUERIES.INSERT_USER = 'INSERT INTO Users (user_id, user_name) VALUES (?, ?)';
QUERIES.INSERT_CHAT_ROOM = 'INSERT INTO ChatRooms (chat_room_id) VALUES (?)';
QUERIES.INSERT_CHAT_ROOM_USER = 'INSERT INTO ChatRoomUsers (chat_room_id, user_id) VALUES (?, ?)';

QUERIES.SELECT_ALL_USERS = 'SELECT user_id, user_name, created FROM Users ORDER BY user_name DESC';
QUERIES.SELECT_ALL_CHAT_ROOMS = 'SELECT chat_room_id, created FROM ChatRooms ORDER BY created DESC';
QUERIES.SELECT_ALL_CHAT_ROOM_USERS = 'SELECT chat_room_id, user_id FROM ChatRoomUsers WHERE chat_room_id = ?';
QUERIES.SELECT_LAST_MESSAGE_BY_CHAT_ROOM_ID =
  'SELECT message FROM ChatMessages ' +
  'WHERE chat_room_id = ? AND user_id = ? ORDER BY created DESC LIMIT 1';
QUERIES.SELECT_ALL_CHAT_MESSAGES =
  'SELECT chat_room_id, user_id, o_message, t_message, from_code, to_code, created FROM ChatMessages ' +
  'WHERE chat_room_id = ? ORDER BY created DESC';
QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID_AND_TO_USER_ID = 'SELECT chat_room_id FROM ChatRoomUsers WHERE user_id = ? AND user_id = ?';
QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID = 'SELECT chat_room_id FROM ChatRoomUsers WHERE user_id = ?';
QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID =
  'SELECT chat_room_id, user_id, translate_ko, show_picture FROM ChatRoomSettings ' +
  'WHERE chat_room_id = ? AND user_id = ?';

QUERIES.DELETE_USER_BY_ID = 'DELETE FROM Users WHERE user_id = ?';
QUERIES.DELETE_CHAT_ROOM_BY_ID = 'DELETE FROM ChatRooms WHERE chat_room_id = ?';
QUERIES.DELETE_CHAT_MESSAGES_BY_CHAT_ROOM_ID = 'DELETE FROM ChatMessages WHERE char_room_id = ?';
QUERIES.DELETE_CHAT_ROOM_USERS_BY_CHAT_ROOM_ID = 'DELETE FROM ChatRoomUsers WHERE chat_room_id = ?';
QUERIES.DELETE_CHAT_ROOM_USERS_BY_USER_ID = 'DELETE FROM ChatRoomUsers WHERE user_id = ?';

function prepareDatabase() {
  db.serialize(function () {
    db.run(QUERIES.CREATE_USERS);
    db.run(QUERIES.CREATE_CHAT_ROOMS);
    db.run(QUERIES.CREATE_CHAT_ROOM_SETTINGS);
    db.run(QUERIES.CREATE_CHAT_ROOM_USERS);
    db.run(QUERIES.CREATE_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_UNIQUE_INDEX_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_COMPLEX_INDEX1_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_COMPLEX_INDEX2_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_COMPLEX_INDEX3_CHAT_MESSAGES);
  });
}

module.exports = {
  db : db,
  QUERIES : QUERIES,
  prepareDatabase : prepareDatabase
};