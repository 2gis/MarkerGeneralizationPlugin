var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');

gulp.task('default', function() {
    gulp.src([
        'src/Rbush.js',
        'src/UtilUnblockingFor.js',
        'src/MarkerClassList.js',
        'src/ClassCalculation.js',
        'src/WebWorkerHelper.js',
        'src/ExtendedMarker.js',
        'src/GeneralizeDefaultSettings.js',
        'src/Generalize.js',
        'src/StreamingGeneralize.js'
    ])
        .pipe(concat('generalize.src.js'))
        .pipe(gulp.dest('dist/'))
        .pipe(concat('generalize.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist/'))
});
