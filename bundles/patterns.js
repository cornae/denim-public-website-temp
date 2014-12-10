/**
 * Patterns bundle 1.5.0-7d390b69
 *
 * See http://patternslib.com/ for more information.
 *
 * Included patterns:
 * - modernizr
 * - pat/bumper
 * - pat/collapsible
 * - pat/depends
 * - pat/equaliser
 * - pat/inject
 * - pat/toggle
 * - prefixfree
 */


/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("bundle", function(){});

/*!
 * Modernizr v2.6.2
 * www.modernizr.com
 *
 * Copyright (c) Faruk Ates, Paul Irish, Alex Sexton
 * Available under the BSD and MIT licenses: www.modernizr.com/license/
 */

/*
 * Modernizr tests which native CSS3 and HTML5 features are available in
 * the current UA and makes the results available to you in two ways:
 * as properties on a global Modernizr object, and as classes on the
 * <html> element. This information allows you to progressively enhance
 * your pages with a granular level of control over the experience.
 *
 * Modernizr has an optional (not included) conditional resource loader
 * called Modernizr.load(), based on Yepnope.js (yepnopejs.com).
 * To get a build that includes Modernizr.load(), as well as choosing
 * which tests to include, go to www.modernizr.com/download/
 *
 * Authors        Faruk Ates, Paul Irish, Alex Sexton
 * Contributors   Ryan Seddon, Ben Alman
 */

window.Modernizr = (function( window, document, undefined ) {

    var version = '2.6.2',

    Modernizr = {},

    /*>>cssclasses*/
    // option for enabling the HTML classes to be added
    enableClasses = true,
    /*>>cssclasses*/

    docElement = document.documentElement,

    /**
     * Create our "modernizr" element that we do most feature tests on.
     */
    mod = 'modernizr',
    modElem = document.createElement(mod),
    mStyle = modElem.style,

    /**
     * Create the input element for various Web Forms feature tests.
     */
    inputElem /*>>inputelem*/ = document.createElement('input') /*>>inputelem*/ ,

    /*>>smile*/
    smile = ':)',
    /*>>smile*/

    toString = {}.toString,

    // TODO :: make the prefixes more granular
    /*>>prefixes*/
    // List of property values to set for css tests. See ticket #21
    prefixes = ' -webkit- -moz- -o- -ms- '.split(' '),
    /*>>prefixes*/

    /*>>domprefixes*/
    // Following spec is to expose vendor-specific style properties as:
    //   elem.style.WebkitBorderRadius
    // and the following would be incorrect:
    //   elem.style.webkitBorderRadius

    // Webkit ghosts their properties in lowercase but Opera & Moz do not.
    // Microsoft uses a lowercase `ms` instead of the correct `Ms` in IE8+
    //   erik.eae.net/archives/2008/03/10/21.48.10/

    // More here: github.com/Modernizr/Modernizr/issues/issue/21
    omPrefixes = 'Webkit Moz O ms',

    cssomPrefixes = omPrefixes.split(' '),

    domPrefixes = omPrefixes.toLowerCase().split(' '),
    /*>>domprefixes*/

    /*>>ns*/
    ns = {'svg': 'http://www.w3.org/2000/svg'},
    /*>>ns*/

    tests = {},
    inputs = {},
    attrs = {},

    classes = [],

    slice = classes.slice,

    featureName, // used in testing loop


    /*>>teststyles*/
    // Inject element with style element and some CSS rules
    injectElementWithStyles = function( rule, callback, nodes, testnames ) {

      var style, ret, node, docOverflow,
          div = document.createElement('div'),
          // After page load injecting a fake body doesn't work so check if body exists
          body = document.body,
          // IE6 and 7 won't return offsetWidth or offsetHeight unless it's in the body element, so we fake it.
          fakeBody = body || document.createElement('body');

      if ( parseInt(nodes, 10) ) {
          // In order not to give false positives we create a node for each test
          // This also allows the method to scale for unspecified uses
          while ( nodes-- ) {
              node = document.createElement('div');
              node.id = testnames ? testnames[nodes] : mod + (nodes + 1);
              div.appendChild(node);
          }
      }

      // <style> elements in IE6-9 are considered 'NoScope' elements and therefore will be removed
      // when injected with innerHTML. To get around this you need to prepend the 'NoScope' element
      // with a 'scoped' element, in our case the soft-hyphen entity as it won't mess with our measurements.
      // msdn.microsoft.com/en-us/library/ms533897%28VS.85%29.aspx
      // Documents served as xml will throw if using &shy; so use xml friendly encoded version. See issue #277
      style = ['&#173;','<style id="s', mod, '">', rule, '</style>'].join('');
      div.id = mod;
      // IE6 will false positive on some tests due to the style element inside the test div somehow interfering offsetHeight, so insert it into body or fakebody.
      // Opera will act all quirky when injecting elements in documentElement when page is served as xml, needs fakebody too. #270
      (body ? div : fakeBody).innerHTML += style;
      fakeBody.appendChild(div);
      if ( !body ) {
          //avoid crashing IE8, if background image is used
          fakeBody.style.background = '';
          //Safari 5.13/5.1.4 OSX stops loading if ::-webkit-scrollbar is used and scrollbars are visible
          fakeBody.style.overflow = 'hidden';
          docOverflow = docElement.style.overflow;
          docElement.style.overflow = 'hidden';
          docElement.appendChild(fakeBody);
      }

      ret = callback(div, rule);
      // If this is done after page load we don't want to remove the body so check if body exists
      if ( !body ) {
          fakeBody.parentNode.removeChild(fakeBody);
          docElement.style.overflow = docOverflow;
      } else {
          div.parentNode.removeChild(div);
      }

      return !!ret;

    },
    /*>>teststyles*/

    /*>>mq*/
    // adapted from matchMedia polyfill
    // by Scott Jehl and Paul Irish
    // gist.github.com/786768
    testMediaQuery = function( mq ) {

      var matchMedia = window.matchMedia || window.msMatchMedia;
      if ( matchMedia ) {
        return matchMedia(mq).matches;
      }

      var bool;

      injectElementWithStyles('@media ' + mq + ' { #' + mod + ' { position: absolute; } }', function( node ) {
        bool = (window.getComputedStyle ?
                  getComputedStyle(node, null) :
                  node.currentStyle)['position'] == 'absolute';
      });

      return bool;

     },
     /*>>mq*/


    /*>>hasevent*/
    //
    // isEventSupported determines if a given element supports the given event
    // kangax.github.com/iseventsupported/
    //
    // The following results are known incorrects:
    //   Modernizr.hasEvent("webkitTransitionEnd", elem) // false negative
    //   Modernizr.hasEvent("textInput") // in Webkit. github.com/Modernizr/Modernizr/issues/333
    //   ...
    isEventSupported = (function() {

      var TAGNAMES = {
        'select': 'input', 'change': 'input',
        'submit': 'form', 'reset': 'form',
        'error': 'img', 'load': 'img', 'abort': 'img'
      };

      function isEventSupported( eventName, element ) {

        element = element || document.createElement(TAGNAMES[eventName] || 'div');
        eventName = 'on' + eventName;

        // When using `setAttribute`, IE skips "unload", WebKit skips "unload" and "resize", whereas `in` "catches" those
        var isSupported = eventName in element;

        if ( !isSupported ) {
          // If it has no `setAttribute` (i.e. doesn't implement Node interface), try generic element
          if ( !element.setAttribute ) {
            element = document.createElement('div');
          }
          if ( element.setAttribute && element.removeAttribute ) {
            element.setAttribute(eventName, '');
            isSupported = is(element[eventName], 'function');

            // If property was created, "remove it" (by setting value to `undefined`)
            if ( !is(element[eventName], 'undefined') ) {
              element[eventName] = undefined;
            }
            element.removeAttribute(eventName);
          }
        }

        element = null;
        return isSupported;
      }
      return isEventSupported;
    })(),
    /*>>hasevent*/

    // TODO :: Add flag for hasownprop ? didn't last time

    // hasOwnProperty shim by kangax needed for Safari 2.0 support
    _hasOwnProperty = ({}).hasOwnProperty, hasOwnProp;

    if ( !is(_hasOwnProperty, 'undefined') && !is(_hasOwnProperty.call, 'undefined') ) {
      hasOwnProp = function (object, property) {
        return _hasOwnProperty.call(object, property);
      };
    }
    else {
      hasOwnProp = function (object, property) { /* yes, this can give false positives/negatives, but most of the time we don't care about those */
        return ((property in object) && is(object.constructor.prototype[property], 'undefined'));
      };
    }

    // Adapted from ES5-shim https://github.com/kriskowal/es5-shim/blob/master/es5-shim.js
    // es5.github.com/#x15.3.4.5

    if (!Function.prototype.bind) {
      Function.prototype.bind = function bind(that) {

        var target = this;

        if (typeof target != "function") {
            throw new TypeError();
        }

        var args = slice.call(arguments, 1),
            bound = function () {

            if (this instanceof bound) {

              var F = function(){};
              F.prototype = target.prototype;
              var self = new F();

              var result = target.apply(
                  self,
                  args.concat(slice.call(arguments))
              );
              if (Object(result) === result) {
                  return result;
              }
              return self;

            } else {

              return target.apply(
                  that,
                  args.concat(slice.call(arguments))
              );

            }

        };

        return bound;
      };
    }

    /**
     * setCss applies given styles to the Modernizr DOM node.
     */
    function setCss( str ) {
        mStyle.cssText = str;
    }

    /**
     * setCssAll extrapolates all vendor-specific css strings.
     */
    function setCssAll( str1, str2 ) {
        return setCss(prefixes.join(str1 + ';') + ( str2 || '' ));
    }

    /**
     * is returns a boolean for if typeof obj is exactly type.
     */
    function is( obj, type ) {
        return typeof obj === type;
    }

    /**
     * contains returns a boolean for if substr is found within str.
     */
    function contains( str, substr ) {
        return !!~('' + str).indexOf(substr);
    }

    /*>>testprop*/

    // testProps is a generic CSS / DOM property test.

    // In testing support for a given CSS property, it's legit to test:
    //    `elem.style[styleName] !== undefined`
    // If the property is supported it will return an empty string,
    // if unsupported it will return undefined.

    // We'll take advantage of this quick test and skip setting a style
    // on our modernizr element, but instead just testing undefined vs
    // empty string.

    // Because the testing of the CSS property names (with "-", as
    // opposed to the camelCase DOM properties) is non-portable and
    // non-standard but works in WebKit and IE (but not Gecko or Opera),
    // we explicitly reject properties with dashes so that authors
    // developing in WebKit or IE first don't end up with
    // browser-specific content by accident.

    function testProps( props, prefixed ) {
        for ( var i in props ) {
            var prop = props[i];
            if ( !contains(prop, "-") && mStyle[prop] !== undefined ) {
                return prefixed == 'pfx' ? prop : true;
            }
        }
        return false;
    }
    /*>>testprop*/

    // TODO :: add testDOMProps
    /**
     * testDOMProps is a generic DOM property test; if a browser supports
     *   a certain property, it won't return undefined for it.
     */
    function testDOMProps( props, obj, elem ) {
        for ( var i in props ) {
            var item = obj[props[i]];
            if ( item !== undefined) {

                // return the property name as a string
                if (elem === false) return props[i];

                // let's bind a function
                if (is(item, 'function')){
                  // default to autobind unless override
                  return item.bind(elem || obj);
                }

                // return the unbound function or obj or value
                return item;
            }
        }
        return false;
    }

    /*>>testallprops*/
    /**
     * testPropsAll tests a list of DOM properties we want to check against.
     *   We specify literally ALL possible (known and/or likely) properties on
     *   the element including the non-vendor prefixed one, for forward-
     *   compatibility.
     */
    function testPropsAll( prop, prefixed, elem ) {

        var ucProp  = prop.charAt(0).toUpperCase() + prop.slice(1),
            props   = (prop + ' ' + cssomPrefixes.join(ucProp + ' ') + ucProp).split(' ');

        // did they call .prefixed('boxSizing') or are we just testing a prop?
        if(is(prefixed, "string") || is(prefixed, "undefined")) {
          return testProps(props, prefixed);

        // otherwise, they called .prefixed('requestAnimationFrame', window[, elem])
        } else {
          props = (prop + ' ' + (domPrefixes).join(ucProp + ' ') + ucProp).split(' ');
          return testDOMProps(props, prefixed, elem);
        }
    }
    /*>>testallprops*/


    /**
     * Tests
     * -----
     */

    // The *new* flexbox
    // dev.w3.org/csswg/css3-flexbox

    tests['flexbox'] = function() {
      return testPropsAll('flexWrap');
    };

    // The *old* flexbox
    // www.w3.org/TR/2009/WD-css3-flexbox-20090723/

    tests['flexboxlegacy'] = function() {
        return testPropsAll('boxDirection');
    };

    // On the S60 and BB Storm, getContext exists, but always returns undefined
    // so we actually have to call getContext() to verify
    // github.com/Modernizr/Modernizr/issues/issue/97/

    tests['canvas'] = function() {
        var elem = document.createElement('canvas');
        return !!(elem.getContext && elem.getContext('2d'));
    };

    tests['canvastext'] = function() {
        return !!(Modernizr['canvas'] && is(document.createElement('canvas').getContext('2d').fillText, 'function'));
    };

    // webk.it/70117 is tracking a legit WebGL feature detect proposal

    // We do a soft detect which may false positive in order to avoid
    // an expensive context creation: bugzil.la/732441

    tests['webgl'] = function() {
        return !!window.WebGLRenderingContext;
    };

    /*
     * The Modernizr.touch test only indicates if the browser supports
     *    touch events, which does not necessarily reflect a touchscreen
     *    device, as evidenced by tablets running Windows 7 or, alas,
     *    the Palm Pre / WebOS (touch) phones.
     *
     * Additionally, Chrome (desktop) used to lie about its support on this,
     *    but that has since been rectified: crbug.com/36415
     *
     * We also test for Firefox 4 Multitouch Support.
     *
     * For more info, see: modernizr.github.com/Modernizr/touch.html
     */

    tests['touch'] = function() {
        var bool;

        if(('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch) {
          bool = true;
        } else {
          injectElementWithStyles(['@media (',prefixes.join('touch-enabled),('),mod,')','{#modernizr{top:9px;position:absolute}}'].join(''), function( node ) {
            bool = node.offsetTop === 9;
          });
        }

        return bool;
    };


    // geolocation is often considered a trivial feature detect...
    // Turns out, it's quite tricky to get right:
    //
    // Using !!navigator.geolocation does two things we don't want. It:
    //   1. Leaks memory in IE9: github.com/Modernizr/Modernizr/issues/513
    //   2. Disables page caching in WebKit: webk.it/43956
    //
    // Meanwhile, in Firefox < 8, an about:config setting could expose
    // a false positive that would throw an exception: bugzil.la/688158

    tests['geolocation'] = function() {
        return 'geolocation' in navigator;
    };


    tests['postmessage'] = function() {
      return !!window.postMessage;
    };


    // Chrome incognito mode used to throw an exception when using openDatabase
    // It doesn't anymore.
    tests['websqldatabase'] = function() {
      return !!window.openDatabase;
    };

    // Vendors had inconsistent prefixing with the experimental Indexed DB:
    // - Webkit's implementation is accessible through webkitIndexedDB
    // - Firefox shipped moz_indexedDB before FF4b9, but since then has been mozIndexedDB
    // For speed, we don't test the legacy (and beta-only) indexedDB
    tests['indexedDB'] = function() {
      return !!testPropsAll("indexedDB", window);
    };

    // documentMode logic from YUI to filter out IE8 Compat Mode
    //   which false positives.
    tests['hashchange'] = function() {
      return isEventSupported('hashchange', window) && (document.documentMode === undefined || document.documentMode > 7);
    };

    // Per 1.6:
    // This used to be Modernizr.historymanagement but the longer
    // name has been deprecated in favor of a shorter and property-matching one.
    // The old API is still available in 1.6, but as of 2.0 will throw a warning,
    // and in the first release thereafter disappear entirely.
    tests['history'] = function() {
      return !!(window.history && history.pushState);
    };

    tests['draganddrop'] = function() {
        var div = document.createElement('div');
        return ('draggable' in div) || ('ondragstart' in div && 'ondrop' in div);
    };

    // FF3.6 was EOL'ed on 4/24/12, but the ESR version of FF10
    // will be supported until FF19 (2/12/13), at which time, ESR becomes FF17.
    // FF10 still uses prefixes, so check for it until then.
    // for more ESR info, see: mozilla.org/en-US/firefox/organizations/faq/
    tests['websockets'] = function() {
        return 'WebSocket' in window || 'MozWebSocket' in window;
    };


    // css-tricks.com/rgba-browser-support/
    tests['rgba'] = function() {
        // Set an rgba() color and check the returned value

        setCss('background-color:rgba(150,255,150,.5)');

        return contains(mStyle.backgroundColor, 'rgba');
    };

    tests['hsla'] = function() {
        // Same as rgba(), in fact, browsers re-map hsla() to rgba() internally,
        //   except IE9 who retains it as hsla

        setCss('background-color:hsla(120,40%,100%,.5)');

        return contains(mStyle.backgroundColor, 'rgba') || contains(mStyle.backgroundColor, 'hsla');
    };

    tests['multiplebgs'] = function() {
        // Setting multiple images AND a color on the background shorthand property
        //  and then querying the style.background property value for the number of
        //  occurrences of "url(" is a reliable method for detecting ACTUAL support for this!

        setCss('background:url(https://),url(https://),red url(https://)');

        // If the UA supports multiple backgrounds, there should be three occurrences
        //   of the string "url(" in the return value for elemStyle.background

        return (/(url\s*\(.*?){3}/).test(mStyle.background);
    };



    // this will false positive in Opera Mini
    //   github.com/Modernizr/Modernizr/issues/396

    tests['backgroundsize'] = function() {
        return testPropsAll('backgroundSize');
    };

    tests['borderimage'] = function() {
        return testPropsAll('borderImage');
    };


    // Super comprehensive table about all the unique implementations of
    // border-radius: muddledramblings.com/table-of-css3-border-radius-compliance

    tests['borderradius'] = function() {
        return testPropsAll('borderRadius');
    };

    // WebOS unfortunately false positives on this test.
    tests['boxshadow'] = function() {
        return testPropsAll('boxShadow');
    };

    // FF3.0 will false positive on this test
    tests['textshadow'] = function() {
        return document.createElement('div').style.textShadow === '';
    };


    tests['opacity'] = function() {
        // Browsers that actually have CSS Opacity implemented have done so
        //  according to spec, which means their return values are within the
        //  range of [0.0,1.0] - including the leading zero.

        setCssAll('opacity:.55');

        // The non-literal . in this regex is intentional:
        //   German Chrome returns this value as 0,55
        // github.com/Modernizr/Modernizr/issues/#issue/59/comment/516632
        return (/^0.55$/).test(mStyle.opacity);
    };


    // Note, Android < 4 will pass this test, but can only animate
    //   a single property at a time
    //   daneden.me/2011/12/putting-up-with-androids-bullshit/
    tests['cssanimations'] = function() {
        return testPropsAll('animationName');
    };


    tests['csscolumns'] = function() {
        return testPropsAll('columnCount');
    };


    tests['cssgradients'] = function() {
        /**
         * For CSS Gradients syntax, please see:
         * webkit.org/blog/175/introducing-css-gradients/
         * developer.mozilla.org/en/CSS/-moz-linear-gradient
         * developer.mozilla.org/en/CSS/-moz-radial-gradient
         * dev.w3.org/csswg/css3-images/#gradients-
         */

        var str1 = 'background-image:',
            str2 = 'gradient(linear,left top,right bottom,from(#9f9),to(white));',
            str3 = 'linear-gradient(left top,#9f9, white);';

        setCss(
             // legacy webkit syntax (FIXME: remove when syntax not in use anymore)
              (str1 + '-webkit- '.split(' ').join(str2 + str1) +
             // standard syntax             // trailing 'background-image:'
              prefixes.join(str3 + str1)).slice(0, -str1.length)
        );

        return contains(mStyle.backgroundImage, 'gradient');
    };


    tests['cssreflections'] = function() {
        return testPropsAll('boxReflect');
    };


    tests['csstransforms'] = function() {
        return !!testPropsAll('transform');
    };


    tests['csstransforms3d'] = function() {

        var ret = !!testPropsAll('perspective');

        // Webkit's 3D transforms are passed off to the browser's own graphics renderer.
        //   It works fine in Safari on Leopard and Snow Leopard, but not in Chrome in
        //   some conditions. As a result, Webkit typically recognizes the syntax but
        //   will sometimes throw a false positive, thus we must do a more thorough check:
        if ( ret && 'webkitPerspective' in docElement.style ) {

          // Webkit allows this media query to succeed only if the feature is enabled.
          // `@media (transform-3d),(-webkit-transform-3d){ ... }`
          injectElementWithStyles('@media (transform-3d),(-webkit-transform-3d){#modernizr{left:9px;position:absolute;height:3px;}}', function( node, rule ) {
            ret = node.offsetLeft === 9 && node.offsetHeight === 3;
          });
        }
        return ret;
    };


    tests['csstransitions'] = function() {
        return testPropsAll('transition');
    };


    /*>>fontface*/
    // @font-face detection routine by Diego Perini
    // javascript.nwbox.com/CSSSupport/

    // false positives:
    //   WebOS github.com/Modernizr/Modernizr/issues/342
    //   WP7   github.com/Modernizr/Modernizr/issues/538
    tests['fontface'] = function() {
        var bool;

        injectElementWithStyles('@font-face {font-family:"font";src:url("https://")}', function( node, rule ) {
          var style = document.getElementById('smodernizr'),
              sheet = style.sheet || style.styleSheet,
              cssText = sheet ? (sheet.cssRules && sheet.cssRules[0] ? sheet.cssRules[0].cssText : sheet.cssText || '') : '';

          bool = /src/i.test(cssText) && cssText.indexOf(rule.split(' ')[0]) === 0;
        });

        return bool;
    };
    /*>>fontface*/

    // CSS generated content detection
    tests['generatedcontent'] = function() {
        var bool;

        injectElementWithStyles(['#',mod,'{font:0/0 a}#',mod,':after{content:"',smile,'";visibility:hidden;font:3px/1 a}'].join(''), function( node ) {
          bool = node.offsetHeight >= 3;
        });

        return bool;
    };



    // These tests evaluate support of the video/audio elements, as well as
    // testing what types of content they support.
    //
    // We're using the Boolean constructor here, so that we can extend the value
    // e.g.  Modernizr.video     // true
    //       Modernizr.video.ogg // 'probably'
    //
    // Codec values from : github.com/NielsLeenheer/html5test/blob/9106a8/index.html#L845
    //                     thx to NielsLeenheer and zcorpan

    // Note: in some older browsers, "no" was a return value instead of empty string.
    //   It was live in FF3.5.0 and 3.5.1, but fixed in 3.5.2
    //   It was also live in Safari 4.0.0 - 4.0.4, but fixed in 4.0.5

    tests['video'] = function() {
        var elem = document.createElement('video'),
            bool = false;

        // IE9 Running on Windows Server SKU can cause an exception to be thrown, bug #224
        try {
            if ( bool = !!elem.canPlayType ) {
                bool      = new Boolean(bool);
                bool.ogg  = elem.canPlayType('video/ogg; codecs="theora"')      .replace(/^no$/,'');

                // Without QuickTime, this value will be `undefined`. github.com/Modernizr/Modernizr/issues/546
                bool.h264 = elem.canPlayType('video/mp4; codecs="avc1.42E01E"') .replace(/^no$/,'');

                bool.webm = elem.canPlayType('video/webm; codecs="vp8, vorbis"').replace(/^no$/,'');
            }

        } catch(e) { }

        return bool;
    };

    tests['audio'] = function() {
        var elem = document.createElement('audio'),
            bool = false;

        try {
            if ( bool = !!elem.canPlayType ) {
                bool      = new Boolean(bool);
                bool.ogg  = elem.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/,'');
                bool.mp3  = elem.canPlayType('audio/mpeg;')               .replace(/^no$/,'');

                // Mimetypes accepted:
                //   developer.mozilla.org/En/Media_formats_supported_by_the_audio_and_video_elements
                //   bit.ly/iphoneoscodecs
                bool.wav  = elem.canPlayType('audio/wav; codecs="1"')     .replace(/^no$/,'');
                bool.m4a  = ( elem.canPlayType('audio/x-m4a;')            ||
                              elem.canPlayType('audio/aac;'))             .replace(/^no$/,'');
            }
        } catch(e) { }

        return bool;
    };


    // In FF4, if disabled, window.localStorage should === null.

    // Normally, we could not test that directly and need to do a
    //   `('localStorage' in window) && ` test first because otherwise Firefox will
    //   throw bugzil.la/365772 if cookies are disabled

    // Also in iOS5 Private Browsing mode, attempting to use localStorage.setItem
    // will throw the exception:
    //   QUOTA_EXCEEDED_ERRROR DOM Exception 22.
    // Peculiarly, getItem and removeItem calls do not throw.

    // Because we are forced to try/catch this, we'll go aggressive.

    // Just FWIW: IE8 Compat mode supports these features completely:
    //   www.quirksmode.org/dom/html5.html
    // But IE8 doesn't support either with local files

    tests['localstorage'] = function() {
        try {
            localStorage.setItem(mod, mod);
            localStorage.removeItem(mod);
            return true;
        } catch(e) {
            return false;
        }
    };

    tests['sessionstorage'] = function() {
        try {
            sessionStorage.setItem(mod, mod);
            sessionStorage.removeItem(mod);
            return true;
        } catch(e) {
            return false;
        }
    };


    tests['webworkers'] = function() {
        return !!window.Worker;
    };


    tests['applicationcache'] = function() {
        return !!window.applicationCache;
    };


    // Thanks to Erik Dahlstrom
    tests['svg'] = function() {
        return !!document.createElementNS && !!document.createElementNS(ns.svg, 'svg').createSVGRect;
    };

    // specifically for SVG inline in HTML, not within XHTML
    // test page: paulirish.com/demo/inline-svg
    tests['inlinesvg'] = function() {
      var div = document.createElement('div');
      div.innerHTML = '<svg/>';
      return (div.firstChild && div.firstChild.namespaceURI) == ns.svg;
    };

    // SVG SMIL animation
    tests['smil'] = function() {
        return !!document.createElementNS && /SVGAnimate/.test(toString.call(document.createElementNS(ns.svg, 'animate')));
    };

    // This test is only for clip paths in SVG proper, not clip paths on HTML content
    // demo: srufaculty.sru.edu/david.dailey/svg/newstuff/clipPath4.svg

    // However read the comments to dig into applying SVG clippaths to HTML content here:
    //   github.com/Modernizr/Modernizr/issues/213#issuecomment-1149491
    tests['svgclippaths'] = function() {
        return !!document.createElementNS && /SVGClipPath/.test(toString.call(document.createElementNS(ns.svg, 'clipPath')));
    };

    /*>>webforms*/
    // input features and input types go directly onto the ret object, bypassing the tests loop.
    // Hold this guy to execute in a moment.
    function webforms() {
        /*>>input*/
        // Run through HTML5's new input attributes to see if the UA understands any.
        // We're using f which is the <input> element created early on
        // Mike Taylr has created a comprehensive resource for testing these attributes
        //   when applied to all input types:
        //   miketaylr.com/code/input-type-attr.html
        // spec: www.whatwg.org/specs/web-apps/current-work/multipage/the-input-element.html#input-type-attr-summary

        // Only input placeholder is tested while textarea's placeholder is not.
        // Currently Safari 4 and Opera 11 have support only for the input placeholder
        // Both tests are available in feature-detects/forms-placeholder.js
        Modernizr['input'] = (function( props ) {
            for ( var i = 0, len = props.length; i < len; i++ ) {
                attrs[ props[i] ] = !!(props[i] in inputElem);
            }
            if (attrs.list){
              // safari false positive's on datalist: webk.it/74252
              // see also github.com/Modernizr/Modernizr/issues/146
              attrs.list = !!(document.createElement('datalist') && window.HTMLDataListElement);
            }
            return attrs;
        })('autocomplete autofocus list placeholder max min multiple pattern required step'.split(' '));
        /*>>input*/

        /*>>inputtypes*/
        // Run through HTML5's new input types to see if the UA understands any.
        //   This is put behind the tests runloop because it doesn't return a
        //   true/false like all the other tests; instead, it returns an object
        //   containing each input type with its corresponding true/false value

        // Big thanks to @miketaylr for the html5 forms expertise. miketaylr.com/
        Modernizr['inputtypes'] = (function(props) {

            for ( var i = 0, bool, inputElemType, defaultView, len = props.length; i < len; i++ ) {

                inputElem.setAttribute('type', inputElemType = props[i]);
                bool = inputElem.type !== 'text';

                // We first check to see if the type we give it sticks..
                // If the type does, we feed it a textual value, which shouldn't be valid.
                // If the value doesn't stick, we know there's input sanitization which infers a custom UI
                if ( bool ) {

                    inputElem.value         = smile;
                    inputElem.style.cssText = 'position:absolute;visibility:hidden;';

                    if ( /^range$/.test(inputElemType) && inputElem.style.WebkitAppearance !== undefined ) {

                      docElement.appendChild(inputElem);
                      defaultView = document.defaultView;

                      // Safari 2-4 allows the smiley as a value, despite making a slider
                      bool =  defaultView.getComputedStyle &&
                              defaultView.getComputedStyle(inputElem, null).WebkitAppearance !== 'textfield' &&
                              // Mobile android web browser has false positive, so must
                              // check the height to see if the widget is actually there.
                              (inputElem.offsetHeight !== 0);

                      docElement.removeChild(inputElem);

                    } else if ( /^(search|tel)$/.test(inputElemType) ){
                      // Spec doesn't define any special parsing or detectable UI
                      //   behaviors so we pass these through as true

                      // Interestingly, opera fails the earlier test, so it doesn't
                      //  even make it here.

                    } else if ( /^(url|email)$/.test(inputElemType) ) {
                      // Real url and email support comes with prebaked validation.
                      bool = inputElem.checkValidity && inputElem.checkValidity() === false;

                    } else {
                      // If the upgraded input compontent rejects the :) text, we got a winner
                      bool = inputElem.value != smile;
                    }
                }

                inputs[ props[i] ] = !!bool;
            }
            return inputs;
        })('search tel url email datetime date month week time datetime-local number range color'.split(' '));
        /*>>inputtypes*/
    }
    /*>>webforms*/


    // End of test definitions
    // -----------------------



    // Run through all tests and detect their support in the current UA.
    // todo: hypothetically we could be doing an array of tests and use a basic loop here.
    for ( var feature in tests ) {
        if ( hasOwnProp(tests, feature) ) {
            // run the test, throw the return value into the Modernizr,
            //   then based on that boolean, define an appropriate className
            //   and push it into an array of classes we'll join later.
            featureName  = feature.toLowerCase();
            Modernizr[featureName] = tests[feature]();

            classes.push((Modernizr[featureName] ? '' : 'no-') + featureName);
        }
    }

    /*>>webforms*/
    // input tests need to run.
    Modernizr.input || webforms();
    /*>>webforms*/


    /**
     * addTest allows the user to define their own feature tests
     * the result will be added onto the Modernizr object,
     * as well as an appropriate className set on the html element
     *
     * @param feature - String naming the feature
     * @param test - Function returning true if feature is supported, false if not
     */
     Modernizr.addTest = function ( feature, test ) {
       if ( typeof feature == 'object' ) {
         for ( var key in feature ) {
           if ( hasOwnProp( feature, key ) ) {
             Modernizr.addTest( key, feature[ key ] );
           }
         }
       } else {

         feature = feature.toLowerCase();

         if ( Modernizr[feature] !== undefined ) {
           // we're going to quit if you're trying to overwrite an existing test
           // if we were to allow it, we'd do this:
           //   var re = new RegExp("\\b(no-)?" + feature + "\\b");
           //   docElement.className = docElement.className.replace( re, '' );
           // but, no rly, stuff 'em.
           return Modernizr;
         }

         test = typeof test == 'function' ? test() : test;

         if (typeof enableClasses !== "undefined" && enableClasses) {
           docElement.className += ' ' + (test ? '' : 'no-') + feature;
         }
         Modernizr[feature] = test;

       }

       return Modernizr; // allow chaining.
     };


    // Reset modElem.cssText to nothing to reduce memory footprint.
    setCss('');
    modElem = inputElem = null;

    /*>>shiv*/
    /*! HTML5 Shiv v3.6.1 | @afarkas @jdalton @jon_neal @rem | MIT/GPL2 Licensed */
    ;(function(window, document) {
    /*jshint evil:true */
      /** Preset options */
      var options = window.html5 || {};

      /** Used to skip problem elements */
      var reSkip = /^<|^(?:button|map|select|textarea|object|iframe|option|optgroup)$/i;

      /** Not all elements can be cloned in IE **/
      var saveClones = /^(?:a|b|code|div|fieldset|h1|h2|h3|h4|h5|h6|i|label|li|ol|p|q|span|strong|style|table|tbody|td|th|tr|ul)$/i;

      /** Detect whether the browser supports default html5 styles */
      var supportsHtml5Styles;

      /** Name of the expando, to work with multiple documents or to re-shiv one document */
      var expando = '_html5shiv';

      /** The id for the the documents expando */
      var expanID = 0;

      /** Cached data for each document */
      var expandoData = {};

      /** Detect whether the browser supports unknown elements */
      var supportsUnknownElements;

      (function() {
        try {
            var a = document.createElement('a');
            a.innerHTML = '<xyz></xyz>';
            //if the hidden property is implemented we can assume, that the browser supports basic HTML5 Styles
            supportsHtml5Styles = ('hidden' in a);

            supportsUnknownElements = a.childNodes.length == 1 || (function() {
              // assign a false positive if unable to shiv
              (document.createElement)('a');
              var frag = document.createDocumentFragment();
              return (
                typeof frag.cloneNode == 'undefined' ||
                typeof frag.createDocumentFragment == 'undefined' ||
                typeof frag.createElement == 'undefined'
              );
            }());
        } catch(e) {
          supportsHtml5Styles = true;
          supportsUnknownElements = true;
        }

      }());

      /*--------------------------------------------------------------------------*/

      /**
       * Creates a style sheet with the given CSS text and adds it to the document.
       * @private
       * @param {Document} ownerDocument The document.
       * @param {String} cssText The CSS text.
       * @returns {StyleSheet} The style element.
       */
      function addStyleSheet(ownerDocument, cssText) {
        var p = ownerDocument.createElement('p'),
            parent = ownerDocument.getElementsByTagName('head')[0] || ownerDocument.documentElement;

        p.innerHTML = 'x<style>' + cssText + '</style>';
        return parent.insertBefore(p.lastChild, parent.firstChild);
      }

      /**
       * Returns the value of `html5.elements` as an array.
       * @private
       * @returns {Array} An array of shived element node names.
       */
      function getElements() {
        var elements = html5.elements;
        return typeof elements == 'string' ? elements.split(' ') : elements;
      }

        /**
       * Returns the data associated to the given document
       * @private
       * @param {Document} ownerDocument The document.
       * @returns {Object} An object of data.
       */
      function getExpandoData(ownerDocument) {
        var data = expandoData[ownerDocument[expando]];
        if (!data) {
            data = {};
            expanID++;
            ownerDocument[expando] = expanID;
            expandoData[expanID] = data;
        }
        return data;
      }

      /**
       * returns a shived element for the given nodeName and document
       * @memberOf html5
       * @param {String} nodeName name of the element
       * @param {Document} ownerDocument The context document.
       * @returns {Object} The shived element.
       */
      function createElement(nodeName, ownerDocument, data){
        if (!ownerDocument) {
            ownerDocument = document;
        }
        if(supportsUnknownElements){
            return ownerDocument.createElement(nodeName);
        }
        if (!data) {
            data = getExpandoData(ownerDocument);
        }
        var node;

        if (data.cache[nodeName]) {
            node = data.cache[nodeName].cloneNode();
        } else if (saveClones.test(nodeName)) {
            node = (data.cache[nodeName] = data.createElem(nodeName)).cloneNode();
        } else {
            node = data.createElem(nodeName);
        }

        // Avoid adding some elements to fragments in IE < 9 because
        // * Attributes like `name` or `type` cannot be set/changed once an element
        //   is inserted into a document/fragment
        // * Link elements with `src` attributes that are inaccessible, as with
        //   a 403 response, will cause the tab/window to crash
        // * Script elements appended to fragments will execute when their `src`
        //   or `text` property is set
        return node.canHaveChildren && !reSkip.test(nodeName) ? data.frag.appendChild(node) : node;
      }

      /**
       * returns a shived DocumentFragment for the given document
       * @memberOf html5
       * @param {Document} ownerDocument The context document.
       * @returns {Object} The shived DocumentFragment.
       */
      function createDocumentFragment(ownerDocument, data){
        if (!ownerDocument) {
            ownerDocument = document;
        }
        if(supportsUnknownElements){
            return ownerDocument.createDocumentFragment();
        }
        data = data || getExpandoData(ownerDocument);
        var clone = data.frag.cloneNode(),
            i = 0,
            elems = getElements(),
            l = elems.length;
        for(;i<l;i++){
            clone.createElement(elems[i]);
        }
        return clone;
      }

      /**
       * Shivs the `createElement` and `createDocumentFragment` methods of the document.
       * @private
       * @param {Document|DocumentFragment} ownerDocument The document.
       * @param {Object} data of the document.
       */
      function shivMethods(ownerDocument, data) {
        if (!data.cache) {
            data.cache = {};
            data.createElem = ownerDocument.createElement;
            data.createFrag = ownerDocument.createDocumentFragment;
            data.frag = data.createFrag();
        }


        ownerDocument.createElement = function(nodeName) {
          //abort shiv
          if (!html5.shivMethods) {
              return data.createElem(nodeName);
          }
          return createElement(nodeName, ownerDocument, data);
        };

        ownerDocument.createDocumentFragment = Function('h,f', 'return function(){' +
          'var n=f.cloneNode(),c=n.createElement;' +
          'h.shivMethods&&(' +
            // unroll the `createElement` calls
            getElements().join().replace(/\w+/g, function(nodeName) {
              data.createElem(nodeName);
              data.frag.createElement(nodeName);
              return 'c("' + nodeName + '")';
            }) +
          ');return n}'
        )(html5, data.frag);
      }

      /*--------------------------------------------------------------------------*/

      /**
       * Shivs the given document.
       * @memberOf html5
       * @param {Document} ownerDocument The document to shiv.
       * @returns {Document} The shived document.
       */
      function shivDocument(ownerDocument) {
        if (!ownerDocument) {
            ownerDocument = document;
        }
        var data = getExpandoData(ownerDocument);

        if (html5.shivCSS && !supportsHtml5Styles && !data.hasCSS) {
          data.hasCSS = !!addStyleSheet(ownerDocument,
            // corrects block display not defined in IE6/7/8/9
            'article,aside,figcaption,figure,footer,header,hgroup,nav,section{display:block}' +
            // adds styling not present in IE6/7/8/9
            'mark{background:#FF0;color:#000}'
          );
        }
        if (!supportsUnknownElements) {
          shivMethods(ownerDocument, data);
        }
        return ownerDocument;
      }

      /*--------------------------------------------------------------------------*/

      /**
       * The `html5` object is exposed so that more elements can be shived and
       * existing shiving can be detected on iframes.
       * @type Object
       * @example
       *
       * // options can be changed before the script is included
       * html5 = { 'elements': 'mark section', 'shivCSS': false, 'shivMethods': false };
       */
      var html5 = {

        /**
         * An array or space separated string of node names of the elements to shiv.
         * @memberOf html5
         * @type Array|String
         */
        'elements': options.elements || 'abbr article aside audio bdi canvas data datalist details figcaption figure footer header hgroup mark meter nav output progress section summary time video',

        /**
         * A flag to indicate that the HTML5 style sheet should be inserted.
         * @memberOf html5
         * @type Boolean
         */
        'shivCSS': (options.shivCSS !== false),

        /**
         * Is equal to true if a browser supports creating unknown/HTML5 elements
         * @memberOf html5
         * @type boolean
         */
        'supportsUnknownElements': supportsUnknownElements,

        /**
         * A flag to indicate that the document's `createElement` and `createDocumentFragment`
         * methods should be overwritten.
         * @memberOf html5
         * @type Boolean
         */
        'shivMethods': (options.shivMethods !== false),

        /**
         * A string to describe the type of `html5` object ("default" or "default print").
         * @memberOf html5
         * @type String
         */
        'type': 'default',

        // shivs the document according to the specified `html5` object options
        'shivDocument': shivDocument,

        //creates a shived element
        createElement: createElement,

        //creates a shived documentFragment
        createDocumentFragment: createDocumentFragment
      };

      /*--------------------------------------------------------------------------*/

      // expose html5
      window.html5 = html5;

      // shiv the document
      shivDocument(document);

    }(this, document));
    /*>>shiv*/

    // Assign private properties to the return object with prefix
    Modernizr._version      = version;

    // expose these for the plugin API. Look in the source for how to join() them against your input
    /*>>prefixes*/
    Modernizr._prefixes     = prefixes;
    /*>>prefixes*/
    /*>>domprefixes*/
    Modernizr._domPrefixes  = domPrefixes;
    Modernizr._cssomPrefixes  = cssomPrefixes;
    /*>>domprefixes*/

    /*>>mq*/
    // Modernizr.mq tests a given media query, live against the current state of the window
    // A few important notes:
    //   * If a browser does not support media queries at all (eg. oldIE) the mq() will always return false
    //   * A max-width or orientation query will be evaluated against the current state, which may change later.
    //   * You must specify values. Eg. If you are testing support for the min-width media query use:
    //       Modernizr.mq('(min-width:0)')
    // usage:
    // Modernizr.mq('only screen and (max-width:768)')
    Modernizr.mq            = testMediaQuery;
    /*>>mq*/

    /*>>hasevent*/
    // Modernizr.hasEvent() detects support for a given event, with an optional element to test on
    // Modernizr.hasEvent('gesturestart', elem)
    Modernizr.hasEvent      = isEventSupported;
    /*>>hasevent*/

    /*>>testprop*/
    // Modernizr.testProp() investigates whether a given style property is recognized
    // Note that the property names must be provided in the camelCase variant.
    // Modernizr.testProp('pointerEvents')
    Modernizr.testProp      = function(prop){
        return testProps([prop]);
    };
    /*>>testprop*/

    /*>>testallprops*/
    // Modernizr.testAllProps() investigates whether a given style property,
    //   or any of its vendor-prefixed variants, is recognized
    // Note that the property names must be provided in the camelCase variant.
    // Modernizr.testAllProps('boxSizing')
    Modernizr.testAllProps  = testPropsAll;
    /*>>testallprops*/


    /*>>teststyles*/
    // Modernizr.testStyles() allows you to add custom styles to the document and test an element afterwards
    // Modernizr.testStyles('#modernizr { position:absolute }', function(elem, rule){ ... })
    Modernizr.testStyles    = injectElementWithStyles;
    /*>>teststyles*/


    /*>>prefixed*/
    // Modernizr.prefixed() returns the prefixed or nonprefixed property name variant of your input
    // Modernizr.prefixed('boxSizing') // 'MozBoxSizing'

    // Properties must be passed as dom-style camelcase, rather than `box-sizing` hypentated style.
    // Return values will also be the camelCase variant, if you need to translate that to hypenated style use:
    //
    //     str.replace(/([A-Z])/g, function(str,m1){ return '-' + m1.toLowerCase(); }).replace(/^ms-/,'-ms-');

    // If you're trying to ascertain which transition end event to bind to, you might do something like...
    //
    //     var transEndEventNames = {
    //       'WebkitTransition' : 'webkitTransitionEnd',
    //       'MozTransition'    : 'transitionend',
    //       'OTransition'      : 'oTransitionEnd',
    //       'msTransition'     : 'MSTransitionEnd',
    //       'transition'       : 'transitionend'
    //     },
    //     transEndEventName = transEndEventNames[ Modernizr.prefixed('transition') ];

    Modernizr.prefixed      = function(prop, obj, elem){
      if(!obj) {
        return testPropsAll(prop, 'pfx');
      } else {
        // Testing DOM property e.g. Modernizr.prefixed('requestAnimationFrame', window) // 'mozRequestAnimationFrame'
        return testPropsAll(prop, obj, elem);
      }
    };
    /*>>prefixed*/


    /*>>cssclasses*/
    // Remove "no-js" class from <html> element, if it exists:
    docElement.className = docElement.className.replace(/(^|\s)no-js(\s|$)/, '$1$2') +

                            // Add the new classes to the <html> element.
                            (enableClasses ? ' js ' + classes.join(' ') : '');
    /*>>cssclasses*/

    return Modernizr;

})(this, this.document);

define('modernizr', ['modernizr/modernizr-2.6.2'], function (main) { return main; });

define("modernizr/modernizr-2.6.2", function(){});

/*!
 * jQuery JavaScript Library v1.8.3
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: Tue Nov 13 2012 08:20:33 GMT-0500 (Eastern Standard Time)
 */
(function( window, undefined ) {
var
	// A central reference to the root jQuery(document)
	rootjQuery,

	// The deferred used on DOM ready
	readyList,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,
	location = window.location,
	navigator = window.navigator,

	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$,

	// Save a reference to some core methods
	core_push = Array.prototype.push,
	core_slice = Array.prototype.slice,
	core_indexOf = Array.prototype.indexOf,
	core_toString = Object.prototype.toString,
	core_hasOwn = Object.prototype.hasOwnProperty,
	core_trim = String.prototype.trim,

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		return new jQuery.fn.init( selector, context, rootjQuery );
	},

	// Used for matching numbers
	core_pnum = /[\-+]?(?:\d*\.|)\d+(?:[eE][\-+]?\d+|)/.source,

	// Used for detecting and trimming whitespace
	core_rnotwhite = /\S/,
	core_rspace = /\s+/,

	// Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	rquickExpr = /^(?:[^#<]*(<[\w\W]+>)[^>]*$|#([\w\-]*)$)/,

	// Match a standalone tag
	rsingleTag = /^<(\w+)\s*\/?>(?:<\/\1>|)$/,

	// JSON RegExp
	rvalidchars = /^[\],:{}\s]*$/,
	rvalidbraces = /(?:^|:|,)(?:\s*\[)+/g,
	rvalidescape = /\\(?:["\\\/bfnrt]|u[\da-fA-F]{4})/g,
	rvalidtokens = /"[^"\\\r\n]*"|true|false|null|-?(?:\d\d*\.|)\d+(?:[eE][\-+]?\d+|)/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return ( letter + "" ).toUpperCase();
	},

	// The ready event handler and self cleanup method
	DOMContentLoaded = function() {
		if ( document.addEventListener ) {
			document.removeEventListener( "DOMContentLoaded", DOMContentLoaded, false );
			jQuery.ready();
		} else if ( document.readyState === "complete" ) {
			// we're here because readyState === "complete" in oldIE
			// which is good enough for us to call the dom ready!
			document.detachEvent( "onreadystatechange", DOMContentLoaded );
			jQuery.ready();
		}
	},

	// [[Class]] -> type pairs
	class2type = {};

jQuery.fn = jQuery.prototype = {
	constructor: jQuery,
	init: function( selector, context, rootjQuery ) {
		var match, elem, ret, doc;

		// Handle $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle $(DOMElement)
		if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;
					doc = ( context && context.nodeType ? context.ownerDocument || context : document );

					// scripts is true for back-compat
					selector = jQuery.parseHTML( match[1], doc, true );
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						this.attr.call( selector, context, true );
					}

					return jQuery.merge( this, selector );

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return rootjQuery.ready( selector );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	},

	// Start with an empty selector
	selector: "",

	// The current version of jQuery being used
	jquery: "1.8.3",

	// The default length of a jQuery object is 0
	length: 0,

	// The number of elements contained in the matched element set
	size: function() {
		return this.length;
	},

	toArray: function() {
		return core_slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num == null ?

			// Return a 'clean' array
			this.toArray() :

			// Return just the object
			( num < 0 ? this[ this.length + num ] : this[ num ] );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems, name, selector ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;

		ret.context = this.context;

		if ( name === "find" ) {
			ret.selector = this.selector + ( this.selector ? " " : "" ) + selector;
		} else if ( name ) {
			ret.selector = this.selector + "." + name + "(" + selector + ")";
		}

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	ready: function( fn ) {
		// Add the callback
		jQuery.ready.promise().done( fn );

		return this;
	},

	eq: function( i ) {
		i = +i;
		return i === -1 ?
			this.slice( i ) :
			this.slice( i, i + 1 );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	slice: function() {
		return this.pushStack( core_slice.apply( this, arguments ),
			"slice", core_slice.call(arguments).join(",") );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: core_push,
	sort: [].sort,
	splice: [].splice
};

// Give the init function the jQuery prototype for later instantiation
jQuery.fn.init.prototype = jQuery.fn;

jQuery.extend = jQuery.fn.extend = function() {
	var options, name, src, copy, copyIsArray, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;
		target = arguments[1] || {};
		// skip the boolean and the target
		i = 2;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( length === i ) {
		target = this;
		--i;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	noConflict: function( deep ) {
		if ( window.$ === jQuery ) {
			window.$ = _$;
		}

		if ( deep && window.jQuery === jQuery ) {
			window.jQuery = _jQuery;
		}

		return jQuery;
	},

	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready, 1 );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		return !isNaN( parseFloat(obj) ) && isFinite( obj );
	},

	type: function( obj ) {
		return obj == null ?
			String( obj ) :
			class2type[ core_toString.call(obj) ] || "object";
	},

	isPlainObject: function( obj ) {
		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!core_hasOwn.call(obj, "constructor") &&
				!core_hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.

		var key;
		for ( key in obj ) {}

		return key === undefined || core_hasOwn.call( obj, key );
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	error: function( msg ) {
		throw new Error( msg );
	},

	// data: string of html
	// context (optional): If specified, the fragment will be created in this context, defaults to document
	// scripts (optional): If true, will include scripts passed in the html string
	parseHTML: function( data, context, scripts ) {
		var parsed;
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		if ( typeof context === "boolean" ) {
			scripts = context;
			context = 0;
		}
		context = context || document;

		// Single tag
		if ( (parsed = rsingleTag.exec( data )) ) {
			return [ context.createElement( parsed[1] ) ];
		}

		parsed = jQuery.buildFragment( [ data ], context, scripts ? null : [] );
		return jQuery.merge( [],
			(parsed.cacheable ? jQuery.clone( parsed.fragment ) : parsed.fragment).childNodes );
	},

	parseJSON: function( data ) {
		if ( !data || typeof data !== "string") {
			return null;
		}

		// Make sure leading/trailing whitespace is removed (IE can't handle it)
		data = jQuery.trim( data );

		// Attempt to parse using the native JSON parser first
		if ( window.JSON && window.JSON.parse ) {
			return window.JSON.parse( data );
		}

		// Make sure the incoming data is actual JSON
		// Logic borrowed from http://json.org/json2.js
		if ( rvalidchars.test( data.replace( rvalidescape, "@" )
			.replace( rvalidtokens, "]" )
			.replace( rvalidbraces, "")) ) {

			return ( new Function( "return " + data ) )();

		}
		jQuery.error( "Invalid JSON: " + data );
	},

	// Cross-browser xml parsing
	parseXML: function( data ) {
		var xml, tmp;
		if ( !data || typeof data !== "string" ) {
			return null;
		}
		try {
			if ( window.DOMParser ) { // Standard
				tmp = new DOMParser();
				xml = tmp.parseFromString( data , "text/xml" );
			} else { // IE
				xml = new ActiveXObject( "Microsoft.XMLDOM" );
				xml.async = "false";
				xml.loadXML( data );
			}
		} catch( e ) {
			xml = undefined;
		}
		if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
			jQuery.error( "Invalid XML: " + data );
		}
		return xml;
	},

	noop: function() {},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && core_rnotwhite.test( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var name,
			i = 0,
			length = obj.length,
			isObj = length === undefined || jQuery.isFunction( obj );

		if ( args ) {
			if ( isObj ) {
				for ( name in obj ) {
					if ( callback.apply( obj[ name ], args ) === false ) {
						break;
					}
				}
			} else {
				for ( ; i < length; ) {
					if ( callback.apply( obj[ i++ ], args ) === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isObj ) {
				for ( name in obj ) {
					if ( callback.call( obj[ name ], name, obj[ name ] ) === false ) {
						break;
					}
				}
			} else {
				for ( ; i < length; ) {
					if ( callback.call( obj[ i ], i, obj[ i++ ] ) === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Use native String.trim function wherever possible
	trim: core_trim && !core_trim.call("\uFEFF\xA0") ?
		function( text ) {
			return text == null ?
				"" :
				core_trim.call( text );
		} :

		// Otherwise use our own trimming functionality
		function( text ) {
			return text == null ?
				"" :
				( text + "" ).replace( rtrim, "" );
		},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var type,
			ret = results || [];

		if ( arr != null ) {
			// The window, strings (and functions) also have 'length'
			// Tweaked logic slightly to handle Blackberry 4.7 RegExp issues #6930
			type = jQuery.type( arr );

			if ( arr.length == null || type === "string" || type === "function" || type === "regexp" || jQuery.isWindow( arr ) ) {
				core_push.call( ret, arr );
			} else {
				jQuery.merge( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( core_indexOf ) {
				return core_indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var l = second.length,
			i = first.length,
			j = 0;

		if ( typeof l === "number" ) {
			for ( ; j < l; j++ ) {
				first[ i++ ] = second[ j ];
			}

		} else {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, inv ) {
		var retVal,
			ret = [],
			i = 0,
			length = elems.length;
		inv = !!inv;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			retVal = !!callback( elems[ i ], i );
			if ( inv !== retVal ) {
				ret.push( elems[ i ] );
			}
		}

		return ret;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value, key,
			ret = [],
			i = 0,
			length = elems.length,
			// jquery objects are treated as arrays
			isArray = elems instanceof jQuery || length !== undefined && typeof length === "number" && ( ( length > 0 && elems[ 0 ] && elems[ length -1 ] ) || length === 0 || jQuery.isArray( elems ) ) ;

		// Go through the array, translating each of the items to their
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}

		// Go through every key on the object,
		} else {
			for ( key in elems ) {
				value = callback( elems[ key ], key, arg );

				if ( value != null ) {
					ret[ ret.length ] = value;
				}
			}
		}

		// Flatten any nested arrays
		return ret.concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var tmp, args, proxy;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = core_slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context, args.concat( core_slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	// Multifunctional method to get and set values of a collection
	// The value/s can optionally be executed if it's a function
	access: function( elems, fn, key, value, chainable, emptyGet, pass ) {
		var exec,
			bulk = key == null,
			i = 0,
			length = elems.length;

		// Sets many values
		if ( key && typeof key === "object" ) {
			for ( i in key ) {
				jQuery.access( elems, fn, i, key[i], 1, emptyGet, value );
			}
			chainable = 1;

		// Sets one value
		} else if ( value !== undefined ) {
			// Optionally, function values get executed if exec is true
			exec = pass === undefined && jQuery.isFunction( value );

			if ( bulk ) {
				// Bulk operations only iterate when executing function values
				if ( exec ) {
					exec = fn;
					fn = function( elem, key, value ) {
						return exec.call( jQuery( elem ), value );
					};

				// Otherwise they run against the entire set
				} else {
					fn.call( elems, value );
					fn = null;
				}
			}

			if ( fn ) {
				for (; i < length; i++ ) {
					fn( elems[i], key, exec ? value.call( elems[i], i, fn( elems[i], key ) ) : value, pass );
				}
			}

			chainable = 1;
		}

		return chainable ?
			elems :

			// Gets
			bulk ?
				fn.call( elems ) :
				length ? fn( elems[0], key ) : emptyGet;
	},

	now: function() {
		return ( new Date() ).getTime();
	}
});

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready, 1 );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", DOMContentLoaded, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", jQuery.ready, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", DOMContentLoaded );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", jQuery.ready );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

// All jQuery objects should point back to these
rootjQuery = jQuery(document);
// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.split( core_rspace ), function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// Flag to know if list is currently firing
		firing,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Control if a given callback is in the list
			has: function( fn ) {
				return jQuery.inArray( fn, list ) > -1;
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				args = args || [];
				args = [ context, args.slice ? args.slice() : args ];
				if ( list && ( !fired || stack ) ) {
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};
jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var action = tuple[ 0 ],
								fn = fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ]( jQuery.isFunction( fn ) ?
								function() {
									var returned = fn.apply( this, arguments );
									if ( returned && jQuery.isFunction( returned.promise ) ) {
										returned.promise()
											.done( newDefer.resolve )
											.fail( newDefer.reject )
											.progress( newDefer.notify );
									} else {
										newDefer[ action + "With" ]( this === deferred ? newDefer : this, [ returned ] );
									}
								} :
								newDefer[ action ]
							);
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ] = list.fire
			deferred[ tuple[0] ] = list.fire;
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = core_slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? core_slice.call( arguments ) : value;
					if( values === progressValues ) {
						deferred.notifyWith( contexts, values );
					} else if ( !( --remaining ) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});
jQuery.support = (function() {

	var support,
		all,
		a,
		select,
		opt,
		input,
		fragment,
		eventName,
		i,
		isSupported,
		clickFn,
		div = document.createElement("div");

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

	// Support tests won't run in some limited or non-browser environments
	all = div.getElementsByTagName("*");
	a = div.getElementsByTagName("a")[ 0 ];
	if ( !all || !a || !all.length ) {
		return {};
	}

	// First batch of tests
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	a.style.cssText = "top:1px;float:left;opacity:.5";
	support = {
		// IE strips leading whitespace when .innerHTML is used
		leadingWhitespace: ( div.firstChild.nodeType === 3 ),

		// Make sure that tbody elements aren't automatically inserted
		// IE will insert them into empty tables
		tbody: !div.getElementsByTagName("tbody").length,

		// Make sure that link elements get serialized correctly by innerHTML
		// This requires a wrapper element in IE
		htmlSerialize: !!div.getElementsByTagName("link").length,

		// Get the style information from getAttribute
		// (IE uses .cssText instead)
		style: /top/.test( a.getAttribute("style") ),

		// Make sure that URLs aren't manipulated
		// (IE normalizes it by default)
		hrefNormalized: ( a.getAttribute("href") === "/a" ),

		// Make sure that element opacity exists
		// (IE uses filter instead)
		// Use a regex to work around a WebKit issue. See #5145
		opacity: /^0.5/.test( a.style.opacity ),

		// Verify style float existence
		// (IE uses styleFloat instead of cssFloat)
		cssFloat: !!a.style.cssFloat,

		// Make sure that if no value is specified for a checkbox
		// that it defaults to "on".
		// (WebKit defaults to "" instead)
		checkOn: ( input.value === "on" ),

		// Make sure that a selected-by-default option has a working selected property.
		// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
		optSelected: opt.selected,

		// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
		getSetAttribute: div.className !== "t",

		// Tests for enctype support on a form (#6743)
		enctype: !!document.createElement("form").enctype,

		// Makes sure cloning an html5 element does not cause problems
		// Where outerHTML is undefined, this still works
		html5Clone: document.createElement("nav").cloneNode( true ).outerHTML !== "<:nav></:nav>",

		// jQuery.support.boxModel DEPRECATED in 1.8 since we don't support Quirks Mode
		boxModel: ( document.compatMode === "CSS1Compat" ),

		// Will be defined later
		submitBubbles: true,
		changeBubbles: true,
		focusinBubbles: false,
		deleteExpando: true,
		noCloneEvent: true,
		inlineBlockNeedsLayout: false,
		shrinkWrapBlocks: false,
		reliableMarginRight: true,
		boxSizingReliable: true,
		pixelPosition: false
	};

	// Make sure checked status is properly cloned
	input.checked = true;
	support.noCloneChecked = input.cloneNode( true ).checked;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Test to see if it's possible to delete an expando from an element
	// Fails in Internet Explorer
	try {
		delete div.test;
	} catch( e ) {
		support.deleteExpando = false;
	}

	if ( !div.addEventListener && div.attachEvent && div.fireEvent ) {
		div.attachEvent( "onclick", clickFn = function() {
			// Cloning a node shouldn't copy over any
			// bound event handlers (IE does this)
			support.noCloneEvent = false;
		});
		div.cloneNode( true ).fireEvent("onclick");
		div.detachEvent( "onclick", clickFn );
	}

	// Check if a radio maintains its value
	// after being appended to the DOM
	input = document.createElement("input");
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";

	input.setAttribute( "checked", "checked" );

	// #11217 - WebKit loses check when the name is after the checked attribute
	input.setAttribute( "name", "t" );

	div.appendChild( input );
	fragment = document.createDocumentFragment();
	fragment.appendChild( div.lastChild );

	// WebKit doesn't clone checked state correctly in fragments
	support.checkClone = fragment.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	support.appendChecked = input.checked;

	fragment.removeChild( input );
	fragment.appendChild( div );

	// Technique from Juriy Zaytsev
	// http://perfectionkills.com/detecting-event-support-without-browser-sniffing/
	// We only care about the case where non-standard event systems
	// are used, namely in IE. Short-circuiting here helps us to
	// avoid an eval call (in setAttribute) which can cause CSP
	// to go haywire. See: https://developer.mozilla.org/en/Security/CSP
	if ( div.attachEvent ) {
		for ( i in {
			submit: true,
			change: true,
			focusin: true
		}) {
			eventName = "on" + i;
			isSupported = ( eventName in div );
			if ( !isSupported ) {
				div.setAttribute( eventName, "return;" );
				isSupported = ( typeof div[ eventName ] === "function" );
			}
			support[ i + "Bubbles" ] = isSupported;
		}
	}

	// Run tests that need a body at doc ready
	jQuery(function() {
		var container, div, tds, marginDiv,
			divReset = "padding:0;margin:0;border:0;display:block;overflow:hidden;",
			body = document.getElementsByTagName("body")[0];

		if ( !body ) {
			// Return for frameset docs that don't have a body
			return;
		}

		container = document.createElement("div");
		container.style.cssText = "visibility:hidden;border:0;width:0;height:0;position:static;top:0;margin-top:1px";
		body.insertBefore( container, body.firstChild );

		// Construct the test element
		div = document.createElement("div");
		container.appendChild( div );

		// Check if table cells still have offsetWidth/Height when they are set
		// to display:none and there are still other visible table cells in a
		// table row; if so, offsetWidth/Height are not reliable for use when
		// determining if an element has been hidden directly using
		// display:none (it is still safe to use offsets if a parent element is
		// hidden; don safety goggles and see bug #4512 for more information).
		// (only IE 8 fails this test)
		div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
		tds = div.getElementsByTagName("td");
		tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
		isSupported = ( tds[ 0 ].offsetHeight === 0 );

		tds[ 0 ].style.display = "";
		tds[ 1 ].style.display = "none";

		// Check if empty table cells still have offsetWidth/Height
		// (IE <= 8 fail this test)
		support.reliableHiddenOffsets = isSupported && ( tds[ 0 ].offsetHeight === 0 );

		// Check box-sizing and margin behavior
		div.innerHTML = "";
		div.style.cssText = "box-sizing:border-box;-moz-box-sizing:border-box;-webkit-box-sizing:border-box;padding:1px;border:1px;display:block;width:4px;margin-top:1%;position:absolute;top:1%;";
		support.boxSizing = ( div.offsetWidth === 4 );
		support.doesNotIncludeMarginInBodyOffset = ( body.offsetTop !== 1 );

		// NOTE: To any future maintainer, we've window.getComputedStyle
		// because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			support.pixelPosition = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			support.boxSizingReliable = ( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";

			// Check if div with explicit width and no margin-right incorrectly
			// gets computed margin-right based on width of container. For more
			// info see bug #3333
			// Fails in WebKit before Feb 2011 nightlies
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			marginDiv = document.createElement("div");
			marginDiv.style.cssText = div.style.cssText = divReset;
			marginDiv.style.marginRight = marginDiv.style.width = "0";
			div.style.width = "1px";
			div.appendChild( marginDiv );
			support.reliableMarginRight =
				!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );
		}

		if ( typeof div.style.zoom !== "undefined" ) {
			// Check if natively block-level elements act like inline-block
			// elements when setting their display to 'inline' and giving
			// them layout
			// (IE < 8 does this)
			div.innerHTML = "";
			div.style.cssText = divReset + "width:1px;padding:1px;display:inline;zoom:1";
			support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 );

			// Check if elements with layout shrink-wrap their children
			// (IE 6 does this)
			div.style.display = "block";
			div.style.overflow = "visible";
			div.innerHTML = "<div></div>";
			div.firstChild.style.width = "5px";
			support.shrinkWrapBlocks = ( div.offsetWidth !== 3 );

			container.style.zoom = 1;
		}

		// Null elements to avoid leaks in IE
		body.removeChild( container );
		container = div = tds = marginDiv = null;
	});

	// Null elements to avoid leaks in IE
	fragment.removeChild( div );
	all = a = select = opt = input = fragment = div = null;

	return support;
})();
var rbrace = /(?:\{[\s\S]*\}|\[[\s\S]*\])$/,
	rmultiDash = /([A-Z])/g;

jQuery.extend({
	cache: {},

	deletedIds: [],

	// Remove at next major release (1.9/2.0)
	uuid: 0,

	// Unique for each copy of jQuery on the page
	// Non-digits removed to match rinlinejQuery
	expando: "jQuery" + ( jQuery.fn.jquery + Math.random() ).replace( /\D/g, "" ),

	// The following elements throw uncatchable exceptions if you
	// attempt to add expando properties to them.
	noData: {
		"embed": true,
		// Ban all objects except for Flash (which handle expandos)
		"object": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000",
		"applet": true
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data, pvt /* Internal Use Only */ ) {
		if ( !jQuery.acceptData( elem ) ) {
			return;
		}

		var thisCache, ret,
			internalKey = jQuery.expando,
			getByName = typeof name === "string",

			// We have to handle DOM nodes and JS objects differently because IE6-7
			// can't GC object references properly across the DOM-JS boundary
			isNode = elem.nodeType,

			// Only DOM nodes need the global jQuery cache; JS object data is
			// attached directly to the object so GC can occur automatically
			cache = isNode ? jQuery.cache : elem,

			// Only defining an ID for JS objects if its cache already exists allows
			// the code to shortcut on the same path as a DOM node with no cache
			id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

		// Avoid doing any more work than we need to when trying to get data on an
		// object that has no data at all
		if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && getByName && data === undefined ) {
			return;
		}

		if ( !id ) {
			// Only DOM nodes need a new unique ID for each element since their data
			// ends up in the global cache
			if ( isNode ) {
				elem[ internalKey ] = id = jQuery.deletedIds.pop() || jQuery.guid++;
			} else {
				id = internalKey;
			}
		}

		if ( !cache[ id ] ) {
			cache[ id ] = {};

			// Avoids exposing jQuery metadata on plain JS objects when the object
			// is serialized using JSON.stringify
			if ( !isNode ) {
				cache[ id ].toJSON = jQuery.noop;
			}
		}

		// An object can be passed to jQuery.data instead of a key/value pair; this gets
		// shallow copied over onto the existing cache
		if ( typeof name === "object" || typeof name === "function" ) {
			if ( pvt ) {
				cache[ id ] = jQuery.extend( cache[ id ], name );
			} else {
				cache[ id ].data = jQuery.extend( cache[ id ].data, name );
			}
		}

		thisCache = cache[ id ];

		// jQuery data() is stored in a separate object inside the object's internal data
		// cache in order to avoid key collisions between internal data and user-defined
		// data.
		if ( !pvt ) {
			if ( !thisCache.data ) {
				thisCache.data = {};
			}

			thisCache = thisCache.data;
		}

		if ( data !== undefined ) {
			thisCache[ jQuery.camelCase( name ) ] = data;
		}

		// Check for both converted-to-camel and non-converted data property names
		// If a data property was specified
		if ( getByName ) {

			// First Try to find as-is property data
			ret = thisCache[ name ];

			// Test for null|undefined property data
			if ( ret == null ) {

				// Try to find the camelCased property
				ret = thisCache[ jQuery.camelCase( name ) ];
			}
		} else {
			ret = thisCache;
		}

		return ret;
	},

	removeData: function( elem, name, pvt /* Internal Use Only */ ) {
		if ( !jQuery.acceptData( elem ) ) {
			return;
		}

		var thisCache, i, l,

			isNode = elem.nodeType,

			// See jQuery.data for more information
			cache = isNode ? jQuery.cache : elem,
			id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

		// If there is already no cache entry for this object, there is no
		// purpose in continuing
		if ( !cache[ id ] ) {
			return;
		}

		if ( name ) {

			thisCache = pvt ? cache[ id ] : cache[ id ].data;

			if ( thisCache ) {

				// Support array or space separated string names for data keys
				if ( !jQuery.isArray( name ) ) {

					// try the string as a key before any manipulation
					if ( name in thisCache ) {
						name = [ name ];
					} else {

						// split the camel cased version by spaces unless a key with the spaces exists
						name = jQuery.camelCase( name );
						if ( name in thisCache ) {
							name = [ name ];
						} else {
							name = name.split(" ");
						}
					}
				}

				for ( i = 0, l = name.length; i < l; i++ ) {
					delete thisCache[ name[i] ];
				}

				// If there is no data left in the cache, we want to continue
				// and let the cache object itself get destroyed
				if ( !( pvt ? isEmptyDataObject : jQuery.isEmptyObject )( thisCache ) ) {
					return;
				}
			}
		}

		// See jQuery.data for more information
		if ( !pvt ) {
			delete cache[ id ].data;

			// Don't destroy the parent cache unless the internal data object
			// had been the only thing left in it
			if ( !isEmptyDataObject( cache[ id ] ) ) {
				return;
			}
		}

		// Destroy the cache
		if ( isNode ) {
			jQuery.cleanData( [ elem ], true );

		// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
		} else if ( jQuery.support.deleteExpando || cache != cache.window ) {
			delete cache[ id ];

		// When all else fails, null
		} else {
			cache[ id ] = null;
		}
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return jQuery.data( elem, name, data, true );
	},

	// A method for determining if a DOM node can handle the data expando
	acceptData: function( elem ) {
		var noData = elem.nodeName && jQuery.noData[ elem.nodeName.toLowerCase() ];

		// nodes accept data unless otherwise specified; rejection can be conditional
		return !noData || noData !== true && elem.getAttribute("classid") === noData;
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var parts, part, attr, name, l,
			elem = this[0],
			i = 0,
			data = null;

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					attr = elem.attributes;
					for ( l = attr.length; i < l; i++ ) {
						name = attr[i].name;

						if ( !name.indexOf( "data-" ) ) {
							name = jQuery.camelCase( name.substring(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		parts = key.split( ".", 2 );
		parts[1] = parts[1] ? "." + parts[1] : "";
		part = parts[1] + "!";

		return jQuery.access( this, function( value ) {

			if ( value === undefined ) {
				data = this.triggerHandler( "getData" + part, [ parts[0] ] );

				// Try to fetch any internally stored data first
				if ( data === undefined && elem ) {
					data = jQuery.data( elem, key );
					data = dataAttr( elem, key, data );
				}

				return data === undefined && parts[1] ?
					this.data( parts[0] ) :
					data;
			}

			parts[1] = value;
			this.each(function() {
				var self = jQuery( this );

				self.triggerHandler( "setData" + part, parts );
				jQuery.data( this, key, value );
				self.triggerHandler( "changeData" + part, parts );
			});
		}, null, value, arguments.length > 1, null, false );
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
				data === "false" ? false :
				data === "null" ? null :
				// Only convert to a number if it doesn't change the string
				+data + "" === data ? +data :
				rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}
jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery.removeData( elem, type + "queue", true );
				jQuery.removeData( elem, key, true );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	// Based off of the plugin by Clint Helfers, with permission.
	// http://blindsignals.com/index.php/2009/07/jquery-delay/
	delay: function( time, type ) {
		time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
		type = type || "fx";

		return this.queue( type, function( next, hooks ) {
			var timeout = setTimeout( next, time );
			hooks.stop = function() {
				clearTimeout( timeout );
			};
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var nodeHook, boolHook, fixSpecified,
	rclass = /[\t\r\n]/g,
	rreturn = /\r/g,
	rtype = /^(?:button|input)$/i,
	rfocusable = /^(?:button|input|object|select|textarea)$/i,
	rclickable = /^a(?:rea|)$/i,
	rboolean = /^(?:autofocus|autoplay|async|checked|controls|defer|disabled|hidden|loop|multiple|open|readonly|required|scoped|selected)$/i,
	getSetAttribute = jQuery.support.getSetAttribute;

jQuery.fn.extend({
	attr: function( name, value ) {
		return jQuery.access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	},

	prop: function( name, value ) {
		return jQuery.access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	},

	addClass: function( value ) {
		var classNames, i, l, elem,
			setClass, c, cl;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call(this, j, this.className) );
			});
		}

		if ( value && typeof value === "string" ) {
			classNames = value.split( core_rspace );

			for ( i = 0, l = this.length; i < l; i++ ) {
				elem = this[ i ];

				if ( elem.nodeType === 1 ) {
					if ( !elem.className && classNames.length === 1 ) {
						elem.className = value;

					} else {
						setClass = " " + elem.className + " ";

						for ( c = 0, cl = classNames.length; c < cl; c++ ) {
							if ( setClass.indexOf( " " + classNames[ c ] + " " ) < 0 ) {
								setClass += classNames[ c ] + " ";
							}
						}
						elem.className = jQuery.trim( setClass );
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var removes, className, elem, c, cl, i, l;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call(this, j, this.className) );
			});
		}
		if ( (value && typeof value === "string") || value === undefined ) {
			removes = ( value || "" ).split( core_rspace );

			for ( i = 0, l = this.length; i < l; i++ ) {
				elem = this[ i ];
				if ( elem.nodeType === 1 && elem.className ) {

					className = (" " + elem.className + " ").replace( rclass, " " );

					// loop over each item in the removal list
					for ( c = 0, cl = removes.length; c < cl; c++ ) {
						// Remove until there is nothing to remove,
						while ( className.indexOf(" " + removes[ c ] + " ") >= 0 ) {
							className = className.replace( " " + removes[ c ] + " " , " " );
						}
					}
					elem.className = value ? jQuery.trim( className ) : "";
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value,
			isBool = typeof stateVal === "boolean";

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					state = stateVal,
					classNames = value.split( core_rspace );

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					state = isBool ? state : !self.hasClass( className );
					self[ state ? "addClass" : "removeClass" ]( className );
				}

			} else if ( type === "undefined" || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// toggle whole className
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	},

	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val,
				self = jQuery(this);

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, self.val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map(val, function ( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				// attributes.value is undefined in Blackberry 4.7 but
				// uses .value. See #6932
				var val = elem.attributes.value;
				return !val || val.specified ? elem.value : elem.text;
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// oldIE doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( jQuery.support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var values = jQuery.makeArray( value );

				jQuery(elem).find("option").each(function() {
					this.selected = jQuery.inArray( jQuery(this).val(), values ) >= 0;
				});

				if ( !values.length ) {
					elem.selectedIndex = -1;
				}
				return values;
			}
		}
	},

	// Unused in 1.8, left in so attrFn-stabbers won't die; remove in 1.9
	attrFn: {},

	attr: function( elem, name, value, pass ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		if ( pass && jQuery.isFunction( jQuery.fn[ name ] ) ) {
			return jQuery( elem )[ name ]( value );
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === "undefined" ) {
			return jQuery.prop( elem, name, value );
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( notxml ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] || ( rboolean.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );
				return;

			} else if ( hooks && "set" in hooks && notxml && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && notxml && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {

			ret = elem.getAttribute( name );

			// Non-existent attributes return null, we normalize to undefined
			return ret === null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var propName, attrNames, name, isBool,
			i = 0;

		if ( value && elem.nodeType === 1 ) {

			attrNames = value.split( core_rspace );

			for ( ; i < attrNames.length; i++ ) {
				name = attrNames[ i ];

				if ( name ) {
					propName = jQuery.propFix[ name ] || name;
					isBool = rboolean.test( name );

					// See #9699 for explanation of this approach (setting first, then removal)
					// Do not do this for boolean attributes (see #10870)
					if ( !isBool ) {
						jQuery.attr( elem, name, "" );
					}
					elem.removeAttribute( getSetAttribute ? name : propName );

					// Set corresponding property to false for boolean attributes
					if ( isBool && propName in elem ) {
						elem[ propName ] = false;
					}
				}
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				// We can't allow the type property to be changed (since it causes problems in IE)
				if ( rtype.test( elem.nodeName ) && elem.parentNode ) {
					jQuery.error( "type property can't be changed" );
				} else if ( !jQuery.support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to it's default in case type is set after value
					// This is for element creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		},
		// Use the value property for back compat
		// Use the nodeHook for button elements in IE6/7 (#1954)
		value: {
			get: function( elem, name ) {
				if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
					return nodeHook.get( elem, name );
				}
				return name in elem ?
					elem.value :
					null;
			},
			set: function( elem, value, name ) {
				if ( nodeHook && jQuery.nodeName( elem, "button" ) ) {
					return nodeHook.set( elem, value, name );
				}
				// Does not return so that setAttribute is also used
				elem.value = value;
			}
		}
	},

	propFix: {
		tabindex: "tabIndex",
		readonly: "readOnly",
		"for": "htmlFor",
		"class": "className",
		maxlength: "maxLength",
		cellspacing: "cellSpacing",
		cellpadding: "cellPadding",
		rowspan: "rowSpan",
		colspan: "colSpan",
		usemap: "useMap",
		frameborder: "frameBorder",
		contenteditable: "contentEditable"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				return ( elem[ name ] = value );
			}

		} else {
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
				return ret;

			} else {
				return elem[ name ];
			}
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				var attributeNode = elem.getAttributeNode("tabindex");

				return attributeNode && attributeNode.specified ?
					parseInt( attributeNode.value, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						undefined;
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	get: function( elem, name ) {
		// Align boolean attributes with corresponding properties
		// Fall back to attribute presence where some booleans are not supported
		var attrNode,
			property = jQuery.prop( elem, name );
		return property === true || typeof property !== "boolean" && ( attrNode = elem.getAttributeNode(name) ) && attrNode.nodeValue !== false ?
			name.toLowerCase() :
			undefined;
	},
	set: function( elem, value, name ) {
		var propName;
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else {
			// value is true since we know at this point it's type boolean and not false
			// Set boolean attributes to the same name and set the DOM property
			propName = jQuery.propFix[ name ] || name;
			if ( propName in elem ) {
				// Only set the IDL specifically if it already exists on the element
				elem[ propName ] = true;
			}

			elem.setAttribute( name, name.toLowerCase() );
		}
		return name;
	}
};

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	fixSpecified = {
		name: true,
		id: true,
		coords: true
	};

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret;
			ret = elem.getAttributeNode( name );
			return ret && ( fixSpecified[ name ] ? ret.value !== "" : ret.specified ) ?
				ret.value :
				undefined;
		},
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				ret = document.createAttribute( name );
				elem.setAttributeNode( ret );
			}
			return ( ret.value = value + "" );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		});
	});

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		get: nodeHook.get,
		set: function( elem, value, name ) {
			if ( value === "" ) {
				value = "false";
			}
			nodeHook.set( elem, value, name );
		}
	};
}


// Some attributes require a special call on IE
if ( !jQuery.support.hrefNormalized ) {
	jQuery.each([ "href", "src", "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = jQuery.extend( jQuery.attrHooks[ name ], {
			get: function( elem ) {
				var ret = elem.getAttribute( name, 2 );
				return ret === null ? undefined : ret;
			}
		});
	});
}

if ( !jQuery.support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Normalize to lowercase since IE uppercases css property names
			return elem.style.cssText.toLowerCase() || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = value + "" );
		}
	};
}

// Safari mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !jQuery.support.optSelected ) {
	jQuery.propHooks.selected = jQuery.extend( jQuery.propHooks.selected, {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	});
}

// IE6/7 call enctype encoding
if ( !jQuery.support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}

// Radios and checkboxes getter/setter
if ( !jQuery.support.checkOn ) {
	jQuery.each([ "radio", "checkbox" ], function() {
		jQuery.valHooks[ this ] = {
			get: function( elem ) {
				// Handle the case where in Webkit "" is returned instead of "on" if a value isn't specified
				return elem.getAttribute("value") === null ? "on" : elem.value;
			}
		};
	});
}
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = jQuery.extend( jQuery.valHooks[ this ], {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	});
});
var rformElems = /^(?:textarea|input|select)$/i,
	rtypenamespace = /^([^\.]*|)(?:\.(.+)|)$/,
	rhoverHack = /(?:^|\s)hover(\.\S+|)\b/,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	hoverHack = function( events ) {
		return jQuery.event.special.hover ? events : events.replace( rhoverHack, "mouseenter$1 mouseleave$1" );
	};

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	add: function( elem, types, handler, data, selector ) {

		var elemData, eventHandle, events,
			t, tns, type, namespaces, handleObj,
			handleObjIn, handlers, special;

		// Don't attach events to noData or text/comment nodes (allow plain objects tho)
		if ( elem.nodeType === 3 || elem.nodeType === 8 || !types || !handler || !(elemData = jQuery._data( elem )) ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		events = elemData.events;
		if ( !events ) {
			elemData.events = events = {};
		}
		eventHandle = elemData.handle;
		if ( !eventHandle ) {
			elemData.handle = eventHandle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== "undefined" && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		// jQuery(...).bind("mouseover mouseout", fn);
		types = jQuery.trim( hoverHack(types) ).split( " " );
		for ( t = 0; t < types.length; t++ ) {

			tns = rtypenamespace.exec( types[t] ) || [];
			type = tns[1];
			namespaces = ( tns[2] || "" ).split( "." ).sort();

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: tns[1],
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			handlers = events[ type ];
			if ( !handlers ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	global: {},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {

		var t, tns, type, origType, namespaces, origCount,
			j, events, special, eventType, handleObj,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = jQuery.trim( hoverHack( types || "" ) ).split(" ");
		for ( t = 0; t < types.length; t++ ) {
			tns = rtypenamespace.exec( types[t] ) || [];
			type = origType = tns[1];
			namespaces = tns[2];

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector? special.delegateType : special.bindType ) || type;
			eventType = events[ type ] || [];
			origCount = eventType.length;
			namespaces = namespaces ? new RegExp("(^|\\.)" + namespaces.split(".").sort().join("\\.(?:.*\\.|)") + "(\\.|$)") : null;

			// Remove matching events
			for ( j = 0; j < eventType.length; j++ ) {
				handleObj = eventType[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					 ( !handler || handler.guid === handleObj.guid ) &&
					 ( !namespaces || namespaces.test( handleObj.namespace ) ) &&
					 ( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					eventType.splice( j--, 1 );

					if ( handleObj.selector ) {
						eventType.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( eventType.length === 0 && origCount !== eventType.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery.removeData( elem, "events", true );
		}
	},

	// Events that are safe to short-circuit if no handlers are attached.
	// Native DOM events should not be added, they may have inline handlers.
	customEvent: {
		"getData": true,
		"setData": true,
		"changeData": true
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		// Don't do events on text and comment nodes
		if ( elem && (elem.nodeType === 3 || elem.nodeType === 8) ) {
			return;
		}

		// Event object or event type
		var cache, exclusive, i, cur, old, ontype, special, handle, eventPath, bubbleType,
			type = event.type || event,
			namespaces = [];

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf( "!" ) >= 0 ) {
			// Exclusive events trigger only for the exact event (no namespaces)
			type = type.slice(0, -1);
			exclusive = true;
		}

		if ( type.indexOf( "." ) >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}

		if ( (!elem || jQuery.event.customEvent[ type ]) && !jQuery.event.global[ type ] ) {
			// No jQuery handlers for this event type, and it can't have inline handlers
			return;
		}

		// Caller can pass in an Event, Object, or just an event type string
		event = typeof event === "object" ?
			// jQuery.Event object
			event[ jQuery.expando ] ? event :
			// Object literal
			new jQuery.Event( type, event ) :
			// Just the event type (string)
			new jQuery.Event( type );

		event.type = type;
		event.isTrigger = true;
		event.exclusive = exclusive;
		event.namespace = namespaces.join( "." );
		event.namespace_re = event.namespace? new RegExp("(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)") : null;
		ontype = type.indexOf( ":" ) < 0 ? "on" + type : "";

		// Handle a global trigger
		if ( !elem ) {

			// TODO: Stop taunting the data cache; remove global events and always attach to document
			cache = jQuery.cache;
			for ( i in cache ) {
				if ( cache[ i ].events && cache[ i ].events[ type ] ) {
					jQuery.event.trigger( event, data, cache[ i ].handle.elem, true );
				}
			}
			return;
		}

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data != null ? jQuery.makeArray( data ) : [];
		data.unshift( event );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		eventPath = [[ elem, special.bindType || type ]];
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			cur = rfocusMorph.test( bubbleType + type ) ? elem : elem.parentNode;
			for ( old = elem; cur; cur = cur.parentNode ) {
				eventPath.push([ cur, bubbleType ]);
				old = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( old === (elem.ownerDocument || document) ) {
				eventPath.push([ old.defaultView || old.parentWindow || window, bubbleType ]);
			}
		}

		// Fire handlers on the event path
		for ( i = 0; i < eventPath.length && !event.isPropagationStopped(); i++ ) {

			cur = eventPath[i][0];
			event.type = eventPath[i][1];

			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}
			// Note that this is a bare JS function and not a jQuery handler
			handle = ontype && cur[ ontype ];
			if ( handle && jQuery.acceptData( cur ) && handle.apply && handle.apply( cur, data ) === false ) {
				event.preventDefault();
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( elem.ownerDocument, data ) === false) &&
				!(type === "click" && jQuery.nodeName( elem, "a" )) && jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				// IE<9 dies on focus/blur to hidden element (#1486)
				if ( ontype && elem[ type ] && ((type !== "focus" && type !== "blur") || event.target.offsetWidth !== 0) && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					old = elem[ ontype ];

					if ( old ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					elem[ type ]();
					jQuery.event.triggered = undefined;

					if ( old ) {
						elem[ ontype ] = old;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event || window.event );

		var i, j, cur, ret, selMatch, matched, matches, handleObj, sel, related,
			handlers = ( (jQuery._data( this, "events" ) || {} )[ event.type ] || []),
			delegateCount = handlers.delegateCount,
			args = core_slice.call( arguments ),
			run_all = !event.exclusive && !event.namespace,
			special = jQuery.event.special[ event.type ] || {},
			handlerQueue = [];

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers that should run if there are delegated events
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && !(event.button && event.type === "click") ) {

			for ( cur = event.target; cur != this; cur = cur.parentNode || this ) {

				// Don't process clicks (ONLY) on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.disabled !== true || event.type !== "click" ) {
					selMatch = {};
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];
						sel = handleObj.selector;

						if ( selMatch[ sel ] === undefined ) {
							selMatch[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( selMatch[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, matches: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( handlers.length > delegateCount ) {
			handlerQueue.push({ elem: this, matches: handlers.slice( delegateCount ) });
		}

		// Run delegates first; they may want to stop propagation beneath us
		for ( i = 0; i < handlerQueue.length && !event.isPropagationStopped(); i++ ) {
			matched = handlerQueue[ i ];
			event.currentTarget = matched.elem;

			for ( j = 0; j < matched.matches.length && !event.isImmediatePropagationStopped(); j++ ) {
				handleObj = matched.matches[ j ];

				// Triggered event must either 1) be non-exclusive and have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( run_all || (!event.namespace && !handleObj.namespace) || event.namespace_re && event.namespace_re.test( handleObj.namespace ) ) {

					event.data = handleObj.data;
					event.handleObj = handleObj;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						event.result = ret;
						if ( ret === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	// *** attrChange attrName relatedNode srcElement  are not normalized, non-W3C, deprecated, will be removed in 1.8 ***
	props: "attrChange attrName relatedNode srcElement altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var eventDoc, doc, body,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop,
			originalEvent = event,
			fixHook = jQuery.event.fixHooks[ event.type ] || {},
			copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = jQuery.Event( originalEvent );

		for ( i = copy.length; i; ) {
			prop = copy[ --i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Fix target property, if necessary (#1925, IE 6/7/8 & Safari2)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Target should not be a text node (#504, Safari)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328; IE6/7/8)
		event.metaKey = !!event.metaKey;

		return fixHook.filter? fixHook.filter( event, originalEvent ) : event;
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},

		focus: {
			delegateType: "focusin"
		},
		blur: {
			delegateType: "focusout"
		},

		beforeunload: {
			setup: function( data, namespaces, eventHandle ) {
				// We only want to do this special case on windows
				if ( jQuery.isWindow( this ) ) {
					this.onbeforeunload = eventHandle;
				}
			},

			teardown: function( namespaces, eventHandle ) {
				if ( this.onbeforeunload === eventHandle ) {
					this.onbeforeunload = null;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{ type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

// Some plugins are using, but it's undocumented/deprecated and will be removed.
// The 1.7 special event interface should provide all the hooks needed now.
jQuery.event.handle = jQuery.event.dispatch;

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === "undefined" ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = ( src.defaultPrevented || src.returnValue === false ||
			src.getPreventDefault && src.getPreventDefault() ) ? returnTrue : returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

function returnFalse() {
	return false;
}
function returnTrue() {
	return true;
}

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	preventDefault: function() {
		this.isDefaultPrevented = returnTrue;

		var e = this.originalEvent;
		if ( !e ) {
			return;
		}

		// if preventDefault exists run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// otherwise set the returnValue property of the original event to false (IE)
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		this.isPropagationStopped = returnTrue;

		var e = this.originalEvent;
		if ( !e ) {
			return;
		}
		// if stopPropagation exists run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}
		// otherwise set the cancelBubble property of the original event to true (IE)
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	},
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj,
				selector = handleObj.selector;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !jQuery.support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "_submit_attached" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "_submit_attached", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !jQuery.support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "_change_attached" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "_change_attached", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !jQuery.support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler while someone wants focusin/focusout
		var attaches = 0,
			handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				if ( attaches++ === 0 ) {
					document.addEventListener( orig, handler, true );
				}
			},
			teardown: function() {
				if ( --attaches === 0 ) {
					document.removeEventListener( orig, handler, true );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var origFn, type;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) { // && selector != null
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	live: function( types, data, fn ) {
		jQuery( this.context ).on( types, this.selector, data, fn );
		return this;
	},
	die: function( types, fn ) {
		jQuery( this.context ).off( types, this.selector || "**", fn );
		return this;
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		if ( this[0] ) {
			return jQuery.event.trigger( type, data, this[0], true );
		}
	},

	toggle: function( fn ) {
		// Save reference to arguments for access in closure
		var args = arguments,
			guid = fn.guid || jQuery.guid++,
			i = 0,
			toggler = function( event ) {
				// Figure out which function to execute
				var lastToggle = ( jQuery._data( this, "lastToggle" + fn.guid ) || 0 ) % i;
				jQuery._data( this, "lastToggle" + fn.guid, lastToggle + 1 );

				// Make sure that clicks stop
				event.preventDefault();

				// and execute the function
				return args[ lastToggle ].apply( this, arguments ) || false;
			};

		// link all the functions, so any of them can unbind this click handler
		toggler.guid = guid;
		while ( i < args.length ) {
			args[ i++ ].guid = guid;
		}

		return this.click( toggler );
	},

	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	}
});

jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		if ( fn == null ) {
			fn = data;
			data = null;
		}

		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};

	if ( rkeyEvent.test( name ) ) {
		jQuery.event.fixHooks[ name ] = jQuery.event.keyHooks;
	}

	if ( rmouseEvent.test( name ) ) {
		jQuery.event.fixHooks[ name ] = jQuery.event.mouseHooks;
	}
});
/*!
 * Sizzle CSS Selector Engine
 * Copyright 2012 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://sizzlejs.com/
 */
(function( window, undefined ) {

var cachedruns,
	assertGetIdNotName,
	Expr,
	getText,
	isXML,
	contains,
	compile,
	sortOrder,
	hasDuplicate,
	outermostContext,

	baseHasDuplicate = true,
	strundefined = "undefined",

	expando = ( "sizcache" + Math.random() ).replace( ".", "" ),

	Token = String,
	document = window.document,
	docElem = document.documentElement,
	dirruns = 0,
	done = 0,
	pop = [].pop,
	push = [].push,
	slice = [].slice,
	// Use a stripped-down indexOf if a native one is unavailable
	indexOf = [].indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	// Augment a function for special use by Sizzle
	markFunction = function( fn, value ) {
		fn[ expando ] = value == null || value;
		return fn;
	},

	createCache = function() {
		var cache = {},
			keys = [];

		return markFunction(function( key, value ) {
			// Only keep the most recent entries
			if ( keys.push( key ) > Expr.cacheLength ) {
				delete cache[ keys.shift() ];
			}

			// Retrieve with (key + " ") to avoid collision with native Object.prototype properties (see Issue #157)
			return (cache[ key + " " ] = value);
		}, cache );
	},

	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),

	// Regex

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[-\\w]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier (http://www.w3.org/TR/css3-selectors/#attribute-selectors)
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	operators = "([*^$|!~]?=)",
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:" + operators + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments not in parens/brackets,
	//   then attribute selectors and non-pseudos (denoted by :),
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\((?:(['\"])((?:\\\\.|[^\\\\])*?)\\2|([^()[\\]]*|(?:(?:" + attributes + ")|[^:]|\\\\.)*|.*))\\)|)",

	// For matchExpr.POS and matchExpr.needsContext
	pos = ":(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
		"*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([\\x20\\t\\r\\n\\f>+~])" + whitespace + "*" ),
	rpseudo = new RegExp( pseudos ),

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w\-]+)|(\w+)|\.([\w\-]+))$/,

	rnot = /^:not/,
	rsibling = /[\x20\t\r\n\f]*[+~]/,
	rendsWithNot = /:not\($/,

	rheader = /h\d/i,
	rinputs = /input|select|textarea|button/i,

	rbackslash = /\\(?!\\)/g,

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"NAME": new RegExp( "^\\[name=['\"]?(" + characterEncoding + ")['\"]?\\]" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"POS": new RegExp( pos, "i" ),
		"CHILD": new RegExp( "^:(only|nth|first|last)-child(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		// For use in libraries implementing .is()
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|" + pos, "i" )
	},

	// Support

	// Used for testing something on an element
	assert = function( fn ) {
		var div = document.createElement("div");

		try {
			return fn( div );
		} catch (e) {
			return false;
		} finally {
			// release memory in IE
			div = null;
		}
	},

	// Check if getElementsByTagName("*") returns only elements
	assertTagNameNoComments = assert(function( div ) {
		div.appendChild( document.createComment("") );
		return !div.getElementsByTagName("*").length;
	}),

	// Check if getAttribute returns normalized href attributes
	assertHrefNotNormalized = assert(function( div ) {
		div.innerHTML = "<a href='#'></a>";
		return div.firstChild && typeof div.firstChild.getAttribute !== strundefined &&
			div.firstChild.getAttribute("href") === "#";
	}),

	// Check if attributes should be retrieved by attribute nodes
	assertAttributes = assert(function( div ) {
		div.innerHTML = "<select></select>";
		var type = typeof div.lastChild.getAttribute("multiple");
		// IE8 returns a string for some attributes even when not present
		return type !== "boolean" && type !== "string";
	}),

	// Check if getElementsByClassName can be trusted
	assertUsableClassName = assert(function( div ) {
		// Opera can't find a second classname (in 9.6)
		div.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>";
		if ( !div.getElementsByClassName || !div.getElementsByClassName("e").length ) {
			return false;
		}

		// Safari 3.2 caches class attributes and doesn't catch changes
		div.lastChild.className = "e";
		return div.getElementsByClassName("e").length === 2;
	}),

	// Check if getElementById returns elements by name
	// Check if getElementsByName privileges form controls or returns elements by ID
	assertUsableName = assert(function( div ) {
		// Inject content
		div.id = expando + 0;
		div.innerHTML = "<a name='" + expando + "'></a><div name='" + expando + "'></div>";
		docElem.insertBefore( div, docElem.firstChild );

		// Test
		var pass = document.getElementsByName &&
			// buggy browsers will return fewer than the correct 2
			document.getElementsByName( expando ).length === 2 +
			// buggy browsers will return more than the correct 0
			document.getElementsByName( expando + 0 ).length;
		assertGetIdNotName = !document.getElementById( expando );

		// Cleanup
		docElem.removeChild( div );

		return pass;
	});

// If slice is not available, provide a backup
try {
	slice.call( docElem.childNodes, 0 )[0].nodeType;
} catch ( e ) {
	slice = function( i ) {
		var elem,
			results = [];
		for ( ; (elem = this[i]); i++ ) {
			results.push( elem );
		}
		return results;
	};
}

function Sizzle( selector, context, results, seed ) {
	results = results || [];
	context = context || document;
	var match, elem, xml, m,
		nodeType = context.nodeType;

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( nodeType !== 1 && nodeType !== 9 ) {
		return [];
	}

	xml = isXML( context );

	if ( !xml && !seed ) {
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, slice.call(context.getElementsByTagName( selector ), 0) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && assertUsableClassName && context.getElementsByClassName ) {
				push.apply( results, slice.call(context.getElementsByClassName( m ), 0) );
				return results;
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed, xml );
}

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	return Sizzle( expr, null, null, [ elem ] ).length > 0;
};

// Returns a function to use in pseudos for input types
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

// Returns a function to use in pseudos for buttons
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

// Returns a function to use in pseudos for positionals
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( nodeType ) {
		if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
			// Use textContent for elements
			// innerText usage removed for consistency of new lines (see #11153)
			if ( typeof elem.textContent === "string" ) {
				return elem.textContent;
			} else {
				// Traverse its children
				for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
					ret += getText( elem );
				}
			}
		} else if ( nodeType === 3 || nodeType === 4 ) {
			return elem.nodeValue;
		}
		// Do not include comment or processing instruction nodes
	} else {

		// If no nodeType, this is expected to be an array
		for ( ; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	}
	return ret;
};

isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

// Element contains another
contains = Sizzle.contains = docElem.contains ?
	function( a, b ) {
		var adown = a.nodeType === 9 ? a.documentElement : a,
			bup = b && b.parentNode;
		return a === bup || !!( bup && bup.nodeType === 1 && adown.contains && adown.contains(bup) );
	} :
	docElem.compareDocumentPosition ?
	function( a, b ) {
		return b && !!( a.compareDocumentPosition( b ) & 16 );
	} :
	function( a, b ) {
		while ( (b = b.parentNode) ) {
			if ( b === a ) {
				return true;
			}
		}
		return false;
	};

Sizzle.attr = function( elem, name ) {
	var val,
		xml = isXML( elem );

	if ( !xml ) {
		name = name.toLowerCase();
	}
	if ( (val = Expr.attrHandle[ name ]) ) {
		return val( elem );
	}
	if ( xml || assertAttributes ) {
		return elem.getAttribute( name );
	}
	val = elem.getAttributeNode( name );
	return val ?
		typeof elem[ name ] === "boolean" ?
			elem[ name ] ? name : null :
			val.specified ? val.value : null :
		null;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	// IE6/7 return a modified href
	attrHandle: assertHrefNotNormalized ?
		{} :
		{
			"href": function( elem ) {
				return elem.getAttribute( "href", 2 );
			},
			"type": function( elem ) {
				return elem.getAttribute("type");
			}
		},

	find: {
		"ID": assertGetIdNotName ?
			function( id, context, xml ) {
				if ( typeof context.getElementById !== strundefined && !xml ) {
					var m = context.getElementById( id );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					return m && m.parentNode ? [m] : [];
				}
			} :
			function( id, context, xml ) {
				if ( typeof context.getElementById !== strundefined && !xml ) {
					var m = context.getElementById( id );

					return m ?
						m.id === id || typeof m.getAttributeNode !== strundefined && m.getAttributeNode("id").value === id ?
							[m] :
							undefined :
						[];
				}
			},

		"TAG": assertTagNameNoComments ?
			function( tag, context ) {
				if ( typeof context.getElementsByTagName !== strundefined ) {
					return context.getElementsByTagName( tag );
				}
			} :
			function( tag, context ) {
				var results = context.getElementsByTagName( tag );

				// Filter out possible comments
				if ( tag === "*" ) {
					var elem,
						tmp = [],
						i = 0;

					for ( ; (elem = results[i]); i++ ) {
						if ( elem.nodeType === 1 ) {
							tmp.push( elem );
						}
					}

					return tmp;
				}
				return results;
			},

		"NAME": assertUsableName && function( tag, context ) {
			if ( typeof context.getElementsByName !== strundefined ) {
				return context.getElementsByName( name );
			}
		},

		"CLASS": assertUsableClassName && function( className, context, xml ) {
			if ( typeof context.getElementsByClassName !== strundefined && !xml ) {
				return context.getElementsByClassName( className );
			}
		}
	},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( rbackslash, "" );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( rbackslash, "" );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				3 xn-component of xn+y argument ([+-]?\d*n|)
				4 sign of xn-component
				5 x of xn-component
				6 sign of y-component
				7 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1] === "nth" ) {
				// nth-child requires argument
				if ( !match[2] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[3] = +( match[3] ? match[4] + (match[5] || 1) : 2 * ( match[2] === "even" || match[2] === "odd" ) );
				match[4] = +( ( match[6] + match[7] ) || match[2] === "odd" );

			// other types prohibit arguments
			} else if ( match[2] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var unquoted, excess;
			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			if ( match[3] ) {
				match[2] = match[3];
			} else if ( (unquoted = match[4]) ) {
				// Only check arguments that contain a pseudo
				if ( rpseudo.test(unquoted) &&
					// Get excess from tokenize (recursively)
					(excess = tokenize( unquoted, true )) &&
					// advance to the next closing parenthesis
					(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

					// excess is a negative index
					unquoted = unquoted.slice( 0, excess );
					match[0] = match[0].slice( 0, excess );
				}
				match[2] = unquoted;
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {
		"ID": assertGetIdNotName ?
			function( id ) {
				id = id.replace( rbackslash, "" );
				return function( elem ) {
					return elem.getAttribute("id") === id;
				};
			} :
			function( id ) {
				id = id.replace( rbackslash, "" );
				return function( elem ) {
					var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
					return node && node.value === id;
				};
			},

		"TAG": function( nodeName ) {
			if ( nodeName === "*" ) {
				return function() { return true; };
			}
			nodeName = nodeName.replace( rbackslash, "" ).toLowerCase();

			return function( elem ) {
				return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
			};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ expando ][ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( elem.className || (typeof elem.getAttribute !== strundefined && elem.getAttribute("class")) || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem, context ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.substr( result.length - check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.substr( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, argument, first, last ) {

			if ( type === "nth" ) {
				return function( elem ) {
					var node, diff,
						parent = elem.parentNode;

					if ( first === 1 && last === 0 ) {
						return true;
					}

					if ( parent ) {
						diff = 0;
						for ( node = parent.firstChild; node; node = node.nextSibling ) {
							if ( node.nodeType === 1 ) {
								diff++;
								if ( elem === node ) {
									break;
								}
							}
						}
					}

					// Incorporate the offset (or cast to NaN), then check against cycle size
					diff -= last;
					return diff === first || ( diff % first === 0 && diff / first >= 0 );
				};
			}

			return function( elem ) {
				var node = elem;

				switch ( type ) {
					case "only":
					case "first":
						while ( (node = node.previousSibling) ) {
							if ( node.nodeType === 1 ) {
								return false;
							}
						}

						if ( type === "first" ) {
							return true;
						}

						node = elem;

						/* falls through */
					case "last":
						while ( (node = node.nextSibling) ) {
							if ( node.nodeType === 1 ) {
								return false;
							}
						}

						return true;
				}
			};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
			//   not comment, processing instructions, or others
			// Thanks to Diego Perini for the nodeName shortcut
			//   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
			var nodeType;
			elem = elem.firstChild;
			while ( elem ) {
				if ( elem.nodeName > "@" || (nodeType = elem.nodeType) === 3 || nodeType === 4 ) {
					return false;
				}
				elem = elem.nextSibling;
			}
			return true;
		},

		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"text": function( elem ) {
			var type, attr;
			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
			// use getAttribute instead to test this case
			return elem.nodeName.toLowerCase() === "input" &&
				(type = elem.type) === "text" &&
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === type );
		},

		// Input types
		"radio": createInputPseudo("radio"),
		"checkbox": createInputPseudo("checkbox"),
		"file": createInputPseudo("file"),
		"password": createInputPseudo("password"),
		"image": createInputPseudo("image"),

		"submit": createButtonPseudo("submit"),
		"reset": createButtonPseudo("reset"),

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"focus": function( elem ) {
			var doc = elem.ownerDocument;
			return elem === doc.activeElement && (!doc.hasFocus || doc.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		"active": function( elem ) {
			return elem === elem.ownerDocument.activeElement;
		},

		// Positional types
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			for ( var i = 0; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			for ( var i = 1; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			for ( var i = argument < 0 ? argument + length : argument; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			for ( var i = argument < 0 ? argument + length : argument; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

function siblingCheck( a, b, ret ) {
	if ( a === b ) {
		return ret;
	}

	var cur = a.nextSibling;

	while ( cur ) {
		if ( cur === b ) {
			return -1;
		}

		cur = cur.nextSibling;
	}

	return 1;
}

sortOrder = docElem.compareDocumentPosition ?
	function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		return ( !a.compareDocumentPosition || !b.compareDocumentPosition ?
			a.compareDocumentPosition :
			a.compareDocumentPosition(b) & 4
		) ? -1 : 1;
	} :
	function( a, b ) {
		// The nodes are identical, we can exit early
		if ( a === b ) {
			hasDuplicate = true;
			return 0;

		// Fallback to using sourceIndex (in IE) if it's available on both nodes
		} else if ( a.sourceIndex && b.sourceIndex ) {
			return a.sourceIndex - b.sourceIndex;
		}

		var al, bl,
			ap = [],
			bp = [],
			aup = a.parentNode,
			bup = b.parentNode,
			cur = aup;

		// If the nodes are siblings (or identical) we can do a quick check
		if ( aup === bup ) {
			return siblingCheck( a, b );

		// If no parents were found then the nodes are disconnected
		} else if ( !aup ) {
			return -1;

		} else if ( !bup ) {
			return 1;
		}

		// Otherwise they're somewhere else in the tree so we need
		// to build up a full list of the parentNodes for comparison
		while ( cur ) {
			ap.unshift( cur );
			cur = cur.parentNode;
		}

		cur = bup;

		while ( cur ) {
			bp.unshift( cur );
			cur = cur.parentNode;
		}

		al = ap.length;
		bl = bp.length;

		// Start walking down the tree looking for a discrepancy
		for ( var i = 0; i < al && i < bl; i++ ) {
			if ( ap[i] !== bp[i] ) {
				return siblingCheck( ap[i], bp[i] );
			}
		}

		// We ended someplace up the tree so do a sibling check
		return i === al ?
			siblingCheck( a, bp[i], -1 ) :
			siblingCheck( ap[i], b, 1 );
	};

// Always assume the presence of duplicates if sort doesn't
// pass them to our comparison function (as in Google Chrome).
[0, 0].sort( sortOrder );
baseHasDuplicate = !hasDuplicate;

// Document sorting and removing duplicates
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		i = 1,
		j = 0;

	hasDuplicate = baseHasDuplicate;
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		for ( ; (elem = results[i]); i++ ) {
			if ( elem === results[ i - 1 ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	return results;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ expando ][ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( tokens = [] );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			tokens.push( matched = new Token( match.shift() ) );
			soFar = soFar.slice( matched.length );

			// Cast descendant combinators to space
			matched.type = match[0].replace( rtrim, " " );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {

				tokens.push( matched = new Token( match.shift() ) );
				soFar = soFar.slice( matched.length );
				matched.type = type;
				matched.matches = match;
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && combinator.dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( checkNonElements || elem.nodeType === 1  ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( !xml ) {
				var cache,
					dirkey = dirruns + " " + doneName + " ",
					cachedkey = dirkey + cachedruns;
				while ( (elem = elem[ dir ]) ) {
					if ( checkNonElements || elem.nodeType === 1 ) {
						if ( (cache = elem[ expando ]) === cachedkey ) {
							return elem.sizset;
						} else if ( typeof cache === "string" && cache.indexOf(dirkey) === 0 ) {
							if ( elem.sizset ) {
								return elem;
							}
						} else {
							elem[ expando ] = cachedkey;
							if ( matcher( elem, context, xml ) ) {
								elem.sizset = true;
								return elem;
							}
							elem.sizset = false;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( checkNonElements || elem.nodeType === 1 ) {
						if ( matcher( elem, context, xml ) ) {
							return elem;
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && tokens.slice( 0, i - 1 ).join("").replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && tokens.join("")
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, expandContext ) {
			var elem, j, matcher,
				setMatched = [],
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				outermost = expandContext != null,
				contextBackup = outermostContext,
				// We must always have either seed elements or context
				elems = seed || byElement && Expr.find["TAG"]( "*", expandContext && context.parentNode || context ),
				// Nested matchers should use non-integer dirruns
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.E);

			if ( outermost ) {
				outermostContext = context !== document && context;
				cachedruns = superMatcher.el;
			}

			// Add elements passing elementMatchers directly to results
			for ( ; (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					for ( j = 0; (matcher = elementMatchers[j]); j++ ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
						cachedruns = ++superMatcher.el;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				for ( j = 0; (matcher = setMatchers[j]); j++ ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	superMatcher.el = 0;
	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ expando ][ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed, xml ) {
	var i, tokens, token, type, find,
		match = tokenize( selector ),
		j = match.length;

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					context.nodeType === 9 && !xml &&
					Expr.relative[ tokens[1].type ] ) {

				context = Expr.find["ID"]( token.matches[0].replace( rbackslash, "" ), context, xml )[0];
				if ( !context ) {
					return results;
				}

				selector = selector.slice( tokens.shift().length );
			}

			// Fetch a seed set for right-to-left matching
			for ( i = matchExpr["POS"].test( selector ) ? -1 : tokens.length - 1; i >= 0; i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( rbackslash, "" ),
						rsibling.test( tokens[0].type ) && context.parentNode || context,
						xml
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && tokens.join("");
						if ( !selector ) {
							push.apply( results, slice.call( seed, 0 ) );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		xml,
		results,
		rsibling.test( selector )
	);
	return results;
}

if ( document.querySelectorAll ) {
	(function() {
		var disconnectedMatch,
			oldSelect = select,
			rescape = /'|\\/g,
			rattributeQuotes = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,

			// qSa(:focus) reports false when true (Chrome 21), no need to also add to buggyMatches since matches checks buggyQSA
			// A support test would require too much code (would include document ready)
			rbuggyQSA = [ ":focus" ],

			// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
			// A support test would require too much code (would include document ready)
			// just skip matchesSelector for :active
			rbuggyMatches = [ ":active" ],
			matches = docElem.matchesSelector ||
				docElem.mozMatchesSelector ||
				docElem.webkitMatchesSelector ||
				docElem.oMatchesSelector ||
				docElem.msMatchesSelector;

		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explictly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select><option selected=''></option></select>";

			// IE8 - Some boolean attributes are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here (do not put tests after this one)
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {

			// Opera 10-12/IE9 - ^= $= *= and empty values
			// Should not select anything
			div.innerHTML = "<p test=''></p>";
			if ( div.querySelectorAll("[test^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:\"\"|'')" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here (do not put tests after this one)
			div.innerHTML = "<input type='hidden'/>";
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push(":enabled", ":disabled");
			}
		});

		// rbuggyQSA always contains :focus, so no need for a length check
		rbuggyQSA = /* rbuggyQSA.length && */ new RegExp( rbuggyQSA.join("|") );

		select = function( selector, context, results, seed, xml ) {
			// Only use querySelectorAll when not filtering,
			// when this is not xml,
			// and when no QSA bugs apply
			if ( !seed && !xml && !rbuggyQSA.test( selector ) ) {
				var groups, i,
					old = true,
					nid = expando,
					newContext = context,
					newSelector = context.nodeType === 9 && selector;

				// qSA works strangely on Element-rooted queries
				// We can work around this by specifying an extra ID on the root
				// and working up from there (Thanks to Andrew Dupont for the technique)
				// IE 8 doesn't work on object elements
				if ( context.nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
					groups = tokenize( selector );

					if ( (old = context.getAttribute("id")) ) {
						nid = old.replace( rescape, "\\$&" );
					} else {
						context.setAttribute( "id", nid );
					}
					nid = "[id='" + nid + "'] ";

					i = groups.length;
					while ( i-- ) {
						groups[i] = nid + groups[i].join("");
					}
					newContext = rsibling.test( selector ) && context.parentNode || context;
					newSelector = groups.join(",");
				}

				if ( newSelector ) {
					try {
						push.apply( results, slice.call( newContext.querySelectorAll(
							newSelector
						), 0 ) );
						return results;
					} catch(qsaError) {
					} finally {
						if ( !old ) {
							context.removeAttribute("id");
						}
					}
				}
			}

			return oldSelect( selector, context, results, seed, xml );
		};

		if ( matches ) {
			assert(function( div ) {
				// Check to see if it's possible to do matchesSelector
				// on a disconnected node (IE 9)
				disconnectedMatch = matches.call( div, "div" );

				// This should fail with an exception
				// Gecko does not error, returns false instead
				try {
					matches.call( div, "[test!='']:sizzle" );
					rbuggyMatches.push( "!=", pseudos );
				} catch ( e ) {}
			});

			// rbuggyMatches always contains :active and :focus, so no need for a length check
			rbuggyMatches = /* rbuggyMatches.length && */ new RegExp( rbuggyMatches.join("|") );

			Sizzle.matchesSelector = function( elem, expr ) {
				// Make sure that attribute selectors are quoted
				expr = expr.replace( rattributeQuotes, "='$1']" );

				// rbuggyMatches always contains :active, so no need for an existence check
				if ( !isXML( elem ) && !rbuggyMatches.test( expr ) && !rbuggyQSA.test( expr ) ) {
					try {
						var ret = matches.call( elem, expr );

						// IE 9's matchesSelector returns false on disconnected nodes
						if ( ret || disconnectedMatch ||
								// As well, disconnected nodes are said to be in a document
								// fragment in IE 9
								elem.document && elem.document.nodeType !== 11 ) {
							return ret;
						}
					} catch(e) {}
				}

				return Sizzle( expr, null, null, [ elem ] ).length > 0;
			};
		}
	})();
}

// Deprecated
Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Back-compat
function setFilters() {}
Expr.filters = setFilters.prototype = Expr.pseudos;
Expr.setFilters = new setFilters();

// Override sizzle attribute retrieval
Sizzle.attr = jQuery.attr;
jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;


})( window );
var runtil = /Until$/,
	rparentsprev = /^(?:parents|prev(?:Until|All))/,
	isSimple = /^.[^:#\[\.,]*$/,
	rneedsContext = jQuery.expr.match.needsContext,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.fn.extend({
	find: function( selector ) {
		var i, l, length, n, r, ret,
			self = this;

		if ( typeof selector !== "string" ) {
			return jQuery( selector ).filter(function() {
				for ( i = 0, l = self.length; i < l; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			});
		}

		ret = this.pushStack( "", "find", selector );

		for ( i = 0, l = this.length; i < l; i++ ) {
			length = ret.length;
			jQuery.find( selector, this[i], ret );

			if ( i > 0 ) {
				// Make sure that the results are unique
				for ( n = length; n < ret.length; n++ ) {
					for ( r = 0; r < length; r++ ) {
						if ( ret[r] === ret[n] ) {
							ret.splice(n--, 1);
							break;
						}
					}
				}
			}
		}

		return ret;
	},

	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	not: function( selector ) {
		return this.pushStack( winnow(this, selector, false), "not", selector);
	},

	filter: function( selector ) {
		return this.pushStack( winnow(this, selector, true), "filter", selector );
	},

	is: function( selector ) {
		return !!selector && (
			typeof selector === "string" ?
				// If this is a positional/relative selector, check membership in the returned set
				// so $("p:first").is("p:last") won't return true for a doc with two "p".
				rneedsContext.test( selector ) ?
					jQuery( selector, this.context ).index( this[0] ) >= 0 :
					jQuery.filter( selector, this ).length > 0 :
				this.filter( selector ).length > 0 );
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			ret = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			cur = this[i];

			while ( cur && cur.ownerDocument && cur !== context && cur.nodeType !== 11 ) {
				if ( pos ? pos.index(cur) > -1 : jQuery.find.matchesSelector(cur, selectors) ) {
					ret.push( cur );
					break;
				}
				cur = cur.parentNode;
			}
		}

		ret = ret.length > 1 ? jQuery.unique( ret ) : ret;

		return this.pushStack( ret, "closest", selectors );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		var set = typeof selector === "string" ?
				jQuery( selector, context ) :
				jQuery.makeArray( selector && selector.nodeType ? [ selector ] : selector ),
			all = jQuery.merge( this.get(), set );

		return this.pushStack( isDisconnected( set[0] ) || isDisconnected( all[0] ) ?
			all :
			jQuery.unique( all ) );
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

jQuery.fn.andSelf = jQuery.fn.addBack;

// A painfully simple check to see if an element is disconnected
// from a document (should be improved, where feasible).
function isDisconnected( node ) {
	return !node || !node.parentNode || node.parentNode.nodeType === 11;
}

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( !runtil.test( name ) ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		ret = this.length > 1 && !guaranteedUnique[ name ] ? jQuery.unique( ret ) : ret;

		if ( this.length > 1 && rparentsprev.test( name ) ) {
			ret = ret.reverse();
		}

		return this.pushStack( ret, name, core_slice.call( arguments ).join(",") );
	};
});

jQuery.extend({
	filter: function( expr, elems, not ) {
		if ( not ) {
			expr = ":not(" + expr + ")";
		}

		return elems.length === 1 ?
			jQuery.find.matchesSelector(elems[0], expr) ? [ elems[0] ] : [] :
			jQuery.find.matches(expr, elems);
	},

	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, keep ) {

	// Can't pass null or undefined to indexOf in Firefox 4
	// Set to 0 to skip string check
	qualifier = qualifier || 0;

	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep(elements, function( elem, i ) {
			var retVal = !!qualifier.call( elem, i, elem );
			return retVal === keep;
		});

	} else if ( qualifier.nodeType ) {
		return jQuery.grep(elements, function( elem, i ) {
			return ( elem === qualifier ) === keep;
		});

	} else if ( typeof qualifier === "string" ) {
		var filtered = jQuery.grep(elements, function( elem ) {
			return elem.nodeType === 1;
		});

		if ( isSimple.test( qualifier ) ) {
			return jQuery.filter(qualifier, filtered, !keep);
		} else {
			qualifier = jQuery.filter( qualifier, filtered );
		}
	}

	return jQuery.grep(elements, function( elem, i ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) === keep;
	});
}
function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
	safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	rnocache = /<(?:script|object|embed|option|style)/i,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rcheckableType = /^(?:checkbox|radio)$/,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /\/(java|ecma)script/i,
	rcleanScript = /^\s*<!(?:\[CDATA\[|\-\-)|[\]\-]{2}>\s*$/g,
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		area: [ 1, "<map>", "</map>" ],
		_default: [ 0, "", "" ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
// unless wrapped in a div with non-breaking characters in front of it.
if ( !jQuery.support.htmlSerialize ) {
	wrapMap._default = [ 1, "X<div>", "</div>" ];
}

jQuery.fn.extend({
	text: function( value ) {
		return jQuery.access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	},

	append: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 ) {
				this.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip(arguments, true, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 ) {
				this.insertBefore( elem, this.firstChild );
			}
		});
	},

	before: function() {
		if ( !isDisconnected( this[0] ) ) {
			return this.domManip(arguments, false, function( elem ) {
				this.parentNode.insertBefore( elem, this );
			});
		}

		if ( arguments.length ) {
			var set = jQuery.clean( arguments );
			return this.pushStack( jQuery.merge( set, this ), "before", this.selector );
		}
	},

	after: function() {
		if ( !isDisconnected( this[0] ) ) {
			return this.domManip(arguments, false, function( elem ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			});
		}

		if ( arguments.length ) {
			var set = jQuery.clean( arguments );
			return this.pushStack( jQuery.merge( this, set ), "after", this.selector );
		}
	},

	// keepData is for internal use only--do not document
	remove: function( selector, keepData ) {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			if ( !selector || jQuery.filter( selector, [ elem ] ).length ) {
				if ( !keepData && elem.nodeType === 1 ) {
					jQuery.cleanData( elem.getElementsByTagName("*") );
					jQuery.cleanData( [ elem ] );
				}

				if ( elem.parentNode ) {
					elem.parentNode.removeChild( elem );
				}
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( elem.getElementsByTagName("*") );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map( function () {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return jQuery.access( this, function( value ) {
			var elem = this[0] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( jQuery.support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( jQuery.support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ ( rtagName.exec( value ) || ["", ""] )[1].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( elem.getElementsByTagName( "*" ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function( value ) {
		if ( !isDisconnected( this[0] ) ) {
			// Make sure that the elements are removed from the DOM before they are inserted
			// this can help fix replacing a parent with child elements
			if ( jQuery.isFunction( value ) ) {
				return this.each(function(i) {
					var self = jQuery(this), old = self.html();
					self.replaceWith( value.call( this, i, old ) );
				});
			}

			if ( typeof value !== "string" ) {
				value = jQuery( value ).detach();
			}

			return this.each(function() {
				var next = this.nextSibling,
					parent = this.parentNode;

				jQuery( this ).remove();

				if ( next ) {
					jQuery(next).before( value );
				} else {
					jQuery(parent).append( value );
				}
			});
		}

		return this.length ?
			this.pushStack( jQuery(jQuery.isFunction(value) ? value() : value), "replaceWith", value ) :
			this;
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, table, callback ) {

		// Flatten any nested arrays
		args = [].concat.apply( [], args );

		var results, first, fragment, iNoClone,
			i = 0,
			value = args[0],
			scripts = [],
			l = this.length;

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( !jQuery.support.checkClone && l > 1 && typeof value === "string" && rchecked.test( value ) ) {
			return this.each(function() {
				jQuery(this).domManip( args, table, callback );
			});
		}

		if ( jQuery.isFunction(value) ) {
			return this.each(function(i) {
				var self = jQuery(this);
				args[0] = value.call( this, i, table ? self.html() : undefined );
				self.domManip( args, table, callback );
			});
		}

		if ( this[0] ) {
			results = jQuery.buildFragment( args, this, scripts );
			fragment = results.fragment;
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				table = table && jQuery.nodeName( first, "tr" );

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				// Fragments from the fragment cache must always be cloned and never used in place.
				for ( iNoClone = results.cacheable || l - 1; i < l; i++ ) {
					callback.call(
						table && jQuery.nodeName( this[i], "table" ) ?
							findOrAppend( this[i], "tbody" ) :
							this[i],
						i === iNoClone ?
							fragment :
							jQuery.clone( fragment, true, true )
					);
				}
			}

			// Fix #11809: Avoid leaking memory
			fragment = first = null;

			if ( scripts.length ) {
				jQuery.each( scripts, function( i, elem ) {
					if ( elem.src ) {
						if ( jQuery.ajax ) {
							jQuery.ajax({
								url: elem.src,
								type: "GET",
								dataType: "script",
								async: false,
								global: false,
								"throws": true
							});
						} else {
							jQuery.error("no ajax");
						}
					} else {
						jQuery.globalEval( ( elem.text || elem.textContent || elem.innerHTML || "" ).replace( rcleanScript, "" ) );
					}

					if ( elem.parentNode ) {
						elem.parentNode.removeChild( elem );
					}
				});
			}
		}

		return this;
	}
});

function findOrAppend( elem, tag ) {
	return elem.getElementsByTagName( tag )[0] || elem.appendChild( elem.ownerDocument.createElement( tag ) );
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function cloneFixAttributes( src, dest ) {
	var nodeName;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	// clearAttributes removes the attributes, which we don't want,
	// but also removes the attachEvent events, which we *do* want
	if ( dest.clearAttributes ) {
		dest.clearAttributes();
	}

	// mergeAttributes, in contrast, only merges back on the
	// original attributes, not the events
	if ( dest.mergeAttributes ) {
		dest.mergeAttributes( src );
	}

	nodeName = dest.nodeName.toLowerCase();

	if ( nodeName === "object" ) {
		// IE6-10 improperly clones children of object elements using classid.
		// IE10 throws NoModificationAllowedError if parent is null, #12132.
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( jQuery.support.html5Clone && (src.innerHTML && !jQuery.trim(dest.innerHTML)) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;

	// IE blanks contents when cloning scripts
	} else if ( nodeName === "script" && dest.text !== src.text ) {
		dest.text = src.text;
	}

	// Event data gets referenced instead of copied if the expando
	// gets copied too
	dest.removeAttribute( jQuery.expando );
}

jQuery.buildFragment = function( args, context, scripts ) {
	var fragment, cacheable, cachehit,
		first = args[ 0 ];

	// Set context from what may come in as undefined or a jQuery collection or a node
	// Updated to fix #12266 where accessing context[0] could throw an exception in IE9/10 &
	// also doubles as fix for #8950 where plain objects caused createDocumentFragment exception
	context = context || document;
	context = !context.nodeType && context[0] || context;
	context = context.ownerDocument || context;

	// Only cache "small" (1/2 KB) HTML strings that are associated with the main document
	// Cloning options loses the selected state, so don't cache them
	// IE 6 doesn't like it when you put <object> or <embed> elements in a fragment
	// Also, WebKit does not clone 'checked' attributes on cloneNode, so don't cache
	// Lastly, IE6,7,8 will not correctly reuse cached fragments that were created from unknown elems #10501
	if ( args.length === 1 && typeof first === "string" && first.length < 512 && context === document &&
		first.charAt(0) === "<" && !rnocache.test( first ) &&
		(jQuery.support.checkClone || !rchecked.test( first )) &&
		(jQuery.support.html5Clone || !rnoshimcache.test( first )) ) {

		// Mark cacheable and look for a hit
		cacheable = true;
		fragment = jQuery.fragments[ first ];
		cachehit = fragment !== undefined;
	}

	if ( !fragment ) {
		fragment = context.createDocumentFragment();
		jQuery.clean( args, context, fragment, scripts );

		// Update the cache, but only store false
		// unless this is a second parsing of the same content
		if ( cacheable ) {
			jQuery.fragments[ first ] = cachehit && fragment;
		}
	}

	return { fragment: fragment, cacheable: cacheable };
};

jQuery.fragments = {};

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			l = insert.length,
			parent = this.length === 1 && this[0].parentNode;

		if ( (parent == null || parent && parent.nodeType === 11 && parent.childNodes.length === 1) && l === 1 ) {
			insert[ original ]( this[0] );
			return this;
		} else {
			for ( ; i < l; i++ ) {
				elems = ( i > 0 ? this.clone(true) : this ).get();
				jQuery( insert[i] )[ original ]( elems );
				ret = ret.concat( elems );
			}

			return this.pushStack( ret, name, insert.selector );
		}
	};
});

function getAll( elem ) {
	if ( typeof elem.getElementsByTagName !== "undefined" ) {
		return elem.getElementsByTagName( "*" );

	} else if ( typeof elem.querySelectorAll !== "undefined" ) {
		return elem.querySelectorAll( "*" );

	} else {
		return [];
	}
}

// Used in clean, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var srcElements,
			destElements,
			i,
			clone;

		if ( jQuery.support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!jQuery.support.noCloneEvent || !jQuery.support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {
			// IE copies events bound via attachEvent when using cloneNode.
			// Calling detachEvent on the clone will also remove the events
			// from the original. In order to get around this, we use some
			// proprietary methods to clear the events. Thanks to MooTools
			// guys for this hotness.

			cloneFixAttributes( elem, clone );

			// Using Sizzle here is crazy slow, so we use getElementsByTagName instead
			srcElements = getAll( elem );
			destElements = getAll( clone );

			// Weird iteration because IE will replace the length property
			// with an element if you are cloning the body and one of the
			// elements on the page has a name or id of "length"
			for ( i = 0; srcElements[i]; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					cloneFixAttributes( srcElements[i], destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			cloneCopyEvent( elem, clone );

			if ( deepDataAndEvents ) {
				srcElements = getAll( elem );
				destElements = getAll( clone );

				for ( i = 0; srcElements[i]; ++i ) {
					cloneCopyEvent( srcElements[i], destElements[i] );
				}
			}
		}

		srcElements = destElements = null;

		// Return the cloned set
		return clone;
	},

	clean: function( elems, context, fragment, scripts ) {
		var i, j, elem, tag, wrap, depth, div, hasBody, tbody, len, handleScript, jsTags,
			safe = context === document && safeFragment,
			ret = [];

		// Ensure that context is a document
		if ( !context || typeof context.createDocumentFragment === "undefined" ) {
			context = document;
		}

		// Use the already-created safe fragment if context permits
		for ( i = 0; (elem = elems[i]) != null; i++ ) {
			if ( typeof elem === "number" ) {
				elem += "";
			}

			if ( !elem ) {
				continue;
			}

			// Convert html string into DOM nodes
			if ( typeof elem === "string" ) {
				if ( !rhtml.test( elem ) ) {
					elem = context.createTextNode( elem );
				} else {
					// Ensure a safe container in which to render the html
					safe = safe || createSafeFragment( context );
					div = context.createElement("div");
					safe.appendChild( div );

					// Fix "XHTML"-style tags in all browsers
					elem = elem.replace(rxhtmlTag, "<$1></$2>");

					// Go to html and back, then peel off extra wrappers
					tag = ( rtagName.exec( elem ) || ["", ""] )[1].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;
					depth = wrap[0];
					div.innerHTML = wrap[1] + elem + wrap[2];

					// Move to the right depth
					while ( depth-- ) {
						div = div.lastChild;
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !jQuery.support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						hasBody = rtbody.test(elem);
							tbody = tag === "table" && !hasBody ?
								div.firstChild && div.firstChild.childNodes :

								// String was a bare <thead> or <tfoot>
								wrap[1] === "<table>" && !hasBody ?
									div.childNodes :
									[];

						for ( j = tbody.length - 1; j >= 0 ; --j ) {
							if ( jQuery.nodeName( tbody[ j ], "tbody" ) && !tbody[ j ].childNodes.length ) {
								tbody[ j ].parentNode.removeChild( tbody[ j ] );
							}
						}
					}

					// IE completely kills leading whitespace when innerHTML is used
					if ( !jQuery.support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						div.insertBefore( context.createTextNode( rleadingWhitespace.exec(elem)[0] ), div.firstChild );
					}

					elem = div.childNodes;

					// Take out of fragment container (we need a fresh div each time)
					div.parentNode.removeChild( div );
				}
			}

			if ( elem.nodeType ) {
				ret.push( elem );
			} else {
				jQuery.merge( ret, elem );
			}
		}

		// Fix #11356: Clear elements from safeFragment
		if ( div ) {
			elem = div = safe = null;
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !jQuery.support.appendChecked ) {
			for ( i = 0; (elem = ret[i]) != null; i++ ) {
				if ( jQuery.nodeName( elem, "input" ) ) {
					fixDefaultChecked( elem );
				} else if ( typeof elem.getElementsByTagName !== "undefined" ) {
					jQuery.grep( elem.getElementsByTagName("input"), fixDefaultChecked );
				}
			}
		}

		// Append elements to a provided document fragment
		if ( fragment ) {
			// Special handling of each script element
			handleScript = function( elem ) {
				// Check if we consider it executable
				if ( !elem.type || rscriptType.test( elem.type ) ) {
					// Detach the script and store it in the scripts array (if provided) or the fragment
					// Return truthy to indicate that it has been handled
					return scripts ?
						scripts.push( elem.parentNode ? elem.parentNode.removeChild( elem ) : elem ) :
						fragment.appendChild( elem );
				}
			};

			for ( i = 0; (elem = ret[i]) != null; i++ ) {
				// Check if we're done after handling an executable script
				if ( !( jQuery.nodeName( elem, "script" ) && handleScript( elem ) ) ) {
					// Append to fragment and handle embedded scripts
					fragment.appendChild( elem );
					if ( typeof elem.getElementsByTagName !== "undefined" ) {
						// handleScript alters the DOM, so use jQuery.merge to ensure snapshot iteration
						jsTags = jQuery.grep( jQuery.merge( [], elem.getElementsByTagName("script") ), handleScript );

						// Splice the scripts into ret after their former ancestor and advance our index beyond them
						ret.splice.apply( ret, [i + 1, 0].concat( jsTags ) );
						i += jsTags.length;
					}
				}
			}
		}

		return ret;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var data, id, elem, type,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = jQuery.support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( elem.removeAttribute ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						jQuery.deletedIds.push( id );
					}
				}
			}
		}
	}
});
// Limit scope pollution from any deprecated API
(function() {

var matched, browser;

// Use of jQuery.browser is frowned upon.
// More details: http://api.jquery.com/jQuery.browser
// jQuery.uaMatch maintained for back-compat
jQuery.uaMatch = function( ua ) {
	ua = ua.toLowerCase();

	var match = /(chrome)[ \/]([\w.]+)/.exec( ua ) ||
		/(webkit)[ \/]([\w.]+)/.exec( ua ) ||
		/(opera)(?:.*version|)[ \/]([\w.]+)/.exec( ua ) ||
		/(msie) ([\w.]+)/.exec( ua ) ||
		ua.indexOf("compatible") < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec( ua ) ||
		[];

	return {
		browser: match[ 1 ] || "",
		version: match[ 2 ] || "0"
	};
};

matched = jQuery.uaMatch( navigator.userAgent );
browser = {};

if ( matched.browser ) {
	browser[ matched.browser ] = true;
	browser.version = matched.version;
}

// Chrome is Webkit, but Webkit is also Safari.
if ( browser.chrome ) {
	browser.webkit = true;
} else if ( browser.webkit ) {
	browser.safari = true;
}

jQuery.browser = browser;

jQuery.sub = function() {
	function jQuerySub( selector, context ) {
		return new jQuerySub.fn.init( selector, context );
	}
	jQuery.extend( true, jQuerySub, this );
	jQuerySub.superclass = this;
	jQuerySub.fn = jQuerySub.prototype = this();
	jQuerySub.fn.constructor = jQuerySub;
	jQuerySub.sub = this.sub;
	jQuerySub.fn.init = function init( selector, context ) {
		if ( context && context instanceof jQuery && !(context instanceof jQuerySub) ) {
			context = jQuerySub( context );
		}

		return jQuery.fn.init.call( this, selector, context, rootjQuerySub );
	};
	jQuerySub.fn.init.prototype = jQuerySub.fn;
	var rootjQuerySub = jQuerySub(document);
	return jQuerySub;
};

})();
var curCSS, iframe, iframeDoc,
	ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity=([^)]*)/,
	rposition = /^(top|right|bottom|left)$/,
	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rmargin = /^margin/,
	rnumsplit = new RegExp( "^(" + core_pnum + ")(.*)$", "i" ),
	rnumnonpx = new RegExp( "^(" + core_pnum + ")(?!px)[a-z%]+$", "i" ),
	rrelNum = new RegExp( "^([-+])=(" + core_pnum + ")", "i" ),
	elemdisplay = { BODY: "block" },

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssExpand = [ "Top", "Right", "Bottom", "Left" ],
	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ],

	eventsToggle = jQuery.fn.toggle;

// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function isHidden( elem, el ) {
	elem = el || elem;
	return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
}

function showHide( elements, show ) {
	var elem, display,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		values[ index ] = jQuery._data( elem, "olddisplay" );
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && elem.style.display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", css_defaultDisplay(elem.nodeName) );
			}
		} else {
			display = curCSS( elem, "display" );

			if ( !values[ index ] && display !== "none" ) {
				jQuery._data( elem, "olddisplay", display );
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

jQuery.fn.extend({
	css: function( name, value ) {
		return jQuery.access( this, function( elem, name, value ) {
			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state, fn2 ) {
		var bool = typeof state === "boolean";

		if ( jQuery.isFunction( state ) && jQuery.isFunction( fn2 ) ) {
			return eventsToggle.apply( this, arguments );
		}

		return this.each(function() {
			if ( bool ? state : isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;

				}
			}
		}
	},

	// Exclude the following css properties to add px
	cssNumber: {
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": jQuery.support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that NaN and null values aren't set. See: #7116
			if ( value == null || type === "number" && isNaN( value ) ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {
				// Wrapped to prevent IE from throwing errors when 'invalid' values are provided
				// Fixes bug #5509
				try {
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, numeric, extra ) {
		var val, num, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( numeric || extra !== undefined ) {
			num = parseFloat( val );
			return numeric || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	},

	// A method for quickly swapping in/out CSS properties to get correct calculations
	swap: function( elem, options, callback ) {
		var ret, name,
			old = {};

		// Remember the old values, and insert the new ones
		for ( name in options ) {
			old[ name ] = elem.style[ name ];
			elem.style[ name ] = options[ name ];
		}

		ret = callback.call( elem );

		// Revert the old values
		for ( name in options ) {
			elem.style[ name ] = old[ name ];
		}

		return ret;
	}
});

// NOTE: To any future maintainer, we've window.getComputedStyle
// because jsdom on node.js will break without it.
if ( window.getComputedStyle ) {
	curCSS = function( elem, name ) {
		var ret, width, minWidth, maxWidth,
			computed = window.getComputedStyle( elem, null ),
			style = elem.style;

		if ( computed ) {

			// getPropertyValue is only needed for .css('filter') in IE9, see #12537
			ret = computed.getPropertyValue( name ) || computed[ name ];

			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		return ret;
	};
} else if ( document.documentElement.currentStyle ) {
	curCSS = function( elem, name ) {
		var left, rsLeft,
			ret = elem.currentStyle && elem.currentStyle[ name ],
			style = elem.style;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rsLeft = elem.runtimeStyle && elem.runtimeStyle.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				elem.runtimeStyle.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				elem.runtimeStyle.left = rsLeft;
			}
		}

		return ret === "" ? "auto" : ret;
	};
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
			Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
			value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			// we use jQuery.css instead of curCSS here
			// because of the reliableMarginRight CSS hook!
			val += jQuery.css( elem, extra + cssExpand[ i ], true );
		}

		// From this point on we use curCSS for maximum performance (relevant in animations)
		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= parseFloat( curCSS( elem, "padding" + cssExpand[ i ] ) ) || 0;
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= parseFloat( curCSS( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += parseFloat( curCSS( elem, "padding" + cssExpand[ i ] ) ) || 0;

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += parseFloat( curCSS( elem, "border" + cssExpand[ i ] + "Width" ) ) || 0;
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		valueIsBorderBox = true,
		isBorderBox = jQuery.support.boxSizing && jQuery.css( elem, "boxSizing" ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( jQuery.support.boxSizingReliable || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox
		)
	) + "px";
}


// Try to determine the default display value of an element
function css_defaultDisplay( nodeName ) {
	if ( elemdisplay[ nodeName ] ) {
		return elemdisplay[ nodeName ];
	}

	var elem = jQuery( "<" + nodeName + ">" ).appendTo( document.body ),
		display = elem.css("display");
	elem.remove();

	// If the simple way fails,
	// get element's real default display by attaching it to a temp iframe
	if ( display === "none" || display === "" ) {
		// Use the already-created iframe if possible
		iframe = document.body.appendChild(
			iframe || jQuery.extend( document.createElement("iframe"), {
				frameBorder: 0,
				width: 0,
				height: 0
			})
		);

		// Create a cacheable copy of the iframe document on first call.
		// IE and Opera will allow us to reuse the iframeDoc without re-writing the fake HTML
		// document to it; WebKit & Firefox won't allow reusing the iframe document.
		if ( !iframeDoc || !iframe.createElement ) {
			iframeDoc = ( iframe.contentWindow || iframe.contentDocument ).document;
			iframeDoc.write("<!doctype html><html><body>");
			iframeDoc.close();
		}

		elem = iframeDoc.body.appendChild( iframeDoc.createElement(nodeName) );

		display = curCSS( elem, "display" );
		document.body.removeChild( iframe );
	}

	// Store the correct default display
	elemdisplay[ nodeName ] = display;

	return display;
}

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				if ( elem.offsetWidth === 0 && rdisplayswap.test( curCSS( elem, "display" ) ) ) {
					return jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					});
				} else {
					return getWidthOrHeight( elem, name, extra );
				}
			}
		},

		set: function( elem, value, extra ) {
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					jQuery.support.boxSizing && jQuery.css( elem, "boxSizing" ) === "border-box"
				) : 0
			);
		}
	};
});

if ( !jQuery.support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			if ( value >= 1 && jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
				style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there there is no filter style applied in a css rule, we are done
				if ( currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

// These hooks cannot be added until DOM ready because the support test
// for it is not run until after DOM ready
jQuery(function() {
	if ( !jQuery.support.reliableMarginRight ) {
		jQuery.cssHooks.marginRight = {
			get: function( elem, computed ) {
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				// Work around by temporarily setting element display to inline-block
				return jQuery.swap( elem, { "display": "inline-block" }, function() {
					if ( computed ) {
						return curCSS( elem, "marginRight" );
					}
				});
			}
		};
	}

	// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
	// getComputedStyle returns percent when specified for top/left/bottom/right
	// rather than make the css module depend on the offset module, we just check for it here
	if ( !jQuery.support.pixelPosition && jQuery.fn.position ) {
		jQuery.each( [ "top", "left" ], function( i, prop ) {
			jQuery.cssHooks[ prop ] = {
				get: function( elem, computed ) {
					if ( computed ) {
						var ret = curCSS( elem, prop );
						// if curCSS returns percentage, fallback to offset
						return rnumnonpx.test( ret ) ? jQuery( elem ).position()[ prop ] + "px" : ret;
					}
				}
			};
		});
	}

});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.hidden = function( elem ) {
		return ( elem.offsetWidth === 0 && elem.offsetHeight === 0 ) || (!jQuery.support.reliableHiddenOffsets && ((elem.style && elem.style.display) || curCSS( elem, "display" )) === "none");
	};

	jQuery.expr.filters.visible = function( elem ) {
		return !jQuery.expr.filters.hidden( elem );
	};
}

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i,

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ],
				expanded = {};

			for ( i = 0; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});
var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rinput = /^(?:color|date|datetime|datetime-local|email|hidden|month|number|password|range|search|tel|text|time|url|week)$/i,
	rselectTextarea = /^(?:select|textarea)/i;

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function(){
			return this.elements ? jQuery.makeArray( this.elements ) : this;
		})
		.filter(function(){
			return this.name && !this.disabled &&
				( this.checked || rselectTextarea.test( this.nodeName ) ||
					rinput.test( this.type ) );
		})
		.map(function( i, elem ){
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val, i ){
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});

//Serialize an array of form elements or a set of
//key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// If array item is non-scalar (array or object), encode its
				// numeric index to resolve deserialization ambiguity issues.
				// Note that rack (as of 1.0.0) can't currently deserialize
				// nested arrays properly, and attempting to do so may cause
				// a server error. Possible fixes are to modify rack's
				// deserialization algorithm or to provide an option or flag
				// to force array serialization to be shallow.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}
var
	// Document location
	ajaxLocParts,
	ajaxLocation,

	rhash = /#.*$/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app\-storage|.+\-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rquery = /\?/,
	rscript = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
	rts = /([?&])_=[^&]*/,
	rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+)|)|)/,

	// Keep a copy of the old load method
	_load = jQuery.fn.load,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = ["*/"] + ["*"];

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType, list, placeBefore,
			dataTypes = dataTypeExpression.toLowerCase().split( core_rspace ),
			i = 0,
			length = dataTypes.length;

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			for ( ; i < length; i++ ) {
				dataType = dataTypes[ i ];
				// We control if we're asked to add before
				// any existing element
				placeBefore = /^\+/.test( dataType );
				if ( placeBefore ) {
					dataType = dataType.substr( 1 ) || "*";
				}
				list = structure[ dataType ] = structure[ dataType ] || [];
				// then we add to the structure accordingly
				list[ placeBefore ? "unshift" : "push" ]( func );
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR,
		dataType /* internal */, inspected /* internal */ ) {

	dataType = dataType || options.dataTypes[ 0 ];
	inspected = inspected || {};

	inspected[ dataType ] = true;

	var selection,
		list = structure[ dataType ],
		i = 0,
		length = list ? list.length : 0,
		executeOnly = ( structure === prefilters );

	for ( ; i < length && ( executeOnly || !selection ); i++ ) {
		selection = list[ i ]( options, originalOptions, jqXHR );
		// If we got redirected to another dataType
		// we try there if executing only and not done already
		if ( typeof selection === "string" ) {
			if ( !executeOnly || inspected[ selection ] ) {
				selection = undefined;
			} else {
				options.dataTypes.unshift( selection );
				selection = inspectPrefiltersOrTransports(
						structure, options, originalOptions, jqXHR, selection, inspected );
			}
		}
	}
	// If we're only executing or nothing was selected
	// we try the catchall dataType if not done already
	if ( ( executeOnly || !selection ) && !inspected[ "*" ] ) {
		selection = inspectPrefiltersOrTransports(
				structure, options, originalOptions, jqXHR, "*", inspected );
	}
	// unnecessary when only executing (prefilters)
	// but it'll be ignored by the caller in that case
	return selection;
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var key, deep,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};
	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}
}

jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	// Don't do a request if no elements are being requested
	if ( !this.length ) {
		return this;
	}

	var selector, type, response,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off, url.length );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// Request the remote document
	jQuery.ajax({
		url: url,

		// if "type" variable is undefined, then "GET" method will be used
		type: type,
		dataType: "html",
		data: params,
		complete: function( jqXHR, status ) {
			if ( callback ) {
				self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
			}
		}
	}).done(function( responseText ) {

		// Save response for use in complete callback
		response = arguments;

		// See if a selector was specified
		self.html( selector ?

			// Create a dummy div to hold the results
			jQuery("<div>")

				// inject the contents of the document in, removing the scripts
				// to avoid any 'Permission Denied' errors in IE
				.append( responseText.replace( rscript, "" ) )

				// Locate the specified elements
				.find( selector ) :

			// If not, just inject the full result
			responseText );

	});

	return this;
};

// Attach a bunch of functions for handling common AJAX events
jQuery.each( "ajaxStart ajaxStop ajaxComplete ajaxError ajaxSuccess ajaxSend".split( " " ), function( i, o ){
	jQuery.fn[ o ] = function( f ){
		return this.on( o, f );
	};
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			type: method,
			url: url,
			data: data,
			success: callback,
			dataType: type
		});
	};
});

jQuery.extend({

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		if ( settings ) {
			// Building a settings object
			ajaxExtend( target, jQuery.ajaxSettings );
		} else {
			// Extending ajaxSettings
			settings = target;
			target = jQuery.ajaxSettings;
		}
		ajaxExtend( target, settings );
		return target;
	},

	ajaxSettings: {
		url: ajaxLocation,
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		type: "GET",
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		processData: true,
		async: true,
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			xml: "application/xml, text/xml",
			html: "text/html",
			text: "text/plain",
			json: "application/json, text/javascript",
			"*": allTypes
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText"
		},

		// List of data converters
		// 1) key format is "source_type destination_type" (a single space in-between)
		// 2) the catchall symbol "*" can be used for source_type
		converters: {

			// Convert anything to text
			"* text": window.String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			context: true,
			url: true
		}
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // ifModified key
			ifModifiedKey,
			// Response headers
			responseHeadersString,
			responseHeaders,
			// transport
			transport,
			// timeout handle
			timeoutTimer,
			// Cross-domain detection vars
			parts,
			// To know if global events are to be dispatched
			fireGlobals,
			// Loop variable
			i,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events
			// It's the callbackContext if one was provided in the options
			// and if it's a DOM node or a jQuery collection
			globalEventContext = callbackContext !== s &&
				( callbackContext.nodeType || callbackContext instanceof jQuery ) ?
						jQuery( callbackContext ) : jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks( "once memory" ),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {

				readyState: 0,

				// Caches the header
				setRequestHeader: function( name, value ) {
					if ( !state ) {
						var lname = name.toLowerCase();
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while( ( match = rheaders.exec( responseHeadersString ) ) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match === undefined ? null : match;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					statusText = statusText || strAbort;
					if ( transport ) {
						transport.abort( statusText );
					}
					done( 0, statusText );
					return this;
				}
			};

		// Callback for when everything is done
		// It is defined here because jslint complains if it is declared
		// at the end of the function (which would be more logical and readable)
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// If successful, handle type chaining
			if ( status >= 200 && status < 300 || status === 304 ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {

					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ ifModifiedKey ] = modified;
					}
					modified = jqXHR.getResponseHeader("Etag");
					if ( modified ) {
						jQuery.etag[ ifModifiedKey ] = modified;
					}
				}

				// If not modified
				if ( status === 304 ) {

					statusText = "notmodified";
					isSuccess = true;

				// If we have data
				} else {

					isSuccess = ajaxConvert( s, response );
					statusText = isSuccess.state;
					success = isSuccess.data;
					error = isSuccess.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( !statusText || status ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajax" + ( isSuccess ? "Success" : "Error" ),
						[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger( "ajaxStop" );
				}
			}
		}

		// Attach deferreds
		deferred.promise( jqXHR );
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;
		jqXHR.complete = completeDeferred.add;

		// Status-dependent callbacks
		jqXHR.statusCode = function( map ) {
			if ( map ) {
				var tmp;
				if ( state < 2 ) {
					for ( tmp in map ) {
						statusCode[ tmp ] = [ statusCode[tmp], map[tmp] ];
					}
				} else {
					tmp = map[ jqXHR.status ];
					jqXHR.always( tmp );
				}
			}
			return this;
		};

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// We also use the url parameter if available
		s.url = ( ( url || s.url ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().split( core_rspace );

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? 80 : 443 ) ) !=
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? 80 : 443 ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger( "ajaxStart" );
		}

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.data;
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Get ifModifiedKey before adding the anti-cache parameter
			ifModifiedKey = s.url;

			// Add anti-cache in url if needed
			if ( s.cache === false ) {

				var ts = jQuery.now(),
					// try replacing _= if it is there
					ret = s.url.replace( rts, "$1_=" + ts );

				// if nothing was replaced, add timestamp to the end
				s.url = ret + ( ( ret === s.url ) ? ( rquery.test( s.url ) ? "&" : "?" ) + "_=" + ts : "" );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			ifModifiedKey = ifModifiedKey || s.url;
			if ( jQuery.lastModified[ ifModifiedKey ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ ifModifiedKey ] );
			}
			if ( jQuery.etag[ ifModifiedKey ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ ifModifiedKey ] );
			}
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
				// Abort if not done already and return
				return jqXHR.abort();

		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;
			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout( function(){
					jqXHR.abort( "timeout" );
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch (e) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		return jqXHR;
	},

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {}

});

/* Handles responses to an ajax request:
 * - sets all responseXXX fields accordingly
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {

	var ct, type, finalDataType, firstDataType,
		contents = s.contents,
		dataTypes = s.dataTypes,
		responseFields = s.responseFields;

	// Fill responseXXX fields
	for ( type in responseFields ) {
		if ( type in responses ) {
			jqXHR[ responseFields[type] ] = responses[ type ];
		}
	}

	// Remove auto dataType and get content-type in the process
	while( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader( "content-type" );
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

// Chain conversions given the request and the original response
function ajaxConvert( s, response ) {

	var conv, conv2, current, tmp,
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice(),
		prev = dataTypes[ 0 ],
		converters = {},
		i = 0;

	// Apply the dataFilter if provided
	if ( s.dataFilter ) {
		response = s.dataFilter( response, s.dataType );
	}

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	// Convert to each sequential dataType, tolerating list modification
	for ( ; (current = dataTypes[++i]); ) {

		// There's only work to do if current dataType is non-auto
		if ( current !== "*" ) {

			// Convert response if prev dataType is non-auto and differs from current
			if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split(" ");
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.splice( i--, 0, current );
								}

								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s["throws"] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}

			// Update prev for next iteration
			prev = current;
		}
	}

	return { state: "success", data: response };
}
var oldCallbacks = [],
	rquestion = /\?/,
	rjsonp = /(=)\?(?=&|$)|\?\?/,
	nonce = jQuery.now();

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		data = s.data,
		url = s.url,
		hasCallback = s.jsonp !== false,
		replaceInUrl = hasCallback && rjsonp.test( url ),
		replaceInData = hasCallback && !replaceInUrl && typeof data === "string" &&
			!( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") &&
			rjsonp.test( data );

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( s.dataTypes[ 0 ] === "jsonp" || replaceInUrl || replaceInData ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;
		overwritten = window[ callbackName ];

		// Insert callback into url or form data
		if ( replaceInUrl ) {
			s.url = url.replace( rjsonp, "$1" + callbackName );
		} else if ( replaceInData ) {
			s.data = data.replace( rjsonp, "$1" + callbackName );
		} else if ( hasCallback ) {
			s.url += ( rquestion.test( url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});
// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /javascript|ecmascript/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || document.getElementsByTagName( "head" )[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement( "script" );

				script.async = "async";

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( head && script.parentNode ) {
							head.removeChild( script );
						}

						// Dereference the script
						script = undefined;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};
				// Use insertBefore instead of appendChild  to circumvent an IE6 bug.
				// This arises when a base node is used (#2709 and #4378).
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( 0, 1 );
				}
			}
		};
	}
});
var xhrCallbacks,
	// #5280: Internet Explorer will keep connections alive if we don't abort on unload
	xhrOnUnloadAbort = window.ActiveXObject ? function() {
		// Abort all pending requests
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]( 0, 1 );
		}
	} : false,
	xhrId = 0;

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject( "Microsoft.XMLHTTP" );
	} catch( e ) {}
}

// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject ?
	/* Microsoft failed to properly
	 * implement the XMLHttpRequest in IE7 (can't request local files),
	 * so we use the ActiveXObject when it is available
	 * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
	 * we need a fallback.
	 */
	function() {
		return !this.isLocal && createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

// Determine support properties
(function( xhr ) {
	jQuery.extend( jQuery.support, {
		ajax: !!xhr,
		cors: !!xhr && ( "withCredentials" in xhr )
	});
})( jQuery.ajaxSettings.xhr() );

// Create transport if the browser can provide an xhr
if ( jQuery.support.ajax ) {

	jQuery.ajaxTransport(function( s ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !s.crossDomain || jQuery.support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {

					// Get a new xhr
					var handle, i,
						xhr = s.xhr();

					// Open the socket
					// Passing null username, generates a login popup on Opera (#2865)
					if ( s.username ) {
						xhr.open( s.type, s.url, s.async, s.username, s.password );
					} else {
						xhr.open( s.type, s.url, s.async );
					}

					// Apply custom fields if provided
					if ( s.xhrFields ) {
						for ( i in s.xhrFields ) {
							xhr[ i ] = s.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( s.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( s.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !s.crossDomain && !headers["X-Requested-With"] ) {
						headers[ "X-Requested-With" ] = "XMLHttpRequest";
					}

					// Need an extra try/catch for cross domain requests in Firefox 3
					try {
						for ( i in headers ) {
							xhr.setRequestHeader( i, headers[ i ] );
						}
					} catch( _ ) {}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( s.hasContent && s.data ) || null );

					// Listener
					callback = function( _, isAbort ) {

						var status,
							statusText,
							responseHeaders,
							responses,
							xml;

						// Firefox throws exceptions when accessing properties
						// of an xhr when a network error occurred
						// http://helpful.knobs-dials.com/index.php/Component_returned_failure_code:_0x80040111_(NS_ERROR_NOT_AVAILABLE)
						try {

							// Was never called and is aborted or complete
							if ( callback && ( isAbort || xhr.readyState === 4 ) ) {

								// Only called once
								callback = undefined;

								// Do not keep as active anymore
								if ( handle ) {
									xhr.onreadystatechange = jQuery.noop;
									if ( xhrOnUnloadAbort ) {
										delete xhrCallbacks[ handle ];
									}
								}

								// If it's an abort
								if ( isAbort ) {
									// Abort it manually if needed
									if ( xhr.readyState !== 4 ) {
										xhr.abort();
									}
								} else {
									status = xhr.status;
									responseHeaders = xhr.getAllResponseHeaders();
									responses = {};
									xml = xhr.responseXML;

									// Construct response list
									if ( xml && xml.documentElement /* #4958 */ ) {
										responses.xml = xml;
									}

									// When requesting binary data, IE6-9 will throw an exception
									// on any attempt to access responseText (#11426)
									try {
										responses.text = xhr.responseText;
									} catch( e ) {
									}

									// Firefox throws an exception when accessing
									// statusText for faulty cross-domain requests
									try {
										statusText = xhr.statusText;
									} catch( e ) {
										// We normalize with Webkit giving an empty statusText
										statusText = "";
									}

									// Filter status for non standard behaviors

									// If the request is local and we have data: assume a success
									// (success with no data won't get notified, that's the best we
									// can do given current implementations)
									if ( !status && s.isLocal && !s.crossDomain ) {
										status = responses.text ? 200 : 404;
									// IE - #1450: sometimes returns 1223 when it should be 204
									} else if ( status === 1223 ) {
										status = 204;
									}
								}
							}
						} catch( firefoxAccessException ) {
							if ( !isAbort ) {
								complete( -1, firefoxAccessException );
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, responseHeaders );
						}
					};

					if ( !s.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback, 0 );
					} else {
						handle = ++xhrId;
						if ( xhrOnUnloadAbort ) {
							// Create the active xhrs callbacks list if needed
							// and attach the unload handler
							if ( !xhrCallbacks ) {
								xhrCallbacks = {};
								jQuery( window ).unload( xhrOnUnloadAbort );
							}
							// Add to list of active xhrs callbacks
							xhrCallbacks[ handle ] = callback;
						}
						xhr.onreadystatechange = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback(0,1);
					}
				}
			};
		}
	});
}
var fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([-+])=|)(" + core_pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [function( prop, value ) {
			var end, unit,
				tween = this.createTween( prop, value ),
				parts = rfxnum.exec( value ),
				target = tween.cur(),
				start = +target || 0,
				scale = 1,
				maxIterations = 20;

			if ( parts ) {
				end = +parts[2];
				unit = parts[3] || ( jQuery.cssNumber[ prop ] ? "" : "px" );

				// We need to compute starting value
				if ( unit !== "px" && start ) {
					// Iteratively approximate from a nonzero starting point
					// Prefer the current property, because this process will be trivial if it uses the same units
					// Fallback to end or a simple constant
					start = jQuery.css( tween.elem, prop, true ) || end || 1;

					do {
						// If previous iteration zeroed out, double until we get *something*
						// Use a string for doubling factor so we don't accidentally see scale as unchanged below
						scale = scale || ".5";

						// Adjust and apply
						start = start / scale;
						jQuery.style( tween.elem, prop, start + unit );

					// Update scale, tolerating zero or NaN from tween.cur()
					// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
					} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
				}

				tween.unit = unit;
				tween.start = start;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[1] ? start + ( parts[1] + 1 ) * end : end;
			}
			return tween;
		}]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	}, 0 );
	return ( fxNow = jQuery.now() );
}

function createTweens( animation, props ) {
	jQuery.each( props, function( prop, value ) {
		var collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
			index = 0,
			length = collection.length;
		for ( ; index < length; index++ ) {
			if ( collection[ index ].call( animation, prop, value ) ) {

				// we're done with this property
				return;
			}
		}
	});
}

function Animation( elem, properties, options ) {
	var result,
		index = 0,
		tweenerIndex = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end, easing ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;

				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	createTweens( animation, props );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			anim: animation,
			queue: animation.opts.queue,
			elem: elem
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

jQuery.Animation = jQuery.extend( Animation, {

	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

function defaultPrefilter( elem, props, opts ) {
	var index, prop, value, length, dataShow, toggle, tween, hooks, oldfire,
		anim = this,
		style = elem.style,
		orig = {},
		handled = [],
		hidden = elem.nodeType && isHidden( elem );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		if ( jQuery.css( elem, "display" ) === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !jQuery.support.inlineBlockNeedsLayout || css_defaultDisplay( elem.nodeName ) === "inline" ) {
				style.display = "inline-block";

			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !jQuery.support.shrinkWrapBlocks ) {
			anim.done(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}


	// show/hide pass
	for ( index in props ) {
		value = props[ index ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ index ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {
				continue;
			}
			handled.push( index );
		}
	}

	length = handled.length;
	if ( length ) {
		dataShow = jQuery._data( elem, "fxshow" ) || jQuery._data( elem, "fxshow", {} );
		if ( "hidden" in dataShow ) {
			hidden = dataShow.hidden;
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery.removeData( elem, "fxshow", true );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( index = 0 ; index < length ; index++ ) {
			prop = handled[ index ];
			tween = anim.createTween( prop, hidden ? dataShow[ prop ] : 0 );
			orig[ prop ] = dataShow[ prop ] || jQuery.style( elem, prop );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing any value as a 4th parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, false, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Remove in 2.0 - this supports IE8's panic based approach
// to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ||
			// special check for .toggle( handler, handler, ... )
			( !i && jQuery.isFunction( speed ) && jQuery.isFunction( easing ) ) ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations resolve immediately
				if ( empty ) {
					anim.stop( true );
				}
			};

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	}
});

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth? 1 : 0;
	for( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p*Math.PI ) / 2;
	}
};

jQuery.timers = [];
jQuery.fx = Tween.prototype.init;
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	if ( timer() && jQuery.timers.push( timer ) && !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.interval = 13;

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};

// Back Compat <1.8 extension point
jQuery.fx.step = {};

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.animated = function( elem ) {
		return jQuery.grep(jQuery.timers, function( fn ) {
			return elem === fn.elem;
		}).length;
	};
}
var rroot = /^(?:body|html)$/i;

jQuery.fn.offset = function( options ) {
	if ( arguments.length ) {
		return options === undefined ?
			this :
			this.each(function( i ) {
				jQuery.offset.setOffset( this, options, i );
			});
	}

	var docElem, body, win, clientTop, clientLeft, scrollTop, scrollLeft,
		box = { top: 0, left: 0 },
		elem = this[ 0 ],
		doc = elem && elem.ownerDocument;

	if ( !doc ) {
		return;
	}

	if ( (body = doc.body) === elem ) {
		return jQuery.offset.bodyOffset( elem );
	}

	docElem = doc.documentElement;

	// Make sure it's not a disconnected DOM node
	if ( !jQuery.contains( docElem, elem ) ) {
		return box;
	}

	// If we don't have gBCR, just use 0,0 rather than error
	// BlackBerry 5, iOS 3 (original iPhone)
	if ( typeof elem.getBoundingClientRect !== "undefined" ) {
		box = elem.getBoundingClientRect();
	}
	win = getWindow( doc );
	clientTop  = docElem.clientTop  || body.clientTop  || 0;
	clientLeft = docElem.clientLeft || body.clientLeft || 0;
	scrollTop  = win.pageYOffset || docElem.scrollTop;
	scrollLeft = win.pageXOffset || docElem.scrollLeft;
	return {
		top: box.top  + scrollTop  - clientTop,
		left: box.left + scrollLeft - clientLeft
	};
};

jQuery.offset = {

	bodyOffset: function( body ) {
		var top = body.offsetTop,
			left = body.offsetLeft;

		if ( jQuery.support.doesNotIncludeMarginInBodyOffset ) {
			top  += parseFloat( jQuery.css(body, "marginTop") ) || 0;
			left += parseFloat( jQuery.css(body, "marginLeft") ) || 0;
		}

		return { top: top, left: left };
	},

	setOffset: function( elem, options, i ) {
		var position = jQuery.css( elem, "position" );

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		var curElem = jQuery( elem ),
			curOffset = curElem.offset(),
			curCSSTop = jQuery.css( elem, "top" ),
			curCSSLeft = jQuery.css( elem, "left" ),
			calculatePosition = ( position === "absolute" || position === "fixed" ) && jQuery.inArray("auto", [curCSSTop, curCSSLeft]) > -1,
			props = {}, curPosition = {}, curTop, curLeft;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};


jQuery.fn.extend({

	position: function() {
		if ( !this[0] ) {
			return;
		}

		var elem = this[0],

		// Get *real* offsetParent
		offsetParent = this.offsetParent(),

		// Get correct offsets
		offset       = this.offset(),
		parentOffset = rroot.test(offsetParent[0].nodeName) ? { top: 0, left: 0 } : offsetParent.offset();

		// Subtract element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		offset.top  -= parseFloat( jQuery.css(elem, "marginTop") ) || 0;
		offset.left -= parseFloat( jQuery.css(elem, "marginLeft") ) || 0;

		// Add offsetParent borders
		parentOffset.top  += parseFloat( jQuery.css(offsetParent[0], "borderTopWidth") ) || 0;
		parentOffset.left += parseFloat( jQuery.css(offsetParent[0], "borderLeftWidth") ) || 0;

		// Subtract the two offsets
		return {
			top:  offset.top  - parentOffset.top,
			left: offset.left - parentOffset.left
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || document.body;
			while ( offsetParent && (!rroot.test(offsetParent.nodeName) && jQuery.css(offsetParent, "position") === "static") ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || document.body;
		});
	}
});


// Create scrollLeft and scrollTop methods
jQuery.each( {scrollLeft: "pageXOffset", scrollTop: "pageYOffset"}, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return jQuery.access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					 top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}
// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return jQuery.access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, value, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});
// Expose jQuery to the global object
window.jQuery = window.$ = jQuery;

// Expose jQuery as an AMD module, but only for AMD loaders that
// understand the issues with loading multiple versions of jQuery
// in a page that all might call define(). The loader will indicate
// they have special allowances for multiple jQuery versions by
// specifying define.amd.jQuery = true. Register as a named module,
// since jQuery can be concatenated with other files that may use define,
// but not use a proper concatenation script that understands anonymous
// AMD modules. A named AMD is safest and most robust way to register.
// Lowercase jquery is used because AMD module names are derived from
// file names, and jQuery is normally delivered in a lowercase file name.
// Do this after creating the global so that if an AMD module wants to call
// noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd && define.amd.jQuery ) {
	define( "jquery", [], function () { return jQuery; } );
}

})( window );

define("jquery/jquery-1.8.3", function(){});

/**
 * Patterns logging - minimal logging framework
 *
 * Copyright 2012 Simplon B.V.
 */

(function() {
    // source: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/bind
    if (!Function.prototype.bind) {
        Function.prototype.bind = function (oThis) {
            if (typeof this !== "function") {
                // closest thing possible to the ECMAScript 5 internal IsCallable function
                throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
            }

            var aArgs = Array.prototype.slice.call(arguments, 1),
                fToBind = this,
                fNOP = function () {},
                fBound = function () {
                    return fToBind.apply(this instanceof fNOP &&
                            oThis ? this : oThis,
                            aArgs.concat(Array.prototype.slice.call(arguments)));
                };
            fNOP.prototype = this.prototype;
            fBound.prototype = new fNOP();

            return fBound;
        };
    }

    var root,    // root logger instance
        writer;  // writer instance, used to output log entries

    var Level = {
        DEBUG: 10,
        INFO: 20,
        WARN: 30,
        ERROR: 40,
        FATAL: 50
    };

    function IEConsoleWriter() {
    }

    IEConsoleWriter.prototype = {
        output:  function(log_name, level, messages) {
            // console.log will magically appear in IE8 when the user opens the
            // F12 Developer Tools, so we have to test for it every time.
            if (typeof window.console==="undefined" || typeof console.log==="undefined")
                    return;
            if (log_name)
                messages.unshift(log_name+":");
            var message = messages.join(" ");

            // Under some conditions console.log will be available but the
            // other functions are missing.
            if (typeof console.info===undefined) {
                var level_name;
                if (level<=Level.DEBUG)
                    level_name="DEBUG";
                else if (level<=Level.INFO)
                    level_name="INFO";
                else if (level<=Level.WARN)
                    level_name="WARN";
                else if (level<=Level.ERROR)
                    level_name="ERROR";
                else
                    level_name="FATAL";
                console.log("["+level_name+"] "+message);
            } else {
                if (level<=Level.DEBUG) {
                    // console.debug exists but is deprecated
                    message="[DEBUG] "+message;
                    console.log(message);
                } else if (level<=Level.INFO)
                    console.info(message);
                else if (level<=Level.WARN)
                    console.warn(message);
                else
                    console.error(message);
            }
        }
    };


    function ConsoleWriter() {
    }

    ConsoleWriter.prototype = {
        output: function(log_name, level, messages) {
            if (log_name)
                messages.unshift(log_name+":");
            if (level<=Level.DEBUG) {
                // console.debug exists but is deprecated
                messages.unshift("[DEBUG]");
                console.log.apply(console, messages);
            } else if (level<=Level.INFO)
                console.info.apply(console, messages);
            else if (level<=Level.WARN)
                console.warn.apply(console, messages);
            else
                console.error.apply(console, messages);
        }
    };


    function Logger(name, parent) {
        this._loggers={};
        this.name=name || "";
        this._parent=parent || null;
        if (!parent) {
            this._enabled=true;
            this._level=Level.WARN;
        }
    }

    Logger.prototype = {
        getLogger: function(name) {
            var path = name.split("."),
                root = this,
                route = this.name ? [this.name] : [];
            while (path.length) {
                var entry = path.shift();
                route.push(entry);
                if (!(entry in root._loggers))
                    root._loggers[entry] = new Logger(route.join("."), root);
                root=root._loggers[entry];
            }
            return root;
        },

        _getFlag: function(flag) {
            var context=this;
            flag="_"+flag;
            while (context!==null) {
                if (context[flag]!==undefined)
                    return context[flag];
                context=context._parent;
            }
            return null;
        },

        setEnabled: function(state) {
            this._enabled=!!state;
        },

        isEnabled: function() {
            this._getFlag("enabled");
        },

        setLevel: function(level) {
            if (typeof level==="number")
                this._level=level;
            else if (typeof level==="string") {
                level=level.toUpperCase();
                if (level in Level)
                    this._level=Level[level];
            }
        },

        getLevel: function() {
            return this._getFlag("level");
        },

        log: function(level, messages) {
            if (!messages.length || !this._getFlag("enabled") || level<this._getFlag("level"))
                return;
            messages=Array.prototype.slice.call(messages);
            writer.output(this.name, level, messages);
        },

        debug: function() {
            this.log(Level.DEBUG, arguments);
        },

        info: function() {
            this.log(Level.INFO, arguments);
        },

        warn: function() {
            this.log(Level.WARN, arguments);
        },

        error: function() {
            this.log(Level.ERROR, arguments);
        },

        fatal: function() {
            this.log(Level.FATAL, arguments);
        }
    };

    function getWriter() {
        return writer;
    }

    function setWriter(w) {
        writer=w;
    }

    if (window.console && window.console.log && window.console.log.apply!==undefined)
        setWriter(new ConsoleWriter());
    else
        setWriter(new IEConsoleWriter());

    root=new Logger();

    var logconfig = /loglevel(|-[^=]+)=([^&]+)/g,
        match;

    while ((match=logconfig.exec(window.location.search))!==null) {
        var logger = (match[1]==="") ? root : root.getLogger(match[1].slice(1));
        logger.setLevel(match[2].toUpperCase());
    }

    var api = {
        Level: Level,
        getLogger: root.getLogger.bind(root),
        setEnabled: root.setEnabled.bind(root),
        isEnabled: root.isEnabled.bind(root),
        setLevel: root.setLevel.bind(root),
        getLevel: root.getLevel.bind(root),
        debug: root.debug.bind(root),
        info: root.info.bind(root),
        warn: root.warn.bind(root),
        error: root.error.bind(root),
        fatal: root.fatal.bind(root),
        getWriter: getWriter,
        setWriter: setWriter
    };

    // Expose as either an AMD module if possible. If not fall back to exposing
    // a global object.
    if (typeof define==="function")
        define("logging", [], function () {
            return api;
        });
    else
        window.logging=api;
})();

define("logging/logging", function(){});

/**
 * Patterns logger - wrapper around logging library
 *
 * Copyright 2012-2013 Florian Friesdorf
 */
define('core/logger',[
    'logging'
], function(logging) {
    var log = logging.getLogger('patterns');
    return log;
});

/**
 * Patterns parser - Argument parser
 *
 * Copyright 2012-2013 Florian Friesdorf
 * Copyright 2012-2013 Simplon B.V. - Wichert Akkerman
 */
define('core/parser',[
    'jquery',
    './logger'
], function($, logger) {
    function ArgumentParser(name, opts) {
        opts = opts || {};
        this.inherit = typeof opts.inherit === "undefined" ?
            true : opts.inherit;
        this.order = [];
        this.parameters = {};
        this.attribute = "data-pat-" + name;
        this.enum_values = {};
        this.enum_conflicts = [];
        this.groups = {};
        this.possible_groups = {};
        this.log = logger.getLogger(name + ".parser");
    }

    ArgumentParser.prototype = {
        group_pattern: /([a-z][a-z0-9]*)-([A-Z][a-z0-0\-]*)/i,
        named_param_pattern: /^\s*([a-z][a-z0-9\-]*)\s*:(.*)/i,
        token_pattern: /((["']).*?(?!\\)\2)|\s*(\S+)\s*/g,

        _camelCase: function(str) {
            return str.replace(/\-([a-z])/g, function(_, p1){
                return p1.toUpperCase();
            });
        },

        add_argument: function(name, default_value, choices, multiple) {
            var spec, m;

            if (multiple && !Array.isArray(default_value))
                default_value=[default_value];
            spec={name: name,
                  value: default_value,
                  multiple: multiple,
                  dest: name,
                  group: null};

            if (choices && Array.isArray(choices) && choices.length) {
                spec.choices=choices;
                spec.type=this._typeof(choices[0]);
                for (var i=0; i<choices.length; i++)
                    if (this.enum_conflicts.indexOf(choices[i])!==-1)
                        continue;
                    else if (choices[i] in this.enum_values) {
                        this.enum_conflicts.push(choices[i]);
                        delete this.enum_values[choices[i]];
                    } else
                        this.enum_values[choices[i]]=name;
            } else if (typeof spec.value==="string" && spec.value.slice(0, 1)==="$")
                spec.type=this.parameters[spec.value.slice(1)].type;
            else
                // Note that this will get reset by _defaults if default_value is a function.
                spec.type=this._typeof(multiple ? spec.value[0] : spec.value);

            m=name.match(this.group_pattern);
            if (m) {
                var group=m[1], field=m[2];
                if (group in this.possible_groups) {
                    var first_spec = this.possible_groups[group],
                        first_name = first_spec.name.match(this.group_pattern)[2];
                    first_spec.group=group;
                    first_spec.dest=first_name;
                    this.groups[group]=new ArgumentParser();
                    this.groups[group].add_argument(
                            first_name,
                            spec.value, spec.cohices, spec.multiple);
                    delete this.possible_groups[group];
                }
                if (group in this.groups) {
                    this.groups[group].add_argument(field, default_value, choices, multiple);
                    spec.group=group;
                    spec.dest=field;
                } else {
                    this.possible_groups[group]=spec;
                    spec.dest=this._camelCase(spec.name);
                }
            }
            this.order.push(name);
            this.parameters[name]=spec;
        },

        _typeof: function(obj) {
            var type = typeof obj;
            if (obj===null)
                return "null";
            return type;
        },

        _coerce: function(name, value) {
            var spec=this.parameters[name];

            if (typeof value !== spec.type)
                try {
                    switch (spec.type) {
                        case "boolean":
                            if (typeof value === "string") {
                                value=value.toLowerCase();
                                var num = parseInt(value, 10);
                                if (!isNaN(num))
                                    value=!!num;
                                else
                                    value=(value==="true" || value==="y" || value==="yes" || value==="y");
                            } else if (typeof value === "number")
                                value=!!value;
                            else
                                throw ("Cannot convert value for " + name + " to boolean");
                            break;
                        case "number":
                            if (typeof value === "string") {
                                value=parseInt(value, 10);
                                if (isNaN(value))
                                    throw ("Cannot convert value for " + name + " to number");
                            } else if (typeof value === "boolean")
                                value=value + 0;
                            else
                                throw ("Cannot convert value for " + name + " to number");
                            break;
                        case "string":
                            value=value.toString();
                            break;
                        case "null":  // Missing default values
                        case "undefined":
                            break;
                        default:
                            throw ("Do not know how to convert value for " + name + " to " + spec.type);
                    }
                } catch (e) {
                    this.log.warn(e);
                    return null;
                }

            if (spec.choices && spec.choices.indexOf(value)===-1) {
                this.log.warn("Illegal value for " + name + ": " + value);
                return null;
            }

            return value;
        },

        _set: function(opts, name, value) {
            if (!(name in this.parameters)) {
                this.log.debug("Ignoring value for unknown argument " + name);
                return;
            }

            var spec=this.parameters[name];
            if (spec.multiple) {
                var parts=value.split(/,+/), i, v;
                value=[];
                for (i=0; i<parts.length; i++) {
                    v=this._coerce(name, parts[i].trim());
                    if (v!==null)
                        value.push(v);
                }
            } else {
                value=this._coerce(name, value);
                if (value===null)
                    return;
            }

            opts[name]=value;
        },

        _split: function(text) {
            var tokens = [];

            text.replace(this.token_pattern, function(match, quoted, _, simple) {
                if (quoted)
                    tokens.push(quoted);
                else if (simple)
                    tokens.push(simple);
            });
            return tokens;
        },

        _parseExtendedNotation: function(parameter) {
            var opts = {}, i,
                parts, matches;

            parts = parameter.replace(";;", "\xff")
                        .split(";")
                        .map(function(el) { return el.replace("\xff", ";"); });
            for (i=0; i<parts.length; i++) {
                if (!parts[i])
                    continue;

                matches = parts[i].match(this.named_param_pattern);
                if (!matches) {
                    this.log.warn("Invalid parameter: " + parts[i]);
                    break;
                }

                var name = matches[1],
                    value = matches[2].trim();

                if (name in this.parameters)
                    this._set(opts, name, value);
                else if (name in this.groups) {
                    var subopt = this.groups[name]._parseShorthandNotation(value);
                    for (var field in subopt)
                        this._set(opts, name+"-"+field, subopt[field]);
                } else {
                    this.log.warn("Unknown named parameter " + matches[1]);
                    continue;
                }
            }

            return opts;
        },

        _parseShorthandNotation: function(parameter) {
            var parts = this._split(parameter),
                opts = {},
                positional = true,
                i, part, flag, sense;

            i=0;
            while (parts.length) {
                part=parts.shift().trim();
                if (part.slice(0, 3)==="no-") {
                    sense=false;
                    flag=part.slice(3);
                } else {
                    sense=true;
                    flag=part;
                }
                if (flag in this.parameters && this.parameters[flag].type==="boolean") {
                    positional=false;
                    this._set(opts, flag, sense);
                } else if (flag in this.enum_values) {
                    positional=false;
                    this._set(opts, this.enum_values[flag], flag);
                } else if (positional)
                    this._set(opts, this.order[i], part);
                else {
                    parts.unshift(part);
                    break;
                }

                i++;
                if (i>=this.order.length)
                    break;
            }
            if (parts.length)
                this.log.warn("Ignore extra arguments: " + parts.join(" "));
            return opts;
        },

        _parse: function(parameter) {
            var opts, extended, sep;

            if (!parameter)
                return {};

            if (parameter.match(this.named_param_pattern))
                return this._parseExtendedNotation(parameter);

            sep=parameter.indexOf(";");
            if (sep===-1)
                return this._parseShorthandNotation(parameter);

            opts=this._parseShorthandNotation(parameter.slice(0, sep));
            extended=this._parseExtendedNotation(parameter.slice(sep+1));
            for (var name in extended)
                opts[name]=extended[name];
            return opts;
        },

        _defaults: function($el) {
            var result = {};
            for (var name in this.parameters)
                if (typeof this.parameters[name].value==="function")
                    try {
                        result[name]=this.parameters[name].value($el, name);
                        this.parameters[name].type=typeof result[name];
                    } catch(e) {
                        this.log.error("Default function for " + name + " failed.");
                    }
                else
                    result[name]=this.parameters[name].value;
            return result;
        },

        _cleanupOptions: function(options) {
            var keys = Object.keys(options),
                i, spec, name, target;

            // Resolve references
            for (i=0; i<keys.length; i++) {
                name=keys[i];
                spec=this.parameters[name];
                if (spec===undefined)
                    continue;

                if (options[name]===spec.value &&
                        typeof spec.value==="string" && spec.value.slice(0, 1)==="$")
                    options[name]=options[spec.value.slice(1)];
            }

            // Move options into groups and do renames
            keys=Object.keys(options);
            for (i=0; i<keys.length; i++) {
                name=keys[i];
                spec=this.parameters[name];
                if (spec===undefined)
                    continue;

                if (spec.group)  {
                    if (typeof options[spec.group]!=="object")
                        options[spec.group]={};
                    target=options[spec.group];
                } else
                    target=options;

                if (spec.dest!==name) {
                    target[spec.dest]=options[name];
                    delete options[name];
                }
            }
        },

        parse: function($el, options, multiple) {
            if (typeof options==="boolean" && multiple===undefined) {
                multiple=options;
                options={};
            }

            var stack = [[this._defaults($el)]];

            var $possible_config_providers = this.inherit ?
                    $el.parents().andSelf() : $el,
                final_length = 1,
                i, data, frame;
            for (i=0; i<$possible_config_providers.length; i++) {
                data = $possible_config_providers.eq(i).attr(this.attribute);
                if (data) {
                    var _parse = this._parse.bind(this); // Needed to fix binding in map call
                    if (data.match(/&&/))
                        frame=data.split(/\s*&&\s*/).map(_parse);
                    else
                        frame=[_parse(data)];
                    final_length = Math.max(frame.length, final_length);
                    stack.push(frame);
                }
            }
            if (typeof options==="object") {
                if (Array.isArray(options)) {
                    stack.push(options);
                    final_length=Math.max(options.length, final_length);
                } else
                    stack.push([options]);
            }

            if (!multiple)
                final_length=1;

            var results=[], frame_length, x, xf;
            for (i=0; i<final_length; i++)
                results.push({});

            for (i=0; i<stack.length; i++) {
                frame=stack[i];
                frame_length=frame.length-1;

                for (x=0; x<final_length; x++) {
                    xf=(x>frame_length) ? frame_length : x;
                    results[x]=$.extend(results[x], frame[xf]);
                }
            }

            for (i=0; i<results.length; i++)
                this._cleanupOptions(results[i]);

            return multiple ? results : results[0];
        }
    };

    return ArgumentParser;
});
// jshint indent: 4, browser: true, jquery: true, quotmark: double
// vim: sw=4 expandtab
;
define('utils',[
    "jquery"
], function($) {
    var jquery_plugin = function(pattern) {
        var plugin = function(method) {
            var $this = this;
            if ($this.length === 0)
                return $this;
            if (!method || typeof method === "object") {
                pattern.init.apply(
                    $this,
                    [$this].concat(Array.prototype.slice.call(arguments)));
            } else if (pattern[method]) {
                return pattern[method].apply(
                    $this,
                    [$this].concat(Array.prototype.slice.call(arguments, 1))
                );
            } else {
                $.error("Method " + method +
                        " does not exist on jQuery." + pattern.name);
            }
            return $this;
        };
        return plugin;
    };

    //     Underscore.js 1.3.1
    //     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
    //     Underscore is freely distributable under the MIT license.
    //     Portions of Underscore are inspired or borrowed from Prototype,
    //     Oliver Steele's Functional, and John Resig's Micro-Templating.
    //     For all details and documentation:
    //     http://documentcloud.github.com/underscore
    //
    // Returns a function, that, as long as it continues to be invoked, will not
    // be triggered. The function will be called after it stops being called for
    // N milliseconds.
    var debounce = function(func, wait) {
        var timeout;
        return function() {
            var context = this, args = arguments;
            var later = function() {
                timeout = null;
                func.apply(context, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    var rebaseURL = function(base, url) {
        if (url.indexOf("://")!==-1 || url[0]==="/")
            return url;
        return base.slice(0, base.lastIndexOf("/")+1) + url;
    };

    function findLabel(input) {
        for (var label=input.parentNode; label && label.nodeType!==11; label=label.parentNode)
            if (label.tagName==="LABEL")
                return label;

        var $label;

        if (input.id)
            $label = $("label[for="+input.id+"]");
        if ($label && $label.length===0 && input.form)
            $label = $("label[for="+input.name+"]", input.form);
        if ($label && $label.length)
            return $label[0];
        else
            return null;
    }

    // Taken from http://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport
    function elementInViewport(el) {
       var rect = el.getBoundingClientRect(),
           docEl = document.documentElement,
           vWidth = window.innerWidth || docEl.clientWidth,
           vHeight = window.innerHeight || docEl.clientHeight;

        if (rect.right<0 || rect.bottom<0 || rect.left>vWidth || rect.top>vHeight)
            return false;
        return true;
    }


    // Taken from http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
    function escapeRegExp(str) {
        return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
    }

    function removeWildcardClass($targets, classes) {
        if (classes.indexOf("*")===-1)
            $targets.removeClass(classes);
        else {
            var matcher = classes.replace(/[\-\[\]{}()+?.,\\\^$|#\s]/g, "\\$&");
            matcher = matcher.replace(/[*]/g, ".*");
            matcher = new RegExp("^" + matcher + "$");
            $targets.filter("[class]").each(function() {
                var $this = $(this),
                    classes = $this.attr("class").split(/\s+/),
                    ok=[];
                for (var i=0; i<classes.length; i++)
                    if (!matcher.test(classes[i]))
                        ok.push(classes[i]);
                if (ok.length)
                    $this.attr("class", ok.join(" "));
                else
                    $this.removeAttr("class");
            });
        }
    }

    var transitions = {
        none: {hide: "hide", show: "show"},
        fade: {hide: "fadeOut", show: "fadeIn"},
        slide: {hide: "slideUp", show: "slideDown"}
    };

    function hideOrShow($slave, visible, options, pattern_name) {
        var duration = (options.transition==="css" || options.transition==="none") ? null : options.effect.duration;

        $slave.removeClass("visible hidden in-progress");
        var onComplete = function() {
            $slave
                .removeClass("in-progress")
                .addClass(visible ? "visible" : "hidden")
                .trigger("pat-update",
                        {pattern: pattern_name,
                         transition: "complete"});
        };
        if (!duration) {
            if (options.transition!=="css")
                $slave[visible ? "show" : "hide"]();
            onComplete();
        } else {
            var t = transitions[options.transition];
            $slave
                .addClass("in-progress")
                .trigger("pat-update",
                        {pattern: pattern_name,
                         transition: "start"});
            $slave[visible ? t.show : t.hide]({
                duration: duration,
                easing: options.effect.easing,
                complete: onComplete
            });
        }
    }

    var utils = {
        // pattern pimping - own module?
        jquery_plugin: jquery_plugin,
        debounce: debounce,
        escapeRegExp: escapeRegExp,
        rebaseURL: rebaseURL,
        findLabel: findLabel,
        elementInViewport: elementInViewport,
        removeWildcardClass: removeWildcardClass,
        hideOrShow: hideOrShow
    };

    return utils;
});

define('compat',[],function() {

    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/every (JS 1.6)
    if (!Array.prototype.every)
    {
        Array.prototype.every = function(fun /*, thisp */)
        {
            

            if (this === null)
                throw new TypeError();

            var t = Object(this);
            var len = t.length >>> 0;
            if (typeof fun !== "function")
                throw new TypeError();

            var thisp = arguments[1];
            for (var i = 0; i < len; i++)
            {
                if (i in t && !fun.call(thisp, t[i], i, t))
                    return false;
            }

            return true;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/filter (JS 1.6)
    if (!Array.prototype.filter) {
        Array.prototype.filter = function(fun /*, thisp */) {
            

            if (this === null)
                throw new TypeError();

            var t = Object(this);
            var len = t.length >>> 0;
            if (typeof fun !== "function")
                throw new TypeError();

            var res = [];
            var thisp = arguments[1];
            for (var i = 0; i < len; i++)
            {
                if (i in t)
                {
                    var val = t[i]; // in case fun mutates this
                    if (fun.call(thisp, val, i, t))
                        res.push(val);
                }
            }

            return res;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/forEach (JS 1.6)
    // Production steps of ECMA-262, Edition 5, 15.4.4.18
    // Reference: http://es5.github.com/#x15.4.4.18
    if ( !Array.prototype.forEach ) {

        Array.prototype.forEach = function( callback, thisArg ) {

            var T, k;

            if ( this === null ) {
                throw new TypeError( " this is null or not defined" );
            }

            // 1. Let O be the result of calling ToObject passing the |this| value as the argument.
            var O = Object(this);

            // 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".
            // 3. Let len be ToUint32(lenValue).
            var len = O.length >>> 0; // Hack to convert O.length to a UInt32

            // 4. If IsCallable(callback) is false, throw a TypeError exception.
            // See: http://es5.github.com/#x9.11
            if ( {}.toString.call(callback) !== "[object Function]" ) {
                throw new TypeError( callback + " is not a function" );
            }

            // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
            if ( thisArg ) {
                T = thisArg;
            }

            // 6. Let k be 0
            k = 0;

            // 7. Repeat, while k < len
            while( k < len ) {

                var kValue;

                // a. Let Pk be ToString(k).
                //   This is implicit for LHS operands of the in operator
                // b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.
                //   This step can be combined with c
                // c. If kPresent is true, then
                if ( k in O ) {

                    // i. Let kValue be the result of calling the Get internal method of O with argument Pk.
                    kValue = O[ k ];

                    // ii. Call the Call internal method of callback with T as the this value and
                    // argument list containing kValue, k, and O.
                    callback.call( T, kValue, k, O );
                }
                // d. Increase k by 1.
                k++;
            }
            // 8. return undefined
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/indexOf (JS 1.6)
    if (!Array.prototype.indexOf) {
        Array.prototype.indexOf = function (searchElement /*, fromIndex */ ) {
            
            if (this === null) {
                throw new TypeError();
            }
            var t = Object(this);
            var len = t.length >>> 0;
            if (len === 0) {
                return -1;
            }
            var n = 0;
            if (arguments.length > 0) {
                n = Number(arguments[1]);
                if (n !== n) { // shortcut for verifying if it's NaN
                    n = 0;
                } else if (n !== 0 && n !== Infinity && n !== -Infinity) {
                    n = (n > 0 || -1) * Math.floor(Math.abs(n));
                }
            }
            if (n >= len) {
                return -1;
            }
            var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
            for (; k < len; k++) {
                if (k in t && t[k] === searchElement) {
                    return k;
                }
            }
            return -1;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/lastIndexOf (JS 1.6)
    if (!Array.prototype.lastIndexOf) {
        Array.prototype.lastIndexOf = function(searchElement /*, fromIndex*/) {
            

            if (this === null)
                throw new TypeError();

            var t = Object(this);
            var len = t.length >>> 0;
            if (len === 0)
                return -1;

            var n = len;
            if (arguments.length > 1)
            {
                n = Number(arguments[1]);
                if (n !== n)
                    n = 0;
                else if (n !== 0 && n !== (1 / 0) && n !== -(1 / 0))
                    n = (n > 0 || -1) * Math.floor(Math.abs(n));
            }

            var k = n >= 0 ? Math.min(n, len - 1) : len - Math.abs(n);

            for (; k >= 0; k--)
            {
                if (k in t && t[k] === searchElement)
                    return k;
            }
            return -1;
        };
    }


    // source: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/map (JS 1.6)
    // Production steps of ECMA-262, Edition 5, 15.4.4.19
    // Reference: http://es5.github.com/#x15.4.4.19
    if (!Array.prototype.map) {
        Array.prototype.map = function(callback, thisArg) {

            var T, A, k;

            if (this === null) {
                throw new TypeError(" this is null or not defined");
            }

            // 1. Let O be the result of calling ToObject passing the |this| value as the argument.
            var O = Object(this);

            // 2. Let lenValue be the result of calling the Get internal method of O with the argument "length".
            // 3. Let len be ToUint32(lenValue).
            var len = O.length >>> 0;

            // 4. If IsCallable(callback) is false, throw a TypeError exception.
            // See: http://es5.github.com/#x9.11
            if ({}.toString.call(callback) !== "[object Function]") {
                throw new TypeError(callback + " is not a function");
            }

            // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
            if (thisArg) {
                T = thisArg;
            }

            // 6. Let A be a new array created as if by the expression new Array(len) where Array is
            // the standard built-in constructor with that name and len is the value of len.
            A = new Array(len);

            // 7. Let k be 0
            k = 0;

            // 8. Repeat, while k < len
            while(k < len) {

                var kValue, mappedValue;

                // a. Let Pk be ToString(k).
                //   This is implicit for LHS operands of the in operator
                // b. Let kPresent be the result of calling the HasProperty internal method of O with argument Pk.
                //   This step can be combined with c
                // c. If kPresent is true, then
                if (k in O) {

                    // i. Let kValue be the result of calling the Get internal method of O with argument Pk.
                    kValue = O[ k ];

                    // ii. Let mappedValue be the result of calling the Call internal method of callback
                    // with T as the this value and argument list containing kValue, k, and O.
                    mappedValue = callback.call(T, kValue, k, O);

                    // iii. Call the DefineOwnProperty internal method of A with arguments
                    // Pk, Property Descriptor {Value: mappedValue, Writable: true, Enumerable: true, Configurable: true},
                    // and false.

                    // In browsers that support Object.defineProperty, use the following:
                    // Object.defineProperty(A, Pk, { value: mappedValue, writable: true, enumerable: true, configurable: true });

                    // For best browser support, use the following:
                    A[ k ] = mappedValue;
                }
                // d. Increase k by 1.
                k++;
            }

            // 9. return A
            return A;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/Reduce (JS 1.8)
    if (!Array.prototype.reduce) {
        Array.prototype.reduce = function reduce(accumulator){
            if (this===null || this===undefined) throw new TypeError("Object is null or undefined");
            var i = 0, l = this.length >> 0, curr;

            if(typeof accumulator !== "function") // ES5 : "If IsCallable(callbackfn) is false, throw a TypeError exception."
                throw new TypeError("First argument is not callable");

            if(arguments.length < 2) {
                if (l === 0) throw new TypeError("Array length is 0 and no second argument");
                curr = this[0];
                i = 1; // start accumulating at the second element
            }
            else
                curr = arguments[1];

            while (i < l) {
                if(i in this) curr = accumulator.call(undefined, curr, this[i], i, this);
                ++i;
            }

            return curr;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/ReduceRight (JS 1.8)
    if (!Array.prototype.reduceRight)
    {
        Array.prototype.reduceRight = function(callbackfn /*, initialValue */)
        {
            

            if (this === null)
                throw new TypeError();

            var t = Object(this);
            var len = t.length >>> 0;
            if (typeof callbackfn !== "function")
                throw new TypeError();

            // no value to return if no initial value, empty array
            if (len === 0 && arguments.length === 1)
                throw new TypeError();

            var k = len - 1;
            var accumulator;
            if (arguments.length >= 2)
            {
                accumulator = arguments[1];
            }
            else
            {
                do
                {
                    if (k in this)
                    {
                        accumulator = this[k--];
                        break;
                    }

                    // if array contains no values, no initial value to return
                    if (--k < 0)
                        throw new TypeError();
                }
                while (true);
            }

            while (k >= 0)
            {
                if (k in t)
                    accumulator = callbackfn.call(undefined, accumulator, t[k], k, t);
                k--;
            }

            return accumulator;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/some (JS 1.6)
    if (!Array.prototype.some)
    {
        Array.prototype.some = function(fun /*, thisp */)
        {
            

            if (this === null)
                throw new TypeError();

            var t = Object(this);
            var len = t.length >>> 0;
            if (typeof fun !== "function")
                throw new TypeError();

            var thisp = arguments[1];
            for (var i = 0; i < len; i++)
            {
                if (i in t && fun.call(thisp, t[i], i, t))
                    return true;
            }

            return false;
        };
    }


    // https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Array/isArray (JS 1.8.5)
    if (!Array.isArray) {
        Array.isArray = function (arg) {
            return Object.prototype.toString.call(arg) === "[object Array]";
        };
    }

    // source: https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String/Trim (JS 1.8.1)
    if (!String.prototype.trim) {
        String.prototype.trim = function () {
            return this.replace(/^\s+|\s+$/g, "");
        };
    }

    // source: https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/bind
    if (!Function.prototype.bind) {
        Function.prototype.bind = function (oThis) {
            if (typeof this !== "function") {
                // closest thing possible to the ECMAScript 5 internal IsCallable function
                throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
            }

            var aArgs = Array.prototype.slice.call(arguments, 1),
                fToBind = this,
                fNOP = function () {},
                fBound = function () {
                    return fToBind.apply(this instanceof fNOP &&
                            oThis ? this : oThis,
                            aArgs.concat(Array.prototype.slice.call(arguments)));
                };
            fNOP.prototype = this.prototype;
            fBound.prototype = new fNOP();

            return fBound;
        };
    }

    // https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/keys
    if (!Object.keys) {
        Object.keys = (function () {
            var _hasOwnProperty = Object.prototype.hasOwnProperty,
            hasDontEnumBug = !({toString: null}).propertyIsEnumerable("toString"),
            dontEnums = [
            "toString",
            "toLocaleString",
            "valueOf",
            "hasOwnProperty",
            "isPrototypeOf",
            "propertyIsEnumerable",
            "constructor"
            ],
            dontEnumsLength = dontEnums.length;

            return function (obj) {
                if (typeof obj !== "object" && typeof obj !== "function" || obj === null)
                    throw new TypeError("Object.keys called on non-object");

                var result = [];
                for (var prop in obj)
                    if (_hasOwnProperty.call(obj, prop))
                        result.push(prop);

                if (hasDontEnumBug)
                    for (var i=0; i < dontEnumsLength; i++)
                        if (_hasOwnProperty.call(obj, dontEnums[i]))
                            result.push(dontEnums[i]);
                return result;
            };
        })();
    }
});

/**
 * @license
 * Patterns @VERSION@ jquery-ext - various jQuery extensions
 *
 * Copyright 2011 Humberto Sermeño
 */
define('jquery-ext',["jquery"], function($) {
    var methods = {
        init: function( options ) {
            var settings = {
                time: 3, /* time it will wait before moving to "timeout" after a move event */
                initialTime: 8, /* time it will wait before first adding the "timeout" class */
                exceptionAreas: [] /* IDs of elements that, if the mouse is over them, will reset the timer */
            };
            return this.each(function() {
                var $this = $(this),
                    data = $this.data("timeout");

                if (!data) {
                    if ( options ) {
                        $.extend( settings, options );
                    }
                    $this.data("timeout", {
                        "lastEvent": new Date(),
                        "trueTime": settings.time,
                        "time": settings.initialTime,
                        "untouched": true,
                        "inExceptionArea": false
                    });

                    $this.bind( "mouseover.timeout", methods.mouseMoved );
                    $this.bind( "mouseenter.timeout", methods.mouseMoved );

                    $(settings.exceptionAreas).each(function() {
                        $this.find(this)
                            .live( "mouseover.timeout", {"parent":$this}, methods.enteredException )
                            .live( "mouseleave.timeout", {"parent":$this}, methods.leftException );
                    });

                    if (settings.initialTime > 0)
                        $this.timeout("startTimer");
                    else
                        $this.addClass("timeout");
                }
            });
        },

        enteredException: function(event) {
            var data = event.data.parent.data("timeout");
            data.inExceptionArea = true;
            event.data.parent.data("timeout", data);
            event.data.parent.trigger("mouseover");
        },

        leftException: function(event) {
            var data = event.data.parent.data("timeout");
            data.inExceptionArea = false;
            event.data.parent.data("timeout", data);
        },

        destroy: function() {
            return this.each( function() {
                var $this = $(this),
                    data = $this.data("timeout");

                $(window).unbind(".timeout");
                data.timeout.remove();
                $this.removeData("timeout");
            });
        },

        mouseMoved: function() {
            var $this = $(this), data = $this.data("timeout");

            if ($this.hasClass("timeout")) {
                $this.removeClass("timeout");
                $this.timeout("startTimer");
            } else if ( data.untouched ) {
                data.untouched = false;
                data.time = data.trueTime;
            }

            data.lastEvent = new Date();
            $this.data("timeout", data);
        },

        startTimer: function() {
            var $this = $(this), data = $this.data("timeout");
            var fn = function(){
                var data = $this.data("timeout");
                if ( data && data.lastEvent ) {
                    if ( data.inExceptionArea ) {
                        setTimeout( fn, Math.floor( data.time*1000 ) );
                    } else {
                        var now = new Date();
                        var diff = Math.floor(data.time*1000) - ( now - data.lastEvent );
                        if ( diff > 0 ) {
                            // the timeout has not ocurred, so set the timeout again
                            setTimeout( fn, diff+100 );
                        } else {
                            // timeout ocurred, so set the class
                            $this.addClass("timeout");
                        }
                    }
                }
            };

            setTimeout( fn, Math.floor( data.time*1000 ) );
        }
    };

    $.fn.timeout = function( method ) {
        if ( methods[method] ) {
            return methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
        } else if ( typeof method === "object" || !method ) {
            return methods.init.apply( this, arguments );
        } else {
            $.error( "Method " + method + " does not exist on jQuery.timeout" );
        }
    };

    // Custom jQuery selector to find elements with scrollbars
    $.extend($.expr[":"], {
        scrollable: function(element) {
            var vertically_scrollable, horizontally_scrollable;
            if ($(element).css("overflow") === "scroll" ||
                $(element).css("overflowX") === "scroll" ||
                $(element).css("overflowY") === "scroll")
                return true;

            vertically_scrollable = (element.clientHeight < element.scrollHeight) && (
                $.inArray($(element).css("overflowY"), ["scroll", "auto"]) !== -1 || $.inArray($(element).css("overflow"), ["scroll", "auto"]) !== -1);

            if (vertically_scrollable)
                return true;

            horizontally_scrollable = (element.clientWidth < element.scrollWidth) && (
                $.inArray($(element).css("overflowX"), ["scroll", "auto"]) !== -1 || $.inArray($(element).css("overflow"), ["scroll", "auto"]) !== -1);
            return horizontally_scrollable;
        }
    });

    // Make Visible in scroll
    $.fn.makeVisibleInScroll = function( parent_id ) {
        var absoluteParent = null;
        if ( typeof parent_id === "string" ) {
            absoluteParent = $("#" + parent_id);
        } else if ( parent_id ) {
            absoluteParent = $(parent_id);
        }

        return this.each(function() {
            var $this = $(this), parent;
            if (!absoluteParent) {
                parent = $this.parents(":scrollable");
                if (parent.length > 0) {
                    parent = $(parent[0]);
                } else {
                    parent = $(window);
                }
            } else {
                parent = absoluteParent;
            }

            var elemTop = $this.position().top;
            var elemBottom = $this.height() + elemTop;

            var viewTop = parent.scrollTop();
            var viewBottom = parent.height() + viewTop;

            if (elemTop < viewTop) {
                parent.scrollTop(elemTop);
            } else if ( elemBottom > viewBottom - parent.height()/2 ) {
                parent.scrollTop( elemTop - (parent.height() - $this.height())/2 );
            }
        });
    };

    //Make absolute location
    $.fn.setPositionAbsolute = function(element,offsettop,offsetleft) {
        return this.each(function() {
            // set absolute location for based on the element passed
            // dynamically since every browser has different settings
            var $this = $(this);
            var thiswidth = $(this).width();
            var    pos   = element.offset();
            var    width = element.width();
            var    height = element.height();
            var setleft = (pos.left + width - thiswidth + offsetleft);
            var settop = (pos.top + height + offsettop);
            $this.css({ "z-index" : 1, "position": "absolute", "marginLeft": 0, "marginTop": 0, "left": setleft + "px", "top":settop + "px" ,"width":thiswidth});
            $this.remove().appendTo("body").show();
        });
    };

    $.fn.positionAncestor = function(selector) {
        var left = 0;
        var top = 0;
        this.each(function() {
            // check if current element has an ancestor matching a selector
            // and that ancestor is positioned
            var $ancestor = $(this).closest(selector);
            if ($ancestor.length && $ancestor.css("position") !== "static") {
                var $child = $(this);
                var childMarginEdgeLeft = $child.offset().left - parseInt($child.css("marginLeft"), 10);
                var childMarginEdgeTop = $child.offset().top - parseInt($child.css("marginTop"), 10);
                var ancestorPaddingEdgeLeft = $ancestor.offset().left + parseInt($ancestor.css("borderLeftWidth"), 10);
                var ancestorPaddingEdgeTop = $ancestor.offset().top + parseInt($ancestor.css("borderTopWidth"), 10);
                left = childMarginEdgeLeft - ancestorPaddingEdgeLeft;
                top = childMarginEdgeTop - ancestorPaddingEdgeTop;
                // we have found the ancestor and computed the position
                // stop iterating
                return false;
            }
        });
        return {
            left:    left,
            top:    top
        };
    };


    // XXX: In compat.js we include things for browser compatibility,
    // but these two seem to be only convenience. Do we really want to
    // include these as part of patterns?
    String.prototype.startsWith = function(str) { return (this.match("^"+str) !== null); };
    String.prototype.endsWith = function(str) { return (this.match(str+"$") !== null); };


    /******************************

     Simple Placeholder

     ******************************/

    $.simplePlaceholder = {
        placeholder_class: null,

        hide_placeholder: function(){
            var $this = $(this);
            if($this.val() === $this.attr("placeholder")){
                $this.val("").removeClass($.simplePlaceholder.placeholder_class);
            }
        },

        show_placeholder: function(){
            var $this = $(this);
            if($this.val() === ""){
                $this.val($this.attr("placeholder")).addClass($.simplePlaceholder.placeholder_class);
            }
        },

        prevent_placeholder_submit: function(){
            $(this).find(".simple-placeholder").each(function() {
                var $this = $(this);
                if ($this.val() === $this.attr("placeholder")){
                    $this.val("");
                }
            });
            return true;
        }
    };

    $.fn.simplePlaceholder = function(options) {
        if(document.createElement("input").placeholder === undefined){
            var config = {
                placeholder_class : "placeholding"
            };

            if(options) $.extend(config, options);
            $.simplePlaceholder.placeholder_class = config.placeholder_class;

            this.each(function() {
                var $this = $(this);
                $this.focus($.simplePlaceholder.hide_placeholder);
                $this.blur($.simplePlaceholder.show_placeholder);
                if($this.val() === "") {
                    $this.val($this.attr("placeholder"));
                    $this.addClass($.simplePlaceholder.placeholder_class);
                }
                $this.addClass("simple-placeholder");
                $(this.form).submit($.simplePlaceholder.prevent_placeholder_submit);
            });
        }

        return this;
    };

    $.fn.findInclusive = function(selector) {
        return this.find('*').addBack().filter(selector);
    };

    $.fn.slideIn = function(speed, easing, callback) {
        return this.animate({width: "show"}, speed, easing, callback);
    };

    $.fn.slideOut = function(speed, easing, callback) {
        return this.animate({width: "hide"}, speed, easing, callback);
    };

    // case-insensitive :contains
    $.expr[":"].Contains = function(a, i, m) {
        return $(a).text().toUpperCase().indexOf(m[3].toUpperCase()) >= 0;
    };
});

/**
 * Patterns registry - Central registry and scan logic for patterns
 *
 * Copyright 2012-2013 Simplon B.V.
 * Copyright 2012-2013 Florian Friesdorf
 * Copyright 2013 Marko Durkovic
 * Copyright 2013 Rok Garbas
 */

/*
 * changes to previous patterns.register/scan mechanism
 * - if you want initialised class, do it in init
 * - init returns set of elements actually initialised
 * - handle once within init
 * - no turnstile anymore
 * - set pattern.jquery_plugin if you want it
 */
define('registry',[
    "jquery",
    "./core/logger",
    "./utils",
    // below here modules that are only loaded
    "./compat",
    "./jquery-ext"
], function($, logger, utils) {
    var log = logger.getLogger("registry"),
        jquery_plugin = utils.jquery_plugin;

    var disable_re = /patterns-disable=([^&]+)/g,
        dont_catch_re = /patterns-dont-catch/g,
        dont_catch = false,
        disabled = {}, match;

    while ((match=disable_re.exec(window.location.search)) !== null) {
        disabled[match[1]] = true;
        log.info('Pattern disabled via url config:', match[1]);
    }

    while ((match=dont_catch_re.exec(window.location.search)) !== null) {
        dont_catch = true;
        log.info('I will not catch init exceptions');
    }

    var registry = {
        patterns: {},
        // as long as the registry is not initialized, pattern
        // registration just registers a pattern. Once init is called,
        // the DOM is scanned. After that registering a new pattern
        // results in rescanning the DOM only for this pattern.
        initialized: false,
        init: function() {
            $(document).ready(function() {
                log.info('loaded: ' + Object.keys(registry.patterns).sort().join(', '));
                registry.scan(document.body);
                registry.initialized = true;
                log.info('finished initial scan.');
            });
        },

        scan: function(content, do_not_catch_init_exception, patterns) {
            var $content = $(content),
                all = [], allsel,
                pattern, $match, plog;

            // If no list of patterns was specified, we scan for all
            // patterns
            patterns = patterns || Object.keys(registry.patterns);

            // selector for all patterns
            patterns.forEach(function(name) {
                if (disabled[name]) {
                    log.debug('Skipping disabled pattern:', name);
                    return;
                }
                pattern = registry.patterns[name];
                if (pattern.transform) {
                    if (do_not_catch_init_exception || dont_catch) {
                        pattern.transform($content);
                    } else {
                        try {
                            pattern.transform($content);
                        } catch (e) {
                            log.error("Transform error for pattern" + name, e);
                        }
                    }
                }
                if (pattern.trigger) {
                    all.push(pattern.trigger);
                }
            });
            allsel = all.join(",");

            // Find all elements that belong to any pattern.
            $match = $content.findInclusive(allsel);
            $match = $match.filter(function() { return $(this).parents('pre').length === 0; });
            $match = $match.filter(":not(.cant-touch-this)");

            // walk list backwards and initialize patterns inside-out.
            //
            // XXX: If patterns would only trigger via classes, we
            // could iterate over an element classes and trigger
            // patterns in order.
            //
            // Advantages: Order of pattern initialization controled
            // via order of pat-classes and more efficient.
            $match.toArray().reduceRight(function(acc, el) {
                var $el = $(el);

                for (var name in registry.patterns) {
                    pattern = registry.patterns[name];
                    if (pattern.init) {
                        plog = logger.getLogger("pat." + name);

                        if ($el.is(pattern.trigger)) {
                            plog.debug("Initialising:", $el);
                            if (do_not_catch_init_exception || dont_catch) {
                                pattern.init($el);
                                plog.debug("done.");
                            } else {
                                try {
                                    pattern.init($el);
                                    plog.debug("done.");
                                } catch (e) {
                                    plog.error("Caught error:", e);
                                }
                            }
                        }
                    }
                }
            }, null);
        },

        // XXX: differentiate between internal and custom patterns
        // _register vs register
        register: function(pattern) {
            if (!pattern.name) {
                log.error("Pattern lacks name:", pattern);
                return false;
            }

            if (registry.patterns[pattern.name]) {
                log.error("Already have a pattern called: " + pattern.name);
                return false;
            }

            // register pattern to be used for scanning new content
            registry.patterns[pattern.name] = pattern;

            // register pattern as jquery plugin
            if (pattern.jquery_plugin) {
                var pluginName = ("pat-" + pattern.name)
                        .replace(/-([a-zA-Z])/g, function(match, p1) {
                            return p1.toUpperCase();
                        });
                $.fn[pluginName] = jquery_plugin(pattern);
                // BBB 2012-12-10
                $.fn[pluginName.replace(/^pat/, "pattern")] = jquery_plugin(pattern);
            }

            log.debug("Registered pattern:", pattern.name, pattern);

            if (registry.initialized) {
                registry.scan(document.body, false, [pattern.name]);
            }
            return true;
        }
    };

    $(document) .on("patterns-injected.patterns", function(ev) {
        registry.scan(ev.target);
        $(ev.target).trigger("patterns-injected-scanned");
    });

    return registry;
});
// jshint indent: 4, browser: true, jquery: true, quotmark: double
// vim: sw=4 expandtab
;
/**
 * Patterns bumper - `bumper' handling for elements
 *
 * Copyright 2013 Florian Friesdorf
 * Copyright 2012 Humberto Sermeno
 * Copyright 2013 Simplon B.V. - Wichert Akkerman
 */
define('pat/bumper',[
    "jquery",
    "../core/parser",
    "../registry",
    "../utils"
], function($, Parser, registry, utils) {
    var parser = new Parser("bumper");

    parser.add_argument("margin", 0);
    parser.add_argument("selector");
    parser.add_argument("bump-add", "bumped");
    parser.add_argument("bump-remove");
    parser.add_argument("unbump-add");
    parser.add_argument("unbump-remove", "bumped");

    var _ = {
        name: "bumper",
        trigger: ".pat-bumper",

        init: function($el, opts) {
            $el.each(function() {
                var $trigger = $(this),
                    options = parser.parse($trigger, opts);
                $trigger.data("pat-bumper:config", options);
            });

            $(window).on("scroll.bumper", function() {
                _._testBump($el, _._getViewport());
            });

            _._testBump($el, _._getViewport());
            return $el;
        },
        
        /**
         * Calculates the bounding box for the current viewport
         */
        _getViewport: function() {
            var $win = $(window), view = {
                top: $win.scrollTop(),
                left: $win.scrollLeft()
            };
            
            view.right = view.left + $win.width();
            view.bottom = view.top + $win.height();
            return view;
        },
        
        /**
         * Calculates the bounding box for a given element, taking margins
         * into consideration
         *
         * @param $elem The element
         */
        _getElementBox: function($elem) {
            var box = $elem.offset();
            
            box.top -= parseFloat($elem.css("marginTop").replace(/auto/, 0));
            box.left -= parseFloat($elem.css("marginLeft").replace(/auto/, 0));
            box.right = box.left + $elem.outerWidth(true);
            box.bottom = box.top + $elem.outerHeight(true);
            
            return box;
        },

        /**
         * Determines whether an element should be bumped
         *
         * @param $el  The element to look for
         * @param box The bounding box in which the element will be bumped
         */
        _testBump: function($el, box) {
            // initialize the elements
            $el.each(function() {
                var $this = $(this),
                    options = $this.data("pat-bumper:config"),
                    $target = options.selector ? $(options.selector) : $this,
                    already_bumped = !!$this.data("pat-bumper:bumped"),
                    must_bump = false,
                    element_box = $this.data("pat-bumper:elementbox");

                // get current ElementBox while not bumped, otherwise used
                // saved state before bumping
                if (!element_box) {
                    element_box = _._getElementBox($this);
                    element_box.threshold = {
                        top:    element_box.top - options.margin,
                        bottom: element_box.bottom + options.margin,
                        left:   element_box.left - options.margin,
                        right:  element_box.right + options.margin
                    };
                    element_box.margin = options.margin;
                    $this.data("pat-bumper:elementbox", element_box);
                }

                if (box.top > element_box.threshold.top) {
                    $target.addClass("bumped-top").removeClass("bumped-bottom");
                    must_bump = true;
                } else if (box.bottom < element_box.threshold.bottom) {
                    $target.addClass("bumped-bottom").removeClass("bumped-top");
                    must_bump = true;
                } else
                    $target.removeClass("bumped-top bumped-bottom");

                if (box.left > element_box.threshold.left) {
                    $target.addClass("bumped-left").removeClass("bumped-right");
                    must_bump = true;
                } else if (box.right < element_box.threshold.right) {
                    $target.addClass("bumped-right").removeClass("bumped-left");
                    must_bump = true;
                } else
                    $target.removeClass("bumped-left bumped-right");

                $this.data("pat-bumper:bumped", must_bump);
                if (!already_bumped && must_bump) {
                    $target.addClass("bumped");
                    if (options.bump.add)
                        $target.addClass(options.bump.add);
                    if (options.bump.remove)
                        utils.removeWildcardClass($target, options.bump.remove);
                } else if (already_bumped && !must_bump) {
                    $target.removeClass("bumped");
                    if (options.unbump.add)
                        $target.addClass(options.unbump.add);
                    if (options.unbump.remove)
                        utils.removeWildcardClass($target, options.unbump.remove);
                }
            });
        }
    };
    registry.register(_);
    return _;
});

// vim: sw=4 expandtab
;
define('jquery.form/jquery.form',['jquery'], function($) {
/*!
 * jQuery Form Plugin
 * version: 3.27.0-2013.02.06
 * @requires jQuery v1.5 or later
 *
 * Examples and documentation at: http://malsup.com/jquery/form/
 * Project repository: https://github.com/malsup/form
 * Dual licensed under the MIT and GPL licenses:
 *    http://malsup.github.com/mit-license.txt
 *    http://malsup.github.com/gpl-license-v2.txt
 */
/*global ActiveXObject alert */
;(function($) {


/*
    Usage Note:
    -----------
    Do not use both ajaxSubmit and ajaxForm on the same form.  These
    functions are mutually exclusive.  Use ajaxSubmit if you want
    to bind your own submit handler to the form.  For example,

    $(document).ready(function() {
        $('#myForm').on('submit', function(e) {
            e.preventDefault(); // <-- important
            $(this).ajaxSubmit({
                target: '#output'
            });
        });
    });

    Use ajaxForm when you want the plugin to manage all the event binding
    for you.  For example,

    $(document).ready(function() {
        $('#myForm').ajaxForm({
            target: '#output'
        });
    });

    You can also use ajaxForm with delegation (requires jQuery v1.7+), so the
    form does not have to exist when you invoke ajaxForm:

    $('#myForm').ajaxForm({
        delegation: true,
        target: '#output'
    });

    When using ajaxForm, the ajaxSubmit function will be invoked for you
    at the appropriate time.
*/

/**
 * Feature detection
 */
var feature = {};
feature.fileapi = $("<input type='file'/>").get(0).files !== undefined;
feature.formdata = window.FormData !== undefined;

/**
 * ajaxSubmit() provides a mechanism for immediately submitting
 * an HTML form using AJAX.
 */
$.fn.ajaxSubmit = function(options) {
    /*jshint scripturl:true */

    // fast fail if nothing selected (http://dev.jquery.com/ticket/2752)
    if (!this.length) {
        log('ajaxSubmit: skipping submit process - no element selected');
        return this;
    }

    var method, action, url, $form = this;

    if (typeof options == 'function') {
        options = { success: options };
    }

    method = this.attr('method');
    action = this.attr('action');
    url = (typeof action === 'string') ? $.trim(action) : '';
    url = url || window.location.href || '';
    if (url) {
        // clean url (don't include hash vaue)
        url = (url.match(/^([^#]+)/)||[])[1];
    }

    options = $.extend(true, {
        url:  url,
        success: $.ajaxSettings.success,
        type: method || 'GET',
        iframeSrc: /^https/i.test(window.location.href || '') ? 'javascript:false' : 'about:blank'
    }, options);

    // hook for manipulating the form data before it is extracted;
    // convenient for use with rich editors like tinyMCE or FCKEditor
    var veto = {};
    this.trigger('form-pre-serialize', [this, options, veto]);
    if (veto.veto) {
        log('ajaxSubmit: submit vetoed via form-pre-serialize trigger');
        return this;
    }

    // provide opportunity to alter form data before it is serialized
    if (options.beforeSerialize && options.beforeSerialize(this, options) === false) {
        log('ajaxSubmit: submit aborted via beforeSerialize callback');
        return this;
    }

    var traditional = options.traditional;
    if ( traditional === undefined ) {
        traditional = $.ajaxSettings.traditional;
    }

    var elements = [];
    var qx, a = this.formToArray(options.semantic, elements);
    if (options.data) {
        options.extraData = options.data;
        qx = $.param(options.data, traditional);
    }

    // give pre-submit callback an opportunity to abort the submit
    if (options.beforeSubmit && options.beforeSubmit(a, this, options) === false) {
        log('ajaxSubmit: submit aborted via beforeSubmit callback');
        return this;
    }

    // fire vetoable 'validate' event
    this.trigger('form-submit-validate', [a, this, options, veto]);
    if (veto.veto) {
        log('ajaxSubmit: submit vetoed via form-submit-validate trigger');
        return this;
    }

    var q = $.param(a, traditional);
    if (qx) {
        q = ( q ? (q + '&' + qx) : qx );
    }
    if (options.type.toUpperCase() == 'GET') {
        options.url += (options.url.indexOf('?') >= 0 ? '&' : '?') + q;
        options.data = null;  // data is null for 'get'
    }
    else {
        options.data = q; // data is the query string for 'post'
    }

    var callbacks = [];
    if (options.resetForm) {
        callbacks.push(function() { $form.resetForm(); });
    }
    if (options.clearForm) {
        callbacks.push(function() { $form.clearForm(options.includeHidden); });
    }

    // perform a load on the target only if dataType is not provided
    if (!options.dataType && options.target) {
        var oldSuccess = options.success || function(){};
        callbacks.push(function(data) {
            var fn = options.replaceTarget ? 'replaceWith' : 'html';
            $(options.target)[fn](data).each(oldSuccess, arguments);
        });
    }
    else if (options.success) {
        callbacks.push(options.success);
    }

    options.success = function(data, status, xhr) { // jQuery 1.4+ passes xhr as 3rd arg
        var context = options.context || this ;    // jQuery 1.4+ supports scope context
        for (var i=0, max=callbacks.length; i < max; i++) {
            callbacks[i].apply(context, [data, status, xhr || $form, $form]);
        }
    };

    // are there files to upload?

    // [value] (issue #113), also see comment:
    // https://github.com/malsup/form/commit/588306aedba1de01388032d5f42a60159eea9228#commitcomment-2180219
    var fileInputs = $('input[type=file]:enabled[value!=""]', this);

    var hasFileInputs = fileInputs.length > 0;
    var mp = 'multipart/form-data';
    var multipart = ($form.attr('enctype') == mp || $form.attr('encoding') == mp);

    var fileAPI = feature.fileapi && feature.formdata;
    log("fileAPI :" + fileAPI);
    var shouldUseFrame = (hasFileInputs || multipart) && !fileAPI;

    var jqxhr;

    // options.iframe allows user to force iframe mode
    // 06-NOV-09: now defaulting to iframe mode if file input is detected
    if (options.iframe !== false && (options.iframe || shouldUseFrame)) {
        // hack to fix Safari hang (thanks to Tim Molendijk for this)
        // see:  http://groups.google.com/group/jquery-dev/browse_thread/thread/36395b7ab510dd5d
        if (options.closeKeepAlive) {
            $.get(options.closeKeepAlive, function() {
                jqxhr = fileUploadIframe(a);
            });
        }
        else {
            jqxhr = fileUploadIframe(a);
        }
    }
    else if ((hasFileInputs || multipart) && fileAPI) {
        jqxhr = fileUploadXhr(a);
    }
    else {
        jqxhr = $.ajax(options);
    }

    $form.removeData('jqxhr').data('jqxhr', jqxhr);

    // clear element array
    for (var k=0; k < elements.length; k++)
        elements[k] = null;

    // fire 'notify' event
    this.trigger('form-submit-notify', [this, options]);
    return this;

    // utility fn for deep serialization
    function deepSerialize(extraData){
        var serialized = $.param(extraData).split('&');
        var len = serialized.length;
        var result = [];
        var i, part;
        for (i=0; i < len; i++) {
            // #252; undo param space replacement
            serialized[i] = serialized[i].replace(/\+/g,' ');
            part = serialized[i].split('=');
            // #278; use array instead of object storage, favoring array serializations
            result.push([decodeURIComponent(part[0]), decodeURIComponent(part[1])]);
        }
        return result;
    }

     // XMLHttpRequest Level 2 file uploads (big hat tip to francois2metz)
    function fileUploadXhr(a) {
        var formdata = new FormData();

        for (var i=0; i < a.length; i++) {
            formdata.append(a[i].name, a[i].value);
        }

        if (options.extraData) {
            var serializedData = deepSerialize(options.extraData);
            for (i=0; i < serializedData.length; i++)
                if (serializedData[i])
                    formdata.append(serializedData[i][0], serializedData[i][1]);
        }

        options.data = null;

        var s = $.extend(true, {}, $.ajaxSettings, options, {
            contentType: false,
            processData: false,
            cache: false,
            type: method || 'POST'
        });

        if (options.uploadProgress) {
            // workaround because jqXHR does not expose upload property
            s.xhr = function() {
                var xhr = jQuery.ajaxSettings.xhr();
                if (xhr.upload) {
                    xhr.upload.addEventListener('progress', function(event) {
                        var percent = 0;
                        var position = event.loaded || event.position; /*event.position is deprecated*/
                        var total = event.total;
                        if (event.lengthComputable) {
                            percent = Math.ceil(position / total * 100);
                        }
                        options.uploadProgress(event, position, total, percent);
                    }, false);
                }
                return xhr;
            };
        }

        s.data = null;
            var beforeSend = s.beforeSend;
            s.beforeSend = function(xhr, o) {
                o.data = formdata;
                if(beforeSend)
                    beforeSend.call(this, xhr, o);
        };
        return $.ajax(s);
    }

    // private function for handling file uploads (hat tip to YAHOO!)
    function fileUploadIframe(a) {
        var form = $form[0], el, i, s, g, id, $io, io, xhr, sub, n, timedOut, timeoutHandle;
        var useProp = !!$.fn.prop;
        var deferred = $.Deferred();

        if (a) {
            // ensure that every serialized input is still enabled
            for (i=0; i < elements.length; i++) {
                el = $(elements[i]);
                if ( useProp )
                    el.prop('disabled', false);
                else
                    el.removeAttr('disabled');
            }
        }

        s = $.extend(true, {}, $.ajaxSettings, options);
        s.context = s.context || s;
        id = 'jqFormIO' + (new Date().getTime());
        if (s.iframeTarget) {
            $io = $(s.iframeTarget);
            n = $io.attr('name');
            if (!n)
                 $io.attr('name', id);
            else
                id = n;
        }
        else {
            $io = $('<iframe name="' + id + '" src="'+ s.iframeSrc +'" />');
            $io.css({ position: 'absolute', top: '-1000px', left: '-1000px' });
        }
        io = $io[0];


        xhr = { // mock object
            aborted: 0,
            responseText: null,
            responseXML: null,
            status: 0,
            statusText: 'n/a',
            getAllResponseHeaders: function() {},
            getResponseHeader: function() {},
            setRequestHeader: function() {},
            abort: function(status) {
                var e = (status === 'timeout' ? 'timeout' : 'aborted');
                log('aborting upload... ' + e);
                this.aborted = 1;

                try { // #214, #257
                    if (io.contentWindow.document.execCommand) {
                        io.contentWindow.document.execCommand('Stop');
                    }
                }
                catch(ignore) {}

                $io.attr('src', s.iframeSrc); // abort op in progress
                xhr.error = e;
                if (s.error)
                    s.error.call(s.context, xhr, e, status);
                if (g)
                    $.event.trigger("ajaxError", [xhr, s, e]);
                if (s.complete)
                    s.complete.call(s.context, xhr, e);
            }
        };

        g = s.global;
        // trigger ajax global events so that activity/block indicators work like normal
        if (g && 0 === $.active++) {
            $.event.trigger("ajaxStart");
        }
        if (g) {
            $.event.trigger("ajaxSend", [xhr, s]);
        }

        if (s.beforeSend && s.beforeSend.call(s.context, xhr, s) === false) {
            if (s.global) {
                $.active--;
            }
            deferred.reject();
            return deferred;
        }
        if (xhr.aborted) {
            deferred.reject();
            return deferred;
        }

        // add submitting element to data if we know it
        sub = form.clk;
        if (sub) {
            n = sub.name;
            if (n && !sub.disabled) {
                s.extraData = s.extraData || {};
                s.extraData[n] = sub.value;
                if (sub.type == "image") {
                    s.extraData[n+'.x'] = form.clk_x;
                    s.extraData[n+'.y'] = form.clk_y;
                }
            }
        }

        var CLIENT_TIMEOUT_ABORT = 1;
        var SERVER_ABORT = 2;

        function getDoc(frame) {
            var doc = frame.contentWindow ? frame.contentWindow.document : frame.contentDocument ? frame.contentDocument : frame.document;
            return doc;
        }

        // Rails CSRF hack (thanks to Yvan Barthelemy)
        var csrf_token = $('meta[name=csrf-token]').attr('content');
        var csrf_param = $('meta[name=csrf-param]').attr('content');
        if (csrf_param && csrf_token) {
            s.extraData = s.extraData || {};
            s.extraData[csrf_param] = csrf_token;
        }

        // take a breath so that pending repaints get some cpu time before the upload starts
        function doSubmit() {
            // make sure form attrs are set
            var t = $form.attr('target'), a = $form.attr('action');

            // update form attrs in IE friendly way
            form.setAttribute('target',id);
            if (!method) {
                form.setAttribute('method', 'POST');
            }
            if (a != s.url) {
                form.setAttribute('action', s.url);
            }

            // ie borks in some cases when setting encoding
            if (! s.skipEncodingOverride && (!method || /post/i.test(method))) {
                $form.attr({
                    encoding: 'multipart/form-data',
                    enctype:  'multipart/form-data'
                });
            }

            // support timout
            if (s.timeout) {
                timeoutHandle = setTimeout(function() { timedOut = true; cb(CLIENT_TIMEOUT_ABORT); }, s.timeout);
            }

            // look for server aborts
            function checkState() {
                try {
                    var state = getDoc(io).readyState;
                    log('state = ' + state);
                    if (state && state.toLowerCase() == 'uninitialized')
                        setTimeout(checkState,50);
                }
                catch(e) {
                    log('Server abort: ' , e, ' (', e.name, ')');
                    cb(SERVER_ABORT);
                    if (timeoutHandle)
                        clearTimeout(timeoutHandle);
                    timeoutHandle = undefined;
                }
            }

            // add "extra" data to form if provided in options
            var extraInputs = [];
            try {
                if (s.extraData) {
                    for (var n in s.extraData) {
                        if (s.extraData.hasOwnProperty(n)) {
                           // if using the $.param format that allows for multiple values with the same name
                           if($.isPlainObject(s.extraData[n]) && s.extraData[n].hasOwnProperty('name') && s.extraData[n].hasOwnProperty('value')) {
                               extraInputs.push(
                               $('<input type="hidden" name="'+s.extraData[n].name+'">').val(s.extraData[n].value)
                                   .appendTo(form)[0]);
                           } else {
                               extraInputs.push(
                               $('<input type="hidden" name="'+n+'">').val(s.extraData[n])
                                   .appendTo(form)[0]);
                           }
                        }
                    }
                }

                if (!s.iframeTarget) {
                    // add iframe to doc and submit the form
                    $io.appendTo('body');
                    if (io.attachEvent)
                        io.attachEvent('onload', cb);
                    else
                        io.addEventListener('load', cb, false);
                }
                setTimeout(checkState,15);
                // just in case form has element with name/id of 'submit'
                var submitFn = document.createElement('form').submit;
                submitFn.apply(form);
            }
            finally {
                // reset attrs and remove "extra" input elements
                form.setAttribute('action',a);
                if(t) {
                    form.setAttribute('target', t);
                } else {
                    $form.removeAttr('target');
                }
                $(extraInputs).remove();
            }
        }

        if (s.forceSync) {
            doSubmit();
        }
        else {
            setTimeout(doSubmit, 10); // this lets dom updates render
        }

        var data, doc, domCheckCount = 50, callbackProcessed;

        function cb(e) {
            if (xhr.aborted || callbackProcessed) {
                return;
            }
            try {
                doc = getDoc(io);
            }
            catch(ex) {
                log('cannot access response document: ', ex);
                e = SERVER_ABORT;
            }
            if (e === CLIENT_TIMEOUT_ABORT && xhr) {
                xhr.abort('timeout');
                deferred.reject(xhr, 'timeout');
                return;
            }
            else if (e == SERVER_ABORT && xhr) {
                xhr.abort('server abort');
                deferred.reject(xhr, 'error', 'server abort');
                return;
            }

            if (!doc || doc.location.href == s.iframeSrc) {
                // response not received yet
                if (!timedOut)
                    return;
            }
            if (io.detachEvent)
                io.detachEvent('onload', cb);
            else
                io.removeEventListener('load', cb, false);

            var status = 'success', errMsg;
            try {
                if (timedOut) {
                    throw 'timeout';
                }

                var isXml = s.dataType == 'xml' || doc.XMLDocument || $.isXMLDoc(doc);
                log('isXml='+isXml);
                if (!isXml && window.opera && (doc.body === null || !doc.body.innerHTML)) {
                    if (--domCheckCount) {
                        // in some browsers (Opera) the iframe DOM is not always traversable when
                        // the onload callback fires, so we loop a bit to accommodate
                        log('requeing onLoad callback, DOM not available');
                        setTimeout(cb, 250);
                        return;
                    }
                    // let this fall through because server response could be an empty document
                    //log('Could not access iframe DOM after mutiple tries.');
                    //throw 'DOMException: not available';
                }

                //log('response detected');
                var docRoot = doc.body ? doc.body : doc.documentElement;
                xhr.responseText = docRoot ? docRoot.innerHTML : null;
                xhr.responseXML = doc.XMLDocument ? doc.XMLDocument : doc;
                if (isXml)
                    s.dataType = 'xml';
                xhr.getResponseHeader = function(header){
                    var headers = {'content-type': s.dataType};
                    return headers[header];
                };
                // support for XHR 'status' & 'statusText' emulation :
                if (docRoot) {
                    xhr.status = Number( docRoot.getAttribute('status') ) || xhr.status;
                    xhr.statusText = docRoot.getAttribute('statusText') || xhr.statusText;
                }

                var dt = (s.dataType || '').toLowerCase();
                var scr = /(json|script|text)/.test(dt);
                if (scr || s.textarea) {
                    // see if user embedded response in textarea
                    var ta = doc.getElementsByTagName('textarea')[0];
                    if (ta) {
                        xhr.responseText = ta.value;
                        // support for XHR 'status' & 'statusText' emulation :
                        xhr.status = Number( ta.getAttribute('status') ) || xhr.status;
                        xhr.statusText = ta.getAttribute('statusText') || xhr.statusText;
                    }
                    else if (scr) {
                        // account for browsers injecting pre around json response
                        var pre = doc.getElementsByTagName('pre')[0];
                        var b = doc.getElementsByTagName('body')[0];
                        if (pre) {
                            xhr.responseText = pre.textContent ? pre.textContent : pre.innerText;
                        }
                        else if (b) {
                            xhr.responseText = b.textContent ? b.textContent : b.innerText;
                        }
                    }
                }
                else if (dt == 'xml' && !xhr.responseXML && xhr.responseText) {
                    xhr.responseXML = toXml(xhr.responseText);
                }

                try {
                    data = httpData(xhr, dt, s);
                }
                catch (e) {
                    status = 'parsererror';
                    xhr.error = errMsg = (e || status);
                }
            }
            catch (e) {
                log('error caught: ',e);
                status = 'error';
                xhr.error = errMsg = (e || status);
            }

            if (xhr.aborted) {
                log('upload aborted');
                status = null;
            }

            if (xhr.status) { // we've set xhr.status
                status = (xhr.status >= 200 && xhr.status < 300 || xhr.status === 304) ? 'success' : 'error';
            }

            // ordering of these callbacks/triggers is odd, but that's how $.ajax does it
            if (status === 'success') {
                if (s.success)
                    s.success.call(s.context, data, 'success', xhr);
                deferred.resolve(xhr.responseText, 'success', xhr);
                if (g)
                    $.event.trigger("ajaxSuccess", [xhr, s]);
            }
            else if (status) {
                if (errMsg === undefined)
                    errMsg = xhr.statusText;
                if (s.error)
                    s.error.call(s.context, xhr, status, errMsg);
                deferred.reject(xhr, 'error', errMsg);
                if (g)
                    $.event.trigger("ajaxError", [xhr, s, errMsg]);
            }

            if (g)
                $.event.trigger("ajaxComplete", [xhr, s]);

            if (g && ! --$.active) {
                $.event.trigger("ajaxStop");
            }

            if (s.complete)
                s.complete.call(s.context, xhr, status);

            callbackProcessed = true;
            if (s.timeout)
                clearTimeout(timeoutHandle);

            // clean up
            setTimeout(function() {
                if (!s.iframeTarget)
                    $io.remove();
                xhr.responseXML = null;
            }, 100);
        }

        var toXml = $.parseXML || function(s, doc) { // use parseXML if available (jQuery 1.5+)
            if (window.ActiveXObject) {
                doc = new ActiveXObject('Microsoft.XMLDOM');
                doc.async = 'false';
                doc.loadXML(s);
            }
            else {
                doc = (new DOMParser()).parseFromString(s, 'text/xml');
            }
            return (doc && doc.documentElement && doc.documentElement.nodeName != 'parsererror') ? doc : null;
        };
        var parseJSON = $.parseJSON || function(s) {
            /*jslint evil:true */
            return window['eval']('(' + s + ')');
        };

        var httpData = function( xhr, type, s ) { // mostly lifted from jq1.4.4

            var ct = xhr.getResponseHeader('content-type') || '',
                xml = type === 'xml' || !type && ct.indexOf('xml') >= 0,
                data = xml ? xhr.responseXML : xhr.responseText;

            if (xml && data.documentElement.nodeName === 'parsererror') {
                if ($.error)
                    $.error('parsererror');
            }
            if (s && s.dataFilter) {
                data = s.dataFilter(data, type);
            }
            if (typeof data === 'string') {
                if (type === 'json' || !type && ct.indexOf('json') >= 0) {
                    data = parseJSON(data);
                } else if (type === "script" || !type && ct.indexOf("javascript") >= 0) {
                    $.globalEval(data);
                }
            }
            return data;
        };

        return deferred;
    }
};

/**
 * ajaxForm() provides a mechanism for fully automating form submission.
 *
 * The advantages of using this method instead of ajaxSubmit() are:
 *
 * 1: This method will include coordinates for <input type="image" /> elements (if the element
 *    is used to submit the form).
 * 2. This method will include the submit element's name/value data (for the element that was
 *    used to submit the form).
 * 3. This method binds the submit() method to the form for you.
 *
 * The options argument for ajaxForm works exactly as it does for ajaxSubmit.  ajaxForm merely
 * passes the options argument along after properly binding events for submit elements and
 * the form itself.
 */
$.fn.ajaxForm = function(options) {
    options = options || {};
    options.delegation = options.delegation && $.isFunction($.fn.on);

    // in jQuery 1.3+ we can fix mistakes with the ready state
    if (!options.delegation && this.length === 0) {
        var o = { s: this.selector, c: this.context };
        if (!$.isReady && o.s) {
            log('DOM not ready, queuing ajaxForm');
            $(function() {
                $(o.s,o.c).ajaxForm(options);
            });
            return this;
        }
        // is your DOM ready?  http://docs.jquery.com/Tutorials:Introducing_$(document).ready()
        log('terminating; zero elements found by selector' + ($.isReady ? '' : ' (DOM not ready)'));
        return this;
    }

    if ( options.delegation ) {
        $(document)
            .off('submit.form-plugin', this.selector, doAjaxSubmit)
            .off('click.form-plugin', this.selector, captureSubmittingElement)
            .on('submit.form-plugin', this.selector, options, doAjaxSubmit)
            .on('click.form-plugin', this.selector, options, captureSubmittingElement);
        return this;
    }

    return this.ajaxFormUnbind()
        .bind('submit.form-plugin', options, doAjaxSubmit)
        .bind('click.form-plugin', options, captureSubmittingElement);
};

// private event handlers
function doAjaxSubmit(e) {
    /*jshint validthis:true */
    var options = e.data;
    if (!e.isDefaultPrevented()) { // if event has been canceled, don't proceed
        e.preventDefault();
        $(this).ajaxSubmit(options);
    }
}

function captureSubmittingElement(e) {
    /*jshint validthis:true */
    var target = e.target;
    var $el = $(target);
    if (!($el.is("[type=submit],[type=image]"))) {
        // is this a child element of the submit el?  (ex: a span within a button)
        var t = $el.closest('[type=submit]');
        if (t.length === 0) {
            return;
        }
        target = t[0];
    }
    var form = this;
    form.clk = target;
    if (target.type == 'image') {
        if (e.offsetX !== undefined) {
            form.clk_x = e.offsetX;
            form.clk_y = e.offsetY;
        } else if (typeof $.fn.offset == 'function') {
            var offset = $el.offset();
            form.clk_x = e.pageX - offset.left;
            form.clk_y = e.pageY - offset.top;
        } else {
            form.clk_x = e.pageX - target.offsetLeft;
            form.clk_y = e.pageY - target.offsetTop;
        }
    }
    // clear form vars
    setTimeout(function() { form.clk = form.clk_x = form.clk_y = null; }, 100);
}


// ajaxFormUnbind unbinds the event handlers that were bound by ajaxForm
$.fn.ajaxFormUnbind = function() {
    return this.unbind('submit.form-plugin click.form-plugin');
};

/**
 * formToArray() gathers form element data into an array of objects that can
 * be passed to any of the following ajax functions: $.get, $.post, or load.
 * Each object in the array has both a 'name' and 'value' property.  An example of
 * an array for a simple login form might be:
 *
 * [ { name: 'username', value: 'jresig' }, { name: 'password', value: 'secret' } ]
 *
 * It is this array that is passed to pre-submit callback functions provided to the
 * ajaxSubmit() and ajaxForm() methods.
 */
$.fn.formToArray = function(semantic, elements) {
    var a = [];
    if (this.length === 0) {
        return a;
    }

    var form = this[0];
    var els = semantic ? form.getElementsByTagName('*') : form.elements;
    if (!els) {
        return a;
    }

    var i,j,n,v,el,max,jmax;
    for(i=0, max=els.length; i < max; i++) {
        el = els[i];
        n = el.name;
        if (!n) {
            continue;
        }

        if (semantic && form.clk && el.type == "image") {
            // handle image inputs on the fly when semantic == true
            if(!el.disabled && form.clk == el) {
                a.push({name: n, value: $(el).val(), type: el.type });
                a.push({name: n+'.x', value: form.clk_x}, {name: n+'.y', value: form.clk_y});
            }
            continue;
        }

        v = $.fieldValue(el, true);
        if (v && v.constructor == Array) {
            if (elements)
                elements.push(el);
            for(j=0, jmax=v.length; j < jmax; j++) {
                a.push({name: n, value: v[j]});
            }
        }
        else if (feature.fileapi && el.type == 'file' && !el.disabled) {
            if (elements)
                elements.push(el);
            var files = el.files;
            if (files.length) {
                for (j=0; j < files.length; j++) {
                    a.push({name: n, value: files[j], type: el.type});
                }
            }
            else {
                // #180
                a.push({ name: n, value: '', type: el.type });
            }
        }
        else if (v !== null && typeof v != 'undefined') {
            if (elements)
                elements.push(el);
            a.push({name: n, value: v, type: el.type, required: el.required});
        }
    }

    if (!semantic && form.clk) {
        // input type=='image' are not found in elements array! handle it here
        var $input = $(form.clk), input = $input[0];
        n = input.name;
        if (n && !input.disabled && input.type == 'image') {
            a.push({name: n, value: $input.val()});
            a.push({name: n+'.x', value: form.clk_x}, {name: n+'.y', value: form.clk_y});
        }
    }
    return a;
};

/**
 * Serializes form data into a 'submittable' string. This method will return a string
 * in the format: name1=value1&amp;name2=value2
 */
$.fn.formSerialize = function(semantic) {
    //hand off to jQuery.param for proper encoding
    return $.param(this.formToArray(semantic));
};

/**
 * Serializes all field elements in the jQuery object into a query string.
 * This method will return a string in the format: name1=value1&amp;name2=value2
 */
$.fn.fieldSerialize = function(successful) {
    var a = [];
    this.each(function() {
        var n = this.name;
        if (!n) {
            return;
        }
        var v = $.fieldValue(this, successful);
        if (v && v.constructor == Array) {
            for (var i=0,max=v.length; i < max; i++) {
                a.push({name: n, value: v[i]});
            }
        }
        else if (v !== null && typeof v != 'undefined') {
            a.push({name: this.name, value: v});
        }
    });
    //hand off to jQuery.param for proper encoding
    return $.param(a);
};

/**
 * Returns the value(s) of the element in the matched set.  For example, consider the following form:
 *
 *  <form><fieldset>
 *      <input name="A" type="text" />
 *      <input name="A" type="text" />
 *      <input name="B" type="checkbox" value="B1" />
 *      <input name="B" type="checkbox" value="B2"/>
 *      <input name="C" type="radio" value="C1" />
 *      <input name="C" type="radio" value="C2" />
 *  </fieldset></form>
 *
 *  var v = $('input[type=text]').fieldValue();
 *  // if no values are entered into the text inputs
 *  v == ['','']
 *  // if values entered into the text inputs are 'foo' and 'bar'
 *  v == ['foo','bar']
 *
 *  var v = $('input[type=checkbox]').fieldValue();
 *  // if neither checkbox is checked
 *  v === undefined
 *  // if both checkboxes are checked
 *  v == ['B1', 'B2']
 *
 *  var v = $('input[type=radio]').fieldValue();
 *  // if neither radio is checked
 *  v === undefined
 *  // if first radio is checked
 *  v == ['C1']
 *
 * The successful argument controls whether or not the field element must be 'successful'
 * (per http://www.w3.org/TR/html4/interact/forms.html#successful-controls).
 * The default value of the successful argument is true.  If this value is false the value(s)
 * for each element is returned.
 *
 * Note: This method *always* returns an array.  If no valid value can be determined the
 *    array will be empty, otherwise it will contain one or more values.
 */
$.fn.fieldValue = function(successful) {
    for (var val=[], i=0, max=this.length; i < max; i++) {
        var el = this[i];
        var v = $.fieldValue(el, successful);
        if (v === null || typeof v == 'undefined' || (v.constructor == Array && !v.length)) {
            continue;
        }
        if (v.constructor == Array)
            $.merge(val, v);
        else
            val.push(v);
    }
    return val;
};

/**
 * Returns the value of the field element.
 */
$.fieldValue = function(el, successful) {
    var n = el.name, t = el.type, tag = el.tagName.toLowerCase();
    if (successful === undefined) {
        successful = true;
    }

    if (successful && (!n || el.disabled || t == 'reset' || t == 'button' ||
        (t == 'checkbox' || t == 'radio') && !el.checked ||
        (t == 'submit' || t == 'image') && el.form && el.form.clk != el ||
        tag == 'select' && el.selectedIndex == -1)) {
            return null;
    }

    if (tag == 'select') {
        var index = el.selectedIndex;
        if (index < 0) {
            return null;
        }
        var a = [], ops = el.options;
        var one = (t == 'select-one');
        var max = (one ? index+1 : ops.length);
        for(var i=(one ? index : 0); i < max; i++) {
            var op = ops[i];
            if (op.selected) {
                var v = op.value;
                if (!v) { // extra pain for IE...
                    v = (op.attributes && op.attributes['value'] && !(op.attributes['value'].specified)) ? op.text : op.value;
                }
                if (one) {
                    return v;
                }
                a.push(v);
            }
        }
        return a;
    }
    return $(el).val();
};

/**
 * Clears the form data.  Takes the following actions on the form's input fields:
 *  - input text fields will have their 'value' property set to the empty string
 *  - select elements will have their 'selectedIndex' property set to -1
 *  - checkbox and radio inputs will have their 'checked' property set to false
 *  - inputs of type submit, button, reset, and hidden will *not* be effected
 *  - button elements will *not* be effected
 */
$.fn.clearForm = function(includeHidden) {
    return this.each(function() {
        $('input,select,textarea', this).clearFields(includeHidden);
    });
};

/**
 * Clears the selected form elements.
 */
$.fn.clearFields = $.fn.clearInputs = function(includeHidden) {
    var re = /^(?:color|date|datetime|email|month|number|password|range|search|tel|text|time|url|week)$/i; // 'hidden' is not in this list
    return this.each(function() {
        var t = this.type, tag = this.tagName.toLowerCase();
        if (re.test(t) || tag == 'textarea') {
            this.value = '';
        }
        else if (t == 'checkbox' || t == 'radio') {
            this.checked = false;
        }
        else if (tag == 'select') {
            this.selectedIndex = -1;
        }
		else if (t == "file") {
			if (/MSIE/.test(navigator.userAgent)) {
				$(this).replaceWith($(this).clone());
			} else {
				$(this).val('');
			}
		}
        else if (includeHidden) {
            // includeHidden can be the value true, or it can be a selector string
            // indicating a special test; for example:
            //  $('#myForm').clearForm('.special:hidden')
            // the above would clean hidden inputs that have the class of 'special'
            if ( (includeHidden === true && /hidden/.test(t)) ||
                 (typeof includeHidden == 'string' && $(this).is(includeHidden)) )
                this.value = '';
        }
    });
};

/**
 * Resets the form data.  Causes all form elements to be reset to their original value.
 */
$.fn.resetForm = function() {
    return this.each(function() {
        // guard against an input with the name of 'reset'
        // note that IE reports the reset function as an 'object'
        if (typeof this.reset == 'function' || (typeof this.reset == 'object' && !this.reset.nodeType)) {
            this.reset();
        }
    });
};

/**
 * Enables or disables any matching elements.
 */
$.fn.enable = function(b) {
    if (b === undefined) {
        b = true;
    }
    return this.each(function() {
        this.disabled = !b;
    });
};

/**
 * Checks/unchecks any matching checkboxes or radio buttons and
 * selects/deselects and matching option elements.
 */
$.fn.selected = function(select) {
    if (select === undefined) {
        select = true;
    }
    return this.each(function() {
        var t = this.type;
        if (t == 'checkbox' || t == 'radio') {
            this.checked = select;
        }
        else if (this.tagName.toLowerCase() == 'option') {
            var $sel = $(this).parent('select');
            if (select && $sel[0] && $sel[0].type == 'select-one') {
                // deselect all other options
                $sel.find('option').selected(false);
            }
            this.selected = select;
        }
    });
};

// expose debug var
$.fn.ajaxSubmit.debug = false;

// helper fn for console logging
function log() {
    if (!$.fn.ajaxSubmit.debug)
        return;
    var msg = '[jquery.form] ' + Array.prototype.join.call(arguments,'');
    if (window.console && window.console.log) {
        window.console.log(msg);
    }
    else if (window.opera && window.opera.postError) {
        window.opera.postError(msg);
    }
}

})(jQuery);

});
define('jquery.form', ['jquery.form/jquery.form'], function (main) { return main; });

/**
 * Patterns ajax - AJAX injection for forms and anchors
 *
 * Copyright 2012-2013 Florian Friesdorf
 * Copyright 2012-2013 Marko Durkovic
 */
define('pat/ajax',[
    "jquery",
    "../core/logger",
    "../core/parser",
    "../registry",
    "jquery.form"
], function($, logger, Parser, registry) {
    var log = logger.getLogger('pat.ajax'),
        parser = new Parser('ajax');

    parser.add_argument('url', function($el) {
        return ($el.is('a') ? $el.attr('href') :
                ($el.is('form') ? $el.attr('action') : '')).split('#')[0];
    });

    var _ = {
        name: "ajax",
        trigger: ".pat-ajax",
        parser: parser,
        init: function($el) {
            $el.off('.pat-ajax');
            $el.filter('a').on('click.pat-ajax', _.onTriggerEvents);
            $el.filter('form')
                .on('submit.pat-ajax', _.onTriggerEvents)
                .on('click.pat-ajax', '[type=submit]', _.onClickSubmit);
            $el.filter(':not(form,a)').each(function() {
                log.warn('Unsupported element:', this);
            });
            return $el;
        },
        destroy: function($el) {
            $el.off('.pat-ajax');
        },
        onClickSubmit: function(event) {
            var $form = $(event.target).parents('form').first(),
                name = event.target.name,
                value = $(event.target).val(),
                data = {};
            if (name) {
                data[name] = value;
            }
            $form.data('pat-ajax.clicked-data', data);
        },
        onTriggerEvents: function(event) {
            if (event) {
                event.preventDefault();
            }
            _.request($(this));
        },
        request: function($el, opts) {
            return $el.each(function() {
                _._request($(this), opts);
            });
        },
        _request: function($el, opts) {
            var cfg = _.parser.parse($el, opts),
                onError = function(jqxhr, status, error) {
                    // error can also stem from a javascript
                    // exception, not only errors described in the
                    // jqxhr.
                    log.error("load error for " + cfg.url + ":", error, jqxhr);
                    $el.trigger({
                        type: "pat-ajax-error",
                        error: error,
                        jqxhr: jqxhr
                    });
                },
                onSuccess = function(data, status, jqxhr) {
                    log.debug("success: jqxhr:", jqxhr);
                    $el.trigger({
                        type: "pat-ajax-success",
                        jqxhr: jqxhr
                    });
                },
                args = {
                    context: $el,
                    data: $el.data('pat-ajax.clicked-data'),
                    url: cfg.url,
                    error: onError,
                    success: onSuccess
                };

            $el.removeData('pat-ajax.clicked-data');
            log.debug('request:', args, $el[0]);
            if ($el.is('form')) {
                $el.ajaxSubmit(args);
            } else {
                $.ajax(args);
            }
        }
    };

    registry.register(_);
    return _;
});

/*
 * HTML Parser By John Resig (ejohn.org)
 * Original code by Erik Arvidsson, Mozilla Public License
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 *
 * Modified by Wichert Akkerman to support act as a module and handle new
 * HTML5 elements.
 *
 * // Use like so:
 * HTMLParser(htmlString, {
 *     start: function(tag, attrs, unary) {},
 *     end: function(tag) {},
 *     chars: function(text) {},
 *     comment: function(text) {}
 * });
 *
 * // or to get an XML string:
 * HTMLtoXML(htmlString);
 *
 * // or to get an XML DOM Document
 * HTMLtoDOM(htmlString);
 *
 * // or to inject into an existing document/DOM node
 * HTMLtoDOM(htmlString, document);
 * HTMLtoDOM(htmlString, document.body);
 *
 */

define('lib/htmlparser',[],function(){

	// Regular Expressions for parsing tags and attributes
	var startTag = /^<([\-A-Za-z0-9:_]+)((?:\s+[\-A-Za-z0-9:_]+(?:\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))?)*)\s*(\/?)>/,
		endTag = /^<\/([\-A-Za-z0-9:_]+)[^>]*>/,
		attr = /([\-A-Za-z0-9:_]+)(?:\s*=\s*(?:(?:"((?:\\.|[^"])*)")|(?:'((?:\\.|[^'])*)')|([^>\s]+)))?/g;

	// Empty Elements - HTML 5 Working Draft 25 October 2012
	var empty = makeMap("area,base,basefont,br,col,frame,hr,img,input,isindex,link,meta,param,embed,command,source,embed,track");

	// Block Elements - HTML 5 Working Draft 25 October 2012 and Web Components
	var block = makeMap("address,applet,blockquote,button,center,dd,del,dir,div,dl,dt,fieldset,form,frameset,hr,iframe,ins,isindex,li,map,menu,noframes,noscript,object,ol,p,pre,script,table,tbody,td,tfoot,th,thead,tr,ul,article,aside,details,dialog,summary,figure,footer,header,hgroup,nav,section,audio,video,canvas,datalist,template,element,shadow,decorator,content");

	// Inline Elements - HTML 5 Working Draft 25 October 2012
	var inline = makeMap("a,abbr,acronym,applet,b,basefont,bdo,big,br,button,cite,code,del,dfn,em,font,i,iframe,img,input,ins,kbd,label,map,object,q,s,samp,script,select,small,span,strike,strong,sub,sup,textarea,tt,u,var,bdi,bdo,figcaption,mark,meter,progress,ruby,rt,rp,time,wbr");

	// Elements that you can, intentionally, leave open
	// (and which close themselves)
	var closeSelf = makeMap("colgroup,dd,dt,li,options,p,td,tfoot,th,thead,tr");

	// Attributes that have their values filled in disabled="disabled"
	var fillAttrs = makeMap("checked,compact,declare,defer,disabled,ismap,multiple,nohref,noresize,noshade,nowrap,readonly,selected");

	// Special Elements (can contain anything) Reference: http://www.w3.org/TR/html-markup/syntax.html#replaceable-character-data
	var special = makeMap("script,style,textarea,title");

	var HTMLParser = this.HTMLParser = function( html, handler ) {
		var index, chars, match, stack = [], last = html;
		stack.last = function(){
			return this[ this.length - 1 ];
		};

		if (html.indexOf("<!DOCTYPE")===0) {
			index = html.indexOf(">");
			if (index>=0) {
				if (handler.doctype)
					handler.doctype(html.substring(10, index));
				html = html.substring(index + 1).replace(/^\s+/,"");
			}
		}

		while ( html ) {
			chars = true;

			// Make sure we're not in a script or style element
			if ( !stack.last() || !special[ stack.last() ] ) {

				// Comment
				if ( html.indexOf("<!--")=== 0 ) {
					index = html.indexOf("-->");

					if ( index >= 0 ) {
						if ( handler.comment )
							handler.comment( html.substring( 4, index ) );
						html = html.substring( index + 3 );
						chars = false;
					}

				// end tag
				} else if ( html.indexOf("</") === 0 ) {
					match = html.match( endTag );

					if ( match ) {
						html = html.substring( match[0].length );
						match[0].replace( endTag, parseEndTag );
						chars = false;
					}

				// start tag
				} else if ( html.indexOf("<") === 0 ) {
					match = html.match( startTag );

					if ( match ) {
						html = html.substring( match[0].length );
						match[0].replace( startTag, parseStartTag );
						chars = false;
					}
				}

				if ( chars ) {
					index = html.indexOf("<");

					var text = index < 0 ? html : html.substring( 0, index );
					html = index < 0 ? "" : html.substring( index );

					if ( handler.chars )
						handler.chars( text );
				}

			} else {
				html = html.replace(new RegExp("(.*)<\/" + stack.last() + "[^>]*>"), function(all, text){
					text = text.replace(/<!--(.*?)-->/g, "$1")
						.replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1");

					if ( handler.chars )
						handler.chars( text );

					return "";
				});

				parseEndTag( "", stack.last() );
			}

			if ( html === last )
				throw "Parse Error: " + html;
			last = html;
		}

		// Clean up any remaining tags
		parseEndTag();

		function parseStartTag( tag, tagName, rest, unary ) {
			tagName = tagName.toLowerCase();

			if ( block[ tagName ] ) {
				while ( stack.last() && inline[ stack.last() ] ) {
					parseEndTag( "", stack.last() );
				}
			}

			if ( closeSelf[ tagName ] && stack.last() === tagName ) {
				parseEndTag( "", tagName );
			}

			unary = empty[ tagName ] || !!unary;

			if ( !unary )
				stack.push( tagName );

			if ( handler.start ) {
				var attrs = [];

				rest.replace(attr, function(match, name) {
					var value = arguments[2] ? arguments[2] :
						arguments[3] ? arguments[3] :
						arguments[4] ? arguments[4] :
						fillAttrs[name] ? name : "";

					attrs.push({
						name: name,
						value: value,
						escaped: value.replace(/"/g, "&quot;")
					});
				});

				if ( handler.start )
					handler.start( tagName, attrs, unary );
			}
		}

		function parseEndTag( tag, tagName ) {
			var pos;
			// If no tag name is provided, clean shop
			if ( !tagName )
				pos = 0;

			// Find the closest opened tag of the same type
			else
				for ( pos = stack.length - 1; pos >= 0; pos-- )
					if ( stack[ pos ] === tagName )
						break;

			if ( pos >= 0 ) {
				// Close all the open elements, up the stack
				for ( var i = stack.length - 1; i >= pos; i-- )
					if ( handler.end )
						handler.end( stack[ i ] );

				// Remove the open elements from the stack
				stack.length = pos;
			}
		}
	};

	this.HTMLtoXML = function( html ) {
		var results = "";

		HTMLParser(html, {
			start: function( tag, attrs, unary ) {
				results += "<" + tag;

				for ( var i = 0; i < attrs.length; i++ )
					results += " " + attrs[i].name + '="' + attrs[i].escaped + '"';

				results += (unary ? "/" : "") + ">";
			},
			end: function( tag ) {
				results += "</" + tag + ">";
			},
			chars: function( text ) {
				results += text;
			},
			comment: function( text ) {
				results += "<!--" + text + "-->";
			}
		});

		return results;
	};

	this.HTMLtoDOM = function( html, doc ) {
		// There can be only one of these elements
		var one = makeMap("html,head,body,title");

		// Enforce a structure for the document
		var structure = {
			link: "head",
			base: "head"
		};

		if ( !doc ) {
			if ( typeof DOMDocument !== "undefined" )
				doc = new DOMDocument();
			else if ( typeof document !== "undefined" && document.implementation && document.implementation.createDocument )
				doc = document.implementation.createDocument("", "", null);
			else if ( typeof ActiveX !== "undefined" )
				doc = new ActiveXObject("Msxml.DOMDocument");

		} else
			doc = doc.ownerDocument ||
				doc.getOwnerDocument && doc.getOwnerDocument() ||
				doc;

		var elems = [],
			documentElement = doc.documentElement ||
				doc.getDocumentElement && doc.getDocumentElement();

		// If we're dealing with an empty document then we
		// need to pre-populate it with the HTML document structure
		if ( !documentElement && doc.createElement ) (function(){
			var html = doc.createElement("html");
			var head = doc.createElement("head");
			head.appendChild( doc.createElement("title") );
			html.appendChild( head );
			html.appendChild( doc.createElement("body") );
			doc.appendChild( html );
		})();

		// Find all the unique elements
		if ( doc.getElementsByTagName )
			for ( var i in one )
				one[ i ] = doc.getElementsByTagName( i )[0];

		// If we're working with a document, inject contents into
		// the body element
		var curParentNode = one.body;

		HTMLParser( html, {
			start: function( tagName, attrs, unary ) {
				// If it's a pre-built element, then we can ignore
				// its construction
				if ( one[ tagName ] ) {
					curParentNode = one[ tagName ];
					if ( !unary ) {
						elems.push( curParentNode );
					}
					return;
				}

				var elem = doc.createElement( tagName );

				for ( var attr in attrs )
					elem.setAttribute( attrs[ attr ].name, attrs[ attr ].value );

				if ( structure[ tagName ] && typeof one[ structure[ tagName ] ] !== "boolean" )
					one[ structure[ tagName ] ].appendChild( elem );

				else if ( curParentNode && curParentNode.appendChild )
					curParentNode.appendChild( elem );

				if ( !unary ) {
					elems.push( elem );
					curParentNode = elem;
				}
			},
			end: function( /* tag */ ) {
				elems.length -= 1;

				// Init the new parentNode
				curParentNode = elems[ elems.length - 1 ];
			},
			chars: function( text ) {
				curParentNode.appendChild( doc.createTextNode( text ) );
			},
			comment: function( /* text */ ) {
				// create comment node
			}
		});

		return doc;
	};

	function makeMap(str){
		var obj = {}, items = str.split(",");
		for ( var i = 0; i < items.length; i++ )
			obj[ items[i] ] = true;
		return obj;
	}

	return {HTMLParser: HTMLParser,
		HTMLtoXML: HTMLtoXML,
		HTMLtoDOM: HTMLtoDOM
	};
});

/*
 * changes to previous injection implementations
 * - no support for data-injection anymore, switch to new data-inject
 * - no support for data-href-next anymore, switch to data-inject: next-href
 * - XXX: add support for forms, see remnants in inject1 and ajaxify
 */
define('pat/inject',[
    "jquery",
    "./ajax",
    "../core/parser",
    "../core/logger",
    "../registry",
    "../utils",
    "../lib/htmlparser",
    "../jquery-ext"  // for :scrollable for autoLoading-visible
], function($, ajax, Parser, logger, registry, utils, htmlparser) {
    var log = logger.getLogger("pat.inject"),
        parser = new Parser("inject");

    //parser.add_argument("selector", "body");
    parser.add_argument("selector");
    //XXX: (yet) unsupported: parser.add_argument("target", "$selector");
    parser.add_argument("target");
    parser.add_argument("data-type", "html");
    parser.add_argument("next-href");
    //XXX: (yet) unsupported: parser.add_argument("source", "$selector");
    parser.add_argument("source");
    parser.add_argument("trigger", "default", ["default", "autoload", "autoload-visible"]);
    // XXX: this should not be here but the parser would bail on
    // unknown parameters and expand/collapsible need to pass the url
    // to us
    parser.add_argument("url");
    parser.add_argument("class");
    parser.add_argument("history");

    var _ = {
        name: "inject",
        trigger: "a.pat-inject, form.pat-inject, .pat-subform.pat-inject",
        init: function($el, opts) {
            if ($el.length > 1)
                return $el.each(function() { _.init($(this), opts); });

            var cfgs = _.extractConfig($el, opts);

            // if the injection shall add a history entry and HTML5 pushState
            // is missing, then don't initialize the injection.
            if (cfgs.some(function(e){return e.history === "record";}) &&
                    !("pushState" in history))
                return $el;

            $el.data("patterns.inject", cfgs);

            // In case next-href is specified the anchor's href will
            // be set to it after the injection is triggered. In case
            // the next href already exists, we do not activate the
            // injection but instead just change the anchors href.
            //
            // XXX: This is used in only one project for linked
            // fullcalendars, it's sanity is wonky and we should
            // probably solve it differently. -- Maybe it's cool
            // after all.
            var $nexthref = $(cfgs[0].nextHref);
            if ($el.is("a") && $nexthref.length > 0) {
                log.debug("Skipping as next href already exists", $nexthref);
                // XXX: reconsider how the injection enters exhausted state
                return $el.attr({href: (window.location.href.split("#")[0] || "") +
                                 cfgs[0].nextHref});
            }

            switch (cfgs[0].trigger) {
            case "default":
                // setup event handlers
                if ($el.is("a")) {
                    $el.on("click.pat-inject", _.onClick);
                } else if ($el.is("form")) {
                    $el.on("submit.pat-inject", _.onSubmit)
                       .on("click.pat-inject", "[type=submit]", ajax.onClickSubmit);
                } else if ($el.is(".pat-subform")) {
                    log.debug("Initializing subform with injection");
                }
                break;
            case "autoload":
                _.onClick.apply($el[0], []);
                break;
            case "autoload-visible":
                _._initAutoloadVisible($el);
                break;
            }

            log.debug("initialised:", $el);

            return $el;
        },

        destroy: function($el) {
            $el.off(".pat-inject");
            $el.data("patterns.inject", null);
            return $el;
        },

        onClick: function(ev) {
            var cfgs = $(this).data("patterns.inject"),
                $el = $(this);
            if (ev)
                ev.preventDefault();
            $el.trigger("patterns-inject-triggered");
            _.execute(cfgs, $el);
        },

        onSubmit: function(ev) {
            var cfgs = $(this).data("patterns.inject"),
                $el = $(this);
            if (ev)
                ev.preventDefault();
            $el.trigger("patterns-inject-triggered");
            _.execute(cfgs, $el);
        },

        submitSubform: function($sub) {
            var $el = $sub.parents('form'),
                cfgs = $sub.data("patterns.inject");
            try {
                $el.trigger("patterns-inject-triggered");
            } catch (e) {
                log.error("patterns-inject-triggered", e);
            }
            _.execute(cfgs, $el);
        },

        extractConfig: function($el, opts) {
            opts = $.extend({}, opts);

            var cfgs = parser.parse($el, opts, true);
            cfgs.forEach(function(cfg) {
                var urlparts, defaultSelector;
                // opts and cfg have priority, fallback to href/action
                cfg.url = opts.url || cfg.url || $el.attr("href") ||
                    $el.attr("action") || $el.parents('form').attr('action') ||
                    "";

                // separate selector from url
                urlparts = cfg.url.split("#");
                cfg.url = urlparts[0];

                // if no selector, check for selector as part of original url
                defaultSelector = urlparts[1] && "#" + urlparts[1] || "body";

                if (urlparts.length > 2) {
                    log.warn("Ignoring additional source ids:", urlparts.slice(2));
                }

                cfg.selector = cfg.selector || defaultSelector;
            });
            return cfgs;
        },
        // verify and post-process config
        // XXX: this should return a command instead of messing around on the config
        verifyConfig: function(cfgs, $el) {
            var url = cfgs[0].url;

            // verification for each cfg in the array needs to succeed
            return cfgs.every(function(cfg) {
                // in case of multi-injection, all injections need to use
                // the same url
                if (cfg.url !== url) {
                    log.error("Unsupported different urls for multi-inject");
                    return false;
                }

                // defaults
                cfg.source = cfg.source || cfg.selector;
                cfg.target = cfg.target || cfg.selector;

                if (!_._extractModifiers(cfg))
                    return false;

                // make sure target exist
                cfg.$target = cfg.$target || (cfg.target==="self" ? $el : $(cfg.target));
                if (cfg.$target.length === 0) {
                    if (!cfg.target) {
                        log.error("Need target selector", cfg);
                        return false;
                    }
                    cfg.$target = _._createTarget(cfg.target);
                    cfg.$injected = cfg.$target;
                }
                return true;
            });
        },

        _extractModifiers: function(cfg) {
            var source_re = /^(.*?)(::element)?$/,
                target_re = /^(.*?)(::element)?(::after|::before)?$/,
                source_match = source_re.exec(cfg.source),
                target_match = target_re.exec(cfg.target),
                targetMod, targetPosition;

            // source content or element?
            cfg.source = source_match[1];
            // XXX: turn into source processor
            cfg.sourceMod = source_match[2] ? "element" : "content";

            // will be added while the ajax request is in progress
            cfg.targetLoadClasses = "injecting";

            // target content or element?
            targetMod = target_match[2] ? "element" : "content";
            cfg.target = target_match[1];
            cfg.targetLoadClasses += " injecting-" + targetMod;

            // position relative to target
            targetPosition = (target_match[3] || "::").slice(2);
            if (targetPosition)
                cfg.targetLoadClasses += " injecting-" + targetPosition;

            cfg.action = targetMod + targetPosition;

            // Once we start detecting illegal combinations, we'll
            // return false in case of error
            return true;
        },

        // create a target that matches the selector
        //
        // XXX: so far we only support #target and create a div with
        // that id appended to the body.
        _createTarget: function(selector) {
            var $target;
            if (selector.slice(0,1) !== "#") {
                log.error("only id supported for non-existing target");
                return null;
            }
            $target = $("<div />").attr({id: selector.slice(1)});
            $("body").append($target);
            return $target;
        },

        execute: function(cfgs, $el) {
            // get a kinda deep copy, we scribble on it
            cfgs = cfgs.map(function(cfg) {
                return $.extend({}, cfg);
            });

            // XXX: this need to get functional, returning a command
            // for internal use, instead of passing on cfgs
            if (!_.verifyConfig(cfgs, $el))
                return;

            // possibility for spinners on targets
            cfgs.forEach(function(cfg) {
                cfg.$target.addClass(cfg.targetLoadClasses);
            });

            var onSuccess = function(ev) {
                var data = ev && ev.jqxhr && ev.jqxhr.responseText;
                if (!data) {
                    log.warn("No response content, aborting", ev);
                    return;
                }

                var sources$ = _.callTypeHandler(cfgs[0].dataType, "sources", $el, [cfgs, data, ev]);

                cfgs.forEach(function(cfg, idx) {
                    var $source = sources$[idx];

                    if (cfg.sourceMod === "content")
                        $source = $source.contents();

                    // perform injection
                    cfg.$target.each(function() {
                        var $src;

                        // $source.clone() does not work with shived elements in IE8
                        if (document.all && document.querySelector &&
                            !document.addEventListener) {
                            $src = $source.map(function() {
                                return $(this.outerHTML)[0];
                            });
                        } else {
                            $src = $source.clone();
                        }

                        var $target = $(this),
                            $injected = cfg.$injected || $src;

                        $src.findInclusive('img').on('load', function() {
                            $(this).trigger('pat-inject-content-loaded');
                        });

                        if (_._inject($src, $target, cfg.action, cfg["class"])) {
                            $injected.filter(function() {
                                // setting data on textnode fails in IE8
                                return this.nodeType !== 3; //Node.TEXT_NODE
                            }).data("pat-injected", {origin: cfg.url});
                            $injected.addClass(cfg["class"])
                                .trigger("patterns-injected", cfg);
                        }
                        if ((cfg.history === "record") &&
                            ("pushState" in history))
                            history.pushState({url: cfg.url}, "", cfg.url);
                    });
                });

                if (cfgs[0].nextHref) {
                    $el.attr({href: (window.location.href.split("#")[0] || "") +
                              cfgs[0].nextHref});
                    _.destroy($el);

                    // XXX: this used to be the case, but I don't see
                    // why that would be a good idea.
                    //
                    // jump to new href target
                    //if (!$el.hasClass("autoLoading-visible"))
                    //    window.location.href = $el.attr('href');
                }
                $el.off("pat-ajax-success.pat-inject");
                $el.off("pat-ajax-error.pat-inject");
            };

            var onError = function() {
                cfgs.forEach(function(cfg) {
                    if ("$injected" in cfg)
                        cfg.$injected.remove();
                });
                $el.off("pat-ajax-success.pat-inject");
                $el.off("pat-ajax-error.pat-inject");
            };

            $el.on("pat-ajax-success.pat-inject", onSuccess);
            $el.on("pat-ajax-error.pat-inject", onError);

            ajax.request($el, {url: cfgs[0].url});
        },

        _inject: function($source, $target, action /* , classes */) {
            // action to jquery method mapping, except for "content"
            // and "element"
            var method = {
                contentbefore: "prepend",
                contentafter:  "append",
                elementbefore: "before",
                elementafter:  "after"
            }[action];

            if ($source.length === 0) {
                log.warn("Aborting injection, source not found:", $source);
                return false;
            }
            if ($target.length === 0) {
                log.warn("Aborting injection, target not found:", $target);
                return false;
            }

            if (action === "content")
                $target.empty().append($source);
            else if (action === "element")
                $target.replaceWith($source);
            else
                $target[method]($source);

            return true;
        },

        _sourcesFromHtml: function(html, url, sources) {
            var $html = _._parseRawHtml(html, url);
            return sources.map(function(source) {
                if (source === "body")
                    source = "#__original_body";

                var $source = $html.find(source);

                if ($source.length === 0)
                    log.warn("No source elements for selector:", source, $html);

                $source.find("a[href^=\"#\"]").each(function() {
                    var href = this.getAttribute("href");
                    // Skip in-document links pointing to an id that is inside
                    // this fragment.
                    if (href.length === 1)  // Special case for top-of-page links
                        this.href=url;
                    else if (!$source.find(href).length)
                        this.href=url+href;
                });

                return $source;
            });
        },

        _link_attributes: {
            A: "href",
            FORM: "action",
            IMG: "src",
            SOURCE: "src",
            VIDEO: "src"
        },

        _rebaseHTML_via_HTMLParser: function(base, html) {
            var output = [],
                i, link_attribute, value;

            htmlparser.HTMLParser(html, {
                start: function(tag, attrs, unary) {
                    output.push("<"+tag);
                    link_attribute = _._link_attributes[tag.toUpperCase()];
                    for (i=0; i<attrs.length; i++) {
                        if (attrs[i].name.toLowerCase() === link_attribute) {
                            value = attrs[i].value;
                            // Do not rewrite Zope views or in-document links.
                            // In-document links will be processed later after
                            // extracting the right fragment.
                            if (value.slice(0, 2) !== "@@" && value[0] !== "#") {
                                value = utils.rebaseURL(base, value);
                                value = value.replace(/(^|[^\\])"/g, '$1\\\"');
                            }
                        }  else
                            value = attrs[i].escaped;
                        output.push(" " + attrs[i].name + "=\"" + value + "\"");
                    }
                    output.push(unary ? "/>" : ">");
                },

                end: function(tag) {
                    output.push("</"+tag+">");
                },

                chars: function(text) {
                    output.push(text);
                },

                comment: function(text) {
                    output.push("<!--"+text+"-->");
                }
            });
            return output.join("");
        },

        _rebaseAttrs: {
            A: "href",
            FORM: "action",
            IMG: "data-pat-inject-rebase-src",
            SOURCE: "data-pat-inject-rebase-src",
            VIDEO: "data-pat-inject-rebase-src"
        },

        _rebaseHTML: function(base, html) {
            var $page = $(html.replace(
                /(\s)(src\s*)=/gi,
                '$1src="" data-pat-inject-rebase-$2='
            ).trim()).wrapAll('<div>').parent();

            $page.find(Object.keys(_._rebaseAttrs).join(',')).each(function() {
                var $this = $(this),
                    attrName = _._rebaseAttrs[this.tagName],
                    value = $this.attr(attrName);

                if (value && value.slice(0, 2) !== "@@" && value[0] !== "#") {
                    value = utils.rebaseURL(base, value);
                    $this.attr(attrName, value);
                }
            });
            // XXX: IE8 changes the order of attributes in html. The following
            // lines move data-pat-inject-rebase-src to src.
            $page.find('[data-pat-inject-rebase-src]').each(function() {
                var $el = $(this);
                $el.attr('src', $el.attr('data-pat-inject-rebase-src'))
                   .removeAttr('data-pat-inject-rebase-src');
            });

            return $page.html().replace(
                    /src="" data-pat-inject-rebase-/g, ''
                ).trim();
        },

        _parseRawHtml: function(html, url) {
            url = url || "";

            // remove script tags and head and replace body by a div
            var clean_html = html
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                    .replace(/<head\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/head>/gi, "")
                    .replace(/<body([^>]*?)>/gi, "<div id=\"__original_body\">")
                    .replace(/<\/body([^>]*?)>/gi, "</div>");
            try {
                clean_html = _._rebaseHTML(url, clean_html);
            } catch (e) {
                log.error("Error rebasing urls", e);
            }
            var $html = $("<div/>").html(clean_html);

            if ($html.children().length === 0)
                log.warn("Parsing html resulted in empty jquery object:", clean_html);

            return $html;
        },

        // XXX: hack
        _initAutoloadVisible: function($el) {
            // ignore executed autoloads
            if ($el.data("patterns.inject.autoloaded"))
                return false;

            var $scrollable = $el.parents(":scrollable"),
                checkVisibility;

            // function to trigger the autoload and mark as triggered
            var trigger = function() {
                $el.data("patterns.inject.autoloaded", true);
                _.onClick.apply($el[0], []);
                return true;
            };

            // Use case 1: a (heigh-constrained) scrollable parent
            if ($scrollable.length) {
                // if scrollable parent and visible -> trigger it
                // we only look at the closest scrollable parent, no nesting
                checkVisibility = function() {
                    if ($el.data("patterns.autoload"))
                        return false;
                    var reltop = $el.offset().top - $scrollable.offset().top - 1000,
                        doTrigger = reltop <= $scrollable.innerHeight();
                    if (doTrigger) {
                        // checkVisibility was possibly installed as a scroll
                        // handler and has now served its purpose -> remove
                        $($scrollable[0]).off("scroll", checkVisibility);
                        $(window).off("resize.pat-autoload", checkVisibility);
                        return trigger();
                    }
                    return false;
                };
                if (checkVisibility())
                    return true;

                // wait to become visible - again only immediate scrollable parent
                $($scrollable[0]).on("scroll", utils.debounce(checkVisibility, 100));
                $(window).on("resize.pat-autoload", utils.debounce(checkVisibility, 100));
            } else {
                // Use case 2: scrolling the entire page
                checkVisibility = function() {
                    if ($el.data("patterns.autoload"))
                        return false;
                    if (!utils.elementInViewport($el[0]))
                        return false;

                    $(window).off(".pat-autoload", checkVisibility);
                    return trigger();
                };
                if (checkVisibility())
                    return true;
                $(window).on("resize.pat-autoload scroll.pat-autoload",
                        utils.debounce(checkVisibility, 100));
            }
            return false;
        },

        // XXX: simple so far to see what the team thinks of the idea
        registerTypeHandler: function(type, handler) {
            _.handlers[type] = handler;
        },

        callTypeHandler: function(type, fn, context, params) {
            type = type || "html";
            
            if (_.handlers[type] && $.isFunction(_.handlers[type][fn])) {
                return _.handlers[type][fn].apply(context, params);
            } else {
                return null;
            }
        },

        handlers: {
            "html": {
                sources: function(cfgs, data) {
                    var sources = cfgs.map(function(cfg) { return cfg.source; });
                    return _._sourcesFromHtml(data, cfgs[0].url, sources);
                }
            }
        }
    };

    $(document).on("patterns-injected", function(ev, cfg) {
        cfg.$target.removeClass(cfg.targetLoadClasses);
    });

    $(window).bind("popstate", function (event) {
        // popstate also triggers on traditional anchors
        if (!event.originalEvent.state) {
            history.replaceState("anchor", "", document.location.href);
            return;
        }
        window.location.reload();
    });

    // this entry ensures that the initally loaded page can be reached with
    // the back button
    if ("replaceState" in history) {
        history.replaceState("pageload", "", document.location.href);
    }

    registry.register(_);
    return _;
});

// jshint indent: 4, browser: true, jquery: true, quotmark: double
// vim: sw=4 expandtab
;
/**
 * Patterns store - store pattern state locally in the browser
 *
 * Copyright 2008-2012 Simplon B.V.
 * Copyright 2011 Humberto Sermeño
 * Copyright 2011 Florian Friesdorf
 */
define('core/store',[],function() {
    function Storage(backend, prefix) {
        this.prefix=prefix;
        this.backend=backend;
    }

    Storage.prototype._key = function(name) {
        return this.prefix + ":" + name;
    };

    Storage.prototype._allKeys = function() {
        var keys = [],
            prefix = this.prefix + ":",
            prefix_length = prefix.length,
            key, i;

        for (i=0; i<this.backend.length; i++) {
            key=this.backend.key(i);
            if (key.slice(0, prefix_length)===prefix)
                keys.push(key);
        }
        return keys;
    };

    Storage.prototype.get = function(name) {
        var key = this._key(name),
            value = this.backend.getItem(key);
        if (value!==null)
            value=JSON.parse(value);
        return value;
    };

    Storage.prototype.set = function(name, value) {
        var key = this._key(name);
        return this.backend.setItem(key, JSON.stringify(value));
    };

    Storage.prototype.remove = function(name) {
        var key = this._key(name);
        return this.backend.removeItem(key);
    };

    Storage.prototype.clear = function() {
        var keys = this._allKeys();
        for (var i=0; i<keys.length; i++)
            this.backend.removeItem(keys[i]);
    };

    Storage.prototype.all = function() {
        var keys = this._allKeys(),
            prefix_length = this.prefix.length + 1,
            lk,
            data = {};

        for (var i=0; i<keys.length; i++) {
            lk = keys[i].slice(prefix_length);
            data[lk]=JSON.parse(this.backend.getItem(keys[i]));
        }
        return data;
    };

    var store = {
        supported: false,

        local: function (name) {
            return new Storage(window.localStorage, name);
        },

        session: function (name) {
            return new Storage(window.sessionStorage, name);
        }
    };

    // Perform the test separately since this may throw a SecurityError as
    // reported in #326
    try {
        store.supported=typeof window.sessionStorage !== 'undefined';
    } catch(e) {
    }

    return store;
});

// vim: sw=4 expandtab
;
/**
 * Patterns collapsible - Collapsible content
 *
 * Copyright 2012-2013 Florian Friesdorf
 * Copyright 2012-2013 Simplon B.V. - Wichert Akkerman
 * Copyright 2012 Markus Maier
 * Copyright 2013 Peter Lamut
 * Copyright 2012 Jonas Hoersch
 */
define('pat/collapsible',[
    "jquery",
    "./inject",
    "../core/logger",
    "../core/parser",
    "../core/store",
    "../registry",
    "../jquery-ext"
], function($, inject, logger, Parser, store, registry) {
    var log = logger.getLogger("pat.collapsible"),
        parser = new Parser("collapsible");

    parser.add_argument("load-content");
    parser.add_argument("store", "none", ["none", "session", "local"]);
    parser.add_argument("transition", "slide", ["none", "css", "fade", "slide", "slide-horizontal"]);
    parser.add_argument("effect-duration", "fast");
    parser.add_argument("effect-easing", "swing");
    parser.add_argument("closed", false);
    parser.add_argument("trigger", "::first");

    var _ = {
        name: "collapsible",
        trigger: ".pat-collapsible",
        jquery_plugin: true,

        transitions: {
            none: {closed: "hide", open: "show"},
            fade: {closed: "fadeOut", open: "fadeIn"},
            slide: {closed: "slideUp", open: "slideDown"},
            "slide-horizontal": {closed: "slideOut", open: "slideIn"}
        },

        init: function($el, opts) {
            return $el.each(function() {
                var $el = $(this),
                    options = _._validateOptions(this, parser.parse($el, opts)),
                // create collapsible structure
                    $content, state, storage;

                if (options.trigger === "::first") {
                    options.$trigger = $el.children(":first");
                    $content = $el.children(":gt(0)");
                } else {
                    options.$trigger = $(options.trigger);
                    $content = $el.children();
                }

                if (options.$trigger.length === 0) {
                    log.error("Collapsible has no trigger.", this);
                    return;
                }

                options.$panel = $el.find('.panel-content');
                if (options.$panel.length === 0) {
                    if ($content.length) {
                        options.$panel = $content
                            .wrapAll("<div class='panel-content' />")
                            .parent();
                    } else {
                        options.$panel = $("<div class='panel-content' />")
                            .insertAfter(options.$trigger);
                    }
                }

                $el.data("patternCollapsible", options);
                state=(options.closed || $el.hasClass("closed")) ? "closed" : "open";
                if (options.store!=="none") {
                    storage=(options.store==="local" ? store.local : store.session)(_.name);
                    state=storage.get(this.id) || state;
                }

                if (state==="closed") {
                    options.$trigger.removeClass("collapsible-open").addClass("collapsible-closed");
                    $el.removeClass("open").addClass("closed");
                    options.$panel.hide();
                } else {
                    if (options.loadContent)
                        _._loadContent($el, options.loadContent, options.$panel);
                    options.$trigger.removeClass("collapsible-closed").addClass("collapsible-open");
                    $el.removeClass("closed").addClass("open");
                    options.$panel.show();
                }

                options.$trigger
                    .off(".pat-collapsible")
                    .on("click.pat-collapsible", null, $el, _._onClick);

                return $el;
            });
        },

        _onClick: function(event) {
            _.toggle(event.data);
        },

        destroy: function($el) {
            $el.removeData("patternCollapsible");
            $el.children(":first").off(".pat-collapsible");
        },

        open: function($el) {
            if (!$el.hasClass("open"))
                _.toggle($el);
            return $el;
        },

        close: function($el) {
            if (!$el.hasClass("closed"))
                _.toggle($el);
            return $el;
        },

        _validateOptions: function(trigger, options) {
            if (options.store!=="none") {
                if (!trigger.id) {
                    log.warn("state persistance requested, but element has no id");
                    options.store="none";
                } else if (!store.supported) {
                    log.warn("state persistance requested, but browser does not support webstorage");
                    options.store="none";
                }
            }
            return options;
        },

        _loadContent: function($el, url, $target) {
            var components = url.split("#"),
                base_url = components[0],
                id = components[1] ? "#" + components[1] : "body",
                opts = [{
                    url: base_url,
                    source: id,
                    $target: $target,
                    dataType: "html"
                }];
            inject.execute(opts, $el);
        },

        // jQuery method to force loading of content.
        loadContent: function($el) {
            return $el.each(function() {
                var $el = $(this),
                    options = $(this).data("patternCollapsible");
                if (options.loadContent)
                    _._loadContent($el, options.loadContent, options.$panel);
            });
        },

        toggle: function($el) {
            var options = $el.data("patternCollapsible"),
                new_state = $el.hasClass("closed") ? "open" : "closed";

            if (options.store!=="none") {
                var storage=(options.store==="local" ? store.local : store.session)(_.name);
                storage.set($el.attr("id"), new_state);
            }

            if (new_state==="open") {
                $el.trigger("patterns-collapsible-open");
                _._transit($el, "closed", "open", options);
            } else {
                $el.trigger("patterns-collapsible-close");
                _._transit($el, "open", "closed", options);
            }

            // allow for chaining
            return $el;
        },

        _transit: function($el, from_cls, to_cls, options) {
            if (to_cls === "open" && options.loadContent)
                _._loadContent($el, options.loadContent, options.$panel);

            var duration = (options.transition==="css" || options.transition==="none") ? null : options.effect.duration;

            if (!duration) {
                options.$trigger
                        .removeClass("collapsible-" + from_cls)
                        .addClass("collapsible-" + to_cls);
                $el
                    .removeClass(from_cls)
                    .addClass(to_cls)
                    .trigger("pat-update",
                            {pattern: "collapsible",
                             transition: "complete"});
            } else {
                var t = _.transitions[options.transition];
                $el
                    .addClass("in-progress")
                    .trigger("pat-update",
                            {pattern: "collapsible",
                             transition: "start"});
                options.$trigger.addClass("collapsible-in-progress");
                options.$panel[t[to_cls]](duration, options.effect.easing, function() {
                    options.$trigger
                            .removeClass("collapsible-" + from_cls)
                            .removeClass("collapsible-in-progress")
                            .addClass("collapsible-" + to_cls);
                    $el
                        .removeClass(from_cls)
                        .removeClass("in-progress")
                        .addClass(to_cls)
                        .trigger("pat-update",
                            {pattern: "collapsible",
                             transition: "complete"});
                });
            }
        }
    };

    registry.register(_);
    return _;
});

// jshint indent: 4, browser: true, jquery: true, quotmark: double
// vim: sw=4 expandtab
;
define('lib/depends_parse',[],function() {
  /*
   * Generated by PEG.js 0.7.0.
   *
   * http://pegjs.majda.cz/
   */
  
  function quote(s) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
     * string literal except for the closing quote character, backslash,
     * carriage return, line separator, paragraph separator, and line feed.
     * Any character may appear in the form of an escape sequence.
     *
     * For portability, we also escape escape all control and non-ASCII
     * characters. Note that "\0" and "\v" escape sequences are not used
     * because JSHint does not like the first and IE the second.
     */
     return '"' + s
      .replace(/\\/g, '\\\\')  // backslash
      .replace(/"/g, '\\"')    // closing quote character
      .replace(/\x08/g, '\\b') // backspace
      .replace(/\t/g, '\\t')   // horizontal tab
      .replace(/\n/g, '\\n')   // line feed
      .replace(/\f/g, '\\f')   // form feed
      .replace(/\r/g, '\\r')   // carriage return
      .replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)
      + '"';
  }
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function(input, startRule) {
      var parseFunctions = {
        "expression": parse_expression,
        "simple_expression": parse_simple_expression,
        "equal_comparison": parse_equal_comparison,
        "order_comparison": parse_order_comparison,
        "logical": parse_logical,
        "identifier": parse_identifier,
        "value": parse_value,
        "number": parse_number,
        "_": parse__,
        "__": parse___,
        "SourceCharacter": parse_SourceCharacter,
        "WhiteSpace": parse_WhiteSpace,
        "IdentifierPart": parse_IdentifierPart,
        "StringLiteral": parse_StringLiteral,
        "DoubleStringCharacters": parse_DoubleStringCharacters,
        "SingleStringCharacters": parse_SingleStringCharacters,
        "DoubleStringCharacter": parse_DoubleStringCharacter,
        "SingleStringCharacter": parse_SingleStringCharacter,
        "EscapeSequence": parse_EscapeSequence,
        "CharacterEscapeSequence": parse_CharacterEscapeSequence,
        "SingleEscapeCharacter": parse_SingleEscapeCharacter,
        "NonEscapeCharacter": parse_NonEscapeCharacter,
        "EscapeCharacter": parse_EscapeCharacter,
        "HexEscapeSequence": parse_HexEscapeSequence,
        "UnicodeEscapeSequence": parse_UnicodeEscapeSequence,
        "DecimalDigit": parse_DecimalDigit,
        "HexDigit": parse_HexDigit,
        "UnicodeLetter": parse_UnicodeLetter,
        "UnicodeCombiningMark": parse_UnicodeCombiningMark,
        "Ll": parse_Ll,
        "Lm": parse_Lm,
        "Lo": parse_Lo,
        "Lt": parse_Lt,
        "Lu": parse_Lu,
        "Mc": parse_Mc,
        "Mn": parse_Mn,
        "Nd": parse_Nd,
        "Nl": parse_Nl,
        "Pc": parse_Pc,
        "Zs": parse_Zs
      };
      
      if (startRule !== undefined) {
        if (parseFunctions[startRule] === undefined) {
          throw new Error("Invalid rule name: " + quote(startRule) + ".");
        }
      } else {
        startRule = "expression";
      }
      
      var pos = 0;
      var reportFailures = 0;
      var rightmostFailuresPos = 0;
      var rightmostFailuresExpected = [];
      
      function padLeft(input, padding, length) {
        var result = input;
        
        var padLength = length - input.length;
        for (var i = 0; i < padLength; i++) {
          result = padding + result;
        }
        
        return result;
      }
      
      function escape(ch) {
        var charCode = ch.charCodeAt(0);
        var escapeChar;
        var length;
        
        if (charCode <= 0xFF) {
          escapeChar = 'x';
          length = 2;
        } else {
          escapeChar = 'u';
          length = 4;
        }
        
        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
      }
      
      function matchFailed(failure) {
        if (pos < rightmostFailuresPos) {
          return;
        }
        
        if (pos > rightmostFailuresPos) {
          rightmostFailuresPos = pos;
          rightmostFailuresExpected = [];
        }
        
        rightmostFailuresExpected.push(failure);
      }
      
      function parse_expression() {
        var result0, result1, result2, result3, result4;
        var pos0, pos1;
        
        pos0 = pos;
        pos1 = pos;
        if (input.substr(pos, 3).toLowerCase() === "not") {
          result0 = input.substr(pos, 3);
          pos += 3;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"not\"");
          }
        }
        if (result0 !== null) {
          result1 = parse__();
          if (result1 !== null) {
            result2 = parse_simple_expression();
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, node) {
                return {type: "NOT", children: [node]};
            })(pos0, result0[2]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        if (result0 === null) {
          pos0 = pos;
          pos1 = pos;
          result0 = parse_simple_expression();
          if (result0 !== null) {
            result1 = parse__();
            if (result1 !== null) {
              result2 = parse_logical();
              if (result2 !== null) {
                result3 = parse__();
                if (result3 !== null) {
                  result4 = parse_expression();
                  if (result4 !== null) {
                    result0 = [result0, result1, result2, result3, result4];
                  } else {
                    result0 = null;
                    pos = pos1;
                  }
                } else {
                  result0 = null;
                  pos = pos1;
                }
              } else {
                result0 = null;
                pos = pos1;
              }
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
          if (result0 !== null) {
            result0 = (function(offset, left, type, right) {
                  return {type: type.toUpperCase(), children: [left, right]};
              })(pos0, result0[0], result0[2], result0[4]);
          }
          if (result0 === null) {
            pos = pos0;
          }
          if (result0 === null) {
            pos0 = pos;
            result0 = parse_simple_expression();
            if (result0 !== null) {
              result0 = (function(offset, node) { return node; })(pos0, result0);
            }
            if (result0 === null) {
              pos = pos0;
            }
          }
        }
        return result0;
      }
      
      function parse_simple_expression() {
        var result0, result1, result2, result3, result4;
        var pos0, pos1;
        
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 40) {
          result0 = "(";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"(\"");
          }
        }
        if (result0 !== null) {
          result1 = parse___();
          if (result1 !== null) {
            result2 = parse_expression();
            if (result2 !== null) {
              result3 = parse___();
              if (result3 !== null) {
                if (input.charCodeAt(pos) === 41) {
                  result4 = ")";
                  pos++;
                } else {
                  result4 = null;
                  if (reportFailures === 0) {
                    matchFailed("\")\"");
                  }
                }
                if (result4 !== null) {
                  result0 = [result0, result1, result2, result3, result4];
                } else {
                  result0 = null;
                  pos = pos1;
                }
              } else {
                result0 = null;
                pos = pos1;
              }
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, content) {
                return content;
            })(pos0, result0[2]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        if (result0 === null) {
          pos0 = pos;
          pos1 = pos;
          result0 = parse_identifier();
          if (result0 !== null) {
            result1 = parse___();
            if (result1 !== null) {
              result2 = parse_equal_comparison();
              if (result2 !== null) {
                result3 = parse___();
                if (result3 !== null) {
                  result4 = parse_value();
                  if (result4 !== null) {
                    result0 = [result0, result1, result2, result3, result4];
                  } else {
                    result0 = null;
                    pos = pos1;
                  }
                } else {
                  result0 = null;
                  pos = pos1;
                }
              } else {
                result0 = null;
                pos = pos1;
              }
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
          if (result0 !== null) {
            result0 = (function(offset, input, op, value) {
                  return {type: "comparison", operator: op, input: input, value: value};
              })(pos0, result0[0], result0[2], result0[4]);
          }
          if (result0 === null) {
            pos = pos0;
          }
          if (result0 === null) {
            pos0 = pos;
            pos1 = pos;
            result0 = parse_identifier();
            if (result0 !== null) {
              result1 = parse___();
              if (result1 !== null) {
                result2 = parse_order_comparison();
                if (result2 !== null) {
                  result3 = parse___();
                  if (result3 !== null) {
                    result4 = parse_number();
                    if (result4 !== null) {
                      result0 = [result0, result1, result2, result3, result4];
                    } else {
                      result0 = null;
                      pos = pos1;
                    }
                  } else {
                    result0 = null;
                    pos = pos1;
                  }
                } else {
                  result0 = null;
                  pos = pos1;
                }
              } else {
                result0 = null;
                pos = pos1;
              }
            } else {
              result0 = null;
              pos = pos1;
            }
            if (result0 !== null) {
              result0 = (function(offset, input, op, value) {
                    return {type: "comparison", operator: op, input: input, value: value};
                })(pos0, result0[0], result0[2], result0[4]);
            }
            if (result0 === null) {
              pos = pos0;
            }
            if (result0 === null) {
              pos0 = pos;
              result0 = parse_identifier();
              if (result0 !== null) {
                result0 = (function(offset, input) {
                      return {type: "truthy", input: input};
                  })(pos0, result0);
              }
              if (result0 === null) {
                pos = pos0;
              }
            }
          }
        }
        return result0;
      }
      
      function parse_equal_comparison() {
        var result0;
        
        reportFailures++;
        if (input.charCodeAt(pos) === 61) {
          result0 = "=";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"=\"");
          }
        }
        if (result0 === null) {
          if (input.substr(pos, 2) === "!=") {
            result0 = "!=";
            pos += 2;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"!=\"");
            }
          }
          if (result0 === null) {
            if (input.substr(pos, 2) === "~=") {
              result0 = "~=";
              pos += 2;
            } else {
              result0 = null;
              if (reportFailures === 0) {
                matchFailed("\"~=\"");
              }
            }
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("comparison operator");
        }
        return result0;
      }
      
      function parse_order_comparison() {
        var result0;
        
        reportFailures++;
        if (input.substr(pos, 2) === "<=") {
          result0 = "<=";
          pos += 2;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"<=\"");
          }
        }
        if (result0 === null) {
          if (input.charCodeAt(pos) === 60) {
            result0 = "<";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"<\"");
            }
          }
          if (result0 === null) {
            if (input.substr(pos, 2) === ">=") {
              result0 = ">=";
              pos += 2;
            } else {
              result0 = null;
              if (reportFailures === 0) {
                matchFailed("\">=\"");
              }
            }
            if (result0 === null) {
              if (input.charCodeAt(pos) === 62) {
                result0 = ">";
                pos++;
              } else {
                result0 = null;
                if (reportFailures === 0) {
                  matchFailed("\">\"");
                }
              }
            }
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("comparison operator");
        }
        return result0;
      }
      
      function parse_logical() {
        var result0;
        
        reportFailures++;
        if (input.substr(pos, 3).toLowerCase() === "and") {
          result0 = input.substr(pos, 3);
          pos += 3;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"and\"");
          }
        }
        if (result0 === null) {
          if (input.substr(pos, 2).toLowerCase() === "or") {
            result0 = input.substr(pos, 2);
            pos += 2;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"or\"");
            }
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("logical operator");
        }
        return result0;
      }
      
      function parse_identifier() {
        var result0, result1;
        var pos0;
        
        reportFailures++;
        pos0 = pos;
        result1 = parse_IdentifierPart();
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            result1 = parse_IdentifierPart();
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars) {
              return chars.join("");
          })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("input name");
        }
        return result0;
      }
      
      function parse_value() {
        var result0, result1;
        var pos0;
        
        reportFailures++;
        pos0 = pos;
        result1 = parse_IdentifierPart();
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            result1 = parse_IdentifierPart();
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars) { return chars.join(""); })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        if (result0 === null) {
          result0 = parse_StringLiteral();
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("value");
        }
        return result0;
      }
      
      function parse_number() {
        var result0, result1;
        var pos0;
        
        reportFailures++;
        pos0 = pos;
        if (/^[0-9]/.test(input.charAt(pos))) {
          result1 = input.charAt(pos);
          pos++;
        } else {
          result1 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9]");
          }
        }
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            if (/^[0-9]/.test(input.charAt(pos))) {
              result1 = input.charAt(pos);
              pos++;
            } else {
              result1 = null;
              if (reportFailures === 0) {
                matchFailed("[0-9]");
              }
            }
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, digits) {
              return parseInt(digits.join(""), 10);
          })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("number");
        }
        return result0;
      }
      
      function parse__() {
        var result0, result1;
        
        result1 = parse_WhiteSpace();
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            result1 = parse_WhiteSpace();
          }
        } else {
          result0 = null;
        }
        return result0;
      }
      
      function parse___() {
        var result0, result1;
        
        result0 = [];
        result1 = parse_WhiteSpace();
        while (result1 !== null) {
          result0.push(result1);
          result1 = parse_WhiteSpace();
        }
        return result0;
      }
      
      function parse_SourceCharacter() {
        var result0;
        
        if (input.length > pos) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("any character");
          }
        }
        return result0;
      }
      
      function parse_WhiteSpace() {
        var result0;
        
        reportFailures++;
        if (/^[\t\x0B\f \xA0\uFEFF]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\t\\x0B\\f \\xA0\\uFEFF]");
          }
        }
        if (result0 === null) {
          result0 = parse_Zs();
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("whitespace");
        }
        return result0;
      }
      
      function parse_IdentifierPart() {
        var result0;
        var pos0;
        
        result0 = parse_UnicodeLetter();
        if (result0 === null) {
          if (input.charCodeAt(pos) === 36) {
            result0 = "$";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"$\"");
            }
          }
          if (result0 === null) {
            if (input.charCodeAt(pos) === 95) {
              result0 = "_";
              pos++;
            } else {
              result0 = null;
              if (reportFailures === 0) {
                matchFailed("\"_\"");
              }
            }
            if (result0 === null) {
              if (input.charCodeAt(pos) === 45) {
                result0 = "-";
                pos++;
              } else {
                result0 = null;
                if (reportFailures === 0) {
                  matchFailed("\"-\"");
                }
              }
              if (result0 === null) {
                if (input.charCodeAt(pos) === 46) {
                  result0 = ".";
                  pos++;
                } else {
                  result0 = null;
                  if (reportFailures === 0) {
                    matchFailed("\".\"");
                  }
                }
                if (result0 === null) {
                  result0 = parse_UnicodeCombiningMark();
                  if (result0 === null) {
                    result0 = parse_Nd();
                    if (result0 === null) {
                      result0 = parse_Pc();
                      if (result0 === null) {
                        pos0 = pos;
                        if (input.charCodeAt(pos) === 8204) {
                          result0 = "\u200C";
                          pos++;
                        } else {
                          result0 = null;
                          if (reportFailures === 0) {
                            matchFailed("\"\\u200C\"");
                          }
                        }
                        if (result0 !== null) {
                          result0 = (function(offset) { return "\u200C"; })(pos0);
                        }
                        if (result0 === null) {
                          pos = pos0;
                        }
                        if (result0 === null) {
                          pos0 = pos;
                          if (input.charCodeAt(pos) === 8205) {
                            result0 = "\u200D";
                            pos++;
                          } else {
                            result0 = null;
                            if (reportFailures === 0) {
                              matchFailed("\"\\u200D\"");
                            }
                          }
                          if (result0 !== null) {
                            result0 = (function(offset) { return "\u200D"; })(pos0);
                          }
                          if (result0 === null) {
                            pos = pos0;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return result0;
      }
      
      function parse_StringLiteral() {
        var result0, result1, result2;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 34) {
          result0 = "\"";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\"\"");
          }
        }
        if (result0 !== null) {
          result1 = parse_DoubleStringCharacters();
          result1 = result1 !== null ? result1 : "";
          if (result1 !== null) {
            if (input.charCodeAt(pos) === 34) {
              result2 = "\"";
              pos++;
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\"\"");
              }
            }
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 === null) {
          pos1 = pos;
          if (input.charCodeAt(pos) === 39) {
            result0 = "'";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"'\"");
            }
          }
          if (result0 !== null) {
            result1 = parse_SingleStringCharacters();
            result1 = result1 !== null ? result1 : "";
            if (result1 !== null) {
              if (input.charCodeAt(pos) === 39) {
                result2 = "'";
                pos++;
              } else {
                result2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"'\"");
                }
              }
              if (result2 !== null) {
                result0 = [result0, result1, result2];
              } else {
                result0 = null;
                pos = pos1;
              }
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, parts) {
              return parts[1];
            })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("string");
        }
        return result0;
      }
      
      function parse_DoubleStringCharacters() {
        var result0, result1;
        var pos0;
        
        pos0 = pos;
        result1 = parse_DoubleStringCharacter();
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            result1 = parse_DoubleStringCharacter();
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars) { return chars.join(""); })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_SingleStringCharacters() {
        var result0, result1;
        var pos0;
        
        pos0 = pos;
        result1 = parse_SingleStringCharacter();
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            result1 = parse_SingleStringCharacter();
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars) { return chars.join(""); })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_DoubleStringCharacter() {
        var result0, result1;
        var pos0, pos1, pos2;
        
        pos0 = pos;
        pos1 = pos;
        pos2 = pos;
        reportFailures++;
        if (input.charCodeAt(pos) === 34) {
          result0 = "\"";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\"\"");
          }
        }
        if (result0 === null) {
          if (input.charCodeAt(pos) === 92) {
            result0 = "\\";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
        }
        reportFailures--;
        if (result0 === null) {
          result0 = "";
        } else {
          result0 = null;
          pos = pos2;
        }
        if (result0 !== null) {
          result1 = parse_SourceCharacter();
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, char_) { return char_;     })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        if (result0 === null) {
          pos0 = pos;
          pos1 = pos;
          if (input.charCodeAt(pos) === 92) {
            result0 = "\\";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
          if (result0 !== null) {
            result1 = parse_EscapeSequence();
            if (result1 !== null) {
              result0 = [result0, result1];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
          if (result0 !== null) {
            result0 = (function(offset, sequence) { return sequence;  })(pos0, result0[1]);
          }
          if (result0 === null) {
            pos = pos0;
          }
        }
        return result0;
      }
      
      function parse_SingleStringCharacter() {
        var result0, result1;
        var pos0, pos1, pos2;
        
        pos0 = pos;
        pos1 = pos;
        pos2 = pos;
        reportFailures++;
        if (input.charCodeAt(pos) === 39) {
          result0 = "'";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"'\"");
          }
        }
        if (result0 === null) {
          if (input.charCodeAt(pos) === 92) {
            result0 = "\\";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
        }
        reportFailures--;
        if (result0 === null) {
          result0 = "";
        } else {
          result0 = null;
          pos = pos2;
        }
        if (result0 !== null) {
          result1 = parse_SourceCharacter();
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, char_) { return char_;     })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        if (result0 === null) {
          pos0 = pos;
          pos1 = pos;
          if (input.charCodeAt(pos) === 92) {
            result0 = "\\";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\\\"");
            }
          }
          if (result0 !== null) {
            result1 = parse_EscapeSequence();
            if (result1 !== null) {
              result0 = [result0, result1];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
          if (result0 !== null) {
            result0 = (function(offset, sequence) { return sequence;  })(pos0, result0[1]);
          }
          if (result0 === null) {
            pos = pos0;
          }
        }
        return result0;
      }
      
      function parse_EscapeSequence() {
        var result0, result1;
        var pos0, pos1, pos2;
        
        result0 = parse_CharacterEscapeSequence();
        if (result0 === null) {
          pos0 = pos;
          pos1 = pos;
          if (input.charCodeAt(pos) === 48) {
            result0 = "0";
            pos++;
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"0\"");
            }
          }
          if (result0 !== null) {
            pos2 = pos;
            reportFailures++;
            result1 = parse_DecimalDigit();
            reportFailures--;
            if (result1 === null) {
              result1 = "";
            } else {
              result1 = null;
              pos = pos2;
            }
            if (result1 !== null) {
              result0 = [result0, result1];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
          if (result0 !== null) {
            result0 = (function(offset) { return "\0"; })(pos0);
          }
          if (result0 === null) {
            pos = pos0;
          }
          if (result0 === null) {
            result0 = parse_HexEscapeSequence();
            if (result0 === null) {
              result0 = parse_UnicodeEscapeSequence();
            }
          }
        }
        return result0;
      }
      
      function parse_CharacterEscapeSequence() {
        var result0;
        
        result0 = parse_SingleEscapeCharacter();
        if (result0 === null) {
          result0 = parse_NonEscapeCharacter();
        }
        return result0;
      }
      
      function parse_SingleEscapeCharacter() {
        var result0;
        var pos0;
        
        pos0 = pos;
        if (/^['"\\bfnrtv]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("['\"\\\\bfnrtv]");
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, char_) {
              return char_
                .replace("b", "\b")
                .replace("f", "\f")
                .replace("n", "\n")
                .replace("r", "\r")
                .replace("t", "\t")
                .replace("v", "\x0B") // IE does not recognize "\v".
            })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_NonEscapeCharacter() {
        var result0, result1;
        var pos0, pos1, pos2;
        
        pos0 = pos;
        pos1 = pos;
        pos2 = pos;
        reportFailures++;
        result0 = parse_EscapeCharacter();
        reportFailures--;
        if (result0 === null) {
          result0 = "";
        } else {
          result0 = null;
          pos = pos2;
        }
        if (result0 !== null) {
          result1 = parse_SourceCharacter();
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, char_) { return char_; })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_EscapeCharacter() {
        var result0;
        
        result0 = parse_SingleEscapeCharacter();
        if (result0 === null) {
          result0 = parse_DecimalDigit();
          if (result0 === null) {
            if (input.charCodeAt(pos) === 120) {
              result0 = "x";
              pos++;
            } else {
              result0 = null;
              if (reportFailures === 0) {
                matchFailed("\"x\"");
              }
            }
            if (result0 === null) {
              if (input.charCodeAt(pos) === 117) {
                result0 = "u";
                pos++;
              } else {
                result0 = null;
                if (reportFailures === 0) {
                  matchFailed("\"u\"");
                }
              }
            }
          }
        }
        return result0;
      }
      
      function parse_HexEscapeSequence() {
        var result0, result1, result2;
        var pos0, pos1, pos2;
        
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 120) {
          result0 = "x";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"x\"");
          }
        }
        if (result0 !== null) {
          pos2 = pos;
          result1 = parse_HexDigit();
          if (result1 !== null) {
            result2 = parse_HexDigit();
            if (result2 !== null) {
              result1 = [result1, result2];
            } else {
              result1 = null;
              pos = pos2;
            }
          } else {
            result1 = null;
            pos = pos2;
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, digits) {
              return String.fromCharCode(parseInt("0x" + digits));
            })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_UnicodeEscapeSequence() {
        var result0, result1, result2, result3, result4;
        var pos0, pos1, pos2;
        
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 117) {
          result0 = "u";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"u\"");
          }
        }
        if (result0 !== null) {
          pos2 = pos;
          result1 = parse_HexDigit();
          if (result1 !== null) {
            result2 = parse_HexDigit();
            if (result2 !== null) {
              result3 = parse_HexDigit();
              if (result3 !== null) {
                result4 = parse_HexDigit();
                if (result4 !== null) {
                  result1 = [result1, result2, result3, result4];
                } else {
                  result1 = null;
                  pos = pos2;
                }
              } else {
                result1 = null;
                pos = pos2;
              }
            } else {
              result1 = null;
              pos = pos2;
            }
          } else {
            result1 = null;
            pos = pos2;
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, digits) {
              return String.fromCharCode(parseInt("0x" + digits));
            })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_DecimalDigit() {
        var result0;
        
        if (/^[0-9]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9]");
          }
        }
        return result0;
      }
      
      function parse_HexDigit() {
        var result0;
        
        if (/^[0-9a-fA-F]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9a-fA-F]");
          }
        }
        return result0;
      }
      
      function parse_UnicodeLetter() {
        var result0;
        
        result0 = parse_Lu();
        if (result0 === null) {
          result0 = parse_Ll();
          if (result0 === null) {
            result0 = parse_Lt();
            if (result0 === null) {
              result0 = parse_Lm();
              if (result0 === null) {
                result0 = parse_Lo();
                if (result0 === null) {
                  result0 = parse_Nl();
                }
              }
            }
          }
        }
        return result0;
      }
      
      function parse_UnicodeCombiningMark() {
        var result0;
        
        result0 = parse_Mn();
        if (result0 === null) {
          result0 = parse_Mc();
        }
        return result0;
      }
      
      function parse_Ll() {
        var result0;
        
        if (/^[abcdefghijklmnopqrstuvwxyz\xAA\xB5\xBA\xDF\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE7\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF0\xF1\xF2\xF3\xF4\xF5\xF6\xF8\xF9\xFA\xFB\xFC\xFD\xFE\xFF\u0101\u0103\u0105\u0107\u0109\u010B\u010D\u010F\u0111\u0113\u0115\u0117\u0119\u011B\u011D\u011F\u0121\u0123\u0125\u0127\u0129\u012B\u012D\u012F\u0131\u0133\u0135\u0137\u0138\u013A\u013C\u013E\u0140\u0142\u0144\u0146\u0148\u0149\u014B\u014D\u014F\u0151\u0153\u0155\u0157\u0159\u015B\u015D\u015F\u0161\u0163\u0165\u0167\u0169\u016B\u016D\u016F\u0171\u0173\u0175\u0177\u017A\u017C\u017E\u017F\u0180\u0183\u0185\u0188\u018C\u018D\u0192\u0195\u0199\u019A\u019B\u019E\u01A1\u01A3\u01A5\u01A8\u01AA\u01AB\u01AD\u01B0\u01B4\u01B6\u01B9\u01BA\u01BD\u01BE\u01BF\u01C6\u01C9\u01CC\u01CE\u01D0\u01D2\u01D4\u01D6\u01D8\u01DA\u01DC\u01DD\u01DF\u01E1\u01E3\u01E5\u01E7\u01E9\u01EB\u01ED\u01EF\u01F0\u01F3\u01F5\u01F9\u01FB\u01FD\u01FF\u0201\u0203\u0205\u0207\u0209\u020B\u020D\u020F\u0211\u0213\u0215\u0217\u0219\u021B\u021D\u021F\u0221\u0223\u0225\u0227\u0229\u022B\u022D\u022F\u0231\u0233\u0234\u0235\u0236\u0237\u0238\u0239\u023C\u023F\u0240\u0242\u0247\u0249\u024B\u024D\u024F\u0250\u0251\u0252\u0253\u0254\u0255\u0256\u0257\u0258\u0259\u025A\u025B\u025C\u025D\u025E\u025F\u0260\u0261\u0262\u0263\u0264\u0265\u0266\u0267\u0268\u0269\u026A\u026B\u026C\u026D\u026E\u026F\u0270\u0271\u0272\u0273\u0274\u0275\u0276\u0277\u0278\u0279\u027A\u027B\u027C\u027D\u027E\u027F\u0280\u0281\u0282\u0283\u0284\u0285\u0286\u0287\u0288\u0289\u028A\u028B\u028C\u028D\u028E\u028F\u0290\u0291\u0292\u0293\u0295\u0296\u0297\u0298\u0299\u029A\u029B\u029C\u029D\u029E\u029F\u02A0\u02A1\u02A2\u02A3\u02A4\u02A5\u02A6\u02A7\u02A8\u02A9\u02AA\u02AB\u02AC\u02AD\u02AE\u02AF\u0371\u0373\u0377\u037B\u037C\u037D\u0390\u03AC\u03AD\u03AE\u03AF\u03B0\u03B1\u03B2\u03B3\u03B4\u03B5\u03B6\u03B7\u03B8\u03B9\u03BA\u03BB\u03BC\u03BD\u03BE\u03BF\u03C0\u03C1\u03C2\u03C3\u03C4\u03C5\u03C6\u03C7\u03C8\u03C9\u03CA\u03CB\u03CC\u03CD\u03CE\u03D0\u03D1\u03D5\u03D6\u03D7\u03D9\u03DB\u03DD\u03DF\u03E1\u03E3\u03E5\u03E7\u03E9\u03EB\u03ED\u03EF\u03F0\u03F1\u03F2\u03F3\u03F5\u03F8\u03FB\u03FC\u0430\u0431\u0432\u0433\u0434\u0435\u0436\u0437\u0438\u0439\u043A\u043B\u043C\u043D\u043E\u043F\u0440\u0441\u0442\u0443\u0444\u0445\u0446\u0447\u0448\u0449\u044A\u044B\u044C\u044D\u044E\u044F\u0450\u0451\u0452\u0453\u0454\u0455\u0456\u0457\u0458\u0459\u045A\u045B\u045C\u045D\u045E\u045F\u0461\u0463\u0465\u0467\u0469\u046B\u046D\u046F\u0471\u0473\u0475\u0477\u0479\u047B\u047D\u047F\u0481\u048B\u048D\u048F\u0491\u0493\u0495\u0497\u0499\u049B\u049D\u049F\u04A1\u04A3\u04A5\u04A7\u04A9\u04AB\u04AD\u04AF\u04B1\u04B3\u04B5\u04B7\u04B9\u04BB\u04BD\u04BF\u04C2\u04C4\u04C6\u04C8\u04CA\u04CC\u04CE\u04CF\u04D1\u04D3\u04D5\u04D7\u04D9\u04DB\u04DD\u04DF\u04E1\u04E3\u04E5\u04E7\u04E9\u04EB\u04ED\u04EF\u04F1\u04F3\u04F5\u04F7\u04F9\u04FB\u04FD\u04FF\u0501\u0503\u0505\u0507\u0509\u050B\u050D\u050F\u0511\u0513\u0515\u0517\u0519\u051B\u051D\u051F\u0521\u0523\u0561\u0562\u0563\u0564\u0565\u0566\u0567\u0568\u0569\u056A\u056B\u056C\u056D\u056E\u056F\u0570\u0571\u0572\u0573\u0574\u0575\u0576\u0577\u0578\u0579\u057A\u057B\u057C\u057D\u057E\u057F\u0580\u0581\u0582\u0583\u0584\u0585\u0586\u0587\u1D00\u1D01\u1D02\u1D03\u1D04\u1D05\u1D06\u1D07\u1D08\u1D09\u1D0A\u1D0B\u1D0C\u1D0D\u1D0E\u1D0F\u1D10\u1D11\u1D12\u1D13\u1D14\u1D15\u1D16\u1D17\u1D18\u1D19\u1D1A\u1D1B\u1D1C\u1D1D\u1D1E\u1D1F\u1D20\u1D21\u1D22\u1D23\u1D24\u1D25\u1D26\u1D27\u1D28\u1D29\u1D2A\u1D2B\u1D62\u1D63\u1D64\u1D65\u1D66\u1D67\u1D68\u1D69\u1D6A\u1D6B\u1D6C\u1D6D\u1D6E\u1D6F\u1D70\u1D71\u1D72\u1D73\u1D74\u1D75\u1D76\u1D77\u1D79\u1D7A\u1D7B\u1D7C\u1D7D\u1D7E\u1D7F\u1D80\u1D81\u1D82\u1D83\u1D84\u1D85\u1D86\u1D87\u1D88\u1D89\u1D8A\u1D8B\u1D8C\u1D8D\u1D8E\u1D8F\u1D90\u1D91\u1D92\u1D93\u1D94\u1D95\u1D96\u1D97\u1D98\u1D99\u1D9A\u1E01\u1E03\u1E05\u1E07\u1E09\u1E0B\u1E0D\u1E0F\u1E11\u1E13\u1E15\u1E17\u1E19\u1E1B\u1E1D\u1E1F\u1E21\u1E23\u1E25\u1E27\u1E29\u1E2B\u1E2D\u1E2F\u1E31\u1E33\u1E35\u1E37\u1E39\u1E3B\u1E3D\u1E3F\u1E41\u1E43\u1E45\u1E47\u1E49\u1E4B\u1E4D\u1E4F\u1E51\u1E53\u1E55\u1E57\u1E59\u1E5B\u1E5D\u1E5F\u1E61\u1E63\u1E65\u1E67\u1E69\u1E6B\u1E6D\u1E6F\u1E71\u1E73\u1E75\u1E77\u1E79\u1E7B\u1E7D\u1E7F\u1E81\u1E83\u1E85\u1E87\u1E89\u1E8B\u1E8D\u1E8F\u1E91\u1E93\u1E95\u1E96\u1E97\u1E98\u1E99\u1E9A\u1E9B\u1E9C\u1E9D\u1E9F\u1EA1\u1EA3\u1EA5\u1EA7\u1EA9\u1EAB\u1EAD\u1EAF\u1EB1\u1EB3\u1EB5\u1EB7\u1EB9\u1EBB\u1EBD\u1EBF\u1EC1\u1EC3\u1EC5\u1EC7\u1EC9\u1ECB\u1ECD\u1ECF\u1ED1\u1ED3\u1ED5\u1ED7\u1ED9\u1EDB\u1EDD\u1EDF\u1EE1\u1EE3\u1EE5\u1EE7\u1EE9\u1EEB\u1EED\u1EEF\u1EF1\u1EF3\u1EF5\u1EF7\u1EF9\u1EFB\u1EFD\u1EFF\u1F00\u1F01\u1F02\u1F03\u1F04\u1F05\u1F06\u1F07\u1F10\u1F11\u1F12\u1F13\u1F14\u1F15\u1F20\u1F21\u1F22\u1F23\u1F24\u1F25\u1F26\u1F27\u1F30\u1F31\u1F32\u1F33\u1F34\u1F35\u1F36\u1F37\u1F40\u1F41\u1F42\u1F43\u1F44\u1F45\u1F50\u1F51\u1F52\u1F53\u1F54\u1F55\u1F56\u1F57\u1F60\u1F61\u1F62\u1F63\u1F64\u1F65\u1F66\u1F67\u1F70\u1F71\u1F72\u1F73\u1F74\u1F75\u1F76\u1F77\u1F78\u1F79\u1F7A\u1F7B\u1F7C\u1F7D\u1F80\u1F81\u1F82\u1F83\u1F84\u1F85\u1F86\u1F87\u1F90\u1F91\u1F92\u1F93\u1F94\u1F95\u1F96\u1F97\u1FA0\u1FA1\u1FA2\u1FA3\u1FA4\u1FA5\u1FA6\u1FA7\u1FB0\u1FB1\u1FB2\u1FB3\u1FB4\u1FB6\u1FB7\u1FBE\u1FC2\u1FC3\u1FC4\u1FC6\u1FC7\u1FD0\u1FD1\u1FD2\u1FD3\u1FD6\u1FD7\u1FE0\u1FE1\u1FE2\u1FE3\u1FE4\u1FE5\u1FE6\u1FE7\u1FF2\u1FF3\u1FF4\u1FF6\u1FF7\u2071\u207F\u210A\u210E\u210F\u2113\u212F\u2134\u2139\u213C\u213D\u2146\u2147\u2148\u2149\u214E\u2184\u2C30\u2C31\u2C32\u2C33\u2C34\u2C35\u2C36\u2C37\u2C38\u2C39\u2C3A\u2C3B\u2C3C\u2C3D\u2C3E\u2C3F\u2C40\u2C41\u2C42\u2C43\u2C44\u2C45\u2C46\u2C47\u2C48\u2C49\u2C4A\u2C4B\u2C4C\u2C4D\u2C4E\u2C4F\u2C50\u2C51\u2C52\u2C53\u2C54\u2C55\u2C56\u2C57\u2C58\u2C59\u2C5A\u2C5B\u2C5C\u2C5D\u2C5E\u2C61\u2C65\u2C66\u2C68\u2C6A\u2C6C\u2C71\u2C73\u2C74\u2C76\u2C77\u2C78\u2C79\u2C7A\u2C7B\u2C7C\u2C81\u2C83\u2C85\u2C87\u2C89\u2C8B\u2C8D\u2C8F\u2C91\u2C93\u2C95\u2C97\u2C99\u2C9B\u2C9D\u2C9F\u2CA1\u2CA3\u2CA5\u2CA7\u2CA9\u2CAB\u2CAD\u2CAF\u2CB1\u2CB3\u2CB5\u2CB7\u2CB9\u2CBB\u2CBD\u2CBF\u2CC1\u2CC3\u2CC5\u2CC7\u2CC9\u2CCB\u2CCD\u2CCF\u2CD1\u2CD3\u2CD5\u2CD7\u2CD9\u2CDB\u2CDD\u2CDF\u2CE1\u2CE3\u2CE4\u2D00\u2D01\u2D02\u2D03\u2D04\u2D05\u2D06\u2D07\u2D08\u2D09\u2D0A\u2D0B\u2D0C\u2D0D\u2D0E\u2D0F\u2D10\u2D11\u2D12\u2D13\u2D14\u2D15\u2D16\u2D17\u2D18\u2D19\u2D1A\u2D1B\u2D1C\u2D1D\u2D1E\u2D1F\u2D20\u2D21\u2D22\u2D23\u2D24\u2D25\uA641\uA643\uA645\uA647\uA649\uA64B\uA64D\uA64F\uA651\uA653\uA655\uA657\uA659\uA65B\uA65D\uA65F\uA663\uA665\uA667\uA669\uA66B\uA66D\uA681\uA683\uA685\uA687\uA689\uA68B\uA68D\uA68F\uA691\uA693\uA695\uA697\uA723\uA725\uA727\uA729\uA72B\uA72D\uA72F\uA730\uA731\uA733\uA735\uA737\uA739\uA73B\uA73D\uA73F\uA741\uA743\uA745\uA747\uA749\uA74B\uA74D\uA74F\uA751\uA753\uA755\uA757\uA759\uA75B\uA75D\uA75F\uA761\uA763\uA765\uA767\uA769\uA76B\uA76D\uA76F\uA771\uA772\uA773\uA774\uA775\uA776\uA777\uA778\uA77A\uA77C\uA77F\uA781\uA783\uA785\uA787\uA78C\uFB00\uFB01\uFB02\uFB03\uFB04\uFB05\uFB06\uFB13\uFB14\uFB15\uFB16\uFB17\uFF41\uFF42\uFF43\uFF44\uFF45\uFF46\uFF47\uFF48\uFF49\uFF4A\uFF4B\uFF4C\uFF4D\uFF4E\uFF4F\uFF50\uFF51\uFF52\uFF53\uFF54\uFF55\uFF56\uFF57\uFF58\uFF59\uFF5A]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[abcdefghijklmnopqrstuvwxyz\\xAA\\xB5\\xBA\\xDF\\xE0\\xE1\\xE2\\xE3\\xE4\\xE5\\xE6\\xE7\\xE8\\xE9\\xEA\\xEB\\xEC\\xED\\xEE\\xEF\\xF0\\xF1\\xF2\\xF3\\xF4\\xF5\\xF6\\xF8\\xF9\\xFA\\xFB\\xFC\\xFD\\xFE\\xFF\\u0101\\u0103\\u0105\\u0107\\u0109\\u010B\\u010D\\u010F\\u0111\\u0113\\u0115\\u0117\\u0119\\u011B\\u011D\\u011F\\u0121\\u0123\\u0125\\u0127\\u0129\\u012B\\u012D\\u012F\\u0131\\u0133\\u0135\\u0137\\u0138\\u013A\\u013C\\u013E\\u0140\\u0142\\u0144\\u0146\\u0148\\u0149\\u014B\\u014D\\u014F\\u0151\\u0153\\u0155\\u0157\\u0159\\u015B\\u015D\\u015F\\u0161\\u0163\\u0165\\u0167\\u0169\\u016B\\u016D\\u016F\\u0171\\u0173\\u0175\\u0177\\u017A\\u017C\\u017E\\u017F\\u0180\\u0183\\u0185\\u0188\\u018C\\u018D\\u0192\\u0195\\u0199\\u019A\\u019B\\u019E\\u01A1\\u01A3\\u01A5\\u01A8\\u01AA\\u01AB\\u01AD\\u01B0\\u01B4\\u01B6\\u01B9\\u01BA\\u01BD\\u01BE\\u01BF\\u01C6\\u01C9\\u01CC\\u01CE\\u01D0\\u01D2\\u01D4\\u01D6\\u01D8\\u01DA\\u01DC\\u01DD\\u01DF\\u01E1\\u01E3\\u01E5\\u01E7\\u01E9\\u01EB\\u01ED\\u01EF\\u01F0\\u01F3\\u01F5\\u01F9\\u01FB\\u01FD\\u01FF\\u0201\\u0203\\u0205\\u0207\\u0209\\u020B\\u020D\\u020F\\u0211\\u0213\\u0215\\u0217\\u0219\\u021B\\u021D\\u021F\\u0221\\u0223\\u0225\\u0227\\u0229\\u022B\\u022D\\u022F\\u0231\\u0233\\u0234\\u0235\\u0236\\u0237\\u0238\\u0239\\u023C\\u023F\\u0240\\u0242\\u0247\\u0249\\u024B\\u024D\\u024F\\u0250\\u0251\\u0252\\u0253\\u0254\\u0255\\u0256\\u0257\\u0258\\u0259\\u025A\\u025B\\u025C\\u025D\\u025E\\u025F\\u0260\\u0261\\u0262\\u0263\\u0264\\u0265\\u0266\\u0267\\u0268\\u0269\\u026A\\u026B\\u026C\\u026D\\u026E\\u026F\\u0270\\u0271\\u0272\\u0273\\u0274\\u0275\\u0276\\u0277\\u0278\\u0279\\u027A\\u027B\\u027C\\u027D\\u027E\\u027F\\u0280\\u0281\\u0282\\u0283\\u0284\\u0285\\u0286\\u0287\\u0288\\u0289\\u028A\\u028B\\u028C\\u028D\\u028E\\u028F\\u0290\\u0291\\u0292\\u0293\\u0295\\u0296\\u0297\\u0298\\u0299\\u029A\\u029B\\u029C\\u029D\\u029E\\u029F\\u02A0\\u02A1\\u02A2\\u02A3\\u02A4\\u02A5\\u02A6\\u02A7\\u02A8\\u02A9\\u02AA\\u02AB\\u02AC\\u02AD\\u02AE\\u02AF\\u0371\\u0373\\u0377\\u037B\\u037C\\u037D\\u0390\\u03AC\\u03AD\\u03AE\\u03AF\\u03B0\\u03B1\\u03B2\\u03B3\\u03B4\\u03B5\\u03B6\\u03B7\\u03B8\\u03B9\\u03BA\\u03BB\\u03BC\\u03BD\\u03BE\\u03BF\\u03C0\\u03C1\\u03C2\\u03C3\\u03C4\\u03C5\\u03C6\\u03C7\\u03C8\\u03C9\\u03CA\\u03CB\\u03CC\\u03CD\\u03CE\\u03D0\\u03D1\\u03D5\\u03D6\\u03D7\\u03D9\\u03DB\\u03DD\\u03DF\\u03E1\\u03E3\\u03E5\\u03E7\\u03E9\\u03EB\\u03ED\\u03EF\\u03F0\\u03F1\\u03F2\\u03F3\\u03F5\\u03F8\\u03FB\\u03FC\\u0430\\u0431\\u0432\\u0433\\u0434\\u0435\\u0436\\u0437\\u0438\\u0439\\u043A\\u043B\\u043C\\u043D\\u043E\\u043F\\u0440\\u0441\\u0442\\u0443\\u0444\\u0445\\u0446\\u0447\\u0448\\u0449\\u044A\\u044B\\u044C\\u044D\\u044E\\u044F\\u0450\\u0451\\u0452\\u0453\\u0454\\u0455\\u0456\\u0457\\u0458\\u0459\\u045A\\u045B\\u045C\\u045D\\u045E\\u045F\\u0461\\u0463\\u0465\\u0467\\u0469\\u046B\\u046D\\u046F\\u0471\\u0473\\u0475\\u0477\\u0479\\u047B\\u047D\\u047F\\u0481\\u048B\\u048D\\u048F\\u0491\\u0493\\u0495\\u0497\\u0499\\u049B\\u049D\\u049F\\u04A1\\u04A3\\u04A5\\u04A7\\u04A9\\u04AB\\u04AD\\u04AF\\u04B1\\u04B3\\u04B5\\u04B7\\u04B9\\u04BB\\u04BD\\u04BF\\u04C2\\u04C4\\u04C6\\u04C8\\u04CA\\u04CC\\u04CE\\u04CF\\u04D1\\u04D3\\u04D5\\u04D7\\u04D9\\u04DB\\u04DD\\u04DF\\u04E1\\u04E3\\u04E5\\u04E7\\u04E9\\u04EB\\u04ED\\u04EF\\u04F1\\u04F3\\u04F5\\u04F7\\u04F9\\u04FB\\u04FD\\u04FF\\u0501\\u0503\\u0505\\u0507\\u0509\\u050B\\u050D\\u050F\\u0511\\u0513\\u0515\\u0517\\u0519\\u051B\\u051D\\u051F\\u0521\\u0523\\u0561\\u0562\\u0563\\u0564\\u0565\\u0566\\u0567\\u0568\\u0569\\u056A\\u056B\\u056C\\u056D\\u056E\\u056F\\u0570\\u0571\\u0572\\u0573\\u0574\\u0575\\u0576\\u0577\\u0578\\u0579\\u057A\\u057B\\u057C\\u057D\\u057E\\u057F\\u0580\\u0581\\u0582\\u0583\\u0584\\u0585\\u0586\\u0587\\u1D00\\u1D01\\u1D02\\u1D03\\u1D04\\u1D05\\u1D06\\u1D07\\u1D08\\u1D09\\u1D0A\\u1D0B\\u1D0C\\u1D0D\\u1D0E\\u1D0F\\u1D10\\u1D11\\u1D12\\u1D13\\u1D14\\u1D15\\u1D16\\u1D17\\u1D18\\u1D19\\u1D1A\\u1D1B\\u1D1C\\u1D1D\\u1D1E\\u1D1F\\u1D20\\u1D21\\u1D22\\u1D23\\u1D24\\u1D25\\u1D26\\u1D27\\u1D28\\u1D29\\u1D2A\\u1D2B\\u1D62\\u1D63\\u1D64\\u1D65\\u1D66\\u1D67\\u1D68\\u1D69\\u1D6A\\u1D6B\\u1D6C\\u1D6D\\u1D6E\\u1D6F\\u1D70\\u1D71\\u1D72\\u1D73\\u1D74\\u1D75\\u1D76\\u1D77\\u1D79\\u1D7A\\u1D7B\\u1D7C\\u1D7D\\u1D7E\\u1D7F\\u1D80\\u1D81\\u1D82\\u1D83\\u1D84\\u1D85\\u1D86\\u1D87\\u1D88\\u1D89\\u1D8A\\u1D8B\\u1D8C\\u1D8D\\u1D8E\\u1D8F\\u1D90\\u1D91\\u1D92\\u1D93\\u1D94\\u1D95\\u1D96\\u1D97\\u1D98\\u1D99\\u1D9A\\u1E01\\u1E03\\u1E05\\u1E07\\u1E09\\u1E0B\\u1E0D\\u1E0F\\u1E11\\u1E13\\u1E15\\u1E17\\u1E19\\u1E1B\\u1E1D\\u1E1F\\u1E21\\u1E23\\u1E25\\u1E27\\u1E29\\u1E2B\\u1E2D\\u1E2F\\u1E31\\u1E33\\u1E35\\u1E37\\u1E39\\u1E3B\\u1E3D\\u1E3F\\u1E41\\u1E43\\u1E45\\u1E47\\u1E49\\u1E4B\\u1E4D\\u1E4F\\u1E51\\u1E53\\u1E55\\u1E57\\u1E59\\u1E5B\\u1E5D\\u1E5F\\u1E61\\u1E63\\u1E65\\u1E67\\u1E69\\u1E6B\\u1E6D\\u1E6F\\u1E71\\u1E73\\u1E75\\u1E77\\u1E79\\u1E7B\\u1E7D\\u1E7F\\u1E81\\u1E83\\u1E85\\u1E87\\u1E89\\u1E8B\\u1E8D\\u1E8F\\u1E91\\u1E93\\u1E95\\u1E96\\u1E97\\u1E98\\u1E99\\u1E9A\\u1E9B\\u1E9C\\u1E9D\\u1E9F\\u1EA1\\u1EA3\\u1EA5\\u1EA7\\u1EA9\\u1EAB\\u1EAD\\u1EAF\\u1EB1\\u1EB3\\u1EB5\\u1EB7\\u1EB9\\u1EBB\\u1EBD\\u1EBF\\u1EC1\\u1EC3\\u1EC5\\u1EC7\\u1EC9\\u1ECB\\u1ECD\\u1ECF\\u1ED1\\u1ED3\\u1ED5\\u1ED7\\u1ED9\\u1EDB\\u1EDD\\u1EDF\\u1EE1\\u1EE3\\u1EE5\\u1EE7\\u1EE9\\u1EEB\\u1EED\\u1EEF\\u1EF1\\u1EF3\\u1EF5\\u1EF7\\u1EF9\\u1EFB\\u1EFD\\u1EFF\\u1F00\\u1F01\\u1F02\\u1F03\\u1F04\\u1F05\\u1F06\\u1F07\\u1F10\\u1F11\\u1F12\\u1F13\\u1F14\\u1F15\\u1F20\\u1F21\\u1F22\\u1F23\\u1F24\\u1F25\\u1F26\\u1F27\\u1F30\\u1F31\\u1F32\\u1F33\\u1F34\\u1F35\\u1F36\\u1F37\\u1F40\\u1F41\\u1F42\\u1F43\\u1F44\\u1F45\\u1F50\\u1F51\\u1F52\\u1F53\\u1F54\\u1F55\\u1F56\\u1F57\\u1F60\\u1F61\\u1F62\\u1F63\\u1F64\\u1F65\\u1F66\\u1F67\\u1F70\\u1F71\\u1F72\\u1F73\\u1F74\\u1F75\\u1F76\\u1F77\\u1F78\\u1F79\\u1F7A\\u1F7B\\u1F7C\\u1F7D\\u1F80\\u1F81\\u1F82\\u1F83\\u1F84\\u1F85\\u1F86\\u1F87\\u1F90\\u1F91\\u1F92\\u1F93\\u1F94\\u1F95\\u1F96\\u1F97\\u1FA0\\u1FA1\\u1FA2\\u1FA3\\u1FA4\\u1FA5\\u1FA6\\u1FA7\\u1FB0\\u1FB1\\u1FB2\\u1FB3\\u1FB4\\u1FB6\\u1FB7\\u1FBE\\u1FC2\\u1FC3\\u1FC4\\u1FC6\\u1FC7\\u1FD0\\u1FD1\\u1FD2\\u1FD3\\u1FD6\\u1FD7\\u1FE0\\u1FE1\\u1FE2\\u1FE3\\u1FE4\\u1FE5\\u1FE6\\u1FE7\\u1FF2\\u1FF3\\u1FF4\\u1FF6\\u1FF7\\u2071\\u207F\\u210A\\u210E\\u210F\\u2113\\u212F\\u2134\\u2139\\u213C\\u213D\\u2146\\u2147\\u2148\\u2149\\u214E\\u2184\\u2C30\\u2C31\\u2C32\\u2C33\\u2C34\\u2C35\\u2C36\\u2C37\\u2C38\\u2C39\\u2C3A\\u2C3B\\u2C3C\\u2C3D\\u2C3E\\u2C3F\\u2C40\\u2C41\\u2C42\\u2C43\\u2C44\\u2C45\\u2C46\\u2C47\\u2C48\\u2C49\\u2C4A\\u2C4B\\u2C4C\\u2C4D\\u2C4E\\u2C4F\\u2C50\\u2C51\\u2C52\\u2C53\\u2C54\\u2C55\\u2C56\\u2C57\\u2C58\\u2C59\\u2C5A\\u2C5B\\u2C5C\\u2C5D\\u2C5E\\u2C61\\u2C65\\u2C66\\u2C68\\u2C6A\\u2C6C\\u2C71\\u2C73\\u2C74\\u2C76\\u2C77\\u2C78\\u2C79\\u2C7A\\u2C7B\\u2C7C\\u2C81\\u2C83\\u2C85\\u2C87\\u2C89\\u2C8B\\u2C8D\\u2C8F\\u2C91\\u2C93\\u2C95\\u2C97\\u2C99\\u2C9B\\u2C9D\\u2C9F\\u2CA1\\u2CA3\\u2CA5\\u2CA7\\u2CA9\\u2CAB\\u2CAD\\u2CAF\\u2CB1\\u2CB3\\u2CB5\\u2CB7\\u2CB9\\u2CBB\\u2CBD\\u2CBF\\u2CC1\\u2CC3\\u2CC5\\u2CC7\\u2CC9\\u2CCB\\u2CCD\\u2CCF\\u2CD1\\u2CD3\\u2CD5\\u2CD7\\u2CD9\\u2CDB\\u2CDD\\u2CDF\\u2CE1\\u2CE3\\u2CE4\\u2D00\\u2D01\\u2D02\\u2D03\\u2D04\\u2D05\\u2D06\\u2D07\\u2D08\\u2D09\\u2D0A\\u2D0B\\u2D0C\\u2D0D\\u2D0E\\u2D0F\\u2D10\\u2D11\\u2D12\\u2D13\\u2D14\\u2D15\\u2D16\\u2D17\\u2D18\\u2D19\\u2D1A\\u2D1B\\u2D1C\\u2D1D\\u2D1E\\u2D1F\\u2D20\\u2D21\\u2D22\\u2D23\\u2D24\\u2D25\\uA641\\uA643\\uA645\\uA647\\uA649\\uA64B\\uA64D\\uA64F\\uA651\\uA653\\uA655\\uA657\\uA659\\uA65B\\uA65D\\uA65F\\uA663\\uA665\\uA667\\uA669\\uA66B\\uA66D\\uA681\\uA683\\uA685\\uA687\\uA689\\uA68B\\uA68D\\uA68F\\uA691\\uA693\\uA695\\uA697\\uA723\\uA725\\uA727\\uA729\\uA72B\\uA72D\\uA72F\\uA730\\uA731\\uA733\\uA735\\uA737\\uA739\\uA73B\\uA73D\\uA73F\\uA741\\uA743\\uA745\\uA747\\uA749\\uA74B\\uA74D\\uA74F\\uA751\\uA753\\uA755\\uA757\\uA759\\uA75B\\uA75D\\uA75F\\uA761\\uA763\\uA765\\uA767\\uA769\\uA76B\\uA76D\\uA76F\\uA771\\uA772\\uA773\\uA774\\uA775\\uA776\\uA777\\uA778\\uA77A\\uA77C\\uA77F\\uA781\\uA783\\uA785\\uA787\\uA78C\\uFB00\\uFB01\\uFB02\\uFB03\\uFB04\\uFB05\\uFB06\\uFB13\\uFB14\\uFB15\\uFB16\\uFB17\\uFF41\\uFF42\\uFF43\\uFF44\\uFF45\\uFF46\\uFF47\\uFF48\\uFF49\\uFF4A\\uFF4B\\uFF4C\\uFF4D\\uFF4E\\uFF4F\\uFF50\\uFF51\\uFF52\\uFF53\\uFF54\\uFF55\\uFF56\\uFF57\\uFF58\\uFF59\\uFF5A]");
          }
        }
        return result0;
      }
      
      function parse_Lm() {
        var result0;
        
        if (/^[\u02B0\u02B1\u02B2\u02B3\u02B4\u02B5\u02B6\u02B7\u02B8\u02B9\u02BA\u02BB\u02BC\u02BD\u02BE\u02BF\u02C0\u02C1\u02C6\u02C7\u02C8\u02C9\u02CA\u02CB\u02CC\u02CD\u02CE\u02CF\u02D0\u02D1\u02E0\u02E1\u02E2\u02E3\u02E4\u02EC\u02EE\u0374\u037A\u0559\u0640\u06E5\u06E6\u07F4\u07F5\u07FA\u0971\u0E46\u0EC6\u10FC\u17D7\u1843\u1C78\u1C79\u1C7A\u1C7B\u1C7C\u1C7D\u1D2C\u1D2D\u1D2E\u1D2F\u1D30\u1D31\u1D32\u1D33\u1D34\u1D35\u1D36\u1D37\u1D38\u1D39\u1D3A\u1D3B\u1D3C\u1D3D\u1D3E\u1D3F\u1D40\u1D41\u1D42\u1D43\u1D44\u1D45\u1D46\u1D47\u1D48\u1D49\u1D4A\u1D4B\u1D4C\u1D4D\u1D4E\u1D4F\u1D50\u1D51\u1D52\u1D53\u1D54\u1D55\u1D56\u1D57\u1D58\u1D59\u1D5A\u1D5B\u1D5C\u1D5D\u1D5E\u1D5F\u1D60\u1D61\u1D78\u1D9B\u1D9C\u1D9D\u1D9E\u1D9F\u1DA0\u1DA1\u1DA2\u1DA3\u1DA4\u1DA5\u1DA6\u1DA7\u1DA8\u1DA9\u1DAA\u1DAB\u1DAC\u1DAD\u1DAE\u1DAF\u1DB0\u1DB1\u1DB2\u1DB3\u1DB4\u1DB5\u1DB6\u1DB7\u1DB8\u1DB9\u1DBA\u1DBB\u1DBC\u1DBD\u1DBE\u1DBF\u2090\u2091\u2092\u2093\u2094\u2C7D\u2D6F\u2E2F\u3005\u3031\u3032\u3033\u3034\u3035\u303B\u309D\u309E\u30FC\u30FD\u30FE\uA015\uA60C\uA67F\uA717\uA718\uA719\uA71A\uA71B\uA71C\uA71D\uA71E\uA71F\uA770\uA788\uFF70\uFF9E\uFF9F]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u02B0\\u02B1\\u02B2\\u02B3\\u02B4\\u02B5\\u02B6\\u02B7\\u02B8\\u02B9\\u02BA\\u02BB\\u02BC\\u02BD\\u02BE\\u02BF\\u02C0\\u02C1\\u02C6\\u02C7\\u02C8\\u02C9\\u02CA\\u02CB\\u02CC\\u02CD\\u02CE\\u02CF\\u02D0\\u02D1\\u02E0\\u02E1\\u02E2\\u02E3\\u02E4\\u02EC\\u02EE\\u0374\\u037A\\u0559\\u0640\\u06E5\\u06E6\\u07F4\\u07F5\\u07FA\\u0971\\u0E46\\u0EC6\\u10FC\\u17D7\\u1843\\u1C78\\u1C79\\u1C7A\\u1C7B\\u1C7C\\u1C7D\\u1D2C\\u1D2D\\u1D2E\\u1D2F\\u1D30\\u1D31\\u1D32\\u1D33\\u1D34\\u1D35\\u1D36\\u1D37\\u1D38\\u1D39\\u1D3A\\u1D3B\\u1D3C\\u1D3D\\u1D3E\\u1D3F\\u1D40\\u1D41\\u1D42\\u1D43\\u1D44\\u1D45\\u1D46\\u1D47\\u1D48\\u1D49\\u1D4A\\u1D4B\\u1D4C\\u1D4D\\u1D4E\\u1D4F\\u1D50\\u1D51\\u1D52\\u1D53\\u1D54\\u1D55\\u1D56\\u1D57\\u1D58\\u1D59\\u1D5A\\u1D5B\\u1D5C\\u1D5D\\u1D5E\\u1D5F\\u1D60\\u1D61\\u1D78\\u1D9B\\u1D9C\\u1D9D\\u1D9E\\u1D9F\\u1DA0\\u1DA1\\u1DA2\\u1DA3\\u1DA4\\u1DA5\\u1DA6\\u1DA7\\u1DA8\\u1DA9\\u1DAA\\u1DAB\\u1DAC\\u1DAD\\u1DAE\\u1DAF\\u1DB0\\u1DB1\\u1DB2\\u1DB3\\u1DB4\\u1DB5\\u1DB6\\u1DB7\\u1DB8\\u1DB9\\u1DBA\\u1DBB\\u1DBC\\u1DBD\\u1DBE\\u1DBF\\u2090\\u2091\\u2092\\u2093\\u2094\\u2C7D\\u2D6F\\u2E2F\\u3005\\u3031\\u3032\\u3033\\u3034\\u3035\\u303B\\u309D\\u309E\\u30FC\\u30FD\\u30FE\\uA015\\uA60C\\uA67F\\uA717\\uA718\\uA719\\uA71A\\uA71B\\uA71C\\uA71D\\uA71E\\uA71F\\uA770\\uA788\\uFF70\\uFF9E\\uFF9F]");
          }
        }
        return result0;
      }
      
      function parse_Lo() {
        var result0;
        
        if (/^[\u01BB\u01C0\u01C1\u01C2\u01C3\u0294\u05D0\u05D1\u05D2\u05D3\u05D4\u05D5\u05D6\u05D7\u05D8\u05D9\u05DA\u05DB\u05DC\u05DD\u05DE\u05DF\u05E0\u05E1\u05E2\u05E3\u05E4\u05E5\u05E6\u05E7\u05E8\u05E9\u05EA\u05F0\u05F1\u05F2\u0621\u0622\u0623\u0624\u0625\u0626\u0627\u0628\u0629\u062A\u062B\u062C\u062D\u062E\u062F\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u063B\u063C\u063D\u063E\u063F\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u0648\u0649\u064A\u066E\u066F\u0671\u0672\u0673\u0674\u0675\u0676\u0677\u0678\u0679\u067A\u067B\u067C\u067D\u067E\u067F\u0680\u0681\u0682\u0683\u0684\u0685\u0686\u0687\u0688\u0689\u068A\u068B\u068C\u068D\u068E\u068F\u0690\u0691\u0692\u0693\u0694\u0695\u0696\u0697\u0698\u0699\u069A\u069B\u069C\u069D\u069E\u069F\u06A0\u06A1\u06A2\u06A3\u06A4\u06A5\u06A6\u06A7\u06A8\u06A9\u06AA\u06AB\u06AC\u06AD\u06AE\u06AF\u06B0\u06B1\u06B2\u06B3\u06B4\u06B5\u06B6\u06B7\u06B8\u06B9\u06BA\u06BB\u06BC\u06BD\u06BE\u06BF\u06C0\u06C1\u06C2\u06C3\u06C4\u06C5\u06C6\u06C7\u06C8\u06C9\u06CA\u06CB\u06CC\u06CD\u06CE\u06CF\u06D0\u06D1\u06D2\u06D3\u06D5\u06EE\u06EF\u06FA\u06FB\u06FC\u06FF\u0710\u0712\u0713\u0714\u0715\u0716\u0717\u0718\u0719\u071A\u071B\u071C\u071D\u071E\u071F\u0720\u0721\u0722\u0723\u0724\u0725\u0726\u0727\u0728\u0729\u072A\u072B\u072C\u072D\u072E\u072F\u074D\u074E\u074F\u0750\u0751\u0752\u0753\u0754\u0755\u0756\u0757\u0758\u0759\u075A\u075B\u075C\u075D\u075E\u075F\u0760\u0761\u0762\u0763\u0764\u0765\u0766\u0767\u0768\u0769\u076A\u076B\u076C\u076D\u076E\u076F\u0770\u0771\u0772\u0773\u0774\u0775\u0776\u0777\u0778\u0779\u077A\u077B\u077C\u077D\u077E\u077F\u0780\u0781\u0782\u0783\u0784\u0785\u0786\u0787\u0788\u0789\u078A\u078B\u078C\u078D\u078E\u078F\u0790\u0791\u0792\u0793\u0794\u0795\u0796\u0797\u0798\u0799\u079A\u079B\u079C\u079D\u079E\u079F\u07A0\u07A1\u07A2\u07A3\u07A4\u07A5\u07B1\u07CA\u07CB\u07CC\u07CD\u07CE\u07CF\u07D0\u07D1\u07D2\u07D3\u07D4\u07D5\u07D6\u07D7\u07D8\u07D9\u07DA\u07DB\u07DC\u07DD\u07DE\u07DF\u07E0\u07E1\u07E2\u07E3\u07E4\u07E5\u07E6\u07E7\u07E8\u07E9\u07EA\u0904\u0905\u0906\u0907\u0908\u0909\u090A\u090B\u090C\u090D\u090E\u090F\u0910\u0911\u0912\u0913\u0914\u0915\u0916\u0917\u0918\u0919\u091A\u091B\u091C\u091D\u091E\u091F\u0920\u0921\u0922\u0923\u0924\u0925\u0926\u0927\u0928\u0929\u092A\u092B\u092C\u092D\u092E\u092F\u0930\u0931\u0932\u0933\u0934\u0935\u0936\u0937\u0938\u0939\u093D\u0950\u0958\u0959\u095A\u095B\u095C\u095D\u095E\u095F\u0960\u0961\u0972\u097B\u097C\u097D\u097E\u097F\u0985\u0986\u0987\u0988\u0989\u098A\u098B\u098C\u098F\u0990\u0993\u0994\u0995\u0996\u0997\u0998\u0999\u099A\u099B\u099C\u099D\u099E\u099F\u09A0\u09A1\u09A2\u09A3\u09A4\u09A5\u09A6\u09A7\u09A8\u09AA\u09AB\u09AC\u09AD\u09AE\u09AF\u09B0\u09B2\u09B6\u09B7\u09B8\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF\u09E0\u09E1\u09F0\u09F1\u0A05\u0A06\u0A07\u0A08\u0A09\u0A0A\u0A0F\u0A10\u0A13\u0A14\u0A15\u0A16\u0A17\u0A18\u0A19\u0A1A\u0A1B\u0A1C\u0A1D\u0A1E\u0A1F\u0A20\u0A21\u0A22\u0A23\u0A24\u0A25\u0A26\u0A27\u0A28\u0A2A\u0A2B\u0A2C\u0A2D\u0A2E\u0A2F\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59\u0A5A\u0A5B\u0A5C\u0A5E\u0A72\u0A73\u0A74\u0A85\u0A86\u0A87\u0A88\u0A89\u0A8A\u0A8B\u0A8C\u0A8D\u0A8F\u0A90\u0A91\u0A93\u0A94\u0A95\u0A96\u0A97\u0A98\u0A99\u0A9A\u0A9B\u0A9C\u0A9D\u0A9E\u0A9F\u0AA0\u0AA1\u0AA2\u0AA3\u0AA4\u0AA5\u0AA6\u0AA7\u0AA8\u0AAA\u0AAB\u0AAC\u0AAD\u0AAE\u0AAF\u0AB0\u0AB2\u0AB3\u0AB5\u0AB6\u0AB7\u0AB8\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0B05\u0B06\u0B07\u0B08\u0B09\u0B0A\u0B0B\u0B0C\u0B0F\u0B10\u0B13\u0B14\u0B15\u0B16\u0B17\u0B18\u0B19\u0B1A\u0B1B\u0B1C\u0B1D\u0B1E\u0B1F\u0B20\u0B21\u0B22\u0B23\u0B24\u0B25\u0B26\u0B27\u0B28\u0B2A\u0B2B\u0B2C\u0B2D\u0B2E\u0B2F\u0B30\u0B32\u0B33\u0B35\u0B36\u0B37\u0B38\u0B39\u0B3D\u0B5C\u0B5D\u0B5F\u0B60\u0B61\u0B71\u0B83\u0B85\u0B86\u0B87\u0B88\u0B89\u0B8A\u0B8E\u0B8F\u0B90\u0B92\u0B93\u0B94\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8\u0BA9\u0BAA\u0BAE\u0BAF\u0BB0\u0BB1\u0BB2\u0BB3\u0BB4\u0BB5\u0BB6\u0BB7\u0BB8\u0BB9\u0BD0\u0C05\u0C06\u0C07\u0C08\u0C09\u0C0A\u0C0B\u0C0C\u0C0E\u0C0F\u0C10\u0C12\u0C13\u0C14\u0C15\u0C16\u0C17\u0C18\u0C19\u0C1A\u0C1B\u0C1C\u0C1D\u0C1E\u0C1F\u0C20\u0C21\u0C22\u0C23\u0C24\u0C25\u0C26\u0C27\u0C28\u0C2A\u0C2B\u0C2C\u0C2D\u0C2E\u0C2F\u0C30\u0C31\u0C32\u0C33\u0C35\u0C36\u0C37\u0C38\u0C39\u0C3D\u0C58\u0C59\u0C60\u0C61\u0C85\u0C86\u0C87\u0C88\u0C89\u0C8A\u0C8B\u0C8C\u0C8E\u0C8F\u0C90\u0C92\u0C93\u0C94\u0C95\u0C96\u0C97\u0C98\u0C99\u0C9A\u0C9B\u0C9C\u0C9D\u0C9E\u0C9F\u0CA0\u0CA1\u0CA2\u0CA3\u0CA4\u0CA5\u0CA6\u0CA7\u0CA8\u0CAA\u0CAB\u0CAC\u0CAD\u0CAE\u0CAF\u0CB0\u0CB1\u0CB2\u0CB3\u0CB5\u0CB6\u0CB7\u0CB8\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0D05\u0D06\u0D07\u0D08\u0D09\u0D0A\u0D0B\u0D0C\u0D0E\u0D0F\u0D10\u0D12\u0D13\u0D14\u0D15\u0D16\u0D17\u0D18\u0D19\u0D1A\u0D1B\u0D1C\u0D1D\u0D1E\u0D1F\u0D20\u0D21\u0D22\u0D23\u0D24\u0D25\u0D26\u0D27\u0D28\u0D2A\u0D2B\u0D2C\u0D2D\u0D2E\u0D2F\u0D30\u0D31\u0D32\u0D33\u0D34\u0D35\u0D36\u0D37\u0D38\u0D39\u0D3D\u0D60\u0D61\u0D7A\u0D7B\u0D7C\u0D7D\u0D7E\u0D7F\u0D85\u0D86\u0D87\u0D88\u0D89\u0D8A\u0D8B\u0D8C\u0D8D\u0D8E\u0D8F\u0D90\u0D91\u0D92\u0D93\u0D94\u0D95\u0D96\u0D9A\u0D9B\u0D9C\u0D9D\u0D9E\u0D9F\u0DA0\u0DA1\u0DA2\u0DA3\u0DA4\u0DA5\u0DA6\u0DA7\u0DA8\u0DA9\u0DAA\u0DAB\u0DAC\u0DAD\u0DAE\u0DAF\u0DB0\u0DB1\u0DB3\u0DB4\u0DB5\u0DB6\u0DB7\u0DB8\u0DB9\u0DBA\u0DBB\u0DBD\u0DC0\u0DC1\u0DC2\u0DC3\u0DC4\u0DC5\u0DC6\u0E01\u0E02\u0E03\u0E04\u0E05\u0E06\u0E07\u0E08\u0E09\u0E0A\u0E0B\u0E0C\u0E0D\u0E0E\u0E0F\u0E10\u0E11\u0E12\u0E13\u0E14\u0E15\u0E16\u0E17\u0E18\u0E19\u0E1A\u0E1B\u0E1C\u0E1D\u0E1E\u0E1F\u0E20\u0E21\u0E22\u0E23\u0E24\u0E25\u0E26\u0E27\u0E28\u0E29\u0E2A\u0E2B\u0E2C\u0E2D\u0E2E\u0E2F\u0E30\u0E32\u0E33\u0E40\u0E41\u0E42\u0E43\u0E44\u0E45\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94\u0E95\u0E96\u0E97\u0E99\u0E9A\u0E9B\u0E9C\u0E9D\u0E9E\u0E9F\u0EA1\u0EA2\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD\u0EAE\u0EAF\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0\u0EC1\u0EC2\u0EC3\u0EC4\u0EDC\u0EDD\u0F00\u0F40\u0F41\u0F42\u0F43\u0F44\u0F45\u0F46\u0F47\u0F49\u0F4A\u0F4B\u0F4C\u0F4D\u0F4E\u0F4F\u0F50\u0F51\u0F52\u0F53\u0F54\u0F55\u0F56\u0F57\u0F58\u0F59\u0F5A\u0F5B\u0F5C\u0F5D\u0F5E\u0F5F\u0F60\u0F61\u0F62\u0F63\u0F64\u0F65\u0F66\u0F67\u0F68\u0F69\u0F6A\u0F6B\u0F6C\u0F88\u0F89\u0F8A\u0F8B\u1000\u1001\u1002\u1003\u1004\u1005\u1006\u1007\u1008\u1009\u100A\u100B\u100C\u100D\u100E\u100F\u1010\u1011\u1012\u1013\u1014\u1015\u1016\u1017\u1018\u1019\u101A\u101B\u101C\u101D\u101E\u101F\u1020\u1021\u1022\u1023\u1024\u1025\u1026\u1027\u1028\u1029\u102A\u103F\u1050\u1051\u1052\u1053\u1054\u1055\u105A\u105B\u105C\u105D\u1061\u1065\u1066\u106E\u106F\u1070\u1075\u1076\u1077\u1078\u1079\u107A\u107B\u107C\u107D\u107E\u107F\u1080\u1081\u108E\u10D0\u10D1\u10D2\u10D3\u10D4\u10D5\u10D6\u10D7\u10D8\u10D9\u10DA\u10DB\u10DC\u10DD\u10DE\u10DF\u10E0\u10E1\u10E2\u10E3\u10E4\u10E5\u10E6\u10E7\u10E8\u10E9\u10EA\u10EB\u10EC\u10ED\u10EE\u10EF\u10F0\u10F1\u10F2\u10F3\u10F4\u10F5\u10F6\u10F7\u10F8\u10F9\u10FA\u1100\u1101\u1102\u1103\u1104\u1105\u1106\u1107\u1108\u1109\u110A\u110B\u110C\u110D\u110E\u110F\u1110\u1111\u1112\u1113\u1114\u1115\u1116\u1117\u1118\u1119\u111A\u111B\u111C\u111D\u111E\u111F\u1120\u1121\u1122\u1123\u1124\u1125\u1126\u1127\u1128\u1129\u112A\u112B\u112C\u112D\u112E\u112F\u1130\u1131\u1132\u1133\u1134\u1135\u1136\u1137\u1138\u1139\u113A\u113B\u113C\u113D\u113E\u113F\u1140\u1141\u1142\u1143\u1144\u1145\u1146\u1147\u1148\u1149\u114A\u114B\u114C\u114D\u114E\u114F\u1150\u1151\u1152\u1153\u1154\u1155\u1156\u1157\u1158\u1159\u115F\u1160\u1161\u1162\u1163\u1164\u1165\u1166\u1167\u1168\u1169\u116A\u116B\u116C\u116D\u116E\u116F\u1170\u1171\u1172\u1173\u1174\u1175\u1176\u1177\u1178\u1179\u117A\u117B\u117C\u117D\u117E\u117F\u1180\u1181\u1182\u1183\u1184\u1185\u1186\u1187\u1188\u1189\u118A\u118B\u118C\u118D\u118E\u118F\u1190\u1191\u1192\u1193\u1194\u1195\u1196\u1197\u1198\u1199\u119A\u119B\u119C\u119D\u119E\u119F\u11A0\u11A1\u11A2\u11A8\u11A9\u11AA\u11AB\u11AC\u11AD\u11AE\u11AF\u11B0\u11B1\u11B2\u11B3\u11B4\u11B5\u11B6\u11B7\u11B8\u11B9\u11BA\u11BB\u11BC\u11BD\u11BE\u11BF\u11C0\u11C1\u11C2\u11C3\u11C4\u11C5\u11C6\u11C7\u11C8\u11C9\u11CA\u11CB\u11CC\u11CD\u11CE\u11CF\u11D0\u11D1\u11D2\u11D3\u11D4\u11D5\u11D6\u11D7\u11D8\u11D9\u11DA\u11DB\u11DC\u11DD\u11DE\u11DF\u11E0\u11E1\u11E2\u11E3\u11E4\u11E5\u11E6\u11E7\u11E8\u11E9\u11EA\u11EB\u11EC\u11ED\u11EE\u11EF\u11F0\u11F1\u11F2\u11F3\u11F4\u11F5\u11F6\u11F7\u11F8\u11F9\u1200\u1201\u1202\u1203\u1204\u1205\u1206\u1207\u1208\u1209\u120A\u120B\u120C\u120D\u120E\u120F\u1210\u1211\u1212\u1213\u1214\u1215\u1216\u1217\u1218\u1219\u121A\u121B\u121C\u121D\u121E\u121F\u1220\u1221\u1222\u1223\u1224\u1225\u1226\u1227\u1228\u1229\u122A\u122B\u122C\u122D\u122E\u122F\u1230\u1231\u1232\u1233\u1234\u1235\u1236\u1237\u1238\u1239\u123A\u123B\u123C\u123D\u123E\u123F\u1240\u1241\u1242\u1243\u1244\u1245\u1246\u1247\u1248\u124A\u124B\u124C\u124D\u1250\u1251\u1252\u1253\u1254\u1255\u1256\u1258\u125A\u125B\u125C\u125D\u1260\u1261\u1262\u1263\u1264\u1265\u1266\u1267\u1268\u1269\u126A\u126B\u126C\u126D\u126E\u126F\u1270\u1271\u1272\u1273\u1274\u1275\u1276\u1277\u1278\u1279\u127A\u127B\u127C\u127D\u127E\u127F\u1280\u1281\u1282\u1283\u1284\u1285\u1286\u1287\u1288\u128A\u128B\u128C\u128D\u1290\u1291\u1292\u1293\u1294\u1295\u1296\u1297\u1298\u1299\u129A\u129B\u129C\u129D\u129E\u129F\u12A0\u12A1\u12A2\u12A3\u12A4\u12A5\u12A6\u12A7\u12A8\u12A9\u12AA\u12AB\u12AC\u12AD\u12AE\u12AF\u12B0\u12B2\u12B3\u12B4\u12B5\u12B8\u12B9\u12BA\u12BB\u12BC\u12BD\u12BE\u12C0\u12C2\u12C3\u12C4\u12C5\u12C8\u12C9\u12CA\u12CB\u12CC\u12CD\u12CE\u12CF\u12D0\u12D1\u12D2\u12D3\u12D4\u12D5\u12D6\u12D8\u12D9\u12DA\u12DB\u12DC\u12DD\u12DE\u12DF\u12E0\u12E1\u12E2\u12E3\u12E4\u12E5\u12E6\u12E7\u12E8\u12E9\u12EA\u12EB\u12EC\u12ED\u12EE\u12EF\u12F0\u12F1\u12F2\u12F3\u12F4\u12F5\u12F6\u12F7\u12F8\u12F9\u12FA\u12FB\u12FC\u12FD\u12FE\u12FF\u1300\u1301\u1302\u1303\u1304\u1305\u1306\u1307\u1308\u1309\u130A\u130B\u130C\u130D\u130E\u130F\u1310\u1312\u1313\u1314\u1315\u1318\u1319\u131A\u131B\u131C\u131D\u131E\u131F\u1320\u1321\u1322\u1323\u1324\u1325\u1326\u1327\u1328\u1329\u132A\u132B\u132C\u132D\u132E\u132F\u1330\u1331\u1332\u1333\u1334\u1335\u1336\u1337\u1338\u1339\u133A\u133B\u133C\u133D\u133E\u133F\u1340\u1341\u1342\u1343\u1344\u1345\u1346\u1347\u1348\u1349\u134A\u134B\u134C\u134D\u134E\u134F\u1350\u1351\u1352\u1353\u1354\u1355\u1356\u1357\u1358\u1359\u135A\u1380\u1381\u1382\u1383\u1384\u1385\u1386\u1387\u1388\u1389\u138A\u138B\u138C\u138D\u138E\u138F\u13A0\u13A1\u13A2\u13A3\u13A4\u13A5\u13A6\u13A7\u13A8\u13A9\u13AA\u13AB\u13AC\u13AD\u13AE\u13AF\u13B0\u13B1\u13B2\u13B3\u13B4\u13B5\u13B6\u13B7\u13B8\u13B9\u13BA\u13BB\u13BC\u13BD\u13BE\u13BF\u13C0\u13C1\u13C2\u13C3\u13C4\u13C5\u13C6\u13C7\u13C8\u13C9\u13CA\u13CB\u13CC\u13CD\u13CE\u13CF\u13D0\u13D1\u13D2\u13D3\u13D4\u13D5\u13D6\u13D7\u13D8\u13D9\u13DA\u13DB\u13DC\u13DD\u13DE\u13DF\u13E0\u13E1\u13E2\u13E3\u13E4\u13E5\u13E6\u13E7\u13E8\u13E9\u13EA\u13EB\u13EC\u13ED\u13EE\u13EF\u13F0\u13F1\u13F2\u13F3\u13F4\u1401\u1402\u1403\u1404\u1405\u1406\u1407\u1408\u1409\u140A\u140B\u140C\u140D\u140E\u140F\u1410\u1411\u1412\u1413\u1414\u1415\u1416\u1417\u1418\u1419\u141A\u141B\u141C\u141D\u141E\u141F\u1420\u1421\u1422\u1423\u1424\u1425\u1426\u1427\u1428\u1429\u142A\u142B\u142C\u142D\u142E\u142F\u1430\u1431\u1432\u1433\u1434\u1435\u1436\u1437\u1438\u1439\u143A\u143B\u143C\u143D\u143E\u143F\u1440\u1441\u1442\u1443\u1444\u1445\u1446\u1447\u1448\u1449\u144A\u144B\u144C\u144D\u144E\u144F\u1450\u1451\u1452\u1453\u1454\u1455\u1456\u1457\u1458\u1459\u145A\u145B\u145C\u145D\u145E\u145F\u1460\u1461\u1462\u1463\u1464\u1465\u1466\u1467\u1468\u1469\u146A\u146B\u146C\u146D\u146E\u146F\u1470\u1471\u1472\u1473\u1474\u1475\u1476\u1477\u1478\u1479\u147A\u147B\u147C\u147D\u147E\u147F\u1480\u1481\u1482\u1483\u1484\u1485\u1486\u1487\u1488\u1489\u148A\u148B\u148C\u148D\u148E\u148F\u1490\u1491\u1492\u1493\u1494\u1495\u1496\u1497\u1498\u1499\u149A\u149B\u149C\u149D\u149E\u149F\u14A0\u14A1\u14A2\u14A3\u14A4\u14A5\u14A6\u14A7\u14A8\u14A9\u14AA\u14AB\u14AC\u14AD\u14AE\u14AF\u14B0\u14B1\u14B2\u14B3\u14B4\u14B5\u14B6\u14B7\u14B8\u14B9\u14BA\u14BB\u14BC\u14BD\u14BE\u14BF\u14C0\u14C1\u14C2\u14C3\u14C4\u14C5\u14C6\u14C7\u14C8\u14C9\u14CA\u14CB\u14CC\u14CD\u14CE\u14CF\u14D0\u14D1\u14D2\u14D3\u14D4\u14D5\u14D6\u14D7\u14D8\u14D9\u14DA\u14DB\u14DC\u14DD\u14DE\u14DF\u14E0\u14E1\u14E2\u14E3\u14E4\u14E5\u14E6\u14E7\u14E8\u14E9\u14EA\u14EB\u14EC\u14ED\u14EE\u14EF\u14F0\u14F1\u14F2\u14F3\u14F4\u14F5\u14F6\u14F7\u14F8\u14F9\u14FA\u14FB\u14FC\u14FD\u14FE\u14FF\u1500\u1501\u1502\u1503\u1504\u1505\u1506\u1507\u1508\u1509\u150A\u150B\u150C\u150D\u150E\u150F\u1510\u1511\u1512\u1513\u1514\u1515\u1516\u1517\u1518\u1519\u151A\u151B\u151C\u151D\u151E\u151F\u1520\u1521\u1522\u1523\u1524\u1525\u1526\u1527\u1528\u1529\u152A\u152B\u152C\u152D\u152E\u152F\u1530\u1531\u1532\u1533\u1534\u1535\u1536\u1537\u1538\u1539\u153A\u153B\u153C\u153D\u153E\u153F\u1540\u1541\u1542\u1543\u1544\u1545\u1546\u1547\u1548\u1549\u154A\u154B\u154C\u154D\u154E\u154F\u1550\u1551\u1552\u1553\u1554\u1555\u1556\u1557\u1558\u1559\u155A\u155B\u155C\u155D\u155E\u155F\u1560\u1561\u1562\u1563\u1564\u1565\u1566\u1567\u1568\u1569\u156A\u156B\u156C\u156D\u156E\u156F\u1570\u1571\u1572\u1573\u1574\u1575\u1576\u1577\u1578\u1579\u157A\u157B\u157C\u157D\u157E\u157F\u1580\u1581\u1582\u1583\u1584\u1585\u1586\u1587\u1588\u1589\u158A\u158B\u158C\u158D\u158E\u158F\u1590\u1591\u1592\u1593\u1594\u1595\u1596\u1597\u1598\u1599\u159A\u159B\u159C\u159D\u159E\u159F\u15A0\u15A1\u15A2\u15A3\u15A4\u15A5\u15A6\u15A7\u15A8\u15A9\u15AA\u15AB\u15AC\u15AD\u15AE\u15AF\u15B0\u15B1\u15B2\u15B3\u15B4\u15B5\u15B6\u15B7\u15B8\u15B9\u15BA\u15BB\u15BC\u15BD\u15BE\u15BF\u15C0\u15C1\u15C2\u15C3\u15C4\u15C5\u15C6\u15C7\u15C8\u15C9\u15CA\u15CB\u15CC\u15CD\u15CE\u15CF\u15D0\u15D1\u15D2\u15D3\u15D4\u15D5\u15D6\u15D7\u15D8\u15D9\u15DA\u15DB\u15DC\u15DD\u15DE\u15DF\u15E0\u15E1\u15E2\u15E3\u15E4\u15E5\u15E6\u15E7\u15E8\u15E9\u15EA\u15EB\u15EC\u15ED\u15EE\u15EF\u15F0\u15F1\u15F2\u15F3\u15F4\u15F5\u15F6\u15F7\u15F8\u15F9\u15FA\u15FB\u15FC\u15FD\u15FE\u15FF\u1600\u1601\u1602\u1603\u1604\u1605\u1606\u1607\u1608\u1609\u160A\u160B\u160C\u160D\u160E\u160F\u1610\u1611\u1612\u1613\u1614\u1615\u1616\u1617\u1618\u1619\u161A\u161B\u161C\u161D\u161E\u161F\u1620\u1621\u1622\u1623\u1624\u1625\u1626\u1627\u1628\u1629\u162A\u162B\u162C\u162D\u162E\u162F\u1630\u1631\u1632\u1633\u1634\u1635\u1636\u1637\u1638\u1639\u163A\u163B\u163C\u163D\u163E\u163F\u1640\u1641\u1642\u1643\u1644\u1645\u1646\u1647\u1648\u1649\u164A\u164B\u164C\u164D\u164E\u164F\u1650\u1651\u1652\u1653\u1654\u1655\u1656\u1657\u1658\u1659\u165A\u165B\u165C\u165D\u165E\u165F\u1660\u1661\u1662\u1663\u1664\u1665\u1666\u1667\u1668\u1669\u166A\u166B\u166C\u166F\u1670\u1671\u1672\u1673\u1674\u1675\u1676\u1681\u1682\u1683\u1684\u1685\u1686\u1687\u1688\u1689\u168A\u168B\u168C\u168D\u168E\u168F\u1690\u1691\u1692\u1693\u1694\u1695\u1696\u1697\u1698\u1699\u169A\u16A0\u16A1\u16A2\u16A3\u16A4\u16A5\u16A6\u16A7\u16A8\u16A9\u16AA\u16AB\u16AC\u16AD\u16AE\u16AF\u16B0\u16B1\u16B2\u16B3\u16B4\u16B5\u16B6\u16B7\u16B8\u16B9\u16BA\u16BB\u16BC\u16BD\u16BE\u16BF\u16C0\u16C1\u16C2\u16C3\u16C4\u16C5\u16C6\u16C7\u16C8\u16C9\u16CA\u16CB\u16CC\u16CD\u16CE\u16CF\u16D0\u16D1\u16D2\u16D3\u16D4\u16D5\u16D6\u16D7\u16D8\u16D9\u16DA\u16DB\u16DC\u16DD\u16DE\u16DF\u16E0\u16E1\u16E2\u16E3\u16E4\u16E5\u16E6\u16E7\u16E8\u16E9\u16EA\u1700\u1701\u1702\u1703\u1704\u1705\u1706\u1707\u1708\u1709\u170A\u170B\u170C\u170E\u170F\u1710\u1711\u1720\u1721\u1722\u1723\u1724\u1725\u1726\u1727\u1728\u1729\u172A\u172B\u172C\u172D\u172E\u172F\u1730\u1731\u1740\u1741\u1742\u1743\u1744\u1745\u1746\u1747\u1748\u1749\u174A\u174B\u174C\u174D\u174E\u174F\u1750\u1751\u1760\u1761\u1762\u1763\u1764\u1765\u1766\u1767\u1768\u1769\u176A\u176B\u176C\u176E\u176F\u1770\u1780\u1781\u1782\u1783\u1784\u1785\u1786\u1787\u1788\u1789\u178A\u178B\u178C\u178D\u178E\u178F\u1790\u1791\u1792\u1793\u1794\u1795\u1796\u1797\u1798\u1799\u179A\u179B\u179C\u179D\u179E\u179F\u17A0\u17A1\u17A2\u17A3\u17A4\u17A5\u17A6\u17A7\u17A8\u17A9\u17AA\u17AB\u17AC\u17AD\u17AE\u17AF\u17B0\u17B1\u17B2\u17B3\u17DC\u1820\u1821\u1822\u1823\u1824\u1825\u1826\u1827\u1828\u1829\u182A\u182B\u182C\u182D\u182E\u182F\u1830\u1831\u1832\u1833\u1834\u1835\u1836\u1837\u1838\u1839\u183A\u183B\u183C\u183D\u183E\u183F\u1840\u1841\u1842\u1844\u1845\u1846\u1847\u1848\u1849\u184A\u184B\u184C\u184D\u184E\u184F\u1850\u1851\u1852\u1853\u1854\u1855\u1856\u1857\u1858\u1859\u185A\u185B\u185C\u185D\u185E\u185F\u1860\u1861\u1862\u1863\u1864\u1865\u1866\u1867\u1868\u1869\u186A\u186B\u186C\u186D\u186E\u186F\u1870\u1871\u1872\u1873\u1874\u1875\u1876\u1877\u1880\u1881\u1882\u1883\u1884\u1885\u1886\u1887\u1888\u1889\u188A\u188B\u188C\u188D\u188E\u188F\u1890\u1891\u1892\u1893\u1894\u1895\u1896\u1897\u1898\u1899\u189A\u189B\u189C\u189D\u189E\u189F\u18A0\u18A1\u18A2\u18A3\u18A4\u18A5\u18A6\u18A7\u18A8\u18AA\u1900\u1901\u1902\u1903\u1904\u1905\u1906\u1907\u1908\u1909\u190A\u190B\u190C\u190D\u190E\u190F\u1910\u1911\u1912\u1913\u1914\u1915\u1916\u1917\u1918\u1919\u191A\u191B\u191C\u1950\u1951\u1952\u1953\u1954\u1955\u1956\u1957\u1958\u1959\u195A\u195B\u195C\u195D\u195E\u195F\u1960\u1961\u1962\u1963\u1964\u1965\u1966\u1967\u1968\u1969\u196A\u196B\u196C\u196D\u1970\u1971\u1972\u1973\u1974\u1980\u1981\u1982\u1983\u1984\u1985\u1986\u1987\u1988\u1989\u198A\u198B\u198C\u198D\u198E\u198F\u1990\u1991\u1992\u1993\u1994\u1995\u1996\u1997\u1998\u1999\u199A\u199B\u199C\u199D\u199E\u199F\u19A0\u19A1\u19A2\u19A3\u19A4\u19A5\u19A6\u19A7\u19A8\u19A9\u19C1\u19C2\u19C3\u19C4\u19C5\u19C6\u19C7\u1A00\u1A01\u1A02\u1A03\u1A04\u1A05\u1A06\u1A07\u1A08\u1A09\u1A0A\u1A0B\u1A0C\u1A0D\u1A0E\u1A0F\u1A10\u1A11\u1A12\u1A13\u1A14\u1A15\u1A16\u1B05\u1B06\u1B07\u1B08\u1B09\u1B0A\u1B0B\u1B0C\u1B0D\u1B0E\u1B0F\u1B10\u1B11\u1B12\u1B13\u1B14\u1B15\u1B16\u1B17\u1B18\u1B19\u1B1A\u1B1B\u1B1C\u1B1D\u1B1E\u1B1F\u1B20\u1B21\u1B22\u1B23\u1B24\u1B25\u1B26\u1B27\u1B28\u1B29\u1B2A\u1B2B\u1B2C\u1B2D\u1B2E\u1B2F\u1B30\u1B31\u1B32\u1B33\u1B45\u1B46\u1B47\u1B48\u1B49\u1B4A\u1B4B\u1B83\u1B84\u1B85\u1B86\u1B87\u1B88\u1B89\u1B8A\u1B8B\u1B8C\u1B8D\u1B8E\u1B8F\u1B90\u1B91\u1B92\u1B93\u1B94\u1B95\u1B96\u1B97\u1B98\u1B99\u1B9A\u1B9B\u1B9C\u1B9D\u1B9E\u1B9F\u1BA0\u1BAE\u1BAF\u1C00\u1C01\u1C02\u1C03\u1C04\u1C05\u1C06\u1C07\u1C08\u1C09\u1C0A\u1C0B\u1C0C\u1C0D\u1C0E\u1C0F\u1C10\u1C11\u1C12\u1C13\u1C14\u1C15\u1C16\u1C17\u1C18\u1C19\u1C1A\u1C1B\u1C1C\u1C1D\u1C1E\u1C1F\u1C20\u1C21\u1C22\u1C23\u1C4D\u1C4E\u1C4F\u1C5A\u1C5B\u1C5C\u1C5D\u1C5E\u1C5F\u1C60\u1C61\u1C62\u1C63\u1C64\u1C65\u1C66\u1C67\u1C68\u1C69\u1C6A\u1C6B\u1C6C\u1C6D\u1C6E\u1C6F\u1C70\u1C71\u1C72\u1C73\u1C74\u1C75\u1C76\u1C77\u2135\u2136\u2137\u2138\u2D30\u2D31\u2D32\u2D33\u2D34\u2D35\u2D36\u2D37\u2D38\u2D39\u2D3A\u2D3B\u2D3C\u2D3D\u2D3E\u2D3F\u2D40\u2D41\u2D42\u2D43\u2D44\u2D45\u2D46\u2D47\u2D48\u2D49\u2D4A\u2D4B\u2D4C\u2D4D\u2D4E\u2D4F\u2D50\u2D51\u2D52\u2D53\u2D54\u2D55\u2D56\u2D57\u2D58\u2D59\u2D5A\u2D5B\u2D5C\u2D5D\u2D5E\u2D5F\u2D60\u2D61\u2D62\u2D63\u2D64\u2D65\u2D80\u2D81\u2D82\u2D83\u2D84\u2D85\u2D86\u2D87\u2D88\u2D89\u2D8A\u2D8B\u2D8C\u2D8D\u2D8E\u2D8F\u2D90\u2D91\u2D92\u2D93\u2D94\u2D95\u2D96\u2DA0\u2DA1\u2DA2\u2DA3\u2DA4\u2DA5\u2DA6\u2DA8\u2DA9\u2DAA\u2DAB\u2DAC\u2DAD\u2DAE\u2DB0\u2DB1\u2DB2\u2DB3\u2DB4\u2DB5\u2DB6\u2DB8\u2DB9\u2DBA\u2DBB\u2DBC\u2DBD\u2DBE\u2DC0\u2DC1\u2DC2\u2DC3\u2DC4\u2DC5\u2DC6\u2DC8\u2DC9\u2DCA\u2DCB\u2DCC\u2DCD\u2DCE\u2DD0\u2DD1\u2DD2\u2DD3\u2DD4\u2DD5\u2DD6\u2DD8\u2DD9\u2DDA\u2DDB\u2DDC\u2DDD\u2DDE\u3006\u303C\u3041\u3042\u3043\u3044\u3045\u3046\u3047\u3048\u3049\u304A\u304B\u304C\u304D\u304E\u304F\u3050\u3051\u3052\u3053\u3054\u3055\u3056\u3057\u3058\u3059\u305A\u305B\u305C\u305D\u305E\u305F\u3060\u3061\u3062\u3063\u3064\u3065\u3066\u3067\u3068\u3069\u306A\u306B\u306C\u306D\u306E\u306F\u3070\u3071\u3072\u3073\u3074\u3075\u3076\u3077\u3078\u3079\u307A\u307B\u307C\u307D\u307E\u307F\u3080\u3081\u3082\u3083\u3084\u3085\u3086\u3087\u3088\u3089\u308A\u308B\u308C\u308D\u308E\u308F\u3090\u3091\u3092\u3093\u3094\u3095\u3096\u309F\u30A1\u30A2\u30A3\u30A4\u30A5\u30A6\u30A7\u30A8\u30A9\u30AA\u30AB\u30AC\u30AD\u30AE\u30AF\u30B0\u30B1\u30B2\u30B3\u30B4\u30B5\u30B6\u30B7\u30B8\u30B9\u30BA\u30BB\u30BC\u30BD\u30BE\u30BF\u30C0\u30C1\u30C2\u30C3\u30C4\u30C5\u30C6\u30C7\u30C8\u30C9\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D0\u30D1\u30D2\u30D3\u30D4\u30D5\u30D6\u30D7\u30D8\u30D9\u30DA\u30DB\u30DC\u30DD\u30DE\u30DF\u30E0\u30E1\u30E2\u30E3\u30E4\u30E5\u30E6\u30E7\u30E8\u30E9\u30EA\u30EB\u30EC\u30ED\u30EE\u30EF\u30F0\u30F1\u30F2\u30F3\u30F4\u30F5\u30F6\u30F7\u30F8\u30F9\u30FA\u30FF\u3105\u3106\u3107\u3108\u3109\u310A\u310B\u310C\u310D\u310E\u310F\u3110\u3111\u3112\u3113\u3114\u3115\u3116\u3117\u3118\u3119\u311A\u311B\u311C\u311D\u311E\u311F\u3120\u3121\u3122\u3123\u3124\u3125\u3126\u3127\u3128\u3129\u312A\u312B\u312C\u312D\u3131\u3132\u3133\u3134\u3135\u3136\u3137\u3138\u3139\u313A\u313B\u313C\u313D\u313E\u313F\u3140\u3141\u3142\u3143\u3144\u3145\u3146\u3147\u3148\u3149\u314A\u314B\u314C\u314D\u314E\u314F\u3150\u3151\u3152\u3153\u3154\u3155\u3156\u3157\u3158\u3159\u315A\u315B\u315C\u315D\u315E\u315F\u3160\u3161\u3162\u3163\u3164\u3165\u3166\u3167\u3168\u3169\u316A\u316B\u316C\u316D\u316E\u316F\u3170\u3171\u3172\u3173\u3174\u3175\u3176\u3177\u3178\u3179\u317A\u317B\u317C\u317D\u317E\u317F\u3180\u3181\u3182\u3183\u3184\u3185\u3186\u3187\u3188\u3189\u318A\u318B\u318C\u318D\u318E\u31A0\u31A1\u31A2\u31A3\u31A4\u31A5\u31A6\u31A7\u31A8\u31A9\u31AA\u31AB\u31AC\u31AD\u31AE\u31AF\u31B0\u31B1\u31B2\u31B3\u31B4\u31B5\u31B6\u31B7\u31F0\u31F1\u31F2\u31F3\u31F4\u31F5\u31F6\u31F7\u31F8\u31F9\u31FA\u31FB\u31FC\u31FD\u31FE\u31FF\u3400\u4DB5\u4E00\u9FC3\uA000\uA001\uA002\uA003\uA004\uA005\uA006\uA007\uA008\uA009\uA00A\uA00B\uA00C\uA00D\uA00E\uA00F\uA010\uA011\uA012\uA013\uA014\uA016\uA017\uA018\uA019\uA01A\uA01B\uA01C\uA01D\uA01E\uA01F\uA020\uA021\uA022\uA023\uA024\uA025\uA026\uA027\uA028\uA029\uA02A\uA02B\uA02C\uA02D\uA02E\uA02F\uA030\uA031\uA032\uA033\uA034\uA035\uA036\uA037\uA038\uA039\uA03A\uA03B\uA03C\uA03D\uA03E\uA03F\uA040\uA041\uA042\uA043\uA044\uA045\uA046\uA047\uA048\uA049\uA04A\uA04B\uA04C\uA04D\uA04E\uA04F\uA050\uA051\uA052\uA053\uA054\uA055\uA056\uA057\uA058\uA059\uA05A\uA05B\uA05C\uA05D\uA05E\uA05F\uA060\uA061\uA062\uA063\uA064\uA065\uA066\uA067\uA068\uA069\uA06A\uA06B\uA06C\uA06D\uA06E\uA06F\uA070\uA071\uA072\uA073\uA074\uA075\uA076\uA077\uA078\uA079\uA07A\uA07B\uA07C\uA07D\uA07E\uA07F\uA080\uA081\uA082\uA083\uA084\uA085\uA086\uA087\uA088\uA089\uA08A\uA08B\uA08C\uA08D\uA08E\uA08F\uA090\uA091\uA092\uA093\uA094\uA095\uA096\uA097\uA098\uA099\uA09A\uA09B\uA09C\uA09D\uA09E\uA09F\uA0A0\uA0A1\uA0A2\uA0A3\uA0A4\uA0A5\uA0A6\uA0A7\uA0A8\uA0A9\uA0AA\uA0AB\uA0AC\uA0AD\uA0AE\uA0AF\uA0B0\uA0B1\uA0B2\uA0B3\uA0B4\uA0B5\uA0B6\uA0B7\uA0B8\uA0B9\uA0BA\uA0BB\uA0BC\uA0BD\uA0BE\uA0BF\uA0C0\uA0C1\uA0C2\uA0C3\uA0C4\uA0C5\uA0C6\uA0C7\uA0C8\uA0C9\uA0CA\uA0CB\uA0CC\uA0CD\uA0CE\uA0CF\uA0D0\uA0D1\uA0D2\uA0D3\uA0D4\uA0D5\uA0D6\uA0D7\uA0D8\uA0D9\uA0DA\uA0DB\uA0DC\uA0DD\uA0DE\uA0DF\uA0E0\uA0E1\uA0E2\uA0E3\uA0E4\uA0E5\uA0E6\uA0E7\uA0E8\uA0E9\uA0EA\uA0EB\uA0EC\uA0ED\uA0EE\uA0EF\uA0F0\uA0F1\uA0F2\uA0F3\uA0F4\uA0F5\uA0F6\uA0F7\uA0F8\uA0F9\uA0FA\uA0FB\uA0FC\uA0FD\uA0FE\uA0FF\uA100\uA101\uA102\uA103\uA104\uA105\uA106\uA107\uA108\uA109\uA10A\uA10B\uA10C\uA10D\uA10E\uA10F\uA110\uA111\uA112\uA113\uA114\uA115\uA116\uA117\uA118\uA119\uA11A\uA11B\uA11C\uA11D\uA11E\uA11F\uA120\uA121\uA122\uA123\uA124\uA125\uA126\uA127\uA128\uA129\uA12A\uA12B\uA12C\uA12D\uA12E\uA12F\uA130\uA131\uA132\uA133\uA134\uA135\uA136\uA137\uA138\uA139\uA13A\uA13B\uA13C\uA13D\uA13E\uA13F\uA140\uA141\uA142\uA143\uA144\uA145\uA146\uA147\uA148\uA149\uA14A\uA14B\uA14C\uA14D\uA14E\uA14F\uA150\uA151\uA152\uA153\uA154\uA155\uA156\uA157\uA158\uA159\uA15A\uA15B\uA15C\uA15D\uA15E\uA15F\uA160\uA161\uA162\uA163\uA164\uA165\uA166\uA167\uA168\uA169\uA16A\uA16B\uA16C\uA16D\uA16E\uA16F\uA170\uA171\uA172\uA173\uA174\uA175\uA176\uA177\uA178\uA179\uA17A\uA17B\uA17C\uA17D\uA17E\uA17F\uA180\uA181\uA182\uA183\uA184\uA185\uA186\uA187\uA188\uA189\uA18A\uA18B\uA18C\uA18D\uA18E\uA18F\uA190\uA191\uA192\uA193\uA194\uA195\uA196\uA197\uA198\uA199\uA19A\uA19B\uA19C\uA19D\uA19E\uA19F\uA1A0\uA1A1\uA1A2\uA1A3\uA1A4\uA1A5\uA1A6\uA1A7\uA1A8\uA1A9\uA1AA\uA1AB\uA1AC\uA1AD\uA1AE\uA1AF\uA1B0\uA1B1\uA1B2\uA1B3\uA1B4\uA1B5\uA1B6\uA1B7\uA1B8\uA1B9\uA1BA\uA1BB\uA1BC\uA1BD\uA1BE\uA1BF\uA1C0\uA1C1\uA1C2\uA1C3\uA1C4\uA1C5\uA1C6\uA1C7\uA1C8\uA1C9\uA1CA\uA1CB\uA1CC\uA1CD\uA1CE\uA1CF\uA1D0\uA1D1\uA1D2\uA1D3\uA1D4\uA1D5\uA1D6\uA1D7\uA1D8\uA1D9\uA1DA\uA1DB\uA1DC\uA1DD\uA1DE\uA1DF\uA1E0\uA1E1\uA1E2\uA1E3\uA1E4\uA1E5\uA1E6\uA1E7\uA1E8\uA1E9\uA1EA\uA1EB\uA1EC\uA1ED\uA1EE\uA1EF\uA1F0\uA1F1\uA1F2\uA1F3\uA1F4\uA1F5\uA1F6\uA1F7\uA1F8\uA1F9\uA1FA\uA1FB\uA1FC\uA1FD\uA1FE\uA1FF\uA200\uA201\uA202\uA203\uA204\uA205\uA206\uA207\uA208\uA209\uA20A\uA20B\uA20C\uA20D\uA20E\uA20F\uA210\uA211\uA212\uA213\uA214\uA215\uA216\uA217\uA218\uA219\uA21A\uA21B\uA21C\uA21D\uA21E\uA21F\uA220\uA221\uA222\uA223\uA224\uA225\uA226\uA227\uA228\uA229\uA22A\uA22B\uA22C\uA22D\uA22E\uA22F\uA230\uA231\uA232\uA233\uA234\uA235\uA236\uA237\uA238\uA239\uA23A\uA23B\uA23C\uA23D\uA23E\uA23F\uA240\uA241\uA242\uA243\uA244\uA245\uA246\uA247\uA248\uA249\uA24A\uA24B\uA24C\uA24D\uA24E\uA24F\uA250\uA251\uA252\uA253\uA254\uA255\uA256\uA257\uA258\uA259\uA25A\uA25B\uA25C\uA25D\uA25E\uA25F\uA260\uA261\uA262\uA263\uA264\uA265\uA266\uA267\uA268\uA269\uA26A\uA26B\uA26C\uA26D\uA26E\uA26F\uA270\uA271\uA272\uA273\uA274\uA275\uA276\uA277\uA278\uA279\uA27A\uA27B\uA27C\uA27D\uA27E\uA27F\uA280\uA281\uA282\uA283\uA284\uA285\uA286\uA287\uA288\uA289\uA28A\uA28B\uA28C\uA28D\uA28E\uA28F\uA290\uA291\uA292\uA293\uA294\uA295\uA296\uA297\uA298\uA299\uA29A\uA29B\uA29C\uA29D\uA29E\uA29F\uA2A0\uA2A1\uA2A2\uA2A3\uA2A4\uA2A5\uA2A6\uA2A7\uA2A8\uA2A9\uA2AA\uA2AB\uA2AC\uA2AD\uA2AE\uA2AF\uA2B0\uA2B1\uA2B2\uA2B3\uA2B4\uA2B5\uA2B6\uA2B7\uA2B8\uA2B9\uA2BA\uA2BB\uA2BC\uA2BD\uA2BE\uA2BF\uA2C0\uA2C1\uA2C2\uA2C3\uA2C4\uA2C5\uA2C6\uA2C7\uA2C8\uA2C9\uA2CA\uA2CB\uA2CC\uA2CD\uA2CE\uA2CF\uA2D0\uA2D1\uA2D2\uA2D3\uA2D4\uA2D5\uA2D6\uA2D7\uA2D8\uA2D9\uA2DA\uA2DB\uA2DC\uA2DD\uA2DE\uA2DF\uA2E0\uA2E1\uA2E2\uA2E3\uA2E4\uA2E5\uA2E6\uA2E7\uA2E8\uA2E9\uA2EA\uA2EB\uA2EC\uA2ED\uA2EE\uA2EF\uA2F0\uA2F1\uA2F2\uA2F3\uA2F4\uA2F5\uA2F6\uA2F7\uA2F8\uA2F9\uA2FA\uA2FB\uA2FC\uA2FD\uA2FE\uA2FF\uA300\uA301\uA302\uA303\uA304\uA305\uA306\uA307\uA308\uA309\uA30A\uA30B\uA30C\uA30D\uA30E\uA30F\uA310\uA311\uA312\uA313\uA314\uA315\uA316\uA317\uA318\uA319\uA31A\uA31B\uA31C\uA31D\uA31E\uA31F\uA320\uA321\uA322\uA323\uA324\uA325\uA326\uA327\uA328\uA329\uA32A\uA32B\uA32C\uA32D\uA32E\uA32F\uA330\uA331\uA332\uA333\uA334\uA335\uA336\uA337\uA338\uA339\uA33A\uA33B\uA33C\uA33D\uA33E\uA33F\uA340\uA341\uA342\uA343\uA344\uA345\uA346\uA347\uA348\uA349\uA34A\uA34B\uA34C\uA34D\uA34E\uA34F\uA350\uA351\uA352\uA353\uA354\uA355\uA356\uA357\uA358\uA359\uA35A\uA35B\uA35C\uA35D\uA35E\uA35F\uA360\uA361\uA362\uA363\uA364\uA365\uA366\uA367\uA368\uA369\uA36A\uA36B\uA36C\uA36D\uA36E\uA36F\uA370\uA371\uA372\uA373\uA374\uA375\uA376\uA377\uA378\uA379\uA37A\uA37B\uA37C\uA37D\uA37E\uA37F\uA380\uA381\uA382\uA383\uA384\uA385\uA386\uA387\uA388\uA389\uA38A\uA38B\uA38C\uA38D\uA38E\uA38F\uA390\uA391\uA392\uA393\uA394\uA395\uA396\uA397\uA398\uA399\uA39A\uA39B\uA39C\uA39D\uA39E\uA39F\uA3A0\uA3A1\uA3A2\uA3A3\uA3A4\uA3A5\uA3A6\uA3A7\uA3A8\uA3A9\uA3AA\uA3AB\uA3AC\uA3AD\uA3AE\uA3AF\uA3B0\uA3B1\uA3B2\uA3B3\uA3B4\uA3B5\uA3B6\uA3B7\uA3B8\uA3B9\uA3BA\uA3BB\uA3BC\uA3BD\uA3BE\uA3BF\uA3C0\uA3C1\uA3C2\uA3C3\uA3C4\uA3C5\uA3C6\uA3C7\uA3C8\uA3C9\uA3CA\uA3CB\uA3CC\uA3CD\uA3CE\uA3CF\uA3D0\uA3D1\uA3D2\uA3D3\uA3D4\uA3D5\uA3D6\uA3D7\uA3D8\uA3D9\uA3DA\uA3DB\uA3DC\uA3DD\uA3DE\uA3DF\uA3E0\uA3E1\uA3E2\uA3E3\uA3E4\uA3E5\uA3E6\uA3E7\uA3E8\uA3E9\uA3EA\uA3EB\uA3EC\uA3ED\uA3EE\uA3EF\uA3F0\uA3F1\uA3F2\uA3F3\uA3F4\uA3F5\uA3F6\uA3F7\uA3F8\uA3F9\uA3FA\uA3FB\uA3FC\uA3FD\uA3FE\uA3FF\uA400\uA401\uA402\uA403\uA404\uA405\uA406\uA407\uA408\uA409\uA40A\uA40B\uA40C\uA40D\uA40E\uA40F\uA410\uA411\uA412\uA413\uA414\uA415\uA416\uA417\uA418\uA419\uA41A\uA41B\uA41C\uA41D\uA41E\uA41F\uA420\uA421\uA422\uA423\uA424\uA425\uA426\uA427\uA428\uA429\uA42A\uA42B\uA42C\uA42D\uA42E\uA42F\uA430\uA431\uA432\uA433\uA434\uA435\uA436\uA437\uA438\uA439\uA43A\uA43B\uA43C\uA43D\uA43E\uA43F\uA440\uA441\uA442\uA443\uA444\uA445\uA446\uA447\uA448\uA449\uA44A\uA44B\uA44C\uA44D\uA44E\uA44F\uA450\uA451\uA452\uA453\uA454\uA455\uA456\uA457\uA458\uA459\uA45A\uA45B\uA45C\uA45D\uA45E\uA45F\uA460\uA461\uA462\uA463\uA464\uA465\uA466\uA467\uA468\uA469\uA46A\uA46B\uA46C\uA46D\uA46E\uA46F\uA470\uA471\uA472\uA473\uA474\uA475\uA476\uA477\uA478\uA479\uA47A\uA47B\uA47C\uA47D\uA47E\uA47F\uA480\uA481\uA482\uA483\uA484\uA485\uA486\uA487\uA488\uA489\uA48A\uA48B\uA48C\uA500\uA501\uA502\uA503\uA504\uA505\uA506\uA507\uA508\uA509\uA50A\uA50B\uA50C\uA50D\uA50E\uA50F\uA510\uA511\uA512\uA513\uA514\uA515\uA516\uA517\uA518\uA519\uA51A\uA51B\uA51C\uA51D\uA51E\uA51F\uA520\uA521\uA522\uA523\uA524\uA525\uA526\uA527\uA528\uA529\uA52A\uA52B\uA52C\uA52D\uA52E\uA52F\uA530\uA531\uA532\uA533\uA534\uA535\uA536\uA537\uA538\uA539\uA53A\uA53B\uA53C\uA53D\uA53E\uA53F\uA540\uA541\uA542\uA543\uA544\uA545\uA546\uA547\uA548\uA549\uA54A\uA54B\uA54C\uA54D\uA54E\uA54F\uA550\uA551\uA552\uA553\uA554\uA555\uA556\uA557\uA558\uA559\uA55A\uA55B\uA55C\uA55D\uA55E\uA55F\uA560\uA561\uA562\uA563\uA564\uA565\uA566\uA567\uA568\uA569\uA56A\uA56B\uA56C\uA56D\uA56E\uA56F\uA570\uA571\uA572\uA573\uA574\uA575\uA576\uA577\uA578\uA579\uA57A\uA57B\uA57C\uA57D\uA57E\uA57F\uA580\uA581\uA582\uA583\uA584\uA585\uA586\uA587\uA588\uA589\uA58A\uA58B\uA58C\uA58D\uA58E\uA58F\uA590\uA591\uA592\uA593\uA594\uA595\uA596\uA597\uA598\uA599\uA59A\uA59B\uA59C\uA59D\uA59E\uA59F\uA5A0\uA5A1\uA5A2\uA5A3\uA5A4\uA5A5\uA5A6\uA5A7\uA5A8\uA5A9\uA5AA\uA5AB\uA5AC\uA5AD\uA5AE\uA5AF\uA5B0\uA5B1\uA5B2\uA5B3\uA5B4\uA5B5\uA5B6\uA5B7\uA5B8\uA5B9\uA5BA\uA5BB\uA5BC\uA5BD\uA5BE\uA5BF\uA5C0\uA5C1\uA5C2\uA5C3\uA5C4\uA5C5\uA5C6\uA5C7\uA5C8\uA5C9\uA5CA\uA5CB\uA5CC\uA5CD\uA5CE\uA5CF\uA5D0\uA5D1\uA5D2\uA5D3\uA5D4\uA5D5\uA5D6\uA5D7\uA5D8\uA5D9\uA5DA\uA5DB\uA5DC\uA5DD\uA5DE\uA5DF\uA5E0\uA5E1\uA5E2\uA5E3\uA5E4\uA5E5\uA5E6\uA5E7\uA5E8\uA5E9\uA5EA\uA5EB\uA5EC\uA5ED\uA5EE\uA5EF\uA5F0\uA5F1\uA5F2\uA5F3\uA5F4\uA5F5\uA5F6\uA5F7\uA5F8\uA5F9\uA5FA\uA5FB\uA5FC\uA5FD\uA5FE\uA5FF\uA600\uA601\uA602\uA603\uA604\uA605\uA606\uA607\uA608\uA609\uA60A\uA60B\uA610\uA611\uA612\uA613\uA614\uA615\uA616\uA617\uA618\uA619\uA61A\uA61B\uA61C\uA61D\uA61E\uA61F\uA62A\uA62B\uA66E\uA7FB\uA7FC\uA7FD\uA7FE\uA7FF\uA800\uA801\uA803\uA804\uA805\uA807\uA808\uA809\uA80A\uA80C\uA80D\uA80E\uA80F\uA810\uA811\uA812\uA813\uA814\uA815\uA816\uA817\uA818\uA819\uA81A\uA81B\uA81C\uA81D\uA81E\uA81F\uA820\uA821\uA822\uA840\uA841\uA842\uA843\uA844\uA845\uA846\uA847\uA848\uA849\uA84A\uA84B\uA84C\uA84D\uA84E\uA84F\uA850\uA851\uA852\uA853\uA854\uA855\uA856\uA857\uA858\uA859\uA85A\uA85B\uA85C\uA85D\uA85E\uA85F\uA860\uA861\uA862\uA863\uA864\uA865\uA866\uA867\uA868\uA869\uA86A\uA86B\uA86C\uA86D\uA86E\uA86F\uA870\uA871\uA872\uA873\uA882\uA883\uA884\uA885\uA886\uA887\uA888\uA889\uA88A\uA88B\uA88C\uA88D\uA88E\uA88F\uA890\uA891\uA892\uA893\uA894\uA895\uA896\uA897\uA898\uA899\uA89A\uA89B\uA89C\uA89D\uA89E\uA89F\uA8A0\uA8A1\uA8A2\uA8A3\uA8A4\uA8A5\uA8A6\uA8A7\uA8A8\uA8A9\uA8AA\uA8AB\uA8AC\uA8AD\uA8AE\uA8AF\uA8B0\uA8B1\uA8B2\uA8B3\uA90A\uA90B\uA90C\uA90D\uA90E\uA90F\uA910\uA911\uA912\uA913\uA914\uA915\uA916\uA917\uA918\uA919\uA91A\uA91B\uA91C\uA91D\uA91E\uA91F\uA920\uA921\uA922\uA923\uA924\uA925\uA930\uA931\uA932\uA933\uA934\uA935\uA936\uA937\uA938\uA939\uA93A\uA93B\uA93C\uA93D\uA93E\uA93F\uA940\uA941\uA942\uA943\uA944\uA945\uA946\uAA00\uAA01\uAA02\uAA03\uAA04\uAA05\uAA06\uAA07\uAA08\uAA09\uAA0A\uAA0B\uAA0C\uAA0D\uAA0E\uAA0F\uAA10\uAA11\uAA12\uAA13\uAA14\uAA15\uAA16\uAA17\uAA18\uAA19\uAA1A\uAA1B\uAA1C\uAA1D\uAA1E\uAA1F\uAA20\uAA21\uAA22\uAA23\uAA24\uAA25\uAA26\uAA27\uAA28\uAA40\uAA41\uAA42\uAA44\uAA45\uAA46\uAA47\uAA48\uAA49\uAA4A\uAA4B\uAC00\uD7A3\uF900\uF901\uF902\uF903\uF904\uF905\uF906\uF907\uF908\uF909\uF90A\uF90B\uF90C\uF90D\uF90E\uF90F\uF910\uF911\uF912\uF913\uF914\uF915\uF916\uF917\uF918\uF919\uF91A\uF91B\uF91C\uF91D\uF91E\uF91F\uF920\uF921\uF922\uF923\uF924\uF925\uF926\uF927\uF928\uF929\uF92A\uF92B\uF92C\uF92D\uF92E\uF92F\uF930\uF931\uF932\uF933\uF934\uF935\uF936\uF937\uF938\uF939\uF93A\uF93B\uF93C\uF93D\uF93E\uF93F\uF940\uF941\uF942\uF943\uF944\uF945\uF946\uF947\uF948\uF949\uF94A\uF94B\uF94C\uF94D\uF94E\uF94F\uF950\uF951\uF952\uF953\uF954\uF955\uF956\uF957\uF958\uF959\uF95A\uF95B\uF95C\uF95D\uF95E\uF95F\uF960\uF961\uF962\uF963\uF964\uF965\uF966\uF967\uF968\uF969\uF96A\uF96B\uF96C\uF96D\uF96E\uF96F\uF970\uF971\uF972\uF973\uF974\uF975\uF976\uF977\uF978\uF979\uF97A\uF97B\uF97C\uF97D\uF97E\uF97F\uF980\uF981\uF982\uF983\uF984\uF985\uF986\uF987\uF988\uF989\uF98A\uF98B\uF98C\uF98D\uF98E\uF98F\uF990\uF991\uF992\uF993\uF994\uF995\uF996\uF997\uF998\uF999\uF99A\uF99B\uF99C\uF99D\uF99E\uF99F\uF9A0\uF9A1\uF9A2\uF9A3\uF9A4\uF9A5\uF9A6\uF9A7\uF9A8\uF9A9\uF9AA\uF9AB\uF9AC\uF9AD\uF9AE\uF9AF\uF9B0\uF9B1\uF9B2\uF9B3\uF9B4\uF9B5\uF9B6\uF9B7\uF9B8\uF9B9\uF9BA\uF9BB\uF9BC\uF9BD\uF9BE\uF9BF\uF9C0\uF9C1\uF9C2\uF9C3\uF9C4\uF9C5\uF9C6\uF9C7\uF9C8\uF9C9\uF9CA\uF9CB\uF9CC\uF9CD\uF9CE\uF9CF\uF9D0\uF9D1\uF9D2\uF9D3\uF9D4\uF9D5\uF9D6\uF9D7\uF9D8\uF9D9\uF9DA\uF9DB\uF9DC\uF9DD\uF9DE\uF9DF\uF9E0\uF9E1\uF9E2\uF9E3\uF9E4\uF9E5\uF9E6\uF9E7\uF9E8\uF9E9\uF9EA\uF9EB\uF9EC\uF9ED\uF9EE\uF9EF\uF9F0\uF9F1\uF9F2\uF9F3\uF9F4\uF9F5\uF9F6\uF9F7\uF9F8\uF9F9\uF9FA\uF9FB\uF9FC\uF9FD\uF9FE\uF9FF\uFA00\uFA01\uFA02\uFA03\uFA04\uFA05\uFA06\uFA07\uFA08\uFA09\uFA0A\uFA0B\uFA0C\uFA0D\uFA0E\uFA0F\uFA10\uFA11\uFA12\uFA13\uFA14\uFA15\uFA16\uFA17\uFA18\uFA19\uFA1A\uFA1B\uFA1C\uFA1D\uFA1E\uFA1F\uFA20\uFA21\uFA22\uFA23\uFA24\uFA25\uFA26\uFA27\uFA28\uFA29\uFA2A\uFA2B\uFA2C\uFA2D\uFA30\uFA31\uFA32\uFA33\uFA34\uFA35\uFA36\uFA37\uFA38\uFA39\uFA3A\uFA3B\uFA3C\uFA3D\uFA3E\uFA3F\uFA40\uFA41\uFA42\uFA43\uFA44\uFA45\uFA46\uFA47\uFA48\uFA49\uFA4A\uFA4B\uFA4C\uFA4D\uFA4E\uFA4F\uFA50\uFA51\uFA52\uFA53\uFA54\uFA55\uFA56\uFA57\uFA58\uFA59\uFA5A\uFA5B\uFA5C\uFA5D\uFA5E\uFA5F\uFA60\uFA61\uFA62\uFA63\uFA64\uFA65\uFA66\uFA67\uFA68\uFA69\uFA6A\uFA70\uFA71\uFA72\uFA73\uFA74\uFA75\uFA76\uFA77\uFA78\uFA79\uFA7A\uFA7B\uFA7C\uFA7D\uFA7E\uFA7F\uFA80\uFA81\uFA82\uFA83\uFA84\uFA85\uFA86\uFA87\uFA88\uFA89\uFA8A\uFA8B\uFA8C\uFA8D\uFA8E\uFA8F\uFA90\uFA91\uFA92\uFA93\uFA94\uFA95\uFA96\uFA97\uFA98\uFA99\uFA9A\uFA9B\uFA9C\uFA9D\uFA9E\uFA9F\uFAA0\uFAA1\uFAA2\uFAA3\uFAA4\uFAA5\uFAA6\uFAA7\uFAA8\uFAA9\uFAAA\uFAAB\uFAAC\uFAAD\uFAAE\uFAAF\uFAB0\uFAB1\uFAB2\uFAB3\uFAB4\uFAB5\uFAB6\uFAB7\uFAB8\uFAB9\uFABA\uFABB\uFABC\uFABD\uFABE\uFABF\uFAC0\uFAC1\uFAC2\uFAC3\uFAC4\uFAC5\uFAC6\uFAC7\uFAC8\uFAC9\uFACA\uFACB\uFACC\uFACD\uFACE\uFACF\uFAD0\uFAD1\uFAD2\uFAD3\uFAD4\uFAD5\uFAD6\uFAD7\uFAD8\uFAD9\uFB1D\uFB1F\uFB20\uFB21\uFB22\uFB23\uFB24\uFB25\uFB26\uFB27\uFB28\uFB2A\uFB2B\uFB2C\uFB2D\uFB2E\uFB2F\uFB30\uFB31\uFB32\uFB33\uFB34\uFB35\uFB36\uFB38\uFB39\uFB3A\uFB3B\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46\uFB47\uFB48\uFB49\uFB4A\uFB4B\uFB4C\uFB4D\uFB4E\uFB4F\uFB50\uFB51\uFB52\uFB53\uFB54\uFB55\uFB56\uFB57\uFB58\uFB59\uFB5A\uFB5B\uFB5C\uFB5D\uFB5E\uFB5F\uFB60\uFB61\uFB62\uFB63\uFB64\uFB65\uFB66\uFB67\uFB68\uFB69\uFB6A\uFB6B\uFB6C\uFB6D\uFB6E\uFB6F\uFB70\uFB71\uFB72\uFB73\uFB74\uFB75\uFB76\uFB77\uFB78\uFB79\uFB7A\uFB7B\uFB7C\uFB7D\uFB7E\uFB7F\uFB80\uFB81\uFB82\uFB83\uFB84\uFB85\uFB86\uFB87\uFB88\uFB89\uFB8A\uFB8B\uFB8C\uFB8D\uFB8E\uFB8F\uFB90\uFB91\uFB92\uFB93\uFB94\uFB95\uFB96\uFB97\uFB98\uFB99\uFB9A\uFB9B\uFB9C\uFB9D\uFB9E\uFB9F\uFBA0\uFBA1\uFBA2\uFBA3\uFBA4\uFBA5\uFBA6\uFBA7\uFBA8\uFBA9\uFBAA\uFBAB\uFBAC\uFBAD\uFBAE\uFBAF\uFBB0\uFBB1\uFBD3\uFBD4\uFBD5\uFBD6\uFBD7\uFBD8\uFBD9\uFBDA\uFBDB\uFBDC\uFBDD\uFBDE\uFBDF\uFBE0\uFBE1\uFBE2\uFBE3\uFBE4\uFBE5\uFBE6\uFBE7\uFBE8\uFBE9\uFBEA\uFBEB\uFBEC\uFBED\uFBEE\uFBEF\uFBF0\uFBF1\uFBF2\uFBF3\uFBF4\uFBF5\uFBF6\uFBF7\uFBF8\uFBF9\uFBFA\uFBFB\uFBFC\uFBFD\uFBFE\uFBFF\uFC00\uFC01\uFC02\uFC03\uFC04\uFC05\uFC06\uFC07\uFC08\uFC09\uFC0A\uFC0B\uFC0C\uFC0D\uFC0E\uFC0F\uFC10\uFC11\uFC12\uFC13\uFC14\uFC15\uFC16\uFC17\uFC18\uFC19\uFC1A\uFC1B\uFC1C\uFC1D\uFC1E\uFC1F\uFC20\uFC21\uFC22\uFC23\uFC24\uFC25\uFC26\uFC27\uFC28\uFC29\uFC2A\uFC2B\uFC2C\uFC2D\uFC2E\uFC2F\uFC30\uFC31\uFC32\uFC33\uFC34\uFC35\uFC36\uFC37\uFC38\uFC39\uFC3A\uFC3B\uFC3C\uFC3D\uFC3E\uFC3F\uFC40\uFC41\uFC42\uFC43\uFC44\uFC45\uFC46\uFC47\uFC48\uFC49\uFC4A\uFC4B\uFC4C\uFC4D\uFC4E\uFC4F\uFC50\uFC51\uFC52\uFC53\uFC54\uFC55\uFC56\uFC57\uFC58\uFC59\uFC5A\uFC5B\uFC5C\uFC5D\uFC5E\uFC5F\uFC60\uFC61\uFC62\uFC63\uFC64\uFC65\uFC66\uFC67\uFC68\uFC69\uFC6A\uFC6B\uFC6C\uFC6D\uFC6E\uFC6F\uFC70\uFC71\uFC72\uFC73\uFC74\uFC75\uFC76\uFC77\uFC78\uFC79\uFC7A\uFC7B\uFC7C\uFC7D\uFC7E\uFC7F\uFC80\uFC81\uFC82\uFC83\uFC84\uFC85\uFC86\uFC87\uFC88\uFC89\uFC8A\uFC8B\uFC8C\uFC8D\uFC8E\uFC8F\uFC90\uFC91\uFC92\uFC93\uFC94\uFC95\uFC96\uFC97\uFC98\uFC99\uFC9A\uFC9B\uFC9C\uFC9D\uFC9E\uFC9F\uFCA0\uFCA1\uFCA2\uFCA3\uFCA4\uFCA5\uFCA6\uFCA7\uFCA8\uFCA9\uFCAA\uFCAB\uFCAC\uFCAD\uFCAE\uFCAF\uFCB0\uFCB1\uFCB2\uFCB3\uFCB4\uFCB5\uFCB6\uFCB7\uFCB8\uFCB9\uFCBA\uFCBB\uFCBC\uFCBD\uFCBE\uFCBF\uFCC0\uFCC1\uFCC2\uFCC3\uFCC4\uFCC5\uFCC6\uFCC7\uFCC8\uFCC9\uFCCA\uFCCB\uFCCC\uFCCD\uFCCE\uFCCF\uFCD0\uFCD1\uFCD2\uFCD3\uFCD4\uFCD5\uFCD6\uFCD7\uFCD8\uFCD9\uFCDA\uFCDB\uFCDC\uFCDD\uFCDE\uFCDF\uFCE0\uFCE1\uFCE2\uFCE3\uFCE4\uFCE5\uFCE6\uFCE7\uFCE8\uFCE9\uFCEA\uFCEB\uFCEC\uFCED\uFCEE\uFCEF\uFCF0\uFCF1\uFCF2\uFCF3\uFCF4\uFCF5\uFCF6\uFCF7\uFCF8\uFCF9\uFCFA\uFCFB\uFCFC\uFCFD\uFCFE\uFCFF\uFD00\uFD01\uFD02\uFD03\uFD04\uFD05\uFD06\uFD07\uFD08\uFD09\uFD0A\uFD0B\uFD0C\uFD0D\uFD0E\uFD0F\uFD10\uFD11\uFD12\uFD13\uFD14\uFD15\uFD16\uFD17\uFD18\uFD19\uFD1A\uFD1B\uFD1C\uFD1D\uFD1E\uFD1F\uFD20\uFD21\uFD22\uFD23\uFD24\uFD25\uFD26\uFD27\uFD28\uFD29\uFD2A\uFD2B\uFD2C\uFD2D\uFD2E\uFD2F\uFD30\uFD31\uFD32\uFD33\uFD34\uFD35\uFD36\uFD37\uFD38\uFD39\uFD3A\uFD3B\uFD3C\uFD3D\uFD50\uFD51\uFD52\uFD53\uFD54\uFD55\uFD56\uFD57\uFD58\uFD59\uFD5A\uFD5B\uFD5C\uFD5D\uFD5E\uFD5F\uFD60\uFD61\uFD62\uFD63\uFD64\uFD65\uFD66\uFD67\uFD68\uFD69\uFD6A\uFD6B\uFD6C\uFD6D\uFD6E\uFD6F\uFD70\uFD71\uFD72\uFD73\uFD74\uFD75\uFD76\uFD77\uFD78\uFD79\uFD7A\uFD7B\uFD7C\uFD7D\uFD7E\uFD7F\uFD80\uFD81\uFD82\uFD83\uFD84\uFD85\uFD86\uFD87\uFD88\uFD89\uFD8A\uFD8B\uFD8C\uFD8D\uFD8E\uFD8F\uFD92\uFD93\uFD94\uFD95\uFD96\uFD97\uFD98\uFD99\uFD9A\uFD9B\uFD9C\uFD9D\uFD9E\uFD9F\uFDA0\uFDA1\uFDA2\uFDA3\uFDA4\uFDA5\uFDA6\uFDA7\uFDA8\uFDA9\uFDAA\uFDAB\uFDAC\uFDAD\uFDAE\uFDAF\uFDB0\uFDB1\uFDB2\uFDB3\uFDB4\uFDB5\uFDB6\uFDB7\uFDB8\uFDB9\uFDBA\uFDBB\uFDBC\uFDBD\uFDBE\uFDBF\uFDC0\uFDC1\uFDC2\uFDC3\uFDC4\uFDC5\uFDC6\uFDC7\uFDF0\uFDF1\uFDF2\uFDF3\uFDF4\uFDF5\uFDF6\uFDF7\uFDF8\uFDF9\uFDFA\uFDFB\uFE70\uFE71\uFE72\uFE73\uFE74\uFE76\uFE77\uFE78\uFE79\uFE7A\uFE7B\uFE7C\uFE7D\uFE7E\uFE7F\uFE80\uFE81\uFE82\uFE83\uFE84\uFE85\uFE86\uFE87\uFE88\uFE89\uFE8A\uFE8B\uFE8C\uFE8D\uFE8E\uFE8F\uFE90\uFE91\uFE92\uFE93\uFE94\uFE95\uFE96\uFE97\uFE98\uFE99\uFE9A\uFE9B\uFE9C\uFE9D\uFE9E\uFE9F\uFEA0\uFEA1\uFEA2\uFEA3\uFEA4\uFEA5\uFEA6\uFEA7\uFEA8\uFEA9\uFEAA\uFEAB\uFEAC\uFEAD\uFEAE\uFEAF\uFEB0\uFEB1\uFEB2\uFEB3\uFEB4\uFEB5\uFEB6\uFEB7\uFEB8\uFEB9\uFEBA\uFEBB\uFEBC\uFEBD\uFEBE\uFEBF\uFEC0\uFEC1\uFEC2\uFEC3\uFEC4\uFEC5\uFEC6\uFEC7\uFEC8\uFEC9\uFECA\uFECB\uFECC\uFECD\uFECE\uFECF\uFED0\uFED1\uFED2\uFED3\uFED4\uFED5\uFED6\uFED7\uFED8\uFED9\uFEDA\uFEDB\uFEDC\uFEDD\uFEDE\uFEDF\uFEE0\uFEE1\uFEE2\uFEE3\uFEE4\uFEE5\uFEE6\uFEE7\uFEE8\uFEE9\uFEEA\uFEEB\uFEEC\uFEED\uFEEE\uFEEF\uFEF0\uFEF1\uFEF2\uFEF3\uFEF4\uFEF5\uFEF6\uFEF7\uFEF8\uFEF9\uFEFA\uFEFB\uFEFC\uFF66\uFF67\uFF68\uFF69\uFF6A\uFF6B\uFF6C\uFF6D\uFF6E\uFF6F\uFF71\uFF72\uFF73\uFF74\uFF75\uFF76\uFF77\uFF78\uFF79\uFF7A\uFF7B\uFF7C\uFF7D\uFF7E\uFF7F\uFF80\uFF81\uFF82\uFF83\uFF84\uFF85\uFF86\uFF87\uFF88\uFF89\uFF8A\uFF8B\uFF8C\uFF8D\uFF8E\uFF8F\uFF90\uFF91\uFF92\uFF93\uFF94\uFF95\uFF96\uFF97\uFF98\uFF99\uFF9A\uFF9B\uFF9C\uFF9D\uFFA0\uFFA1\uFFA2\uFFA3\uFFA4\uFFA5\uFFA6\uFFA7\uFFA8\uFFA9\uFFAA\uFFAB\uFFAC\uFFAD\uFFAE\uFFAF\uFFB0\uFFB1\uFFB2\uFFB3\uFFB4\uFFB5\uFFB6\uFFB7\uFFB8\uFFB9\uFFBA\uFFBB\uFFBC\uFFBD\uFFBE\uFFC2\uFFC3\uFFC4\uFFC5\uFFC6\uFFC7\uFFCA\uFFCB\uFFCC\uFFCD\uFFCE\uFFCF\uFFD2\uFFD3\uFFD4\uFFD5\uFFD6\uFFD7\uFFDA\uFFDB\uFFDC]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u01BB\\u01C0\\u01C1\\u01C2\\u01C3\\u0294\\u05D0\\u05D1\\u05D2\\u05D3\\u05D4\\u05D5\\u05D6\\u05D7\\u05D8\\u05D9\\u05DA\\u05DB\\u05DC\\u05DD\\u05DE\\u05DF\\u05E0\\u05E1\\u05E2\\u05E3\\u05E4\\u05E5\\u05E6\\u05E7\\u05E8\\u05E9\\u05EA\\u05F0\\u05F1\\u05F2\\u0621\\u0622\\u0623\\u0624\\u0625\\u0626\\u0627\\u0628\\u0629\\u062A\\u062B\\u062C\\u062D\\u062E\\u062F\\u0630\\u0631\\u0632\\u0633\\u0634\\u0635\\u0636\\u0637\\u0638\\u0639\\u063A\\u063B\\u063C\\u063D\\u063E\\u063F\\u0641\\u0642\\u0643\\u0644\\u0645\\u0646\\u0647\\u0648\\u0649\\u064A\\u066E\\u066F\\u0671\\u0672\\u0673\\u0674\\u0675\\u0676\\u0677\\u0678\\u0679\\u067A\\u067B\\u067C\\u067D\\u067E\\u067F\\u0680\\u0681\\u0682\\u0683\\u0684\\u0685\\u0686\\u0687\\u0688\\u0689\\u068A\\u068B\\u068C\\u068D\\u068E\\u068F\\u0690\\u0691\\u0692\\u0693\\u0694\\u0695\\u0696\\u0697\\u0698\\u0699\\u069A\\u069B\\u069C\\u069D\\u069E\\u069F\\u06A0\\u06A1\\u06A2\\u06A3\\u06A4\\u06A5\\u06A6\\u06A7\\u06A8\\u06A9\\u06AA\\u06AB\\u06AC\\u06AD\\u06AE\\u06AF\\u06B0\\u06B1\\u06B2\\u06B3\\u06B4\\u06B5\\u06B6\\u06B7\\u06B8\\u06B9\\u06BA\\u06BB\\u06BC\\u06BD\\u06BE\\u06BF\\u06C0\\u06C1\\u06C2\\u06C3\\u06C4\\u06C5\\u06C6\\u06C7\\u06C8\\u06C9\\u06CA\\u06CB\\u06CC\\u06CD\\u06CE\\u06CF\\u06D0\\u06D1\\u06D2\\u06D3\\u06D5\\u06EE\\u06EF\\u06FA\\u06FB\\u06FC\\u06FF\\u0710\\u0712\\u0713\\u0714\\u0715\\u0716\\u0717\\u0718\\u0719\\u071A\\u071B\\u071C\\u071D\\u071E\\u071F\\u0720\\u0721\\u0722\\u0723\\u0724\\u0725\\u0726\\u0727\\u0728\\u0729\\u072A\\u072B\\u072C\\u072D\\u072E\\u072F\\u074D\\u074E\\u074F\\u0750\\u0751\\u0752\\u0753\\u0754\\u0755\\u0756\\u0757\\u0758\\u0759\\u075A\\u075B\\u075C\\u075D\\u075E\\u075F\\u0760\\u0761\\u0762\\u0763\\u0764\\u0765\\u0766\\u0767\\u0768\\u0769\\u076A\\u076B\\u076C\\u076D\\u076E\\u076F\\u0770\\u0771\\u0772\\u0773\\u0774\\u0775\\u0776\\u0777\\u0778\\u0779\\u077A\\u077B\\u077C\\u077D\\u077E\\u077F\\u0780\\u0781\\u0782\\u0783\\u0784\\u0785\\u0786\\u0787\\u0788\\u0789\\u078A\\u078B\\u078C\\u078D\\u078E\\u078F\\u0790\\u0791\\u0792\\u0793\\u0794\\u0795\\u0796\\u0797\\u0798\\u0799\\u079A\\u079B\\u079C\\u079D\\u079E\\u079F\\u07A0\\u07A1\\u07A2\\u07A3\\u07A4\\u07A5\\u07B1\\u07CA\\u07CB\\u07CC\\u07CD\\u07CE\\u07CF\\u07D0\\u07D1\\u07D2\\u07D3\\u07D4\\u07D5\\u07D6\\u07D7\\u07D8\\u07D9\\u07DA\\u07DB\\u07DC\\u07DD\\u07DE\\u07DF\\u07E0\\u07E1\\u07E2\\u07E3\\u07E4\\u07E5\\u07E6\\u07E7\\u07E8\\u07E9\\u07EA\\u0904\\u0905\\u0906\\u0907\\u0908\\u0909\\u090A\\u090B\\u090C\\u090D\\u090E\\u090F\\u0910\\u0911\\u0912\\u0913\\u0914\\u0915\\u0916\\u0917\\u0918\\u0919\\u091A\\u091B\\u091C\\u091D\\u091E\\u091F\\u0920\\u0921\\u0922\\u0923\\u0924\\u0925\\u0926\\u0927\\u0928\\u0929\\u092A\\u092B\\u092C\\u092D\\u092E\\u092F\\u0930\\u0931\\u0932\\u0933\\u0934\\u0935\\u0936\\u0937\\u0938\\u0939\\u093D\\u0950\\u0958\\u0959\\u095A\\u095B\\u095C\\u095D\\u095E\\u095F\\u0960\\u0961\\u0972\\u097B\\u097C\\u097D\\u097E\\u097F\\u0985\\u0986\\u0987\\u0988\\u0989\\u098A\\u098B\\u098C\\u098F\\u0990\\u0993\\u0994\\u0995\\u0996\\u0997\\u0998\\u0999\\u099A\\u099B\\u099C\\u099D\\u099E\\u099F\\u09A0\\u09A1\\u09A2\\u09A3\\u09A4\\u09A5\\u09A6\\u09A7\\u09A8\\u09AA\\u09AB\\u09AC\\u09AD\\u09AE\\u09AF\\u09B0\\u09B2\\u09B6\\u09B7\\u09B8\\u09B9\\u09BD\\u09CE\\u09DC\\u09DD\\u09DF\\u09E0\\u09E1\\u09F0\\u09F1\\u0A05\\u0A06\\u0A07\\u0A08\\u0A09\\u0A0A\\u0A0F\\u0A10\\u0A13\\u0A14\\u0A15\\u0A16\\u0A17\\u0A18\\u0A19\\u0A1A\\u0A1B\\u0A1C\\u0A1D\\u0A1E\\u0A1F\\u0A20\\u0A21\\u0A22\\u0A23\\u0A24\\u0A25\\u0A26\\u0A27\\u0A28\\u0A2A\\u0A2B\\u0A2C\\u0A2D\\u0A2E\\u0A2F\\u0A30\\u0A32\\u0A33\\u0A35\\u0A36\\u0A38\\u0A39\\u0A59\\u0A5A\\u0A5B\\u0A5C\\u0A5E\\u0A72\\u0A73\\u0A74\\u0A85\\u0A86\\u0A87\\u0A88\\u0A89\\u0A8A\\u0A8B\\u0A8C\\u0A8D\\u0A8F\\u0A90\\u0A91\\u0A93\\u0A94\\u0A95\\u0A96\\u0A97\\u0A98\\u0A99\\u0A9A\\u0A9B\\u0A9C\\u0A9D\\u0A9E\\u0A9F\\u0AA0\\u0AA1\\u0AA2\\u0AA3\\u0AA4\\u0AA5\\u0AA6\\u0AA7\\u0AA8\\u0AAA\\u0AAB\\u0AAC\\u0AAD\\u0AAE\\u0AAF\\u0AB0\\u0AB2\\u0AB3\\u0AB5\\u0AB6\\u0AB7\\u0AB8\\u0AB9\\u0ABD\\u0AD0\\u0AE0\\u0AE1\\u0B05\\u0B06\\u0B07\\u0B08\\u0B09\\u0B0A\\u0B0B\\u0B0C\\u0B0F\\u0B10\\u0B13\\u0B14\\u0B15\\u0B16\\u0B17\\u0B18\\u0B19\\u0B1A\\u0B1B\\u0B1C\\u0B1D\\u0B1E\\u0B1F\\u0B20\\u0B21\\u0B22\\u0B23\\u0B24\\u0B25\\u0B26\\u0B27\\u0B28\\u0B2A\\u0B2B\\u0B2C\\u0B2D\\u0B2E\\u0B2F\\u0B30\\u0B32\\u0B33\\u0B35\\u0B36\\u0B37\\u0B38\\u0B39\\u0B3D\\u0B5C\\u0B5D\\u0B5F\\u0B60\\u0B61\\u0B71\\u0B83\\u0B85\\u0B86\\u0B87\\u0B88\\u0B89\\u0B8A\\u0B8E\\u0B8F\\u0B90\\u0B92\\u0B93\\u0B94\\u0B95\\u0B99\\u0B9A\\u0B9C\\u0B9E\\u0B9F\\u0BA3\\u0BA4\\u0BA8\\u0BA9\\u0BAA\\u0BAE\\u0BAF\\u0BB0\\u0BB1\\u0BB2\\u0BB3\\u0BB4\\u0BB5\\u0BB6\\u0BB7\\u0BB8\\u0BB9\\u0BD0\\u0C05\\u0C06\\u0C07\\u0C08\\u0C09\\u0C0A\\u0C0B\\u0C0C\\u0C0E\\u0C0F\\u0C10\\u0C12\\u0C13\\u0C14\\u0C15\\u0C16\\u0C17\\u0C18\\u0C19\\u0C1A\\u0C1B\\u0C1C\\u0C1D\\u0C1E\\u0C1F\\u0C20\\u0C21\\u0C22\\u0C23\\u0C24\\u0C25\\u0C26\\u0C27\\u0C28\\u0C2A\\u0C2B\\u0C2C\\u0C2D\\u0C2E\\u0C2F\\u0C30\\u0C31\\u0C32\\u0C33\\u0C35\\u0C36\\u0C37\\u0C38\\u0C39\\u0C3D\\u0C58\\u0C59\\u0C60\\u0C61\\u0C85\\u0C86\\u0C87\\u0C88\\u0C89\\u0C8A\\u0C8B\\u0C8C\\u0C8E\\u0C8F\\u0C90\\u0C92\\u0C93\\u0C94\\u0C95\\u0C96\\u0C97\\u0C98\\u0C99\\u0C9A\\u0C9B\\u0C9C\\u0C9D\\u0C9E\\u0C9F\\u0CA0\\u0CA1\\u0CA2\\u0CA3\\u0CA4\\u0CA5\\u0CA6\\u0CA7\\u0CA8\\u0CAA\\u0CAB\\u0CAC\\u0CAD\\u0CAE\\u0CAF\\u0CB0\\u0CB1\\u0CB2\\u0CB3\\u0CB5\\u0CB6\\u0CB7\\u0CB8\\u0CB9\\u0CBD\\u0CDE\\u0CE0\\u0CE1\\u0D05\\u0D06\\u0D07\\u0D08\\u0D09\\u0D0A\\u0D0B\\u0D0C\\u0D0E\\u0D0F\\u0D10\\u0D12\\u0D13\\u0D14\\u0D15\\u0D16\\u0D17\\u0D18\\u0D19\\u0D1A\\u0D1B\\u0D1C\\u0D1D\\u0D1E\\u0D1F\\u0D20\\u0D21\\u0D22\\u0D23\\u0D24\\u0D25\\u0D26\\u0D27\\u0D28\\u0D2A\\u0D2B\\u0D2C\\u0D2D\\u0D2E\\u0D2F\\u0D30\\u0D31\\u0D32\\u0D33\\u0D34\\u0D35\\u0D36\\u0D37\\u0D38\\u0D39\\u0D3D\\u0D60\\u0D61\\u0D7A\\u0D7B\\u0D7C\\u0D7D\\u0D7E\\u0D7F\\u0D85\\u0D86\\u0D87\\u0D88\\u0D89\\u0D8A\\u0D8B\\u0D8C\\u0D8D\\u0D8E\\u0D8F\\u0D90\\u0D91\\u0D92\\u0D93\\u0D94\\u0D95\\u0D96\\u0D9A\\u0D9B\\u0D9C\\u0D9D\\u0D9E\\u0D9F\\u0DA0\\u0DA1\\u0DA2\\u0DA3\\u0DA4\\u0DA5\\u0DA6\\u0DA7\\u0DA8\\u0DA9\\u0DAA\\u0DAB\\u0DAC\\u0DAD\\u0DAE\\u0DAF\\u0DB0\\u0DB1\\u0DB3\\u0DB4\\u0DB5\\u0DB6\\u0DB7\\u0DB8\\u0DB9\\u0DBA\\u0DBB\\u0DBD\\u0DC0\\u0DC1\\u0DC2\\u0DC3\\u0DC4\\u0DC5\\u0DC6\\u0E01\\u0E02\\u0E03\\u0E04\\u0E05\\u0E06\\u0E07\\u0E08\\u0E09\\u0E0A\\u0E0B\\u0E0C\\u0E0D\\u0E0E\\u0E0F\\u0E10\\u0E11\\u0E12\\u0E13\\u0E14\\u0E15\\u0E16\\u0E17\\u0E18\\u0E19\\u0E1A\\u0E1B\\u0E1C\\u0E1D\\u0E1E\\u0E1F\\u0E20\\u0E21\\u0E22\\u0E23\\u0E24\\u0E25\\u0E26\\u0E27\\u0E28\\u0E29\\u0E2A\\u0E2B\\u0E2C\\u0E2D\\u0E2E\\u0E2F\\u0E30\\u0E32\\u0E33\\u0E40\\u0E41\\u0E42\\u0E43\\u0E44\\u0E45\\u0E81\\u0E82\\u0E84\\u0E87\\u0E88\\u0E8A\\u0E8D\\u0E94\\u0E95\\u0E96\\u0E97\\u0E99\\u0E9A\\u0E9B\\u0E9C\\u0E9D\\u0E9E\\u0E9F\\u0EA1\\u0EA2\\u0EA3\\u0EA5\\u0EA7\\u0EAA\\u0EAB\\u0EAD\\u0EAE\\u0EAF\\u0EB0\\u0EB2\\u0EB3\\u0EBD\\u0EC0\\u0EC1\\u0EC2\\u0EC3\\u0EC4\\u0EDC\\u0EDD\\u0F00\\u0F40\\u0F41\\u0F42\\u0F43\\u0F44\\u0F45\\u0F46\\u0F47\\u0F49\\u0F4A\\u0F4B\\u0F4C\\u0F4D\\u0F4E\\u0F4F\\u0F50\\u0F51\\u0F52\\u0F53\\u0F54\\u0F55\\u0F56\\u0F57\\u0F58\\u0F59\\u0F5A\\u0F5B\\u0F5C\\u0F5D\\u0F5E\\u0F5F\\u0F60\\u0F61\\u0F62\\u0F63\\u0F64\\u0F65\\u0F66\\u0F67\\u0F68\\u0F69\\u0F6A\\u0F6B\\u0F6C\\u0F88\\u0F89\\u0F8A\\u0F8B\\u1000\\u1001\\u1002\\u1003\\u1004\\u1005\\u1006\\u1007\\u1008\\u1009\\u100A\\u100B\\u100C\\u100D\\u100E\\u100F\\u1010\\u1011\\u1012\\u1013\\u1014\\u1015\\u1016\\u1017\\u1018\\u1019\\u101A\\u101B\\u101C\\u101D\\u101E\\u101F\\u1020\\u1021\\u1022\\u1023\\u1024\\u1025\\u1026\\u1027\\u1028\\u1029\\u102A\\u103F\\u1050\\u1051\\u1052\\u1053\\u1054\\u1055\\u105A\\u105B\\u105C\\u105D\\u1061\\u1065\\u1066\\u106E\\u106F\\u1070\\u1075\\u1076\\u1077\\u1078\\u1079\\u107A\\u107B\\u107C\\u107D\\u107E\\u107F\\u1080\\u1081\\u108E\\u10D0\\u10D1\\u10D2\\u10D3\\u10D4\\u10D5\\u10D6\\u10D7\\u10D8\\u10D9\\u10DA\\u10DB\\u10DC\\u10DD\\u10DE\\u10DF\\u10E0\\u10E1\\u10E2\\u10E3\\u10E4\\u10E5\\u10E6\\u10E7\\u10E8\\u10E9\\u10EA\\u10EB\\u10EC\\u10ED\\u10EE\\u10EF\\u10F0\\u10F1\\u10F2\\u10F3\\u10F4\\u10F5\\u10F6\\u10F7\\u10F8\\u10F9\\u10FA\\u1100\\u1101\\u1102\\u1103\\u1104\\u1105\\u1106\\u1107\\u1108\\u1109\\u110A\\u110B\\u110C\\u110D\\u110E\\u110F\\u1110\\u1111\\u1112\\u1113\\u1114\\u1115\\u1116\\u1117\\u1118\\u1119\\u111A\\u111B\\u111C\\u111D\\u111E\\u111F\\u1120\\u1121\\u1122\\u1123\\u1124\\u1125\\u1126\\u1127\\u1128\\u1129\\u112A\\u112B\\u112C\\u112D\\u112E\\u112F\\u1130\\u1131\\u1132\\u1133\\u1134\\u1135\\u1136\\u1137\\u1138\\u1139\\u113A\\u113B\\u113C\\u113D\\u113E\\u113F\\u1140\\u1141\\u1142\\u1143\\u1144\\u1145\\u1146\\u1147\\u1148\\u1149\\u114A\\u114B\\u114C\\u114D\\u114E\\u114F\\u1150\\u1151\\u1152\\u1153\\u1154\\u1155\\u1156\\u1157\\u1158\\u1159\\u115F\\u1160\\u1161\\u1162\\u1163\\u1164\\u1165\\u1166\\u1167\\u1168\\u1169\\u116A\\u116B\\u116C\\u116D\\u116E\\u116F\\u1170\\u1171\\u1172\\u1173\\u1174\\u1175\\u1176\\u1177\\u1178\\u1179\\u117A\\u117B\\u117C\\u117D\\u117E\\u117F\\u1180\\u1181\\u1182\\u1183\\u1184\\u1185\\u1186\\u1187\\u1188\\u1189\\u118A\\u118B\\u118C\\u118D\\u118E\\u118F\\u1190\\u1191\\u1192\\u1193\\u1194\\u1195\\u1196\\u1197\\u1198\\u1199\\u119A\\u119B\\u119C\\u119D\\u119E\\u119F\\u11A0\\u11A1\\u11A2\\u11A8\\u11A9\\u11AA\\u11AB\\u11AC\\u11AD\\u11AE\\u11AF\\u11B0\\u11B1\\u11B2\\u11B3\\u11B4\\u11B5\\u11B6\\u11B7\\u11B8\\u11B9\\u11BA\\u11BB\\u11BC\\u11BD\\u11BE\\u11BF\\u11C0\\u11C1\\u11C2\\u11C3\\u11C4\\u11C5\\u11C6\\u11C7\\u11C8\\u11C9\\u11CA\\u11CB\\u11CC\\u11CD\\u11CE\\u11CF\\u11D0\\u11D1\\u11D2\\u11D3\\u11D4\\u11D5\\u11D6\\u11D7\\u11D8\\u11D9\\u11DA\\u11DB\\u11DC\\u11DD\\u11DE\\u11DF\\u11E0\\u11E1\\u11E2\\u11E3\\u11E4\\u11E5\\u11E6\\u11E7\\u11E8\\u11E9\\u11EA\\u11EB\\u11EC\\u11ED\\u11EE\\u11EF\\u11F0\\u11F1\\u11F2\\u11F3\\u11F4\\u11F5\\u11F6\\u11F7\\u11F8\\u11F9\\u1200\\u1201\\u1202\\u1203\\u1204\\u1205\\u1206\\u1207\\u1208\\u1209\\u120A\\u120B\\u120C\\u120D\\u120E\\u120F\\u1210\\u1211\\u1212\\u1213\\u1214\\u1215\\u1216\\u1217\\u1218\\u1219\\u121A\\u121B\\u121C\\u121D\\u121E\\u121F\\u1220\\u1221\\u1222\\u1223\\u1224\\u1225\\u1226\\u1227\\u1228\\u1229\\u122A\\u122B\\u122C\\u122D\\u122E\\u122F\\u1230\\u1231\\u1232\\u1233\\u1234\\u1235\\u1236\\u1237\\u1238\\u1239\\u123A\\u123B\\u123C\\u123D\\u123E\\u123F\\u1240\\u1241\\u1242\\u1243\\u1244\\u1245\\u1246\\u1247\\u1248\\u124A\\u124B\\u124C\\u124D\\u1250\\u1251\\u1252\\u1253\\u1254\\u1255\\u1256\\u1258\\u125A\\u125B\\u125C\\u125D\\u1260\\u1261\\u1262\\u1263\\u1264\\u1265\\u1266\\u1267\\u1268\\u1269\\u126A\\u126B\\u126C\\u126D\\u126E\\u126F\\u1270\\u1271\\u1272\\u1273\\u1274\\u1275\\u1276\\u1277\\u1278\\u1279\\u127A\\u127B\\u127C\\u127D\\u127E\\u127F\\u1280\\u1281\\u1282\\u1283\\u1284\\u1285\\u1286\\u1287\\u1288\\u128A\\u128B\\u128C\\u128D\\u1290\\u1291\\u1292\\u1293\\u1294\\u1295\\u1296\\u1297\\u1298\\u1299\\u129A\\u129B\\u129C\\u129D\\u129E\\u129F\\u12A0\\u12A1\\u12A2\\u12A3\\u12A4\\u12A5\\u12A6\\u12A7\\u12A8\\u12A9\\u12AA\\u12AB\\u12AC\\u12AD\\u12AE\\u12AF\\u12B0\\u12B2\\u12B3\\u12B4\\u12B5\\u12B8\\u12B9\\u12BA\\u12BB\\u12BC\\u12BD\\u12BE\\u12C0\\u12C2\\u12C3\\u12C4\\u12C5\\u12C8\\u12C9\\u12CA\\u12CB\\u12CC\\u12CD\\u12CE\\u12CF\\u12D0\\u12D1\\u12D2\\u12D3\\u12D4\\u12D5\\u12D6\\u12D8\\u12D9\\u12DA\\u12DB\\u12DC\\u12DD\\u12DE\\u12DF\\u12E0\\u12E1\\u12E2\\u12E3\\u12E4\\u12E5\\u12E6\\u12E7\\u12E8\\u12E9\\u12EA\\u12EB\\u12EC\\u12ED\\u12EE\\u12EF\\u12F0\\u12F1\\u12F2\\u12F3\\u12F4\\u12F5\\u12F6\\u12F7\\u12F8\\u12F9\\u12FA\\u12FB\\u12FC\\u12FD\\u12FE\\u12FF\\u1300\\u1301\\u1302\\u1303\\u1304\\u1305\\u1306\\u1307\\u1308\\u1309\\u130A\\u130B\\u130C\\u130D\\u130E\\u130F\\u1310\\u1312\\u1313\\u1314\\u1315\\u1318\\u1319\\u131A\\u131B\\u131C\\u131D\\u131E\\u131F\\u1320\\u1321\\u1322\\u1323\\u1324\\u1325\\u1326\\u1327\\u1328\\u1329\\u132A\\u132B\\u132C\\u132D\\u132E\\u132F\\u1330\\u1331\\u1332\\u1333\\u1334\\u1335\\u1336\\u1337\\u1338\\u1339\\u133A\\u133B\\u133C\\u133D\\u133E\\u133F\\u1340\\u1341\\u1342\\u1343\\u1344\\u1345\\u1346\\u1347\\u1348\\u1349\\u134A\\u134B\\u134C\\u134D\\u134E\\u134F\\u1350\\u1351\\u1352\\u1353\\u1354\\u1355\\u1356\\u1357\\u1358\\u1359\\u135A\\u1380\\u1381\\u1382\\u1383\\u1384\\u1385\\u1386\\u1387\\u1388\\u1389\\u138A\\u138B\\u138C\\u138D\\u138E\\u138F\\u13A0\\u13A1\\u13A2\\u13A3\\u13A4\\u13A5\\u13A6\\u13A7\\u13A8\\u13A9\\u13AA\\u13AB\\u13AC\\u13AD\\u13AE\\u13AF\\u13B0\\u13B1\\u13B2\\u13B3\\u13B4\\u13B5\\u13B6\\u13B7\\u13B8\\u13B9\\u13BA\\u13BB\\u13BC\\u13BD\\u13BE\\u13BF\\u13C0\\u13C1\\u13C2\\u13C3\\u13C4\\u13C5\\u13C6\\u13C7\\u13C8\\u13C9\\u13CA\\u13CB\\u13CC\\u13CD\\u13CE\\u13CF\\u13D0\\u13D1\\u13D2\\u13D3\\u13D4\\u13D5\\u13D6\\u13D7\\u13D8\\u13D9\\u13DA\\u13DB\\u13DC\\u13DD\\u13DE\\u13DF\\u13E0\\u13E1\\u13E2\\u13E3\\u13E4\\u13E5\\u13E6\\u13E7\\u13E8\\u13E9\\u13EA\\u13EB\\u13EC\\u13ED\\u13EE\\u13EF\\u13F0\\u13F1\\u13F2\\u13F3\\u13F4\\u1401\\u1402\\u1403\\u1404\\u1405\\u1406\\u1407\\u1408\\u1409\\u140A\\u140B\\u140C\\u140D\\u140E\\u140F\\u1410\\u1411\\u1412\\u1413\\u1414\\u1415\\u1416\\u1417\\u1418\\u1419\\u141A\\u141B\\u141C\\u141D\\u141E\\u141F\\u1420\\u1421\\u1422\\u1423\\u1424\\u1425\\u1426\\u1427\\u1428\\u1429\\u142A\\u142B\\u142C\\u142D\\u142E\\u142F\\u1430\\u1431\\u1432\\u1433\\u1434\\u1435\\u1436\\u1437\\u1438\\u1439\\u143A\\u143B\\u143C\\u143D\\u143E\\u143F\\u1440\\u1441\\u1442\\u1443\\u1444\\u1445\\u1446\\u1447\\u1448\\u1449\\u144A\\u144B\\u144C\\u144D\\u144E\\u144F\\u1450\\u1451\\u1452\\u1453\\u1454\\u1455\\u1456\\u1457\\u1458\\u1459\\u145A\\u145B\\u145C\\u145D\\u145E\\u145F\\u1460\\u1461\\u1462\\u1463\\u1464\\u1465\\u1466\\u1467\\u1468\\u1469\\u146A\\u146B\\u146C\\u146D\\u146E\\u146F\\u1470\\u1471\\u1472\\u1473\\u1474\\u1475\\u1476\\u1477\\u1478\\u1479\\u147A\\u147B\\u147C\\u147D\\u147E\\u147F\\u1480\\u1481\\u1482\\u1483\\u1484\\u1485\\u1486\\u1487\\u1488\\u1489\\u148A\\u148B\\u148C\\u148D\\u148E\\u148F\\u1490\\u1491\\u1492\\u1493\\u1494\\u1495\\u1496\\u1497\\u1498\\u1499\\u149A\\u149B\\u149C\\u149D\\u149E\\u149F\\u14A0\\u14A1\\u14A2\\u14A3\\u14A4\\u14A5\\u14A6\\u14A7\\u14A8\\u14A9\\u14AA\\u14AB\\u14AC\\u14AD\\u14AE\\u14AF\\u14B0\\u14B1\\u14B2\\u14B3\\u14B4\\u14B5\\u14B6\\u14B7\\u14B8\\u14B9\\u14BA\\u14BB\\u14BC\\u14BD\\u14BE\\u14BF\\u14C0\\u14C1\\u14C2\\u14C3\\u14C4\\u14C5\\u14C6\\u14C7\\u14C8\\u14C9\\u14CA\\u14CB\\u14CC\\u14CD\\u14CE\\u14CF\\u14D0\\u14D1\\u14D2\\u14D3\\u14D4\\u14D5\\u14D6\\u14D7\\u14D8\\u14D9\\u14DA\\u14DB\\u14DC\\u14DD\\u14DE\\u14DF\\u14E0\\u14E1\\u14E2\\u14E3\\u14E4\\u14E5\\u14E6\\u14E7\\u14E8\\u14E9\\u14EA\\u14EB\\u14EC\\u14ED\\u14EE\\u14EF\\u14F0\\u14F1\\u14F2\\u14F3\\u14F4\\u14F5\\u14F6\\u14F7\\u14F8\\u14F9\\u14FA\\u14FB\\u14FC\\u14FD\\u14FE\\u14FF\\u1500\\u1501\\u1502\\u1503\\u1504\\u1505\\u1506\\u1507\\u1508\\u1509\\u150A\\u150B\\u150C\\u150D\\u150E\\u150F\\u1510\\u1511\\u1512\\u1513\\u1514\\u1515\\u1516\\u1517\\u1518\\u1519\\u151A\\u151B\\u151C\\u151D\\u151E\\u151F\\u1520\\u1521\\u1522\\u1523\\u1524\\u1525\\u1526\\u1527\\u1528\\u1529\\u152A\\u152B\\u152C\\u152D\\u152E\\u152F\\u1530\\u1531\\u1532\\u1533\\u1534\\u1535\\u1536\\u1537\\u1538\\u1539\\u153A\\u153B\\u153C\\u153D\\u153E\\u153F\\u1540\\u1541\\u1542\\u1543\\u1544\\u1545\\u1546\\u1547\\u1548\\u1549\\u154A\\u154B\\u154C\\u154D\\u154E\\u154F\\u1550\\u1551\\u1552\\u1553\\u1554\\u1555\\u1556\\u1557\\u1558\\u1559\\u155A\\u155B\\u155C\\u155D\\u155E\\u155F\\u1560\\u1561\\u1562\\u1563\\u1564\\u1565\\u1566\\u1567\\u1568\\u1569\\u156A\\u156B\\u156C\\u156D\\u156E\\u156F\\u1570\\u1571\\u1572\\u1573\\u1574\\u1575\\u1576\\u1577\\u1578\\u1579\\u157A\\u157B\\u157C\\u157D\\u157E\\u157F\\u1580\\u1581\\u1582\\u1583\\u1584\\u1585\\u1586\\u1587\\u1588\\u1589\\u158A\\u158B\\u158C\\u158D\\u158E\\u158F\\u1590\\u1591\\u1592\\u1593\\u1594\\u1595\\u1596\\u1597\\u1598\\u1599\\u159A\\u159B\\u159C\\u159D\\u159E\\u159F\\u15A0\\u15A1\\u15A2\\u15A3\\u15A4\\u15A5\\u15A6\\u15A7\\u15A8\\u15A9\\u15AA\\u15AB\\u15AC\\u15AD\\u15AE\\u15AF\\u15B0\\u15B1\\u15B2\\u15B3\\u15B4\\u15B5\\u15B6\\u15B7\\u15B8\\u15B9\\u15BA\\u15BB\\u15BC\\u15BD\\u15BE\\u15BF\\u15C0\\u15C1\\u15C2\\u15C3\\u15C4\\u15C5\\u15C6\\u15C7\\u15C8\\u15C9\\u15CA\\u15CB\\u15CC\\u15CD\\u15CE\\u15CF\\u15D0\\u15D1\\u15D2\\u15D3\\u15D4\\u15D5\\u15D6\\u15D7\\u15D8\\u15D9\\u15DA\\u15DB\\u15DC\\u15DD\\u15DE\\u15DF\\u15E0\\u15E1\\u15E2\\u15E3\\u15E4\\u15E5\\u15E6\\u15E7\\u15E8\\u15E9\\u15EA\\u15EB\\u15EC\\u15ED\\u15EE\\u15EF\\u15F0\\u15F1\\u15F2\\u15F3\\u15F4\\u15F5\\u15F6\\u15F7\\u15F8\\u15F9\\u15FA\\u15FB\\u15FC\\u15FD\\u15FE\\u15FF\\u1600\\u1601\\u1602\\u1603\\u1604\\u1605\\u1606\\u1607\\u1608\\u1609\\u160A\\u160B\\u160C\\u160D\\u160E\\u160F\\u1610\\u1611\\u1612\\u1613\\u1614\\u1615\\u1616\\u1617\\u1618\\u1619\\u161A\\u161B\\u161C\\u161D\\u161E\\u161F\\u1620\\u1621\\u1622\\u1623\\u1624\\u1625\\u1626\\u1627\\u1628\\u1629\\u162A\\u162B\\u162C\\u162D\\u162E\\u162F\\u1630\\u1631\\u1632\\u1633\\u1634\\u1635\\u1636\\u1637\\u1638\\u1639\\u163A\\u163B\\u163C\\u163D\\u163E\\u163F\\u1640\\u1641\\u1642\\u1643\\u1644\\u1645\\u1646\\u1647\\u1648\\u1649\\u164A\\u164B\\u164C\\u164D\\u164E\\u164F\\u1650\\u1651\\u1652\\u1653\\u1654\\u1655\\u1656\\u1657\\u1658\\u1659\\u165A\\u165B\\u165C\\u165D\\u165E\\u165F\\u1660\\u1661\\u1662\\u1663\\u1664\\u1665\\u1666\\u1667\\u1668\\u1669\\u166A\\u166B\\u166C\\u166F\\u1670\\u1671\\u1672\\u1673\\u1674\\u1675\\u1676\\u1681\\u1682\\u1683\\u1684\\u1685\\u1686\\u1687\\u1688\\u1689\\u168A\\u168B\\u168C\\u168D\\u168E\\u168F\\u1690\\u1691\\u1692\\u1693\\u1694\\u1695\\u1696\\u1697\\u1698\\u1699\\u169A\\u16A0\\u16A1\\u16A2\\u16A3\\u16A4\\u16A5\\u16A6\\u16A7\\u16A8\\u16A9\\u16AA\\u16AB\\u16AC\\u16AD\\u16AE\\u16AF\\u16B0\\u16B1\\u16B2\\u16B3\\u16B4\\u16B5\\u16B6\\u16B7\\u16B8\\u16B9\\u16BA\\u16BB\\u16BC\\u16BD\\u16BE\\u16BF\\u16C0\\u16C1\\u16C2\\u16C3\\u16C4\\u16C5\\u16C6\\u16C7\\u16C8\\u16C9\\u16CA\\u16CB\\u16CC\\u16CD\\u16CE\\u16CF\\u16D0\\u16D1\\u16D2\\u16D3\\u16D4\\u16D5\\u16D6\\u16D7\\u16D8\\u16D9\\u16DA\\u16DB\\u16DC\\u16DD\\u16DE\\u16DF\\u16E0\\u16E1\\u16E2\\u16E3\\u16E4\\u16E5\\u16E6\\u16E7\\u16E8\\u16E9\\u16EA\\u1700\\u1701\\u1702\\u1703\\u1704\\u1705\\u1706\\u1707\\u1708\\u1709\\u170A\\u170B\\u170C\\u170E\\u170F\\u1710\\u1711\\u1720\\u1721\\u1722\\u1723\\u1724\\u1725\\u1726\\u1727\\u1728\\u1729\\u172A\\u172B\\u172C\\u172D\\u172E\\u172F\\u1730\\u1731\\u1740\\u1741\\u1742\\u1743\\u1744\\u1745\\u1746\\u1747\\u1748\\u1749\\u174A\\u174B\\u174C\\u174D\\u174E\\u174F\\u1750\\u1751\\u1760\\u1761\\u1762\\u1763\\u1764\\u1765\\u1766\\u1767\\u1768\\u1769\\u176A\\u176B\\u176C\\u176E\\u176F\\u1770\\u1780\\u1781\\u1782\\u1783\\u1784\\u1785\\u1786\\u1787\\u1788\\u1789\\u178A\\u178B\\u178C\\u178D\\u178E\\u178F\\u1790\\u1791\\u1792\\u1793\\u1794\\u1795\\u1796\\u1797\\u1798\\u1799\\u179A\\u179B\\u179C\\u179D\\u179E\\u179F\\u17A0\\u17A1\\u17A2\\u17A3\\u17A4\\u17A5\\u17A6\\u17A7\\u17A8\\u17A9\\u17AA\\u17AB\\u17AC\\u17AD\\u17AE\\u17AF\\u17B0\\u17B1\\u17B2\\u17B3\\u17DC\\u1820\\u1821\\u1822\\u1823\\u1824\\u1825\\u1826\\u1827\\u1828\\u1829\\u182A\\u182B\\u182C\\u182D\\u182E\\u182F\\u1830\\u1831\\u1832\\u1833\\u1834\\u1835\\u1836\\u1837\\u1838\\u1839\\u183A\\u183B\\u183C\\u183D\\u183E\\u183F\\u1840\\u1841\\u1842\\u1844\\u1845\\u1846\\u1847\\u1848\\u1849\\u184A\\u184B\\u184C\\u184D\\u184E\\u184F\\u1850\\u1851\\u1852\\u1853\\u1854\\u1855\\u1856\\u1857\\u1858\\u1859\\u185A\\u185B\\u185C\\u185D\\u185E\\u185F\\u1860\\u1861\\u1862\\u1863\\u1864\\u1865\\u1866\\u1867\\u1868\\u1869\\u186A\\u186B\\u186C\\u186D\\u186E\\u186F\\u1870\\u1871\\u1872\\u1873\\u1874\\u1875\\u1876\\u1877\\u1880\\u1881\\u1882\\u1883\\u1884\\u1885\\u1886\\u1887\\u1888\\u1889\\u188A\\u188B\\u188C\\u188D\\u188E\\u188F\\u1890\\u1891\\u1892\\u1893\\u1894\\u1895\\u1896\\u1897\\u1898\\u1899\\u189A\\u189B\\u189C\\u189D\\u189E\\u189F\\u18A0\\u18A1\\u18A2\\u18A3\\u18A4\\u18A5\\u18A6\\u18A7\\u18A8\\u18AA\\u1900\\u1901\\u1902\\u1903\\u1904\\u1905\\u1906\\u1907\\u1908\\u1909\\u190A\\u190B\\u190C\\u190D\\u190E\\u190F\\u1910\\u1911\\u1912\\u1913\\u1914\\u1915\\u1916\\u1917\\u1918\\u1919\\u191A\\u191B\\u191C\\u1950\\u1951\\u1952\\u1953\\u1954\\u1955\\u1956\\u1957\\u1958\\u1959\\u195A\\u195B\\u195C\\u195D\\u195E\\u195F\\u1960\\u1961\\u1962\\u1963\\u1964\\u1965\\u1966\\u1967\\u1968\\u1969\\u196A\\u196B\\u196C\\u196D\\u1970\\u1971\\u1972\\u1973\\u1974\\u1980\\u1981\\u1982\\u1983\\u1984\\u1985\\u1986\\u1987\\u1988\\u1989\\u198A\\u198B\\u198C\\u198D\\u198E\\u198F\\u1990\\u1991\\u1992\\u1993\\u1994\\u1995\\u1996\\u1997\\u1998\\u1999\\u199A\\u199B\\u199C\\u199D\\u199E\\u199F\\u19A0\\u19A1\\u19A2\\u19A3\\u19A4\\u19A5\\u19A6\\u19A7\\u19A8\\u19A9\\u19C1\\u19C2\\u19C3\\u19C4\\u19C5\\u19C6\\u19C7\\u1A00\\u1A01\\u1A02\\u1A03\\u1A04\\u1A05\\u1A06\\u1A07\\u1A08\\u1A09\\u1A0A\\u1A0B\\u1A0C\\u1A0D\\u1A0E\\u1A0F\\u1A10\\u1A11\\u1A12\\u1A13\\u1A14\\u1A15\\u1A16\\u1B05\\u1B06\\u1B07\\u1B08\\u1B09\\u1B0A\\u1B0B\\u1B0C\\u1B0D\\u1B0E\\u1B0F\\u1B10\\u1B11\\u1B12\\u1B13\\u1B14\\u1B15\\u1B16\\u1B17\\u1B18\\u1B19\\u1B1A\\u1B1B\\u1B1C\\u1B1D\\u1B1E\\u1B1F\\u1B20\\u1B21\\u1B22\\u1B23\\u1B24\\u1B25\\u1B26\\u1B27\\u1B28\\u1B29\\u1B2A\\u1B2B\\u1B2C\\u1B2D\\u1B2E\\u1B2F\\u1B30\\u1B31\\u1B32\\u1B33\\u1B45\\u1B46\\u1B47\\u1B48\\u1B49\\u1B4A\\u1B4B\\u1B83\\u1B84\\u1B85\\u1B86\\u1B87\\u1B88\\u1B89\\u1B8A\\u1B8B\\u1B8C\\u1B8D\\u1B8E\\u1B8F\\u1B90\\u1B91\\u1B92\\u1B93\\u1B94\\u1B95\\u1B96\\u1B97\\u1B98\\u1B99\\u1B9A\\u1B9B\\u1B9C\\u1B9D\\u1B9E\\u1B9F\\u1BA0\\u1BAE\\u1BAF\\u1C00\\u1C01\\u1C02\\u1C03\\u1C04\\u1C05\\u1C06\\u1C07\\u1C08\\u1C09\\u1C0A\\u1C0B\\u1C0C\\u1C0D\\u1C0E\\u1C0F\\u1C10\\u1C11\\u1C12\\u1C13\\u1C14\\u1C15\\u1C16\\u1C17\\u1C18\\u1C19\\u1C1A\\u1C1B\\u1C1C\\u1C1D\\u1C1E\\u1C1F\\u1C20\\u1C21\\u1C22\\u1C23\\u1C4D\\u1C4E\\u1C4F\\u1C5A\\u1C5B\\u1C5C\\u1C5D\\u1C5E\\u1C5F\\u1C60\\u1C61\\u1C62\\u1C63\\u1C64\\u1C65\\u1C66\\u1C67\\u1C68\\u1C69\\u1C6A\\u1C6B\\u1C6C\\u1C6D\\u1C6E\\u1C6F\\u1C70\\u1C71\\u1C72\\u1C73\\u1C74\\u1C75\\u1C76\\u1C77\\u2135\\u2136\\u2137\\u2138\\u2D30\\u2D31\\u2D32\\u2D33\\u2D34\\u2D35\\u2D36\\u2D37\\u2D38\\u2D39\\u2D3A\\u2D3B\\u2D3C\\u2D3D\\u2D3E\\u2D3F\\u2D40\\u2D41\\u2D42\\u2D43\\u2D44\\u2D45\\u2D46\\u2D47\\u2D48\\u2D49\\u2D4A\\u2D4B\\u2D4C\\u2D4D\\u2D4E\\u2D4F\\u2D50\\u2D51\\u2D52\\u2D53\\u2D54\\u2D55\\u2D56\\u2D57\\u2D58\\u2D59\\u2D5A\\u2D5B\\u2D5C\\u2D5D\\u2D5E\\u2D5F\\u2D60\\u2D61\\u2D62\\u2D63\\u2D64\\u2D65\\u2D80\\u2D81\\u2D82\\u2D83\\u2D84\\u2D85\\u2D86\\u2D87\\u2D88\\u2D89\\u2D8A\\u2D8B\\u2D8C\\u2D8D\\u2D8E\\u2D8F\\u2D90\\u2D91\\u2D92\\u2D93\\u2D94\\u2D95\\u2D96\\u2DA0\\u2DA1\\u2DA2\\u2DA3\\u2DA4\\u2DA5\\u2DA6\\u2DA8\\u2DA9\\u2DAA\\u2DAB\\u2DAC\\u2DAD\\u2DAE\\u2DB0\\u2DB1\\u2DB2\\u2DB3\\u2DB4\\u2DB5\\u2DB6\\u2DB8\\u2DB9\\u2DBA\\u2DBB\\u2DBC\\u2DBD\\u2DBE\\u2DC0\\u2DC1\\u2DC2\\u2DC3\\u2DC4\\u2DC5\\u2DC6\\u2DC8\\u2DC9\\u2DCA\\u2DCB\\u2DCC\\u2DCD\\u2DCE\\u2DD0\\u2DD1\\u2DD2\\u2DD3\\u2DD4\\u2DD5\\u2DD6\\u2DD8\\u2DD9\\u2DDA\\u2DDB\\u2DDC\\u2DDD\\u2DDE\\u3006\\u303C\\u3041\\u3042\\u3043\\u3044\\u3045\\u3046\\u3047\\u3048\\u3049\\u304A\\u304B\\u304C\\u304D\\u304E\\u304F\\u3050\\u3051\\u3052\\u3053\\u3054\\u3055\\u3056\\u3057\\u3058\\u3059\\u305A\\u305B\\u305C\\u305D\\u305E\\u305F\\u3060\\u3061\\u3062\\u3063\\u3064\\u3065\\u3066\\u3067\\u3068\\u3069\\u306A\\u306B\\u306C\\u306D\\u306E\\u306F\\u3070\\u3071\\u3072\\u3073\\u3074\\u3075\\u3076\\u3077\\u3078\\u3079\\u307A\\u307B\\u307C\\u307D\\u307E\\u307F\\u3080\\u3081\\u3082\\u3083\\u3084\\u3085\\u3086\\u3087\\u3088\\u3089\\u308A\\u308B\\u308C\\u308D\\u308E\\u308F\\u3090\\u3091\\u3092\\u3093\\u3094\\u3095\\u3096\\u309F\\u30A1\\u30A2\\u30A3\\u30A4\\u30A5\\u30A6\\u30A7\\u30A8\\u30A9\\u30AA\\u30AB\\u30AC\\u30AD\\u30AE\\u30AF\\u30B0\\u30B1\\u30B2\\u30B3\\u30B4\\u30B5\\u30B6\\u30B7\\u30B8\\u30B9\\u30BA\\u30BB\\u30BC\\u30BD\\u30BE\\u30BF\\u30C0\\u30C1\\u30C2\\u30C3\\u30C4\\u30C5\\u30C6\\u30C7\\u30C8\\u30C9\\u30CA\\u30CB\\u30CC\\u30CD\\u30CE\\u30CF\\u30D0\\u30D1\\u30D2\\u30D3\\u30D4\\u30D5\\u30D6\\u30D7\\u30D8\\u30D9\\u30DA\\u30DB\\u30DC\\u30DD\\u30DE\\u30DF\\u30E0\\u30E1\\u30E2\\u30E3\\u30E4\\u30E5\\u30E6\\u30E7\\u30E8\\u30E9\\u30EA\\u30EB\\u30EC\\u30ED\\u30EE\\u30EF\\u30F0\\u30F1\\u30F2\\u30F3\\u30F4\\u30F5\\u30F6\\u30F7\\u30F8\\u30F9\\u30FA\\u30FF\\u3105\\u3106\\u3107\\u3108\\u3109\\u310A\\u310B\\u310C\\u310D\\u310E\\u310F\\u3110\\u3111\\u3112\\u3113\\u3114\\u3115\\u3116\\u3117\\u3118\\u3119\\u311A\\u311B\\u311C\\u311D\\u311E\\u311F\\u3120\\u3121\\u3122\\u3123\\u3124\\u3125\\u3126\\u3127\\u3128\\u3129\\u312A\\u312B\\u312C\\u312D\\u3131\\u3132\\u3133\\u3134\\u3135\\u3136\\u3137\\u3138\\u3139\\u313A\\u313B\\u313C\\u313D\\u313E\\u313F\\u3140\\u3141\\u3142\\u3143\\u3144\\u3145\\u3146\\u3147\\u3148\\u3149\\u314A\\u314B\\u314C\\u314D\\u314E\\u314F\\u3150\\u3151\\u3152\\u3153\\u3154\\u3155\\u3156\\u3157\\u3158\\u3159\\u315A\\u315B\\u315C\\u315D\\u315E\\u315F\\u3160\\u3161\\u3162\\u3163\\u3164\\u3165\\u3166\\u3167\\u3168\\u3169\\u316A\\u316B\\u316C\\u316D\\u316E\\u316F\\u3170\\u3171\\u3172\\u3173\\u3174\\u3175\\u3176\\u3177\\u3178\\u3179\\u317A\\u317B\\u317C\\u317D\\u317E\\u317F\\u3180\\u3181\\u3182\\u3183\\u3184\\u3185\\u3186\\u3187\\u3188\\u3189\\u318A\\u318B\\u318C\\u318D\\u318E\\u31A0\\u31A1\\u31A2\\u31A3\\u31A4\\u31A5\\u31A6\\u31A7\\u31A8\\u31A9\\u31AA\\u31AB\\u31AC\\u31AD\\u31AE\\u31AF\\u31B0\\u31B1\\u31B2\\u31B3\\u31B4\\u31B5\\u31B6\\u31B7\\u31F0\\u31F1\\u31F2\\u31F3\\u31F4\\u31F5\\u31F6\\u31F7\\u31F8\\u31F9\\u31FA\\u31FB\\u31FC\\u31FD\\u31FE\\u31FF\\u3400\\u4DB5\\u4E00\\u9FC3\\uA000\\uA001\\uA002\\uA003\\uA004\\uA005\\uA006\\uA007\\uA008\\uA009\\uA00A\\uA00B\\uA00C\\uA00D\\uA00E\\uA00F\\uA010\\uA011\\uA012\\uA013\\uA014\\uA016\\uA017\\uA018\\uA019\\uA01A\\uA01B\\uA01C\\uA01D\\uA01E\\uA01F\\uA020\\uA021\\uA022\\uA023\\uA024\\uA025\\uA026\\uA027\\uA028\\uA029\\uA02A\\uA02B\\uA02C\\uA02D\\uA02E\\uA02F\\uA030\\uA031\\uA032\\uA033\\uA034\\uA035\\uA036\\uA037\\uA038\\uA039\\uA03A\\uA03B\\uA03C\\uA03D\\uA03E\\uA03F\\uA040\\uA041\\uA042\\uA043\\uA044\\uA045\\uA046\\uA047\\uA048\\uA049\\uA04A\\uA04B\\uA04C\\uA04D\\uA04E\\uA04F\\uA050\\uA051\\uA052\\uA053\\uA054\\uA055\\uA056\\uA057\\uA058\\uA059\\uA05A\\uA05B\\uA05C\\uA05D\\uA05E\\uA05F\\uA060\\uA061\\uA062\\uA063\\uA064\\uA065\\uA066\\uA067\\uA068\\uA069\\uA06A\\uA06B\\uA06C\\uA06D\\uA06E\\uA06F\\uA070\\uA071\\uA072\\uA073\\uA074\\uA075\\uA076\\uA077\\uA078\\uA079\\uA07A\\uA07B\\uA07C\\uA07D\\uA07E\\uA07F\\uA080\\uA081\\uA082\\uA083\\uA084\\uA085\\uA086\\uA087\\uA088\\uA089\\uA08A\\uA08B\\uA08C\\uA08D\\uA08E\\uA08F\\uA090\\uA091\\uA092\\uA093\\uA094\\uA095\\uA096\\uA097\\uA098\\uA099\\uA09A\\uA09B\\uA09C\\uA09D\\uA09E\\uA09F\\uA0A0\\uA0A1\\uA0A2\\uA0A3\\uA0A4\\uA0A5\\uA0A6\\uA0A7\\uA0A8\\uA0A9\\uA0AA\\uA0AB\\uA0AC\\uA0AD\\uA0AE\\uA0AF\\uA0B0\\uA0B1\\uA0B2\\uA0B3\\uA0B4\\uA0B5\\uA0B6\\uA0B7\\uA0B8\\uA0B9\\uA0BA\\uA0BB\\uA0BC\\uA0BD\\uA0BE\\uA0BF\\uA0C0\\uA0C1\\uA0C2\\uA0C3\\uA0C4\\uA0C5\\uA0C6\\uA0C7\\uA0C8\\uA0C9\\uA0CA\\uA0CB\\uA0CC\\uA0CD\\uA0CE\\uA0CF\\uA0D0\\uA0D1\\uA0D2\\uA0D3\\uA0D4\\uA0D5\\uA0D6\\uA0D7\\uA0D8\\uA0D9\\uA0DA\\uA0DB\\uA0DC\\uA0DD\\uA0DE\\uA0DF\\uA0E0\\uA0E1\\uA0E2\\uA0E3\\uA0E4\\uA0E5\\uA0E6\\uA0E7\\uA0E8\\uA0E9\\uA0EA\\uA0EB\\uA0EC\\uA0ED\\uA0EE\\uA0EF\\uA0F0\\uA0F1\\uA0F2\\uA0F3\\uA0F4\\uA0F5\\uA0F6\\uA0F7\\uA0F8\\uA0F9\\uA0FA\\uA0FB\\uA0FC\\uA0FD\\uA0FE\\uA0FF\\uA100\\uA101\\uA102\\uA103\\uA104\\uA105\\uA106\\uA107\\uA108\\uA109\\uA10A\\uA10B\\uA10C\\uA10D\\uA10E\\uA10F\\uA110\\uA111\\uA112\\uA113\\uA114\\uA115\\uA116\\uA117\\uA118\\uA119\\uA11A\\uA11B\\uA11C\\uA11D\\uA11E\\uA11F\\uA120\\uA121\\uA122\\uA123\\uA124\\uA125\\uA126\\uA127\\uA128\\uA129\\uA12A\\uA12B\\uA12C\\uA12D\\uA12E\\uA12F\\uA130\\uA131\\uA132\\uA133\\uA134\\uA135\\uA136\\uA137\\uA138\\uA139\\uA13A\\uA13B\\uA13C\\uA13D\\uA13E\\uA13F\\uA140\\uA141\\uA142\\uA143\\uA144\\uA145\\uA146\\uA147\\uA148\\uA149\\uA14A\\uA14B\\uA14C\\uA14D\\uA14E\\uA14F\\uA150\\uA151\\uA152\\uA153\\uA154\\uA155\\uA156\\uA157\\uA158\\uA159\\uA15A\\uA15B\\uA15C\\uA15D\\uA15E\\uA15F\\uA160\\uA161\\uA162\\uA163\\uA164\\uA165\\uA166\\uA167\\uA168\\uA169\\uA16A\\uA16B\\uA16C\\uA16D\\uA16E\\uA16F\\uA170\\uA171\\uA172\\uA173\\uA174\\uA175\\uA176\\uA177\\uA178\\uA179\\uA17A\\uA17B\\uA17C\\uA17D\\uA17E\\uA17F\\uA180\\uA181\\uA182\\uA183\\uA184\\uA185\\uA186\\uA187\\uA188\\uA189\\uA18A\\uA18B\\uA18C\\uA18D\\uA18E\\uA18F\\uA190\\uA191\\uA192\\uA193\\uA194\\uA195\\uA196\\uA197\\uA198\\uA199\\uA19A\\uA19B\\uA19C\\uA19D\\uA19E\\uA19F\\uA1A0\\uA1A1\\uA1A2\\uA1A3\\uA1A4\\uA1A5\\uA1A6\\uA1A7\\uA1A8\\uA1A9\\uA1AA\\uA1AB\\uA1AC\\uA1AD\\uA1AE\\uA1AF\\uA1B0\\uA1B1\\uA1B2\\uA1B3\\uA1B4\\uA1B5\\uA1B6\\uA1B7\\uA1B8\\uA1B9\\uA1BA\\uA1BB\\uA1BC\\uA1BD\\uA1BE\\uA1BF\\uA1C0\\uA1C1\\uA1C2\\uA1C3\\uA1C4\\uA1C5\\uA1C6\\uA1C7\\uA1C8\\uA1C9\\uA1CA\\uA1CB\\uA1CC\\uA1CD\\uA1CE\\uA1CF\\uA1D0\\uA1D1\\uA1D2\\uA1D3\\uA1D4\\uA1D5\\uA1D6\\uA1D7\\uA1D8\\uA1D9\\uA1DA\\uA1DB\\uA1DC\\uA1DD\\uA1DE\\uA1DF\\uA1E0\\uA1E1\\uA1E2\\uA1E3\\uA1E4\\uA1E5\\uA1E6\\uA1E7\\uA1E8\\uA1E9\\uA1EA\\uA1EB\\uA1EC\\uA1ED\\uA1EE\\uA1EF\\uA1F0\\uA1F1\\uA1F2\\uA1F3\\uA1F4\\uA1F5\\uA1F6\\uA1F7\\uA1F8\\uA1F9\\uA1FA\\uA1FB\\uA1FC\\uA1FD\\uA1FE\\uA1FF\\uA200\\uA201\\uA202\\uA203\\uA204\\uA205\\uA206\\uA207\\uA208\\uA209\\uA20A\\uA20B\\uA20C\\uA20D\\uA20E\\uA20F\\uA210\\uA211\\uA212\\uA213\\uA214\\uA215\\uA216\\uA217\\uA218\\uA219\\uA21A\\uA21B\\uA21C\\uA21D\\uA21E\\uA21F\\uA220\\uA221\\uA222\\uA223\\uA224\\uA225\\uA226\\uA227\\uA228\\uA229\\uA22A\\uA22B\\uA22C\\uA22D\\uA22E\\uA22F\\uA230\\uA231\\uA232\\uA233\\uA234\\uA235\\uA236\\uA237\\uA238\\uA239\\uA23A\\uA23B\\uA23C\\uA23D\\uA23E\\uA23F\\uA240\\uA241\\uA242\\uA243\\uA244\\uA245\\uA246\\uA247\\uA248\\uA249\\uA24A\\uA24B\\uA24C\\uA24D\\uA24E\\uA24F\\uA250\\uA251\\uA252\\uA253\\uA254\\uA255\\uA256\\uA257\\uA258\\uA259\\uA25A\\uA25B\\uA25C\\uA25D\\uA25E\\uA25F\\uA260\\uA261\\uA262\\uA263\\uA264\\uA265\\uA266\\uA267\\uA268\\uA269\\uA26A\\uA26B\\uA26C\\uA26D\\uA26E\\uA26F\\uA270\\uA271\\uA272\\uA273\\uA274\\uA275\\uA276\\uA277\\uA278\\uA279\\uA27A\\uA27B\\uA27C\\uA27D\\uA27E\\uA27F\\uA280\\uA281\\uA282\\uA283\\uA284\\uA285\\uA286\\uA287\\uA288\\uA289\\uA28A\\uA28B\\uA28C\\uA28D\\uA28E\\uA28F\\uA290\\uA291\\uA292\\uA293\\uA294\\uA295\\uA296\\uA297\\uA298\\uA299\\uA29A\\uA29B\\uA29C\\uA29D\\uA29E\\uA29F\\uA2A0\\uA2A1\\uA2A2\\uA2A3\\uA2A4\\uA2A5\\uA2A6\\uA2A7\\uA2A8\\uA2A9\\uA2AA\\uA2AB\\uA2AC\\uA2AD\\uA2AE\\uA2AF\\uA2B0\\uA2B1\\uA2B2\\uA2B3\\uA2B4\\uA2B5\\uA2B6\\uA2B7\\uA2B8\\uA2B9\\uA2BA\\uA2BB\\uA2BC\\uA2BD\\uA2BE\\uA2BF\\uA2C0\\uA2C1\\uA2C2\\uA2C3\\uA2C4\\uA2C5\\uA2C6\\uA2C7\\uA2C8\\uA2C9\\uA2CA\\uA2CB\\uA2CC\\uA2CD\\uA2CE\\uA2CF\\uA2D0\\uA2D1\\uA2D2\\uA2D3\\uA2D4\\uA2D5\\uA2D6\\uA2D7\\uA2D8\\uA2D9\\uA2DA\\uA2DB\\uA2DC\\uA2DD\\uA2DE\\uA2DF\\uA2E0\\uA2E1\\uA2E2\\uA2E3\\uA2E4\\uA2E5\\uA2E6\\uA2E7\\uA2E8\\uA2E9\\uA2EA\\uA2EB\\uA2EC\\uA2ED\\uA2EE\\uA2EF\\uA2F0\\uA2F1\\uA2F2\\uA2F3\\uA2F4\\uA2F5\\uA2F6\\uA2F7\\uA2F8\\uA2F9\\uA2FA\\uA2FB\\uA2FC\\uA2FD\\uA2FE\\uA2FF\\uA300\\uA301\\uA302\\uA303\\uA304\\uA305\\uA306\\uA307\\uA308\\uA309\\uA30A\\uA30B\\uA30C\\uA30D\\uA30E\\uA30F\\uA310\\uA311\\uA312\\uA313\\uA314\\uA315\\uA316\\uA317\\uA318\\uA319\\uA31A\\uA31B\\uA31C\\uA31D\\uA31E\\uA31F\\uA320\\uA321\\uA322\\uA323\\uA324\\uA325\\uA326\\uA327\\uA328\\uA329\\uA32A\\uA32B\\uA32C\\uA32D\\uA32E\\uA32F\\uA330\\uA331\\uA332\\uA333\\uA334\\uA335\\uA336\\uA337\\uA338\\uA339\\uA33A\\uA33B\\uA33C\\uA33D\\uA33E\\uA33F\\uA340\\uA341\\uA342\\uA343\\uA344\\uA345\\uA346\\uA347\\uA348\\uA349\\uA34A\\uA34B\\uA34C\\uA34D\\uA34E\\uA34F\\uA350\\uA351\\uA352\\uA353\\uA354\\uA355\\uA356\\uA357\\uA358\\uA359\\uA35A\\uA35B\\uA35C\\uA35D\\uA35E\\uA35F\\uA360\\uA361\\uA362\\uA363\\uA364\\uA365\\uA366\\uA367\\uA368\\uA369\\uA36A\\uA36B\\uA36C\\uA36D\\uA36E\\uA36F\\uA370\\uA371\\uA372\\uA373\\uA374\\uA375\\uA376\\uA377\\uA378\\uA379\\uA37A\\uA37B\\uA37C\\uA37D\\uA37E\\uA37F\\uA380\\uA381\\uA382\\uA383\\uA384\\uA385\\uA386\\uA387\\uA388\\uA389\\uA38A\\uA38B\\uA38C\\uA38D\\uA38E\\uA38F\\uA390\\uA391\\uA392\\uA393\\uA394\\uA395\\uA396\\uA397\\uA398\\uA399\\uA39A\\uA39B\\uA39C\\uA39D\\uA39E\\uA39F\\uA3A0\\uA3A1\\uA3A2\\uA3A3\\uA3A4\\uA3A5\\uA3A6\\uA3A7\\uA3A8\\uA3A9\\uA3AA\\uA3AB\\uA3AC\\uA3AD\\uA3AE\\uA3AF\\uA3B0\\uA3B1\\uA3B2\\uA3B3\\uA3B4\\uA3B5\\uA3B6\\uA3B7\\uA3B8\\uA3B9\\uA3BA\\uA3BB\\uA3BC\\uA3BD\\uA3BE\\uA3BF\\uA3C0\\uA3C1\\uA3C2\\uA3C3\\uA3C4\\uA3C5\\uA3C6\\uA3C7\\uA3C8\\uA3C9\\uA3CA\\uA3CB\\uA3CC\\uA3CD\\uA3CE\\uA3CF\\uA3D0\\uA3D1\\uA3D2\\uA3D3\\uA3D4\\uA3D5\\uA3D6\\uA3D7\\uA3D8\\uA3D9\\uA3DA\\uA3DB\\uA3DC\\uA3DD\\uA3DE\\uA3DF\\uA3E0\\uA3E1\\uA3E2\\uA3E3\\uA3E4\\uA3E5\\uA3E6\\uA3E7\\uA3E8\\uA3E9\\uA3EA\\uA3EB\\uA3EC\\uA3ED\\uA3EE\\uA3EF\\uA3F0\\uA3F1\\uA3F2\\uA3F3\\uA3F4\\uA3F5\\uA3F6\\uA3F7\\uA3F8\\uA3F9\\uA3FA\\uA3FB\\uA3FC\\uA3FD\\uA3FE\\uA3FF\\uA400\\uA401\\uA402\\uA403\\uA404\\uA405\\uA406\\uA407\\uA408\\uA409\\uA40A\\uA40B\\uA40C\\uA40D\\uA40E\\uA40F\\uA410\\uA411\\uA412\\uA413\\uA414\\uA415\\uA416\\uA417\\uA418\\uA419\\uA41A\\uA41B\\uA41C\\uA41D\\uA41E\\uA41F\\uA420\\uA421\\uA422\\uA423\\uA424\\uA425\\uA426\\uA427\\uA428\\uA429\\uA42A\\uA42B\\uA42C\\uA42D\\uA42E\\uA42F\\uA430\\uA431\\uA432\\uA433\\uA434\\uA435\\uA436\\uA437\\uA438\\uA439\\uA43A\\uA43B\\uA43C\\uA43D\\uA43E\\uA43F\\uA440\\uA441\\uA442\\uA443\\uA444\\uA445\\uA446\\uA447\\uA448\\uA449\\uA44A\\uA44B\\uA44C\\uA44D\\uA44E\\uA44F\\uA450\\uA451\\uA452\\uA453\\uA454\\uA455\\uA456\\uA457\\uA458\\uA459\\uA45A\\uA45B\\uA45C\\uA45D\\uA45E\\uA45F\\uA460\\uA461\\uA462\\uA463\\uA464\\uA465\\uA466\\uA467\\uA468\\uA469\\uA46A\\uA46B\\uA46C\\uA46D\\uA46E\\uA46F\\uA470\\uA471\\uA472\\uA473\\uA474\\uA475\\uA476\\uA477\\uA478\\uA479\\uA47A\\uA47B\\uA47C\\uA47D\\uA47E\\uA47F\\uA480\\uA481\\uA482\\uA483\\uA484\\uA485\\uA486\\uA487\\uA488\\uA489\\uA48A\\uA48B\\uA48C\\uA500\\uA501\\uA502\\uA503\\uA504\\uA505\\uA506\\uA507\\uA508\\uA509\\uA50A\\uA50B\\uA50C\\uA50D\\uA50E\\uA50F\\uA510\\uA511\\uA512\\uA513\\uA514\\uA515\\uA516\\uA517\\uA518\\uA519\\uA51A\\uA51B\\uA51C\\uA51D\\uA51E\\uA51F\\uA520\\uA521\\uA522\\uA523\\uA524\\uA525\\uA526\\uA527\\uA528\\uA529\\uA52A\\uA52B\\uA52C\\uA52D\\uA52E\\uA52F\\uA530\\uA531\\uA532\\uA533\\uA534\\uA535\\uA536\\uA537\\uA538\\uA539\\uA53A\\uA53B\\uA53C\\uA53D\\uA53E\\uA53F\\uA540\\uA541\\uA542\\uA543\\uA544\\uA545\\uA546\\uA547\\uA548\\uA549\\uA54A\\uA54B\\uA54C\\uA54D\\uA54E\\uA54F\\uA550\\uA551\\uA552\\uA553\\uA554\\uA555\\uA556\\uA557\\uA558\\uA559\\uA55A\\uA55B\\uA55C\\uA55D\\uA55E\\uA55F\\uA560\\uA561\\uA562\\uA563\\uA564\\uA565\\uA566\\uA567\\uA568\\uA569\\uA56A\\uA56B\\uA56C\\uA56D\\uA56E\\uA56F\\uA570\\uA571\\uA572\\uA573\\uA574\\uA575\\uA576\\uA577\\uA578\\uA579\\uA57A\\uA57B\\uA57C\\uA57D\\uA57E\\uA57F\\uA580\\uA581\\uA582\\uA583\\uA584\\uA585\\uA586\\uA587\\uA588\\uA589\\uA58A\\uA58B\\uA58C\\uA58D\\uA58E\\uA58F\\uA590\\uA591\\uA592\\uA593\\uA594\\uA595\\uA596\\uA597\\uA598\\uA599\\uA59A\\uA59B\\uA59C\\uA59D\\uA59E\\uA59F\\uA5A0\\uA5A1\\uA5A2\\uA5A3\\uA5A4\\uA5A5\\uA5A6\\uA5A7\\uA5A8\\uA5A9\\uA5AA\\uA5AB\\uA5AC\\uA5AD\\uA5AE\\uA5AF\\uA5B0\\uA5B1\\uA5B2\\uA5B3\\uA5B4\\uA5B5\\uA5B6\\uA5B7\\uA5B8\\uA5B9\\uA5BA\\uA5BB\\uA5BC\\uA5BD\\uA5BE\\uA5BF\\uA5C0\\uA5C1\\uA5C2\\uA5C3\\uA5C4\\uA5C5\\uA5C6\\uA5C7\\uA5C8\\uA5C9\\uA5CA\\uA5CB\\uA5CC\\uA5CD\\uA5CE\\uA5CF\\uA5D0\\uA5D1\\uA5D2\\uA5D3\\uA5D4\\uA5D5\\uA5D6\\uA5D7\\uA5D8\\uA5D9\\uA5DA\\uA5DB\\uA5DC\\uA5DD\\uA5DE\\uA5DF\\uA5E0\\uA5E1\\uA5E2\\uA5E3\\uA5E4\\uA5E5\\uA5E6\\uA5E7\\uA5E8\\uA5E9\\uA5EA\\uA5EB\\uA5EC\\uA5ED\\uA5EE\\uA5EF\\uA5F0\\uA5F1\\uA5F2\\uA5F3\\uA5F4\\uA5F5\\uA5F6\\uA5F7\\uA5F8\\uA5F9\\uA5FA\\uA5FB\\uA5FC\\uA5FD\\uA5FE\\uA5FF\\uA600\\uA601\\uA602\\uA603\\uA604\\uA605\\uA606\\uA607\\uA608\\uA609\\uA60A\\uA60B\\uA610\\uA611\\uA612\\uA613\\uA614\\uA615\\uA616\\uA617\\uA618\\uA619\\uA61A\\uA61B\\uA61C\\uA61D\\uA61E\\uA61F\\uA62A\\uA62B\\uA66E\\uA7FB\\uA7FC\\uA7FD\\uA7FE\\uA7FF\\uA800\\uA801\\uA803\\uA804\\uA805\\uA807\\uA808\\uA809\\uA80A\\uA80C\\uA80D\\uA80E\\uA80F\\uA810\\uA811\\uA812\\uA813\\uA814\\uA815\\uA816\\uA817\\uA818\\uA819\\uA81A\\uA81B\\uA81C\\uA81D\\uA81E\\uA81F\\uA820\\uA821\\uA822\\uA840\\uA841\\uA842\\uA843\\uA844\\uA845\\uA846\\uA847\\uA848\\uA849\\uA84A\\uA84B\\uA84C\\uA84D\\uA84E\\uA84F\\uA850\\uA851\\uA852\\uA853\\uA854\\uA855\\uA856\\uA857\\uA858\\uA859\\uA85A\\uA85B\\uA85C\\uA85D\\uA85E\\uA85F\\uA860\\uA861\\uA862\\uA863\\uA864\\uA865\\uA866\\uA867\\uA868\\uA869\\uA86A\\uA86B\\uA86C\\uA86D\\uA86E\\uA86F\\uA870\\uA871\\uA872\\uA873\\uA882\\uA883\\uA884\\uA885\\uA886\\uA887\\uA888\\uA889\\uA88A\\uA88B\\uA88C\\uA88D\\uA88E\\uA88F\\uA890\\uA891\\uA892\\uA893\\uA894\\uA895\\uA896\\uA897\\uA898\\uA899\\uA89A\\uA89B\\uA89C\\uA89D\\uA89E\\uA89F\\uA8A0\\uA8A1\\uA8A2\\uA8A3\\uA8A4\\uA8A5\\uA8A6\\uA8A7\\uA8A8\\uA8A9\\uA8AA\\uA8AB\\uA8AC\\uA8AD\\uA8AE\\uA8AF\\uA8B0\\uA8B1\\uA8B2\\uA8B3\\uA90A\\uA90B\\uA90C\\uA90D\\uA90E\\uA90F\\uA910\\uA911\\uA912\\uA913\\uA914\\uA915\\uA916\\uA917\\uA918\\uA919\\uA91A\\uA91B\\uA91C\\uA91D\\uA91E\\uA91F\\uA920\\uA921\\uA922\\uA923\\uA924\\uA925\\uA930\\uA931\\uA932\\uA933\\uA934\\uA935\\uA936\\uA937\\uA938\\uA939\\uA93A\\uA93B\\uA93C\\uA93D\\uA93E\\uA93F\\uA940\\uA941\\uA942\\uA943\\uA944\\uA945\\uA946\\uAA00\\uAA01\\uAA02\\uAA03\\uAA04\\uAA05\\uAA06\\uAA07\\uAA08\\uAA09\\uAA0A\\uAA0B\\uAA0C\\uAA0D\\uAA0E\\uAA0F\\uAA10\\uAA11\\uAA12\\uAA13\\uAA14\\uAA15\\uAA16\\uAA17\\uAA18\\uAA19\\uAA1A\\uAA1B\\uAA1C\\uAA1D\\uAA1E\\uAA1F\\uAA20\\uAA21\\uAA22\\uAA23\\uAA24\\uAA25\\uAA26\\uAA27\\uAA28\\uAA40\\uAA41\\uAA42\\uAA44\\uAA45\\uAA46\\uAA47\\uAA48\\uAA49\\uAA4A\\uAA4B\\uAC00\\uD7A3\\uF900\\uF901\\uF902\\uF903\\uF904\\uF905\\uF906\\uF907\\uF908\\uF909\\uF90A\\uF90B\\uF90C\\uF90D\\uF90E\\uF90F\\uF910\\uF911\\uF912\\uF913\\uF914\\uF915\\uF916\\uF917\\uF918\\uF919\\uF91A\\uF91B\\uF91C\\uF91D\\uF91E\\uF91F\\uF920\\uF921\\uF922\\uF923\\uF924\\uF925\\uF926\\uF927\\uF928\\uF929\\uF92A\\uF92B\\uF92C\\uF92D\\uF92E\\uF92F\\uF930\\uF931\\uF932\\uF933\\uF934\\uF935\\uF936\\uF937\\uF938\\uF939\\uF93A\\uF93B\\uF93C\\uF93D\\uF93E\\uF93F\\uF940\\uF941\\uF942\\uF943\\uF944\\uF945\\uF946\\uF947\\uF948\\uF949\\uF94A\\uF94B\\uF94C\\uF94D\\uF94E\\uF94F\\uF950\\uF951\\uF952\\uF953\\uF954\\uF955\\uF956\\uF957\\uF958\\uF959\\uF95A\\uF95B\\uF95C\\uF95D\\uF95E\\uF95F\\uF960\\uF961\\uF962\\uF963\\uF964\\uF965\\uF966\\uF967\\uF968\\uF969\\uF96A\\uF96B\\uF96C\\uF96D\\uF96E\\uF96F\\uF970\\uF971\\uF972\\uF973\\uF974\\uF975\\uF976\\uF977\\uF978\\uF979\\uF97A\\uF97B\\uF97C\\uF97D\\uF97E\\uF97F\\uF980\\uF981\\uF982\\uF983\\uF984\\uF985\\uF986\\uF987\\uF988\\uF989\\uF98A\\uF98B\\uF98C\\uF98D\\uF98E\\uF98F\\uF990\\uF991\\uF992\\uF993\\uF994\\uF995\\uF996\\uF997\\uF998\\uF999\\uF99A\\uF99B\\uF99C\\uF99D\\uF99E\\uF99F\\uF9A0\\uF9A1\\uF9A2\\uF9A3\\uF9A4\\uF9A5\\uF9A6\\uF9A7\\uF9A8\\uF9A9\\uF9AA\\uF9AB\\uF9AC\\uF9AD\\uF9AE\\uF9AF\\uF9B0\\uF9B1\\uF9B2\\uF9B3\\uF9B4\\uF9B5\\uF9B6\\uF9B7\\uF9B8\\uF9B9\\uF9BA\\uF9BB\\uF9BC\\uF9BD\\uF9BE\\uF9BF\\uF9C0\\uF9C1\\uF9C2\\uF9C3\\uF9C4\\uF9C5\\uF9C6\\uF9C7\\uF9C8\\uF9C9\\uF9CA\\uF9CB\\uF9CC\\uF9CD\\uF9CE\\uF9CF\\uF9D0\\uF9D1\\uF9D2\\uF9D3\\uF9D4\\uF9D5\\uF9D6\\uF9D7\\uF9D8\\uF9D9\\uF9DA\\uF9DB\\uF9DC\\uF9DD\\uF9DE\\uF9DF\\uF9E0\\uF9E1\\uF9E2\\uF9E3\\uF9E4\\uF9E5\\uF9E6\\uF9E7\\uF9E8\\uF9E9\\uF9EA\\uF9EB\\uF9EC\\uF9ED\\uF9EE\\uF9EF\\uF9F0\\uF9F1\\uF9F2\\uF9F3\\uF9F4\\uF9F5\\uF9F6\\uF9F7\\uF9F8\\uF9F9\\uF9FA\\uF9FB\\uF9FC\\uF9FD\\uF9FE\\uF9FF\\uFA00\\uFA01\\uFA02\\uFA03\\uFA04\\uFA05\\uFA06\\uFA07\\uFA08\\uFA09\\uFA0A\\uFA0B\\uFA0C\\uFA0D\\uFA0E\\uFA0F\\uFA10\\uFA11\\uFA12\\uFA13\\uFA14\\uFA15\\uFA16\\uFA17\\uFA18\\uFA19\\uFA1A\\uFA1B\\uFA1C\\uFA1D\\uFA1E\\uFA1F\\uFA20\\uFA21\\uFA22\\uFA23\\uFA24\\uFA25\\uFA26\\uFA27\\uFA28\\uFA29\\uFA2A\\uFA2B\\uFA2C\\uFA2D\\uFA30\\uFA31\\uFA32\\uFA33\\uFA34\\uFA35\\uFA36\\uFA37\\uFA38\\uFA39\\uFA3A\\uFA3B\\uFA3C\\uFA3D\\uFA3E\\uFA3F\\uFA40\\uFA41\\uFA42\\uFA43\\uFA44\\uFA45\\uFA46\\uFA47\\uFA48\\uFA49\\uFA4A\\uFA4B\\uFA4C\\uFA4D\\uFA4E\\uFA4F\\uFA50\\uFA51\\uFA52\\uFA53\\uFA54\\uFA55\\uFA56\\uFA57\\uFA58\\uFA59\\uFA5A\\uFA5B\\uFA5C\\uFA5D\\uFA5E\\uFA5F\\uFA60\\uFA61\\uFA62\\uFA63\\uFA64\\uFA65\\uFA66\\uFA67\\uFA68\\uFA69\\uFA6A\\uFA70\\uFA71\\uFA72\\uFA73\\uFA74\\uFA75\\uFA76\\uFA77\\uFA78\\uFA79\\uFA7A\\uFA7B\\uFA7C\\uFA7D\\uFA7E\\uFA7F\\uFA80\\uFA81\\uFA82\\uFA83\\uFA84\\uFA85\\uFA86\\uFA87\\uFA88\\uFA89\\uFA8A\\uFA8B\\uFA8C\\uFA8D\\uFA8E\\uFA8F\\uFA90\\uFA91\\uFA92\\uFA93\\uFA94\\uFA95\\uFA96\\uFA97\\uFA98\\uFA99\\uFA9A\\uFA9B\\uFA9C\\uFA9D\\uFA9E\\uFA9F\\uFAA0\\uFAA1\\uFAA2\\uFAA3\\uFAA4\\uFAA5\\uFAA6\\uFAA7\\uFAA8\\uFAA9\\uFAAA\\uFAAB\\uFAAC\\uFAAD\\uFAAE\\uFAAF\\uFAB0\\uFAB1\\uFAB2\\uFAB3\\uFAB4\\uFAB5\\uFAB6\\uFAB7\\uFAB8\\uFAB9\\uFABA\\uFABB\\uFABC\\uFABD\\uFABE\\uFABF\\uFAC0\\uFAC1\\uFAC2\\uFAC3\\uFAC4\\uFAC5\\uFAC6\\uFAC7\\uFAC8\\uFAC9\\uFACA\\uFACB\\uFACC\\uFACD\\uFACE\\uFACF\\uFAD0\\uFAD1\\uFAD2\\uFAD3\\uFAD4\\uFAD5\\uFAD6\\uFAD7\\uFAD8\\uFAD9\\uFB1D\\uFB1F\\uFB20\\uFB21\\uFB22\\uFB23\\uFB24\\uFB25\\uFB26\\uFB27\\uFB28\\uFB2A\\uFB2B\\uFB2C\\uFB2D\\uFB2E\\uFB2F\\uFB30\\uFB31\\uFB32\\uFB33\\uFB34\\uFB35\\uFB36\\uFB38\\uFB39\\uFB3A\\uFB3B\\uFB3C\\uFB3E\\uFB40\\uFB41\\uFB43\\uFB44\\uFB46\\uFB47\\uFB48\\uFB49\\uFB4A\\uFB4B\\uFB4C\\uFB4D\\uFB4E\\uFB4F\\uFB50\\uFB51\\uFB52\\uFB53\\uFB54\\uFB55\\uFB56\\uFB57\\uFB58\\uFB59\\uFB5A\\uFB5B\\uFB5C\\uFB5D\\uFB5E\\uFB5F\\uFB60\\uFB61\\uFB62\\uFB63\\uFB64\\uFB65\\uFB66\\uFB67\\uFB68\\uFB69\\uFB6A\\uFB6B\\uFB6C\\uFB6D\\uFB6E\\uFB6F\\uFB70\\uFB71\\uFB72\\uFB73\\uFB74\\uFB75\\uFB76\\uFB77\\uFB78\\uFB79\\uFB7A\\uFB7B\\uFB7C\\uFB7D\\uFB7E\\uFB7F\\uFB80\\uFB81\\uFB82\\uFB83\\uFB84\\uFB85\\uFB86\\uFB87\\uFB88\\uFB89\\uFB8A\\uFB8B\\uFB8C\\uFB8D\\uFB8E\\uFB8F\\uFB90\\uFB91\\uFB92\\uFB93\\uFB94\\uFB95\\uFB96\\uFB97\\uFB98\\uFB99\\uFB9A\\uFB9B\\uFB9C\\uFB9D\\uFB9E\\uFB9F\\uFBA0\\uFBA1\\uFBA2\\uFBA3\\uFBA4\\uFBA5\\uFBA6\\uFBA7\\uFBA8\\uFBA9\\uFBAA\\uFBAB\\uFBAC\\uFBAD\\uFBAE\\uFBAF\\uFBB0\\uFBB1\\uFBD3\\uFBD4\\uFBD5\\uFBD6\\uFBD7\\uFBD8\\uFBD9\\uFBDA\\uFBDB\\uFBDC\\uFBDD\\uFBDE\\uFBDF\\uFBE0\\uFBE1\\uFBE2\\uFBE3\\uFBE4\\uFBE5\\uFBE6\\uFBE7\\uFBE8\\uFBE9\\uFBEA\\uFBEB\\uFBEC\\uFBED\\uFBEE\\uFBEF\\uFBF0\\uFBF1\\uFBF2\\uFBF3\\uFBF4\\uFBF5\\uFBF6\\uFBF7\\uFBF8\\uFBF9\\uFBFA\\uFBFB\\uFBFC\\uFBFD\\uFBFE\\uFBFF\\uFC00\\uFC01\\uFC02\\uFC03\\uFC04\\uFC05\\uFC06\\uFC07\\uFC08\\uFC09\\uFC0A\\uFC0B\\uFC0C\\uFC0D\\uFC0E\\uFC0F\\uFC10\\uFC11\\uFC12\\uFC13\\uFC14\\uFC15\\uFC16\\uFC17\\uFC18\\uFC19\\uFC1A\\uFC1B\\uFC1C\\uFC1D\\uFC1E\\uFC1F\\uFC20\\uFC21\\uFC22\\uFC23\\uFC24\\uFC25\\uFC26\\uFC27\\uFC28\\uFC29\\uFC2A\\uFC2B\\uFC2C\\uFC2D\\uFC2E\\uFC2F\\uFC30\\uFC31\\uFC32\\uFC33\\uFC34\\uFC35\\uFC36\\uFC37\\uFC38\\uFC39\\uFC3A\\uFC3B\\uFC3C\\uFC3D\\uFC3E\\uFC3F\\uFC40\\uFC41\\uFC42\\uFC43\\uFC44\\uFC45\\uFC46\\uFC47\\uFC48\\uFC49\\uFC4A\\uFC4B\\uFC4C\\uFC4D\\uFC4E\\uFC4F\\uFC50\\uFC51\\uFC52\\uFC53\\uFC54\\uFC55\\uFC56\\uFC57\\uFC58\\uFC59\\uFC5A\\uFC5B\\uFC5C\\uFC5D\\uFC5E\\uFC5F\\uFC60\\uFC61\\uFC62\\uFC63\\uFC64\\uFC65\\uFC66\\uFC67\\uFC68\\uFC69\\uFC6A\\uFC6B\\uFC6C\\uFC6D\\uFC6E\\uFC6F\\uFC70\\uFC71\\uFC72\\uFC73\\uFC74\\uFC75\\uFC76\\uFC77\\uFC78\\uFC79\\uFC7A\\uFC7B\\uFC7C\\uFC7D\\uFC7E\\uFC7F\\uFC80\\uFC81\\uFC82\\uFC83\\uFC84\\uFC85\\uFC86\\uFC87\\uFC88\\uFC89\\uFC8A\\uFC8B\\uFC8C\\uFC8D\\uFC8E\\uFC8F\\uFC90\\uFC91\\uFC92\\uFC93\\uFC94\\uFC95\\uFC96\\uFC97\\uFC98\\uFC99\\uFC9A\\uFC9B\\uFC9C\\uFC9D\\uFC9E\\uFC9F\\uFCA0\\uFCA1\\uFCA2\\uFCA3\\uFCA4\\uFCA5\\uFCA6\\uFCA7\\uFCA8\\uFCA9\\uFCAA\\uFCAB\\uFCAC\\uFCAD\\uFCAE\\uFCAF\\uFCB0\\uFCB1\\uFCB2\\uFCB3\\uFCB4\\uFCB5\\uFCB6\\uFCB7\\uFCB8\\uFCB9\\uFCBA\\uFCBB\\uFCBC\\uFCBD\\uFCBE\\uFCBF\\uFCC0\\uFCC1\\uFCC2\\uFCC3\\uFCC4\\uFCC5\\uFCC6\\uFCC7\\uFCC8\\uFCC9\\uFCCA\\uFCCB\\uFCCC\\uFCCD\\uFCCE\\uFCCF\\uFCD0\\uFCD1\\uFCD2\\uFCD3\\uFCD4\\uFCD5\\uFCD6\\uFCD7\\uFCD8\\uFCD9\\uFCDA\\uFCDB\\uFCDC\\uFCDD\\uFCDE\\uFCDF\\uFCE0\\uFCE1\\uFCE2\\uFCE3\\uFCE4\\uFCE5\\uFCE6\\uFCE7\\uFCE8\\uFCE9\\uFCEA\\uFCEB\\uFCEC\\uFCED\\uFCEE\\uFCEF\\uFCF0\\uFCF1\\uFCF2\\uFCF3\\uFCF4\\uFCF5\\uFCF6\\uFCF7\\uFCF8\\uFCF9\\uFCFA\\uFCFB\\uFCFC\\uFCFD\\uFCFE\\uFCFF\\uFD00\\uFD01\\uFD02\\uFD03\\uFD04\\uFD05\\uFD06\\uFD07\\uFD08\\uFD09\\uFD0A\\uFD0B\\uFD0C\\uFD0D\\uFD0E\\uFD0F\\uFD10\\uFD11\\uFD12\\uFD13\\uFD14\\uFD15\\uFD16\\uFD17\\uFD18\\uFD19\\uFD1A\\uFD1B\\uFD1C\\uFD1D\\uFD1E\\uFD1F\\uFD20\\uFD21\\uFD22\\uFD23\\uFD24\\uFD25\\uFD26\\uFD27\\uFD28\\uFD29\\uFD2A\\uFD2B\\uFD2C\\uFD2D\\uFD2E\\uFD2F\\uFD30\\uFD31\\uFD32\\uFD33\\uFD34\\uFD35\\uFD36\\uFD37\\uFD38\\uFD39\\uFD3A\\uFD3B\\uFD3C\\uFD3D\\uFD50\\uFD51\\uFD52\\uFD53\\uFD54\\uFD55\\uFD56\\uFD57\\uFD58\\uFD59\\uFD5A\\uFD5B\\uFD5C\\uFD5D\\uFD5E\\uFD5F\\uFD60\\uFD61\\uFD62\\uFD63\\uFD64\\uFD65\\uFD66\\uFD67\\uFD68\\uFD69\\uFD6A\\uFD6B\\uFD6C\\uFD6D\\uFD6E\\uFD6F\\uFD70\\uFD71\\uFD72\\uFD73\\uFD74\\uFD75\\uFD76\\uFD77\\uFD78\\uFD79\\uFD7A\\uFD7B\\uFD7C\\uFD7D\\uFD7E\\uFD7F\\uFD80\\uFD81\\uFD82\\uFD83\\uFD84\\uFD85\\uFD86\\uFD87\\uFD88\\uFD89\\uFD8A\\uFD8B\\uFD8C\\uFD8D\\uFD8E\\uFD8F\\uFD92\\uFD93\\uFD94\\uFD95\\uFD96\\uFD97\\uFD98\\uFD99\\uFD9A\\uFD9B\\uFD9C\\uFD9D\\uFD9E\\uFD9F\\uFDA0\\uFDA1\\uFDA2\\uFDA3\\uFDA4\\uFDA5\\uFDA6\\uFDA7\\uFDA8\\uFDA9\\uFDAA\\uFDAB\\uFDAC\\uFDAD\\uFDAE\\uFDAF\\uFDB0\\uFDB1\\uFDB2\\uFDB3\\uFDB4\\uFDB5\\uFDB6\\uFDB7\\uFDB8\\uFDB9\\uFDBA\\uFDBB\\uFDBC\\uFDBD\\uFDBE\\uFDBF\\uFDC0\\uFDC1\\uFDC2\\uFDC3\\uFDC4\\uFDC5\\uFDC6\\uFDC7\\uFDF0\\uFDF1\\uFDF2\\uFDF3\\uFDF4\\uFDF5\\uFDF6\\uFDF7\\uFDF8\\uFDF9\\uFDFA\\uFDFB\\uFE70\\uFE71\\uFE72\\uFE73\\uFE74\\uFE76\\uFE77\\uFE78\\uFE79\\uFE7A\\uFE7B\\uFE7C\\uFE7D\\uFE7E\\uFE7F\\uFE80\\uFE81\\uFE82\\uFE83\\uFE84\\uFE85\\uFE86\\uFE87\\uFE88\\uFE89\\uFE8A\\uFE8B\\uFE8C\\uFE8D\\uFE8E\\uFE8F\\uFE90\\uFE91\\uFE92\\uFE93\\uFE94\\uFE95\\uFE96\\uFE97\\uFE98\\uFE99\\uFE9A\\uFE9B\\uFE9C\\uFE9D\\uFE9E\\uFE9F\\uFEA0\\uFEA1\\uFEA2\\uFEA3\\uFEA4\\uFEA5\\uFEA6\\uFEA7\\uFEA8\\uFEA9\\uFEAA\\uFEAB\\uFEAC\\uFEAD\\uFEAE\\uFEAF\\uFEB0\\uFEB1\\uFEB2\\uFEB3\\uFEB4\\uFEB5\\uFEB6\\uFEB7\\uFEB8\\uFEB9\\uFEBA\\uFEBB\\uFEBC\\uFEBD\\uFEBE\\uFEBF\\uFEC0\\uFEC1\\uFEC2\\uFEC3\\uFEC4\\uFEC5\\uFEC6\\uFEC7\\uFEC8\\uFEC9\\uFECA\\uFECB\\uFECC\\uFECD\\uFECE\\uFECF\\uFED0\\uFED1\\uFED2\\uFED3\\uFED4\\uFED5\\uFED6\\uFED7\\uFED8\\uFED9\\uFEDA\\uFEDB\\uFEDC\\uFEDD\\uFEDE\\uFEDF\\uFEE0\\uFEE1\\uFEE2\\uFEE3\\uFEE4\\uFEE5\\uFEE6\\uFEE7\\uFEE8\\uFEE9\\uFEEA\\uFEEB\\uFEEC\\uFEED\\uFEEE\\uFEEF\\uFEF0\\uFEF1\\uFEF2\\uFEF3\\uFEF4\\uFEF5\\uFEF6\\uFEF7\\uFEF8\\uFEF9\\uFEFA\\uFEFB\\uFEFC\\uFF66\\uFF67\\uFF68\\uFF69\\uFF6A\\uFF6B\\uFF6C\\uFF6D\\uFF6E\\uFF6F\\uFF71\\uFF72\\uFF73\\uFF74\\uFF75\\uFF76\\uFF77\\uFF78\\uFF79\\uFF7A\\uFF7B\\uFF7C\\uFF7D\\uFF7E\\uFF7F\\uFF80\\uFF81\\uFF82\\uFF83\\uFF84\\uFF85\\uFF86\\uFF87\\uFF88\\uFF89\\uFF8A\\uFF8B\\uFF8C\\uFF8D\\uFF8E\\uFF8F\\uFF90\\uFF91\\uFF92\\uFF93\\uFF94\\uFF95\\uFF96\\uFF97\\uFF98\\uFF99\\uFF9A\\uFF9B\\uFF9C\\uFF9D\\uFFA0\\uFFA1\\uFFA2\\uFFA3\\uFFA4\\uFFA5\\uFFA6\\uFFA7\\uFFA8\\uFFA9\\uFFAA\\uFFAB\\uFFAC\\uFFAD\\uFFAE\\uFFAF\\uFFB0\\uFFB1\\uFFB2\\uFFB3\\uFFB4\\uFFB5\\uFFB6\\uFFB7\\uFFB8\\uFFB9\\uFFBA\\uFFBB\\uFFBC\\uFFBD\\uFFBE\\uFFC2\\uFFC3\\uFFC4\\uFFC5\\uFFC6\\uFFC7\\uFFCA\\uFFCB\\uFFCC\\uFFCD\\uFFCE\\uFFCF\\uFFD2\\uFFD3\\uFFD4\\uFFD5\\uFFD6\\uFFD7\\uFFDA\\uFFDB\\uFFDC]");
          }
        }
        return result0;
      }
      
      function parse_Lt() {
        var result0;
        
        if (/^[\u01C5\u01C8\u01CB\u01F2\u1F88\u1F89\u1F8A\u1F8B\u1F8C\u1F8D\u1F8E\u1F8F\u1F98\u1F99\u1F9A\u1F9B\u1F9C\u1F9D\u1F9E\u1F9F\u1FA8\u1FA9\u1FAA\u1FAB\u1FAC\u1FAD\u1FAE\u1FAF\u1FBC\u1FCC\u1FFC]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u01C5\\u01C8\\u01CB\\u01F2\\u1F88\\u1F89\\u1F8A\\u1F8B\\u1F8C\\u1F8D\\u1F8E\\u1F8F\\u1F98\\u1F99\\u1F9A\\u1F9B\\u1F9C\\u1F9D\\u1F9E\\u1F9F\\u1FA8\\u1FA9\\u1FAA\\u1FAB\\u1FAC\\u1FAD\\u1FAE\\u1FAF\\u1FBC\\u1FCC\\u1FFC]");
          }
        }
        return result0;
      }
      
      function parse_Lu() {
        var result0;
        
        if (/^[ABCDEFGHIJKLMNOPQRSTUVWXYZ\xC0\xC1\xC2\xC3\xC4\xC5\xC6\xC7\xC8\xC9\xCA\xCB\xCC\xCD\xCE\xCF\xD0\xD1\xD2\xD3\xD4\xD5\xD6\xD8\xD9\xDA\xDB\xDC\xDD\xDE\u0100\u0102\u0104\u0106\u0108\u010A\u010C\u010E\u0110\u0112\u0114\u0116\u0118\u011A\u011C\u011E\u0120\u0122\u0124\u0126\u0128\u012A\u012C\u012E\u0130\u0132\u0134\u0136\u0139\u013B\u013D\u013F\u0141\u0143\u0145\u0147\u014A\u014C\u014E\u0150\u0152\u0154\u0156\u0158\u015A\u015C\u015E\u0160\u0162\u0164\u0166\u0168\u016A\u016C\u016E\u0170\u0172\u0174\u0176\u0178\u0179\u017B\u017D\u0181\u0182\u0184\u0186\u0187\u0189\u018A\u018B\u018E\u018F\u0190\u0191\u0193\u0194\u0196\u0197\u0198\u019C\u019D\u019F\u01A0\u01A2\u01A4\u01A6\u01A7\u01A9\u01AC\u01AE\u01AF\u01B1\u01B2\u01B3\u01B5\u01B7\u01B8\u01BC\u01C4\u01C7\u01CA\u01CD\u01CF\u01D1\u01D3\u01D5\u01D7\u01D9\u01DB\u01DE\u01E0\u01E2\u01E4\u01E6\u01E8\u01EA\u01EC\u01EE\u01F1\u01F4\u01F6\u01F7\u01F8\u01FA\u01FC\u01FE\u0200\u0202\u0204\u0206\u0208\u020A\u020C\u020E\u0210\u0212\u0214\u0216\u0218\u021A\u021C\u021E\u0220\u0222\u0224\u0226\u0228\u022A\u022C\u022E\u0230\u0232\u023A\u023B\u023D\u023E\u0241\u0243\u0244\u0245\u0246\u0248\u024A\u024C\u024E\u0370\u0372\u0376\u0386\u0388\u0389\u038A\u038C\u038E\u038F\u0391\u0392\u0393\u0394\u0395\u0396\u0397\u0398\u0399\u039A\u039B\u039C\u039D\u039E\u039F\u03A0\u03A1\u03A3\u03A4\u03A5\u03A6\u03A7\u03A8\u03A9\u03AA\u03AB\u03CF\u03D2\u03D3\u03D4\u03D8\u03DA\u03DC\u03DE\u03E0\u03E2\u03E4\u03E6\u03E8\u03EA\u03EC\u03EE\u03F4\u03F7\u03F9\u03FA\u03FD\u03FE\u03FF\u0400\u0401\u0402\u0403\u0404\u0405\u0406\u0407\u0408\u0409\u040A\u040B\u040C\u040D\u040E\u040F\u0410\u0411\u0412\u0413\u0414\u0415\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F\u0460\u0462\u0464\u0466\u0468\u046A\u046C\u046E\u0470\u0472\u0474\u0476\u0478\u047A\u047C\u047E\u0480\u048A\u048C\u048E\u0490\u0492\u0494\u0496\u0498\u049A\u049C\u049E\u04A0\u04A2\u04A4\u04A6\u04A8\u04AA\u04AC\u04AE\u04B0\u04B2\u04B4\u04B6\u04B8\u04BA\u04BC\u04BE\u04C0\u04C1\u04C3\u04C5\u04C7\u04C9\u04CB\u04CD\u04D0\u04D2\u04D4\u04D6\u04D8\u04DA\u04DC\u04DE\u04E0\u04E2\u04E4\u04E6\u04E8\u04EA\u04EC\u04EE\u04F0\u04F2\u04F4\u04F6\u04F8\u04FA\u04FC\u04FE\u0500\u0502\u0504\u0506\u0508\u050A\u050C\u050E\u0510\u0512\u0514\u0516\u0518\u051A\u051C\u051E\u0520\u0522\u0531\u0532\u0533\u0534\u0535\u0536\u0537\u0538\u0539\u053A\u053B\u053C\u053D\u053E\u053F\u0540\u0541\u0542\u0543\u0544\u0545\u0546\u0547\u0548\u0549\u054A\u054B\u054C\u054D\u054E\u054F\u0550\u0551\u0552\u0553\u0554\u0555\u0556\u10A0\u10A1\u10A2\u10A3\u10A4\u10A5\u10A6\u10A7\u10A8\u10A9\u10AA\u10AB\u10AC\u10AD\u10AE\u10AF\u10B0\u10B1\u10B2\u10B3\u10B4\u10B5\u10B6\u10B7\u10B8\u10B9\u10BA\u10BB\u10BC\u10BD\u10BE\u10BF\u10C0\u10C1\u10C2\u10C3\u10C4\u10C5\u1E00\u1E02\u1E04\u1E06\u1E08\u1E0A\u1E0C\u1E0E\u1E10\u1E12\u1E14\u1E16\u1E18\u1E1A\u1E1C\u1E1E\u1E20\u1E22\u1E24\u1E26\u1E28\u1E2A\u1E2C\u1E2E\u1E30\u1E32\u1E34\u1E36\u1E38\u1E3A\u1E3C\u1E3E\u1E40\u1E42\u1E44\u1E46\u1E48\u1E4A\u1E4C\u1E4E\u1E50\u1E52\u1E54\u1E56\u1E58\u1E5A\u1E5C\u1E5E\u1E60\u1E62\u1E64\u1E66\u1E68\u1E6A\u1E6C\u1E6E\u1E70\u1E72\u1E74\u1E76\u1E78\u1E7A\u1E7C\u1E7E\u1E80\u1E82\u1E84\u1E86\u1E88\u1E8A\u1E8C\u1E8E\u1E90\u1E92\u1E94\u1E9E\u1EA0\u1EA2\u1EA4\u1EA6\u1EA8\u1EAA\u1EAC\u1EAE\u1EB0\u1EB2\u1EB4\u1EB6\u1EB8\u1EBA\u1EBC\u1EBE\u1EC0\u1EC2\u1EC4\u1EC6\u1EC8\u1ECA\u1ECC\u1ECE\u1ED0\u1ED2\u1ED4\u1ED6\u1ED8\u1EDA\u1EDC\u1EDE\u1EE0\u1EE2\u1EE4\u1EE6\u1EE8\u1EEA\u1EEC\u1EEE\u1EF0\u1EF2\u1EF4\u1EF6\u1EF8\u1EFA\u1EFC\u1EFE\u1F08\u1F09\u1F0A\u1F0B\u1F0C\u1F0D\u1F0E\u1F0F\u1F18\u1F19\u1F1A\u1F1B\u1F1C\u1F1D\u1F28\u1F29\u1F2A\u1F2B\u1F2C\u1F2D\u1F2E\u1F2F\u1F38\u1F39\u1F3A\u1F3B\u1F3C\u1F3D\u1F3E\u1F3F\u1F48\u1F49\u1F4A\u1F4B\u1F4C\u1F4D\u1F59\u1F5B\u1F5D\u1F5F\u1F68\u1F69\u1F6A\u1F6B\u1F6C\u1F6D\u1F6E\u1F6F\u1FB8\u1FB9\u1FBA\u1FBB\u1FC8\u1FC9\u1FCA\u1FCB\u1FD8\u1FD9\u1FDA\u1FDB\u1FE8\u1FE9\u1FEA\u1FEB\u1FEC\u1FF8\u1FF9\u1FFA\u1FFB\u2102\u2107\u210B\u210C\u210D\u2110\u2111\u2112\u2115\u2119\u211A\u211B\u211C\u211D\u2124\u2126\u2128\u212A\u212B\u212C\u212D\u2130\u2131\u2132\u2133\u213E\u213F\u2145\u2183\u2C00\u2C01\u2C02\u2C03\u2C04\u2C05\u2C06\u2C07\u2C08\u2C09\u2C0A\u2C0B\u2C0C\u2C0D\u2C0E\u2C0F\u2C10\u2C11\u2C12\u2C13\u2C14\u2C15\u2C16\u2C17\u2C18\u2C19\u2C1A\u2C1B\u2C1C\u2C1D\u2C1E\u2C1F\u2C20\u2C21\u2C22\u2C23\u2C24\u2C25\u2C26\u2C27\u2C28\u2C29\u2C2A\u2C2B\u2C2C\u2C2D\u2C2E\u2C60\u2C62\u2C63\u2C64\u2C67\u2C69\u2C6B\u2C6D\u2C6E\u2C6F\u2C72\u2C75\u2C80\u2C82\u2C84\u2C86\u2C88\u2C8A\u2C8C\u2C8E\u2C90\u2C92\u2C94\u2C96\u2C98\u2C9A\u2C9C\u2C9E\u2CA0\u2CA2\u2CA4\u2CA6\u2CA8\u2CAA\u2CAC\u2CAE\u2CB0\u2CB2\u2CB4\u2CB6\u2CB8\u2CBA\u2CBC\u2CBE\u2CC0\u2CC2\u2CC4\u2CC6\u2CC8\u2CCA\u2CCC\u2CCE\u2CD0\u2CD2\u2CD4\u2CD6\u2CD8\u2CDA\u2CDC\u2CDE\u2CE0\u2CE2\uA640\uA642\uA644\uA646\uA648\uA64A\uA64C\uA64E\uA650\uA652\uA654\uA656\uA658\uA65A\uA65C\uA65E\uA662\uA664\uA666\uA668\uA66A\uA66C\uA680\uA682\uA684\uA686\uA688\uA68A\uA68C\uA68E\uA690\uA692\uA694\uA696\uA722\uA724\uA726\uA728\uA72A\uA72C\uA72E\uA732\uA734\uA736\uA738\uA73A\uA73C\uA73E\uA740\uA742\uA744\uA746\uA748\uA74A\uA74C\uA74E\uA750\uA752\uA754\uA756\uA758\uA75A\uA75C\uA75E\uA760\uA762\uA764\uA766\uA768\uA76A\uA76C\uA76E\uA779\uA77B\uA77D\uA77E\uA780\uA782\uA784\uA786\uA78B\uFF21\uFF22\uFF23\uFF24\uFF25\uFF26\uFF27\uFF28\uFF29\uFF2A\uFF2B\uFF2C\uFF2D\uFF2E\uFF2F\uFF30\uFF31\uFF32\uFF33\uFF34\uFF35\uFF36\uFF37\uFF38\uFF39\uFF3A]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[ABCDEFGHIJKLMNOPQRSTUVWXYZ\\xC0\\xC1\\xC2\\xC3\\xC4\\xC5\\xC6\\xC7\\xC8\\xC9\\xCA\\xCB\\xCC\\xCD\\xCE\\xCF\\xD0\\xD1\\xD2\\xD3\\xD4\\xD5\\xD6\\xD8\\xD9\\xDA\\xDB\\xDC\\xDD\\xDE\\u0100\\u0102\\u0104\\u0106\\u0108\\u010A\\u010C\\u010E\\u0110\\u0112\\u0114\\u0116\\u0118\\u011A\\u011C\\u011E\\u0120\\u0122\\u0124\\u0126\\u0128\\u012A\\u012C\\u012E\\u0130\\u0132\\u0134\\u0136\\u0139\\u013B\\u013D\\u013F\\u0141\\u0143\\u0145\\u0147\\u014A\\u014C\\u014E\\u0150\\u0152\\u0154\\u0156\\u0158\\u015A\\u015C\\u015E\\u0160\\u0162\\u0164\\u0166\\u0168\\u016A\\u016C\\u016E\\u0170\\u0172\\u0174\\u0176\\u0178\\u0179\\u017B\\u017D\\u0181\\u0182\\u0184\\u0186\\u0187\\u0189\\u018A\\u018B\\u018E\\u018F\\u0190\\u0191\\u0193\\u0194\\u0196\\u0197\\u0198\\u019C\\u019D\\u019F\\u01A0\\u01A2\\u01A4\\u01A6\\u01A7\\u01A9\\u01AC\\u01AE\\u01AF\\u01B1\\u01B2\\u01B3\\u01B5\\u01B7\\u01B8\\u01BC\\u01C4\\u01C7\\u01CA\\u01CD\\u01CF\\u01D1\\u01D3\\u01D5\\u01D7\\u01D9\\u01DB\\u01DE\\u01E0\\u01E2\\u01E4\\u01E6\\u01E8\\u01EA\\u01EC\\u01EE\\u01F1\\u01F4\\u01F6\\u01F7\\u01F8\\u01FA\\u01FC\\u01FE\\u0200\\u0202\\u0204\\u0206\\u0208\\u020A\\u020C\\u020E\\u0210\\u0212\\u0214\\u0216\\u0218\\u021A\\u021C\\u021E\\u0220\\u0222\\u0224\\u0226\\u0228\\u022A\\u022C\\u022E\\u0230\\u0232\\u023A\\u023B\\u023D\\u023E\\u0241\\u0243\\u0244\\u0245\\u0246\\u0248\\u024A\\u024C\\u024E\\u0370\\u0372\\u0376\\u0386\\u0388\\u0389\\u038A\\u038C\\u038E\\u038F\\u0391\\u0392\\u0393\\u0394\\u0395\\u0396\\u0397\\u0398\\u0399\\u039A\\u039B\\u039C\\u039D\\u039E\\u039F\\u03A0\\u03A1\\u03A3\\u03A4\\u03A5\\u03A6\\u03A7\\u03A8\\u03A9\\u03AA\\u03AB\\u03CF\\u03D2\\u03D3\\u03D4\\u03D8\\u03DA\\u03DC\\u03DE\\u03E0\\u03E2\\u03E4\\u03E6\\u03E8\\u03EA\\u03EC\\u03EE\\u03F4\\u03F7\\u03F9\\u03FA\\u03FD\\u03FE\\u03FF\\u0400\\u0401\\u0402\\u0403\\u0404\\u0405\\u0406\\u0407\\u0408\\u0409\\u040A\\u040B\\u040C\\u040D\\u040E\\u040F\\u0410\\u0411\\u0412\\u0413\\u0414\\u0415\\u0416\\u0417\\u0418\\u0419\\u041A\\u041B\\u041C\\u041D\\u041E\\u041F\\u0420\\u0421\\u0422\\u0423\\u0424\\u0425\\u0426\\u0427\\u0428\\u0429\\u042A\\u042B\\u042C\\u042D\\u042E\\u042F\\u0460\\u0462\\u0464\\u0466\\u0468\\u046A\\u046C\\u046E\\u0470\\u0472\\u0474\\u0476\\u0478\\u047A\\u047C\\u047E\\u0480\\u048A\\u048C\\u048E\\u0490\\u0492\\u0494\\u0496\\u0498\\u049A\\u049C\\u049E\\u04A0\\u04A2\\u04A4\\u04A6\\u04A8\\u04AA\\u04AC\\u04AE\\u04B0\\u04B2\\u04B4\\u04B6\\u04B8\\u04BA\\u04BC\\u04BE\\u04C0\\u04C1\\u04C3\\u04C5\\u04C7\\u04C9\\u04CB\\u04CD\\u04D0\\u04D2\\u04D4\\u04D6\\u04D8\\u04DA\\u04DC\\u04DE\\u04E0\\u04E2\\u04E4\\u04E6\\u04E8\\u04EA\\u04EC\\u04EE\\u04F0\\u04F2\\u04F4\\u04F6\\u04F8\\u04FA\\u04FC\\u04FE\\u0500\\u0502\\u0504\\u0506\\u0508\\u050A\\u050C\\u050E\\u0510\\u0512\\u0514\\u0516\\u0518\\u051A\\u051C\\u051E\\u0520\\u0522\\u0531\\u0532\\u0533\\u0534\\u0535\\u0536\\u0537\\u0538\\u0539\\u053A\\u053B\\u053C\\u053D\\u053E\\u053F\\u0540\\u0541\\u0542\\u0543\\u0544\\u0545\\u0546\\u0547\\u0548\\u0549\\u054A\\u054B\\u054C\\u054D\\u054E\\u054F\\u0550\\u0551\\u0552\\u0553\\u0554\\u0555\\u0556\\u10A0\\u10A1\\u10A2\\u10A3\\u10A4\\u10A5\\u10A6\\u10A7\\u10A8\\u10A9\\u10AA\\u10AB\\u10AC\\u10AD\\u10AE\\u10AF\\u10B0\\u10B1\\u10B2\\u10B3\\u10B4\\u10B5\\u10B6\\u10B7\\u10B8\\u10B9\\u10BA\\u10BB\\u10BC\\u10BD\\u10BE\\u10BF\\u10C0\\u10C1\\u10C2\\u10C3\\u10C4\\u10C5\\u1E00\\u1E02\\u1E04\\u1E06\\u1E08\\u1E0A\\u1E0C\\u1E0E\\u1E10\\u1E12\\u1E14\\u1E16\\u1E18\\u1E1A\\u1E1C\\u1E1E\\u1E20\\u1E22\\u1E24\\u1E26\\u1E28\\u1E2A\\u1E2C\\u1E2E\\u1E30\\u1E32\\u1E34\\u1E36\\u1E38\\u1E3A\\u1E3C\\u1E3E\\u1E40\\u1E42\\u1E44\\u1E46\\u1E48\\u1E4A\\u1E4C\\u1E4E\\u1E50\\u1E52\\u1E54\\u1E56\\u1E58\\u1E5A\\u1E5C\\u1E5E\\u1E60\\u1E62\\u1E64\\u1E66\\u1E68\\u1E6A\\u1E6C\\u1E6E\\u1E70\\u1E72\\u1E74\\u1E76\\u1E78\\u1E7A\\u1E7C\\u1E7E\\u1E80\\u1E82\\u1E84\\u1E86\\u1E88\\u1E8A\\u1E8C\\u1E8E\\u1E90\\u1E92\\u1E94\\u1E9E\\u1EA0\\u1EA2\\u1EA4\\u1EA6\\u1EA8\\u1EAA\\u1EAC\\u1EAE\\u1EB0\\u1EB2\\u1EB4\\u1EB6\\u1EB8\\u1EBA\\u1EBC\\u1EBE\\u1EC0\\u1EC2\\u1EC4\\u1EC6\\u1EC8\\u1ECA\\u1ECC\\u1ECE\\u1ED0\\u1ED2\\u1ED4\\u1ED6\\u1ED8\\u1EDA\\u1EDC\\u1EDE\\u1EE0\\u1EE2\\u1EE4\\u1EE6\\u1EE8\\u1EEA\\u1EEC\\u1EEE\\u1EF0\\u1EF2\\u1EF4\\u1EF6\\u1EF8\\u1EFA\\u1EFC\\u1EFE\\u1F08\\u1F09\\u1F0A\\u1F0B\\u1F0C\\u1F0D\\u1F0E\\u1F0F\\u1F18\\u1F19\\u1F1A\\u1F1B\\u1F1C\\u1F1D\\u1F28\\u1F29\\u1F2A\\u1F2B\\u1F2C\\u1F2D\\u1F2E\\u1F2F\\u1F38\\u1F39\\u1F3A\\u1F3B\\u1F3C\\u1F3D\\u1F3E\\u1F3F\\u1F48\\u1F49\\u1F4A\\u1F4B\\u1F4C\\u1F4D\\u1F59\\u1F5B\\u1F5D\\u1F5F\\u1F68\\u1F69\\u1F6A\\u1F6B\\u1F6C\\u1F6D\\u1F6E\\u1F6F\\u1FB8\\u1FB9\\u1FBA\\u1FBB\\u1FC8\\u1FC9\\u1FCA\\u1FCB\\u1FD8\\u1FD9\\u1FDA\\u1FDB\\u1FE8\\u1FE9\\u1FEA\\u1FEB\\u1FEC\\u1FF8\\u1FF9\\u1FFA\\u1FFB\\u2102\\u2107\\u210B\\u210C\\u210D\\u2110\\u2111\\u2112\\u2115\\u2119\\u211A\\u211B\\u211C\\u211D\\u2124\\u2126\\u2128\\u212A\\u212B\\u212C\\u212D\\u2130\\u2131\\u2132\\u2133\\u213E\\u213F\\u2145\\u2183\\u2C00\\u2C01\\u2C02\\u2C03\\u2C04\\u2C05\\u2C06\\u2C07\\u2C08\\u2C09\\u2C0A\\u2C0B\\u2C0C\\u2C0D\\u2C0E\\u2C0F\\u2C10\\u2C11\\u2C12\\u2C13\\u2C14\\u2C15\\u2C16\\u2C17\\u2C18\\u2C19\\u2C1A\\u2C1B\\u2C1C\\u2C1D\\u2C1E\\u2C1F\\u2C20\\u2C21\\u2C22\\u2C23\\u2C24\\u2C25\\u2C26\\u2C27\\u2C28\\u2C29\\u2C2A\\u2C2B\\u2C2C\\u2C2D\\u2C2E\\u2C60\\u2C62\\u2C63\\u2C64\\u2C67\\u2C69\\u2C6B\\u2C6D\\u2C6E\\u2C6F\\u2C72\\u2C75\\u2C80\\u2C82\\u2C84\\u2C86\\u2C88\\u2C8A\\u2C8C\\u2C8E\\u2C90\\u2C92\\u2C94\\u2C96\\u2C98\\u2C9A\\u2C9C\\u2C9E\\u2CA0\\u2CA2\\u2CA4\\u2CA6\\u2CA8\\u2CAA\\u2CAC\\u2CAE\\u2CB0\\u2CB2\\u2CB4\\u2CB6\\u2CB8\\u2CBA\\u2CBC\\u2CBE\\u2CC0\\u2CC2\\u2CC4\\u2CC6\\u2CC8\\u2CCA\\u2CCC\\u2CCE\\u2CD0\\u2CD2\\u2CD4\\u2CD6\\u2CD8\\u2CDA\\u2CDC\\u2CDE\\u2CE0\\u2CE2\\uA640\\uA642\\uA644\\uA646\\uA648\\uA64A\\uA64C\\uA64E\\uA650\\uA652\\uA654\\uA656\\uA658\\uA65A\\uA65C\\uA65E\\uA662\\uA664\\uA666\\uA668\\uA66A\\uA66C\\uA680\\uA682\\uA684\\uA686\\uA688\\uA68A\\uA68C\\uA68E\\uA690\\uA692\\uA694\\uA696\\uA722\\uA724\\uA726\\uA728\\uA72A\\uA72C\\uA72E\\uA732\\uA734\\uA736\\uA738\\uA73A\\uA73C\\uA73E\\uA740\\uA742\\uA744\\uA746\\uA748\\uA74A\\uA74C\\uA74E\\uA750\\uA752\\uA754\\uA756\\uA758\\uA75A\\uA75C\\uA75E\\uA760\\uA762\\uA764\\uA766\\uA768\\uA76A\\uA76C\\uA76E\\uA779\\uA77B\\uA77D\\uA77E\\uA780\\uA782\\uA784\\uA786\\uA78B\\uFF21\\uFF22\\uFF23\\uFF24\\uFF25\\uFF26\\uFF27\\uFF28\\uFF29\\uFF2A\\uFF2B\\uFF2C\\uFF2D\\uFF2E\\uFF2F\\uFF30\\uFF31\\uFF32\\uFF33\\uFF34\\uFF35\\uFF36\\uFF37\\uFF38\\uFF39\\uFF3A]");
          }
        }
        return result0;
      }
      
      function parse_Mc() {
        var result0;
        
        if (/^[\u0903\u093E\u093F\u0940\u0949\u094A\u094B\u094C\u0982\u0983\u09BE\u09BF\u09C0\u09C7\u09C8\u09CB\u09CC\u09D7\u0A03\u0A3E\u0A3F\u0A40\u0A83\u0ABE\u0ABF\u0AC0\u0AC9\u0ACB\u0ACC\u0B02\u0B03\u0B3E\u0B40\u0B47\u0B48\u0B4B\u0B4C\u0B57\u0BBE\u0BBF\u0BC1\u0BC2\u0BC6\u0BC7\u0BC8\u0BCA\u0BCB\u0BCC\u0BD7\u0C01\u0C02\u0C03\u0C41\u0C42\u0C43\u0C44\u0C82\u0C83\u0CBE\u0CC0\u0CC1\u0CC2\u0CC3\u0CC4\u0CC7\u0CC8\u0CCA\u0CCB\u0CD5\u0CD6\u0D02\u0D03\u0D3E\u0D3F\u0D40\u0D46\u0D47\u0D48\u0D4A\u0D4B\u0D4C\u0D57\u0D82\u0D83\u0DCF\u0DD0\u0DD1\u0DD8\u0DD9\u0DDA\u0DDB\u0DDC\u0DDD\u0DDE\u0DDF\u0DF2\u0DF3\u0F3E\u0F3F\u0F7F\u102B\u102C\u1031\u1038\u103B\u103C\u1056\u1057\u1062\u1063\u1064\u1067\u1068\u1069\u106A\u106B\u106C\u106D\u1083\u1084\u1087\u1088\u1089\u108A\u108B\u108C\u108F\u17B6\u17BE\u17BF\u17C0\u17C1\u17C2\u17C3\u17C4\u17C5\u17C7\u17C8\u1923\u1924\u1925\u1926\u1929\u192A\u192B\u1930\u1931\u1933\u1934\u1935\u1936\u1937\u1938\u19B0\u19B1\u19B2\u19B3\u19B4\u19B5\u19B6\u19B7\u19B8\u19B9\u19BA\u19BB\u19BC\u19BD\u19BE\u19BF\u19C0\u19C8\u19C9\u1A19\u1A1A\u1A1B\u1B04\u1B35\u1B3B\u1B3D\u1B3E\u1B3F\u1B40\u1B41\u1B43\u1B44\u1B82\u1BA1\u1BA6\u1BA7\u1BAA\u1C24\u1C25\u1C26\u1C27\u1C28\u1C29\u1C2A\u1C2B\u1C34\u1C35\uA823\uA824\uA827\uA880\uA881\uA8B4\uA8B5\uA8B6\uA8B7\uA8B8\uA8B9\uA8BA\uA8BB\uA8BC\uA8BD\uA8BE\uA8BF\uA8C0\uA8C1\uA8C2\uA8C3\uA952\uA953\uAA2F\uAA30\uAA33\uAA34\uAA4D]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u0903\\u093E\\u093F\\u0940\\u0949\\u094A\\u094B\\u094C\\u0982\\u0983\\u09BE\\u09BF\\u09C0\\u09C7\\u09C8\\u09CB\\u09CC\\u09D7\\u0A03\\u0A3E\\u0A3F\\u0A40\\u0A83\\u0ABE\\u0ABF\\u0AC0\\u0AC9\\u0ACB\\u0ACC\\u0B02\\u0B03\\u0B3E\\u0B40\\u0B47\\u0B48\\u0B4B\\u0B4C\\u0B57\\u0BBE\\u0BBF\\u0BC1\\u0BC2\\u0BC6\\u0BC7\\u0BC8\\u0BCA\\u0BCB\\u0BCC\\u0BD7\\u0C01\\u0C02\\u0C03\\u0C41\\u0C42\\u0C43\\u0C44\\u0C82\\u0C83\\u0CBE\\u0CC0\\u0CC1\\u0CC2\\u0CC3\\u0CC4\\u0CC7\\u0CC8\\u0CCA\\u0CCB\\u0CD5\\u0CD6\\u0D02\\u0D03\\u0D3E\\u0D3F\\u0D40\\u0D46\\u0D47\\u0D48\\u0D4A\\u0D4B\\u0D4C\\u0D57\\u0D82\\u0D83\\u0DCF\\u0DD0\\u0DD1\\u0DD8\\u0DD9\\u0DDA\\u0DDB\\u0DDC\\u0DDD\\u0DDE\\u0DDF\\u0DF2\\u0DF3\\u0F3E\\u0F3F\\u0F7F\\u102B\\u102C\\u1031\\u1038\\u103B\\u103C\\u1056\\u1057\\u1062\\u1063\\u1064\\u1067\\u1068\\u1069\\u106A\\u106B\\u106C\\u106D\\u1083\\u1084\\u1087\\u1088\\u1089\\u108A\\u108B\\u108C\\u108F\\u17B6\\u17BE\\u17BF\\u17C0\\u17C1\\u17C2\\u17C3\\u17C4\\u17C5\\u17C7\\u17C8\\u1923\\u1924\\u1925\\u1926\\u1929\\u192A\\u192B\\u1930\\u1931\\u1933\\u1934\\u1935\\u1936\\u1937\\u1938\\u19B0\\u19B1\\u19B2\\u19B3\\u19B4\\u19B5\\u19B6\\u19B7\\u19B8\\u19B9\\u19BA\\u19BB\\u19BC\\u19BD\\u19BE\\u19BF\\u19C0\\u19C8\\u19C9\\u1A19\\u1A1A\\u1A1B\\u1B04\\u1B35\\u1B3B\\u1B3D\\u1B3E\\u1B3F\\u1B40\\u1B41\\u1B43\\u1B44\\u1B82\\u1BA1\\u1BA6\\u1BA7\\u1BAA\\u1C24\\u1C25\\u1C26\\u1C27\\u1C28\\u1C29\\u1C2A\\u1C2B\\u1C34\\u1C35\\uA823\\uA824\\uA827\\uA880\\uA881\\uA8B4\\uA8B5\\uA8B6\\uA8B7\\uA8B8\\uA8B9\\uA8BA\\uA8BB\\uA8BC\\uA8BD\\uA8BE\\uA8BF\\uA8C0\\uA8C1\\uA8C2\\uA8C3\\uA952\\uA953\\uAA2F\\uAA30\\uAA33\\uAA34\\uAA4D]");
          }
        }
        return result0;
      }
      
      function parse_Mn() {
        var result0;
        
        if (/^[\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308\u0309\u030A\u030B\u030C\u030D\u030E\u030F\u0310\u0311\u0312\u0313\u0314\u0315\u0316\u0317\u0318\u0319\u031A\u031B\u031C\u031D\u031E\u031F\u0320\u0321\u0322\u0323\u0324\u0325\u0326\u0327\u0328\u0329\u032A\u032B\u032C\u032D\u032E\u032F\u0330\u0331\u0332\u0333\u0334\u0335\u0336\u0337\u0338\u0339\u033A\u033B\u033C\u033D\u033E\u033F\u0340\u0341\u0342\u0343\u0344\u0345\u0346\u0347\u0348\u0349\u034A\u034B\u034C\u034D\u034E\u034F\u0350\u0351\u0352\u0353\u0354\u0355\u0356\u0357\u0358\u0359\u035A\u035B\u035C\u035D\u035E\u035F\u0360\u0361\u0362\u0363\u0364\u0365\u0366\u0367\u0368\u0369\u036A\u036B\u036C\u036D\u036E\u036F\u0483\u0484\u0485\u0486\u0487\u0591\u0592\u0593\u0594\u0595\u0596\u0597\u0598\u0599\u059A\u059B\u059C\u059D\u059E\u059F\u05A0\u05A1\u05A2\u05A3\u05A4\u05A5\u05A6\u05A7\u05A8\u05A9\u05AA\u05AB\u05AC\u05AD\u05AE\u05AF\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05B8\u05B9\u05BA\u05BB\u05BC\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610\u0611\u0612\u0613\u0614\u0615\u0616\u0617\u0618\u0619\u061A\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0656\u0657\u0658\u0659\u065A\u065B\u065C\u065D\u065E\u0670\u06D6\u06D7\u06D8\u06D9\u06DA\u06DB\u06DC\u06DF\u06E0\u06E1\u06E2\u06E3\u06E4\u06E7\u06E8\u06EA\u06EB\u06EC\u06ED\u0711\u0730\u0731\u0732\u0733\u0734\u0735\u0736\u0737\u0738\u0739\u073A\u073B\u073C\u073D\u073E\u073F\u0740\u0741\u0742\u0743\u0744\u0745\u0746\u0747\u0748\u0749\u074A\u07A6\u07A7\u07A8\u07A9\u07AA\u07AB\u07AC\u07AD\u07AE\u07AF\u07B0\u07EB\u07EC\u07ED\u07EE\u07EF\u07F0\u07F1\u07F2\u07F3\u0901\u0902\u093C\u0941\u0942\u0943\u0944\u0945\u0946\u0947\u0948\u094D\u0951\u0952\u0953\u0954\u0962\u0963\u0981\u09BC\u09C1\u09C2\u09C3\u09C4\u09CD\u09E2\u09E3\u0A01\u0A02\u0A3C\u0A41\u0A42\u0A47\u0A48\u0A4B\u0A4C\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81\u0A82\u0ABC\u0AC1\u0AC2\u0AC3\u0AC4\u0AC5\u0AC7\u0AC8\u0ACD\u0AE2\u0AE3\u0B01\u0B3C\u0B3F\u0B41\u0B42\u0B43\u0B44\u0B4D\u0B56\u0B62\u0B63\u0B82\u0BC0\u0BCD\u0C3E\u0C3F\u0C40\u0C46\u0C47\u0C48\u0C4A\u0C4B\u0C4C\u0C4D\u0C55\u0C56\u0C62\u0C63\u0CBC\u0CBF\u0CC6\u0CCC\u0CCD\u0CE2\u0CE3\u0D41\u0D42\u0D43\u0D44\u0D4D\u0D62\u0D63\u0DCA\u0DD2\u0DD3\u0DD4\u0DD6\u0E31\u0E34\u0E35\u0E36\u0E37\u0E38\u0E39\u0E3A\u0E47\u0E48\u0E49\u0E4A\u0E4B\u0E4C\u0E4D\u0E4E\u0EB1\u0EB4\u0EB5\u0EB6\u0EB7\u0EB8\u0EB9\u0EBB\u0EBC\u0EC8\u0EC9\u0ECA\u0ECB\u0ECC\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F71\u0F72\u0F73\u0F74\u0F75\u0F76\u0F77\u0F78\u0F79\u0F7A\u0F7B\u0F7C\u0F7D\u0F7E\u0F80\u0F81\u0F82\u0F83\u0F84\u0F86\u0F87\u0F90\u0F91\u0F92\u0F93\u0F94\u0F95\u0F96\u0F97\u0F99\u0F9A\u0F9B\u0F9C\u0F9D\u0F9E\u0F9F\u0FA0\u0FA1\u0FA2\u0FA3\u0FA4\u0FA5\u0FA6\u0FA7\u0FA8\u0FA9\u0FAA\u0FAB\u0FAC\u0FAD\u0FAE\u0FAF\u0FB0\u0FB1\u0FB2\u0FB3\u0FB4\u0FB5\u0FB6\u0FB7\u0FB8\u0FB9\u0FBA\u0FBB\u0FBC\u0FC6\u102D\u102E\u102F\u1030\u1032\u1033\u1034\u1035\u1036\u1037\u1039\u103A\u103D\u103E\u1058\u1059\u105E\u105F\u1060\u1071\u1072\u1073\u1074\u1082\u1085\u1086\u108D\u135F\u1712\u1713\u1714\u1732\u1733\u1734\u1752\u1753\u1772\u1773\u17B7\u17B8\u17B9\u17BA\u17BB\u17BC\u17BD\u17C6\u17C9\u17CA\u17CB\u17CC\u17CD\u17CE\u17CF\u17D0\u17D1\u17D2\u17D3\u17DD\u180B\u180C\u180D\u18A9\u1920\u1921\u1922\u1927\u1928\u1932\u1939\u193A\u193B\u1A17\u1A18\u1B00\u1B01\u1B02\u1B03\u1B34\u1B36\u1B37\u1B38\u1B39\u1B3A\u1B3C\u1B42\u1B6B\u1B6C\u1B6D\u1B6E\u1B6F\u1B70\u1B71\u1B72\u1B73\u1B80\u1B81\u1BA2\u1BA3\u1BA4\u1BA5\u1BA8\u1BA9\u1C2C\u1C2D\u1C2E\u1C2F\u1C30\u1C31\u1C32\u1C33\u1C36\u1C37\u1DC0\u1DC1\u1DC2\u1DC3\u1DC4\u1DC5\u1DC6\u1DC7\u1DC8\u1DC9\u1DCA\u1DCB\u1DCC\u1DCD\u1DCE\u1DCF\u1DD0\u1DD1\u1DD2\u1DD3\u1DD4\u1DD5\u1DD6\u1DD7\u1DD8\u1DD9\u1DDA\u1DDB\u1DDC\u1DDD\u1DDE\u1DDF\u1DE0\u1DE1\u1DE2\u1DE3\u1DE4\u1DE5\u1DE6\u1DFE\u1DFF\u20D0\u20D1\u20D2\u20D3\u20D4\u20D5\u20D6\u20D7\u20D8\u20D9\u20DA\u20DB\u20DC\u20E1\u20E5\u20E6\u20E7\u20E8\u20E9\u20EA\u20EB\u20EC\u20ED\u20EE\u20EF\u20F0\u2DE0\u2DE1\u2DE2\u2DE3\u2DE4\u2DE5\u2DE6\u2DE7\u2DE8\u2DE9\u2DEA\u2DEB\u2DEC\u2DED\u2DEE\u2DEF\u2DF0\u2DF1\u2DF2\u2DF3\u2DF4\u2DF5\u2DF6\u2DF7\u2DF8\u2DF9\u2DFA\u2DFB\u2DFC\u2DFD\u2DFE\u2DFF\u302A\u302B\u302C\u302D\u302E\u302F\u3099\u309A\uA66F\uA67C\uA67D\uA802\uA806\uA80B\uA825\uA826\uA8C4\uA926\uA927\uA928\uA929\uA92A\uA92B\uA92C\uA92D\uA947\uA948\uA949\uA94A\uA94B\uA94C\uA94D\uA94E\uA94F\uA950\uA951\uAA29\uAA2A\uAA2B\uAA2C\uAA2D\uAA2E\uAA31\uAA32\uAA35\uAA36\uAA43\uAA4C\uFB1E\uFE00\uFE01\uFE02\uFE03\uFE04\uFE05\uFE06\uFE07\uFE08\uFE09\uFE0A\uFE0B\uFE0C\uFE0D\uFE0E\uFE0F\uFE20\uFE21\uFE22\uFE23\uFE24\uFE25\uFE26]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u0300\\u0301\\u0302\\u0303\\u0304\\u0305\\u0306\\u0307\\u0308\\u0309\\u030A\\u030B\\u030C\\u030D\\u030E\\u030F\\u0310\\u0311\\u0312\\u0313\\u0314\\u0315\\u0316\\u0317\\u0318\\u0319\\u031A\\u031B\\u031C\\u031D\\u031E\\u031F\\u0320\\u0321\\u0322\\u0323\\u0324\\u0325\\u0326\\u0327\\u0328\\u0329\\u032A\\u032B\\u032C\\u032D\\u032E\\u032F\\u0330\\u0331\\u0332\\u0333\\u0334\\u0335\\u0336\\u0337\\u0338\\u0339\\u033A\\u033B\\u033C\\u033D\\u033E\\u033F\\u0340\\u0341\\u0342\\u0343\\u0344\\u0345\\u0346\\u0347\\u0348\\u0349\\u034A\\u034B\\u034C\\u034D\\u034E\\u034F\\u0350\\u0351\\u0352\\u0353\\u0354\\u0355\\u0356\\u0357\\u0358\\u0359\\u035A\\u035B\\u035C\\u035D\\u035E\\u035F\\u0360\\u0361\\u0362\\u0363\\u0364\\u0365\\u0366\\u0367\\u0368\\u0369\\u036A\\u036B\\u036C\\u036D\\u036E\\u036F\\u0483\\u0484\\u0485\\u0486\\u0487\\u0591\\u0592\\u0593\\u0594\\u0595\\u0596\\u0597\\u0598\\u0599\\u059A\\u059B\\u059C\\u059D\\u059E\\u059F\\u05A0\\u05A1\\u05A2\\u05A3\\u05A4\\u05A5\\u05A6\\u05A7\\u05A8\\u05A9\\u05AA\\u05AB\\u05AC\\u05AD\\u05AE\\u05AF\\u05B0\\u05B1\\u05B2\\u05B3\\u05B4\\u05B5\\u05B6\\u05B7\\u05B8\\u05B9\\u05BA\\u05BB\\u05BC\\u05BD\\u05BF\\u05C1\\u05C2\\u05C4\\u05C5\\u05C7\\u0610\\u0611\\u0612\\u0613\\u0614\\u0615\\u0616\\u0617\\u0618\\u0619\\u061A\\u064B\\u064C\\u064D\\u064E\\u064F\\u0650\\u0651\\u0652\\u0653\\u0654\\u0655\\u0656\\u0657\\u0658\\u0659\\u065A\\u065B\\u065C\\u065D\\u065E\\u0670\\u06D6\\u06D7\\u06D8\\u06D9\\u06DA\\u06DB\\u06DC\\u06DF\\u06E0\\u06E1\\u06E2\\u06E3\\u06E4\\u06E7\\u06E8\\u06EA\\u06EB\\u06EC\\u06ED\\u0711\\u0730\\u0731\\u0732\\u0733\\u0734\\u0735\\u0736\\u0737\\u0738\\u0739\\u073A\\u073B\\u073C\\u073D\\u073E\\u073F\\u0740\\u0741\\u0742\\u0743\\u0744\\u0745\\u0746\\u0747\\u0748\\u0749\\u074A\\u07A6\\u07A7\\u07A8\\u07A9\\u07AA\\u07AB\\u07AC\\u07AD\\u07AE\\u07AF\\u07B0\\u07EB\\u07EC\\u07ED\\u07EE\\u07EF\\u07F0\\u07F1\\u07F2\\u07F3\\u0901\\u0902\\u093C\\u0941\\u0942\\u0943\\u0944\\u0945\\u0946\\u0947\\u0948\\u094D\\u0951\\u0952\\u0953\\u0954\\u0962\\u0963\\u0981\\u09BC\\u09C1\\u09C2\\u09C3\\u09C4\\u09CD\\u09E2\\u09E3\\u0A01\\u0A02\\u0A3C\\u0A41\\u0A42\\u0A47\\u0A48\\u0A4B\\u0A4C\\u0A4D\\u0A51\\u0A70\\u0A71\\u0A75\\u0A81\\u0A82\\u0ABC\\u0AC1\\u0AC2\\u0AC3\\u0AC4\\u0AC5\\u0AC7\\u0AC8\\u0ACD\\u0AE2\\u0AE3\\u0B01\\u0B3C\\u0B3F\\u0B41\\u0B42\\u0B43\\u0B44\\u0B4D\\u0B56\\u0B62\\u0B63\\u0B82\\u0BC0\\u0BCD\\u0C3E\\u0C3F\\u0C40\\u0C46\\u0C47\\u0C48\\u0C4A\\u0C4B\\u0C4C\\u0C4D\\u0C55\\u0C56\\u0C62\\u0C63\\u0CBC\\u0CBF\\u0CC6\\u0CCC\\u0CCD\\u0CE2\\u0CE3\\u0D41\\u0D42\\u0D43\\u0D44\\u0D4D\\u0D62\\u0D63\\u0DCA\\u0DD2\\u0DD3\\u0DD4\\u0DD6\\u0E31\\u0E34\\u0E35\\u0E36\\u0E37\\u0E38\\u0E39\\u0E3A\\u0E47\\u0E48\\u0E49\\u0E4A\\u0E4B\\u0E4C\\u0E4D\\u0E4E\\u0EB1\\u0EB4\\u0EB5\\u0EB6\\u0EB7\\u0EB8\\u0EB9\\u0EBB\\u0EBC\\u0EC8\\u0EC9\\u0ECA\\u0ECB\\u0ECC\\u0ECD\\u0F18\\u0F19\\u0F35\\u0F37\\u0F39\\u0F71\\u0F72\\u0F73\\u0F74\\u0F75\\u0F76\\u0F77\\u0F78\\u0F79\\u0F7A\\u0F7B\\u0F7C\\u0F7D\\u0F7E\\u0F80\\u0F81\\u0F82\\u0F83\\u0F84\\u0F86\\u0F87\\u0F90\\u0F91\\u0F92\\u0F93\\u0F94\\u0F95\\u0F96\\u0F97\\u0F99\\u0F9A\\u0F9B\\u0F9C\\u0F9D\\u0F9E\\u0F9F\\u0FA0\\u0FA1\\u0FA2\\u0FA3\\u0FA4\\u0FA5\\u0FA6\\u0FA7\\u0FA8\\u0FA9\\u0FAA\\u0FAB\\u0FAC\\u0FAD\\u0FAE\\u0FAF\\u0FB0\\u0FB1\\u0FB2\\u0FB3\\u0FB4\\u0FB5\\u0FB6\\u0FB7\\u0FB8\\u0FB9\\u0FBA\\u0FBB\\u0FBC\\u0FC6\\u102D\\u102E\\u102F\\u1030\\u1032\\u1033\\u1034\\u1035\\u1036\\u1037\\u1039\\u103A\\u103D\\u103E\\u1058\\u1059\\u105E\\u105F\\u1060\\u1071\\u1072\\u1073\\u1074\\u1082\\u1085\\u1086\\u108D\\u135F\\u1712\\u1713\\u1714\\u1732\\u1733\\u1734\\u1752\\u1753\\u1772\\u1773\\u17B7\\u17B8\\u17B9\\u17BA\\u17BB\\u17BC\\u17BD\\u17C6\\u17C9\\u17CA\\u17CB\\u17CC\\u17CD\\u17CE\\u17CF\\u17D0\\u17D1\\u17D2\\u17D3\\u17DD\\u180B\\u180C\\u180D\\u18A9\\u1920\\u1921\\u1922\\u1927\\u1928\\u1932\\u1939\\u193A\\u193B\\u1A17\\u1A18\\u1B00\\u1B01\\u1B02\\u1B03\\u1B34\\u1B36\\u1B37\\u1B38\\u1B39\\u1B3A\\u1B3C\\u1B42\\u1B6B\\u1B6C\\u1B6D\\u1B6E\\u1B6F\\u1B70\\u1B71\\u1B72\\u1B73\\u1B80\\u1B81\\u1BA2\\u1BA3\\u1BA4\\u1BA5\\u1BA8\\u1BA9\\u1C2C\\u1C2D\\u1C2E\\u1C2F\\u1C30\\u1C31\\u1C32\\u1C33\\u1C36\\u1C37\\u1DC0\\u1DC1\\u1DC2\\u1DC3\\u1DC4\\u1DC5\\u1DC6\\u1DC7\\u1DC8\\u1DC9\\u1DCA\\u1DCB\\u1DCC\\u1DCD\\u1DCE\\u1DCF\\u1DD0\\u1DD1\\u1DD2\\u1DD3\\u1DD4\\u1DD5\\u1DD6\\u1DD7\\u1DD8\\u1DD9\\u1DDA\\u1DDB\\u1DDC\\u1DDD\\u1DDE\\u1DDF\\u1DE0\\u1DE1\\u1DE2\\u1DE3\\u1DE4\\u1DE5\\u1DE6\\u1DFE\\u1DFF\\u20D0\\u20D1\\u20D2\\u20D3\\u20D4\\u20D5\\u20D6\\u20D7\\u20D8\\u20D9\\u20DA\\u20DB\\u20DC\\u20E1\\u20E5\\u20E6\\u20E7\\u20E8\\u20E9\\u20EA\\u20EB\\u20EC\\u20ED\\u20EE\\u20EF\\u20F0\\u2DE0\\u2DE1\\u2DE2\\u2DE3\\u2DE4\\u2DE5\\u2DE6\\u2DE7\\u2DE8\\u2DE9\\u2DEA\\u2DEB\\u2DEC\\u2DED\\u2DEE\\u2DEF\\u2DF0\\u2DF1\\u2DF2\\u2DF3\\u2DF4\\u2DF5\\u2DF6\\u2DF7\\u2DF8\\u2DF9\\u2DFA\\u2DFB\\u2DFC\\u2DFD\\u2DFE\\u2DFF\\u302A\\u302B\\u302C\\u302D\\u302E\\u302F\\u3099\\u309A\\uA66F\\uA67C\\uA67D\\uA802\\uA806\\uA80B\\uA825\\uA826\\uA8C4\\uA926\\uA927\\uA928\\uA929\\uA92A\\uA92B\\uA92C\\uA92D\\uA947\\uA948\\uA949\\uA94A\\uA94B\\uA94C\\uA94D\\uA94E\\uA94F\\uA950\\uA951\\uAA29\\uAA2A\\uAA2B\\uAA2C\\uAA2D\\uAA2E\\uAA31\\uAA32\\uAA35\\uAA36\\uAA43\\uAA4C\\uFB1E\\uFE00\\uFE01\\uFE02\\uFE03\\uFE04\\uFE05\\uFE06\\uFE07\\uFE08\\uFE09\\uFE0A\\uFE0B\\uFE0C\\uFE0D\\uFE0E\\uFE0F\\uFE20\\uFE21\\uFE22\\uFE23\\uFE24\\uFE25\\uFE26]");
          }
        }
        return result0;
      }
      
      function parse_Nd() {
        var result0;
        
        if (/^[0123456789\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9\u07C0\u07C1\u07C2\u07C3\u07C4\u07C5\u07C6\u07C7\u07C8\u07C9\u0966\u0967\u0968\u0969\u096A\u096B\u096C\u096D\u096E\u096F\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF\u0A66\u0A67\u0A68\u0A69\u0A6A\u0A6B\u0A6C\u0A6D\u0A6E\u0A6F\u0AE6\u0AE7\u0AE8\u0AE9\u0AEA\u0AEB\u0AEC\u0AED\u0AEE\u0AEF\u0B66\u0B67\u0B68\u0B69\u0B6A\u0B6B\u0B6C\u0B6D\u0B6E\u0B6F\u0BE6\u0BE7\u0BE8\u0BE9\u0BEA\u0BEB\u0BEC\u0BED\u0BEE\u0BEF\u0C66\u0C67\u0C68\u0C69\u0C6A\u0C6B\u0C6C\u0C6D\u0C6E\u0C6F\u0CE6\u0CE7\u0CE8\u0CE9\u0CEA\u0CEB\u0CEC\u0CED\u0CEE\u0CEF\u0D66\u0D67\u0D68\u0D69\u0D6A\u0D6B\u0D6C\u0D6D\u0D6E\u0D6F\u0E50\u0E51\u0E52\u0E53\u0E54\u0E55\u0E56\u0E57\u0E58\u0E59\u0ED0\u0ED1\u0ED2\u0ED3\u0ED4\u0ED5\u0ED6\u0ED7\u0ED8\u0ED9\u0F20\u0F21\u0F22\u0F23\u0F24\u0F25\u0F26\u0F27\u0F28\u0F29\u1040\u1041\u1042\u1043\u1044\u1045\u1046\u1047\u1048\u1049\u1090\u1091\u1092\u1093\u1094\u1095\u1096\u1097\u1098\u1099\u17E0\u17E1\u17E2\u17E3\u17E4\u17E5\u17E6\u17E7\u17E8\u17E9\u1810\u1811\u1812\u1813\u1814\u1815\u1816\u1817\u1818\u1819\u1946\u1947\u1948\u1949\u194A\u194B\u194C\u194D\u194E\u194F\u19D0\u19D1\u19D2\u19D3\u19D4\u19D5\u19D6\u19D7\u19D8\u19D9\u1B50\u1B51\u1B52\u1B53\u1B54\u1B55\u1B56\u1B57\u1B58\u1B59\u1BB0\u1BB1\u1BB2\u1BB3\u1BB4\u1BB5\u1BB6\u1BB7\u1BB8\u1BB9\u1C40\u1C41\u1C42\u1C43\u1C44\u1C45\u1C46\u1C47\u1C48\u1C49\u1C50\u1C51\u1C52\u1C53\u1C54\u1C55\u1C56\u1C57\u1C58\u1C59\uA620\uA621\uA622\uA623\uA624\uA625\uA626\uA627\uA628\uA629\uA8D0\uA8D1\uA8D2\uA8D3\uA8D4\uA8D5\uA8D6\uA8D7\uA8D8\uA8D9\uA900\uA901\uA902\uA903\uA904\uA905\uA906\uA907\uA908\uA909\uAA50\uAA51\uAA52\uAA53\uAA54\uAA55\uAA56\uAA57\uAA58\uAA59\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[0123456789\\u0660\\u0661\\u0662\\u0663\\u0664\\u0665\\u0666\\u0667\\u0668\\u0669\\u06F0\\u06F1\\u06F2\\u06F3\\u06F4\\u06F5\\u06F6\\u06F7\\u06F8\\u06F9\\u07C0\\u07C1\\u07C2\\u07C3\\u07C4\\u07C5\\u07C6\\u07C7\\u07C8\\u07C9\\u0966\\u0967\\u0968\\u0969\\u096A\\u096B\\u096C\\u096D\\u096E\\u096F\\u09E6\\u09E7\\u09E8\\u09E9\\u09EA\\u09EB\\u09EC\\u09ED\\u09EE\\u09EF\\u0A66\\u0A67\\u0A68\\u0A69\\u0A6A\\u0A6B\\u0A6C\\u0A6D\\u0A6E\\u0A6F\\u0AE6\\u0AE7\\u0AE8\\u0AE9\\u0AEA\\u0AEB\\u0AEC\\u0AED\\u0AEE\\u0AEF\\u0B66\\u0B67\\u0B68\\u0B69\\u0B6A\\u0B6B\\u0B6C\\u0B6D\\u0B6E\\u0B6F\\u0BE6\\u0BE7\\u0BE8\\u0BE9\\u0BEA\\u0BEB\\u0BEC\\u0BED\\u0BEE\\u0BEF\\u0C66\\u0C67\\u0C68\\u0C69\\u0C6A\\u0C6B\\u0C6C\\u0C6D\\u0C6E\\u0C6F\\u0CE6\\u0CE7\\u0CE8\\u0CE9\\u0CEA\\u0CEB\\u0CEC\\u0CED\\u0CEE\\u0CEF\\u0D66\\u0D67\\u0D68\\u0D69\\u0D6A\\u0D6B\\u0D6C\\u0D6D\\u0D6E\\u0D6F\\u0E50\\u0E51\\u0E52\\u0E53\\u0E54\\u0E55\\u0E56\\u0E57\\u0E58\\u0E59\\u0ED0\\u0ED1\\u0ED2\\u0ED3\\u0ED4\\u0ED5\\u0ED6\\u0ED7\\u0ED8\\u0ED9\\u0F20\\u0F21\\u0F22\\u0F23\\u0F24\\u0F25\\u0F26\\u0F27\\u0F28\\u0F29\\u1040\\u1041\\u1042\\u1043\\u1044\\u1045\\u1046\\u1047\\u1048\\u1049\\u1090\\u1091\\u1092\\u1093\\u1094\\u1095\\u1096\\u1097\\u1098\\u1099\\u17E0\\u17E1\\u17E2\\u17E3\\u17E4\\u17E5\\u17E6\\u17E7\\u17E8\\u17E9\\u1810\\u1811\\u1812\\u1813\\u1814\\u1815\\u1816\\u1817\\u1818\\u1819\\u1946\\u1947\\u1948\\u1949\\u194A\\u194B\\u194C\\u194D\\u194E\\u194F\\u19D0\\u19D1\\u19D2\\u19D3\\u19D4\\u19D5\\u19D6\\u19D7\\u19D8\\u19D9\\u1B50\\u1B51\\u1B52\\u1B53\\u1B54\\u1B55\\u1B56\\u1B57\\u1B58\\u1B59\\u1BB0\\u1BB1\\u1BB2\\u1BB3\\u1BB4\\u1BB5\\u1BB6\\u1BB7\\u1BB8\\u1BB9\\u1C40\\u1C41\\u1C42\\u1C43\\u1C44\\u1C45\\u1C46\\u1C47\\u1C48\\u1C49\\u1C50\\u1C51\\u1C52\\u1C53\\u1C54\\u1C55\\u1C56\\u1C57\\u1C58\\u1C59\\uA620\\uA621\\uA622\\uA623\\uA624\\uA625\\uA626\\uA627\\uA628\\uA629\\uA8D0\\uA8D1\\uA8D2\\uA8D3\\uA8D4\\uA8D5\\uA8D6\\uA8D7\\uA8D8\\uA8D9\\uA900\\uA901\\uA902\\uA903\\uA904\\uA905\\uA906\\uA907\\uA908\\uA909\\uAA50\\uAA51\\uAA52\\uAA53\\uAA54\\uAA55\\uAA56\\uAA57\\uAA58\\uAA59\\uFF10\\uFF11\\uFF12\\uFF13\\uFF14\\uFF15\\uFF16\\uFF17\\uFF18\\uFF19]");
          }
        }
        return result0;
      }
      
      function parse_Nl() {
        var result0;
        
        if (/^[\u16EE\u16EF\u16F0\u2160\u2161\u2162\u2163\u2164\u2165\u2166\u2167\u2168\u2169\u216A\u216B\u216C\u216D\u216E\u216F\u2170\u2171\u2172\u2173\u2174\u2175\u2176\u2177\u2178\u2179\u217A\u217B\u217C\u217D\u217E\u217F\u2180\u2181\u2182\u2185\u2186\u2187\u2188\u3007\u3021\u3022\u3023\u3024\u3025\u3026\u3027\u3028\u3029\u3038\u3039\u303A]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\u16EE\\u16EF\\u16F0\\u2160\\u2161\\u2162\\u2163\\u2164\\u2165\\u2166\\u2167\\u2168\\u2169\\u216A\\u216B\\u216C\\u216D\\u216E\\u216F\\u2170\\u2171\\u2172\\u2173\\u2174\\u2175\\u2176\\u2177\\u2178\\u2179\\u217A\\u217B\\u217C\\u217D\\u217E\\u217F\\u2180\\u2181\\u2182\\u2185\\u2186\\u2187\\u2188\\u3007\\u3021\\u3022\\u3023\\u3024\\u3025\\u3026\\u3027\\u3028\\u3029\\u3038\\u3039\\u303A]");
          }
        }
        return result0;
      }
      
      function parse_Pc() {
        var result0;
        
        if (/^[_\u203F\u2040\u2054\uFE33\uFE34\uFE4D\uFE4E\uFE4F\uFF3F]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[_\\u203F\\u2040\\u2054\\uFE33\\uFE34\\uFE4D\\uFE4E\\uFE4F\\uFF3F]");
          }
        }
        return result0;
      }
      
      function parse_Zs() {
        var result0;
        
        if (/^[ \xA0\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[ \\xA0\\u1680\\u180E\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200A\\u202F\\u205F\\u3000]");
          }
        }
        return result0;
      }
      
      
      function cleanupExpected(expected) {
        expected.sort();
        
        var lastExpected = null;
        var cleanExpected = [];
        for (var i = 0; i < expected.length; i++) {
          if (expected[i] !== lastExpected) {
            cleanExpected.push(expected[i]);
            lastExpected = expected[i];
          }
        }
        return cleanExpected;
      }
      
      function computeErrorPosition() {
        /*
         * The first idea was to use |String.split| to break the input up to the
         * error position along newlines and derive the line and column from
         * there. However IE's |split| implementation is so broken that it was
         * enough to prevent it.
         */
        
        var line = 1;
        var column = 1;
        var seenCR = false;
        
        for (var i = 0; i < Math.max(pos, rightmostFailuresPos); i++) {
          var ch = input.charAt(i);
          if (ch === "\n") {
            if (!seenCR) { line++; }
            column = 1;
            seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            line++;
            column = 1;
            seenCR = true;
          } else {
            column++;
            seenCR = false;
          }
        }
        
        return { line: line, column: column };
      }
      
      
      var result = parseFunctions[startRule]();
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        var offset = Math.max(pos, rightmostFailuresPos);
        var found = offset < input.length ? input.charAt(offset) : null;
        var errorPosition = computeErrorPosition();
        
        throw new this.SyntaxError(
          cleanupExpected(rightmostFailuresExpected),
          found,
          offset,
          errorPosition.line,
          errorPosition.column
        );
      }
      
      return result;
    },
    
    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(expected, found, offset, line, column) {
    function buildMessage(expected, found) {
      var expectedHumanized, foundHumanized;
      
      switch (expected.length) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[0];
          break;
        default:
          expectedHumanized = expected.slice(0, expected.length - 1).join(", ")
            + " or "
            + expected[expected.length - 1];
      }
      
      foundHumanized = found ? quote(found) : "end of input";
      
      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
    }
    
    this.name = "SyntaxError";
    this.expected = expected;
    this.found = found;
    this.message = buildMessage(expected, found);
    this.offset = offset;
    this.line = line;
    this.column = column;
  };
  
  result.SyntaxError.prototype = Error.prototype;
  
  return result;
});

define('lib/dependshandler',[
    "jquery",
    "./depends_parse"
], function($, parser) {
    function DependsHandler($el, expression) {
        var $context = $el.closest("form");
        if (!$context.length)
            $context=$(document);
        this.$el=$el;
        this.$context=$context;
        this.ast=parser.parse(expression);  // TODO: handle parse exceptions here
    }

    DependsHandler.prototype = {
        _findInputs: function(name) {
            var $input = this.$context.find(":input[name='"+name+"']");
            if (!$input.length)
                $input=$("#"+name);
            return $input;
        },

        _getValue: function(name) {
            var $input = this._findInputs(name);
            if (!$input.length)
                return null;

            if ($input.attr("type")==="radio" || $input.attr("type")==="checkbox")
                return $input.filter(":checked").val() || null;
            else
                return $input.val();
        },
        
        getAllInputs: function() {
            var todo = [this.ast],
                $inputs = $(),
                node;

            while (todo.length) {
                node=todo.shift();
                if (node.input)
                    $inputs=$inputs.add(this._findInputs(node.input));
                if (node.children && node.children.length)
                    todo.push.apply(todo, node.children);
            }
            return $inputs;
        },

        _evaluate: function(node) {
            var value = node.input ? this._getValue(node.input) : null,
                i;

            switch (node.type) {
                case "NOT":
                    return !this._evaluate(node.children[0]);
                case "AND":
                    for (i=0; i<node.children.length; i++)
                        if (!this._evaluate(node.children[i]))
                            return false;
                    return true;
                case "OR":
                    for (i=0; i<node.children.length; i++)
                        if (this._evaluate(node.children[i]))
                            return true;
                    return false;
                case "comparison":
                    switch (node.operator) {
                        case "=":
                            return node.value==value;
                        case "!=":
                            return node.value!=value;
                        case "<=":
                            return value<=node.value;
                        case "<":
                            return value<node.value;
                        case ">":
                            return value>node.value;
                        case ">=":
                            return value>=node.value;
                        case "~=":
                            if (value===null)
                                return false;
                            return value.indexOf(node.value)!=-1;
                    }
                    break;
                case "truthy":
                    return !!value;
            }
        },

        evaluate: function() {
            return this._evaluate(this.ast);
        }
    };

    return DependsHandler;
});


/**
 * Patterns depends - show/hide/disable content based on form status
 *
 * Copyright 2012-2013 Florian Friesdorf
 * Copyright 2012-2013 Simplon B.V. - Wichert Akkerman
 */
define('pat/depends',[
    "jquery",
    "../registry",
    "../utils",
    "../core/logger",
    "../lib/dependshandler",
    "../core/parser"
], function($, patterns, utils, logging, DependsHandler, Parser) {
    var log = logging.getLogger("depends"),
        parser = new Parser("depends");

    parser.add_argument("condition");
    parser.add_argument("action", "show", ["show", "enable"]);
    parser.add_argument("transition", "none", ["none", "css", "fade", "slide"]);
    parser.add_argument("effect-duration", "fast");
    parser.add_argument("effect-easing", "swing");

    var depends = {
        name: "depends",
        trigger: ".pat-depends",
        jquery_plugin: true,

        transitions: {
            none: {hide: "hide", show: "show"},
            fade: {hide: "fadeOut", show: "fadeIn"},
            slide: {hide: "slideUp", show: "slideDown"}
        },

        init: function($el, opts) {
            return $el.each(function() {
                var slave = this,
                    $slave = $(this),
                    options = parser.parse($slave, opts),
                    handler, state;

                try {
                    handler=new DependsHandler($slave, options.condition);
                } catch (e) {
                    log.error("Invalid condition: " + e.message, slave);
                    return;
                }

                state=handler.evaluate();
                switch (options.action) {
                    case "show":
                        if (state)
                            $slave.show();
                        else
                            $slave.hide();
                        break;
                    case "enable":
                        if (state)
                            depends._enable($slave);
                        else
                            depends._disable($slave);
                        break;
                }

                var data = {handler: handler,
                            options: options,
                            slave: slave};

                handler.getAllInputs().each(function() {
                    if (this.form) {
                        var $form = $(this.form),
                            slaves = $form.data("patDepends.slaves");
                        if (!slaves) {
                            slaves=[data];
                            $form.on("reset.pat-depends", depends.onReset);
                        } else if (slaves.indexOf(data)===-1)
                            slaves.push(data);
                        $form.data("patDepends.slaves", slaves);
                    }
                    $(this).on("change.pat-depends", null, data, depends.onChange);
                    $(this).on("keyup.pat-depends", null, data, depends.onChange);
                });
            });
        },

        onReset: function(event) {
            var slaves = $(this).data("patDepends.slaves"),
                i;

            setTimeout(function() {
                for (i=0; i<slaves.length; i++) {
                    event.data=slaves[i];
                    depends.onChange(event);
                }
            }, 50);
        },

        _enable: function($slave) {
            if ($slave.is(":input"))
                $slave[0].disabled=null;
            else if ($slave.is("a"))
                $slave.off("click.patternDepends");
            $slave.removeClass("disabled");
        },

        _disable: function($slave) {
            if ($slave.is(":input"))
                $slave[0].disabled="disabled";
            else if ($slave.is("a"))
                $slave.on("click.patternDepends", depends.blockDefault);
            $slave.addClass("disabled");
        },

        onChange: function(event) {
            var handler = event.data.handler,
                options = event.data.options,
                slave = event.data.slave,
                $slave = $(slave),
                state = handler.evaluate();

            switch (options.action) {
                case "show":
                    utils.hideOrShow($slave, state, options, depends.name);
                    break;
                case "enable":
                    if (state)
                        depends._enable($slave);
                    else
                        depends._disable($slave);
                    break;
            }
        },

        blockDefault: function(event) {
            event.preventDefault();
        }
    };

    patterns.register(depends);
    return depends; // XXX for tests only
});

// jshint indent: 4, browser: true, jquery: true, quotmark: double
// vim: sw=4 expandtab
;
/**
 * equaliser - Equalise height of elements in a row
 *
 * Copyright 2013 Simplon B.V. - Wichert Akkerman
 */
define('pat/equaliser',[
    "jquery",
    "../registry",
    "../core/parser",
    "../utils"
], function($, patterns, Parser, utils) {
    var parser = new Parser("equaliser");
    parser.add_argument("transition", "none", ["none", "grow"]);
    parser.add_argument("effect-duration", "fast");
    parser.add_argument("effect-easing", "swing");

    var equaliser = {
        name: "equaliser",
        trigger: ".pat-equaliser",

        init: function($el, opts) {
            return $el.each(function() {
                var $container = $(this),
                    options = parser.parse($container, opts);
                $container.data("pat-equaliser", options);
                $container.on("pat-update.pat-equaliser", null, this, equaliser._onEvent);
                $(window).on("resize.pat-equaliser", null, this, utils.debounce(equaliser._onEvent, 100));
                equaliser._update(this);
            });
        },

        _update: function(container) {
            var $container = $(container),
                options = $container.data("pat-equaliser"),
                $children = $container.children(),
                max_height = 0;

            for (var i=0; i<$children.length; i++) {
                var $child = $children.eq(i),
                    css = $child.css("height"),
                    height;
                $child.css("height", "").removeClass("equalised");
                height=$child.height();
                if (height>max_height)
                    max_height=height;
                if (css)
                    $child.css("height", css);
            }

            var new_css = {height: max_height+"px"};

            switch (options.transition) {
                case "none":
                    $children.css(new_css).addClass("equalised");
                    break;
                case "grow":
                    $children.animate(new_css, options.effect.duration, options.effect.easing, function() {
                        $(this).addClass("equalised");
                    });
                    break;
            }
        },

        _onEvent: function(event) {
            equaliser._update(event.data);
        }
    };

    patterns.register(equaliser);
    return equaliser;
});



/**
 * Patterns toggle - toggle class on click
 *
 * Copyright 2012 Simplon B.V. - Wichert Akkerman
 * Copyright 2011 Humberto Sermeño
 * Copyright 2011 SYSLAB.COM GmbH
 */
define('pat/toggle',[
    "jquery",
    "../registry",
    "../core/logger",
    "../core/parser",
    "../core/store"
], function($, patterns, logger, Parser, store) {
    var log = logger.getLogger("pat.toggle"),
        parser = new Parser("toggle");

    parser.add_argument("selector");
    parser.add_argument("attr", "class");
    parser.add_argument("value");
    parser.add_argument("store", "none", ["none", "session", "local"]);

    var toggle = {
        name: "toggle",
        trigger: ".pat-toggle",

        init: function($el) {
            return $el.each(function() {
                var $trigger = $(this),
                    options = toggle._validateOptions(this, parser.parse($trigger, true)),
                    state = {toggled: false, options: options},
                    i, storage;

                if (!options.length)
                    return;

                if (options[0].store!=="none") {
                    storage=(options[0].store==="local" ? store.local : store.session)(toggle.name);
                    if (storage.get(this.id))
                        state.toggled=true;
                }

                if (state.toggled)
                    for (i=0; i<options.length; i++)
                        toggle._update(options[i].selector, options[i].attr, options[i].value, true);

                $trigger
                    .off(".toggle")
                    .data("patternToggle", state)
                    .on("click.toggle", toggle.onClick);
            });
        },

        _validateOptions: function(trigger, options) {
            var correct=[],
                i, option, store_error;

            if (!options.length)
                return correct;

            if (options[0].store!=="none") {
                if (!trigger.id) {
                    log.warn("state persistance requested, but element has no id");
                    options[0].store="none";
                } else if (!store.supported) {
                    store_error="browser does not support webstorage";
                    log.warn("state persistance requested, but browser does not support webstorage");
                    options[0].store="none";
                }
            }


            for (i=0; i<options.length; i++) {
                option=options[i];
                if (i && option.store!=="none") {
                    log.warn("store option can only be set on first argument");
                    option.store="none";
                }

                if (!option.selector || !option.attr || !option.value)
                    log.error("Toggle pattern requires selector, attr and value.");
                else
                    correct.push(option);
            }
            return correct;
        },

        onClick: function(event) {
            var $trigger = $(this),
                state = $trigger.data("patternToggle"),
                option, i;

            state.toggled=!state.toggled;
            $trigger.data("patternToggle", state);

            if (state.options[0].store!=="none") {
                var storage=(state.options[0].store==="local" ? store.local : store.session)(toggle.name);
                if (state.toggled)
                    storage.set(this.id, true);
                else
                    storage.remove(this.id);
            }

            for (i=0; i<state.options.length; i++) {
                option=state.options[i];
                toggle._update(option.selector, option.attr, option.value, false);
            }
            event.preventDefault();
        },

        _update: function(selector, attr, value, reset) {
            var $targets = $(selector),
                $target;

            if (!$targets.length)
                return;

            if (attr==="class") {
                $targets.toggleClass(value);
            } else {
                for (var i=0; i<$targets.length; i++) {
                    $target=$targets.eq(i);
                    if ($target.attr(attr)) {
                        if (reset)
                            $target.removeAttr(attr);
                        else
                            $target.prop(attr, false);
                    } else {
                        if (reset)
                            $target.attr(attr, attr);
                        else
                            $target.prop(attr, true);
                    }
                }
            }
            $targets.trigger("pat-update", {pattern: "toggle"});
        }
    };

    patterns.register(toggle);
    return toggle; // XXX for tests only
});

// jshint indent: 4, browser: true, jquery: true, quotmark: double
// vim: sw=4 expandtab
;
/**
 * StyleFix 1.0.3 & PrefixFree 1.0.7
 * @author Lea Verou
 * MIT license
 */

(function(){

if(!window.addEventListener) {
	return;
}

var self = window.StyleFix = {
	link: function(link) {
		try {
			// Ignore stylesheets with data-noprefix attribute as well as alternate stylesheets
			if(link.rel !== 'stylesheet' || link.hasAttribute('data-noprefix')) {
				return;
			}
		}
		catch(e) {
			return;
		}

		var url = link.href || link.getAttribute('data-href'),
		    base = url.replace(/[^\/]+$/, ''),
		    base_scheme = (/^[a-z]{3,10}:/.exec(base) || [''])[0],
		    base_domain = (/^[a-z]{3,10}:\/\/[^\/]+/.exec(base) || [''])[0],
		    base_query = /^([^?]*)\??/.exec(url)[1],
		    parent = link.parentNode,
		    xhr = new XMLHttpRequest(),
		    process;
		
		xhr.onreadystatechange = function() {
			if(xhr.readyState === 4) {
				process();
			}
		};

		process = function() {
				var css = xhr.responseText;
				
				if(css && link.parentNode && (!xhr.status || xhr.status < 400 || xhr.status > 600)) {
					css = self.fix(css, true, link);
					
					// Convert relative URLs to absolute, if needed
					if(base) {
						css = css.replace(/url\(\s*?((?:"|')?)(.+?)\1\s*?\)/gi, function($0, quote, url) {
							if(/^([a-z]{3,10}:|#)/i.test(url)) { // Absolute & or hash-relative
								return $0;
							}
							else if(/^\/\//.test(url)) { // Scheme-relative
								// May contain sequences like /../ and /./ but those DO work
								return 'url("' + base_scheme + url + '")';
							}
							else if(/^\//.test(url)) { // Domain-relative
								return 'url("' + base_domain + url + '")';
							}
							else if(/^\?/.test(url)) { // Query-relative
								return 'url("' + base_query + url + '")';
							}
							else {
								// Path-relative
								return 'url("' + base + url + '")';
							}
						});

						// behavior URLs shoudn’t be converted (Issue #19)
						// base should be escaped before added to RegExp (Issue #81)
						var escaped_base = base.replace(/([\\\^\$*+[\]?{}.=!:(|)])/g,"\\$1");
						css = css.replace(RegExp('\\b(behavior:\\s*?url\\(\'?"?)' + escaped_base, 'gi'), '$1');
						}
					
					var style = document.createElement('style');
					style.textContent = css;
					style.media = link.media;
					style.disabled = link.disabled;
					style.setAttribute('data-href', link.getAttribute('href'));
					
					parent.insertBefore(style, link);
					parent.removeChild(link);
					
					style.media = link.media; // Duplicate is intentional. See issue #31
				}
		};

		try {
			xhr.open('GET', url);
			xhr.send(null);
		} catch (e) {
			// Fallback to XDomainRequest if available
			if (typeof XDomainRequest != "undefined") {
				xhr = new XDomainRequest();
				xhr.onerror = xhr.onprogress = function() {};
				xhr.onload = process;
				xhr.open("GET", url);
				xhr.send(null);
			}
		}
		
		link.setAttribute('data-inprogress', '');
	},

	styleElement: function(style) {
		if (style.hasAttribute('data-noprefix')) {
			return;
		}
		var disabled = style.disabled;
		
		style.textContent = self.fix(style.textContent, true, style);
		
		style.disabled = disabled;
	},

	styleAttribute: function(element) {
		var css = element.getAttribute('style');
		
		css = self.fix(css, false, element);
		
		element.setAttribute('style', css);
	},
	
	process: function() {
		// Linked stylesheets
		$('link[rel="stylesheet"]:not([data-inprogress])').forEach(StyleFix.link);
		
		// Inline stylesheets
		$('style').forEach(StyleFix.styleElement);
		
		// Inline styles
		$('[style]').forEach(StyleFix.styleAttribute);
	},
	
	register: function(fixer, index) {
		(self.fixers = self.fixers || [])
			.splice(index === undefined? self.fixers.length : index, 0, fixer);
	},
	
	fix: function(css, raw, element) {
		for(var i=0; i<self.fixers.length; i++) {
			css = self.fixers[i](css, raw, element) || css;
		}
		
		return css;
	},
	
	camelCase: function(str) {
		return str.replace(/-([a-z])/g, function($0, $1) { return $1.toUpperCase(); }).replace('-','');
	},
	
	deCamelCase: function(str) {
		return str.replace(/[A-Z]/g, function($0) { return '-' + $0.toLowerCase() });
	}
};

/**************************************
 * Process styles
 **************************************/
(function(){
	setTimeout(function(){
		$('link[rel="stylesheet"]').forEach(StyleFix.link);
	}, 10);
	
	document.addEventListener('DOMContentLoaded', StyleFix.process, false);
})();

function $(expr, con) {
	return [].slice.call((con || document).querySelectorAll(expr));
}

})();

/**
 * PrefixFree
 */
(function(root){

if(!window.StyleFix || !window.getComputedStyle) {
	return;
}

// Private helper
function fix(what, before, after, replacement, css) {
	what = self[what];
	
	if(what.length) {
		var regex = RegExp(before + '(' + what.join('|') + ')' + after, 'gi');

		css = css.replace(regex, replacement);
	}
	
	return css;
}

var self = window.PrefixFree = {
	prefixCSS: function(css, raw, element) {
		var prefix = self.prefix;
		
		// Gradient angles hotfix
		if(self.functions.indexOf('linear-gradient') > -1) {
			// Gradients are supported with a prefix, convert angles to legacy
			css = css.replace(/(\s|:|,)(repeating-)?linear-gradient\(\s*(-?\d*\.?\d*)deg/ig, function ($0, delim, repeating, deg) {
				return delim + (repeating || '') + 'linear-gradient(' + (90-deg) + 'deg';
			});
		}
		
		css = fix('functions', '(\\s|:|,)', '\\s*\\(', '$1' + prefix + '$2(', css);
		css = fix('keywords', '(\\s|:)', '(\\s|;|\\}|$)', '$1' + prefix + '$2$3', css);
		css = fix('properties', '(^|\\{|\\s|;)', '\\s*:', '$1' + prefix + '$2:', css);
		
		// Prefix properties *inside* values (issue #8)
		if (self.properties.length) {
			var regex = RegExp('\\b(' + self.properties.join('|') + ')(?!:)', 'gi');
			
			css = fix('valueProperties', '\\b', ':(.+?);', function($0) {
				return $0.replace(regex, prefix + "$1")
			}, css);
		}
		
		if(raw) {
			css = fix('selectors', '', '\\b', self.prefixSelector, css);
			css = fix('atrules', '@', '\\b', '@' + prefix + '$1', css);
		}
		
		// Fix double prefixing
		css = css.replace(RegExp('-' + prefix, 'g'), '-');
		
		// Prefix wildcard
		css = css.replace(/-\*-(?=[a-z]+)/gi, self.prefix);
		
		return css;
	},
	
	property: function(property) {
		return (self.properties.indexOf(property)? self.prefix : '') + property;
	},
	
	value: function(value, property) {
		value = fix('functions', '(^|\\s|,)', '\\s*\\(', '$1' + self.prefix + '$2(', value);
		value = fix('keywords', '(^|\\s)', '(\\s|$)', '$1' + self.prefix + '$2$3', value);
		
		// TODO properties inside values
		
		return value;
	},
	
	// Warning: Prefixes no matter what, even if the selector is supported prefix-less
	prefixSelector: function(selector) {
		return selector.replace(/^:{1,2}/, function($0) { return $0 + self.prefix })
	},
	
	// Warning: Prefixes no matter what, even if the property is supported prefix-less
	prefixProperty: function(property, camelCase) {
		var prefixed = self.prefix + property;
		
		return camelCase? StyleFix.camelCase(prefixed) : prefixed;
	}
};

/**************************************
 * Properties
 **************************************/
(function() {
	var prefixes = {},
		properties = [],
		shorthands = {},
		style = getComputedStyle(document.documentElement, null),
		dummy = document.createElement('div').style;
	
	// Why are we doing this instead of iterating over properties in a .style object? Cause Webkit won't iterate over those.
	var iterate = function(property) {
		if(property.charAt(0) === '-') {
			properties.push(property);
			
			var parts = property.split('-'),
				prefix = parts[1];
				
			// Count prefix uses
			prefixes[prefix] = ++prefixes[prefix] || 1;
			
			// This helps determining shorthands
			while(parts.length > 3) {
				parts.pop();
				
				var shorthand = parts.join('-');

				if(supported(shorthand) && properties.indexOf(shorthand) === -1) {
					properties.push(shorthand);
				}
			}
		}
	},
	supported = function(property) {
		return StyleFix.camelCase(property) in dummy;
	}
	
	// Some browsers have numerical indices for the properties, some don't
	if(style.length > 0) {
		for(var i=0; i<style.length; i++) {
			iterate(style[i])
		}
	}
	else {
		for(var property in style) {
			iterate(StyleFix.deCamelCase(property));
		}
	}

	// Find most frequently used prefix
	var highest = {uses:0};
	for(var prefix in prefixes) {
		var uses = prefixes[prefix];

		if(highest.uses < uses) {
			highest = {prefix: prefix, uses: uses};
		}
	}
	
	self.prefix = '-' + highest.prefix + '-';
	self.Prefix = StyleFix.camelCase(self.prefix);
	
	self.properties = [];

	// Get properties ONLY supported with a prefix
	for(var i=0; i<properties.length; i++) {
		var property = properties[i];
		
		if(property.indexOf(self.prefix) === 0) { // we might have multiple prefixes, like Opera
			var unprefixed = property.slice(self.prefix.length);
			
			if(!supported(unprefixed)) {
				self.properties.push(unprefixed);
			}
		}
	}
	
	// IE fix
	if(self.Prefix == 'Ms' 
	  && !('transform' in dummy) 
	  && !('MsTransform' in dummy) 
	  && ('msTransform' in dummy)) {
		self.properties.push('transform', 'transform-origin');	
	}
	
	self.properties.sort();
})();

/**************************************
 * Values
 **************************************/
(function() {
// Values that might need prefixing
var functions = {
	'linear-gradient': {
		property: 'backgroundImage',
		params: 'red, teal'
	},
	'calc': {
		property: 'width',
		params: '1px + 5%'
	},
	'element': {
		property: 'backgroundImage',
		params: '#foo'
	},
	'cross-fade': {
		property: 'backgroundImage',
		params: 'url(a.png), url(b.png), 50%'
	}
};


functions['repeating-linear-gradient'] =
functions['repeating-radial-gradient'] =
functions['radial-gradient'] =
functions['linear-gradient'];

var keywords = {
	'initial': 'color',
	'zoom-in': 'cursor',
	'zoom-out': 'cursor',
	'box': 'display',
	'flexbox': 'display',
	'inline-flexbox': 'display',
	'flex': 'display',
	'inline-flex': 'display'
};

self.functions = [];
self.keywords = [];

var style = document.createElement('div').style;

function supported(value, property) {
	style[property] = '';
	style[property] = value;

	return !!style[property];
}

for (var func in functions) {
	var test = functions[func],
		property = test.property,
		value = func + '(' + test.params + ')';
	
	if (!supported(value, property)
	  && supported(self.prefix + value, property)) {
		// It's supported, but with a prefix
		self.functions.push(func);
	}
}

for (var keyword in keywords) {
	var property = keywords[keyword];

	if (!supported(keyword, property)
	  && supported(self.prefix + keyword, property)) {
		// It's supported, but with a prefix
		self.keywords.push(keyword);
	}
}

})();

/**************************************
 * Selectors and @-rules
 **************************************/
(function() {

var 
selectors = {
	':read-only': null,
	':read-write': null,
	':any-link': null,
	'::selection': null
},

atrules = {
	'keyframes': 'name',
	'viewport': null,
	'document': 'regexp(".")'
};

self.selectors = [];
self.atrules = [];

var style = root.appendChild(document.createElement('style'));

function supported(selector) {
	style.textContent = selector + '{}';  // Safari 4 has issues with style.innerHTML
	
	return !!style.sheet.cssRules.length;
}

for(var selector in selectors) {
	var test = selector + (selectors[selector]? '(' + selectors[selector] + ')' : '');
		
	if(!supported(test) && supported(self.prefixSelector(test))) {
		self.selectors.push(selector);
	}
}

for(var atrule in atrules) {
	var test = atrule + ' ' + (atrules[atrule] || '');
	
	if(!supported('@' + test) && supported('@' + self.prefix + test)) {
		self.atrules.push(atrule);
	}
}

root.removeChild(style);

})();

// Properties that accept properties as their value
self.valueProperties = [
	'transition',
	'transition-property'
]

// Add class for current prefix
root.className += ' ' + self.prefix;

StyleFix.register(self.prefixCSS);


})(document.documentElement);

define('prefixfree', ['prefixfree/prefixfree'], function (main) { return main; });

define("prefixfree/prefixfree", function(){});
require(['registry', "modernizr", "pat/bumper", "pat/collapsible", "pat/depends", "pat/equaliser", "pat/inject", "pat/toggle", "prefixfree"], function(r){r.init();});