import { General } from '@2gis/general';

export default L.FeatureGroup.extend({
    options: {
        levels: [
            {
                margin: 30,
                safeZone: 20,
                size: [25, 40],
                offset: [0.5, 1],
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

        bufferPart: 0.5,

        checkMarkerMinimumLevel: () => 0,

        // by default Layer has overlayPane, but we work with markers
        pane: 'markerPane'
    },

    initialize: function(options) {
        L.Util.setOptions(this, options);

        this._generalizer = new General();

        this._layers = {};

        this._priorityMarkers = [];
        this._otherMarkers = [];

        this.setMaxZoom(options.maxZoom);
        this.setMinZoom(options.minZoom);

        this._initZooms(); // Обязательно после set[Min|Max]Zoom

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
        }
        if (this._map) {
            return this._map.getMaxZoom();
        }
        return 18;
    },

    _getMinZoom: function() {
        if (!isNaN(this._minZoom)) {
            return this._minZoom;
        }
        if (this._map) {
            return this._map.getMinZoom();
        }
        return 0;
    },

    _initZooms: function() {
        this._zoomStat = {};
        const maxZoom = this._getMaxZoom();
        for (let i = this._getMinZoom(); i <= maxZoom; ++i) {
            this._zoomStat[i] = {
                ready: false,
                pending: false,
                markers: null,
                bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
            };
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
        let level;
        for (let levelId = 0; levelId < levels.length; levelId++) {
            level = levels[levelId];
            level.index = levelId;

            if (!level.size) {
                level.size = [0, 0];
            }

            if (!level.offset) {
                level.offset = [0.5, 0.5];
            }

            if (!level.margin) {
                level.margin = 0;
            }

            if (!level.safeZone) {
                level.safeZone = 0;
            }

            if (!level.degradation) {
                level.degradation = 0;
            }
        }
        return levels;
    },

    _addLayer: function(layer) {
        layer.addEventParent(this);

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

    /**
     * Возвращает размеры экрана с учётом devicePixelRatio
     */
    _getScreenBounds() {
        if (!this._map) {
            return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        const size = this._map.getSize();
        return {
            minX: 0,
            minY: 0,
            maxX: size.x * window.devicePixelRatio,
            maxY: size.y * window.devicePixelRatio
        };
    },

    /**
     * Возвращает размеры экрана с учётом devicePixelRatio и некоторого буффера вокруг
     */
    _getBounds: function() {
        const screenBounds = this._getScreenBounds();
        return {
            minX: screenBounds.minX - (screenBounds.maxX - screenBounds.minX) * this.options.bufferPart,
            minY: screenBounds.minY - (screenBounds.maxY - screenBounds.minY) * this.options.bufferPart,
            maxX: screenBounds.maxX + (screenBounds.maxX - screenBounds.minX) * this.options.bufferPart,
            maxY: screenBounds.maxY + (screenBounds.maxY - screenBounds.minY) * this.options.bufferPart
        };
    },

    _getLatLngBounds: function(pointBound, center, zoom) {
        const topLeftPoint = this._map._getTopLeftPoint(center, zoom);
        const pixelBound = new L.Bounds(
            topLeftPoint.add(L.point(pointBound.minX, pointBound.minY)),
            topLeftPoint.add(L.point(pointBound.maxX, pointBound.maxY))
        );
        const swCoord = this._map.unproject(pixelBound.getBottomLeft(), zoom);
        const neCoord = this._map.unproject(pixelBound.getTopRight(), zoom);
        return new L.LatLngBounds(swCoord, neCoord);
    },

    _prepareMarker: function(layer) {
        const minZoom = this._getMinZoom();
        for (let zoom = this._getMaxZoom(); zoom >= minZoom; --zoom) {
            layer.options.classForZoom = layer.options.classForZoom || [];
            layer.options.classForZoom[zoom] = 'HIDDEN';
        }
    },

    _prepareMarkersForGeneralization: function(zoom, center) {
        const topLeftPoint = this._map._getTopLeftPoint(center, zoom);

        if (this._zoomStat[zoom].markers) {
            for (let i = 0; i < this._zoomStat[zoom].markers.length; ++i) {
                const pixelPosition = this._map
                    .project(this._zoomStat[zoom].markers[i]._latlng, zoom)
                    .subtract(topLeftPoint);
                this._zoomStat[zoom].markers[i].pixelPosition = [pixelPosition.x, pixelPosition.y];
            }
            return this._zoomStat[zoom].markers;
        }

        const markers = new Array(this._otherMarkers.length);

        for (let i = 0; i < this._otherMarkers.length; ++i) {
            const pixelPosition = this._map.project(this._otherMarkers[i]._latlng, zoom).subtract(topLeftPoint);
            const newMarker = {
                _latlng: this._otherMarkers[i]._latlng,
                groupIndex: this.options.checkMarkerMinimumLevel(this._otherMarkers[i]),
                iconIndex: -1,
                pixelPosition: [pixelPosition.x, pixelPosition.y]
            };
            markers[i] = newMarker;
        }

        return markers;
    },

    _calculateMarkersClassesIfNeeded: function(zoom = this._map.getZoom()) {
        /**
         * Возможны следующие варианты
         * 1. Изменился zoom карты
         * 1.1 Смотрим, для каких границ был произведена генерализация на этом зуме
         * 1.2 Если попадаем в рамки границ, для которых уже произведена генерализация, то ничего не делаем
         * 1.3 Если не попадаем - запускаем генерализацию
         * 2. Изменился центр карты => изменились границы
         * 2.1 Делаем шаги, аналогичные 1.1 - 1.3.
         *
         * Становится очевидно, что генерализацию нужно перезапускать
         * только когда не попали в ранее посчитанные границы на заданном зуме.
         */
        if (!this._map) {
            return;
        }

        if (!this._zoomStat[zoom].ready && !this._zoomStat[zoom].pending) {
            this._calculateMarkersClasses(zoom);
            return;
        }

        const calculatedBounds = this._zoomStat[zoom].bounds; // Это "старые" границы, которые были генерализированы
        const newBounds = this._getScreenBounds(); // Именно размеры экрана без буффера
        const newLatLngBounds = this._getLatLngBounds( // Это "новые" границы, которы должны быть перекрыты "старыми"
            newBounds, this._map.getCenter(), zoom
        );

        if (!calculatedBounds.contains(newLatLngBounds)) { // Собственно, описанная выше проверка перекрытия границ
            this._calculateMarkersClasses(zoom);
            return;
        }

        // Если дошли сюда, это значит, что для заданного зума в рамках текущего баунда генерализация уже произведена.
        this._invalidateMarkers();
    },

    _calculateMarkersClasses: function(zoom = this._map.getZoom()) {
        if (!this._map) { // Если нет карты, то ничего полезного сделать мы не можем
            return undefined;
        }
        const levels = this._getLevels(zoom);
        const center = this._map.getCenter();

        // Набор конфигов для генерализации маркеров
        const retinaFactor = window.devicePixelRatio;
        const bounds = this._getBounds();
        const priorityGroups = levels.map((level) => ({
            iconIndex: level.index,
            safeZone: level.safeZone,
            margin: level.margin,
            degradation: level.degradation || 0
        }));
        const atlasSpritesEmulation = levels.map((level) => ({
            size: level.size, // Размер иконки
            anchor: level.offset, // Центр иконки относительно ее размеров, принимает занчения от 0 до 1
            pixelDensity: retinaFactor > 1 ? 2 : 1 // Плотность частиц иконки - 1 или 2
        }));

        // Переводим маркеры в нужный формат
        const markers = this._prepareMarkersForGeneralization(zoom, center);

        this._zoomStat[zoom].ready = false;
        this._zoomStat[zoom].pending = true;
        this._zoomStat[zoom].bounds = this._getLatLngBounds(bounds, center, zoom);
        this._zoomStat[zoom].markers = markers;

        // Запускаем генерализацию
        return this._generalizer.generalize(
            bounds,
            retinaFactor,
            priorityGroups,
            atlasSpritesEmulation,
            markers
        ).then(() => {
            // Выставляем классы для генерализованных маркеров
            for (let i = 0; i < this._otherMarkers.length; ++i) {
                const marker = this._otherMarkers[i];
                const iconIndex = markers[i].iconIndex;
                marker.options.classForZoom[zoom] = iconIndex == -1 ? 'HIDDEN' : levels[iconIndex].className;
            }

            // Подбиваем маркера, которые не учавстовали в генерализации
            for (let i = 0; i < this._priorityMarkers.length; ++i) {
                const marker = this._priorityMarkers[i];
                const iconIndex = this.options.checkMarkerMinimumLevel(marker);
                marker.options.classForZoom[zoom] = iconIndex == -1 ? 'HIDDEN' : levels[iconIndex].className;
            }

            this._zoomStat[zoom].ready = true;
            this._zoomStat[zoom].pending = false;
            if (this._map.getZoom() == zoom) {
                this._invalidateMarkers();
            }
        }).catch(() => {
            this.fireEvent('generalizationError');
        });
    },

    _invalidateMarkers: function() {
        const zoom = this._map.getZoom();

        if (!this._zoomStat[zoom].ready) {
            return;
        }

        for (let i in this._layers) { // eslint-disable-line guard-for-in
            const marker = this._layers[i];
            const groupClass = marker.options.classForZoom[zoom];
            const markerState = marker.options.state;

            if (marker._immunityLevel) {
                if (!marker._map) {
                    this._map.addLayer(marker);
                }

                if (markerState != groupClass && groupClass != 'HIDDEN') {
                    L.DomUtil.addClass(marker._icon, groupClass);
                }
            }

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

            if (groupClass == 'HIDDEN') {
                if (!marker.onBeforeRemove || (marker.onBeforeRemove && marker.onBeforeRemove())) {
                    this._map.removeLayer(marker);
                }
            }
            marker.options.state = groupClass;
        }

        this.fireEvent('invalidationFinish');
    },

    _zoomStart: function() {
        this._zoomStat[this._map.getZoom()].markers = null;
        this.getPane().style.display = 'none';
    },

    addLayer: function(layer) {
        this._addLayer(layer);
        if (this._map && !layer._immunityLevel) {
            this._zoomStat[this._map.getZoom()].markers = null;
            this._prepareMarker(layer);
            this._calculateMarkersClasses();
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
            this._zoomStat[this._map.getZoom()].markers = null;
            this.eachLayer(this._prepareMarker, this);
            setTimeout(this._calculateMarkersClasses.bind(this), 0);
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
            this._calculateMarkersClasses();
            this._invalidateMarkers();
        }

        return this;
    },

    getEvents: function() {
        var events = {
            zoomstart: this._zoomStart,
            zoomend: () => this._calculateMarkersClassesIfNeeded(),
            moveend: () => this._calculateMarkersClassesIfNeeded()
        };

        return events;
    },

    onAdd: function(map) {
        this._map = map;

        this._initZooms();

        if (this.getLayers().length) {

            this.eachLayer(this._prepareMarker, this);
            // wait user map manipulation to know correct init zoom
            setTimeout(this._calculateMarkersClasses.bind(this), 0);
        }
    },

    onRemove: function(map) {
        if (!this._map) {
            return;
        }

        L.LayerGroup.prototype.onRemove.call(this, map);

        for (let i in this._layers) { // eslint-disable-line guard-for-in
            const marker = this._layers[i];
            marker.options.state = 'HIDDEN';
        }

        this._map = null;
    },

    clearLayers: function() {
        var i;
        for (i in this._layers) { // eslint-disable-line guard-for-in
            this._removeLayer(this._layers[i]);
        }

        this._priorityMarkers = [];
        this._otherMarkers = [];
        return this;
    }
});
