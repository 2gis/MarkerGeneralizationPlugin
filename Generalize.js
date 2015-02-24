L.MarkerGeneralizeGroup = L.FeatureGroup.extend({
    options: {
        levels: [
            {
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
        checkMarkersIntersection: function(currentMarker, checkingMarker) {
            var distance = Math.min(currentMarker.safeZone, currentMarker.safeZone);
            return Math.abs(currentMarker.x - checkingMarker.x) > (distance + currentMarker.width / 2 + checkingMarker.width / 2)
                || Math.abs(currentMarker.y - checkingMarker.y) > (distance + currentMarker.height / 2 + checkingMarker.height / 2);
        },
        checkMarkerMinimumLevel: function(marker) {
            var minimumLevel = 0;
            if (!(marker && marker.options && marker.options.isAdvertizing)) {
                minimumLevel = 1;
            }
            return minimumLevel;
        }
    },
    initialize: function(options) {
        L.Util.setOptions(this, options);

        this._layers = {};

        this._markers = {};
        this._priorityMarkers = [];
        this._otherMarkers = [];

        for (var i = 0; i < this.options.levels.length; i++) {
            this._markers[i] = [];
        }

        var levelId, k, level;
        for (levelId = 0; levelId < this.options.levels.length; levelId++) {
            level = this.options.levels[levelId];
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
        var markerPoint,
            zoom = this._maxZoom;
        for (; zoom >= 0; zoom--) {
            markerPoint = this._map.project(layer.getLatLng(), zoom); // calculate pixel position
            layer._positions[zoom] = markerPoint;
            layer.options.classForZoom = [];
        }
    },

    _prepareMarkers: function() {

        this._maxZoom = this._map.getMaxZoom();
        this.eachLayer(this._prepareMarker, this);

        var that = this;
        var currentZoom = this._map.getZoom();
        var maxZoom = that._map.getMaxZoom();
        var zoomsToCalculate = [];
        for (var z = 1; z <= maxZoom; z++) {
            if (z != currentZoom) {
                zoomsToCalculate.push(z);
            }
        }
        zoomsToCalculate.sort(function(a, b) {
            return Math.abs(currentZoom - a) - Math.abs(currentZoom - b);
        });

        this._calculateMarkersClassForZoom(currentZoom, function() {
            var startt = new Date();
            L.Util.UnblockingFor(function(zoomIndex, cb) {
                var z = zoomsToCalculate[zoomIndex];
                var start = new Date();
                that._calculateMarkersClassForZoom(z, function() {
                    var end = new Date();
                    console.log(z, end.getTime()-start.getTime());
                    cb();
                });
            }, maxZoom - 1, function() {
                console.log('All ready!', (new Date()).getTime()-startt.getTime());
            });
            that._invalidateMarkers();
        });
    },

    _calculateMarkersClassForZoom: function(zoom, callback) {
        var that = this;
        this._processMarkersOnOneZoom(zoom, function() {
            var groupInd, markerInd, group, groupClass, currMarker;
            for (groupInd = 0; groupInd < that.options.levels.length; groupInd++) {
                groupClass = that.options.levels[groupInd].className;
                group = that.options.levels[groupInd];
                for (markerInd = 0; markerInd < that._markers[groupInd].length; markerInd++) {
                    currMarker = that._markers[groupInd][markerInd];
                    currMarker.options.classForZoom[zoom] = groupClass;
                }
            }
            callback();
        });
    },

    _processMarkersOnOneZoom: function(zoom, callback) {
        var i, currentLevel, currentMarker, markerPos,
            ops = this.options,
            that = this;

        var minX = Number.MAX_VALUE, minY = Number.MAX_VALUE, maxX = 0, maxY = 0;

        this.eachLayer(function(marker) {
            markerPos = marker._positions[zoom];
            minX = Math.min(minX, markerPos.x);
            minY = Math.min(minY, markerPos.y);
            maxX = Math.max(maxX, markerPos.x);
            maxY = Math.max(maxY, markerPos.y);
        });

        var bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };

        for (i = 0; i < ops.levels.length; i++) {
            this._markers[i] = [];
        }

        var tree = new L.Util.Quadtree(bounds);

        currentLevel = ops.levels[0];


        for (i = 0; i < this._priorityMarkers.length; i++) {
            currentMarker = this._prepareMarker(i);
            this._markers[currentLevel].push(currentMarker);
            tree.insert(makeNode(currentMarker, currentLevel));
        }

        var items, pendingMarkers = [],
            seekMarkers = this._otherMarkers.slice();

        L.Util.UnblockingFor(function(levelIndex, levelsCallback) {
            currentLevel = ops.levels[levelIndex];

            if (ops.levels[levelIndex].size[0] == 0 && ops.levels[levelIndex].size[1] == 0) {
                that._markers[levelIndex] = seekMarkers.slice();
                levelsCallback();
                return;
            }

            var markersInBucket = 200;
            var totalMarkesCount = seekMarkers.length;
            // console.log('totalMarkesCount', totalMarkesCount);
            var iterationsCount = Math.ceil(totalMarkesCount / markersInBucket);

            L.Util.UnblockingFor(function(bucketIndex, markersCallback) {
                for (var i = markersInBucket * bucketIndex; i < markersInBucket * (bucketIndex + 1) && i < totalMarkesCount; i++) {
                    // console.log('levelIndex:', levelIndex, 'i:', i);
                    if (that.options.checkMarkerMinimumLevel(seekMarkers[i]) <= levelIndex) {
                        currentMarker = makeNode(seekMarkers[i], currentLevel);
                        items = tree.retrieve(currentMarker);

                        if (that._validateGroup(tree, currentMarker, items)) {
                            tree.insert(currentMarker);
                            that._markers[levelIndex].push(seekMarkers[i]);
                        } else {
                            pendingMarkers.push(seekMarkers[i]);
                        }
                    } else {
                        pendingMarkers.push(seekMarkers[i]);
                    }
                }
                markersCallback();
            }, iterationsCount, function() {
                seekMarkers = pendingMarkers.slice();
                pendingMarkers = [];
                levelsCallback();
            });
        }, ops.levels.length, callback);

        function makeNode(marker, level) {
            return {
                safeZone: level.safeZone,
                x: marker._positions[zoom].x + level.markerOffset[0],
                y: marker._positions[zoom].y + level.markerOffset[1],
                height: level.size[1],
                width: level.size[0]
            }
        }
    },

    _validateGroup: function(tree, currMarker, items) {
        if (items.length == 0) return true;
        var i, ops = this.options;

        for (i = 0; i < items.length; i++) {
            if (!ops.checkMarkersIntersection(currMarker, items[i])) {
                return false;
            }
        }
        return true;
    },

    _invalidateMarkers: function() {
        var groupClass, zoom = this._map.getZoom();
        this.eachLayer(function(marker) {
            groupClass = marker.options.classForZoom[zoom];
            if (marker.options.state != groupClass) {
                if (marker.options.state) {
                    L.DomUtil.removeClass(marker._icon, marker.options.state);
                }
                L.DomUtil.addClass(marker._icon, groupClass);
                marker.options.state = groupClass;
            }
        }, this);
    },

    _zoomStart: function() {
        this._map.getPanes().markerPane.style.display = 'none';
    },

    _zoomEnd: function() {
        this._invalidateMarkers();
        this._map.getPanes().markerPane.style.display = 'block';
    },

    addLayer: function(layer) {
        this._addLayer(layer);
        if (this._map) {
            this._prepareMarkers();
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
            this._prepareMarkers();
        }
        return this;
    },

    _removeLayer: function(layer) {
        var beforeLength = this._layers.length;
        L.LayerGroup.prototype.removeLayer.call(this, layer);
        console.log(beforeLength - this._layers.length != 0);
        return beforeLength - this._layers.length != 0;
    },

    removeLayer: function(layer) {
        if (this._removeLayer(layer)) {
            this._prepareMarkers();
            this._invalidateMarkers();
        }

        return this;
    },

    onAdd: function(map) {
        this._map = map;

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);

        this._prepareMarkers();
        L.LayerGroup.prototype.onAdd.call(this, map);
        this._invalidateMarkers();
    },

    onRemove: function(map) {
        if (!this._map) return;
        map.off('zoomstart', this._zoomStart, this);
        map.off('zoomend', this._zoomEnd, this);

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

        this._markers = {};
        for (i = 0; i < this.options.levels.length; i++) {
            this._markers[i] = [];
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
        // console.log('cb, index=', index);
        index++;
        if (index < times) {
            next(index);
        } else {
            callback();
        }
    }

};
