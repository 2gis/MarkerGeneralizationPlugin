L.MarkerGeneralizeGroup = L.FeatureGroup.extend({
    options: L.MarkerGeneralizeGroupDefaults,
    initialize: function(options) {
        L.Util.setOptions(this, options);

        this._layersCount = 0;
        this._layers = {};
        this._layersById = {};
        this._zoomReady = {};

        this._priorityMarkers = [];
        this._otherMarkers = [];

        this._setMaxZoom(options.maxZoom);
        this._setMinZoom(options.minZoom);

        this.on('invalidationFinish', function() {
            this.getPane().style.display = 'block';
        });
    },

    addLayers: function(layersArray) {
        for (var i = 0; i < layersArray.length; i++) {
            this._addLayer(layersArray[i]);
            this._prepareMarker(layersArray[i]);
        }

        if (this._map) {
            this._calculateMarkersClassForEachZoom(layersArray);
        }
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

    removeLayer: function(layer) {
        if (this._removeLayer(layer)) {
            this._calculateMarkersClassForEachZoom();
            this._invalidateMarkers();
        }

        return this;
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
    },

    getEvents: function() {
        var events = {
            zoomstart: this._zoomStart,
            zoomend: this._zoomEnd,
            moveend: this._invalidateMarkers
        };

        return events;
    },

    /////////////////////////////////////////////////////////////////////////////////////////////////////

    _setMaxZoom: function(maxZoom) {
        if (!isNaN(maxZoom) && maxZoom <= 19) {
            this._maxZoom = maxZoom;
        }
    },

    _setMinZoom: function(minZoom) {
        if (!isNaN(minZoom) && minZoom >= 0) {
            if (minZoom > this._getMaxZoom()) {
                throw new Error('Min zoom must be smaller than max zoom');
            }
            this._minZoom = minZoom;
        }
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
        layer.options.classForZoom[zoom] = layer.options.classForZoom[zoom] || 'HIDDEN';
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

        this._calculateMarkersClassForZoom(layersChunk, currentZoom, function() {
            // current zoom is ready
            L.Util.UnblockingFor(function(zoomIndex, cb) {
                var z = zoomsToCalculate[zoomIndex];
                that._calculateMarkersClassForZoom(layersChunk, z, cb);
            }, zoomsToCalculate.length, function() {
                that._calculationBusy = false;
                that.fireEvent('calculationFinish');
                if (that._calculationQueued) {
                    that._calculationQueued = false;
                    that._calculateMarkersClassForEachZoom();
                }
            });
        });
    },

    /**
     * Start calculation marker styles on passed zoom
     * @param zoom {Number}  - for which zoom calculate styles
     * @param callback {Function} - calls when calculation finished
     * @private
     */
    _calculateMarkersClassForZoom: function(layersChunk, zoom, callback) {
        var i, currentLevel, currentMarker,
            tmpMarkers = {},
            levels = this._getLevels(zoom),
            that = this;

        for (i = 0; i < levels.length; i++) {
            tmpMarkers[i] = [];
        }

        var tree = L.Util.rbush();

        currentLevel = levels[0];

        for (i = 0; i < this._priorityMarkers.length; i++) {
            currentMarker = this._prepareMarker(this._priorityMarkers[i]);
            tmpMarkers[currentLevel].push(currentMarker);
            tree.insert(makeNode(currentMarker, currentLevel));
        }

        var items,
            seekMarkers = [];

        for (i = 0; i < this._otherMarkers.length; i++) {
            currentMarker = this._otherMarkers[i];
            seekMarkers.push(currentMarker);
        }

        L.Util.UnblockingFor(processAllMarkers, levels.length, zoomReady);

        function processAllMarkers(levelIndex, levelsCallback) {
            var pendingMarkers = [];
            var totalMarkersCount = seekMarkers.length;
            currentLevel = levels[levelIndex];

            if (levels[levelIndex].size[0] == 0 && levels[levelIndex].size[1] == 0) {
                levelsCallback();
                return;
            }

            for (var i = 0; i < totalMarkersCount; i++) {
                var currentMarker = seekMarkers[i];

                if (that.options.checkMarkerMinimumLevel(currentMarker) <= levelIndex) {
                    var node = makeNode(currentMarker, currentLevel);
                    items = tree.search(node);

                    if (that._validateGroup(node, items, that.options)) {
                        tree.insert(node);
                        currentMarker.options.classForZoom[zoom] = currentLevel.className;
                        tmpMarkers[levelIndex].push(currentMarker);
                    } else {
                        pendingMarkers.push(currentMarker);
                    }
                } else {
                    pendingMarkers.push(currentMarker);
                }
            }

            seekMarkers = pendingMarkers.slice();
            levelsCallback();
        }

        function zoomReady() {
            that._zoomReady[zoom] = true;
            // if finish calculate styles for current level
            if (that._map.getZoom() == zoom) that._invalidateMarkers();
            callback();
        }

        function makeNode(marker, level) {
            var safeZone = level.safeZone || 0;
            var margin = level.margin || 0;
            // For the worst scenario
            var sizeAddition = Math.max(safeZone, margin);

            if (!marker._positions[zoom]) {
                that._setMarkerPosition(marker, zoom);
            }

            var x = marker._positions[zoom].x - level.offset[0] - sizeAddition;
            var y = marker._positions[zoom].y - level.offset[1] - sizeAddition;
            var width = level.size[0] + sizeAddition * 2;
            var height =  level.size[1] + sizeAddition * 2;

            var node = [x, y, x + width, y + height];

            node.levelIndex = level.index;
            node.marker = marker;
            node.safeZone = safeZone;
            node.margin = margin;
            node.markerX = marker._positions[zoom].x + level.markerOffset[0];
            node.markerY = marker._positions[zoom].y + level.markerOffset[1];
            node.markerHeight = level.size[1];
            node.markerWidth = level.size[0];

            return node;
        }
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
     * Check if marker intersect found markers from tree
     * @param currMarker
     * @param items
     * @returns {boolean}
     * @private
     */
    _validateGroup: function(currMarker, items, ops) {
        if (items.length == 0) return true;
        var i;

        for (i = 0; i < items.length; i++) {
            if (!ops.checkMarkersIntersection(currMarker, items[i])) {
                return false;
            }
        }
        return true;
    },

    /**
     * set marker classes on current zoom
     * @private
     */
    _invalidateMarkers: function() {
        var zoom = this._map.getZoom();

        if (!this._zoomReady[zoom]) return;

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

                    if (markerState != groupClass) {
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

        this.fireEvent('invalidationFinish');
    },

    _applyClasses: function(marker, zoomClasses, zoom) {
        var markerId = this.options.getMarkerId(marker);
        if (zoomClasses[markerId] && zoomClasses[markerId][zoom] && marker.options.classForZoom[zoom]) {
            marker.options.classForZoom[zoom] = zoomClasses[markerId][zoom];
        }
    },

    _invalidateSingleMarker: function(marker, pixelBounds, zoom) {
        var groupClass = marker.options.classForZoom[zoom];
        var markerPos = marker._positions[zoom];
        var markerState = marker.options.state;
        var preRemove = marker.onBeforeRemove || function() {
            return true;
        };

        marker.options.state = groupClass;

        if (marker._immunityLevel) {
            if (!marker._map) {
                this._map.addLayer(marker);
            }

            if (markerState != groupClass && groupClass != 'HIDDEN') {
                L.DomUtil.addClass(marker._icon, groupClass);
            }

            return;
        }

        if (!pixelBounds.contains(markerPos)) { // not in viewport -> hide & remove
            groupClass = 'HIDDEN';
            if (preRemove.apply(marker)) {
                this._map.removeLayer(marker);
            }
        }

        if (markerState != groupClass && groupClass != 'HIDDEN') {
            if (!marker._map) {
                this._map.addLayer(marker);
            }

            if (groupClass) {
                if (markerState && markerState != 'HIDDEN') {
                    L.DomUtil.removeClass(marker._icon, markerState);
                }
                L.DomUtil.addClass(marker._icon, groupClass);
            }
        }
    },

    _zoomStart: function() {
        this.getPane().style.display = 'none';
    },

    _zoomEnd: function() {
        this.getPane().style.display = 'block';
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
        this._layersCount++;
        this._layersById[this.options.getMarkerId(layer)] = layer;
        L.LayerGroup.prototype.addLayer.call(this, layer);
        if (oldMap) {
            this._map = oldMap;
        }
    },

    _removeLayer: function(layer) {
        var beforeLength = this._layers.length;
        this._layersCount--;
        delete this._layersById[this.options.getMarkerId(layer)];
        L.LayerGroup.prototype.removeLayer.call(this, layer);
        return beforeLength - this._layers.length != 0;
    }
});

