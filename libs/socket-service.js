/**
 * @author Hana Lee
 * @since 2016-04-22 17:45
 */
(function () {
  'use strict';

  var socketIO = require('socket.io');
  var translator = require('./translator');
  var pushNotification = require('./push-notification');
  var sqlite3 = require('./sqlite3');
  var debug = require('debug')('node-translate-chat:chat');
  var md5 = require('md5');
  var callerId = require('caller-id');

  var authorizationToken = process.env.IONIC_PUSH_AUTORIZATION_TOKEN;

  module.exports = {
    connect : function (server) {
      socketIO.listen(server, null).on('connection', onConnection);
    }
  };

  function onConnection(/** @prop {Object} broadcast */socket) {
    debug('socket connection : ', socket.id);

    updateUserSocketId(socket);
    registerSocketEvent(socket);
  }

  var seed = undefined;

  function createUID(value) {
    if (!seed) {
      seed = (new Date()).valueOf();
    }
    seed++;

    return md5(seed + value);
  }

  function updateUserSocketId(socket, userData) {
    var socketId = socket.id;
    var userId;

    if (userData) {
      userId = userData.user_id;
    } else {
      userId = socket.handshake.query.user_id;
    }

    if (userId) {
      var query = sqlite3.QUERIES.UPDATE_USERS_SET_SOCKET_ID_BY_USER_ID;
      var params = [socketId, userId];
      var callback = function (err) {
        if (err) {
          debug('update users set socket id error : ', err);
        }
      };

      sqlite3.db.run(query, params, callback);
    }
  }

  function sendPushNotification(socket, userData) {
    var pushAvailable = (userData.to_user.device_token !== '');

    if (pushAvailable) {
      var title = '사랑의대화';
      var pushOptions = {
        authorization_token : authorizationToken,
        tokens : [], title : title, text : '',
        android : {
          title : title, text : '', payload : {
            chat_room_id : socket.room_id
          }
        },
        ios : {
          title : title, text : '', payload : {
            chat_room_id : socket.room_id
          }
        }
      };

      sqlite3.db.serialize(function () {
        var query = sqlite3.QUERIES.SELECT_USER_ONLINE_BY_USER_ID;
        var params = [userData.to_user.user_id];
        var online = true;
        sqlite3.db.get(query, params, selectUserOnlineCb);

        query = sqlite3.QUERIES.SELECT_DEVICE_TOKEN_BY_USER_ID;
        params = [userData.to_user.user_id];
        sqlite3.db.get(query, params, selectDeviceTokenCb);

        function selectUserOnlineCb(err, row) {
          if (err) {
            debug('select user online state by user id error : ', err);
          } else if (row && row.online === 0) {
            online = false;
          }
        }

        function selectDeviceTokenCb(err, row) {
          if (err) {
            errorHandler(socket, '', err, '');
          } else if (row && online) {
            pushOptions.tokens.push(row.device_token);
            pushOptions.text = userData.user_name + ':' + userData.text;
            pushOptions.android.text = userData.user_name + ':' + userData.text;
            pushOptions.ios.text = userData.user_name + ':' + userData.text;

            pushNotification(pushOptions);
          }
        }
      });
    }
  }

  function errorHandler(socket, emit, err, message) {
    var caller = callerId.getString();
    message = '[' + caller + ']-' + message;
    debug(message, err);
    socket.emit(emit, {error : err, message : message});
  }

  function registerSocketEvent(socket) {
    socket.on('updateSocketId', onUpdateSocketId);
    socket.on('updateDeviceToken', onUpdateDeviceToken);
    socket.on('new_message', onNewMessage);
    socket.on('updateUserOnlineState', onUpdateUserOnlineState);
    socket.on('updateChatMessage', onUpdateChatMessage);
    socket.on('createFriend', onCreateFriend);
    socket.on('retrieveUserByUserId', onRetrieveUserByUserId);
    socket.on('retrieveUserByUserName', onRetrieveUserByUserName);
    socket.on('retrieveAlreadyRegisteredUserByDeviceId', onRetrieveAlreadyRegisteredUserByDeviceId);
    socket.on('retrieveAllFriends', onRetrieveAllFriends);
    socket.on('retrieveAllUsers', onRetrieveAllUsers);
    socket.on('retrieveAllChatRoomLastMessages', onRetrieveAllChatRoomLastMessages);
    socket.on('retrieveAllChatMessagesByChatRoomId', onRetrieveAllChatMessagesByChatRoomId);
    socket.on('retrieveChatRoomSettingsList', onRetrieveChatRoomSettingsList);
    socket.on('updateChatRoomSettingsTranslateKo', onUpdateChatRoomSettingsTranslateKo);
    socket.on('createUser', onCreateUser);
    socket.on('retrieveAllChatRoomIdsAndFriendIdAndLastTextByUserId', onRetrieveAllChatRoomIdsAndFriendIdAndLastTextByUserId);
    socket.on('joinChatRoom', onJoinChatRoom);
    socket.on('typing', onTyping);
    socket.on('stop_typing', onStopTyping);
    socket.on('disconnect', onDisconnect);

    function onUpdateSocketId(userData) {
      console.log('update socket id', userData);
      updateUserSocketId(socket, userData);
    }

    function onUpdateDeviceToken(userData) {
      var query = sqlite3.QUERIES.UPDATE_USERS_SET_DEVICE_TOKEN_BY_USER_ID;
      var params = [userData.user.device_token, userData.user.user_id];
      var callback = function (err) {
        if (err) {
          debug('update users set device token error : ', err);
          socket.emit('updatedDeviceToken', {error : err, message : 'update device token'});
        }
      };
      sqlite3.db.run(query, params, callback);
    }

    function onNewMessage(/** @type {String} */userData) {
      debug('new_message : ', userData);
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
          [socket.room_id, userData.to_user.user_id],
          function (err, /** @param {Number} row.translate_ko */row) {
            if (err) {
              debug('select chat room settings error : ', err);
              socket.emit('new_message', {error : err, message : 'select chat room settings'});
            } else {
              if (!imageType && !onlyEmoji && row && row.translate_ko === 1) {
                translator.translate({
                  text : userData.text, from : 'ko', to : 'es'
                }, function (err, translatedToESResult) {
                  if (err) {
                    debug('ko to es translation error : ', error);
                    socket.emit('new_message', {error : err, message : 'ko to es translation'})
                  } else {
                    translator.translate({
                      text : userData.text, from : 'ko', to : 'zh-CHS'
                    }, function (err, translatedToZhCNResult) {
                      if (err) {
                        debug('ko to zh-CHS translation error : ', err, userData.text);
                        socket.emit('new_message', {error : err, message : 'ko to zh-CHS translation'});
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
                                message : 'insert ko to zh-CHS translated chat message'
                              });
                            } else {
                              sendPushNotification(socket, userData);

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
                        message : 'insert chat message'
                      });
                    } else {
                      sendPushNotification(socket, userData);

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
              socket.emit('new_message', {error : err, message : 'Source text language detection'});
            } else {
              debug('Translator detected language : ', detectedResult);

              translator.translate({
                text : userData.text, from : detectedResult, to : 'ko'
              }, function (err, translatedResult) {
                if (err) {
                  debug(detectedResult + ' to ko translation error : ', err, userData.text);
                  socket.emit('new_message', {error : err, message : detectedResult + ' to ko translation'});
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
                        socket.emit('new_message', {error : err, message : 'insert translated chat message'});
                      } else {
                        sendPushNotification(socket, userData);

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

    function onUpdateUserOnlineState(userData) {
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
              socket.emit('updatedUserOnlineState', {error : err, message : 'update user online state'});
            } else {
              socket.emit('updatedUserOnlineState', {result : 'OK'});
            }
          }
        );
      });
    }

    /**
     * @prop {Number} messageData.read Is Message Read?
     * @prop {String} messageData.read_time Read time stamp
     */
    function onUpdateChatMessage(messageData) {
      sqlite3.db.run(
        sqlite3.QUERIES.UPDATE_CHAT_MESSAGE_BY_CHAT_MESSAG_ID,
        [messageData.read, messageData.read_time],
        function (err) {
          if (err) {
            debug('chat message update error : ', err);
            socket.emit('updatedChatMessage', {error : err, message : 'chat message update'});
          } else {
            socket.emit('updatedChatMessage', {result : 'OK'});
          }
        }
      );
    }

    function onCreateFriend(userData) {
      debug('create friend', userData);
      var query = sqlite3.QUERIES.INSERT_FRIEND;
      var params = [userData.user.user_id, userData.friend.user_id];

      function insertFriendCb(err) {
        if (err) {
          errorHandler(socket, 'createdFriend', err, 'create friend error');
        } else {
          if (userData.notification) {
            debug('create friend notification');
            socket.broadcast.to(userData.friend.socket_id).emit('addedFriend', {result : userData.user});
          }
          socket.emit('createdFriend', {result : 'OK'})
        }
      }

      sqlite3.db.run(query, params, insertFriendCb);
    }

    function onRetrieveUserByUserId(userData) {
      sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_BY_USER_ID, [userData.user_id], function (err, row) {
        if (err) {
          debug('select user by user id error : ', err);
          socket.emit('retrievedUserByUserId', {error : err, message : 'select user by user id'});
        } else {
          socket.emit('retrievedUserByUserId', {result : row});
        }
      });
    }

    function onRetrieveUserByUserName(userData) {
      sqlite3.db.get(sqlite3.QUERIES.SELECT_USER_BY_USER_NAME, [userData.user_name], function (err, row) {
        if (err) {
          debug('select user by user name error : ', err);
          socket.emit('retrievedUserByUserName', {error : err, message : 'select user by user name'});
        } else {
          socket.emit('retrievedUserByUserName', {result : row});
        }
      });
    }

    function onRetrieveAlreadyRegisteredUserByDeviceId(userData) {
      sqlite3.db.get(
        sqlite3.QUERIES.SELECT_USER_BY_DEVICE_ID,
        [userData.device_id],
        function (err, row) {
          if (err) {
            debug('retrieveAlreadyRegisteredUserByDeviceId error : ', err);
            socket.emit('retrievedAlreadyRegisteredUserByDeviceId', {
              error : err,
              message : 'retrieveAlreadyRegisteredUserByDeviceId'
            });
          } else {
            socket.emit('retrievedAlreadyRegisteredUserByDeviceId', {result : row});
          }
        }
      );
    }

    function onRetrieveAllFriends(userData) {
      var query = sqlite3.QUERIES.SELECT_ALL_FRIENDS_BY_USER_ID;
      var params = [userData.user_id];
      sqlite3.db.all(query, params, callback);

      function callback(err, rows) {
        if (err) {
          errorHandler(socket, 'retrievedAllFriends', err, 'select all friends by user id error');
        } else {
          debug('retrieved all friends success : ', rows);
          socket.emit('retrievedAllFriends', {result : rows});
        }
      }
    }

    function onRetrieveAllUsers() {
      debug('retrieve all users', socket.id);
      sqlite3.db.all(
        sqlite3.QUERIES.SELECT_ALL_USERS,
        function (err, rows) {
          if (err) {
            debug('retrieve all users error : ', err);
            socket.emit('retrievedAllUsers', {error : err, message : 'retrieveAllUsers'});
          } else {
            debug('retrieved all users', rows);
            socket.emit('retrievedAllUsers', {result : rows});
          }
        }
      );
    }

    function onRetrieveAllChatRoomLastMessages(userData) {
      sqlite3.db.all(
        sqlite3.QUERIES.SELECT_ALL_LAST_MESSAGE_BY_CHAT_ROOM_ID_AND_USER_ID,
        {0 : userData.user_id, $room_ids : '\'' + userData.chat_room_ids.join('\',\'') + '\''},
        function (err, rows) {
          if (err) {
            debug('select last message error : ', err);
            socket.emit('retrievedAllChatRoomLastMessages', {
              error : err,
              message : 'retrieveAllChatRoomLastMessages'
            });
          } else {
            socket.emit('retrievedAllChatRoomLastMessages', {result : rows});
          }
        }
      );
    }

    function onRetrieveAllChatMessagesByChatRoomId(userData) {
      sqlite3.db.all(
        sqlite3.QUERIES.SELECT_ALL_CHAT_MESSAGES_BY_CHAT_ROOM_ID,
        [userData.chat_room_id],
        function (err, rows) {
          if (err) {
            debug('select all chat messages by chat room id error : ', err);
            socket.emit('retrieveAllChatMessagesByChatRoomId', {
              error : err,
              message : 'select all chat messages by chat room id'
            });
          } else {
            socket.emit('retrievedAllChatMessagesByChatRoomId', {result : rows});
          }
        }
      );
    }

    function onRetrieveChatRoomSettingsList(userData) {
      sqlite3.db.get(
        sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID,
        [userData.user_id, userData.chat_room_id],
        function (err, row) {
          if (err) {
            debug('select all chat room settings error : ', err);
            socket.emit('retrievedChatRoomSettingsList', {error : err, message : 'select all chat room settings'});
          } else {
            socket.emit('retrievedChatRoomSettingsList', {result : row});
          }
        }
      );
    }

    function onUpdateChatRoomSettingsTranslateKo(userData) {
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
                message : 'updatedChatRoomSettingsTranslateKo'
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
              errorHandler(socket, 'updatedChatRoomSettingsShowPicture', err, 'update chat room settings error :');
            } else {
              socket.emit('updatedChatRoomSettingsShowPicture', {result : 'OK'});
            }
          }
        );
      }
    }

    function onCreateUser(userData) {
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
            socket.emit('createdUser', {error : err, message : 'createdUser'});
          } else {
            socket.emit('createdUser', {result : userData});
          }
        }
      );
    }

    function onRetrieveAllChatRoomIdsAndFriendIdAndLastTextByUserId(userData) {
      sqlite3.db.all(
        sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_IDS_AND_FRIEND_ID_AND_LAST_MESSAGE_BY_USER_ID,
        {$userId : userData.user_id},
        function (err, rows) {
          if (err) {
            debug('select all chat rooms error : ', err, userData);
            socket.emit('retrievedAllChatRoomIdsAndFriendIdAndLastTextByUserId', {
              error : err,
              message : 'select all chat room id and friend id by user id'
            });
          } else {
            socket.emit('retrievedAllChatRoomIdsAndFriendIdAndLastTextByUserId', {result : rows});
          }
        }
      );
    }

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

    function onJoinChatRoom(userData) {
      var chatRoomId = userData.chat_room_id;
      var emitName = 'joinedChatRoom';
      if (!chatRoomId) {
        sqlite3.db.serialize(function () {
          var query = sqlite3.QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID_AND_FRIEND_ID;
          var params = [userData.user.user_id, userData.friend.user_id];
          sqlite3.db.get(query, params, selectChatRoomIdCb);
          function selectChatRoomIdCb(err, row) {
            if (err) {
              errorHandler(socket, emitName, err, 'select chat room id by user id and friend id');
            } else {
              if (row) {
                debug('chat room already exists', userData);
                userData.chat_room_id = row.chat_room_id;
                _joinChatRoom(userData);
              } else {
                sqlite3.db.serialize(function () {
                  chatRoomId = createUID('chat_room_id');
                  query = sqlite3.QUERIES.INSERT_CHAT_ROOM;
                  params = [chatRoomId];
                  sqlite3.db.run(query, params, createChatRoomCb);

                  query = sqlite3.QUERIES.INSERT_CHAT_ROOM_SETTINGS;
                  params = [chatRoomId, userData.user.user_id, 0, 0];
                  sqlite3.db.run(query, params, createChatRoomSettingsCb);

                  query = sqlite3.QUERIES.INSERT_CHAT_ROOM_USER;
                  params = [chatRoomId, userData.user.user_id];
                  sqlite3.db.run(query, params, createChatRoomUserCb);

                  function createChatRoomCb(err) {
                    if (err) {
                      errorHandler(socket, emitName, err, 'insert new chat room error');
                    } else {
                      debug('create new chat room', chatRoomId, userData);
                    }
                  }

                  function createChatRoomSettingsCb(err) {
                    if (err) {
                      errorHandler(socket, emitName, err, 'insert chat room settings error');
                    } else {
                      debug('create new chat room setting', chatRoomId, userData);
                    }
                  }

                  function createChatRoomUserCb(err) {
                    if (err) {
                      errorHandler(socket, 'joinedChatRoom', err, 'insert chat room user error');
                    } else {
                      debug('insert "user" to chat room users table', userData);
                    }
                  }
                });
              }
            }
          }
        });
      } else {
        _joinChatRoom(userData);
      }
    }

    function onTyping() {
      socket.broadcast.emit('typing', {
        user_name : socket.user_name
      });
    }

    function onStopTyping() {
      socket.broadcast.emit('stop_typing', {
        user_name : socket.user_name
      });
    }

    function onDisconnect() {
      debug('disconnect', socket.user_name);

      socket.broadcast.emit('user_left', {
        user_name : socket.user_name
      });
    }
  }
})();