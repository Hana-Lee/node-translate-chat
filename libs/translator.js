/**
 * @author Hana Lee
 * @since 2016-04-22 17:45
 */
(function () {
  'use strict';

  var Promise = require('promise');
  var MsTranslator = require('mstranslator');
  var NaverTranslator = require('naver-translator');
  var debug = require('debug')('translate-chat:translator');

  var mTranslator = new MsTranslator({
    client_id : process.env.MS_CLIENT_ID,
    client_secret : process.env.MS_CLIENT_SECRET
  }, true);
  var nTranslator = new NaverTranslator({
    client_id : process.env.NAVER_CLIENT_ID,
    client_secret : process.env.NAVER_CLIENT_SECRET
  });

  /**
   * 번역은 원본 -> 영어 -> 일본어 -> 한국어 순으로 한다
   *
   * @param {Object} options
   * @param {Function} callback
   */
  function translate(options, callback) {
    _mTranslate(options.text, options.from, 'en').then(function (result) {
      _mTranslate(result, 'en', 'ja').then(function (result) {
        _nTranslate(result, 'ja', options.to).then(function (result) {
          callback(result);
        });
      });
    }).catch(function (error) {
      debug(options.from + ' to ko translate error : ', error);
    });
  }

  /**
   * 번역은 한국어 -> 일본어 -> 영어 -> 중국어
   * 번역은 한국어 -> 일본어 -> 영어 -> 스페인어
   * 순서대로 한다
   *
   * @param {Object} options
   * @param {Function} callback
   */
  function koTranslate(options, callback) {
    _nTranslate(options.text, options.from, 'ja').then(function (result) {
      _mTranslate(result, 'ja', 'en').then(function (result) {
        _mTranslate(result, 'en', options.to).then(function (result) {
          callback(result);
        });
      });
    }).catch(function (error) {
      debug('ko to ' + options.to + ' translate error : ', error);
    });
  }

  function _mTranslate(text, from, to) {
    return new Promise(function (resolve, reject) {
      var params = {
        text : text, from : from, to : to
      };
      mTranslator.translate(params, function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  function _nTranslate(text, from, to) {
    return new Promise(function (resolve) {
      var params = {
        text : text, source : from, target : to
      };
      nTranslator.translate(params, function (result) {
        resolve(result);
      });
    });
  }

  /**
   * 언어 코드 확인
   * @param {Object} options
   * @param {Function} callback
   */
  function detect(options, callback) {
    mTranslator.detect(options, function (error, result) {
      if (error) {
        debug('language detect error : ', error);
      } else {
        callback(result);
      }
    });
  }

  function speak(options, callback) {
    if (!options.format) {
      options.format = 'audio/mp3';
    }
    mTranslator.speak(options, callback);
  }

  function speakURL(options, callback) {
    if (!options.format) {
      options.format = 'audio/mp3';
    }
    mTranslator.speakURL(options, callback);
  }

  module.exports = {
    translate : translate,
    koTranslate : koTranslate,
    detect : detect,
    speak : speak,
    speakURL : speakURL
  };
})();