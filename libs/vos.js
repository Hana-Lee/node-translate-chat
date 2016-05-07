/**
 * @author Hana Lee
 * @since 2016-05-07 16:31
 */

(function () {
  /**
   * @typedef {Object} UserData
   * @type {UserData}
   * @param {String} friend_id
   * @param {String} chat_room_id
   * @param {String[]} chat_room_ids
   * @param {String} user_face
   * @param {String} device_token
   * @param {Boolean} show_picture
   * @param {String} to_user_id
   * @param {String} device_id
   * @param {String} connection_time
   * @param {Object} to_user
   * @param {String} device_type
   * @param {String} device_version
   * @param {Object} user
   * @param {Object} friend
   * @param {Boolean} online
   */
  var userData = {
    friend_id : null, chat_room_id : null, chat_room_ids : null, user_face : null, device_token : null,
    show_picture : false, to_user_id : null, device_id : null, connection_time : null, to_user : null,
    device_type : null, device_version : null, user : null, friend : {socket_id : null, user_id : null},
    online : false
  };

  return {
    userData : userData
  }
})();