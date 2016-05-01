/**
 * @author Hana Lee
 * @since 2016-05-01 18:15
 */
var https = require('https');
var debug = require('debug')('node-translate-chat:push-notification');
// Define relevant info

var pushNotification = function (options) {
  debug('push options : ', options);
  var jwt = options.authorization_token;
  var tokens = options.tokens;
  var profile = 'dev';

// Build the request object
  var data = {
    'tokens' : tokens,
    'profile' : profile,
    'notification' : {
      'title' : options.title || '번역채팅',
      'message' : options.text,
      'android' : {
        'title' : options.android.title || '번역채팅',
        'message' : options.android.text
      },
      'ios' : {
        'title' : options.ios.title || '번역채팅',
        'message' : options.ios.text
      }
    }
  };

  var httpsOptions = {
    hostname : 'api.ionic.io',
    path : '/push/notifications',
    method : 'POST',
    headers : {
      'Content-Type' : 'application/json',
      'Authorization' : 'Bearer ' + jwt
    }
  };

  var req = https.request(httpsOptions, function (res) {
    debug('STATUS: ', res.statusCode);
    debug('HEADERS: ', JSON.stringify(res.headers));
    
    res.on('data', function (chunk) {
      debug('BODY: ', chunk);
    });
    res.on('end', function () {
      debug('No more data in response.')
    })
  });

  req.on('error', function (err) {
    debug('problem with request: ', err.message);
  });

// write data to request body
  req.write(JSON.stringify(data));
  req.end();
};

module.exports = pushNotification;