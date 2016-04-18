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

server.listen(port, function () {
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
                  message : '[' + data + ']'
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
