
(function ($) {
    "use strict";
    var pluginName = "growraf", pluginVersion = "0.4.5";
    var options = {
        series: {
            grow: {
                active: false,
                //stepDelay: 20,
                //steps: 100,
                duration: 1000,
                valueIndex: 1,
                reanimate: true,
                growings: [
                    {
                        valueIndex: 1,
                        stepMode: "linear",
                        stepDirection: "up",
                        reanimate: "continue"
                    }
                ],
                debug: { active: false, createDocuTemplate: null }
            }
        }
    };

    /** @enum {number} */
    var GrowPhase = {
        NOT_PLOTTED_YET: 0,
        PLOTTED_SOME_FRAMES: 1,
        PLOTTED_LAST_FRAME: 2
    };

    var growFunctions = {
        none: function (dataj, timePassed, growing, growPhase) {
            if (growPhase === GrowPhase.NOT_PLOTTED_YET) {
                for (var i = 0, djdatalen = dataj.data.length; i < djdatalen; i++) {
                    dataj.data[i][growing.valueIndex] = dataj.dataOrg[i][growing.valueIndex];
                }
            }
        },
        linear: function (dataj, timePassed, growing, growPhase) {
            var normTimePassed = Math.min(timePassed, dataj.grow.duration);
            for (var i = 0, djdatalen = dataj.data.length; i < djdatalen; i++) {
                var originalValue = dataj.dataOrg[i][growing.valueIndex];

                if (originalValue !== null) {
                    if (growing.stepDirection === 'up') {
                        dataj.data[i][growing.valueIndex] = originalValue / dataj.grow.duration * normTimePassed;
                    }
                    else if (growing.stepDirection === 'down') {
                        dataj.data[i][growing.valueIndex] = originalValue + (dataj.yaxis.max - originalValue) / dataj.grow.duration * (dataj.grow.duration - normTimePassed);
                    }
                } else {
                    dataj.data[i][growing.valueIndex] = null;
                }
            }
        },
        maximum: function (dataj, timePassed, growing, growPhase) {
            var normTimePassed = Math.min(timePassed, dataj.grow.duration);
            for (var i = 0, djdatalen = dataj.data.length; i < djdatalen; i++) {
                var originalValue = dataj.dataOrg[i][growing.valueIndex];

                if (originalValue !== null) {
                    if (growing.stepDirection === 'up') {
                        if (originalValue >= 0) {
                            dataj.data[i][growing.valueIndex] = Math.min(originalValue, dataj.yaxis.max / dataj.grow.duration * normTimePassed);
                        } else {
                            dataj.data[i][growing.valueIndex] = Math.max(originalValue, dataj.yaxis.min / dataj.grow.duration * normTimePassed);
                        }
                    }
                    else if (growing.stepDirection === 'down') {
                        if (originalValue >= 0) {
                            dataj.data[i][growing.valueIndex] = Math.max(originalValue, dataj.yaxis.max / dataj.grow.duration * (dataj.grow.duration - normTimePassed));
                        } else {
                            dataj.data[i][growing.valueIndex] = Math.min(originalValue, dataj.yaxis.min / dataj.grow.duration * (dataj.grow.duration - normTimePassed));
                        }
                    }
                } else {
                    dataj.data[i][growing.valueIndex] = null;
                }
            }
        },
        delay: function (dataj, timePassed, growing, growPhase) {
            if (timePassed >= dataj.grow.duration) {
                for (var i = 0, djdatalen = dataj.data.length; i < djdatalen; i++) {
                    dataj.data[i][growing.valueIndex] = dataj.dataOrg[i][growing.valueIndex];
                }
            }
        },
        reanimate: function (dataj, timePassed, growing, growPhase) {
            var normTimePassed = Math.min(timePassed, dataj.grow.duration);
            for (var i = 0, djdatalen = dataj.data.length; i < djdatalen; i++) {
                var targetValue = dataj.dataOrg[i][growing.valueIndex];

                if (targetValue === null) {
                    dataj.data[i][growing.valueIndex] = null;
                } else if (dataj.dataOld) {
                    var oldData = dataj.dataOld[i][growing.valueIndex];
                    dataj.data[i][growing.valueIndex] = oldData + (targetValue - oldData) / dataj.grow.duration * normTimePassed;
                }
            }
        }
    };

    var requestAnimationFrame;
    var cancelAnimationFrame;
    polyfillLocalRequestAnimationFrame();

    function init(plot) {
        // State variables
        var processSeriesDone = false;
        var initGrowingLoop = true;
        var startTime = 0, timePassed = 0, growPhase = GrowPhase.NOT_PLOTTED_YET;
        var dataOld = [];

        var growfunc;
        var plt = plot;
        var data = null;
        var opt = null;
        var serie = null;// for debug
        plot.hooks.drawSeries.push(processSeries);
        plot.hooks.draw.push(drawDone);
        plot.hooks.bindEvents.push(processbindEvents);
        plot.hooks.shutdown.push(shutdown);


        function createDocuTemplate() {
            var z, frm;
            z = $.plot.JUMExample.docuObjectToTemplate(
                [{ name: "data", tree: serie.data },
                { name: "options.series.grow", tree: options.series.grow, takeDefault: true },
                { name: "options.series.grow", tree: opt.series.grow },
                { name: "options.series.editMode", tree: options.series.editMode, takeDefault: true },
                { name: "options.series.editMode", tree: opt.series.editMode },
                { name: "options.series.nearBy", tree: options.series.nearBy, takeDefault: true },
                { name: "options.series.nearBy", tree: opt.series.nearBy }
                ], pluginName);
            $.plot.JUMExample.extendDocuObject(z, pluginName);
            frm = $.plot.JUMExample.docuObjectToEdit(z, "");
            return { data: z, form: frm };
        }

        function processSeries(plot, canvascontext, series) {
            opt = plot.getOptions();
            var valueIndex = opt.series.grow.valueIndex;
            if (opt.series.grow.active === true) {
                if (opt.series.grow.debug.active === true) {
                    serie = series;
                    opt.series.grow.debug.createDocuTemplate = createDocuTemplate;
                }

                var reanimate = false;
                var j = 0;
                if (opt.series.grow.reanimate && growPhase === GrowPhase.PLOTTED_LAST_FRAME) {
                    // reset animation state
                    processSeriesDone = false;
                    growPhase = GrowPhase.NOT_PLOTTED_YET;
                    startTime = 0;

                    // restore old data from the tempory variable to the actual plot data
                    data = plot.getData();
                    var minLen = Math.min(data.length, dataOld.length);
                    for (j = 0; j < minLen; j++) {
                        data[j].dataOld = dataOld[j];
                    }

                    reanimate = true;
                    initGrowingLoop = true;
                }

                if (!processSeriesDone) {
                    // do not refetch the data in case of a reanimate,
                    // so that a single setData is called
                    if (!reanimate) {
                        data = plot.getData();
                    }

                    growPhase = GrowPhase.NOT_PLOTTED_YET;
                    startTime = +new Date() | 0;
                    dataOld = [];
                    for (j = 0; j < data.length; j++) {
                        var dataj = data[j];
                        // deep cloning the original data
                        dataj.dataOrg = $.extend(true, [], dataj.data);
                        // keep the data in a temporary array, in case a reanimation is requested
                        dataOld.push(dataj.dataOrg);

                        if (!reanimate) {
                            // set zero or null initial data values.
                            for (var i = 0; i < dataj.data.length; i++) {
                                dataj.data[i][valueIndex] = dataj.dataOrg[i][valueIndex] === null ? null : 0;
                            }
                        }
                    }
                    plot.setData(data);
                    processSeriesDone = true;
                }
            }
        }

        function drawDone(plot, canvascontext) {
            if (initGrowingLoop === true) {
                initiateGrowingLoop(plot);
            }
        }

        function initiateGrowingLoop(plot) {
            opt = plot.getOptions();
            if (opt.series.grow.active === true) {
                calculateMaxDuration(plot.getData(), opt);

                startTime = +new Date() | 0;
                growfunc = requestAnimationFrame(growingLoop);
            }
            initGrowingLoop = false;
        }

        function calculateMaxDuration(data, opt) {
            var maxDuration = opt.series.grow.duration;
            for (var j = 0, datalen = data.length; j < datalen; j++) {
                var datajDuration = data[j].grow.duration;
                if (maxDuration < datajDuration) {
                    maxDuration = datajDuration;
                }
            }
            opt.series.grow.duration = maxDuration;
        }

        function processbindEvents(plot, eventHolder) {
            if (isPluginRegistered('resize')) {
                plot.getPlaceholder().resize(onResize);
            }
        }

        function growingLoop() {
            timePassed = (+new Date()) - startTime | 0;
            for (var j = 0, datalen = data.length; j < datalen; j++) {
                var dataj = data[j];
                var isReAnimation = dataj.dataOld && dataj.dataOld.length > 0;

                for (var g = 0, glen = dataj.grow.growings.length; g < glen; g++) {
                    var growing = dataj.grow.growings[g];
                    var func;

                    if (isReAnimation && growing.reanimate !== 'reinit') {
                        if (typeof growing.reanimate === 'function') {
                            func = growing.reanimate;
                        } if (growing.reanimate === 'continue') {
                            func = growFunctions.reanimate;
                        } else {// if (growing.reanimate === 'none')
                            func = growFunctions.none;
                        }
                    } else if (typeof growing.stepMode === 'function') {
                        func = growing.stepMode;
                    } else {
                        // if stepMode does not exist, use 'none'
                        func = growFunctions[growing.stepMode] || growFunctions.none;
                    }
                    func(dataj, timePassed, growing, growPhase);
                }
            }

            plt.setData(data);
            plt.draw();

            if (growPhase === GrowPhase.NOT_PLOTTED_YET) {
                growPhase = GrowPhase.PLOTTED_SOME_FRAMES;
            }

            if (timePassed < opt.series.grow.duration) {
                growfunc = requestAnimationFrame(growingLoop);
            } else {
                growPhase = GrowPhase.PLOTTED_LAST_FRAME;
                growfunc = null;
                plt.getPlaceholder().trigger('growFinished');
            }
        }

        function onResize() {
            if (growfunc) {
                for (var j = 0; j < data.length; j++) {
                    var dataj = data[j];
                    // deep cloning the original data
                    dataj.data = $.extend(true, [], dataj.dataOrg);
                }
                plot.setData(data);
                plot.setupGrid();
            }
        }

        function shutdown(plot, eventHolder) {
            plot.getPlaceholder().unbind('resize', onResize);
            if (growfunc) {
                cancelAnimationFrame(growfunc);
                growfunc = null;
            }
        }
    }

    function isPluginRegistered(pluginName) {
        var plugins = $.plot.plugins;

        for (var i = 0, len = plugins.length; i < len; i++) {
            var plug = plugins[i];

            if (plug.name === pluginName) {
                return true;
            }
        }
        return false;
    }

    // Derived from:
    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    // http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating
    // requestAnimationFrame polyfill by Erik Möller
    // fixes from Paul Irish and Tino Zijdel
    function polyfillLocalRequestAnimationFrame() {
        var rAF = window.requestAnimationFrame;
        var cAF = window.cancelAnimationFrame;

        var lastTime = +new Date();
        var vendors = ['ms', 'moz', 'webkit', 'o'];
        for(var x = 0; x < vendors.length && !rAF; ++x) {
            rAF = window[vendors[x]+'RequestAnimationFrame'];

            cAF = window[vendors[x]+'CancelAnimationFrame'] ||
                  window[vendors[x]+'CancelRequestAnimationFrame'];
        }
        if (!rAF) {
            rAF = function(callback, element) {
                var currTime = +new Date();
                var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                var id = window.setTimeout(function() {
                    callback(currTime + timeToCall);
                }, timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }
        if (!cAF) {
            cAF = function(id) {
                clearTimeout(id);
            };
        }
        requestAnimationFrame = rAF;
        cancelAnimationFrame = cAF;
    }

    $.plot.plugins.push({
        init: init,
        options: options,
        name: pluginName,
        version: pluginVersion
    });
})(jQuery);