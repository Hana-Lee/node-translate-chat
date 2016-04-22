/**
 * @author Hana Lee
 * @since 2016-04-22 15:57
 */
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

var express = require('express');
var app = express();
var routes = require('./libs/routes');
var errorHandler = require('errorhandler');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var logger = require('morgan');

var setup = function (server) {
  routes.configRoutes(app, server);
};

app.use(logger('dev'));
app.use(errorHandler());
app.use(express.static(__dirname + '/public'));

module.exports = { app : app, setup : setup };
