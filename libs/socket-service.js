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
  var Promise = require('promise');
  var fs = require('fs');

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
      seed = new Date().getTime();
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
      sqlite3.db.run(query, params, callback);
    }

    function callback(err) {
      if (err) {
        debug('update users set socket id error : ', err);
      }
    }
  }

  function sendPushNotification(socket, userData) {
    debug('push notification : ', userData.to_user);
    var pushAvailable = (userData.to_user.device_token !== '');

    if (pushAvailable) {
      var title = '사랑의대화';
      var pushOptions = {
        authorization_token : authorizationToken,
        tokens : [], title : title, text : '',
        android : {
          title : title, text : '', payload : {
            chat_room_id : userData.chat_room_id
          }
        },
        ios : {
          title : title, text : '', payload : {
            chat_room_id : userData.chat_room_id
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
            errorHandler(socket, '', err, 'select device token error');
          } else if (row && !online) {
            pushOptions.tokens.push(row.device_token);
            pushOptions.text = userData.user.user_name + ':' + userData.text;
            pushOptions.android.text = userData.user.user_name + ':' + userData.text;
            pushOptions.ios.text = userData.user.user_name + ':' + userData.text;

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

    if (emit) {
      socket.emit(emit, {error : err, message : message});
    }
  }

  function translateKoToOtherLanguage(options) {
    return new Promise(function (resolve) {
      translator.koTranslate(options, function (result) {
        resolve(result);
      });
    });
  }

  function registerSocketEvent(socket) {
    socket.on('updateSocketId', onUpdateSocketId);
    socket.on('updateDeviceToken', onUpdateDeviceToken);
    socket.on('newMessage', onNewMessage);
    socket.on('updateUserOnlineState', onUpdateUserOnlineState);
    socket.on('updateChatMessage', onUpdateChatMessage);
    socket.on('createFriend', onCreateFriend);
    socket.on('retrieveUserByUserId', onRetrieveUserByUserId);
    socket.on('retrieveUserByUserName', onRetrieveUserByUserName);
    socket.on('retrieveAllFriends', onRetrieveAllFriends);
    socket.on('retrieveAllUsers', onRetrieveAllUsers);
    socket.on('retrieveAllChatMessagesByChatRoomId', onRetrieveAllChatMessagesByChatRoomId);
    socket.on('retrieveChatRoomSettingsList', onRetrieveChatRoomSettingsList);
    socket.on('updateChatRoomSettings', onUpdateChatRoomSettings);
    socket.on('createUser', onCreateUser);
    socket.on('retrieveAllChatRoomByUserId', onRetrieveAllChatRoomByUserId);
    socket.on('retrieveChatRoomId', onRetrieveChatRoomId);
    socket.on('createChatRoom', onCreateChatRoom);
    socket.on('joinChatRoom', onJoinChatRoom);
    socket.on('typing', onTyping);
    socket.on('stop_typing', onStopTyping);
    socket.on('disconnect', onDisconnect);
    socket.on('deleteChatRoom', onDeleteChatRoom);

    function onUpdateSocketId(userData) {
      debug('update socket id', userData);
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
      debug('newMessage : ', userData);

      if (!socket.chat_room_id) {
        socket.chat_room_id = userData.chat_room_id;
        socket.join(userData.chat_room_id);
      }

      var concatText, emit = 'newMessage';
      var isOnlyImage = isImageType(userData.type);
      var isOnlyKorean = isKoreanText(userData.text);
      var isOnlyEmoji = isEmojiText(userData.text);

      if (isOnlyImage || isOnlyEmoji) {
        noTranslate();
      } else if (isOnlyKorean) {
        onlyKorean();
      } else {
        translate();
      }

      function onlyKorean() {
        koreanToOtherLanguageTranslateAvailable().then(koTranslate, noTranslate);
      }

      function koreanToOtherLanguageTranslateAvailable() {
        return new Promise(function (resolve, reject) {
          var query = sqlite3.QUERIES.SELECT_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID_AND_USER_ID;
          var params = [userData.chat_room_id, userData.to_user.user_id, 'translate_ko'];
          sqlite3.db.get(query, params, function (err, /** @prop {Number} setting_value */row) {
            debug('user settings : ', row);
            //noinspection JSValidateTypes
            if (row && row.setting_value === '1') {
              resolve('OK');
            } else {
              reject('NO');
            }
          });
        });
      }

      function translate() {
        translator.detect({text : userData.text}, languageDetectCb);
      }

      function isImageType(type) {
        return type.toLowerCase() === 'image';
      }

      function isKoreanText(text) {
        var koreanReg = /[ㄱ-ㅎ가-힣]/g; // ㅎㅎㅎ, ㅋㅋㅋ 에 대응
        return koreanReg.test(text);
      }

      function isEmojiText(text) {
        var emojiReg = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
        var replacedEmoji = text.replace(emojiReg, '').replace(/\s/g, '');
        return replacedEmoji.length === 0;
      }

      /**
       * @param {String} detectedResult
       */
      function languageDetectCb(detectedResult) {
        debug('Translator detected language : ', detectedResult);

        var options = {
          text : userData.text, from : detectedResult, to : 'ko'
        };
        translator.translate(options, translateCb);

        options.language = detectedResult;
        translator.speakURL(options, function (err, result) {
          if (err) {
            errorHandler(socket, emit, err, 'get speak data error');
          } else {
            debug('speak url result : ', result);
            // fs.writeFileSync('t.mp3', result);
          }
        });
      }

      function translateCb(translatedResult) {
        debug('Translated to ko result : ', translatedResult);
        concatText = userData.text + '\nko:[' + translatedResult + ']';
        saveChatMessage();
      }

      function koTranslate() {
        Promise.all([
          translateKoToOtherLanguage({text : userData.text, from : 'ko', to : 'es'}),
          translateKoToOtherLanguage({text : userData.text, from : 'ko', to : 'zh-CHS'})
        ]).then(function (results) {
          concatText = userData.text + '\nes:[' + results[0] + ']\nch:[' + results[1] + ']';
          saveChatMessage();
        });
      }

      function noTranslate() {
        debug('no translate', userData.text);
        concatText = userData.text;
        saveChatMessage();
      }

      function saveChatMessage() {
        var query = sqlite3.QUERIES.INSERT_CHAT_MESSGE;
        var params = [userData.chat_room_id, userData.user.user_id, concatText, userData.type];
        sqlite3.db.run(query, params, insertChatMessageCb);
      }

      function insertChatMessageCb(err) {
        if (err) {
          errorHandler(socket, emit, err, 'insert ko to zh-CHS translated chat message error');
        } else {
          sendPushNotification(socket, userData);
          broadcastMessage();
        }
      }

      function broadcastMessage() {
        socket.broadcast.to(userData.chat_room_id).emit(emit, {
          result : {
            user_name : userData.user.user_name,
            text : concatText,
            type : userData.type
          }
        });
        socket.emit(emit, {
          result : {
            user_name : userData.user.user_name,
            text : concatText,
            type : userData.type
          }
        });
      }
    }

    function onUpdateUserOnlineState(userData) {
      var emit = 'updatedUserOnlineState';
      var currentTimeStamp = new Date().getTime();
      sqlite3.db.serialize(function () {
        var query = sqlite3.QUERIES.UPDATE_USERS_SET_CONNECTION_TIME_BY_USER_ID;
        var params = [currentTimeStamp, userData.user_id];
        sqlite3.db.run(query, params, updateConnectionTimeCb);

        query = sqlite3.QUERIES.UPDATE_USERS_SET_ONLINE_BY_USER_ID;
        params = [userData.online, userData.user_id];
        sqlite3.db.run(query, params, updateOnlineCb);

        function updateConnectionTimeCb(err) {
          if (err) {
            errorHandler(socket, null, err, 'update users set connection time error');
          }
        }

        function updateOnlineCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'update user online state error');
          } else {
            socket.emit(emit, {result : 'OK'});
          }
        }
      });
    }

    /**
     * @prop {Number} messageData.read Is Message Read?
     * @prop {String} messageData.read_time Read time stamp
     */
    function onUpdateChatMessage(messageData) {
      var emit = 'updatedChatMessage';
      var query = sqlite3.QUERIES.UPDATE_CHAT_MESSAGE_BY_CHAT_MESSAG_ID;
      var params = [messageData.read, messageData.read_time];
      sqlite3.db.run(query, params, callback);

      function callback(err) {
        if (err) {
          errorHandler(socket, emit, err, 'chat message update error');
        } else {
          socket.emit(emit, {result : 'OK'});
        }
      }
    }

    function onCreateFriend(userData) {
      debug('create friend', userData);
      var emit = 'createdFriend';
      var query = sqlite3.QUERIES.INSERT_FRIEND;
      var params = [userData.user.user_id, userData.friend.user_id];
      sqlite3.db.run(query, params, insertFriendCb);

      function insertFriendCb(err) {
        if (err) {
          errorHandler(socket, emit, err, 'create friend error');
        } else {
          if (userData.notification) {
            debug('create friend notification');
            socket.broadcast.to(userData.friend.socket_id).emit('addedFriend', {result : userData.user});
          }
          socket.emit(emit, {result : 'OK'})
        }
      }
    }

    function onRetrieveUserByUserId(userData) {
      var emit = 'retrievedUserByUserId';
      var query = sqlite3.QUERIES.SELECT_USER_BY_USER_ID;
      var params = [userData.user_id];
      sqlite3.db.get(query, params, callback);

      function callback(err, row) {
        if (err) {
          errorHandler(socket, emit, err, 'select user by user id error');
        } else {
          socket.emit(emit, {result : row});
        }
      }
    }

    function onRetrieveUserByUserName(userData) {
      var emit = 'retrievedUserByUserName';
      var query = sqlite3.QUERIES.SELECT_USER_BY_USER_NAME;
      var params = [userData.user_name];
      sqlite3.db.get(query, params, callback);

      function callback(err, row) {
        if (err) {
          errorHandler(socket, emit, err, 'select user by user name error');
        } else {
          socket.emit(emit, {result : row});
        }
      }
    }

    function onRetrieveAllFriends(userData) {
      var emit = 'retrievedAllFriends';
      var query = sqlite3.QUERIES.SELECT_ALL_FRIENDS_BY_USER_ID;
      var params = [userData.user_id];
      sqlite3.db.all(query, params, callback);

      function callback(err, rows) {
        if (err) {
          errorHandler(socket, emit, err, 'select all friends by user id error');
        } else {
          debug('retrieved all friends success : ', rows);
          socket.emit(emit, {result : rows});
        }
      }
    }

    function onRetrieveAllUsers() {
      debug('retrieve all users', socket.id);
      var emit = 'retrievedAllUsers';
      var query = sqlite3.QUERIES.SELECT_ALL_USERS;
      sqlite3.db.all(query, callback);

      function callback(err, rows) {
        if (err) {
          errorHandler(socket, emit, err, 'retrieve all users error');
        } else {
          debug('retrieved all users', rows);
          socket.emit(emit, {result : rows});
        }
      }
    }

    function onRetrieveAllChatMessagesByChatRoomId(userData) {
      var emit = 'retrievedAllChatMessagesByChatRoomId';
      var query = sqlite3.QUERIES.SELECT_ALL_CHAT_MESSAGES_BY_CHAT_ROOM_ID;
      var params = [userData.chat_room_id];
      sqlite3.db.all(query, params, callback);

      function callback(err, rows) {
        if (err) {
          errorHandler(socket, emit, err, 'select all chat messages by chat room id error');
        } else {
          socket.emit(emit, {result : rows});
        }
      }
    }

    function onRetrieveChatRoomSettingsList(userData) {
      var emit = 'retrievedChatRoomSettingsList';
      var query = sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID;
      var params = [userData.user_id, userData.chat_room_id];
      sqlite3.db.all(query, params, callback);

      function callback(err, rows) {
        if (err) {
          errorHandler(socket, emit, err, 'select all chat room settings error');
        } else {
          socket.emit(emit, {result : rows});
        }
      }
    }

    function onUpdateChatRoomSettings(userData) {
      var emit = 'updatedChatRoomSettings';
      var chatRoomId = userData.chat_room_id;
      var userId = userData.user.user_id;
      var updateCount = 0;

      userData.settings.forEach(function (setting) {
        var query = sqlite3.QUERIES.UPDATE_CHAT_ROOM_SETTINGS_BY_USER_ID_AND_CHAT_ROOM_ID;
        var params = [setting.value, userId, chatRoomId, setting.key];
        sqlite3.db.run(query, params, updateSettingsCb);
      });

      function updateSettingsCb(err) {
        if (err) {
          errorHandler(socket, emit, err, 'update setting by user id and chat room id error');
        } else {
          updateCount++;

          if (updateCount === userData.settings.length) {
            socket.emit(emit, {result : 'OK'});
          }
        }
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

      var emit = 'createdUser';
      var query = sqlite3.QUERIES.INSERT_USER;
      var params = [
        user_id, userData.user_name, userData.user_face, userData.device_token, userData.device_id,
        userData.device_type, userData.device_version, socketId, userData.online, currentTimeStamp,
        currentTimeStamp
      ];
      sqlite3.db.run(query, params, callback);


      function callback(err) {
        if (err) {
          errorHandler(socket, emit, err, 'insert user error');
        } else {
          socket.emit(emit, {result : userData});
        }
      }
    }

    function onRetrieveAllChatRoomByUserId(userData) {
      var emit = 'retrievedAllChatRoomByUserId';
      var query = sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_IDS_AND_FRIEND_ID_AND_LAST_MESSAGE_BY_USER_ID;
      var params = [userData.user_id, userData.user_id];
      sqlite3.db.all(query, params, callback);

      function callback(err, rows) {
        if (err) {
          errorHandler(socket, emit, err, 'select all chat rooms error');
        } else {
          socket.emit(emit, {result : rows});
        }
      }
    }

    function onRetrieveChatRoomId(userData) {
      var emit = 'retrievedChatRoomId';
      var query = sqlite3.QUERIES.SELECT_CHAT_ROOM_ID_BY_USER_ID_AND_FRIEND_ID;
      var params = [userData.user.user_id, userData.to_user.user_id];
      sqlite3.db.get(query, params, selectChatRoomIdCb);

      function selectChatRoomIdCb(err, row) {
        if (err) {
          errorHandler(socket, emit, err, 'select chat room id by user id and to user id error');
        } else {
          socket.emit(emit, {result : row});
        }
      }
    }

    function onCreateChatRoom(userData) {
      var emit = 'createdChatRoom';
      var chatRoomId = createUID('chat_room_id');

      sqlite3.db.serialize(function () {
        var query = sqlite3.QUERIES.INSERT_CHAT_ROOM;
        var params = [chatRoomId];
        sqlite3.db.run(query, params, createChatRoomCb);

        query = sqlite3.QUERIES.INSERT_CHAT_ROOM_USER;
        params = [chatRoomId, userData.user.user_id];
        sqlite3.db.run(query, params, createChatRoomUserCb);

        query = sqlite3.QUERIES.INSERT_CHAT_ROOM_USER;
        params = [chatRoomId, userData.to_user.user_id];
        sqlite3.db.run(query, params, createChatRoomUserCb);

        query = sqlite3.QUERIES.SELECT_ALL_CHAT_ROOM_SETTING_MASTER;
        sqlite3.db.each(query, function (err, row) {
          if (err) {
            errorHandler(socket, emit, err, 'select all chat setting master error');
          } else {
            debug('insert chat room setting per users : ', row);
            query = sqlite3.QUERIES.INSERT_CHAT_ROOM_SETTINGS;
            params = [
              chatRoomId, row.setting_key, row.default_value, userData.user.user_id
            ];
            sqlite3.db.run(query, params, createUserChatRoomSettingCb);

            query = sqlite3.QUERIES.INSERT_CHAT_ROOM_SETTINGS;
            params = [
              chatRoomId, row.setting_key, row.default_value, userData.to_user.user_id
            ];
            sqlite3.db.run(query, params, createUserChatRoomSettingCb);
          }
        });

        socket.emit(emit, {result : {chat_room_id : chatRoomId}});

        function createChatRoomCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'insert new chat room error');
          } else {
            debug('create new chat room', chatRoomId, userData);
          }
        }

        function createChatRoomUserCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'insert chat room user error');
          } else {
            debug('insert "user" to chat room users table', userData);
          }
        }

        function createUserChatRoomSettingCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'insert user chat room setting error');
          } else {
            debug('insert "user" to chat room setting table', userData);
          }
        }
      });
    }

    function onJoinChatRoom(userData) {
      var emit = 'joinedChatRoom';
      socket.chat_room_id = userData.chat_room_id;
      socket.join(userData.chat_room_id);

      socket.emit(emit, {
        result : 'OK'
      });
    }

    function onTyping(userData) {
      socket.broadcast.emit('typing', {
        user_name : userData.user_name
      });
    }

    function onStopTyping(userData) {
      socket.broadcast.emit('stop_typing', {
        user_name : userData.user_name
      });
    }

    function onDisconnect(userData) {
      debug('disconnect', userData.user_name);

      socket.broadcast.emit('user_left', {
        user_name : userData.user_name
      });
    }

    function onDeleteChatRoom(userData) {
      debug('delete chat room', userData);
      var emit = 'deletedChatRoom';
      var roomId = userData.chat_room_id;
      sqlite3.db.serialize(function () {
        var query = sqlite3.QUERIES.DELETE_CHAT_ROOM_BY_CHAT_ROOM_ID;
        var params = [roomId];
        sqlite3.db.run(query, params, deleteChatRoomCb);

        query = sqlite3.QUERIES.DELETE_CHAT_ROOM_SETTINGS_BY_CHAT_ROOM_ID;
        sqlite3.db.run(query, params, deleteChatRoomSettingsCb);

        query = sqlite3.QUERIES.DELETE_CHAT_ROOM_USERS_BY_CHAT_ROOM_ID;
        sqlite3.db.run(query, params, deleteChatRoomUsersCb);

        query = sqlite3.QUERIES.DELETE_CHAT_MESSAGES_BY_CHAT_ROOM_ID;
        sqlite3.db.run(query, params, deleteChatMessagesCb);

        query = sqlite3.QUERIES.SELECT_USER_BY_USER_ID;
        params = [userData.to_user.user_id];
        sqlite3.db.get(query, params, selectToUserCb);

        function deleteChatRoomCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'delete chat room error');
          }
        }

        function deleteChatRoomSettingsCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'delete chat room settings error');
          }
        }

        function deleteChatRoomUsersCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'delete chat room users error');
          }
        }

        function deleteChatMessagesCb(err) {
          if (err) {
            errorHandler(socket, emit, err, 'delete chat messages error');
          }
        }

        function selectToUserCb(err, row) {
          if (err) {
            errorHandler(socket, emit, err, 'select to user error');
          } else {
            socket.broadcast.to(row.socket_id).emit('toUserDeletedChatRoom',
              {result : {chat_room_id : roomId}}
            );
            socket.emit(emit, {result : 'OK'});
          }
        }
      });
    }
  }
})();