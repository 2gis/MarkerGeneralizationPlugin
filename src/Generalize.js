L.MarkerGeneralizeGroup = L.FeatureGroup.extend({
    options: {
        levels: [
            {
                margin: 30,
                safeZone: 20,
                size: [25, 40],
                offset: [12.5, 40],
                className: '_pin'
            },
            {
                safeZone: 5,
                size: [6, 6],
                className: '_bullet'
            },
            {
                safeZone: 0,
                className: '_hidden'
            }
        ],
        // In parts of viewport size.
        // 1 means there will be 1 screen in all directions of unhidden markers around the viewport.
        // 0.5 means there will be a half of the screen in all directions of unhidden markers around the viewport.
        viewportHideOffset: 1,
        checkMarkersIntersection: function(currentMarker, checkingMarker) {
            var distance = Math.max(currentMarker.safeZone, checkingMarker.margin);
            return Math.abs(currentMarker.markerX - checkingMarker.markerX) > (distance + currentMarker.markerWidth / 2 + checkingMarker.markerWidth / 2) || 
               Math.abs(currentMarker.markerY - checkingMarker.markerY) > (distance + currentMarker.markerHeight / 2 + checkingMarker.markerHeight / 2);
        },
        checkMarkerMinimumLevel: function() {
            return 0;
        },

        // by default Layer has overlayPane, but we work with markers
        pane: 'markerPane',
        getMarkerFields: function() {
            return [];
        },
        getMarkerId: function(marker) {
            return marker.id;
        }
    },
    initialize: function(options) {
        L.Util.setOptions(this, options);

        this._layers = {};

        this._priorityMarkers = [];
        this._otherMarkers = [];

        this._workerOptions = {
            checkMarkersIntersection: options.checkMarkersIntersection,
            checkMarkerMinimumLevel: options.checkMarkerMinimumLevel,
            getMarkerFields: options.getMarkerFields,
            getMarkerId: options.getMarkerId
        };

        this._workersPool = [];
        this._workersPoolSize = 1;
        this._jobQueue = [];
        this._jobsRunning = [];
        this._currentQueueIndex = 0;

        this.setMaxZoom(options.maxZoom);
        this.setMinZoom(options.minZoom);

        this.on('invalidationFinish', function() {
            this.getPane().style.display = 'block';
        });
    },

    setMaxZoom: function(maxZoom) {
        if (!isNaN(maxZoom) && maxZoom <= 19) {
            this._maxZoom = maxZoom;
        }
    },

    setMinZoom: function(minZoom) {
        if (!isNaN(minZoom) && minZoom >= 0) {
            if (minZoom > this._getMaxZoom()) {
                throw new Error('Min zoom must be smaller than max zoom');
            }
            this._minZoom = minZoom;
        }
    },

    _runJobs: function() {
        for (var i = 0; i < this._workersPoolSize; i++) {
            this._runNextJob(i);
        }
    },

    _runJob: function(poolIndex, callbacks, initMessage) {
        if (!this._workersPool[poolIndex]) {
            this._workersPool[poolIndex] = L.MarkerClassCalculation.createCalculationWorker(this._workerOptions);
        }

        for (var i in callbacks) {
            this._workersPool[poolIndex].registerMsgHandler(i, callbacks[i]);
        }
        this._workersPool[poolIndex].postMessage(initMessage);
    },

    _runNextJob: function(poolIndex) {
        if (this._jobsRunning[poolIndex]) {
            return; // already running
        }

        if (!this._jobQueue[poolIndex]) {
            return; // queue not created yet
        }

        var nextJob = this._jobQueue[poolIndex].shift();
        if (nextJob) {
            this._jobsRunning[poolIndex] = true;
            this._runJob(
                poolIndex,
                nextJob.callbacks,
                nextJob.initMessage
            );
        }
    },

    _wrapFinalCb: function(poolIndex, cb) {
        var that = this;
        return function() {
            var retVal = cb(arguments);
            that._jobsRunning[poolIndex] = false;
            setTimeout(function () {
                that._runNextJob(poolIndex);
            }, 0);
        }
    },

    _enqueueJob: function(callbacks, initMessage) {
        var that = this;
        this._jobQueue[this._currentQueueIndex] = this._jobQueue[this._currentQueueIndex] || [];
        callbacks['markersProcessingFinished'] = this._wrapFinalCb(this._currentQueueIndex, callbacks['markersProcessingFinished']);
        this._jobQueue[this._currentQueueIndex].push({
            callbacks: callbacks,
            initMessage: initMessage
        });

        this._currentQueueIndex = (this._currentQueueIndex + 1) % this._workersPoolSize;

        this._runJobs();
    },

    _getMaxZoom: function() {
        if (!isNaN(this._maxZoom)) {
            return this._maxZoom;
        } else {
            return this._map.getMaxZoom();
        }
    },

    _getMinZoom: function() {
        if (!isNaN(this._minZoom)) {
            return this._minZoom;
        } else {
            return this._map.getMinZoom();
        }
    },

    _getLevels: function(zoom) {
        var ops = this.options;

        var levels;
        if (typeof ops.levels === 'function') {
            levels = ops.levels(this._map, zoom);
        } else {
            levels = ops.levels;
        }
        return this._prepareLevels(levels);
    },

    _prepareLevels: function(levels) {
        var levelId, k, level;
        for (levelId = 0; levelId < levels.length; levelId++) {
            level = levels[levelId];
            level.index = levelId;
            level.markerOffset = [];
            level.markerDistance = [];

            if (!level.size) {
                level.size = [0, 0];
            }

            if (!level.offset) {
                level.offset = [level.size[0] / 2, level.size[1] /2];
            }

            for (k = 0; k < 2; k++) {
                level.markerOffset[k] = level.size[k] / 2 - level.offset[k];
            }
        }

        return levels;
    },

    _addLayer: function(layer) {
        layer._positions = {};

        if (layer.showAlways) {
            this._priorityMarkers.push(layer);
        } else {
            this._otherMarkers.push(layer);
        }

        var oldMap = this._map;

        // Don't allow markers to be added to map: we'll do it during invalidation.
        if (oldMap) {
            this._map = null;
        }
        L.LayerGroup.prototype.addLayer.call(this, layer);
        if (oldMap) {
            this._map = oldMap;
        }
    },

    _prepareMarker: function(layer) {
        if (layer._prepared) {
            return;
        }

        var zoom = this._getMaxZoom();
        var minZoom = this._getMinZoom();
        for (; zoom >= minZoom; zoom--) {
            this._setMarkerPosition(layer, zoom);
        }
        layer._prepared = true;
    },

    _setMarkerPosition: function(layer, zoom) {
        layer._positions[zoom] = this._map.project(layer.getLatLng(), zoom); // calculate pixel position
        layer.options.classForZoom = layer.options.classForZoom || [];
        layer.options.classForZoom[zoom] = 'HIDDEN';
    },

    _calculateMarkersClassForEachZoom: function(layersChunk) {
        var that = this;

        var currentZoom = this._map.getZoom();
        var maxZoom = this._getMaxZoom();
        var zoomsToCalculate = [];
        for (var z = this._getMinZoom(); z <= maxZoom; z++) {
            zoomsToCalculate.push(z);
        }
        zoomsToCalculate.sort(function(a, b) {
            return Math.abs(currentZoom - a) - Math.abs(currentZoom - b);
        });

        var sem = 0;
        for (var k = 0; k < zoomsToCalculate.length; k++) {
            sem++;
            that._calculateMarkersClassForZoom(layersChunk, zoomsToCalculate[k], function() {
                sem--;
                if (sem === 0) {
                    that.fireEvent('calculationFinish');
                }
            });
        }
    },

    /**
     * Start calculation marker styles on passed zoom
     * @param zoom {Number}  - for which zoom calculate styles
     * @param callback {Function} - calls when calculation finished
     * @private
     */
    _calculateMarkersClassForZoom: function(layersChunk, zoom, callback) {
        var i, currentLevel, currentMarker,
            levels = this._getLevels(zoom),
            that = this;

        var message = {
            type: 'calc',
            levels: levels,
            markers: this._flattenMarkers(layersChunk),
            currentZoom: zoom
        };

        this._enqueueJob({
            'markersChunkReady': function(event) {
                that._applyClasses(that._priorityMarkers, event.zoomClasses, event.zoom, event.priorityLevel);
                that._applyClasses(that._otherMarkers, event.zoomClasses, event.zoom, event.priorityLevel);
                if (that._map.getZoom() == event.zoom) {
                    that._invalidateMarkers();
                }
            },
            'markersProcessingFinished': function(event) {
                if (event.zoom == that._map.getZoom()) {
                    that.fireEvent('invalidationFinish');
                }
                setTimeout(callback, 0);
            }
        }, message);
    },

    _applyClasses: function(markersArray, zoomClasses, zoom, priorityLevel) {
        for (var i = 0; i < markersArray.length; i++) {
            var markerId = this.options.getMarkerId(markersArray[i]);
            if (zoomClasses[markerId] && zoomClasses[markerId][zoom] && markersArray[i].options.classForZoom[zoom]) {
                markersArray[i].options.classForZoom[zoom] = zoomClasses[markerId][zoom];
            }
        }
    },

    _flattenMarkers: function(markers) {
        if (!markers) {
            return [];
        }

        for (var i in markers) {
            this._prepareMarker(markers[i]);
        }

        var fields = ['_positions', 'showAlways'].concat(this.options.getMarkerFields());
        var result = [];

        for (var j = 0; j < markers.length; j++) {
            result[j] = {};
            for (var k = 0; k < fields.length; k++) {
                result[j][fields[k]] = markers[j][fields[k]];
            }
        }

        return result;
    },

    /**
     * Return pixel bounds of all markers for passed zoom
     * @param zoom {Number}
     * @returns {{x: Number, y: Number, width: number, height: number}}
     * @private
     */
    _getPixelBoundsForZoom: function(zoom) {
        var markerPos,
            minX = Number.MAX_VALUE,
            minY = Number.MAX_VALUE,
            maxX = 0,
            maxY = 0;

        this.eachLayer(function(marker) {

            if (!marker._positions[zoom]) {
                that._setMarkerPosition(marker, zoom);
            }

            markerPos = marker._positions[zoom];
            minX = Math.min(minX, markerPos.x);
            minY = Math.min(minY, markerPos.y);
            maxX = Math.max(maxX, markerPos.x);
            maxY = Math.max(maxY, markerPos.y);
        });

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    },

    /**
     * set marker classes on current zoom
     * @private
     */
    _invalidateMarkers: function() {
        var zoom = this._map.getZoom();

        var pixelBounds = this._map.getPixelBounds();
        var width = (pixelBounds.max.x - pixelBounds.min.x) * this.options.viewportHideOffset;
        var height = (pixelBounds.max.y - pixelBounds.min.y) * this.options.viewportHideOffset;

        pixelBounds.min._subtract({x: width, y: height});
        pixelBounds.max._add({x: width, y: height});

        this.eachLayer(function(marker) {
            var groupClass = marker.options.classForZoom[zoom];
            var markerPos = marker._positions[zoom];
            var markerState = marker.options.state;

            if (marker._immunityLevel) {
                if (!marker._map) {
                    this._map.addLayer(marker);
                }

                if (markerState != groupClass && groupClass != 'HIDDEN') {
                    L.DomUtil.addClass(marker._icon, groupClass);
                }
            }

            // if marker in viewport
            if (pixelBounds.contains(markerPos)) {
                if (groupClass != 'HIDDEN' && markerState != groupClass) {
                    if (!marker._map) {
                        this._map.addLayer(marker);
                    }

                    if (groupClass && markerState != groupClass) {
                        if (markerState && markerState != 'HIDDEN') {
                            L.DomUtil.removeClass(marker._icon, markerState);
                        }
                        L.DomUtil.addClass(marker._icon, groupClass);
                    }
                }
            } else {
                groupClass = 'HIDDEN';
            }

            if (groupClass == 'HIDDEN') {
                if (!marker.onBeforeRemove || (marker.onBeforeRemove && marker.onBeforeRemove())) {
                    this._map.removeLayer(marker);
                }
            }
            marker.options.state = groupClass;
        }, this);
    },

    _zoomStart: function() {
        this.getPane().style.display = 'none';
    },

    _zoomEnd: function() {
        this._getPane().style.display = 'block';
    },

    addLayer: function(layer) {
        this._addLayer(layer);
        if (this._map) {
            this._prepareMarker(layer);
            this._calculateMarkersClassForEachZoom([layer]);
            this._invalidateMarkers();
        }
        return this;
    },

    addLayers: function(layersArray) {
        var i;
        for (i = 0; i < layersArray.length; i++) {
            this._addLayer(layersArray[i]);
        }

        if (this._map) {
            this.eachLayer(this._prepareMarker, this);
            var that = this;
            setTimeout(function() {
                that._calculateMarkersClassForEachZoom(layersArray);
            }, 0);
        }
        return this;
    },

    _removeLayer: function(layer) {
        var beforeLength = this._layers.length;
        L.LayerGroup.prototype.removeLayer.call(this, layer);
        return beforeLength - this._layers.length != 0;
    },

    removeLayer: function(layer) {
        if (this._removeLayer(layer)) {
            this._calculateMarkersClassForEachZoom();
            this._invalidateMarkers();
        }

        return this;
    },

    getEvents: function() {
        var events = {
            zoomstart: this._zoomStart,
            zoomend: this._zoomEnd,
            moveend: this._invalidateMarkers
        };

        return events;
    },

    onAdd: function(map) {
        this._map = map;

        if (this.getLayers().length) {
            this.eachLayer(this._prepareMarker, this);
            // wait user map manipulation to know correct init zoom
            setTimeout(this._calculateMarkersClassForEachZoom.bind(this), 0);
        }
    },

    onRemove: function(map) {
        if (!this._map) return;

        L.LayerGroup.prototype.onRemove.call(this, map);

        this.eachLayer(function(marker) {
            marker.options.state = 'HIDDEN';
        });

        this._map = null;
    },

    clearLayers: function () {
        var i;
        for (i in this._layers) {
            this._removeLayer(this._layers[i]);
        }

        this._priorityMarkers = [];
        this._otherMarkers = [];
        return this;
    }

});

L.markerGeneralizeGroup = function (option) {
    return new L.MarkerGeneralizeGroup(option);
};
