L.MarkerStreamingGeneralizeGroup = L.MarkerGeneralizeGroup.extend({
    initialize: function(options) {
        L.MarkerGeneralizeGroup.prototype.initialize.call(this, options);

        this._workerOptions = {
            checkMarkersIntersection: options.checkMarkersIntersection,
            checkMarkerMinimumLevel: options.checkMarkerMinimumLevel,
            getMarkerFields: options.getMarkerFields,
            getMarkerId: options.getMarkerId,
            validateGroup: this._validateGroup
        };

        this._worker = L.MarkerClassCalculation.createCalculationWorker(this._workerOptions);
    },

    addLayers: function(layersArray) {
        var that = this;
        if (this._layersCount > 0) {
            // split to chunks, except first time
            for (var i = 0; i < layersArray.length; i+= this.options.chunkSize) {
                L.MarkerGeneralizeGroup.prototype.addLayers.call(this, layersArray.slice(i, i + that.options.chunkSize));
            }
        } else {
            L.MarkerGeneralizeGroup.prototype.addLayers.call(this, layersArray);
        }
        return this;
    },

    /////////////////////////////////////////////////////////////////////////////////////////////////////


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
            that._calculateMarkersClassForZoom(layersChunk, zoomsToCalculate[k], function(zm) {
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

        var incomingEventName = 'markersChunkReady';
        var outgoingEventName = 'calc';

        var message = {
            levels: levels,
            markers: this._flattenMarkers(layersChunk),
            currentZoom: zoom
        };

        /*
            TODO:
            - Посмотреть где еще можно разблочить евент-луп, а где наоборот это излишне.
            - Разобраться, кто замораживает основной поток в первые секунды. Возможно это какие-то форматтеры. Может запрос на маркеры тоже в воркер унести?
         */

        this._worker.registerExpectedReturns(outgoingEventName, incomingEventName);

        this._worker.registerMsgHandler(incomingEventName, function(event) {
            if (that._map.getZoom() == event.zoom) {
                setTimeout(function() {
                    that._invalidateMarkers(null, event.zoomClasses);
                }, 0);
            } else {
                for (var i in event.zoomClasses) {
                    that._applyClasses(that._layersById[i], event.zoomClasses, event.zoom);
                }
            }
        });

        this._worker.registerMsgHandler('markersProcessingFinished', function(event) {
            if (event.zoom == that._map.getZoom()) {
                that.fireEvent('invalidationFinish');
            }
            callback(event.zoom);
        });

        setTimeout(function() {
            that._worker.send(outgoingEventName, message);
        }, 0);
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
     * set marker classes on current zoom
     * @param event             for moveend event
     * @param zoomLevelsList   for partial invalidation
     * @private
     */
    _invalidateMarkers: function(event, zoomLevelsList) {
        var zoom = this._map.getZoom();

        var pixelBounds = this._map.getPixelBounds();
        var width = (pixelBounds.max.x - pixelBounds.min.x) * this.options.viewportHideOffset;
        var height = (pixelBounds.max.y - pixelBounds.min.y) * this.options.viewportHideOffset;

        pixelBounds.min._subtract({x: width, y: height});
        pixelBounds.max._add({x: width, y: height});

        if (!zoomLevelsList) {
            this.eachLayer(function(marker) {
                this._invalidateSingleMarker(marker, pixelBounds, zoom);
            }, this);
        } else {
            for (var i in zoomLevelsList) {
                this._applyClasses(this._layersById[i], zoomLevelsList, zoom);
                this._invalidateSingleMarker(this._layersById[i], pixelBounds, zoom);
            }
        }
    }
});

