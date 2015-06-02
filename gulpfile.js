var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');

gulp.task('default', function() {
    gulp.src([
        'src/rbush.js',
        'src/Generalize.js'
    ])
        .pipe(concat('generalize.src.js'))
        .pipe(gulp.dest('dist/'))
        .pipe(concat('generalize.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist/'))
});
