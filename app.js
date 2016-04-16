// Setup basic express server
var https = require('https');
var qs = require('querystring');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;

var TRANSLATE_HOST = 'openapi.naver.com';
var TRANSLATE_URI = '/v1/language/translate?source=ko';
var TRANSLATE_PORT = 443;
var ZH_CH = 'zh-CN';
var KO_KR = 'ko';
var CLIENT_ID = 'WN5sao0PugzKjY1gz8RH';
var SEC_CLIENT_ID = 'gVFv3M6q5q2h6DqqqAqN';
var CLIENT_SECRET = 'mZNiHTI1R8';
var SEC_CLIENT_SECRET = '8Pvx3qmpuC';

var translateOptions = {
  host : TRANSLATE_HOST, port : TRANSLATE_PORT, path : TRANSLATE_URI, method : 'POST',
  headers : {
    'Content-Type' : 'application/x-www-form-urlencoded', 'Accept' : '*/*',
    'X-Naver-Client-Id' : CLIENT_ID, 'X-Naver-Client-Secret' : CLIENT_SECRET
  }
};

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
  socket.on('new message', function (data) {
    // we tell the client to execute 'new message'

    var koreanReg = /[가-힣]/g;
    var chineseReg = /[\u4e00-\u9fa5]*/g;
    var source = KO_KR;
    var target = ZH_CH;
    var translateAvailable = false;

    if (chineseReg.test(data) && socket.userlang === ZH_CH) {
      source = ZH_CH;
      target = KO_KR;
      translateAvailable = true;
    } else if (koreanReg.test(data) && socket.userlang === KO_KR) {
      source = KO_KR;
      target = ZH_CH;
      translateAvailable = true;
    }

    if (translateAvailable) {
      var translateRequest = https.request(translateOptions, function (res) {
        console.log('status:', res.statusCode);
        console.log('HEADERS: ' + res.headers);
        res.setEncoding('utf8');
        res.on('data', function (result) {
          var resultJson = JSON.parse(result);
          if (resultJson.errorMessage) {
            console.log('server error', resultJson.errorMessage, resultJson.errorCode);
          } else {
            var resultText = resultJson.message.result.translatedText;
            socket.broadcast.emit('new message', {
              username : socket.username,
              message : resultText + '[' + data + ']'
            });
            socket.emit('new message', {
              username : socket.username,
              message : resultText
            });
          }
        });
        res.on('error', function (err) {
          console.log('translate response error', err);
        });
      });

      // req error
      translateRequest.on('error', function (err) {
        console.log('translate request error', err);
      });

      translateRequest.write(qs.stringify({source : source, target : target, text : data}));
      translateRequest.end();
    } else {
      socket.broadcast.emit('new message', {
        username : socket.username,
        message : data
      });
    }
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function (userData) {
    if (addedUser) return;

    // we store the username in the socket session for this client
    socket.username = userData.username;
    socket.userlang = userData.lang;
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
