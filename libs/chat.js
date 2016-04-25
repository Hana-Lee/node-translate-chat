/**
 * @author Hana Lee
 * @since 2016-04-22 17:45
 */
'use strict';

var socketIO = require('socket.io');
var translator = require('./translator');
/**
 * @param {Function} db.parallelize
 */
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

/**
 * @typedef {Object} UserData
 * @type {UserData}
 * @param {String} friend_id
 * @param {String} chat_room_id
 * @param {String[]} chat_room_ids
 * @param {Boolean} show_picture
 * @param {String} to_user_id
 */
var userData = {
  friend_id : null, chat_room_id : null, chat_room_ids : null, show_picture : false, to_user_id : null
};

var chatObj = {
  connect : function (server) {
    var io = socketIO.listen(server, null);
    var numUsers = 0;

    io.on('connection', function (/** @param {Object} socket.broadcast */socket) {
      debug('socket connection');
      var addedUser = false;

      // when the client emits 'new message', this listens and executes
      socket.on('new message', function (/** @type {String} */data) {
        // we tell the client to execute 'new message'
        debug('new message : ', socket.id);
        var koreanReg = /[가-힣]/g;

        if (koreanReg.test(data)) {
          sqlite3.db.get(
            sqlite3.QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID,
            [socket.room, socket.user_id],
            function (err, /** @param {Number} row.translate_ko */row) {
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
                                      user_name : socket.user_name,
                                      message : data + '<br />' + translatedToESResult + '<br />' + translatedToZhCNResult
                                    });
                                    socket.emit('new message', {
                                      user_name : socket.user_name,
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
                } else {
                  debug('no translate', data);
                  sqlite3.db.run(
                    sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                    [socket.room, socket.user_id, data, data, 'ko', 'ko'],
                    function (err) {
                      if (err) {
                        debug('insert chat message error', err, data);
                        throw new Error(err);
                      } else {
                        socket.broadcast.to(socket.room).emit('new message', {
                          user_name : socket.user_name,
                          message : data
                        });
                      }
                    }
                  );
                }
              }
            }
          );
        } else {
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
                            user_name : socket.user_name,
                            message : translatedResult + ' [ ' + data + ' ]'
                          });
                          socket.emit('new message', {
                            user_name : socket.user_name,
                            message : '번역 : [' + translatedResult + ']'
                          });
                        }
                      }
                    );
                  }
                });
              }
            });
        }
      });

      socket.on('createFriend', function (/** @param {String} userData.friend_id */userData) {
        sqlite3.db.run(
          sqlite3.QUERIES.INSERT_FRIEND,
          [userData.user_id, userData.friend_id],
          function (err) {
            if (err) {
              debug('create friend error', err);
              throw new Error(err);
            } else {
              socket.emit('createdFriend', userData);
            }
          }
        );
      });

      socket.on('retrieveAlreadyRegisteredUserByDeviceId', function (userData) {
        sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_BY_DEVICE_ID, [userData.device_id], function (err, row) {
          if (err) {
            debug('retrieveAlreadyRegisteredUserByDeviceId error', err);
            throw new Error(err);
          } else {
            socket.emit('retrievedAlreadyRegisteredUserByDeviceId', row);
          }
        });
      });

      socket.on('retrieveAlreadyRegisteredUserByUserName', function (userData) {
        sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_BY_DEVICE_ID, [userData.user_name], function (err, row) {
          if (err) {
            debug('retrieveAlreadyRegisteredUserByUserName error', err);
            throw new Error(err);
          } else {
            socket.emit('retrievedAlreadyRegisteredUserByUserName', row);
          }
        });
      });

      socket.on('retrieveAllFriends', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_FRIENDS_BY_USER_ID,
          [userData.user_id],
          function (err, rows) {
            if (err) {
              debug('retrieve all friend error', err);
              throw new Error(err);
            } else {
              socket.emit('retrievedAllFriends', rows);
            }
          }
        );
      });

      socket.on('retrieveAllUsers', function () {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_USERS,
          function (err, rows) {
            if (err) {
              debug('retrieve all users error', err);
              throw new Error(err);
            } else {
              socket.emit('retrievedAllUsers', rows);
            }
          }
        );
      });

      socket.on('retrieveAllChatRoomIds', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_IDS_BY_USER_ID,
          [userData.user_id],
          function (err, rows) {
            if (err) {
              debug('retrieve all chat rooms error', err);
              throw new Error(err);
            } else {
              socket.emit('retrievedAllChatRoomIds', rows);
            }
          }
        );
      });

      socket.on('retrieveAllChatRoomLastMessages', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_LAST_MESSAGE_BY_CHAT_ROOM_ID_AND_USER_ID,
          {0 : userData.user_id, $room_ids : '\'' + userData.chat_room_ids.join('\',\'') + '\''},
          function (err, rows) {
            if (err) {
              debug('select last message error', err);
              throw new Error(err);
            } else {
              socket.emit('retrievedAllChatRoomLastMessages', rows);
            }
          }
        );
      });

      socket.on('updateChatRoomSettings', function (userData) {
        if (userData.translate_ko) {
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_CHAT_ROOM_SETTINGS_SET_TRANSLATE_KO_BY_CHAT_ROOM_ID_AND_USER_ID,
            [userData.translate_ko, userData.chat_room_id, userData.user_id],
            function (err) {
              if (err) {
                debug('update chat room settings error', err);
                throw new Error(err);
              } else {
                socket.emit('updatedChatRoomSettingsTranslateKo', userData);
              }
            }
          );
        }

        if (userData.show_picture) {
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_CHAT_ROOM_SETTINGS_SET_SHOW_PICTURE_BY_CHAT_ROOM_ID_AND_USER_ID,
            [userData.show_picture, userData.chat_room_id, userData.user_id],
            function (err) {
              if (err) {
                debug('update chat room settings error', err);
                throw new Error(err);
              } else {
                socket.emit('updatedChatRoomSettingsShowPicture', userData);
              }
            }
          );
        }
      });

      socket.on('createUser', function (userData) {
        var user_id = createUID('user_id');
        userData.user_id = user_id;
        socket.user_id = user_id;

        sqlite3.db.run(
          sqlite3.QUERIES.INSERT_USER,
          [user_id, userData.user_name, userData.device_id],
          function (err) {
            if (err) {
              debug('insert user error', err, userData);
              throw new Error(err);
            } else {
              socket.emit('createdUser', userData);
            }
          }
        );
      });

      socket.on('createChatRoom', function (userData) {
        var chat_room_id = createUID('chat_room_id');
        dummyChatRoomId = chat_room_id;
        userData.chat_room_id = chat_room_id;

        sqlite3.db.run(sqlite3.QUERIES.INSERT_CHAT_ROOM, [chat_room_id], function (err) {
          if (err) {
            debug('insert chat room error', err);
            throw new Error(err);
          } else {
            socket.emit('createdChatRoom', userData);
          }
        });
      });

      socket.on('retrieveAllChatRooms', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_CHAT_ROOMS,
          function (err, rows) {
            if (err) {
              debug('select all chat rooms error', err, userData);
            } else {
              socket.emit('retrievedAllChatRooms', rows);
            }
          }
        );
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
            sqlite3.QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID,
            [userData.chat_room_id, userData.user_id],
            function (err, row) {
              if (err) {
                debug('select chat room settings error', err);
                throw new Error(err);
              } else if (!row) {
                sqlite3.db.run(
                  sqlite3.QUERIES.INSERT_CHAT_ROOM_SETTINGS,
                  [userData.chat_room_id, userData.user_id, 0, 0],
                  function (err) {
                    if (err) {
                      debug('insert chat room settings error', err);
                      throw new Error(err);
                    }
                  }
                );
              }
            }
          );

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

        // we store the user_name in the socket session for this client
        socket.user_name = userData.user_name;
        ++numUsers;
        addedUser = true;
        socket.emit('login', {
          numUsers : numUsers
        });
        // echo globally (all clients) that a person has connected
        io.in(userData.chat_room_id).emit('user joined', {
          user_name : socket.user_name,
          numUsers : numUsers
        });
      });

      // when the client emits 'typing', we broadcast it to others
      socket.on('typing', function () {
        socket.broadcast.emit('typing', {
          user_name : socket.user_name
        });
      });

      // when the client emits 'stop typing', we broadcast it to others
      socket.on('stop typing', function () {
        socket.broadcast.emit('stop typing', {
          user_name : socket.user_name
        });
      });

      // when the user disconnects.. perform this
      socket.on('disconnect', function () {
        if (addedUser) {
          --numUsers;

          // echo globally that this client has left
          socket.broadcast.emit('user left', {
            user_name : socket.user_name,
            num_users : numUsers
          });
        }
      });
    });
  }
};

module.exports = chatObj;