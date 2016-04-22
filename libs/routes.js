/**
 * @author Hana Lee
 * @since 2016-04-22 15:57
 */
'use strict';

var chat = require('./chat');

module.exports = {
  configRoutes : function (app, server) {
    app.get('/', function (request, response) {
      response.redirect('/');
    });

    chat.connect(server);
  }
};