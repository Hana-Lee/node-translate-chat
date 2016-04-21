/*jslint
 browser  : true,
 continue : true,
 devel    : true,
 indent   : 2,
 maxerr   : 50,
 nomen    : true,
 plusplus : true,
 regexp   : true,
 vars     : true,
 white    : true,
 todo     : true,
 node     : true
 */
'use strict';

var https = require('https');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var fs = require('fs');
var Sqlite3 = require('sqlite3').verbose();
var db = new Sqlite3.Database('translate-chat.db');

var CREATE_USERS_QUERY =
  'CREATE TABLE if not exists Users(' +
    'user_id TEXT PRIMARY KEY NOT NULL, ' +
    'name TEXT NOT NULL, ' +
    'created TEXT NOT NULL' +
  ')';
var CREATE_CHAT_ROOMS_QUERY =
  'CREATE TABLE if not exists ChatRooms(' +
    'chat_room_id TEXT PRIMARY KEY NOT NULL, ' +
    'created TEXT NOT NULL' +
  ')';
var CREATE_CHAT_ROOM_SETTINGS_QUERY =
  'CREATE TABLE if not exists ChatRoomSettings(' +
    'chat_room_id TEXT NOT NULL, ' +
    'user_id TEXT NOT NULL, ' +
    'translate TEXT NOT NULL, ' +
    'show_picture TEXT NOT NULL' +
  ')';
var CREATE_CHAT_ROOM_USERS_QUERY =
  'CREATE TABLE if not exists ChatRoomUsers(' +
    'chat_room_id TEXT NOT NULL, ' +
    'user_id TEXT NOT NULL' +
  ')';
var CREATE_CHAT_MESSAGES_QUERY =
  'CREATE TABLE if not exists ChatMessages(' +
    'chat_message_id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'chat_room_id TEXT NOT NULL, ' +
    'user_id TEXT NOT NULL, ' +
    'o_message TEXT, ' +
    't_message TEXT, ' +
    'from_lang_code TEXT, ' +
    'to_lang_code TEXT, ' +
    'created TEXT NOT NULL' +
  ')';

var INSERT_CHAT_MESSGE_QUERY = 'INSERT INTO ChatMessages VALUES (?, ?, ?, ?, ?, ?, ?)';
var INSERT_USER_QUERY = 'INSERT INTO Users VALUES (?, ?, ?)';
var INSERT_CHAT_ROOM_QUERY = 'INSERT INTO ChatRooms VALUES (?, ?)';
var INSERT_CHAT_ROOM_USER_QUERY = 'INSERT INTO ChatRoomUsers VALUES (?, ?)';

var SELECT_ALL_USERS_QUERY = 'SELECT user_id, name, created FROM Users ORDER BY name DESC';
var SELECT_ALL_CHAT_ROOMS_QUERY = 'SELECT chat_room_id, created FROM ChatRooms ORDER BY created DESC';
var SELECT_ALL_CHAT_ROOM_USERS_QUERY = 'SELECT chat_room_id, user_id FROM ChatRoomUsers WHERE chat_room_id = ?';
var SELECT_LAST_MESSAGE_BY_CHAT_ROOM_ID_QUERY =
  'SELECT message FROM ChatMessages ' +
  'WHERE chat_room_id = ? AND user_id = ? ORDER BY created DESC LIMIT 1';
var SELECT_ALL_CHAT_MESSAGES_QUERY =
  'SELECT chat_room_id, user_id, o_message, t_message, from_code, to_code, created FROM ChatMessages ' +
  'WHERE chat_room_id = ? ORDER BY created DESC';

var DELETE_USER_BY_ID_QUERY = 'DELETE FROM Users WHERE user_id = ?';
var DELETE_CHAT_ROOM_BY_ID_QUERY = 'DELETE FROM ChatRooms WHERE chat_room_id = ?';
var DELETE_CHAT_MESSAGES_BY_CHAT_ROOM_ID_QUERY = 'DELETE FROM ChatMessages WHERE char_room_id = ?';
var DELETE_CHAT_ROOM_USERS_BY_CHAT_ROOM_ID_QUERY = 'DELETE FROM ChatRoomUsers WHERE chat_room_id = ?';
var DELETE_CHAT_ROOM_USERS_BY_USER_ID_QUERY = 'DELETE FROM ChatRoomUsers WHERE user_id = ?';

var port = process.env.PORT || 3000;
// var Translator = require('naver-translator');
var MsTranslator = require('mstranslator');

var ZH_CH = 'zh-CN';
var KO_KR = 'ko';
// var CLIENT_ID = process.env.NAVER_CLIENT_ID;
// var CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
// var SEC_CLIENT_ID = process.env.NAVER_CLIENT_ID_2;
// var SEC_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET_2;
var MS_CLIENT_ID = process.env.MS_CLIENT_ID;
var MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

process.on('SIGINT', function () {
  server.close(function () {
    console.log('node server is shut down...');
    db.close();
  });
});

function prepareDatabase() {
  db.serialize(function () {
    db.run(CREATE_USERS_QUERY);
    db.run(CREATE_CHAT_ROOMS_QUERY);
    db.run(CREATE_CHAT_ROOM_SETTINGS_QUERY);
    db.run(CREATE_CHAT_ROOM_USERS_QUERY);
    db.run(CREATE_CHAT_MESSAGES_QUERY);
  });
}

server.listen(port, function () {
  prepareDatabase();
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));

// Chatroom

var numUsers = 0;

io.on('connection', function (socket) {
  var addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (/** @type {String} */data) {
    // we tell the client to execute 'new message'

    var koreanReg = /[가-힣]/g;
    // var chineseReg = /[\u4e00-\u9fa5]*/g;
    // var source = KO_KR;
    // var target = ZH_CH;
    var translateAvailable = true;

    if (koreanReg.test(data)) {
      // source = KO_KR;
      // target = ZH_CH;
      translateAvailable = false;
    }

    if (translateAvailable) {
      console.log('Use MS Translator');
      var translator = new MsTranslator({
        client_id : MS_CLIENT_ID,
        client_secret : MS_CLIENT_SECRET
      }, true);
      translator.detect({
          text : data
        },
        /**
         * @param {Object} error
         * @param {String} detectedResult
         */
        function (error, detectedResult) {
          if (error) {
            console.log('Language detect error', error);
          } else {
            console.log('Translator detected language : ', detectedResult);

            translator.translate({
              text : data, from : detectedResult, to : KO_KR
            }, function (error, translatedResult) {
              if (error) {
                console.log('Translate error', error);
              } else {
                console.log('Translated result : ', translatedResult);
                socket.broadcast.emit('new message', {
                  username : socket.username,
                  message : translatedResult + ' [ ' + data + ' ]'
                });
                socket.emit('new message', {
                  username : socket.username,
                  message : '번역 : [' + translatedResult + ']'
                });
              }
            });
          }
        });
    } else {
      console.log('no translate', data);
      socket.broadcast.emit('new message', {
        username : socket.username,
        message : data
      });
    }
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (userData) {
    if (addedUser) {
      return;
    }

    // we store the username in the socket session for this client
    socket.username = userData.username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers : numUsers
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username : socket.username,
      numUsers : numUsers
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', function () {
    socket.broadcast.emit('typing', {
      username : socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', function () {
    socket.broadcast.emit('stop typing', {
      username : socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function () {
    if (addedUser) {
      --numUsers;

      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username : socket.username,
        numUsers : numUsers
      });
    }
  });
});
