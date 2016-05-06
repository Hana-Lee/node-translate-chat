/**
 * @author Hana Lee
 * @since 2016-04-22 17:45
 */
'use strict';

var socketIO = require('socket.io');
var translator = require('./translator');
var pushNotification = require('./push-notification');
var authorizationToken = process.env.IONIC_PUSH_AUTORIZATION_TOKEN;

/**
 * @param {Function} db.parallelize
 */
var sqlite3 = require('./sqlite3');
var debug = require('debug')('node-translate-chat:chat');
var md5 = require('md5');

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
 * @param {String} user_face
 * @param {String} device_token
 * @param {Boolean} show_picture
 * @param {String} to_user_id
 * @param {String} device_id
 * @param {String} connection_time
 * @param {Array} friends
 * @param {String} device_type
 * @param {String} device_version
 * @param {Object} user
 * @param {Object} friend
 * @param {Boolean} online
 */
var userData = {
  friend_id : null, chat_room_id : null, chat_room_ids : null, user_face : null, device_token : null,
  show_picture : false, to_user_id : null, device_id : null, connection_time : null, friends : null,
  device_type : null, device_version : null, user : null, friend : {socket_id : null, user_id : null},
  online : false
};

var chatObj = {
  connect : function (server) {
    var io = socketIO.listen(server, null);
    var numUsers = 0;

    io.on('connection', function (/** @param {Object} socket.broadcast */socket) {
      debug('socket connection : ', socket.id);

      var userId = socket.handshake.query.user_id;
      debug('connection user id : ', userId);
      if (userId) {
        var socketId = socket.id;
        sqlite3.db.serialize(function () {
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_USERS_SET_SOCKET_ID_BY_USER_ID,
            [socketId, userId],
            function (err) {
              if (err) {
                debug('update users set socket error : ', err);
              }
            }
          );
        });
      }

      socket.on('updateSocketId', function (userData) {
        console.log('update socket id', userData);
        var socketId = socket.id;
        sqlite3.db.serialize(function () {
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_USERS_SET_SOCKET_ID_BY_USER_ID,
            [socketId, userData.user_id],
            function (err) {
              if (err) {
                debug('update users set socket id error : ', err);
                socket.emit('updatedSocketId', {error : err, process : 'update socket id'});
              }
            }
          );
        });
      });

      socket.on('updateDeviceToken', function (userData) {
        sqlite3.db.serialize(function () {
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_USERS_SET_DEVICE_TOKEN_BY_USER_ID,
            [userData.user.device_token, userData.user.user_id],
            function (err) {
              if (err) {
                debug('update users set device token error : ', err);
                socket.emit('updatedDeviceToken', {error : err, process : 'update device token'});
              }
            }
          );
        });
      });

      // when the client emits 'new_message', this listens and executes
      socket.on('new_message', function (/** @type {String} */userData) {
          // we tell the client to execute 'new_message'
          debug('new_message : ', socket.id);
          var pushTokens = [];
          var pushAvailable = false;
          userData.friends.forEach(function (friend) {
            if (friend.device_token) {
              pushAvailable = true;
            }
            pushTokens.push(friend.device_token);
          });
          var pushOptions = {
            authorization_token : authorizationToken,
            tokens : pushTokens,
            title : '사랑의대화',
            text : '',
            android : {
              title : '사랑의대화',
              text : '',
              payload : {
                chat_room_id : socket.room_id
              }
            },
            ios : {
              title : '사랑의대화',
              text : '',
              payload : {
                chat_room_id : socket.room_id
              }
            }
          };
          var concatText;
          var imageType = userData.type.toLowerCase() === 'image';
          var koreanReg = /[ㄱ-ㅎ가-힣]/g; // ㅎㅎㅎ, ㅋㅋㅋ 에 대응
          var emojiReg = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
          var replacedEmoji = userData.text.replace(emojiReg, '').replace(/\s/g, '');
          var onlyEmoji = false;
          if (replacedEmoji.length === 0) {
            onlyEmoji = true;
          }
          debug('emoji check : ', emojiReg.test(userData.text));
          if (imageType || onlyEmoji || koreanReg.test(userData.text)) {
            sqlite3.db.get(
              sqlite3.QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID,
              [socket.room_id, userData.friends[0].user_id],
              function (err, /** @param {Number} row.translate_ko */row) {
                if (err) {
                  debug('select chat room settings error : ', err);
                  socket.emit('new_message', {error : err, process : 'select chat room settings'});
                } else {
                  if (!imageType && !onlyEmoji && row && row.translate_ko === 1) {
                    translator.translate({
                      text : userData.text, from : 'ko', to : 'es'
                    }, function (err, translatedToESResult) {
                      if (err) {
                        debug('ko to es translation error : ', error);
                        socket.emit('new_message', {error : err, process : 'ko to es translation'})
                      } else {
                        translator.translate({
                          text : userData.text, from : 'ko', to : 'zh-CHS'
                        }, function (err, translatedToZhCNResult) {
                          if (err) {
                            debug('ko to zh-CHS translation error : ', err, userData.text);
                            socket.emit('new_message', {error : err, process : 'ko to zh-CHS translation'});
                          } else {
                            concatText = userData.text + '<br />es:[' +
                              translatedToESResult + ']<br />ch:[' +
                              translatedToZhCNResult + ']';
                            sqlite3.db.run(
                              sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                              [socket.room_id, userData.user_id, concatText, userData.type],
                              function (err) {
                                if (err) {
                                  debug('insert ko to zh-CHS translated chat message error : ', err, userData.text);
                                  socket.emit('new_message', {
                                    error : err,
                                    process : 'insert ko to zh-CHS translated chat message'
                                  });
                                } else {
                                  sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_ONLINE_BY_USER_ID,
                                    [userData.friends[0].user_id], function (err, row) {
                                      if (err) {
                                        debug('select user online state by user id error : ', err);
                                      } else if (row && row.online === 0) {
                                        pushOptions.text = userData.user_name + ':' + userData.text;
                                        pushOptions.android.text = userData.user_name + ':' + userData.text;
                                        pushOptions.ios.text = userData.user_name + ':' + userData.text;

                                        if (pushAvailable) {
                                          pushNotification(pushOptions);
                                        }
                                      }
                                    });

                                  socket.broadcast.to(socket.room_id).emit('new_message', {
                                    result : {
                                      user_name : socket.user_name,
                                      text : concatText,
                                      type : userData.type
                                    }
                                  });
                                  socket.emit('new_message', {
                                    result : {
                                      user_name : socket.user_name,
                                      text : concatText,
                                      type : userData.type
                                    }
                                  });
                                }
                              });
                          }
                        });
                      }
                    });
                  } else {
                    debug('no translate', userData.text);
                    concatText = userData.text;
                    sqlite3.db.run(
                      sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                      [socket.room_id, userData.user_id, userData.text, userData.type],
                      function (err) {
                        if (err) {
                          debug('insert chat message error : ', err, userData.text);
                          socket.emit('new_message', {
                            error : err,
                            process : 'insert chat message'
                          });
                        } else {
                          sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_ONLINE_BY_USER_ID,
                            [userData.friends[0].user_id], function (err, row) {
                              if (err) {
                                debug('select user online state by user id error : ', err);
                              } else if (row && row.online === 0) {
                                pushOptions.text = userData.user_name + ':' + userData.text;
                                pushOptions.android.text = userData.user_name + ':' + userData.text;
                                pushOptions.ios.text = userData.user_name + ':' + userData.text;

                                if (imageType) {
                                  pushOptions.text = '< 사진 >';
                                  pushOptions.android.text = '< 사진 >';
                                  pushOptions.ios.text = '< 사진 >';
                                }

                                if (pushAvailable) {
                                  pushNotification(pushOptions);
                                }
                              }
                            });

                          socket.broadcast.to(socket.room_id).emit('new_message', {
                            result : {
                              user_name : socket.user_name,
                              text : concatText,
                              type : userData.type
                            }
                          });
                          socket.emit('new_message', {
                            result : {
                              user_name : socket.user_name,
                              text : concatText,
                              type : userData.type
                            }
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
                text : userData.text
              },
              /**
               * @param {Object} err
               * @param {String} detectedResult
               */
              function (err, detectedResult) {
                if (err) {
                  debug('Source text language detection error : ', err, userData.text);
                  socket.emit('new_message', {error : err, process : 'Source text language detection'});
                } else {
                  debug('Translator detected language : ', detectedResult);

                  translator.translate({
                    text : userData.text, from : detectedResult, to : 'ko'
                  }, function (err, translatedResult) {
                    if (err) {
                      debug(detectedResult + ' to ko translation error : ', err, userData.text);
                      socket.emit('new_message', {error : err, process : detectedResult + ' to ko translation'});
                    } else {
                      debug('Translated ' + detectedResult + ' to ko result : ', translatedResult);
                      concatText = userData.text + '<br />ko:[' + translatedResult + ']';
                      sqlite3.db.run(
                        sqlite3.QUERIES.INSERT_CHAT_MESSGE,
                        [socket.room_id, userData.user_id, concatText, userData.type],
                        function (err) {
                          if (err) {
                            debug('insert ' + detectedResult +
                              ' to ko translated chat message error : ', err, userData.text);
                            socket.emit('new_message', {error : err, process : 'insert translated chat message'});
                          } else {
                            sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_ONLINE_BY_USER_ID,
                              [userData.friends[0].user_id], function (err, row) {
                                if (err) {
                                  debug('select user online state by user id error : ', err);
                                } else if (row && row.online === 0) {
                                  pushOptions.text = userData.user_name + ':' + userData.text;
                                  pushOptions.android.text = userData.user_name + ':' + userData.text;
                                  pushOptions.ios.text = userData.user_name + ':' + userData.text;

                                  if (pushAvailable) {
                                    pushNotification(pushOptions);
                                  }
                                }
                              });

                            socket.broadcast.to(socket.room_id).emit('new_message', {
                              result : {
                                user_name : socket.user_name,
                                text : concatText,
                                type : userData.type
                              }
                            });
                            socket.emit('new_message', {
                              result : {
                                user_name : socket.user_name,
                                text : concatText,
                                type : userData.type
                              }
                            });
                          }
                        }
                      );
                    }
                  });
                }
              });
          }
        }
      );

      socket.on('updateUserOnlineState', function (userData) {
        sqlite3.db.serialize(function () {
          var currentTimeStamp = new Date().getTime();
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_USERS_SET_CONNECTION_TIME_BY_USER_ID,
            [currentTimeStamp, userData.user_id],
            function (err) {
              if (err) {
                debug('update users set connection time error : ', err);
              }
            }
          );
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_USERS_SET_ONLINE_BY_USER_ID,
            [userData.online, userData.user_id],
            function (err) {
              if (err) {
                debug('update user online state error : ', err);
                socket.emit('updatedUserOnlineState', {error : err, process : 'update user online state'});
              } else {
                socket.emit('updatedUserOnlineState', {result : 'OK'});
              }
            }
          );
        });
      });

      /**
       * @prop {Number} messageData.read Is Message Read?
       * @prop {String} messageData.read_time Read time stamp
       */
      socket.on('updateChatMessage', function (messageData) {
        sqlite3.db.run(
          sqlite3.QUERIES.UPDATE_CHAT_MESSAGE_BY_CHAT_MESSAG_ID,
          [messageData.read, messageData.read_time],
          function (err) {
            if (err) {
              debug('chat message update error : ', err);
              socket.emit('updatedChatMessage', {error : err, process : 'chat message update'});
            } else {
              socket.emit('updatedChatMessage', {result : 'OK'});
            }
          }
        );
      });

      socket.on('createFriend', function (userData) {
        debug('create friend', userData);
        sqlite3.db.serialize(function () {
          var hasError = false;
          sqlite3.db.get(
            sqlite3.QUERIES.SELECT_FRIEND_BY_USER_ID_AND_FRIEND_ID,
            [userData.user.user_id, userData.friend.user_id],
            function (err, row) {
              if (err) {
                debug('select friend by user id and friend id error : ', err);
                socket.emit('createdFriend', {error : err, process : 'select friend by user id and friend id'});
                hasError = true;
              } else {
                if (row) {
                  socket.emit('createdFriend', {result : 'Already exist friend'});
                  hasError = true;
                }
              }
            }
          );
          if (!hasError) {
            sqlite3.db.run(
              sqlite3.QUERIES.INSERT_FRIEND,
              [userData.user.user_id, userData.friend.user_id],
              function (err) {
                if (err) {
                  debug('create friend error : ', err);
                  socket.emit('createdFriend', {error : err, process : 'create friend'});
                  hasError = true;
                }
              }
            );
          }
          if (!hasError) {
            // io.sockets.to(userData.friend.socket_id).emit('addedFriend', {result : userData.user});
            socket.broadcast.to(userData.friend.socket_id).emit('addedFriend', {result : userData.user});
            socket.emit('createdFriend', {result : 'OK'})
          }
        });
      });

      socket.on('retrieveToUserIdByChatRoomIdAndUserId', function (userData) {
        sqlite3.db.get(
          sqlite3.QUERIES.SELECT_TO_USER_ID_BY_CHAT_ROOM_ID_AND_USER_ID,
          [userData.chat_room_id, userData.user_id],
          function (err, row) {
            if (err) {
              debug('select to user id by chat room id and user id error : ', err);
              socket.emit('retrievedToUserIdByChatRoomIdAndUserId', {
                error : err,
                process : 'select to user id by chat room id and user id'
              });
            } else {
              socket.emit('retrievedToUserIdByChatRoomIdAndUserId', {result : row});
            }
          }
        );
      });

      socket.on('retrieveUserByUserId', function (userData) {
        sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_BY_USER_ID, [userData.user_id], function (err, row) {
          if (err) {
            debug('select user by user id error : ', err);
            socket.emit('retrievedUserByUserId', {error : err, process : 'select user by user id'});
          } else {
            socket.emit('retrievedUserByUserId', {result : row});
          }
        });
      });

      socket.on('retrieveUserByUserName', function (userData) {
        sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_BY_USER_NAME, [userData.user_name], function (err, row) {
          if (err) {
            debug('select user by user name error : ', err);
            socket.emit('retrievedUserByUserName', {error : err, process : 'select user by user name'});
          } else {
            socket.emit('retrievedUserByUserName', {result : row});
          }
        });
      });

      socket.on('retrieveAlreadyRegisteredUserByDeviceId', function (userData) {
        sqlite3.db.get(
          sqlite3.QUERIES.SELECT_USER_BY_DEVICE_ID,
          [userData.device_id],
          function (err, row) {
            if (err) {
              debug('retrieveAlreadyRegisteredUserByDeviceId error : ', err);
              socket.emit('retrievedAlreadyRegisteredUserByDeviceId', {
                error : err,
                process : 'retrieveAlreadyRegisteredUserByDeviceId'
              });
            } else {
              socket.emit('retrievedAlreadyRegisteredUserByDeviceId', {result : row});
            }
          }
        );
      });

      socket.on('retrieveAllFriends', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_FRIENDS_BY_USER_ID,
          [userData.user_id],
          function (err, rows) {
            if (err) {
              debug('retrieve all friend error : ', err);
              socket.emit('retrievedAllFriends', {error : err, process : 'retrieveAllFriends'});
            } else {
              socket.emit('retrievedAllFriends', {result : rows});
            }
          }
        );
      });

      socket.on('retrieveAllUsers', function () {
        debug('retrieve all users', socket.id);
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_USERS,
          function (err, rows) {
            if (err) {
              debug('retrieve all users error : ', err);
              socket.emit('retrievedAllUsers', {error : err, process : 'retrieveAllUsers'});
            } else {
              debug('retrieved all users', rows);
              socket.emit('retrievedAllUsers', {result : rows});
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
              debug('select last message error : ', err);
              socket.emit('retrievedAllChatRoomLastMessages', {
                error : err,
                process : 'retrieveAllChatRoomLastMessages'
              });
            } else {
              socket.emit('retrievedAllChatRoomLastMessages', {result : rows});
            }
          }
        );
      });

      socket.on('retrieveAllChatMessagesByChatRoomId', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_CHAT_MESSAGES_BY_CHAT_ROOM_ID,
          [userData.chat_room_id],
          function (err, rows) {
            if (err) {
              debug('select all chat messages by chat room id error : ', err);
              socket.emit('retrieveAllChatMessagesByChatRoomId', {
                error : err,
                process : 'select all chat messages by chat room id'
              });
            } else {
              socket.emit('retrievedAllChatMessagesByChatRoomId', {result : rows});
            }
          }
        );
      });

      socket.on('retrieveChatRoomSettingsList', function (userData) {
        sqlite3.db.get(
          sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID,
          [userData.user_id, userData.chat_room_id],
          function (err, row) {
            if (err) {
              debug('select all chat room settings error : ', err);
              socket.emit('retrievedChatRoomSettingsList', {error : err, process : 'select all chat room settings'});
            } else {
              socket.emit('retrievedChatRoomSettingsList', {result : row});
            }
          }
        );
      });

      socket.on('updateChatRoomSettingsTranslateKo', function (userData) {
        if (userData.translate_ko !== null) {
          var chatRoomId = userData.chat_room_id || socket.room_id;
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_CHAT_ROOM_SETTINGS_SET_TRANSLATE_KO_BY_CHAT_ROOM_ID_AND_USER_ID,
            [userData.translate_ko, chatRoomId, userData.user_id],
            function (err) {
              if (err) {
                debug('update chat room settings error : ', err);
                socket.emit('updatedChatRoomSettingsTranslateKo', {
                  error : err,
                  process : 'updatedChatRoomSettingsTranslateKo'
                });
              } else {
                socket.emit('updatedChatRoomSettingsTranslateKo', {result : 'OK'});
              }
            }
          );
        }

        if (userData.show_picture !== null) {
          sqlite3.db.run(
            sqlite3.QUERIES.UPDATE_CHAT_ROOM_SETTINGS_SET_SHOW_PICTURE_BY_CHAT_ROOM_ID_AND_USER_ID,
            [userData.show_picture, userData.chat_room_id, userData.user_id],
            function (err) {
              if (err) {
                debug('update chat room settings error : ', err);
                socket.emit('updatedChatRoomSettingsShowPicture', {
                  error : err,
                  process : 'updatedChatRoomSettingsShowPicture'
                });
              } else {
                socket.emit('updatedChatRoomSettingsShowPicture', {result : 'OK'});
              }
            }
          );
        }
      });

      socket.on('createUser', function (userData) {
        var user_id = createUID('user_id');
        userData.user_id = user_id;

        var socketId = socket.id;
        var currentTimeStamp = new Date().getTime();
        userData.connection_time = currentTimeStamp;
        userData.created = currentTimeStamp;
        userData.socket_id = socketId;
        sqlite3.db.run(
          sqlite3.QUERIES.INSERT_USER,
          [
            user_id, userData.user_name, userData.user_face, userData.device_token, userData.device_id,
            userData.device_type, userData.device_version, socketId, userData.online, currentTimeStamp,
            currentTimeStamp
          ],
          function (err) {
            if (err) {
              debug('insert user error : ', err, userData);
              socket.emit('createdUser', {error : err, process : 'createdUser'});
            } else {
              socket.emit('createdUser', {result : userData});
            }
          }
        );
      });

      socket.on('retrieveAllChatRoomIdsAndFriendIdAndLastTextByUserId', function (userData) {
        sqlite3.db.all(
          sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_IDS_AND_FRIEND_ID_AND_LAST_MESSAGE_BY_USER_ID,
          {$userId : userData.user_id},
          function (err, rows) {
            if (err) {
              debug('select all chat rooms error : ', err, userData);
              socket.emit('retrievedAllChatRoomIdsAndFriendIdAndLastTextByUserId', {
                error : err,
                process : 'select all chat room id and friend id by user id'
              });
            } else {
              socket.emit('retrievedAllChatRoomIdsAndFriendIdAndLastTextByUserId', {result : rows});
            }
          }
        );
      });

      function _joinChatRoom(userData) {
        socket.room_id = userData.chat_room_id;
        socket.join(userData.chat_room_id);

        // we store the user_name in the socket session for this client
        socket.user_name = userData.user.user_name;

        socket.emit('joinedChatRoom', {
          result : {
            chat_room_id : userData.chat_room_id
          }
        });
      }

      // when the client emits 'add user', this listens and executes
      socket.on('joinChatRoom', function (userData) {
        var chatRoomId = userData.chat_room_id;
        if (!chatRoomId) {
          sqlite3.db.serialize(function () {
            sqlite3.db.get(
              sqlite3.QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID_AND_FRIEND_ID,
              [userData.user.user_id, userData.friend.user_id],
              function (err, row) {
                if (err) {
                  debug('select chat room id by user id and friend id error : ', err, userData);
                  socket.emit('joinedChatRoom', {
                    error : err,
                    process : 'select chat room id by user id and friend id'
                  });
                } else {
                  if (row) {
                    debug('chat room already exists', userData);
                    chatRoomId = row.chat_room_id;
                    userData.chat_room_id = chatRoomId;
                    _joinChatRoom(userData);
                  } else {
                    chatRoomId = createUID('chat_room_id');
                    sqlite3.db.serialize(function () {
                      sqlite3.db.run(sqlite3.QUERIES.INSERT_CHAT_ROOM, [chatRoomId], function (err) {
                        if (err) {
                          debug('insert chat room error : ', err);
                          socket.emit('joinedChatRoom', {error : err, process : 'create new chat room'});
                        } else {
                          debug('create new chat room', chatRoomId, userData);
                        }
                      });

                      sqlite3.db.run(
                        sqlite3.QUERIES.INSERT_CHAT_ROOM_SETTINGS,
                        [chatRoomId, userData.user.user_id, 0, 0],
                        function (err) {
                          if (err) {
                            debug('insert chat room settings error : ', err);
                            socket.emit('joinedChatRoom', {error : err, process : 'insert chat room settings'});
                          } else {
                            debug('create new chat room setting', chatRoomId, userData);
                          }
                        }
                      );

                      sqlite3.db.run(
                        sqlite3.QUERIES.INSERT_CHAT_ROOM_USER,
                        [chatRoomId, userData.user.user_id],
                        function (err) {
                          if (err) {
                            debug('join chat room - insert chat room user error : ', err);
                            socket.emit('joinedChatRoom', {error : err, process : 'insert "user" to chat room'});
                          } else {
                            debug('insert "user" to chat room users table', userData);
                          }
                        }
                      );
                    });
                  }
                }
              }
            );
          });
        } else {
          _joinChatRoom(userData);
        }
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
        --numUsers;

        // echo globally that this client has left
        socket.broadcast.emit('user left', {
          user_name : socket.user_name,
          num_users : numUsers
        });
      });
    });
  }
};

module.exports = chatObj;