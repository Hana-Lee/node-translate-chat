/**
 * @author Hana Lee
 * @since 2016-04-22 15:57
 */
'use strict';

var Sqlite3 = require('sqlite3').verbose();
var db = new Sqlite3.Database('translate-chat.db');
var debug = require('debug')('node-translate-chat:sqlite3');
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
QUERIES.CREATE_CHAT_ROOM_SETTING_MASTER = '' +
  'CREATE TABLE IF NOT EXISTS ChatRoomSettingMaster(' +
    'setting_master_id INTEGER, ' +
    'setting_key VARCHAR(25) NOT NULL, ' +
    'setting_name VARCHAR(25) NOT NULL, ' +
    'setting_type VARCHAR(10) NOT NULL, ' +
    'default_value VARCHAR(10) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(setting_master_id)' +
  ')';
QUERIES.CREATE_CHAT_ROOM_SETTINGS =
  'CREATE TABLE IF NOT EXISTS ChatRoomSettings(' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'setting_key VARCHAR(25) NOT NULL, ' +
    'setting_value VARCHAR(10) NOT NULL, ' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(chat_room_id, user_id, setting_key)' +
  ')';
QUERIES.CREATE_CHAT_ROOM_USERS =
  'CREATE TABLE IF NOT EXISTS ChatRoomUsers(' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\')' +
  ')';
QUERIES.CREATE_CHAT_MESSAGES =
  'CREATE TABLE IF NOT EXISTS ChatMessages(' +
    'chat_message_id INTEGER, ' +
    'chat_room_id VARCHAR(255) NOT NULL, ' +
    'user_id VARCHAR(255) NOT NULL, ' +
    'text VARCHAR(2048), ' +
    'type VARCHAR(20) NOT NULL DEFAULT \'text\', ' +
    'read BOOLEAN NOT NULL CHECK (read IN (0, 1)), ' +
    'read_time TIMESTAMP, ' +
    'created TIMESTAMP NOT NULL DEFAULT (STRFTIME(\'%s\', \'now\') || \'000\'), ' +
    'PRIMARY KEY(chat_message_id)' +
  ')';
QUERIES.CREATE_UNIQUE_INDEX_CHAT_MESSAGES = 'CREATE UNIQUE INDEX IF NOT EXISTS cmuidx01 ON ChatMessages(chat_message_id)';
QUERIES.CREATE_COMPLEX_INDEX1_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx01 ON ChatMessages (chat_message_id)';
QUERIES.CREATE_COMPLEX_INDEX2_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx02 ON ChatMessages (user_id)';
QUERIES.CREATE_COMPLEX_INDEX3_CHAT_MESSAGES = 'CREATE INDEX IF NOT EXISTS cmidx03 ON ChatMessages (user_id, text)';

QUERIES.DELETE_CHAT_ROOM_SETTING_MASTER = 'DELETE FROM ChatRoomSettingMaster';
QUERIES.INSERT_CHAT_ROOM_SETTING_MASTER_TRANSLATE_KO =
  'INSERT INTO ChatRoomSettingMaster (setting_key, setting_name, setting_type, default_value) ' +
  'VALUES (\'translate_ko\', \'한국어를 번역\', \'boolean\', 0)';
QUERIES.INSERT_CHAT_ROOM_SETTING_MASTER_SHOW_USER_FACE =
  'INSERT INTO ChatRoomSettingMaster (setting_key, setting_name, setting_type, default_value) ' +
  'VALUES (\'show_user_face\', \'친구사진보기\', \'boolean\', 0)';

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
QUERIES.INSERT_CHAT_ROOM_USER =
  'INSERT INTO ChatRoomUsers (chat_room_id, user_id) VALUES (?, ?);';
QUERIES.INSERT_CHAT_ROOM_SETTINGS =
  'INSERT INTO ChatRoomSettings (' +
    'chat_room_id, setting_key, setting_value, user_id' +
  ') VALUES (?, ?, ?, ?);';

QUERIES.UPDATE_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID = '' +
  'UPDATE ChatRoomSettings SET setting_value = ? ' +
  'WHERE user_id = ? AND chat_room_id = ? AND setting_key = ?';
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
  'SELECT cu.chat_room_id, cu.user_id AS to_user_id, cm.text AS last_text, MAX(cm.created) AS created ' +
  'FROM ChatRoomUsers AS cu, ChatMessages AS cm ' +
  'ON cu.chat_room_id = cm.chat_room_id ' +
  'WHERE cu.chat_room_id in (SELECT chat_room_id FROM ChatRoomUsers WHERE user_id = ?) ' +
  'AND cu.user_id <> ?';
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
  'SELECT cru1.chat_room_id FROM ChatRoomUsers cru1, ChatRoomUsers cru2 ' +
    'ON cru1.chat_room_id = cru2.chat_room_id ' +
  'WHERE cru1.user_id = ? AND cru2.user_id = ?';
QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID = 
  'SELECT chat_room_id FROM ChatRoomUsers WHERE user_id = ? LIMIT 1';
QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID =
  'SELECT chat_room_id, user_id, setting_value FROM ChatRoomSettings ' +
  'WHERE chat_room_id = ? AND user_id = ? AND setting_key = ?';
QUERIES.SELECT_ALL_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID =
  'SELECT c.chat_room_id, c.setting_key, c.setting_value, m.setting_name, m.setting_type ' +
  'FROM ChatRoomSettings c, ChatRoomSettingMaster m ' +
    'ON c.setting_key = m.setting_key ' +
  'WHERE c.user_id = ? AND c.chat_room_id = ?';
QUERIES.SELECT_ALL_CHAT_ROOM_SETTING_MASTER =
  'SELECT setting_key, setting_name, setting_type, default_value FROM ChatRoomSettingMaster';

QUERIES.DELETE_USER_BY_ID = 'DELETE FROM Users WHERE user_id = ?';
QUERIES.DELETE_FRIEND_BY_USER_ID_AND_FRIEND_ID = 'DELETE FROM Friends WHERE user_id = ? AND friend_id = ?';
QUERIES.DELETE_CHAT_ROOM_BY_ID = 'DELETE FROM ChatRooms WHERE chat_room_id = ?';
QUERIES.DELETE_CHAT_MESSAGES_BY_CHAT_ROOM_ID = 'DELETE FROM ChatMessages WHERE char_room_id = ?';
QUERIES.DELETE_CHAT_ROOM_USERS_BY_CHAT_ROOM_ID = 'DELETE FROM ChatRoomUsers WHERE chat_room_id = ?';
QUERIES.DELETE_CHAT_ROOM_USERS_BY_USER_ID = 'DELETE FROM ChatRoomUsers WHERE user_id = ?';

function prepareDatabase() {
  db.serialize(function () {
    debug('Start create tables for app...');
    db.run(QUERIES.CREATE_USERS);
    db.run(QUERIES.CREATE_FRIENDS);
    db.run(QUERIES.CREATE_CHAT_ROOMS);
    db.run(QUERIES.CREATE_CHAT_ROOM_SETTING_MASTER);
    db.run(QUERIES.CREATE_CHAT_ROOM_SETTINGS);
    db.run(QUERIES.CREATE_CHAT_ROOM_USERS);
    db.run(QUERIES.CREATE_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_UNIQUE_INDEX_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_COMPLEX_INDEX1_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_COMPLEX_INDEX2_CHAT_MESSAGES);
    db.run(QUERIES.CREATE_COMPLEX_INDEX3_CHAT_MESSAGES);
    db.run(QUERIES.DELETE_CHAT_ROOM_SETTING_MASTER);
    db.run(QUERIES.INSERT_CHAT_ROOM_SETTING_MASTER_TRANSLATE_KO);
    db.run(QUERIES.INSERT_CHAT_ROOM_SETTING_MASTER_SHOW_USER_FACE);
    debug('Complete create table and initialize default values...');
  });
}

module.exports = {
  db : db,
  QUERIES : QUERIES,
  prepareDatabase : prepareDatabase
};