(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.rbush = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
    'use strict';

    module.exports = rbush;

    var quickselect = require('quickselect');

    function rbush(maxEntries, format) {
        if (!(this instanceof rbush)) return new rbush(maxEntries, format);

        // max entries in a node is 9 by default; min node fill is 40% for best performance
        this._maxEntries = Math.max(4, maxEntries || 9);
        this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));

        if (format) {
            this._initFormat(format);
        }

        this.clear();
    }

    L.Util.rbush = rbush;

    rbush.prototype = {

        all: function () {
            return this._all(this.data, []);
        },

        search: function (bbox) {

            var node = this.data,
                result = [],
                toBBox = this.toBBox;

            if (!intersects(bbox, node)) return result;

            var nodesToSearch = [],
                i, len, child, childBBox;

            while (node) {
                for (i = 0, len = node.children.length; i < len; i++) {

                    child = node.children[i];
                    childBBox = node.leaf ? toBBox(child) : child;

                    if (intersects(bbox, childBBox)) {
                        if (node.leaf) result.push(child);
                        else if (contains(bbox, childBBox)) this._all(child, result);
                        else nodesToSearch.push(child);
                    }
                }
                node = nodesToSearch.pop();
            }

            return result;
        },

        collides: function (bbox) {

            var node = this.data,
                toBBox = this.toBBox;

            if (!intersects(bbox, node)) return false;

            var nodesToSearch = [],
                i, len, child, childBBox;

            while (node) {
                for (i = 0, len = node.children.length; i < len; i++) {

                    child = node.children[i];
                    childBBox = node.leaf ? toBBox(child) : child;

                    if (intersects(bbox, childBBox)) {
                        if (node.leaf || contains(bbox, childBBox)) return true;
                        nodesToSearch.push(child);
                    }
                }
                node = nodesToSearch.pop();
            }

            return false;
        },

        load: function (data) {
            if (!(data && data.length)) return this;

            if (data.length < this._minEntries) {
                for (var i = 0, len = data.length; i < len; i++) {
                    this.insert(data[i]);
                }
                return this;
            }

            // recursively build the tree with the given data from stratch using OMT algorithm
            var node = this._build(data.slice(), 0, data.length - 1, 0);

            if (!this.data.children.length) {
                // save as is if tree is empty
                this.data = node;

            } else if (this.data.height === node.height) {
                // split root if trees have the same height
                this._splitRoot(this.data, node);

            } else {
                if (this.data.height < node.height) {
                    // swap trees if inserted one is bigger
                    var tmpNode = this.data;
                    this.data = node;
                    node = tmpNode;
                }

                // insert the small tree into the large tree at appropriate level
                this._insert(node, this.data.height - node.height - 1, true);
            }

            return this;
        },

        insert: function (item) {
            if (item) this._insert(item, this.data.height - 1);
            return this;
        },

        clear: function () {
            this.data = createNode([]);
            return this;
        },

        remove: function (item, equalsFn) {
            if (!item) return this;

            var node = this.data,
                bbox = this.toBBox(item),
                path = [],
                indexes = [],
                i, parent, index, goingUp;

            // depth-first iterative tree traversal
            while (node || path.length) {

                if (!node) { // go up
                    node = path.pop();
                    parent = path[path.length - 1];
                    i = indexes.pop();
                    goingUp = true;
                }

                if (node.leaf) { // check current node
                    index = findItem(item, node.children, equalsFn);

                    if (index !== -1) {
                        // item found, remove the item and condense tree upwards
                        node.children.splice(index, 1);
                        path.push(node);
                        this._condense(path);
                        return this;
                    }
                }

                if (!goingUp && !node.leaf && contains(node, bbox)) { // go down
                    path.push(node);
                    indexes.push(i);
                    i = 0;
                    parent = node;
                    node = node.children[0];

                } else if (parent) { // go right
                    i++;
                    node = parent.children[i];
                    goingUp = false;

                } else node = null; // nothing found
            }

            return this;
        },

        toBBox: function (item) { return item; },

        compareMinX: compareNodeMinX,
        compareMinY: compareNodeMinY,

        toJSON: function () { return this.data; },

        fromJSON: function (data) {
            this.data = data;
            return this;
        },

        _all: function (node, result) {
            var nodesToSearch = [];
            while (node) {
                if (node.leaf) result.push.apply(result, node.children);
                else nodesToSearch.push.apply(nodesToSearch, node.children);

                node = nodesToSearch.pop();
            }
            return result;
        },

        _build: function (items, left, right, height) {

            var N = right - left + 1,
                M = this._maxEntries,
                node;

            if (N <= M) {
                // reached leaf level; return leaf
                node = createNode(items.slice(left, right + 1));
                calcBBox(node, this.toBBox);
                return node;
            }

            if (!height) {
                // target height of the bulk-loaded tree
                height = Math.ceil(Math.log(N) / Math.log(M));

                // target number of root entries to maximize storage utilization
                M = Math.ceil(N / Math.pow(M, height - 1));
            }

            node = createNode([]);
            node.leaf = false;
            node.height = height;

            // split the items into M mostly square tiles

            var N2 = Math.ceil(N / M),
                N1 = N2 * Math.ceil(Math.sqrt(M)),
                i, j, right2, right3;

            multiSelect(items, left, right, N1, this.compareMinX);

            for (i = left; i <= right; i += N1) {

                right2 = Math.min(i + N1 - 1, right);

                multiSelect(items, i, right2, N2, this.compareMinY);

                for (j = i; j <= right2; j += N2) {

                    right3 = Math.min(j + N2 - 1, right2);

                    // pack each entry recursively
                    node.children.push(this._build(items, j, right3, height - 1));
                }
            }

            calcBBox(node, this.toBBox);

            return node;
        },

        _chooseSubtree: function (bbox, node, level, path) {

            var i, len, child, targetNode, area, enlargement, minArea, minEnlargement;

            while (true) {
                path.push(node);

                if (node.leaf || path.length - 1 === level) break;

                minArea = minEnlargement = Infinity;

                for (i = 0, len = node.children.length; i < len; i++) {
                    child = node.children[i];
                    area = bboxArea(child);
                    enlargement = enlargedArea(bbox, child) - area;

                    // choose entry with the least area enlargement
                    if (enlargement < minEnlargement) {
                        minEnlargement = enlargement;
                        minArea = area < minArea ? area : minArea;
                        targetNode = child;

                    } else if (enlargement === minEnlargement) {
                        // otherwise choose one with the smallest area
                        if (area < minArea) {
                            minArea = area;
                            targetNode = child;
                        }
                    }
                }

                node = targetNode || node.children[0];
            }

            return node;
        },

        _insert: function (item, level, isNode) {

            var toBBox = this.toBBox,
                bbox = isNode ? item : toBBox(item),
                insertPath = [];

            // find the best node for accommodating the item, saving all nodes along the path too
            var node = this._chooseSubtree(bbox, this.data, level, insertPath);

            // put the item into the node
            node.children.push(item);
            extend(node, bbox);

            // split on node overflow; propagate upwards if necessary
            while (level >= 0) {
                if (insertPath[level].children.length > this._maxEntries) {
                    this._split(insertPath, level);
                    level--;
                } else break;
            }

            // adjust bboxes along the insertion path
            this._adjustParentBBoxes(bbox, insertPath, level);
        },

        // split overflowed node into two
        _split: function (insertPath, level) {

            var node = insertPath[level],
                M = node.children.length,
                m = this._minEntries;

            this._chooseSplitAxis(node, m, M);

            var splitIndex = this._chooseSplitIndex(node, m, M);

            var newNode = createNode(node.children.splice(splitIndex, node.children.length - splitIndex));
            newNode.height = node.height;
            newNode.leaf = node.leaf;

            calcBBox(node, this.toBBox);
            calcBBox(newNode, this.toBBox);

            if (level) insertPath[level - 1].children.push(newNode);
            else this._splitRoot(node, newNode);
        },

        _splitRoot: function (node, newNode) {
            // split root node
            this.data = createNode([node, newNode]);
            this.data.height = node.height + 1;
            this.data.leaf = false;
            calcBBox(this.data, this.toBBox);
        },

        _chooseSplitIndex: function (node, m, M) {

            var i, bbox1, bbox2, overlap, area, minOverlap, minArea, index;

            minOverlap = minArea = Infinity;

            for (i = m; i <= M - m; i++) {
                bbox1 = distBBox(node, 0, i, this.toBBox);
                bbox2 = distBBox(node, i, M, this.toBBox);

                overlap = intersectionArea(bbox1, bbox2);
                area = bboxArea(bbox1) + bboxArea(bbox2);

                // choose distribution with minimum overlap
                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    index = i;

                    minArea = area < minArea ? area : minArea;

                } else if (overlap === minOverlap) {
                    // otherwise choose distribution with minimum area
                    if (area < minArea) {
                        minArea = area;
                        index = i;
                    }
                }
            }

            return index;
        },

        // sorts node children by the best axis for split
        _chooseSplitAxis: function (node, m, M) {

            var compareMinX = node.leaf ? this.compareMinX : compareNodeMinX,
                compareMinY = node.leaf ? this.compareMinY : compareNodeMinY,
                xMargin = this._allDistMargin(node, m, M, compareMinX),
                yMargin = this._allDistMargin(node, m, M, compareMinY);

            // if total distributions margin value is minimal for x, sort by minX,
            // otherwise it's already sorted by minY
            if (xMargin < yMargin) node.children.sort(compareMinX);
        },

        // total margin of all possible split distributions where each node is at least m full
        _allDistMargin: function (node, m, M, compare) {

            node.children.sort(compare);

            var toBBox = this.toBBox,
                leftBBox = distBBox(node, 0, m, toBBox),
                rightBBox = distBBox(node, M - m, M, toBBox),
                margin = bboxMargin(leftBBox) + bboxMargin(rightBBox),
                i, child;

            for (i = m; i < M - m; i++) {
                child = node.children[i];
                extend(leftBBox, node.leaf ? toBBox(child) : child);
                margin += bboxMargin(leftBBox);
            }

            for (i = M - m - 1; i >= m; i--) {
                child = node.children[i];
                extend(rightBBox, node.leaf ? toBBox(child) : child);
                margin += bboxMargin(rightBBox);
            }

            return margin;
        },

        _adjustParentBBoxes: function (bbox, path, level) {
            // adjust bboxes along the given tree path
            for (var i = level; i >= 0; i--) {
                extend(path[i], bbox);
            }
        },

        _condense: function (path) {
            // go through the path, removing empty nodes and updating bboxes
            for (var i = path.length - 1, siblings; i >= 0; i--) {
                if (path[i].children.length === 0) {
                    if (i > 0) {
                        siblings = path[i - 1].children;
                        siblings.splice(siblings.indexOf(path[i]), 1);

                    } else this.clear();

                } else calcBBox(path[i], this.toBBox);
            }
        },

        _initFormat: function (format) {
            // data format (minX, minY, maxX, maxY accessors)

            // uses eval-type function compilation instead of just accepting a toBBox function
            // because the algorithms are very sensitive to sorting functions performance,
            // so they should be dead simple and without inner calls

            var compareArr = ['return a', ' - b', ';'];

            this.compareMinX = new Function('a', 'b', compareArr.join(format[0]));
            this.compareMinY = new Function('a', 'b', compareArr.join(format[1]));

            this.toBBox = new Function('a',
                'return {minX: a' + format[0] +
                ', minY: a' + format[1] +
                ', maxX: a' + format[2] +
                ', maxY: a' + format[3] + '};');
        }
    };

    function findItem(item, items, equalsFn) {
        if (!equalsFn) return items.indexOf(item);

        for (var i = 0; i < items.length; i++) {
            if (equalsFn(item, items[i])) return i;
        }
        return -1;
    }

// calculate node's bbox from bboxes of its children
    function calcBBox(node, toBBox) {
        distBBox(node, 0, node.children.length, toBBox, node);
    }

// min bounding rectangle of node children from k to p-1
    function distBBox(node, k, p, toBBox, destNode) {
        if (!destNode) destNode = createNode(null);
        destNode.minX = Infinity;
        destNode.minY = Infinity;
        destNode.maxX = -Infinity;
        destNode.maxY = -Infinity;

        for (var i = k, child; i < p; i++) {
            child = node.children[i];
            extend(destNode, node.leaf ? toBBox(child) : child);
        }

        return destNode;
    }

    function extend(a, b) {
        a.minX = Math.min(a.minX, b.minX);
        a.minY = Math.min(a.minY, b.minY);
        a.maxX = Math.max(a.maxX, b.maxX);
        a.maxY = Math.max(a.maxY, b.maxY);
        return a;
    }

    function compareNodeMinX(a, b) { return a.minX - b.minX; }
    function compareNodeMinY(a, b) { return a.minY - b.minY; }

    function bboxArea(a)   { return (a.maxX - a.minX) * (a.maxY - a.minY); }
    function bboxMargin(a) { return (a.maxX - a.minX) + (a.maxY - a.minY); }

    function enlargedArea(a, b) {
        return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
            (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
    }

    function intersectionArea(a, b) {
        var minX = Math.max(a.minX, b.minX),
            minY = Math.max(a.minY, b.minY),
            maxX = Math.min(a.maxX, b.maxX),
            maxY = Math.min(a.maxY, b.maxY);

        return Math.max(0, maxX - minX) *
            Math.max(0, maxY - minY);
    }

    function contains(a, b) {
        return a.minX <= b.minX &&
            a.minY <= b.minY &&
            b.maxX <= a.maxX &&
            b.maxY <= a.maxY;
    }

    function intersects(a, b) {
        return b.minX <= a.maxX &&
            b.minY <= a.maxY &&
            b.maxX >= a.minX &&
            b.maxY >= a.minY;
    }

    function createNode(children) {
        return {
            children: children,
            height: 1,
            leaf: true,
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity
        };
    }

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach

    function multiSelect(arr, left, right, n, compare) {
        var stack = [left, right],
            mid;

        while (stack.length) {
            right = stack.pop();
            left = stack.pop();

            if (right - left <= n) continue;

            mid = left + Math.ceil((right - left) / n / 2) * n;
            quickselect(arr, mid, left, right, compare);

            stack.push(left, mid, mid, right);
        }
    }

},{"quickselect":2}],2:[function(require,module,exports){
    'use strict';

    module.exports = partialSort;

// Floyd-Rivest selection algorithm:
// Rearrange items so that all items in the [left, k] range are smaller than all items in (k, right];
// The k-th element will have the (k - left + 1)th smallest value in [left, right]

    function partialSort(arr, k, left, right, compare) {

        while (right > left) {
            if (right - left > 600) {
                var n = right - left + 1;
                var m = k - left + 1;
                var z = Math.log(n);
                var s = 0.5 * Math.exp(2 * z / 3);
                var sd = 0.5 * Math.sqrt(z * s * (n - s) / n) * (m - n / 2 < 0 ? -1 : 1);
                var newLeft = Math.max(left, Math.floor(k - m * s / n + sd));
                var newRight = Math.min(right, Math.floor(k + (n - m) * s / n + sd));
                partialSort(arr, k, newLeft, newRight, compare);
            }

            var t = arr[k];
            var i = left;
            var j = right;

            swap(arr, left, k);
            if (compare(arr[right], t) > 0) swap(arr, left, right);

            while (i < j) {
                swap(arr, i, j);
                i++;
                j--;
                while (compare(arr[i], t) < 0) i++;
                while (compare(arr[j], t) > 0) j--;
            }

            if (compare(arr[left], t) === 0) swap(arr, left, j);
            else {
                j++;
                swap(arr, j, right);
            }

            if (j <= k) left = j + 1;
            if (k <= j) right = j - 1;
        }
    }

    function swap(arr, i, j) {
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    function defaultCompare(a, b) {
        return a < b ? -1 : a > b ? 1 : 0;
    }

},{}]},{},[1])(1)
});

/**
 * Icon internal classes mechanism
 * Adds possibility to assign css classes to icon even if it is not rendered (yet).
 * Classes will be assigned to icon when it is rendered.
 */
L.MarkerClassList = function(marker) {
    this._classList = {};
    this._marker = marker;
};

L.Util.extend(L.MarkerClassList.prototype, {
    add: function(className) {
        this._classList[className] = 1;
        if (this._marker._icon) {
            L.DomUtil.addClass(this._marker._icon, className);
        }
        return this;
    },
    remove: function(className) {
        delete this._classList[className];
        if (this._marker._icon) {
            L.DomUtil.removeClass(this._marker._icon, className);
        }
        return this;
    },
    contains: function(className) {
        return !!this._classList[className];
    },
    clear: function() {
        if (this._marker._icon) {
                for (var className in this._classList) {
                    L.DomUtil.removeClass(this._marker._icon, className);
                }
        }
        this._classList = {};
    },
    toString: function() {
        if (Object.keys) {
            return Object.keys(this._classList).join(' ');
        } else {
            var classList = '';
            for (var i in this._classList) {
                classList += i +' ';
            }
        }
    },
    _addClasses: function() {
        if (!this._marker._icon) {
            return;
        }
        for (var className in this._classList) {
            L.DomUtil.addClass(this._marker._icon, className);
        }
    }
});

L.markerClassList = function (marker) {
    return new L.MarkerClassList(marker);
};


/**
 * Extended marker:
 * - has options to prevent deletion or hide during generalization
 * - makes use of internal class list being applied to icon node
 */
L.MarkerEx = L.Marker.extend({
    /**
     * If we can use extended powers of current marker.
     */
    _extended: true,


    /**
     * Augment parent method to apply class names when icon is added on map
     * @param map
     */
    onAdd: function (map) {
        L.Marker.prototype.onAdd.apply(this, arguments);

        if (this._immunityLevel == this.IMMUNITY.NO_DELETE) {
            this._icon.style.display = 'block';
        }

        this.classes._addClasses();
    },

    getEvents: function() {
        this._zoomAnimated = false;
        return L.Marker.prototype.getEvents.apply(this, arguments);
    },

    /**
     * Determine removal possibility and hide marker if required.
     * @returns {boolean} If marker should be removed from map
     */
    onBeforeRemove: function() {
        if (this._immunityLevel == this.IMMUNITY.NO_HIDE) {
            return false;
        }

        if (this._immunityLevel == this.IMMUNITY.NO_DELETE) {
            this._icon.style.display = 'none';
            return false;
        }

        return true;
    },

    initialize: function() {
        L.Marker.prototype.initialize.apply(this, arguments);
        this.classes = L.markerClassList(this);
    },

    /**
     * Marker immunity mechanism
     */
    IMMUNITY: {
        NONE: 0, // Simple marker
        NO_DELETE: 1, // Will stay on map during generalization (DOM node of the icon will not be deleted).
        NO_HIDE: 2 // Will not be neither deleted nor hidden during generalization.
    },
    _immunityLevel: null,
    immunifyForDeletion: function() {
        this._immunityLevel = this.IMMUNITY.NO_DELETE;
        return this;
    },
    immunifyForHide: function() {
        this._immunityLevel = this.IMMUNITY.NO_HIDE;
        return this;
    },
    revokeImmunity: function() {
        this._immunityLevel = this.IMMUNITY.NONE;
        return this;
    }
});

L.markerEx = function (latlng, options) {
    return new L.MarkerEx(latlng, options);
};


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
        },

        // by default Layer has overlayPane, but we work with markers
        pane: 'markerPane'
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
        var zoom = this._getMaxZoom();
        var minZoom = this._getMinZoom();
        for (; zoom >= minZoom; zoom--) {
            this._setMarkerPosition(layer, zoom);
        }
    },

    _setMarkerPosition: function(layer, zoom) {
        layer._positions[zoom] = this._map.project(layer.getLatLng(), zoom); // calculate pixel position
        layer.options.classForZoom = layer.options.classForZoom || [];
        layer.options.classForZoom[zoom] = 'HIDDEN';
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
            levels = this._getLevels(zoom),
            that = this;

        var tree = L.Util.rbush();
        var nodes = [];

        for (i = 0; i < this._priorityMarkers.length; i++) {
            currentMarker = this._prepareMarker(this._priorityMarkers[i]);
            currentLevel = getMarkerLevel(currentMarker, 0);
            nodes.push(makeNode(currentMarker, currentLevel));
        }
        tree.load(nodes);

        var seekMarkers = [],
            range;

        for (i = 0; i < this._otherMarkers.length; i++) {
            currentMarker = this._otherMarkers[i];
            range = currentMarker.data && currentMarker.data.zoomLevelsRange;
            // if data.zoomLevelsRange exists, generalize only appropriate markers
            if (!range || zoom >= range[0] && zoom <= range[1]) {
                seekMarkers.push(currentMarker);
            }
        }

        L.Util.UnblockingFor(processAllMarkers, levels.length, zoomReady);

        function processAllMarkers(levelIndex, levelsCallback) {
            var pendingMarkers = [];
            var totalMarkersCount = seekMarkers.length;

            if (levels[levelIndex].size[0] == 0 && levels[levelIndex].size[1] == 0) {
                levelsCallback();
                return;
            }

            for (var i = 0; i < totalMarkersCount; i++) {
                var currentMarker = seekMarkers[i];
                currentLevel = getMarkerLevel(currentMarker, levelIndex);

                if (that.options.checkMarkerMinimumLevel(currentMarker) <= levelIndex) {
                    var node = makeNode(currentMarker, currentLevel);

                    if (!tree.collides(node)) {
                        tree.insert(node);
                        currentMarker.options.classForZoom[zoom] = currentLevel.className;
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

        function getMarkerLevel(marker, index) {
            var markerType = marker.options.type;
            if (!markerType) {
                return levels[index];
            }
            for (var i = index; i <= levels.length; i++) {
                var levelType = levels[i].type;
                if (!levelType || levelType == markerType) {
                    return levels[i];
                }
            }
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

            var node = {
                minX: x,
                minY: y,
                maxX: x + width,
                maxY: y + height
            };

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

    _zoomStart: function() {
        this.getPane().style.display = 'none';
    },

    addLayer: function(layer) {
        this._addLayer(layer);
        if (this._map && !layer._immunityLevel) {
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
            setTimeout(this._calculateMarkersClassForEachZoom.bind(this), 0);
        }
        return this;
    },

    _removeLayer: function(layer) {
        var beforeLength = this._layers.length;
        var index;
        if ((index = this._priorityMarkers.indexOf(layer)) != -1) {
            this._priorityMarkers.splice(index, 1);
        } else if ((index = this._otherMarkers.indexOf(layer)) != -1) {
            this._otherMarkers.splice(index, 1);
        }
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
