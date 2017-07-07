/**
* Copyright 2017 Google Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

declare const Windows;

import { assert } from '../../../utils/assert';
import { forEach } from '../../../utils/obj';
import { base64 } from '../../../utils/crypt';
import { Sha1 } from '../../../utils/Sha1';
import { 
  assert as _assert,
  assertionError as _assertError
} from "../../../utils/assert";
import { stringToByteArray } from "../../../utils/utf8";
import { stringify } from "../../../utils/json";
import { SessionStorage } from "../storage/storage";
import { RepoInfo } from "../RepoInfo";
import { isNodeSdk } from "../../../utils/environment";

/**
 * Returns a locally-unique ID (generated by just incrementing up from 0 each time its called).
 * @type {function(): number} Generated ID.
 */
export const LUIDGenerator = (function() {
  var id = 1;
  return function() {
    return id++;
  };
})();

/**
 * Same as fb.util.assert(), but forcefully logs instead of throws.
 * @param {*} assertion The assertion to be tested for falsiness
 * @param {!string} message The message to be logged on failure
 */
export const assertWeak = function(assertion, message) {
  if (!assertion) {
    error(message);
  }
};


/**
 * URL-safe base64 encoding
 * @param {!string} str
 * @return {!string}
 */
export const base64Encode = function(str) {
  var utf8Bytes = stringToByteArray(str);
  return base64.encodeByteArray(utf8Bytes, /*useWebSafe=*/true);
};


let BufferImpl;
export function setBufferImpl(impl) {
  BufferImpl = impl;
}
/**
 * URL-safe base64 decoding
 *
 * NOTE: DO NOT use the global atob() function - it does NOT support the
 * base64Url variant encoding.
 *
 * @param {string} str To be decoded
 * @return {?string} Decoded result, if possible
 */
export const base64Decode = function(str) {
  try {
    if (BufferImpl()) {
      return new BufferImpl(str, 'base64').toString('utf8');
    } else {
      return base64.decodeString(str, /*useWebSafe=*/true);
    }
  } catch (e) {
    log('base64Decode failed: ', e);
  }
  return null;
};


/**
 * Sha1 hash of the input string
 * @param {!string} str The string to hash
 * @return {!string} The resulting hash
 */
export const sha1 = function(str) {
  var utf8Bytes = stringToByteArray(str);
  var sha1 = new Sha1();
  sha1.update(utf8Bytes);
  var sha1Bytes = sha1.digest();
  return base64.encodeByteArray(sha1Bytes);
};


/**
 * @param {...*} var_args
 * @return {string}
 * @private
 */
export const buildLogMessage_ = function(var_args) {
  var message = '';
  for (var i = 0; i < arguments.length; i++) {
    if (Array.isArray(arguments[i]) || 
        (arguments[i] && typeof arguments[i] === 'object' && typeof arguments[i].length === 'number')) {
      message += buildLogMessage_.apply(null, arguments[i]);
    }
    else if (typeof arguments[i] === 'object') {
      message += stringify(arguments[i]);
    }
    else {
      message += arguments[i];
    }
    message += ' ';
  }

  return message;
};


/**
 * Use this for all debug messages in Firebase.
 * @type {?function(string)}
 */
export var logger = null;


/**
 * Flag to check for log availability on first log message
 * @type {boolean}
 * @private
 */
export var firstLog_ = true;


/**
 * The implementation of Firebase.enableLogging (defined here to break dependencies)
 * @param {boolean|?function(string)} logger A flag to turn on logging, or a custom logger
 * @param {boolean=} opt_persistent Whether or not to persist logging settings across refreshes
 */
export const enableLogging = function(logger, opt_persistent?) {
  assert(!opt_persistent || (logger === true || logger === false), "Can't turn on custom loggers persistently.");
  if (logger === true) {
    if (typeof console !== 'undefined') {
      if (typeof console.log === 'function') {
        logger = console.log.bind(console);
      } else if (typeof console.log === 'object') {
        // IE does this.
        logger = function(message) { console.log(message); };
      }
    }
    if (opt_persistent)
      SessionStorage.set('logging_enabled', true);
  }
  else if (typeof logger === 'function') {
    logger = logger;
  } else {
    logger = null;
    SessionStorage.remove('logging_enabled');
  }
};


/**
 *
 * @param {...(string|Arguments)} var_args
 */
export const log = function(...var_args) {
  if (firstLog_ === true) {
    firstLog_ = false;
    if (logger === null && SessionStorage.get('logging_enabled') === true)
      enableLogging(true);
  }

  if (logger) {
    var message = buildLogMessage_.apply(null, arguments);
    logger(message);
  }
};


/**
 * @param {!string} prefix
 * @return {function(...[*])}
 */
export const logWrapper = function(prefix) {
  return function() {
    log(prefix, arguments);
  };
};


/**
 * @param {...string} var_args
 */
export const error = function(var_args) {
  if (typeof console !== 'undefined') {
    var message = 'FIREBASE INTERNAL ERROR: ' +
        buildLogMessage_.apply(null, arguments);
    if (typeof console.error !== 'undefined') {
      console.error(message);
    } else {
      console.log(message);
    }
  }
};


/**
 * @param {...string} var_args
 */
export const fatal = function(var_args) {
  var message = buildLogMessage_.apply(null, arguments);
  throw new Error('FIREBASE FATAL ERROR: ' + message);
};


/**
 * @param {...*} var_args
 */
export const warn = function(...var_args) {
  if (typeof console !== 'undefined') {
    var message = 'FIREBASE WARNING: ' + buildLogMessage_.apply(null, arguments);
    if (typeof console.warn !== 'undefined') {
      console.warn(message);
    } else {
      console.log(message);
    }
  }
};


/**
 * Logs a warning if the containing page uses https. Called when a call to new Firebase
 * does not use https.
 */
export const warnIfPageIsSecure = function() {
  // Be very careful accessing browser globals. Who knows what may or may not exist.
  if (typeof window !== 'undefined' && window.location && window.location.protocol &&
      window.location.protocol.indexOf('https:') !== -1) {
    warn('Insecure Firebase access from a secure page. ' +
                      'Please use https in calls to new Firebase().');
  }
};


/**
 * @param {!String} methodName
 */
export const warnAboutUnsupportedMethod = function(methodName) {
  warn(methodName +
                    ' is unsupported and will likely change soon.  ' +
                    'Please do not use.');
};


/**
 * Returns true if data is NaN, or +/- Infinity.
 * @param {*} data
 * @return {boolean}
 */
export const isInvalidJSONNumber = function(data) {
  return typeof data === 'number' &&
      (data != data || // NaN
       data == Number.POSITIVE_INFINITY ||
       data == Number.NEGATIVE_INFINITY);
};


/**
 * @param {function()} fn
 */
export const executeWhenDOMReady = function(fn) {
  if (isNodeSdk() || document.readyState === 'complete') {
    fn();
  } else {
    // Modeled after jQuery. Try DOMContentLoaded and onreadystatechange (which
    // fire before onload), but fall back to onload.

    var called = false;
    let wrappedFn = function() {
      if (!document.body) {
        setTimeout(wrappedFn, Math.floor(10));
        return;
      }

      if (!called) {
        called = true;
        fn();
      }
    };

    if (document.addEventListener) {
      document.addEventListener('DOMContentLoaded', wrappedFn, false);
      // fallback to onload.
      window.addEventListener('load', wrappedFn, false);
    } else if ((document as any).attachEvent) {
      // IE.
      (document as any).attachEvent('onreadystatechange',
          function() {
            if (document.readyState === 'complete')
              wrappedFn();
          }
      );
      // fallback to onload.
      (window as any).attachEvent('onload', wrappedFn);

      // jQuery has an extra hack for IE that we could employ (based on
      // http://javascript.nwbox.com/IEContentLoaded/) But it looks really old.
      // I'm hoping we don't need it.
    }
  }
};


/**
 * Minimum key name. Invalid for actual data, used as a marker to sort before any valid names
 * @type {!string}
 */
export const MIN_NAME = '[MIN_NAME]';


/**
 * Maximum key name. Invalid for actual data, used as a marker to sort above any valid names
 * @type {!string}
 */
export const MAX_NAME = '[MAX_NAME]';


/**
 * Compares valid Firebase key names, plus min and max name
 * @param {!string} a
 * @param {!string} b
 * @return {!number}
 */
export const nameCompare = function(a, b) {
  if (a === b) {
    return 0;
  } else if (a === MIN_NAME || b === MAX_NAME) {
    return -1;
  } else if (b === MIN_NAME || a === MAX_NAME) {
    return 1;
  } else {
    var aAsInt = tryParseInt(a),
        bAsInt = tryParseInt(b);

    if (aAsInt !== null) {
      if (bAsInt !== null) {
        return (aAsInt - bAsInt) == 0 ? (a.length - b.length) : (aAsInt - bAsInt);
      } else {
        return -1;
      }
    } else if (bAsInt !== null) {
      return 1;
    } else {
      return (a < b) ? -1 : 1;
    }
  }
};


/**
 * @param {!string} a
 * @param {!string} b
 * @return {!number} comparison result.
 */
export const stringCompare = function(a, b) {
  if (a === b) {
    return 0;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
};


/**
 * @param {string} key
 * @param {Object} obj
 * @return {*}
 */
export const requireKey = function(key, obj) {
  if (obj && (key in obj)) {
    return obj[key];
  } else {
    throw new Error('Missing required key (' + key + ') in object: ' + stringify(obj));
  }
};


/**
 * @param {*} obj
 * @return {string}
 */
export const ObjectToUniqueKey = function(obj) {
  if (typeof obj !== 'object' || obj === null)
    return stringify(obj);

  var keys = [];
  for (var k in obj) {
    keys.push(k);
  }

  // Export as json, but with the keys sorted.
  keys.sort();
  var key = '{';
  for (var i = 0; i < keys.length; i++) {
    if (i !== 0)
      key += ',';
    key += stringify(keys[i]);
    key += ':';
    key += ObjectToUniqueKey(obj[keys[i]]);
  }

  key += '}';
  return key;
};


/**
 * Splits a string into a number of smaller segments of maximum size
 * @param {!string} str The string
 * @param {!number} segsize The maximum number of chars in the string.
 * @return {Array.<string>} The string, split into appropriately-sized chunks
 */
export const splitStringBySize = function(str, segsize) {
  if (str.length <= segsize) {
    return [str];
  }

  var dataSegs = [];
  for (var c = 0; c < str.length; c += segsize) {
    if (c + segsize > str) {
      dataSegs.push(str.substring(c, str.length));
    }
    else {
      dataSegs.push(str.substring(c, c + segsize));
    }
  }
  return dataSegs;
};


/**
 * Apply a function to each (key, value) pair in an object or
 * apply a function to each (index, value) pair in an array
 * @param {!(Object|Array)} obj The object or array to iterate over
 * @param {function(?, ?)} fn The function to apply
 */
export const each = function(obj, fn) {
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; ++i) {
      fn(i, obj[i]);
    }
  } else {
    /**
     * in the conversion of code we removed the goog.object.forEach
     * function which did a value,key callback. We standardized on
     * a single impl that does a key, value callback. So we invert
     * to not have to touch the `each` code points
     */
    forEach(obj, (key, val) => fn(val, key));
  }
};


/**
 * Like goog.bind, but doesn't bother to create a closure if opt_context is null/undefined.
 * @param {function(*)} callback Callback function.
 * @param {?Object=} opt_context Optional context to bind to.
 * @return {function(*)}
 */
export const bindCallback = function(callback, opt_context) {
  return opt_context ? callback.bind(opt_context) : callback;
};


/**
 * Borrowed from http://hg.secondlife.com/llsd/src/tip/js/typedarray.js (MIT License)
 * I made one modification at the end and removed the NaN / Infinity
 * handling (since it seemed broken [caused an overflow] and we don't need it).  See MJL comments.
 * @param {!number} v A double
 * @return {string}
 */
export const doubleToIEEE754String = function(v) {
  assert(!isInvalidJSONNumber(v), 'Invalid JSON number'); // MJL

  var ebits = 11, fbits = 52;
  var bias = (1 << (ebits - 1)) - 1,
      s, e, f, ln,
      i, bits, str, bytes;

  // Compute sign, exponent, fraction
  // Skip NaN / Infinity handling --MJL.
  if (v === 0) {
    e = 0; f = 0; s = (1 / v === -Infinity) ? 1 : 0;
  }
  else {
    s = v < 0;
    v = Math.abs(v);

    if (v >= Math.pow(2, 1 - bias)) {
      // Normalized
      ln = Math.min(Math.floor(Math.log(v) / Math.LN2), bias);
      e = ln + bias;
      f = Math.round(v * Math.pow(2, fbits - ln) - Math.pow(2, fbits));
    }
    else {
      // Denormalized
      e = 0;
      f = Math.round(v / Math.pow(2, 1 - bias - fbits));
    }
  }

  // Pack sign, exponent, fraction
  bits = [];
  for (i = fbits; i; i -= 1) { bits.push(f % 2 ? 1 : 0); f = Math.floor(f / 2); }
  for (i = ebits; i; i -= 1) { bits.push(e % 2 ? 1 : 0); e = Math.floor(e / 2); }
  bits.push(s ? 1 : 0);
  bits.reverse();
  str = bits.join('');

  // Return the data as a hex string. --MJL
  var hexByteString = '';
  for (i = 0; i < 64; i += 8) {
    var hexByte = parseInt(str.substr(i, 8), 2).toString(16);
    if (hexByte.length === 1)
      hexByte = '0' + hexByte;
    hexByteString = hexByteString + hexByte;
  }
  return hexByteString.toLowerCase();
};


/**
 * Used to detect if we're in a Chrome content script (which executes in an
 * isolated environment where long-polling doesn't work).
 * @return {boolean}
 */
export const isChromeExtensionContentScript = function() {
  return !!(typeof window === 'object' &&
            window['chrome'] &&
            window['chrome']['extension'] &&
            !/^chrome/.test(window.location.href)
         );
};


/**
 * Used to detect if we're in a Windows 8 Store app.
 * @return {boolean}
 */
export const isWindowsStoreApp = function() {
  // Check for the presence of a couple WinRT globals
  return typeof Windows === 'object' && typeof Windows.UI === 'object';
};


/**
 * Converts a server error code to a Javascript Error
 * @param {!string} code
 * @param {!fb.api.Query} query
 * @return {Error}
 */
export const errorForServerCode = function(code, query) {
  var reason = 'Unknown Error';
  if (code === 'too_big') {
    reason = 'The data requested exceeds the maximum size ' +
             'that can be accessed with a single request.';
  } else if (code == 'permission_denied') {
    reason = "Client doesn't have permission to access the desired data.";
  } else if (code == 'unavailable') {
    reason = 'The service is unavailable';
  }

  var error = new Error(code + ' at ' + query.path.toString() + ': ' + reason);
  (error as any).code = code.toUpperCase();
  return error;
};


/**
 * Used to test for integer-looking strings
 * @type {RegExp}
 * @private
 */
export const INTEGER_REGEXP_ = new RegExp('^-?\\d{1,10}$');


/**
 * If the string contains a 32-bit integer, return it.  Else return null.
 * @param {!string} str
 * @return {?number}
 */
export const tryParseInt = function(str) {
  if (INTEGER_REGEXP_.test(str)) {
    var intVal = Number(str);
    if (intVal >= -2147483648 && intVal <= 2147483647) {
      return intVal;
    }
  }
  return null;
};


/**
 * Helper to run some code but catch any exceptions and re-throw them later.
 * Useful for preventing user callbacks from breaking internal code.
 *
 * Re-throwing the exception from a setTimeout is a little evil, but it's very
 * convenient (we don't have to try to figure out when is a safe point to
 * re-throw it), and the behavior seems reasonable:
 *
 * * If you aren't pausing on exceptions, you get an error in the console with
 *   the correct stack trace.
 * * If you're pausing on all exceptions, the debugger will pause on your
 *   exception and then again when we rethrow it.
 * * If you're only pausing on uncaught exceptions, the debugger will only pause
 *   on us re-throwing it.
 *
 * @param {!function()} fn The code to guard.
 */
export const exceptionGuard = function(fn) {
  try {
    fn();
  } catch (e) {
    // Re-throw exception when it's safe.
    setTimeout(function() {
      // It used to be that "throw e" would result in a good console error with
      // relevant context, but as of Chrome 39, you just get the firebase.js
      // file/line number where we re-throw it, which is useless. So we log
      // e.stack explicitly.
      var stack = e.stack || '';
      warn('Exception was thrown by user callback.', stack);
      throw e;
    }, Math.floor(0));
  }
};


/**
 * Helper function to safely call opt_callback with the specified arguments.  It:
 * 1. Turns into a no-op if opt_callback is null or undefined.
 * 2. Wraps the call inside exceptionGuard to prevent exceptions from breaking our state.
 *
 * @param {?Function=} opt_callback Optional onComplete callback.
 * @param {...*} var_args Arbitrary args to be passed to opt_onComplete
 */
export const callUserCallback = function(opt_callback, var_args) {
  if (typeof opt_callback === 'function') {
    var args = Array.prototype.slice.call(arguments, 1);
    var newArgs = args.slice();
    exceptionGuard(function() {
      opt_callback.apply(null, newArgs);
    });
  }
};


/**
 * @return {boolean} true if we think we're currently being crawled.
*/
export const beingCrawled = function() {
  var userAgent = (typeof window === 'object' && window['navigator'] && window['navigator']['userAgent']) || '';

  // For now we whitelist the most popular crawlers.  We should refine this to be the set of crawlers we
  // believe to support JavaScript/AJAX rendering.
  // NOTE: Google Webmaster Tools doesn't really belong, but their "This is how a visitor to your website
  // would have seen the page" is flaky if we don't treat it as a crawler.
  return userAgent.search(/googlebot|google webmaster tools|bingbot|yahoo! slurp|baiduspider|yandexbot|duckduckbot/i) >=
      0;
};

/**
 * Export a property of an object using a getter function.
 *
 * @param {!Object} object
 * @param {string} name
 * @param {!function(): *} fnGet
 */
export const exportPropGetter = function(object, name, fnGet) {
  Object.defineProperty(object, name, {get: fnGet});
};

/**
 * Same as setTimeout() except on Node.JS it will /not/ prevent the process from exiting.
 *
 * It is removed with clearTimeout() as normal.
 *
 * @param fn {Function} Function to run.
 * @param time {number} Milliseconds to wait before running.
 * @return {number|Object} The setTimeout() return value.
 */
export const setTimeoutNonBlocking = function(fn, time) {
  var timeout = setTimeout(fn, time);
  if (typeof timeout === 'object' && timeout['unref']) {
    timeout['unref']();
  }
  return timeout;
};
