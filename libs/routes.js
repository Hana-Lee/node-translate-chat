/**
 * @author Hana Lee
 * @since 2016-04-22 15:57
 */
'use strict';

var chat = require('./socket-service');
var path = require('path');
var mime = require('mime');
var fs = require('fs');
var imagic = require('imagemagick');
var debug = require('debug')('node-translate-chat:routes');
var multer = require('multer');

var storage = multer.diskStorage({
  destination : function (req, res, cb) {
    cb(null, './uploads');
  },
  filename : function (req, file, cb) {
    var fileName = req.query.fileName || file.originalname;
    cb(null, fileName);
  }
});

var upload = multer({storage : storage}).single('image');

module.exports = {
  configRoutes : function (app, server) {
    app.use(function(req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header('Access-Control-Allow-Methods', 'GET, POST');
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      next();
    });

    app.get('/', function (req, res) {
      res.redirect('/');
    });

    app.post('/api/image/', function (req, res) {
      upload(req, res, function (err) {
        if (err) {
          debug('upload image error : ', err);
          res.statusCode = 500;
          return res.end('Error uploading file.');
        }

        res.statusCode = 200;
        res.end('Image file is uploaded');
      });
    });

    app.param('file', function (req, res, next) {
      next();
    });

    // Show files
    app.get('/api/image/:file', function (req, res){
      var file = req.params.file;
      var finalPath = path.join('./uploads', file);
      var img = fs.readFileSync(finalPath);
      res.writeHead(200, {'Content-Type': mime.lookup(finalPath) });
      res.end(img, 'binary');
    });

    chat.connect(server);
  }
};