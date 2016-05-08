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
    'user_face VARCHAR(255) NOT NULL DEFAULT \'assets/img/sarah.png\' , ' +
    'device_token VARCHAR(1024) NOT NULL, ' +
    'device_id VARCHAR(512) NOT NULL, ' +
    'device_type VARCHAR(512) NOT NULL, ' +
    'device_version VARCHAR(512) NOT NULL, ' +
    'socket_id VARCHAR(255) NOT NULL, ' +
    'online BOOLEAN NOT NULL CHECK (online IN (0, 1)), ' +
    'connection_time TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(user_id, user_name, device_id)' +
  ')';
QUERIES.CREATE_FRIENDS =
  'CREATE TABLE IF NOT EXISTS Friends(' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'friend_id VARCHAR(255) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(user_id, friend_id)' +
  ')';
QUERIES.CREATE_CHAT_ROOMS =
  'CREATE TABLE IF NOT EXISTS ChatRooms(' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(chat_room_id)' +
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
    'text VARCHAR(2048), ' +
    'type VARCHAR(20) NOT NULL DEFAULT \'text\', ' +
    'read BOOLEAN NOT NULL CHECK (read IN (0, 1)), ' +
    'read_time TIMESTAMP, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\') ' +
  ')';
QUERIES.CREATE_UNIQUE_INDEX_CHAT_MESSAGES = 'CREATE UNIQUE INDEX IF NOT EXISTS cmuidx01 ON ChatMessages(chat_message_id)';
QUERIES.CREATE_COMPLEX_INDEX1_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx01 ON ChatMessages (chat_message_id)';
QUERIES.CREATE_COMPLEX_INDEX2_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx02 ON ChatMessages (user_id)';
QUERIES.CREATE_COMPLEX_INDEX3_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx03 ON ChatMessages (user_id, text)';

QUERIES.INSERT_CHAT_MESSGE = 'INSERT INTO ChatMessages (' +
    'chat_room_id, user_id, text, type, read' +
  ') VALUES (?, ?, ?, ?, 0)';
QUERIES.INSERT_USER =
  'INSERT INTO Users ' +
  '(' +
    'user_id, user_name, user_face, device_token, device_id, device_type, ' +
    'device_version, socket_id, online, connection_time, created' +
  ') ' +
  'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
QUERIES.INSERT_FRIEND = 'INSERT INTO Friends (user_id, friend_id) VALUES (?, ?)';
QUERIES.INSERT_CHAT_ROOM = 'INSERT INTO ChatRooms (chat_room_id) VALUES (?)';
QUERIES.INSERT_CHAT_ROOM_USER = 'INSERT INTO ChatRoomUsers (chat_room_id, user_id) VALUES (?, ?)';
QUERIES.INSERT_CHAT_ROOM_SETTINGS = 
  'INSERT INTO ChatRoomSettings (' +
    'chat_room_id, user_id, translate_ko, show_picture' +
  ') VALUES (?, ?, ?, ?)';

QUERIES.UPDATE_CHAT_ROOM_SETTINGS_SET_TRANSLATE_KO_BY_CHAT_ROOM_ID_AND_USER_ID =
  'UPDATE ChatRoomSettings SET translate_ko = ? ' +
  'WHERE chat_room_id = ? AND user_id = ?';
QUERIES.UPDATE_CHAT_ROOM_SETTINGS_SET_SHOW_PICTURE_BY_CHAT_ROOM_ID_AND_USER_ID =
  'UPDATE ChatRoomSettings SET show_picture = ? ' +
  'WHERE chat_room_id = ? AND user_id = ?';
QUERIES.UPDATE_CHAT_MESSAGE_BY_CHAT_MESSAG_ID =
  'UPDATE ChatMessages SET read = ?, read_time = ? WHERE chat_message_id = ?';
QUERIES.UPDATE_USERS_SET_USER_NAME_BY_USER_ID = 'UPDATE Users SET user_name = ? WHERE user_id = ?';
QUERIES.UPDATE_USERS_SET_CONNECTION_TIME_BY_USER_ID =
  'UPDATE Users SET connection_time = ? WHERE user_id = ?';
QUERIES.UPDATE_USERS_SET_SOCKET_ID_BY_USER_ID = 'UPDATE Users SET socket_id = ? WHERE user_id = ?';
QUERIES.UPDATE_USERS_SET_ONLINE_BY_USER_ID = 'UPDATE Users SET online = ? WHERE user_id = ?';
QUERIES.UPDATE_USERS_SET_DEVICE_TOKEN_BY_USER_ID = 'UPDATE Users SET device_token = ? WHERE user_id = ?';

QUERIES.SELECT_DEVICE_TOKEN_BY_USER_ID = 'SELECT device_token FROM Users WHERE user_id = ?';
QUERIES.SELECT_USER_ONLINE_BY_USER_ID = 'SELECT online FROM Users WHERE user_id = ?';
QUERIES.SELECT_USER_BY_USER_ID =
  'SELECT ' +
    'user_id, user_name, user_face, ' +
    'device_token, device_id, device_type, device_version, ' +
    'socket_id, online, connection_time, created ' +
  'FROM Users WHERE user_id = ?';
QUERIES.SELECT_USER_BY_USER_NAME =
  'SELECT ' +
    'user_id, user_name, user_face, ' +
    'device_token, device_id, device_type, device_version, ' +
    'socket_id, online, connection_time, created ' +
  'FROM Users WHERE user_name = ?';
QUERIES.SELECT_USER_BY_DEVICE_ID =
  'SELECT ' +
    'user_id, user_name, user_face, ' +
    'device_token, device_id, device_type, device_version, ' +
    'socket_id, online, connection_time, created ' +
  'FROM Users WHERE device_id = ?';
QUERIES.SELECT_ALL_USERS =
  'SELECT ' +
    'user_id, user_name, user_face, ' +
    'device_token, device_id, device_type, device_version, ' +
    'socket_id, online, connection_time, created ' +
  'FROM Users ORDER BY user_name DESC';
QUERIES.SELECT_ALL_FRIENDS_BY_USER_ID =
  'SELECT ' +
    'u.user_id, u.user_name, u.user_face, u.device_token, ' +
    'u.device_id, u.device_type, u.device_version, u.socket_id, ' +
    'u.online, u.connection_time, f.created ' +
  'FROM Friends AS f ' +
  'JOIN Users AS u ON f.friend_id = u.user_id ' +
  'WHERE f.user_id = ? ' +
  'ORDER BY u.user_name DESC';
QUERIES.SELECT_FRIEND_BY_USER_ID_AND_FRIEND_ID =
  'SELECT * FROM Friends WHERE user_id = ? AND friend_id = ?';
QUERIES.SELECT_ALL_CHAT_ROOM_IDS_AND_FRIEND_ID_AND_LAST_MESSAGE_BY_USER_ID =
  'SELECT cu.chat_room_id, cu.user_id AS friend_id, cm.text AS last_text, MAX(cm.created) AS created ' +
  'FROM ChatRoomUsers AS cu, ChatMessages AS cm ' +
  'ON cu.chat_room_id = cm.chat_room_id ' +
  'WHERE cu.chat_room_id in (SELECT chat_room_id FROM ChatRoomUsers WHERE user_id = $userId) ' +
  'AND cu.user_id <> $userId';
QUERIES.SELECT_ALL_CHAT_ROOM_USERS_BY_CHAT_ROOM_ID = 
  'SELECT chat_room_id, user_id FROM ChatRoomUsers WHERE chat_room_id = ?';
QUERIES.SELECT_LAST_MESSAGE_BY_CHAT_ROOM_ID_AND_USER_ID =
  'SELECT MAX(created) AS max, ' +
    'text, type, read, read_time, created ' +
  'FROM ChatMessages ' +
  'WHERE chat_room_id = ? AND user_id = ? ORDER BY created DESC';
QUERIES.SELECT_ALL_CHAT_MESSAGES_BY_CHAT_ROOM_ID =
  'SELECT * FROM (' +
    'SELECT ' +
      'chat_message_id, chat_room_id, user_id, text, ' +
      'type, read, read_time, created ' +
    'FROM ChatMessages ' +
    'WHERE chat_room_id = ? ORDER BY created DESC LIMIT 40' +
  ') ORDER BY created ASC';
QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID_AND_FRIEND_ID = 
  'SELECT chat_room_id FROM ChatRoomUsers WHERE user_id in (?, ?) GROUP BY chat_room_id';
QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID = 
  'SELECT chat_room_id FROM ChatRoomUsers WHERE user_id = ? LIMIT 1';
QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID =
  'SELECT chat_room_id, user_id, translate_ko, show_picture FROM ChatRoomSettings ' +
  'WHERE chat_room_id = ? AND user_id = ?';
QUERIES.SELECT_ALL_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID =
  'SELECT chat_room_id, translate_ko, show_picture FROM ChatRoomSettings WHERE user_id = ? AND chat_room_id = ?';

QUERIES.DELETE_USER_BY_ID = 'DELETE FROM Users WHERE user_id = ?';
QUERIES.DELETE_FRIEND_BY_USER_ID_AND_FRIEND_ID = 'DELETE FROM Friends WHERE user_id = ? AND friend_id = ?';
QUERIES.DELETE_CHAT_ROOM_BY_ID = 'DELETE FROM ChatRooms WHERE chat_room_id = ?';
QUERIES.DELETE_CHAT_MESSAGES_BY_CHAT_ROOM_ID = 'DELETE FROM ChatMessages WHERE char_room_id = ?';
QUERIES.DELETE_CHAT_ROOM_USERS_BY_CHAT_ROOM_ID = 'DELETE FROM ChatRoomUsers WHERE chat_room_id = ?';
QUERIES.DELETE_CHAT_ROOM_USERS_BY_USER_ID = 'DELETE FROM ChatRoomUsers WHERE user_id = ?';

function prepareDatabase() {
  db.serialize(function () {
    db.run(QUERIES.CREATE_USERS);
    db.run(QUERIES.CREATE_FRIENDS);
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