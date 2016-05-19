L.MarkerClassCalculation = {
    webWorkerMain: function () {
        try {
            var i;
            var items;
            var rTrees = {};
            var rbush; // rbush implementation passthrough

            function processAllMarkers(levelIndex, workerData) {
                var i;
                var items;
                var pendingMarkers = [];
                var zoomClasses = {};
                var totalMarkesCount = workerData.seekMarkers.length;
                workerData.currentLevel = workerData.levels[levelIndex];

                if (workerData.currentLevel.size[0] == 0 && workerData.currentLevel.size[1] == 0) {
                    send({
                        type: 'markersProcessingFinished',
                        markers: [],
                        zoom: workerData.currentZoom
                    });
                    return;
                }

                for (i = 0; i < totalMarkesCount; i++) {
                    var currentMarker = workerData.seekMarkers[i];

                    if (options.checkMarkerMinimumLevel(currentMarker) <= levelIndex) {
                        var node = makeNode(currentMarker, workerData.currentLevel, workerData.currentZoom);
                        items = rTrees[workerData.currentZoom].search(node);

                        if (options.validateGroup(node, items, options)) {
                            rTrees[workerData.currentZoom].insert(node);
                            var markerId = options.getMarkerId(currentMarker);
                            zoomClasses[markerId] = zoomClasses[markerId] || {};
                            zoomClasses[markerId][workerData.currentZoom] = zoomClasses[markerId][workerData.currentZoom] || workerData.currentLevel.className;
                        } else {
                            pendingMarkers.push(currentMarker);
                        }
                    } else {
                        pendingMarkers.push(currentMarker);
                    }
                }

                workerData.seekMarkers = pendingMarkers.slice();
                send({
                    type: 'markersChunkReady',
                    zoomClasses: zoomClasses,
                    priorityLevel: levelIndex,
                    zoom: workerData.currentZoom
                });
            }

            function makeNode(marker, level, currentZoom) {
                var safeZone = level.safeZone || 0;
                var margin = level.margin || 0;
                // For the worst scenario
                var sizeAddition = Math.max(safeZone, margin);

                var x = marker._positions[currentZoom].x - level.offset[0] - sizeAddition;
                var y = marker._positions[currentZoom].y - level.offset[1] - sizeAddition;
                var width = level.size[0] + sizeAddition * 2;
                var height = level.size[1] + sizeAddition * 2;

                var node = [x, y, x + width, y + height];

                node.levelIndex = level.index;
                node.marker = marker;
                node.safeZone = safeZone;
                node.margin = margin;
                node.markerX = marker._positions[currentZoom].x + level.markerOffset[0];
                node.markerY = marker._positions[currentZoom].y + level.markerOffset[1];
                node.markerHeight = level.size[1];
                node.markerWidth = level.size[0];

                return node;
            }

            registerMsgHandler('calc', function (opts) {
                if (!rbush) {
                    // should instantiate on first call
                    // will fail in global scope: rbush script is not imported on that moment
                    rbush = options.rbush();
                }

                var i;
                send({
                    type: 'markersProcessingStarted'
                });

                // shared
                if (!rTrees[opts.currentZoom]) {
                    rTrees[opts.currentZoom] = rbush();
                }

                var workerData = {
                    seekMarkers: [],
                    currentZoom: opts.currentZoom,
                    markers: opts.markers,
                    levels: opts.levels, // priority levels, not zooms
                    currentLevel: opts.levels[0]
                };

                for (i = 0; i < workerData.markers.length; i++) {
                    if (workerData.markers[i].showAlways) {
                        rTrees[opts.currentZoom].insert(makeNode(workerData.markers[i], workerData.currentLevel, workerData.currentZoom));
                    }

                    if (workerData.markers[i]._generalizationImmune) {
                        continue;
                    }

                    if (!workerData.markers[i].showAlways) {
                        workerData.seekMarkers.push(workerData.markers[i]);
                    }
                }

                for (i = 0; i < workerData.levels.length; i++) {
                    processAllMarkers(i, workerData);
                }

                send({
                    type: 'markersProcessingFinished',
                    zoom: workerData.currentZoom
                });
            });
        } catch (e) {
            self.console.error(e);
        }
    },

    createCalculationWorker: function(options) {
        options.rbush = L.RbushSrc; // required for proper work
        return L.WebWorkerHelper.createWorker(this.webWorkerMain, options);
    }
}


