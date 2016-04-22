/**
 * @author Hana Lee
 * @since 2016-04-22 17:45
 */
var https = require('https');
var MsTranslator = require('mstranslator');

module.exports = new MsTranslator({
  client_id : process.env.MS_CLIENT_ID,
  client_secret : process.env.MS_CLIENT_SECRET
}, true);