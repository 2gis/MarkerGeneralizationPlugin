/*
 * Javascript Quadtree 
 * @version 1.1
 * @author Timo Hausmann
 * https://github.com/timohausmann/quadtree-js/
 */
 
/*
 Copyright © 2012 Timo Hausmann

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENthis. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

;(function(window, Math) {
 	
	 /*
	  * Quadtree Constructor
	  * @param Object bounds		bounds of the node, object with x, y, width, height
	  * @param Integer max_objects		(optional) max objects a node can hold before splitting into 4 subnodes (default: 10)
	  * @param Integer max_levels		(optional) total max levels inside root Quadtree (default: 4) 
	  * @param Integer level		(optional) deepth level, required for subnodes  
	  */
	function Quadtree( bounds, max_objects, max_levels, level ) {
		
		this.max_objects	= max_objects || 10;
		this.max_levels		= max_levels || 4;
		
		this.level 		= level || 0;
		this.bounds 		= bounds;
		
		this.objects 		= [];
		this.nodes 		= [];
	}
	
	
	/*
	 * Split the node into 4 subnodes
	 */
	Quadtree.prototype.split = function() {
		
		var 	nextLevel	= this.level + 1,
			subWidth	= Math.round( this.bounds.width / 2 ),
			subHeight 	= Math.round( this.bounds.height / 2 ),
			x 		= Math.round( this.bounds.x ),
			y 		= Math.round( this.bounds.y );		
	 
	 	//top right node
		this.nodes[0] = new Quadtree({
			x	: x + subWidth, 
			y	: y, 
			width	: subWidth, 
			height	: subHeight
		}, this.max_objects, this.max_levels, nextLevel);
		
		//top left node
		this.nodes[1] = new Quadtree({
			x	: x, 
			y	: y, 
			width	: subWidth, 
			height	: subHeight
		}, this.max_objects, this.max_levels, nextLevel);
		
		//bottom left node
		this.nodes[2] = new Quadtree({
			x	: x, 
			y	: y + subHeight, 
			width	: subWidth, 
			height	: subHeight
		}, this.max_objects, this.max_levels, nextLevel);
		
		//bottom right node
		this.nodes[3] = new Quadtree({
			x	: x + subWidth, 
			y	: y + subHeight, 
			width	: subWidth, 
			height	: subHeight
		}, this.max_objects, this.max_levels, nextLevel);
	};
	
	
	/*
	 * Determine which node the object belongs to
	 * @param Object pRect		bounds of the area to be checked, with x, y, width, height
	 * @return Integer		index of the subnode (0-3), or -1 if pRect cannot completely fit within a subnode and is part of the parent node
	 */
	Quadtree.prototype.getIndex = function( pRect ) {
		
		var 	index 			= -1,
			verticalMidpoint 	= this.bounds.x + (this.bounds.width / 2),
			horizontalMidpoint 	= this.bounds.y + (this.bounds.height / 2),
	 
			//pRect can completely fit within the top quadrants
			topQuadrant = (pRect.y < horizontalMidpoint && pRect.y + pRect.height < horizontalMidpoint),
			
			//pRect can completely fit within the bottom quadrants
			bottomQuadrant = (pRect.y > horizontalMidpoint);
		 
		//pRect can completely fit within the left quadrants
		if( pRect.x < verticalMidpoint && pRect.x + pRect.width < verticalMidpoint ) {
			if( topQuadrant ) {
				index = 1;
			} else if( bottomQuadrant ) {
				index = 2;
			}
			
		//pRect can completely fit within the right quadrants	
		} else if( pRect.x > verticalMidpoint ) {
			if( topQuadrant ) {
				index = 0;
			} else if( bottomQuadrant ) {
				index = 3;
			}
		}
	 
		return index;
	};
	
	
	/*
	 * Insert the object into the node. If the node
	 * exceeds the capacity, it will split and add all
	 * objects to their corresponding subnodes.
	 * @param Object pRect		bounds of the object to be added, with x, y, width, height
	 */
	Quadtree.prototype.insert = function( pRect ) {
		
		var 	i = 0,
	 		index;
	 	
	 	//if we have subnodes ...
		if( typeof this.nodes[0] !== 'undefined' ) {
			index = this.getIndex( pRect );
	 
		  	if( index !== -1 ) {
				this.nodes[index].insert( pRect );	 
			 	return;
			}
		}
	 
	 	this.objects.push( pRect );
		
		if( this.objects.length > this.max_objects && this.level < this.max_levels ) {
			
			//split if we don't already have subnodes
			if( typeof this.nodes[0] === 'undefined' ) {
				this.split();
			}
			
			//add all objects to there corresponding subnodes
			while( i < this.objects.length ) {
				
				index = this.getIndex( this.objects[ i ] );
				
				if( index !== -1 ) {					
					this.nodes[index].insert( this.objects.splice(i, 1)[0] );
				} else {
					i = i + 1;
			 	}
		 	}
		}
	 };
	 
	 
	/*
	 * Return all objects that could collide with the given object
	 * @param Object pRect		bounds of the object to be checked, with x, y, width, height
	 * @Return Array		array with all detected objects
	 */
	Quadtree.prototype.retrieve = function( pRect ) {
	 	
		var 	index = this.getIndex( pRect ),
			returnObjects = this.objects;
			
		//if we have subnodes ...
		if( typeof this.nodes[0] !== 'undefined' ) {
			
			//if pRect fits into a subnode ..
			if( index !== -1 ) {
				returnObjects = returnObjects.concat( this.nodes[index].retrieve( pRect ) );
				
			//if pRect does not fit into a subnode, check it against all subnodes
			} else {
				for( var i=0; i < this.nodes.length; i=i+1 ) {
					returnObjects = returnObjects.concat( this.nodes[i].retrieve( pRect ) );
				}
			}
		}
	 
		return returnObjects;
	};
	
	
	/*
	 * Clear the quadtree
	 */
	Quadtree.prototype.clear = function() {
		
		this.objects = [];
	 
		for( var i=0; i < this.nodes.length; i=i+1 ) {
			if( typeof this.nodes[i] !== 'undefined' ) {
				this.nodes[i].clear();
				delete this.nodes[i];
		  	}
		}
	};

	//make Quadtree available in the global namespace
	window.L.Util.Quadtree = Quadtree;

})(window, Math);
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
            var distance = Math.min(currentMarker.safeZone, checkingMarker.safeZone);
            return Math.abs(currentMarker.x - checkingMarker.x) > (distance + currentMarker.width / 2 + checkingMarker.width / 2)
                || Math.abs(currentMarker.y - checkingMarker.y) > (distance + currentMarker.height / 2 + checkingMarker.height / 2);
        },
        checkMarkerMinimumLevel: function() {
            return 0;
        }
    },
    initialize: function(options) {
        L.Util.setOptions(this, options);

        this._layers = {};

        this._markers = {};
        this._priorityMarkers = [];
        this._otherMarkers = [];

        this._calculationBusy = false;
        this._calculationQueued = false;

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

    _calculateMarkersClassForEachZoom: function() {
        var that = this;

        if (this._calculationBusy) {
            this._calculationQueued = true;
            return;
        }
        this._calculationBusy = true;

        this._maxZoom = this._map.getMaxZoom();

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
            // current zoom is ready
            L.Util.UnblockingFor(function(zoomIndex, cb) {
                var z = zoomsToCalculate[zoomIndex];
                that._calculateMarkersClassForZoom(z, cb);
            }, maxZoom - 1, function() {
                that._calculationBusy = false;
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
            ops = this.options,
            that = this;

        var bounds = this._getPixelBoundsForZoom(zoom);

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

        L.Util.UnblockingFor(processAllMarkers, ops.levels.length, updateMarkerStyles);

        function processAllMarkers(levelIndex, levelsCallback) {
            currentLevel = ops.levels[levelIndex];

            if (ops.levels[levelIndex].size[0] == 0 && ops.levels[levelIndex].size[1] == 0) {
                that._markers[levelIndex] = seekMarkers.slice();
                levelsCallback();
                return;
            }

            var markersInBucket = 200;
            var totalMarkesCount = seekMarkers.length;
            var iterationsCount = Math.ceil(totalMarkesCount / markersInBucket);

            L.Util.UnblockingFor(processBucket, iterationsCount, onBucketFinish);

            function processBucket(bucketIndex, markersCallback) {
                for (var i = markersInBucket * bucketIndex; i < markersInBucket * (bucketIndex + 1) && i < totalMarkesCount; i++) {
                    if (that.options.checkMarkerMinimumLevel(seekMarkers[i]) <= levelIndex) {
                        currentMarker = makeNode(seekMarkers[i], currentLevel);
                        items = tree.retrieve(currentMarker);

                        if (that._validateGroup(currentMarker, items)) {
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
            }

            function onBucketFinish() {
                seekMarkers = pendingMarkers.slice();
                pendingMarkers = [];
                levelsCallback();
            }
        }

        function updateMarkerStyles() {
            var groupInd, markerInd, group, groupClass, currMarker;
            for (groupInd = 0; groupInd < that.options.levels.length; groupInd++) {
                groupClass = that.options.levels[groupInd].className;
                group = that.options.levels[groupInd];
                for (markerInd = 0; markerInd < that._markers[groupInd].length; markerInd++) {
                    currMarker = that._markers[groupInd][markerInd];
                    currMarker.options.classForZoom[zoom] = groupClass;
                }
            }
            // if finish calculate styles for current level
            if (that._map.getZoom() == zoom) that._invalidateMarkers();
            callback();
        }

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
        this._maxZoom = this._map.getMaxZoom();

        map.on('zoomstart', this._zoomStart, this);
        map.on('zoomend', this._zoomEnd, this);

        this.eachLayer(this._prepareMarker, this);
        this._calculateMarkersClassForEachZoom();
        L.LayerGroup.prototype.onAdd.call(this, map);
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
        index++;
        if (index < times) {
            next(index);
        } else {
            callback();
        }
    }

};
