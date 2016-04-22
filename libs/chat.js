/**
 * @author Hana Lee
 * @since 2016-04-22 17:45
 */
'use strict';

var socketIO = require('socket.io');
var translator = require('./translator');
var sqlite3 = require('./sqlite3');
var debug = require('debug')('node-translate-chat:chat');
var md5 = require('md5');

var dummyChatRoomId = undefined;
var _seed = undefined;

function createUID(value) {
  if (!_seed) {
    _seed = (new Date()).valueOf();
  }
  _seed++;

  return md5(_seed + value);
}

var chatObj = {
  connect : function (server) {
    var io = socketIO.listen(server, null);
    var numUsers = 0;

    io.on('connection', function (socket) {
      debug('socket connection');
      var addedUser = false;

      // when the client emits 'new message', this listens and executes
      socket.on('new message', function (/** @type {String} */data) {
        // we tell the client to execute 'new message'
        debug('new message : ', socket.id);
        var koreanReg = /[가-힣]/g;
        // var chineseReg = /[\u4e00-\u9fa5]*/g;
        var translateAvailable = true;

        if (koreanReg.test(data)) {
          translateAvailable = false;

          sqlite3.db.get(
            sqlite3.QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID,
            [socket.room, socket.user_id],
            function (err, row) {
              if (err) {
                debug('select chat room settings error', err);
                throw new Error(err);
              } else {
                if (row && row.translate_ko === 1) {
                  translator.translate({
                    text : data, from : 'ko', to : 'es'
                  }, function (error, translatedToESResult) {
                    if (error) {
                      debug('Translate error', error);
                    } else {
                      debug('Translated es result : ', translatedToESResult);
                      sqlite3.db.run(
                        sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                        [socket.room, socket.user_id, data, translatedToESResult, 'ko', 'es'],
                        function (err) {
                          if (err) {
                            debug('insert chat message error', err, data);
                            throw new Error(err);
                          } else {
                            translator.translate({
                              text : data, from : 'ko', to : 'zh-CHS'
                            }, function (error, translatedToZhCNResult) {
                              sqlite3.db.run(
                                sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                                [socket.room, socket.user_id, data, translatedToZhCNResult, 'ko', 'zh-CHS'],
                                function (err) {
                                if (err) {
                                  debug('insert chat message error', err, data);
                                  throw new Error(err);
                                } else {
                                  socket.broadcast.to(socket.room).emit('new message', {
                                    username : socket.username,
                                    message : data + '<br />' + translatedToESResult + '<br />' + translatedToZhCNResult
                                  });
                                  socket.emit('new message', {
                                    username : socket.username,
                                    message : '스페인어 : [' + translatedToESResult + ']<br />중국어 : [' + translatedToZhCNResult + ']'
                                  });
                                }
                              });
                            });
                          }
                        }
                      );
                    }
                  });
                }
              }
            }
          );
        }

        if (translateAvailable) {
          translator.detect({
              text : data
            },
            /**
             * @param {Object} error
             * @param {String} detectedResult
             */
            function (error, detectedResult) {
              if (error) {
                debug('Language detect error', error);
              } else {
                debug('Translator detected language : ', detectedResult);

                translator.translate({
                  text : data, from : detectedResult, to : 'ko'
                }, function (error, translatedResult) {
                  if (error) {
                    debug('Translate error', error);
                  } else {
                    debug('Translated result : ', translatedResult);
                    sqlite3.db.run(
                      sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                      [socket.room, socket.user_id, data, translatedResult, detectedResult, 'ko'],
                      function (err) {
                        if (err) {
                          debug('insert chat message error', err, data);
                          throw new Error(err);
                        } else {
                          socket.broadcast.to(socket.room).emit('new message', {
                            username : socket.username,
                            message : translatedResult + ' [ ' + data + ' ]'
                          });
                          socket.emit('new message', {
                            username : socket.username,
                            message : '번역 : [' + translatedResult + ']'
                          });
                        }
                      }
                    );
                  }
                });
              }
            });
        } else {
        //   debug('no translate', data);
        //   sqlite3.db.run(
        //     sqlite3.QUERIES.INSERT_CHAT_MESSGE, 
        //     [socket.room, socket.user_id, data, data, 'ko', 'ko'],
        //     function (err) {
        //       if (err) {
        //         debug('insert chat message error', err, data);
        //         throw new Error(err);
        //       } else {
        //         io.in(socket.room).emit('new message', {
        //           username : socket.username,
        //           message : data
        //         });
        //       }
        //     }
        //   );
        }
      });

      socket.on('createUser', function (userData) {
        var user_id = createUID('user_id');
        userData.user_id = user_id;
        socket.user_id = user_id;
        sqlite3.db.run(sqlite3.QUERIES.INSERT_USER, [user_id, userData.username], function (err) {
          if (err) {
            debug('insert user error', err, userData);
            throw new Error(err);
          } else {
            socket.emit('createdUser', userData);
          }
        });
      });

      socket.on('createChatRoom', function (userData) {
        var chat_room_id = createUID('chat_room_id');
        dummyChatRoomId = chat_room_id;
        userData.chat_room_id = chat_room_id;
        sqlite3.db.serialize();
        sqlite3.db.run(sqlite3.QUERIES.INSERT_CHAT_ROOM, [chat_room_id], function (err) {
          if (err) {
            debug('insert chat room error', err);
            throw new Error(err);
          } else {
            socket.emit('createdChatRoom', userData);
          }
        });
      });

      socket.on('retrieveChatRooms', function (userData) {
        sqlite3.db.all(sqlite3.QUERIES.SELECT_ALL_CHAT_ROOMS, function (err, rows) {
          if (err) {
            debug('select all chat rooms error', err, userData);
          } else {
            socket.emit('retrievedChatRooms', rows);
          }
        });
      });

      socket.on('retrieveChatRoomIdByUserAndToUserId', function (userData) {
        sqlite3.db.get(
          sqlite3.QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID_AND_TO_USER_ID,
          [userData.user_id, userData.to_user_id],
          function (err, row) {
            if (err) {
              debug('select chat room id by user id error', err, userData);
              throw new Error(err);
            } else {
              socket.emit('retrievedChatRoomIdByUserIdAndToUserId', row);
            }
          }
        );
      });

      // when the client emits 'add user', this listens and executes
      socket.on('joinChatRoom', function (userData) {
        if (addedUser) {
          return;
        }

        if (!userData.chat_room_id) {
          userData.chat_room_id = dummyChatRoomId
        }

        sqlite3.db.serialize(function () {
          sqlite3.db.get(
            sqlite3.QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID,
            [userData.user_id],
            function (err, row) {
              if (err) {
                debug('join chat room - select chat room id by user id error', err, userData);
                throw new Error(err);
              } else {
                if (!row) {
                  sqlite3.db.run(sqlite3.QUERIES.INSERT_CHAT_ROOM_USER, [userData.chat_room_id, userData.user_id]);
                  debug('insert "user" to chat room users table', userData);
                }
              }
            }
          );

          if (userData.to_user_id) {
            sqlite3.db.get(
              sqlite3.QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID,
              [userData.to_user_id],
              function (err, row) {
                if (err) {
                  debug('join chat room - select chat room id by to user id error', err, userData);
                  throw new Error(err);
                } else {
                  if (!row) {
                    sqlite3.db.run(sqlite3.QUERIES.INSERT_CHAT_ROOM_USER, [userData.chat_room_id, userData.to_user_id]);
                    debug('insert "to user" to chat room users table', userData);
                  }
                }
              }
            );
          }
        });

        socket.room = userData.chat_room_id;
        socket.join(userData.chat_room_id);

        debug('join chat room : ', userData.chat_room_id);

        debug('add user ', userData);

        // we store the username in the socket session for this client
        socket.username = userData.username;
        ++numUsers;
        addedUser = true;
        socket.emit('login', {
          numUsers : numUsers
        });
        // echo globally (all clients) that a person has connected
        io.in(userData.chat_room_id).emit('user joined', {
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
  }
};

module.exports = chatObj;