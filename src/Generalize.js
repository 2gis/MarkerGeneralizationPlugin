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
            return Math.abs(currentMarker.markerX - checkingMarker.markerX) > (distance + currentMarker.markerWidth / 2 + checkingMarker.markerWidth / 2)
                || Math.abs(currentMarker.markerY - checkingMarker.markerY) > (distance + currentMarker.markerHeight / 2 + checkingMarker.markerHeight / 2);
        },
        checkMarkerMinimumLevel: function() {
            return 0;
        }
    },
    initialize: function(options) {
        L.Util.setOptions(this, options);

        this._layers = {};

        this._priorityMarkers = [];
        this._otherMarkers = [];

        this._calculationBusy = false;
        this._calculationQueued = false;

        this._zoomReady = {};

        this.setMaxZoom(options.maxZoom);
        this.setMinZoom(options.minZoom);

        this.on('invalidationFinish', function() {
            this._map.getPanes().markerPane.style.display = 'block';
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

        L.LayerGroup.prototype.addLayer.call(this, layer);
    },

    _prepareMarker: function(layer) {
        var zoom = this._getMaxZoom();
        var minZoom = this._getMinZoom();
        for (; zoom >= minZoom; zoom--) {
            this._setMarkerPosition(layer, zoom);
        }
    },

    _setMarkerPosition: function(layer, zoom) {
        layer._positions[zoom] = this._map.project(layer.getLatLng(), zoom); // calculate pixel position
        layer.options.classForZoom = [];
    },

    _calculateMarkersClassForEachZoom: function() {
        var that = this;

        if (this._calculationBusy) {
            this._calculationQueued = true;
            return;
        }
        this._calculationBusy = true;
        this._zoomReady = {};

        var currentZoom = this._map.getZoom();
        var maxZoom = this._getMaxZoom();
        var zoomsToCalculate = [];
        for (var z = this._getMinZoom(); z <= maxZoom; z++) {
            if (z != currentZoom) {
                zoomsToCalculate.push(z);
            }
        }
        zoomsToCalculate.sort(function(a, b) {
            return Math.abs(currentZoom - a) - Math.abs(currentZoom - b);
        });

        this._calculateMarkersClassForZoom(currentZoom, function() {
            // current zoom is ready
            L.Util.UnblockingFor(function(zoomIndex, cb) {
                var z = zoomsToCalculate[zoomIndex];
                that._calculateMarkersClassForZoom(z, cb);
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
    _calculateMarkersClassForZoom: function(zoom, callback) {
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
            currentMarker = this._prepareMarker(i);
            tmpMarkers[currentLevel].push(currentMarker);
            tree.insert(makeNode(currentMarker, currentLevel));
        }

        var items, pendingMarkers = [],
            seekMarkers = this._otherMarkers.slice();

        L.Util.UnblockingFor(processAllMarkers, levels.length, updateMarkerStyles);

        function processAllMarkers(levelIndex, levelsCallback) {
            currentLevel = levels[levelIndex];

            if (levels[levelIndex].size[0] == 0 && levels[levelIndex].size[1] == 0) {
                tmpMarkers[levelIndex] = seekMarkers.slice();
                levelsCallback();
                return;
            }

            var markersInBucket = 1000;
            var totalMarkesCount = seekMarkers.length;
            var iterationsCount = Math.ceil(totalMarkesCount / markersInBucket);

            L.Util.UnblockingFor(processBucket, iterationsCount, onBucketFinish);

            function processBucket(bucketIndex, markersCallback) {
                for (var i = markersInBucket * bucketIndex; i < markersInBucket * (bucketIndex + 1) && i < totalMarkesCount; i++) {
                    if (that.options.checkMarkerMinimumLevel(seekMarkers[i]) <= levelIndex) {
                        currentMarker = makeNode(seekMarkers[i], currentLevel);
                        items = tree.search(currentMarker);

                        if (that._validateGroup(currentMarker, items)) {
                            tree.insert(currentMarker);
                            tmpMarkers[levelIndex].push(seekMarkers[i]);
                        } else {
                            pendingMarkers.push(seekMarkers[i]);
                        }
                    } else {
                        pendingMarkers.push(seekMarkers[i]);
                    }
                }
                markersCallback();
            }

            function onBucketFinish() {
                seekMarkers = pendingMarkers.slice();
                pendingMarkers = [];
                levelsCallback();
            }
        }

        function updateMarkerStyles() {
            var groupInd, markerInd, group, groupClass, currMarker;
            for (groupInd = 0; groupInd < levels.length; groupInd++) {
                groupClass = levels[groupInd].className;
                group = levels[groupInd];
                for (markerInd = 0; markerInd < tmpMarkers[groupInd].length; markerInd++) {
                    currMarker = tmpMarkers[groupInd][markerInd];
                    currMarker.options.classForZoom[zoom] = groupClass;
                }
            }
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
    _validateGroup: function(currMarker, items) {
        if (items.length == 0) return true;
        var i, ops = this.options;

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
        var groupClass, zoom = this._map.getZoom();

        if (!this._zoomReady[zoom]) return;

        this.eachLayer(function(marker) {
            groupClass = marker.options.classForZoom[zoom];
            if (!groupClass) return; //not ready yet
            if (marker.options.state != groupClass) {
                if (marker.options.state) {
                    L.DomUtil.removeClass(marker._icon, marker.options.state);
                }
                L.DomUtil.addClass(marker._icon, groupClass);
                marker.options.state = groupClass;
            }
        }, this);

        this.fireEvent('invalidationFinish');
    },

    _hideMarkersOutOfViewPort: function() {
        var currentZoom = this._map.getZoom();
        var pixelBounds = this._map.getPixelBounds();
        var width = (pixelBounds.max.x - pixelBounds.min.x) * this.options.viewportHideOffset;
        var height = (pixelBounds.max.y - pixelBounds.min.y) * this.options.viewportHideOffset;
        this.eachLayer(function(marker) {
            var markerPos = marker._positions[currentZoom];
            if (markerPos.x > pixelBounds.min.x - width &&
                markerPos.x < pixelBounds.max.x + width &&
                markerPos.y > pixelBounds.min.y - height &&
                markerPos.y < pixelBounds.max.y + height) {
                marker._icon.style.display = '';
            } else {
                marker._icon.style.display = 'none';
            }
        });
    },

    _zoomStart: function() {
        this._map.getPanes().markerPane.style.display = 'none';
    },

    _zoomEnd: function() {
        this._invalidateMarkers();
        this._hideMarkersOutOfViewPort();
    },

    _dragEnd: function() {
        this._hideMarkersOutOfViewPort();
    },

    addLayer: function(layer) {
        this._addLayer(layer);
        if (this._map) {
            this._prepareMarker(layer);
            this._calculateMarkersClassForEachZoom();
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
            this._calculateMarkersClassForEachZoom();
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

    onAdd: function(map) {
        this._map = map;

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);
        map.on('dragend', this._dragEnd, this);

        this.eachLayer(this._prepareMarker, this);
        // wait user map manipulation to know correct init zoom
        setTimeout(this._calculateMarkersClassForEachZoom.bind(this), 0);
        L.LayerGroup.prototype.onAdd.call(this, map);
    },

    onRemove: function(map) {
        if (!this._map) return;
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);
        map.off('dragend', this._dragEnd, this);

        L.LayerGroup.prototype.onRemove.call(this, map);

        this.eachLayer(function(marker) {
            marker.options.state = '';
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

L.Util.UnblockingFor = function(iterator, times, callback) {
    callback = callback || function() {};

    var index = 0;
    next(index);

    function next(i) {
        setTimeout(function() {
            iterator(i, cb);
        }, 0);
    }

    function cb() {
        index++;
        if (index < times) {
            next(index);
        } else {
            callback();
        }
    }

};
