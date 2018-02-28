const webpack = require('webpack');
const path = require('path');

const config = {
    module: {
        rules: [
            {
                test: /\.js$/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['babel-preset-env']
                    }
                }
            }
        ]
    },
    devtool: 'source-map',
    entry: './src/index.js',
    output: {
        filename: 'generalize.min.js',
        path: path.resolve(__dirname, 'dist'),
        publicPath: '/dist/',
        libraryTarget: 'umd',
        library: 'MarkerGeneralizationPlugin'
    },
    plugins: [
        new webpack.optimize.UglifyJsPlugin({ sourceMap: true })
    ]
};

module.exports = config;
